import { createRequire } from 'node:module';
import { lstat, readFile, writeFile, unlink, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { analyzeProject } from '../dist/index.js';

const command = 'next-cache-trace audit . --fail-on error';
const configName = 'next-cache-trace.config.json';

async function readOptional(path) {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + ' must be an object');
  return value;
}

async function manifest(root) {
  const text = await readFile(join(root, 'package.json'), 'utf8');
  return { text, value: object(JSON.parse(text), 'package.json') };
}

function nextRange(value) {
  return value.dependencies?.next ?? value.devDependencies?.next;
}

async function regularOrMissing(path) {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Refusing to edit a symlink or non-regular file: ' + path);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

export async function initialize(directory, dryRun = false) {
  const root = resolve(directory);
  const packagePath = join(root, 'package.json');
  const configPath = join(root, configName);
  await regularOrMissing(packagePath);
  await regularOrMissing(configPath);
  const { text, value } = await manifest(root);
  if (typeof nextRange(value) !== 'string') throw new Error('Run init in a Next.js app with next declared in package.json, not the monorepo root.');
  if (value.scripts !== undefined) object(value.scripts, 'package.json scripts');
  const existingConfig = await readOptional(configPath);
  const addConfig = existingConfig === null;
  const addScript = !Object.hasOwn(value.scripts ?? {}, 'cache:check');
  const messages = [];
  if (addConfig) messages.push('Create ' + configName + ' with minFiles: 1.');
  else messages.push('Keep existing ' + configName + '.');
  if (addScript) messages.push('Add package.json script cache:check: ' + command);
  else messages.push('Keep existing cache:check script: ' + JSON.stringify(value.scripts['cache:check']));
  if (!dryRun) {
    // Prepare everything before writing and refuse a concurrently changed manifest.
    const indent = /\n([\t ]+)"/.exec(text)?.[1] ?? '  ';
    const newline = text.includes('\r\n') ? '\r\n' : '\n';
    const updated = JSON.stringify({ ...value, scripts: { ...value.scripts, 'cache:check': command } }, null, indent).replaceAll('\n', newline) + newline;
    const pending = join(root, '.next-cache-trace-init-' + randomUUID() + '.tmp');
    let configCreated = false;
    let pendingCreated = false;
    try {
      if (addScript) {
        await writeFile(pending, updated, { flag: 'wx', mode: (await lstat(packagePath)).mode });
        pendingCreated = true;
      }
      await regularOrMissing(packagePath);
      if (await readFile(packagePath, 'utf8') !== text) throw new Error('package.json changed during init; rerun after reviewing it.');
      if (addConfig) {
        await writeFile(configPath, '{\n  "minFiles": 1\n}\n', { flag: 'wx' });
        configCreated = true;
      }
      if (addScript) await rename(pending, packagePath);
    } catch (error) {
      if (configCreated) await unlink(configPath);
      throw error;
    } finally {
      if (pendingCreated) await unlink(pending).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
  }
  const installed = value.dependencies?.['next-cache-trace'] ?? value.devDependencies?.['next-cache-trace'];
  if (!installed) messages.push('Install next-cache-trace as a dev dependency using your package manager before running cache:check.');
  messages.push('Next: next-cache-trace doctor .', 'Then: run the cache:check script with your package manager.');
  return (dryRun ? 'Dry run — no files changed.\n' : 'Setup complete.\n') + messages.join('\n');
}

export async function diagnose(directory, options = {}) {
  const root = resolve(directory);
  const checks = [];
  const add = (name, status, message) => checks.push({ name, status, message });
  let declared;
  try {
    const { value } = await manifest(root);
    declared = nextRange(value);
    add('project', declared ? 'ok' : 'error', declared ? 'Next.js app: ' + root : 'No next dependency declared here. Select the app directory.');
  } catch (error) { add('project', 'error', error.message); }
  const [major, minor] = process.versions.node.split('.').map(Number);
  add('node', major > 20 || major === 20 && minor >= 19 ? 'ok' : 'error', 'Node.js ' + process.versions.node + '; requires 20.19+.');
  try {
    const require = createRequire(join(root, 'package.json'));
    const installed = JSON.parse(await readFile(require.resolve('next/package.json'), 'utf8')).version;
    const supported = typeof installed === 'string' && /^16\.\d+\.\d+$/.test(installed);
    add('next', supported ? 'ok' : 'warning', 'Installed Next.js ' + installed + (supported ? '; target major is 16.' : '; this analyzer targets stable Next.js 16 App Router.'));
  } catch (error) {
    add('next', 'warning', 'Installed Next.js version could not be read. Declared: ' + String(declared ?? 'none') + '. Install dependencies to verify compatibility. ' + error.code);
  }
  let scan;
  try {
    const report = await analyzeProject(root, options);
    scan = { files: report.filesScanned, cacheUsages: report.coverage.cacheUsages, unresolved: report.coverage.unresolved, findings: report.summary };
    add('scope', report.filesScanned ? 'ok' : 'error', report.filesScanned + ' source files scanned. Check include/exclude settings if files are missing.');
    add('cache-usage', report.coverage.cacheUsages ? 'ok' : 'warning', report.coverage.cacheUsages + ' supported cache usages observed.');
    add('cache-components', report.config.enabled === null ? 'warning' : 'ok', String(report.config.enabled) + ': ' + report.config.reason);
    add('coverage', report.coverage.parseErrors ? 'error' : report.coverage.unresolved ? 'warning' : 'ok', report.coverage.unresolved + ' unresolved diagnostics; ' + report.coverage.parseErrors + ' source parse errors.');
  } catch (error) { add('scan', 'error', error.message); }
  return { projectRoot: root, ok: checks.every(check => check.status !== 'error'), checks, ...(scan ? { scan } : {}),
    note: 'Doctor checks setup and scan scope, not cache correctness. Run audit --explain to review findings. Application code was not executed.' };
}

export function formatDoctor(report) {
  return ['next-cache-trace doctor — ' + report.projectRoot, ...report.checks.map(check => '[' + check.status + '] ' + check.name + ': ' + check.message),
    ...(report.scan ? ['Audit findings: ' + report.scan.findings.error + ' errors, ' + report.scan.findings.warning + ' warnings, ' + report.scan.findings.info + ' informational.'] : []), report.note].join('\n');
}
