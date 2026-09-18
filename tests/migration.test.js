import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import plugin from '../dist/eslint.js';
import { analyzeSource, analyzeProject, formatHtml, formatSarif } from '../dist/index.js';
import { fixture, cacheImports } from './helpers.js';

const source = text => analyzeSource('app/data.ts', cacheImports + text);
const withCode = (report, code) => report.findings.filter(f => f.code === code);
const tagList = count => Array.from({length: count}, (_, i) => JSON.stringify('tag-' + i)).join(',');

test('NCT006 catches literal and dynamic one-argument calls, including aliases', () => {
  const r = source("import {revalidateTag as invalidate} from 'next/cache'; import * as c from 'next/cache'; revalidateTag('posts'); invalidate(tag); c.revalidateTag(`users`);");
  assert.equal(withCode(r, 'NCT006').length, 3);
  assert.ok(withCode(r, 'NCT006').every(f => f.severity === 'warning' && /expire: 0/.test(f.help)));
});

test('NCT006 does not flag explicit profiles, spreads, unrelated or shadowed APIs', () => {
  const r = source("revalidateTag('posts', 'max'); revalidateTag('posts', {expire:0}); revalidateTag('posts', policy); revalidateTag(...args); revalidateTag(); function local(revalidateTag){revalidateTag('posts')} const obj={revalidateTag(){}}; obj.revalidateTag('posts');");
  assert.equal(withCode(r, 'NCT006').length, 0);
  const unrelated = analyzeSource('a.ts', "import {revalidateTag} from './other'; revalidateTag('x');");
  assert.equal(withCode(unrelated, 'NCT006').length, 0);
});

test('NCT007 covers every recognized producer/invalidation and the 256/257 boundary', () => {
  const short = JSON.stringify('x'.repeat(256)), long = JSON.stringify('x'.repeat(257));
  for (const tag of [short, long]) {
    const r = source(`cacheTag(${tag}); fetch('/x',{next:{tags:[${tag}]}}); unstable_cache(async()=>[],[],{tags:[${tag}]}); revalidateTag(${tag},'max'); updateTag(${tag});`);
    assert.equal(withCode(r, 'NCT007').length, tag === short ? 0 : 5);
    assert.equal(r.producers.length, 3, 'graph keeps literal source evidence, even invalid tags');
  }
});

test('NCT007 uses decoded JavaScript string length and does not evaluate expressions', () => {
  const r = source('cacheTag("' + '\\u0061'.repeat(257) + '"); cacheTag(`' + '😀'.repeat(129) + "`); cacheTag('x'.repeat(257)); cacheTag(tag);");
  assert.equal(withCode(r, 'NCT007').length, 2);
  assert.match(withCode(r, 'NCT007')[1].message, /258/);
  assert.equal(withCode(r, 'NCT900').length, 2);
});

test('NCT008 covers cacheTag/fetch/unstable_cache and the 128/129 boundary', () => {
  for (const count of [128,129]) {
    const tags = tagList(count);
    const r = source(`cacheTag(${tags}); fetch('/x',{next:{tags:[${tags}]}}); unstable_cache(async()=>[],[],{tags:[${tags}]});`);
    assert.equal(withCode(r, 'NCT008').length, count === 128 ? 0 : 3);
  }
});

test('NCT008 avoids unknown counts, invalid lengths, and summing separate calls', () => {
  const r = source(`cacheTag(${tagList(128)}, ...dynamic); cacheTag(${tagList(128)}, ${JSON.stringify('x'.repeat(257))}); cacheTag(${tagList(100)}); cacheTag(${tagList(100)});`);
  assert.equal(withCode(r, 'NCT008').length, 0);
  assert.equal(withCode(r, 'NCT900').length, 1);
  assert.equal(withCode(r, 'NCT007').length, 1);
});

test('new checks respect namespace and fetch shadowing', () => {
  const tags = tagList(129), long = JSON.stringify('x'.repeat(257));
  const r = source(`import * as c from 'next/cache'; c.cacheTag(${long}); function local(c,fetch,cacheTag){ c.cacheTag(${long}); fetch('/x',{next:{tags:[${tags}]}}); cacheTag(${tags}); }`);
  assert.equal(withCode(r, 'NCT007').length, 1);
  assert.equal(withCode(r, 'NCT008').length, 0);
});

test('NCT009 recognizes exported and inline actions but not nested ordinary helpers', () => {
  const r = analyzeSource('app/actions.ts', "'use server';\n" + cacheImports + `
    export async function save(){ revalidateTag('posts','max'); function helper(){revalidateTag('posts','max')} }
    export const arrow = async () => revalidateTag('posts', 'max');
    const listed = async () => revalidateTag('posts', 'max'); export {listed};
    async function hidden(){revalidateTag('posts','max')}
  `);
  assert.equal(withCode(r, 'NCT009').length, 3);
  const inline = source("async function action(){'use server'; revalidateTag('posts',`max`)} async function GET(){revalidateTag('posts','max')} async function later(){void 0; 'use server'; revalidateTag('posts','max')}");
  assert.equal(withCode(inline, 'NCT009').length, 1);
});

test('NCT009 is off by default, opt-in via JSON, and supports suppression', async t => {
  const root = await fixture(t, {'app/actions.ts': "'use server';\n" + cacheImports + "export async function save(){revalidateTag('posts','max')}"});
  assert.equal(withCode(await analyzeProject(root), 'NCT009').length, 0);
  await writeFile(join(root, 'next-cache-trace.config.json'), '{"rules":{"NCT009":"info"}}');
  assert.equal(withCode(await analyzeProject(root), 'NCT009').length, 1);
  const r = await analyzeProject(root, {rules:{NCT009:'off', NCT001:'off'}});
  assert.equal(r.findings.length, 0);
  assert.equal(r.suppressedCount, 2);
});

test('NCT001 suggests case, insertion, deletion, substitution and transposition, never auto-matches', async t => {
  const root = await fixture(t, {
    'lib/data.ts': "fetch('/x',{next:{tags:['products']}});",
    'app/actions.ts': cacheImports + ['Products','product','productss','produxts','produtcs'].map(tag => `updateTag('${tag}');`).join('\n')
  });
  const r = await analyzeProject(root);
  assert.equal(withCode(r, 'NCT001').length, 5);
  for (const f of withCode(r, 'NCT001')) assert.match(f.message, /Possible spelling\/case matches: "products" \(lib\/data.ts\)/);
  assert.equal(r.graph.invalidations[0].tag, 'Products');
});

test('NCT001 avoids distant/short fuzzy hints, caps candidates, prioritizes exact case match', async t => {
  const root = await fixture(t, {'app/a.ts': cacheImports + "fetch('/x',{next:{tags:['a','cats','POSTS','posts1','posts2','posts3','posts4']}}); updateTag('b'); updateTag('unrelated'); updateTag('posts');"});
  const findings = withCode(await analyzeProject(root), 'NCT001');
  assert.ok(!findings[0].message.includes('Possible spelling'));
  assert.ok(!findings[1].message.includes('Possible spelling'));
  assert.match(findings[2].message, /matches: "POSTS"/);
  assert.equal((findings[2].message.match(/\(app\/a.ts\)/g) ?? []).length, 3);
});

test('suggestions keep SARIF fingerprints stable after producer line shifts', async t => {
  const root = await fixture(t, {'lib/data.ts': "fetch('/x',{next:{tags:['posts']}});", 'app/action.ts':cacheImports + "updateTag('post');"});
  const a = JSON.parse(formatSarif(await analyzeProject(root)));
  await writeFile(join(root,'lib/data.ts'), "\n\nfetch('/x',{next:{tags:['posts']}});");
  const b = JSON.parse(formatSarif(await analyzeProject(root)));
  assert.deepEqual(a.runs[0].results[0].partialFingerprints, b.runs[0].results[0].partialFingerprints);
});

test('new rules support severity overrides, disable comments and unchanged graph', async t => {
  const root = await fixture(t, {'app/a.ts': cacheImports + "// next-cache-trace-disable-next-line NCT006 -- migration tracked\nrevalidateTag('posts');\nupdateTag('" + 'x'.repeat(257) + "');"});
  const r = await analyzeProject(root, {rules:{NCT001:'off',NCT007:'error'}});
  assert.equal(r.summary.error, 1);
  assert.equal(withCode(r, 'NCT006').length, 0);
  assert.equal(r.graph.invalidations.length, 2);
  assert.equal(r.suppressedCount, 3);
});

test('CLI migration warnings enforce warning threshold and serialize to HTML/SARIF', async t => {
  const root = await fixture(t, {'app/a.ts':cacheImports + "fetch('/x',{next:{tags:['posts']}}); revalidateTag('posts');"});
  const run = level => spawnSync(process.execPath, [resolve('bin/next-cache-trace.js'),'audit',root,'--format','json','--fail-on',level], {encoding:'utf8'});
  assert.equal(run('error').status, 0);
  const warn = run('warning');
  assert.equal(warn.status, 1, warn.stderr);
  assert.equal(JSON.parse(warn.stdout).findings[0].code, 'NCT006');
  const report = await analyzeProject(root);
  assert.match(formatHtml(report), /NCT006/);
  const sarif = JSON.parse(formatSarif(report));
  assert.equal(sarif.runs[0].results[0].ruleId, 'NCT006');
  assert.ok(sarif.runs[0].tool.driver.rules.some(rule => rule.id === 'NCT008'));
});

test('ESLint enables migration/limit warnings but leaves freshness advice opt-in', () => {
  const linter = new Linter();
  const text = "'use server';\n" + cacheImports + `export async function save(){revalidateTag('posts'); revalidateTag('posts','max'); cacheTag('${'x'.repeat(257)}'); cacheTag(${tagList(129)});}`;
  const config = {...plugin.configs.recommended, languageOptions:{parser:tseslint.parser}};
  const ids = linter.verify(text, [config]).map(m => m.ruleId);
  assert.deepEqual(ids.sort(), ['next-cache-trace/NCT006','next-cache-trace/NCT007','next-cache-trace/NCT008']);
  const enabled = {...config, rules:{...config.rules,'next-cache-trace/NCT009':'warn'}};
  assert.ok(linter.verify(text, [enabled]).some(m => m.ruleId === 'next-cache-trace/NCT009'));
  assert.equal(plugin.configs.project.rules['next-cache-trace/NCT009'], 'off');
});

test('ESLint project mode exposes explicitly enabled freshness advice', async t => {
  const text = "'use server';\n" + cacheImports + "export async function save(){revalidateTag('posts','max')}";
  const root = await fixture(t, {'app/actions.js': text});
  const linter = new Linter({cwd:root});
  const config = {...plugin.configs.project, settings:{'next-cache-trace':{projectRoot:root}}, rules:{...plugin.configs.project.rules,'next-cache-trace/NCT009':'warn'}};
  assert.ok(linter.verify(text,[config],{filename:join(root,'app/actions.js')}).some(m=>m.ruleId==='next-cache-trace/NCT009'));
});
