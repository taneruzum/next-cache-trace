import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { analyzeProject, analyzeProjectSync, createBaseline, applyBaseline, formatHtml, formatMarkdown, formatText } from '../dist/index.js';
import { fixture, cacheImports } from './helpers.js';

const cli = resolve('bin/next-cache-trace.js');
const run = args => spawnSync(process.execPath, [cli, ...args], {encoding:'utf8', timeout:30000});
const appManifest = '{\r\n\t"private": true,\r\n\t"dependencies": {"next": "^16.0.0"},\r\n\t"scripts": {"dev": "next dev"}\r\n}\r\n';

test('init dry-run is read-only, preserves scripts and formatting, and is byte-idempotent', async t => {
  const root = await fixture(t, {'package.json': appManifest});
  const preview = run(['init', root, '--dry-run']);
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /Dry run/);
  assert.equal(await readFile(join(root,'package.json'), 'utf8'), appManifest);
  await assert.rejects(access(join(root,'next-cache-trace.config.json')));
  const result = run(['init', root]);
  assert.equal(result.status, 0, result.stderr);
  const saved = await readFile(join(root,'package.json'), 'utf8');
  const config = await readFile(join(root,'next-cache-trace.config.json'), 'utf8');
  assert.match(saved, /\r\n\t"scripts"/);
  assert.equal(JSON.parse(saved).scripts.dev, 'next dev');
  assert.equal(JSON.parse(saved).scripts['cache:check'], 'next-cache-trace audit . --fail-on error');
  assert.deepEqual(JSON.parse(config), {minFiles:1});
  assert.equal(run(['init', root]).status, 0);
  assert.equal(await readFile(join(root,'package.json'), 'utf8'), saved);
  assert.equal(await readFile(join(root,'next-cache-trace.config.json'), 'utf8'), config);
});

test('init preserves custom cache:check and config and does not install dependencies', async t => {
  const manifest = JSON.stringify({dependencies:{next:'16.3.5'},scripts:{'cache:check':'custom checker'}});
  const config = '{"rules":{"NCT003":"off"}}';
  const root = await fixture(t, {'package.json':manifest, 'next-cache-trace.config.json':config});
  const result = run(['init', root]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Keep existing cache:check/);
  assert.equal(await readFile(join(root,'package.json'), 'utf8'), manifest);
  assert.equal(await readFile(join(root,'next-cache-trace.config.json'), 'utf8'), config);
  await assert.rejects(access(join(root,'node_modules')));
  await assert.rejects(access(join(root,'package-lock.json')));
});

for (const manifest of ['{', '{}', '{"dependencies":{"next":"16"},"scripts":[]}']) {
  test('init rejects an invalid app before writing files: ' + manifest, async t => {
    const root = await fixture(t, {'package.json':manifest});
    assert.equal(run(['init', root]).status, 2);
    assert.equal(await readFile(join(root,'package.json'), 'utf8'), manifest);
    await assert.rejects(access(join(root,'next-cache-trace.config.json')));
  });
}

test('doctor reports installed version, config, scope and unresolved coverage without execution', async t => {
  const root = await fixture(t, {
    'package.json':appManifest,
    'node_modules/next/package.json':'{"name":"next","version":"16.3.5"}',
    'next.config.mjs':"throw new Error('must not run'); export default {cacheComponents:true};",
    'app/data.ts':cacheImports + "cacheTag('posts'); cacheTag(dynamic);"
  });
  const result = run(['doctor', root, '--format', 'json']);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.scan.files, 1);
  assert.equal(report.scan.cacheUsages, 2);
  assert.equal(report.scan.unresolved, 1);
  assert.equal(report.checks.find(c => c.name === 'next').status, 'ok');
  assert.equal(report.checks.find(c => c.name === 'coverage').status, 'warning');
  await writeFile(join(root,'node_modules/next/package.json'), '{"name":"next","version":"17.0.0"}');
  assert.equal(JSON.parse(run(['doctor',root,'--format','json']).stdout).checks.find(c => c.name === 'next').status, 'warning');
});

test('doctor detects wrong roots, empty scans, nested apps and malformed configs', async t => {
  const root = await fixture(t, {'package.json':appManifest});
  let result = run(['doctor', root, '--format', 'json']);
  assert.equal(result.status, 2, result.stderr);
  assert.equal(JSON.parse(result.stdout).checks.find(c => c.name === 'scope').status, 'error');
  await writeFile(join(root, 'next-cache-trace.config.json'), '{');
  result = run(['doctor', root, '--format', 'json']);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).checks.find(c => c.name === 'scan').status, 'error');
  const nested = await fixture(t, {'package.json':appManifest, 'apps/web/next.config.ts':'export default {}'});
  assert.match(run(['doctor', nested]).stdout, /Nested Next.js app/);
  const missing = await fixture(t);
  assert.equal(run(['doctor', missing]).status, 2);
});

test('setup commands and --explain reject incompatible or missing arguments', () => {
  for (const args of [['init','--force'],['init','--format','json'],['doctor','--dry-run'],['doctor','--format'],['doctor','--format','html'],['audit','--explain','--format','json'],['audit','--explain','--tag','posts']]) {
    assert.equal(run(args).status, 2, args.join(' '));
  }
});

test('explanations retain source snapshots, contextual migration choices and CI thresholds', async t => {
  const text = "'use server';\n" + cacheImports + "export async function save(){\n revalidateTag('posts');\n}";
  const root = await fixture(t, {'app/actions.ts':text});
  const report = await analyzeProject(root);
  const item = report.findings.find(f => f.code === 'NCT006');
  assert.equal(item.explanation.context, 'server-action');
  assert.equal(item.explanation.examples.length, 3);
  assert.ok(item.explanation.source.some(line => line.line === 4 && line.text.includes("revalidateTag('posts')")));
  await writeFile(join(root,'app/actions.ts'), 'changed on disk');
  assert.match(formatText(report, {explain:true}), /4 \|.*revalidateTag\('posts'\)/);
  const overridden = analyzeProjectSync(root, {}, {'app/actions.ts':text.replace("'posts'", "'other'")});
  assert.match(formatText(overridden, {explain:true}), /revalidateTag\('other'\)/);
  await writeFile(join(root,'app/actions.ts'), text);
  const normal = run(['audit',root,'--fail-on','warning']);
  const explained = run(['audit',root,'--explain','--fail-on','warning']);
  assert.equal(normal.status, 1);
  assert.equal(explained.status, 1);
  assert.match(explained.stdout, /Example.*Server Action/);
  assert.match(explained.stdout, /expire: 0/);
  assert.ok(!normal.stdout.includes('Example —'));
  const markdown = run(['audit',root,'--explain','--format','markdown']);
  assert.equal(markdown.status, 0, markdown.stderr);
  assert.match(markdown.stdout, /<details><summary>NCT006/);
  assert.equal(report.schemaVersion, '0.4');
  assert.throws(() => applyBaseline(report, {...createBaseline(report),reportSchemaVersion:'0.3'}), /incompatible/);
});

test('unknown caller remains conditional and source excerpts cannot inject HTML or Markdown', async t => {
  const root = await fixture(t, {'app/actions.ts':cacheImports + "// </pre><script>alert(1)</script> ```\nrevalidateTag('posts');"});
  const report = await analyzeProject(root);
  assert.equal(report.findings.find(f => f.code === 'NCT006').explanation.context, 'unknown');
  for (const rendered of [formatHtml(report), formatMarkdown(report, {explain:true})]) {
    assert.ok(!rendered.includes('<script>'));
    assert.match(rendered, /&lt;script&gt;/);
    assert.match(rendered, /not proven to be a Server Action/);
  }
});
