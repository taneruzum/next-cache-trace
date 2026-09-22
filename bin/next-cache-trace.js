#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { analyzeProject, formatHtml, formatJson, formatSarif, formatText, formatMarkdown, explainTag, createBaseline, applyBaseline, RULES } from '../dist/index.js';

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const HELP = [
  'next-cache-trace ' + version,
  'Usage: next-cache-trace audit [directory] [options]',
  '',
  '  --format text|json|sarif|html|markdown  Default: text',
  '  --output <file>              Write report; refuses to overwrite unless --force',
  '  --force                      Replace an existing report',
  '  --fail-on error|warning|none  Default: error; exit 1 for findings, 2 for tool errors',
  '  --config <file>              JSON config, relative to the audited project',
  '  --exclude <glob>             Additional exclusion (repeatable)',
  '  --ignore-rule <NCTxxx>       Disable a rule (repeatable)',
  '  --baseline <file>           Compare baseline, relative to the audited project',
  '  --update-baseline           Create/update the named baseline after review',
  '  --min-files <n>             Require at least n source files (exit 2 if unmet)',
  '  --require-cache-usage       Require supported cache usage (exit 2 if absent)',
  '  --tag <literal>             Explain a tag (text only; CI uses the full report)',
  '  --help, -h                   Show help',
  '  --version, -v                Show version',
].join('\n');

function parse(args) {
  const options = { directory: '.', format: 'text', failOn: 'error', output: null, force: false, trace: { exclude: [], rules: {} } };
  const values = new Set(['--format', '-f', '--output', '-o', '--fail-on', '--config', '--exclude', '--ignore-rule', '--baseline', '--min-files', '--tag']);
  const positional = [];
  if (args[0] === 'audit') args = args.slice(1);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--version' || arg === '-v') return { version: true };
    if (arg === '--force') { options.force = true; continue; }
    if (arg === '--update-baseline') { options.updateBaseline = true; continue; }
    if (arg === '--require-cache-usage') { options.trace.requireCacheUsage = true; continue; }
    if (arg === '--') { positional.push(...args.slice(i + 1)); break; }
    if (values.has(arg)) {
      const value = args[++i];
      if (!value || value.startsWith('-')) throw new Error('Missing value for ' + arg);
      if (arg === '--format' || arg === '-f') options.format = value;
      if (arg === '--output' || arg === '-o') options.output = value;
      if (arg === '--fail-on') options.failOn = value;
      if (arg === '--config') options.trace.config = value;
      if (arg === '--exclude') options.trace.exclude.push(value);
      if (arg === '--baseline') options.baseline = value;
      if (arg === '--tag') options.tag = value;
      if (arg === '--min-files') {
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('--min-files must be a non-negative integer');
        options.trace.minFiles = Number(value);
      }
      if (arg === '--ignore-rule') {
        if (!Object.hasOwn(RULES, value)) throw new Error('Unknown rule: ' + value);
        options.trace.rules[value] = 'off';
      }
    } else if (arg.startsWith('-')) throw new Error('Unknown option: ' + arg);
    else positional.push(arg);
  }
  if (positional.length > 1) throw new Error('Supply only one project directory');
  options.directory = positional[0] ?? '.';
  if (!['text', 'json', 'sarif', 'html', 'markdown'].includes(options.format)) throw new Error('Invalid report format');
  if (options.updateBaseline && !options.baseline) throw new Error('--update-baseline requires --baseline <file>');
  if (options.tag !== undefined && options.format !== 'text') throw new Error('--tag requires text format');
  if (!['error', 'warning', 'none'].includes(options.failOn)) throw new Error('Invalid fail-on threshold');
  if (!options.trace.exclude.length) delete options.trace.exclude;
  return options;
}
try {
  const options = parse(process.argv.slice(2));
  if (options.help) process.stdout.write(HELP + '\n');
  else if (options.version) process.stdout.write(version + '\n');
  else {
    let report = await analyzeProject(resolve(options.directory), options.trace);
    if (options.baseline) {
      const baselinePath = resolve(options.directory, options.baseline);
      if (extname(baselinePath).toLowerCase() !== '.json') throw new Error('Baseline path must end in .json');
      if (options.output && resolve(options.output) === baselinePath) throw new Error('Report and baseline must use different paths');
      if (options.updateBaseline) {
        const baseline = createBaseline(report);
        let exists = false;
        try {
          const previous = JSON.parse(await readFile(baselinePath, 'utf8'));
          if (previous?.version !== 1 || !Array.isArray(previous.entries) || typeof previous.analysisSignature !== 'string') throw new Error('Refusing to replace a file that is not a next-cache-trace baseline');
          exists = true;
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        await mkdir(dirname(baselinePath), { recursive: true });
        await writeFile(baselinePath, JSON.stringify(baseline, null, 2) + '\n', { encoding: 'utf8', flag: exists ? 'w' : 'wx' });
        process.stderr.write('Baseline written to ' + baselinePath + '\n');
        report = applyBaseline(report, baseline);
      } else report = applyBaseline(report, JSON.parse(await readFile(baselinePath, 'utf8')));
    }
    const formatters = { text: formatText, json: formatJson, sarif: formatSarif, html: formatHtml, markdown: formatMarkdown };
    const rendered = (options.tag !== undefined ? explainTag(report, options.tag) : formatters[options.format](report)) + '\n';
    if (options.output) {
      const target = resolve(options.output);
      if (['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs', '.mts', '.cts'].includes(extname(target).toLowerCase())) throw new Error('Refusing to write a report to a source-code file');
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, rendered, { encoding: 'utf8', flag: options.force ? 'w' : 'wx' });
      process.stderr.write('Report written to ' + target + '\n');
    } else process.stdout.write(rendered);
    const summary = report.baseline?.newSummary ?? report.summary;
    if (options.failOn !== 'none' && (summary.error > 0 || (options.failOn === 'warning' && summary.warning > 0))) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write('next-cache-trace: ' + error.message + '\n');
  process.exitCode = 2;
}
