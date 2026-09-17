import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeSource } from '../dist/index.js';
import { cacheImports, headerImports } from './helpers.js';
const analyze = text => analyzeSource('app/catalog/data.tsx', text);
const codes = result => result.findings.map(x => x.code);

test('public source API supports absolute Windows filenames', () => {
  const r = analyzeSource('C:\\workspace\\app\\data.ts', cacheImports + "cacheTag('windows');");
  assert.equal(r.producers.length, 1);
});

test('aliases and namespace imports resolve by symbols', () => {
  const r = analyze("import { cacheTag as tag } from 'next/cache'; import * as c from 'next/cache'; export async function data() { 'use cache'; tag('products'); c.cacheLife('hours'); c.updateTag('products'); }");
  assert.deepEqual(codes(r), []);
  assert.equal(r.producers[0].tag, 'products');
  assert.equal(r.invalidations[0].method, 'updateTag');
  assert.equal(r.producers[0].scope, 'data');
});
test('does not mistake unrelated imports, object methods, type imports, comments or strings for API calls', () => {
  const r = analyze("import {cacheTag} from './fake'; import type {updateTag} from 'next/cache'; cacheTag('fake'); updateTag('type'); const text = \"cacheTag('text')\"; const directive = 'use cache'; // cacheTag('comment')\nconst obj = {cacheTag() {}}; obj.cacheTag('method'); const pattern = /cacheTag('regex')/;");
  assert.equal(r.producers.length + r.invalidations.length + r.boundaries.length, 0);
});
test('shadowed identifiers and namespace parameters are not framework APIs', () => {
  const r = analyze(cacheImports + "import * as cache from 'next/cache'; function a(cacheTag, cache) { cacheTag('shadow'); cache.cacheTag('shadow'); } function b() { const updateTag = () => {}; updateTag('shadow'); } cacheTag('real');");
  assert.deepEqual(r.producers.map(p => p.tag), ['real']);
  assert.equal(r.invalidations.length, 0);
});
test('request APIs are restricted in shared and remote scopes, but private caches and draftMode reads are allowed', () => {
  const r = analyze(cacheImports + headerImports + "export async function shared(){ 'use cache'; cacheLife('hours'); await cookies(); await draftMode(); } export async function remote(){ 'use cache: remote'; cacheLife('hours'); await headers(); } export async function privateData(){ 'use cache: private'; cacheLife('hours'); await cookies(); await headers(); }");
  assert.equal(r.findings.filter(f => f.code === 'NCT002').length, 2);
  assert.equal(r.findings.filter(f => f.code === 'NCT005').length, 0);
});
test('only directive prologues create cached boundaries', () => {
  const r = analyze(headerImports + "async function a(){ const x = 1; 'use cache'; await cookies(); } async function b(){ if(true){ 'use cache'; await cookies(); }}");
  assert.equal(r.boundaries.length, 0);
});
test('nested cacheLife does not satisfy its parent and uncalled helpers do not inherit cache scopes', () => {
  const r = analyze(cacheImports + headerImports + "async function parent(){'use cache'; function helper(){cookies();} async function child(){ 'use cache'; cacheLife('hours'); headers(); }}");
  assert.equal(r.findings.filter(f => f.code === 'NCT005').length, 1);
  assert.equal(r.findings.filter(f => f.code === 'NCT002').length, 1);
  assert.match(r.findings.find(f => f.code === 'NCT002').message, /child/);
});
test('file directives apply to exported functions including local export lists and expression arrows', () => {
  const r = analyze("'use cache';\n" + cacheImports + headerImports + "export async function a(){cacheLife('hours');cookies();} export const b = async () => headers(); async function hidden(){cookies();} const c = async () => cookies(); export { c };");
  assert.deepEqual(r.boundaries.map(b => b.name), ['a', 'b', 'c']);
  assert.equal(r.findings.filter(f => f.code === 'NCT002').length, 3);
});
test('supports escaped literals and constant templates while dynamic templates remain unresolved', () => {
  const r = analyze(cacheImports + "cacheTag('a\\u0062', `literal`, `user:${id}`, 'part-' + id); updateTag('');");
  assert.deepEqual(r.producers.map(p => p.tag), ['ab', 'literal']);
  assert.equal(r.invalidations[0].tag, '');
  assert.equal(r.findings.filter(f => f.code === 'NCT900').length, 2);
});
test('recognizes fetch and unstable_cache producers without requiring Cache Components', () => {
  const r = analyze(cacheImports + "fetch('/x', {next: {tags: ['posts']}}); unstable_cache(async()=>[], [], {tags: ['users']});");
  assert.deepEqual(r.producers.map(p => [p.tag, p.method]), [['posts', 'fetch'], ['users', 'unstable_cache']]);
  assert.equal(r.usages.length, 0);
});
test('a shadowed fetch is not treated as a framework fetch', () => {
  const r = analyze("function a(fetch) {fetch('/x', {next:{tags:['false']}})}");
  assert.equal(r.producers.length, 0);
});
test('unresolved fetch and unstable_cache options are visible', () => {
  const r = analyze(cacheImports + "fetch('/x', options); unstable_cache(async()=>[], [], opts);");
  assert.equal(r.findings.filter(f => f.code === 'NCT900').length, 2);
});
test('syntax errors are reported with a location', () => {
  const r = analyze('export async function x( {');
  assert.ok(r.findings.some(f => f.code === 'NCT902' && f.line > 0 && f.column > 0));
});
