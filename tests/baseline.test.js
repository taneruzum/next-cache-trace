import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFile, unlink, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { analyzeProject, createBaseline, applyBaseline, formatMarkdown, formatSarif, formatHtml } from '../dist/index.js';
import plugin from '../dist/eslint.js';
import { fixture, cacheImports } from './helpers.js';

const run = args => spawnSync(process.execPath,[resolve('bin/next-cache-trace.js'),...args],{encoding:'utf8'});

test('baseline keeps complete reports and detects an identical additional occurrence', async t => {
  const root=await fixture(t,{'app/action.ts':cacheImports+"updateTag('missing');"});
  const before=await analyzeProject(root);
  const baseline=createBaseline(before);
  const existing=applyBaseline(before,baseline);
  assert.equal(existing.findings.length,1);
  assert.deepEqual(existing.summary,before.summary);
  assert.equal(existing.baseline.new,0);
  await writeFile(join(root,'app/action.ts'),'\n// unrelated comment\n'+cacheImports+"updateTag('missing');\n updateTag ( 'missing' );");
  const after=applyBaseline(await analyzeProject(root),baseline);
  assert.equal(after.baseline.existing,1);
  assert.equal(after.baseline.new,1);
  assert.equal(after.baseline.newSummary.warning,1);
  const sarif=JSON.parse(formatSarif(after)).runs[0].results;
  assert.notEqual(sarif[0].partialFingerprints['nextCacheTrace/v1'],sarif[1].partialFingerprints['nextCacheTrace/v1']);
  assert.deepEqual(sarif.map(f=>f.baselineState),['unchanged','new']);
  assert.match(formatHtml(after),/warning \/ existing/);
});

test('deleting a producer reports a new finding in an unchanged consumer', async t => {
  const root=await fixture(t,{'lib/data.ts':"fetch('/x',{next:{tags:['posts']}});",'app/action.ts':cacheImports+"updateTag('posts');"});
  const baseline=createBaseline(await analyzeProject(root));
  await unlink(join(root,'lib/data.ts'));
  const after=applyBaseline(await analyzeProject(root),baseline);
  assert.equal(after.baseline.new,1);
  assert.equal(after.findings[0].code,'NCT001');
});

test('baseline identities survive hint/message changes and account for resolved findings', async t => {
  const root=await fixture(t,{'lib/data.ts':"fetch('/x',{next:{tags:['posts']}});",'app/action.ts':cacheImports+"updateTag('post');"});
  const baseline=createBaseline(await analyzeProject(root));
  await writeFile(join(root,'lib/data.ts'),"fetch('/x',{next:{tags:['unrelated']}});");
  assert.equal(applyBaseline(await analyzeProject(root),baseline).baseline.new,0);
  await writeFile(join(root,'lib/data.ts'),"fetch('/x',{next:{tags:['post']}});");
  assert.equal(applyBaseline(await analyzeProject(root),baseline).baseline.resolved,1);
});

test('changed configuration, schema, severity and malformed baseline cannot silently weaken CI', async t => {
  const root=await fixture(t,{'a.ts':cacheImports+"updateTag('missing');"});
  const report=await analyzeProject(root), baseline=createBaseline(report);
  for (const changed of [{...baseline,version:2},{...baseline,identityVersion:2},{...baseline,reportSchemaVersion:'0.2'},{...baseline,entries:[...baseline.entries,...baseline.entries]},{...baseline,entries:[{...baseline.entries[0],count:-1}]}]) {
    assert.throws(()=>applyBaseline(report,changed),/baseline|Baseline/);
  }
  assert.throws(()=>applyBaseline(report,{}),/incompatible/);
  assert.throws(()=>applyBaseline({...report,analysisSignature:'changed'},baseline),/configuration/);
  const changed=await analyzeProject(root,{rules:{NCT001:'error'}});
  assert.throws(()=>applyBaseline(changed,baseline),/configuration/);
});

test('source parse failures cannot be captured or hidden in a baseline', async t => {
  const root=await fixture(t,{'a.ts':'export async function broken( {'});
  const report=await analyzeProject(root);
  assert.throws(()=>createBaseline(report),/parse errors/);
  assert.throws(()=>createBaseline({...report,findings:[]}),/parse errors/);
  const clean={...report,coverage:{...report.coverage,parseErrors:0},findings:[],summary:{error:0,warning:0,info:0}};
  const applied=applyBaseline(report,createBaseline(clean));
  assert.ok(applied.baseline.newSummary.error>0);
});

test('baseline is portable across checkout roots with the same compiler paths', async t => {
  const files={'tsconfig.json':'{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"]}}}', 'a.ts':cacheImports+"updateTag('missing');"};
  const a=await fixture(t,files), b=await fixture(t,files);
  assert.equal(applyBaseline(await analyzeProject(b),createBaseline(await analyzeProject(a))).baseline.new,0);
});

test('CLI baseline creation, comparison, update and all exit thresholds', async t => {
  const root=await fixture(t,{'app/action.ts':cacheImports+"updateTag('missing');"});
  const args=['audit',root,'--baseline','cache.baseline.json','--fail-on','warning','--format','json'];
  const created=run([...args,'--update-baseline']);
  assert.equal(created.status,0,created.stderr);
  assert.equal(JSON.parse(created.stdout).baseline.existing,1);
  const saved=await readFile(join(root,'cache.baseline.json'),'utf8');
  await writeFile(join(root,'app/action.ts'),cacheImports+"updateTag('missing');updateTag('second');");
  const comparison=run(args);
  assert.equal(comparison.status,1,comparison.stderr);
  assert.equal(JSON.parse(comparison.stdout).baseline.new,1);
  assert.equal(await readFile(join(root,'cache.baseline.json'),'utf8'),saved);
  assert.equal(run([...args,'--fail-on','none']).status,0);
  assert.equal(run([...args,'--update-baseline']).status,0);
  assert.equal(run(args).status,0);
  const explain=run(['audit',root,'--tag','unrelated','--fail-on','warning']);
  assert.equal(explain.status,1,'tag view must not filter CI findings');
  assert.match(explain.stdout,/none observed/);
});

test('CLI refuses missing baseline and overwriting project JSON, even with force', async t => {
  const root=await fixture(t,{'package.json':'{"private":true}'});
  assert.equal(run(['audit',root,'--baseline','missing.json']).status,2);
  assert.equal(run(['audit',root,'--update-baseline']).status,2);
  const overwrite=run(['audit',root,'--baseline','package.json','--update-baseline','--force']);
  assert.equal(overwrite.status,2);
  assert.equal(await readFile(join(root,'package.json'),'utf8'),'{"private":true}');
});

test('scope expectations include tagged fetch, unresolved cache usage and survive rule suppression', async t => {
  const root=await fixture(t,{'a.ts':"fetch('/x',{next:{tags:['posts']}});"});
  assert.equal(run(['audit',root,'--require-cache-usage','--min-files','1']).status,0);
  assert.equal(run(['audit',root,'--min-files','2','--fail-on','none']).status,2);
  await writeFile(join(root,'a.ts'),cacheImports+'cacheTag(dynamic);');
  assert.equal(run(['audit',root,'--require-cache-usage','--ignore-rule','NCT900','--ignore-rule','NCT004']).status,0);
  await writeFile(join(root,'a.ts'),'export const nothing=1;');
  assert.equal(run(['audit',root,'--require-cache-usage','--fail-on','none']).status,2);
  for (const n of ['-1','nope','1.5','Infinity']) assert.equal(run(['audit',root,'--min-files',n]).status,2);
});

test('all version metadata matches the installed package; Markdown escapes hostile values', async t => {
  const root=await fixture(t,{'a.ts':cacheImports+"updateTag('</details><script>x</script>|[link](https://evil.invalid)');"});
  const report=await analyzeProject(root);
  const {version}=JSON.parse(await readFile('package.json','utf8'));
  assert.equal(plugin.meta.version,version);
  assert.equal(JSON.parse(formatSarif(report)).runs[0].tool.driver.version,version);
  const markdown=formatMarkdown(report);
  assert.ok(!markdown.includes('<script>'));
  assert.ok(!markdown.includes('[link](https://evil.invalid)'));
  assert.match(markdown,/\\\|/);
  const cli=run(['audit',root,'--format','markdown']);
  assert.equal(cli.status,0,cli.stderr);
  assert.match(cli.stdout,/# next-cache-trace/);
});
