import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { analyzeSource, analyzeProject, analyzeProjectSync, explainTag } from '../dist/index.js';
import { fixture, cacheImports } from './helpers.js';

const source = code => analyzeSource('app/data.ts', cacheImports + code);
test('resolves immutable string aliases, object fields, shorthand and arrays with source evidence', () => {
  const r = source("const POST='posts'; const ALIAS=POST; const TAGS={post:ALIAS} as const; const list=[TAGS['post'], 'users'] as const; cacheTag(...list); revalidateTag(TAGS.post,'max'); fetch('/x',{next:{tags:list}}); unstable_cache(async()=>[],[],{tags:list});");
  assert.deepEqual(r.producers.map(p => p.tag), ['posts','users','posts','users','posts','users']);
  assert.equal(r.invalidations[0].tag, 'posts');
  assert.equal(r.findings.length, 0, JSON.stringify(r.findings));
  assert.equal(r.invalidations[0].resolution, 'resolved');
  assert.ok(r.invalidations[0].evidence.some(e => e.kind === 'definition' && e.expression === 'POST'));
});

for (const [label, declaration] of [
  ['property assignment', "const TAGS={posts:'posts'} as const; TAGS.posts='changed';"],
  ['alias mutation', "const TAGS={posts:'posts'}; const alias=TAGS; alias.posts='changed';"],
  ['destructuring assignment', "const TAGS={posts:'posts'}; ({x:TAGS.posts}=runtime);"],
  ['loop assignment', "const TAGS={posts:'posts'}; for (TAGS.posts of runtime) {}"],
  ['unknown call', "const TAGS={posts:'posts'}; mutate(TAGS);"],
  ['alias return', "const TAGS={posts:'posts'}; function escape(){return TAGS;}"],
  ['destructuring escape', "const TAGS={nested:{posts:'posts'}}; const {nested}=TAGS; nested.posts='changed';"],
  ['dynamic key', "const TAGS={posts:'posts',[runtime]:'other'};"],
  ['spread override', "const TAGS={posts:'posts',...runtime};"],
  ['getter', "const TAGS={get posts(){return 'posts'}};"],
]) test('does not infer an immutable container after ' + label, () => {
  const r = source(declaration + "cacheTag(TAGS.posts);");
  assert.equal(r.producers.length, 0);
  assert.ok(r.findings.some(f => f.code === 'NCT900'), JSON.stringify(r));
});

test('let, cycles, temporal dead zones and runtime expressions remain unresolved', () => {
  const r = source("let changing='x'; cacheTag(changing); const a=b; const b=a; cacheTag(a); cacheTag(later); const later='x'; cacheTag(`post:${id}`); revalidateTag(`post:${otherId}`,'max');");
  assert.equal(r.producers.length + r.invalidations.length, 0);
  assert.equal(r.findings.filter(f => f.code === 'NCT900').length, 5);
});

test('shadowed constants are resolved by binding', () => {
  const r = source("const TAG='outer'; function a(TAG){cacheTag(TAG)} function b(){const TAG='inner';cacheTag(TAG)} cacheTag(TAG);");
  assert.deepEqual(r.producers.map(p => p.tag), ['inner','outer']);
  assert.equal(r.findings.filter(f => f.code === 'NCT900').length, 1);
});

test('shorthand fields and constant fetch/unstable_cache option objects resolve', () => {
  const r = source("const posts='posts'; const TAGS={posts}; const options={next:{tags:[TAGS.posts]}}; const cacheOptions={tags:[posts]}; fetch('/x',options); unstable_cache(async()=>[],[],cacheOptions);");
  assert.deepEqual(r.producers.map(p=>p.tag), ['posts','posts']);
  assert.equal(r.findings.length,0,JSON.stringify(r.findings));
});

test('exponentially repeated spreads have a bounded work budget', () => {
  const declarations = ["const a0=['posts'];", ...Array.from({length:15},(_,i)=>`const a${i+1}=[...a${i},...a${i}];`)];
  const r = source(declarations.join('')+'cacheTag(...a15);');
  assert.ok(!r.findings.some(f=>f.code==='NCT008'));
  assert.ok(r.producers.length<10000);
});

test('project resolves direct named constants, aliases and constant options without executing imports', async t => {
  const root = await fixture(t, {
    'next.config.mjs': 'export default {cacheComponents:true}',
    'tsconfig.json': '{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}',
    'src/tags.ts': "throw new Error('never execute'); export const TAGS={posts:'posts'} as const; export const LIST=['posts'];",
    'app/data.ts': "import {LIST} from '@/tags'; fetch('/x',{next:{tags:LIST}});",
    'app/actions.ts': cacheImports + "import {TAGS as tags} from '../src/tags.js'; updateTag(tags.posts);"
  });
  const r = await analyzeProject(root);
  assert.equal(r.findings.length, 0, JSON.stringify(r.findings));
  assert.equal(r.coverage.resolvedProducers, 1);
  assert.equal(r.coverage.resolvedInvalidations, 1);
  assert.ok(r.graph.invalidations[0].evidence.some(e => e.kind === 'import'));
  assert.ok(r.graph.invalidations[0].evidence.some(e => e.file === 'src/tags.ts' && e.kind === 'literal'));
  assert.match(explainTag(r,'posts'), /src\/tags.ts/);
  await writeFile(join(root,'src/tags.ts'), "export const TAGS={posts:'changed'}; export const LIST=['posts'];");
  assert.equal((await analyzeProject(root)).findings.filter(f => f.code === 'NCT001').length, 1);
  const overrides = {'src/tags.ts':"export const TAGS={posts:'posts'}; export const LIST=['posts'];"};
  assert.equal(analyzeProjectSync(root,{},overrides).findings.length, 0);
  await unlink(join(root,'src/tags.ts'));
  assert.ok((await analyzeProject(root)).findings.some(f => f.code === 'NCT900'));
});

test('writes from an importing file invalidate object evidence in all files', async t => {
  const root = await fixture(t, {
    'tags.ts':"export const TAGS={posts:'posts'};",
    'a.ts':"import {TAGS} from './tags'; TAGS.posts='changed';",
    'b.ts':cacheImports+"import {TAGS} from './tags'; updateTag(TAGS.posts);"
  });
  const r=await analyzeProject(root);
  assert.equal(r.graph.invalidations.length,0);
  assert.ok(r.findings.some(f=>f.code==='NCT900'));
});

test('named re-exports resolve while excluded sources and type-only imports do not', async t => {
  const root = await fixture(t, {
    'tags.ts':"export const TAG='posts';",
    'barrel.ts':"export {TAG} from './tags';",
    'a.ts':cacheImports+"import {TAG} from './barrel'; cacheTag(TAG);",
    'b.ts':cacheImports+"import type {TAG} from './tags'; updateTag(TAG);"
  });
  const r=await analyzeProject(root);
  assert.deepEqual(r.graph.producers.map(p => p.tag), ['posts']);
  assert.equal(r.graph.invalidations.length,0);
  assert.equal(r.findings.filter(f=>f.code==='NCT900').length,1);
  await writeFile(join(root,'a.ts'),cacheImports+"import {TAG} from './tags'; cacheTag(TAG);");
  assert.equal((await analyzeProject(root,{exclude:['tags.ts']})).graph.producers.length,0);
});

test('named re-export chains preserve aliases, local import/export lists and every evidence hop', async t => {
  const root = await fixture(t, {
    'next.config.ts': 'export default {cacheComponents:true}',
    'tsconfig.json': '{"compilerOptions":{"paths":{"@/*":["./lib/*"]}}}',
    'lib/tags.ts': "throw new Error('never execute'); export const TAGS={posts:'posts'};",
    'lib/first.ts': "export {TAGS as DATA} from './tags.js';",
    'lib/index.ts': "import {DATA as local} from './first'; export {local as PUBLIC};",
    'app/data.ts': cacheImports + "import {PUBLIC} from '@/index'; cacheTag(PUBLIC.posts);",
    'app/actions.ts': cacheImports + "import {TAGS} from '../lib/tags'; updateTag(TAGS.posts);"
  });
  const report = await analyzeProject(root);
  assert.equal(report.findings.length, 0, JSON.stringify(report.findings));
  assert.deepEqual(report.graph.producers[0].evidence.map(e => e.kind), ['usage','import','export','import','export','export','definition','literal']);
  assert.match(explainTag(report, 'posts'), /lib\/first.ts/);
  await writeFile(join(root, 'lib/first.ts'), "export {MISSING as DATA} from './tags';");
  assert.equal((await analyzeProject(root)).graph.producers.length, 0);
  assert.equal(analyzeProjectSync(root, {}, {'lib/first.ts': "export {TAGS as DATA} from './tags';"}).graph.producers[0].tag, 'posts');
});

for (const [label, files, reason] of [
  ['cyclic exports', {'index.ts': "export {TAG} from './other';", 'other.ts': "export {TAG} from './index';"}, /Cyclic named export/],
  ['wildcard exports', {'index.ts': "export * from './tags';"}, /export \*/],
  ['type-only exports', {'index.ts': "export type {TAG} from './tags';"}, /type-only/],
  ['inline type-only exports', {'index.ts': "export {type TAG} from './tags';"}, /type-only/],
  ['type-only local import', {'index.ts': "import type {TAG} from './tags'; export {TAG};"}, /Type-only/],
  ['namespace exports', {'index.ts': "export * as TAG from './tags';"}, /namespace/],
  ['default exports', {'index.ts': "export {default as TAG} from './tags';", 'tags.ts': "export default 'posts';"}, /Default exports/],
  ['conflicting explicit exports', {'index.ts': "export {TAG} from './tags'; export {TAG} from './other';", 'other.ts': "export const TAG='other';"}, /Multiple explicit exports/],
  ['missing source', {'index.ts': "export {TAG} from './missing';"}, /outside the scanned/],
  ['broken source', {'index.ts': "export {TAG} from './tags';", 'tags.ts': "export const TAG='posts'; const = ;"}, /syntax errors/]
]) test('named export resolution remains unknown for ' + label, async t => {
  const root = await fixture(t, {'tags.ts': "export const TAG='posts';", ...files, 'app/data.ts': cacheImports + "import {TAG} from '../index'; cacheTag(TAG);"});
  const report = await analyzeProject(root);
  assert.equal(report.graph.producers.length, 0);
  assert.ok(report.findings.some(f => f.code === 'NCT900' && reason.test(f.message)), JSON.stringify(report.findings));
});

test('named export depth is bounded and excluded barrels never supply evidence', async t => {
  const files = {'app/data.ts': cacheImports + "import {TAG} from '../chain0'; cacheTag(TAG);", 'chain65.ts': "export const TAG='posts';"};
  for (let i = 0; i < 65; i++) files['chain' + i + '.ts'] = `export {TAG} from './chain${i + 1}';`;
  const root = await fixture(t, files);
  const report = await analyzeProject(root);
  assert.equal(report.graph.producers.length, 0);
  assert.match(report.findings.find(f => f.code === 'NCT900').message, /depth limit/);
  await writeFile(join(root, 'chain0.ts'), "export {TAG} from './chain65';");
  assert.equal((await analyzeProject(root, {exclude:['chain65.ts']})).graph.producers.length, 0);
});

for (const use of ["DATA.posts='changed';", 'mutate(DATA);', 'const alias=DATA; alias.posts="changed";']) {
  test('mutations and escapes through a barrel invalidate aggregate evidence: ' + use, async t => {
    const root = await fixture(t, {
      'tags.ts': "export const TAGS={posts:'posts'};",
      'index.ts': "export {TAGS as DATA} from './tags';",
      'writer.ts': "import {DATA} from './index'; " + use,
      'app/data.ts': cacheImports + "import {TAGS} from '../tags'; cacheTag(TAGS.posts);"
    });
    assert.equal((await analyzeProject(root)).graph.producers.length, 0);
  });
}

test('nested Next applications are rejected instead of sharing tag evidence', async t => {
  const root=await fixture(t, {'apps/other/next.config.mjs':'export default {}', 'app/a.ts':cacheImports+"updateTag('posts');"});
  await assert.rejects(analyzeProject(root),/one app root/);
  assert.equal((await analyzeProject(root,{exclude:['apps/**']})).filesScanned,1);
});

test('in-project compiler config extends and local export lists are supported', async t => {
  const root=await fixture(t, {
    'tsconfig.json':'{"extends":"./config/base.json"}',
    'config/base.json':'{"compilerOptions":{"baseUrl":"..","paths":{"@tags":["tags.ts"]}}}',
    'tags.ts':"const TAG='posts'; export {TAG as POSTS};",
    'app/a.ts':cacheImports+"import {POSTS} from '@tags'; updateTag(POSTS);"
  });
  const r=await analyzeProject(root);
  assert.equal(r.graph.invalidations[0]?.tag,'posts',JSON.stringify(r.findings));
});
