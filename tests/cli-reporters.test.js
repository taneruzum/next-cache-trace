import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { analyzeProject, formatHtml, formatSarif } from '../dist/index.js';
import { fixture, cacheImports, headerImports } from './helpers.js';

const cli = resolve('bin/next-cache-trace.js');
const run = args => spawnSync(process.execPath, [cli, ...args], {encoding:'utf8'});
test('JSON stdout is machine-readable; default/error/warning/none thresholds work', async t => {
  const root = await fixture(t, {'app/x.ts':cacheImports + "updateTag('missing');"});
  const normal = run(['audit',root,'--format','json']);
  assert.equal(normal.status,0,normal.stderr);
  assert.equal(JSON.parse(normal.stdout).summary.warning,1);
  assert.equal(run(['audit',root,'--fail-on','warning']).status,1);
  await writeFile(join(root,'app/x.ts'), headerImports + "async function a(){'use cache';cookies();}");
  assert.equal(run(['audit',root]).status,1);
  assert.equal(run(['audit',root,'--fail-on','none']).status,0);
});
test('missing option values and unknown flags return tool-error exit codes', () => {
  for (const args of [['--output'],['--format'],['--config'],['--output','--format','json'],['--unknown'],['--ignore-rule','NCT999'],['--fail-on','warn']]) {
    const r=run(args); assert.equal(r.status,2,r.stdout); assert.match(r.stderr,/next-cache-trace:/);
  }
});
test('version comes from package metadata and help runs without a Next project', async () => {
  const {version}=JSON.parse(await readFile('package.json','utf8'));
  assert.equal(run(['--version']).stdout.trim(),version);
  assert.match(run(['--help']).stdout,/--ignore-rule/);
});
test('output creates directories, refuses accidental overwrites and emits valid SARIF', async t => {
  const root=await fixture(t, {'app/with space.ts':cacheImports+"updateTag('x');"});
  const target=join(root,'reports','cache.sarif');
  const args=['audit',root,'--format','sarif','--output',target];
  assert.equal(run(args).status,0);
  const sarif=JSON.parse(await readFile(target,'utf8'));
  assert.equal(sarif.version,'2.1.0');
  assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri,'app/with%20space.ts');
  assert.equal(run(args).status,2);
  assert.equal(run([...args,'--force']).status,0);
});
test('HTML escapes tags, paths and diagnostics; has no executable scripts or external resources', async t => {
  const root=await fixture(t, {'app/x.ts':cacheImports+"cacheTag('</h3><script>alert(1)</script>');"});
  const html=formatHtml(await analyzeProject(root));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('Content-Security-Policy'));
  assert.ok(!html.includes('src="http'));
});
test('SARIF fingerprint survives unrelated line insertions', async t => {
  const root=await fixture(t, {'app/x.ts':cacheImports+"updateTag('x');"});
  const a=JSON.parse(formatSarif(await analyzeProject(root)));
  await writeFile(join(root,'app/x.ts'),'\n\n'+cacheImports+"updateTag('x');");
  const b=JSON.parse(formatSarif(await analyzeProject(root)));
  assert.deepEqual(a.runs[0].results[0].partialFingerprints,b.runs[0].results[0].partialFingerprints);
});
