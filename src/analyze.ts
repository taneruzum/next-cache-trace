import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import picomatch from 'picomatch';
import ts from 'typescript';
import { analyzeSource } from './ast.js';
import { readCacheConfig, readOptions } from './config.js';
import { finding, type CacheConfig, type FileAnalysis, type Finding, type Report, type TraceOptions } from './model.js';

const EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts']);
const IGNORE_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', 'out', '.turbo', '.vercel', '__tests__', '__fixtures__']);
const DEFAULT_EXCLUDE = ['**/*.d.{ts,mts,cts}', '**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}', '**/next.config.*', '**/eslint.config.*'];
// Content-keyed, bounded cache: no cross-run stale diagnostics after edits.
const cache = new Map<string, { text: string; analysis: FileAnalysis }>();
function cachedAnalysis(file: string, text: string): FileAnalysis {
  const cached = cache.get(file);
  if (cached?.text === text) return cached.analysis;
  const analysis = analyzeSource(file, text);
  if (cache.size >= 256) cache.delete(cache.keys().next().value!);
  cache.set(file, { text, analysis });
  return analysis;
}

function suppressions(text: string): Map<number, Set<string>> {
  const map = new Map<number, Set<string>>();
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, text);
  let token: ts.SyntaxKind;
  while ((token = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken) {
    if (token !== ts.SyntaxKind.SingleLineCommentTrivia && token !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
    const match = scanner.getTokenText().match(/^\/\/\s*next-cache-trace-disable-next-line\s+((?:NCT\d{3})(?:[ ,]+NCT\d{3})*)(?:\s+--.*)?\s*$/);
    if (!match) continue;
    const line = text.slice(0, scanner.getTokenPos()).split('\n').length;
    map.set(line + 1, new Set(match[1].split(/[ ,]+/)));
  }
  return map;
}

export function buildReport(root: string, files: FileAnalysis[], sources: Map<string, string>, config: CacheConfig, options: TraceOptions = {}, projectRules = true): Report {
  const producers = files.flatMap(f => f.producers);
  const invalidations = files.flatMap(f => f.invalidations);
  const boundaries = files.flatMap(f => f.boundaries);
  const findings: Finding[] = files.flatMap(f => f.findings);
  for (const file of files) {
    const usage = file.usages[0];
    if (usage && config.enabled === false) findings.push(finding('NCT004', usage, 'Cache Components are disabled. ' + config.reason + '.'));
    if (usage && config.enabled === null && projectRules) findings.push(finding('NCT901', usage, 'cacheComponents could not be determined: ' + config.reason + '.'));
  }
  if (projectRules) {
    const produced = new Set(producers.map(p => p.tag));
    for (const item of invalidations) if (!produced.has(item.tag)) findings.push(finding('NCT001', item, item.method + '(' + JSON.stringify(item.tag) + ') has no observed literal producer in this scan. Dynamic/external producers may still exist.'));
    const tags = new Map<string, typeof producers>();
    for (const p of producers) { const group = tags.get(p.tag) ?? []; group.push(p); tags.set(p.tag, group); }
    for (const [tag, items] of tags) {
      const areas = [...new Set(items.map(i => i.area).filter(x => x !== null))];
      if (areas.length > 1) for (const item of items) findings.push(finding('NCT003', item, 'Tag ' + JSON.stringify(tag) + ' is shared by route areas ' + areas.join(', ') + '; review invalidation fan-out.'));
    }
  }
  const suppress = new Map([...sources].map(([file, text]) => [file, suppressions(text)]));
  let suppressedCount = 0;
  const visible: Finding[] = [];
  for (const item of findings) {
    const level = options.rules?.[item.code];
    if (level === 'off' || suppress.get(item.file)?.get(item.line)?.has(item.code)) { suppressedCount++; continue; }
    visible.push({ ...item, severity: level ?? item.severity });
  }
  const order = { error: 0, warning: 1, info: 2 };
  visible.sort((a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.code.localeCompare(b.code));
  const summary = { error: 0, warning: 0, info: 0 };
  for (const item of visible) summary[item.severity]++;
  return {
    schemaVersion: '0.2', projectRoot: root, config, filesScanned: files.length, summary, findings: visible, suppressedCount,
    graph: { producers, invalidations, boundaries },
    coverage: { literalProducers: producers.length, literalInvalidations: invalidations.length, unresolved: findings.filter(x => ['NCT900', 'NCT901', 'NCT902'].includes(x.code)).length,
      note: 'Static evidence only. No findings does not prove cache correctness. Indirect helpers, re-exports, runtime behavior and excluded files are not resolved.' }
  };
}

export function analyzeProjectSync(directory: string, options: TraceOptions = {}, overrides: Record<string, string> = {}): Report {
  const root = resolve(directory);
  if (!statSync(root).isDirectory()) throw new Error('Not a directory: ' + root);
  const settings = readOptions(root, options);
  const include = picomatch(settings.include ?? ['**/*'], { dot: true });
  const exclude = picomatch([...DEFAULT_EXCLUDE, ...(settings.exclude ?? [])], { dot: true });
  const sources = new Map<string, string>();
  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      const file = relative(root, path).replaceAll('\\', '/');
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.') && !exclude(file + '/')) walk(path);
      } else if (entry.isFile() && EXTENSIONS.has(extname(entry.name)) && include(file) && !exclude(file)) {
        sources.set(file, overrides[file] ?? readFileSync(path, 'utf8'));
      }
      // Symlinks are intentionally not followed, so scans cannot escape the chosen root.
    }
  }
  walk(root);
  for (const [file, content] of Object.entries(overrides)) if (!sources.has(file) && !file.startsWith('../') && !file.startsWith('/') && include(file) && !exclude(file)) sources.set(file, content);
  const files = [...sources].map(([file, text]) => cachedAnalysis(file, text));
  return buildReport(root, files, sources, readCacheConfig(root, settings.cacheComponents), settings);
}
export async function analyzeProject(directory: string, options: TraceOptions = {}): Promise<Report> {
  return analyzeProjectSync(directory, options);
}
