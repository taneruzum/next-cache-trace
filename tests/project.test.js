import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { analyzeProject, analyzeProjectSync } from '../dist/index.js';
import { fixture, cacheImports, headerImports } from './helpers.js';

test('five rules have positive examples, with deterministic file/line evidence', async t => {
  const root = await fixture(t, {
    'next.config.ts': 'export default {cacheComponents:false}',
    'app/a/data.ts': cacheImports + headerImports + "export async function a(){'use cache'; cookies(); cacheTag('shared');}",
    'app/b/data.ts': cacheImports + "export async function b(){'use cache'; cacheLife('hours'); cacheTag('shared');}",
    'app/actions.ts': cacheImports + "updateTag('missing');"
  });
  const r = await analyzeProject(root);
  assert.deepEqual([...new Set(r.findings.map(f => f.code))].sort(), ['NCT001','NCT002','NCT003','NCT004','NCT005']);
  assert.equal(r.findings.find(f => f.code === 'NCT002').line, 3);
  assert.equal(r.graph.producers.length, 2);
  assert.deepEqual(r, await analyzeProject(root));
});
test('a matching fetch/unstable_cache tag prevents false orphan warnings', async t => {
  const root = await fixture(t, { 'app/page.ts': cacheImports + "fetch('/x',{next:{tags:['x']}}); unstable_cache(async()=>[], [], {tags:['y']}); updateTag('x'); revalidateTag('y','max');" });
  assert.equal((await analyzeProject(root)).findings.length, 0);
});
test('correct cache fixture has no findings', async t => {
  const root = await fixture(t, {'next.config.ts': 'const enabled = true; const config = {cacheComponents: enabled} satisfies NextConfig; export default config;', 'app/page.ts': cacheImports + "export async function data(){'use cache'; cacheTag('posts'); cacheLife('hours');} updateTag('posts');"});
  const r = await analyzeProject(root);
  assert.equal(r.config.enabled, true);
  assert.equal(r.findings.length, 0);
});
for (const [name, source, expected] of [
  ['comments', '// cacheComponents: true\nexport default {}', false],
  ['unused object', 'const ignored={cacheComponents:true};export default {}', false],
  ['dynamic wrapper', 'export default withPlugin({cacheComponents:true})', null],
  ['spread after flag', 'export default {cacheComponents:true,...extra}', null],
  ['flag after spread', 'export default {...extra,cacheComponents:true}', true],
  ['commonjs', 'module.exports={cacheComponents:true}', true],
  ['mutation', 'const c={cacheComponents:true}; c.cacheComponents=false; export default c', null],
  ['environment', 'export default {cacheComponents:process.env.CACHE}', null],
  ['duplicate property', 'export default {cacheComponents:true,cacheComponents:false}', false],
]) test('configuration: ' + name, async t => {
  const root = await fixture(t, {'next.config.js':source, 'app/data.ts': cacheImports + "async function a(){'use cache';cacheLife('hours')}"});
  const r = await analyzeProject(root);
  assert.equal(r.config.enabled, expected);
  assert.equal(r.findings.some(f => f.code === 'NCT004'), expected === false);
  assert.equal(r.findings.some(f => f.code === 'NCT901'), expected === null);
});
test('never executes config', async t => {
  const root = await fixture(t, {'next.config.js':"throw new Error('must not execute'); export default withPlugin({cacheComponents:true})", 'app/x.ts': "async function a(){'use cache'}"});
  const r = await analyzeProject(root);
  assert.equal(r.config.enabled, null);
});
test('JSON rules, comments and globs suppress findings without deleting graph relationships', async t => {
  const root = await fixture(t, {
    'next.config.ts': 'export default {cacheComponents:true}',
    'next-cache-trace.config.json': JSON.stringify({exclude:['vendor/**'], rules:{NCT005:'off'}}),
    'app/actions.ts': cacheImports + "// next-cache-trace-disable-next-line NCT001 -- tag is produced externally\nupdateTag('external');",
    'app/data.ts': cacheImports + "async function a(){'use cache';cacheTag('data');}",
    'vendor/fake.ts': cacheImports + "updateTag('vendor');",
    'app/data.test.ts': cacheImports + "updateTag('test');",
    '.next/generated.ts': cacheImports + "updateTag('generated');"
  });
  const r = await analyzeProject(root);
  assert.equal(r.findings.length, 0);
  assert.equal(r.suppressedCount, 2);
  assert.equal(r.filesScanned, 2);
  assert.equal(r.graph.producers.length, 1);
});
test('editing a producer updates project findings and supports unsaved overrides', async t => {
  const root = await fixture(t, {'app/x.ts': cacheImports + "updateTag('x');"});
  assert.ok((await analyzeProject(root)).findings.some(f=>f.code==='NCT001'));
  const r = analyzeProjectSync(root, {}, {'app/x.ts':cacheImports + "fetch('/x',{next:{tags:['x']}});updateTag('x');"});
  assert.equal(r.findings.length, 0);
  await writeFile(join(root,'app/x.ts'), cacheImports + "fetch('/x',{next:{tags:['x']}});updateTag('x');");
  assert.equal((await analyzeProject(root)).findings.length,0);
});
test('invalid JSON rule settings fail instead of silently weakening CI', async t => {
  const root = await fixture(t, {'next-cache-trace.config.json': '{"rules":{"NCT999":"off"}}'});
  await assert.rejects(analyzeProject(root), /Invalid rule/);
});
