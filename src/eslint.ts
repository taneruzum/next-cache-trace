import type { ESLint, Rule } from 'eslint';
import { isAbsolute, relative, resolve } from 'node:path';
import { analyzeSource } from './ast.js';
import { analyzeProjectSync, buildReport } from './analyze.js';
import { RULES, type Finding, type RuleCode, type TraceOptions } from './model.js';
import { VERSION } from './version.js';

const reports = new WeakMap<object, Finding[]>();
function diagnostics(context: Rule.RuleContext): Finding[] {
  const source = context.sourceCode;
  const cached = reports.get(source);
  if (cached) return cached;
  const settings = (context.settings['next-cache-trace'] ?? {}) as { projectRoot?: string; cacheComponents?: boolean; config?: string };
  const text = source.text;
  let findings: Finding[];
  if (settings.projectRoot) {
    const root = resolve(context.cwd, settings.projectRoot);
    const filename = isAbsolute(context.filename) ? context.filename : resolve(context.cwd, context.filename);
    const file = relative(root, filename).replaceAll('\\', '/');
    if (file.startsWith('../') || isAbsolute(file)) return [];
    // Collect the advisory too; ESLint's rule switch controls whether it is shown.
    const options: TraceOptions = { rules: { NCT009: 'info' } };
    if (settings.cacheComponents !== undefined) options.cacheComponents = settings.cacheComponents;
    if (settings.config) options.config = settings.config;
    findings = analyzeProjectSync(root, options, { [file]: text }).findings.filter(f => f.file === file);
  } else {
    const file = /\.[cm]?[jt]sx?$/.test(context.filename) ? context.filename : 'input.tsx';
    const analysis = analyzeSource(file, text);
    findings = buildReport('', [analysis], new Map([[file, text]]), { enabled: settings.cacheComponents ?? null, file: null, reason: 'ESLint settings' }, { rules: { NCT009: 'info' } }, false).findings;
  }
  reports.set(source, findings);
  return findings;
}
const rules: Record<string, Rule.RuleModule> = {};
for (const code of Object.keys(RULES) as RuleCode[]) rules[code] = {
  meta: { type: code === 'NCT005' || code === 'NCT003' || code === 'NCT009' ? 'suggestion' : 'problem', docs: { description: RULES[code].title }, schema: [], messages: { finding: '{{message}}' } },
  create(context) {
    return { 'Program:exit'() {
      for (const item of diagnostics(context)) if (item.code === code) context.report({ loc: { line: item.line, column: item.column - 1 }, messageId: 'finding', data: { message: item.message } });
    } };
  }
}
const plugin: ESLint.Plugin = { meta: { name: 'eslint-plugin-next-cache-trace', version: VERSION }, rules, configs: {} };
plugin.configs = {
  recommended: { plugins: { 'next-cache-trace': plugin }, rules: { 'next-cache-trace/NCT002': 'error', 'next-cache-trace/NCT005': 'warn', 'next-cache-trace/NCT006': 'warn', 'next-cache-trace/NCT007': 'warn', 'next-cache-trace/NCT008': 'warn', 'next-cache-trace/NCT900': 'warn' } },
  project: { plugins: { 'next-cache-trace': plugin }, rules: Object.fromEntries(Object.entries(RULES).map(([code, rule]) => ['next-cache-trace/' + code, rule.optIn ? 'off' : rule.severity === 'error' ? 'error' : 'warn'])) }
};
export default plugin;
