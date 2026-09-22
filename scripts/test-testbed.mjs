import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeProject, analyzeProjectSync, applyBaseline, createBaseline,
  formatHtml, formatJson, formatMarkdown, formatSarif
} from '../dist/index.js';

if (!process.argv[2]) throw new Error('Usage: npm run test:testbed -- /path/to/next-cache-testbed (the external fixture set only)');
const testbed = resolve(process.argv[2]);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = name => join(testbed, 'fixtures', name);
const app = join(testbed, 'apps', 'ayaz');

async function hashes(directory, prefix = '') {
  const result = {};
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (['node_modules', '.git', '.next'].includes(entry.name)) continue;
    const path = join(directory, entry.name), name = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(result, await hashes(path, name + '/'));
    else if (entry.isFile()) result[name] = createHash('sha256').update(await readFile(path)).digest('hex');
  }
  return result;
}

/** Every finding of one rule, as sortable "file:line" strings. */
const sites = (report, code) => report.findings.filter(f => f.code === code).map(f => f.file + ':' + f.line);
const counts = report => {
  const by = {};
  for (const f of report.findings) by[f.code] = (by[f.code] ?? 0) + 1;
  return by;
};
const tagCounts = list => {
  const by = {};
  for (const site of list) by[site.tag] = (by[site.tag] ?? 0) + 1;
  return by;
};
const message = (report, code, file) => report.findings.find(f => f.code === code && f.file === file)?.message ?? '';

const before = await hashes(testbed);

/* ================================================================== */
/* 1. apps/ayaz — the runnable application, and the reference outcome  */
/* ================================================================== */

const ayaz = await analyzeProject(app);

assert.equal(ayaz.filesScanned, 15);
assert.deepEqual(ayaz.summary, { error: 0, warning: 0, info: 4 });
assert.equal(ayaz.suppressedCount, 0);
assert.deepEqual(ayaz.config, { enabled: true, file: 'next.config.ts', reason: 'Statically inspected exported config object' });

// A correct application must produce no defect of any severity above info. The
// only findings are the runtime-built tag and the opt-in freshness advisory.
assert.deepEqual(counts(ayaz), { NCT900: 3, NCT009: 1 });
assert.deepEqual(sites(ayaz, 'NCT900'), ['lib/actions.ts:19', 'lib/actions.ts:30', 'lib/catalog.ts:29']);
assert.deepEqual(sites(ayaz, 'NCT009'), ['lib/actions.ts:32']);
assert.ok(message(ayaz, 'NCT900', 'lib/catalog.ts').includes('not a statically resolved string'));

// Every invalidation the application performs is matched by a producer, which
// is the single most important property of a healthy cache graph.
assert.equal(sites(ayaz, 'NCT001').length, 0);
assert.deepEqual([ayaz.graph.producers.length, ayaz.graph.invalidations.length, ayaz.graph.boundaries.length], [6, 5, 5]);
assert.deepEqual(tagCounts(ayaz.graph.producers), { catalog: 4, 'catalog:featured': 1, cart: 1 });
assert.deepEqual(tagCounts(ayaz.graph.invalidations), { catalog: 2, 'catalog:featured': 1, cart: 2 });

// Every tag travels through an imported constant, so nothing is a bare literal.
assert.deepEqual(
  [ayaz.coverage.literalProducers, ayaz.coverage.literalInvalidations, ayaz.coverage.resolvedProducers, ayaz.coverage.resolvedInvalidations],
  [0, 0, 6, 5]
);
assert.equal(ayaz.coverage.parseErrors, 0);

// The cross-file evidence chain is the product's core claim: a producer must be
// traceable from its call back to the literal in lib/tags.ts.
const catalogProducer = ayaz.graph.producers.find(p => p.tag === 'catalog');
assert.deepEqual(catalogProducer.evidence.map(step => step.kind), ['usage', 'import', 'export', 'definition', 'literal']);
assert.equal(catalogProducer.evidence.at(-1).file, 'lib/tags.ts');

// The private cache entry reads cookies legitimately, so NCT002 must stay silent.
assert.ok(ayaz.graph.boundaries.some(b => b.directive === 'use cache: private' && b.name === 'getCart'));
assert.equal(sites(ayaz, 'NCT002').length, 0);
// Every boundary declares an explicit lifetime, so NCT005 must stay silent too.
assert.ok(ayaz.graph.boundaries.every(b => b.explicitLifetime));
assert.equal(sites(ayaz, 'NCT005').length, 0);

/* Baseline round trip against the real application. */
const ayazBaseline = createBaseline(ayaz);
assert.equal(ayazBaseline.entries.reduce((n, e) => n + e.count, 0), 4);
const accepted = applyBaseline(ayaz, ayazBaseline);
assert.deepEqual(accepted.baseline, { existing: 4, new: 0, resolved: 0, newSummary: { error: 0, warning: 0, info: 0 } });
assert.ok(accepted.findings.every(f => f.baselineState === 'existing'));

// A newly introduced defect must surface as new while the accepted ones stay put.
const regressed = analyzeProjectSync(app, {}, {
  'lib/promos.ts': "import { revalidateTag } from 'next/cache';\n\nexport async function refreshPromos() {\n  revalidateTag('catalog');\n}\n"
});
const compared = applyBaseline(regressed, ayazBaseline);
assert.equal(compared.filesScanned, 16);
assert.deepEqual(compared.baseline.newSummary, { error: 0, warning: 1, info: 0 });
const introduced = compared.findings.filter(f => f.baselineState === 'new');
assert.deepEqual(introduced.map(f => f.code + ' ' + f.file + ':' + f.line), ['NCT006 lib/promos.ts:4']);
assert.equal(compared.baseline.existing, 4);

console.log('apps/ayaz: 15 files, 0 errors, 0 warnings, 4 info; 6 producers / 5 invalidations / 5 boundaries.');
console.log('apps/ayaz: every invalidation matched, full evidence chain verified, baseline detects one new finding.');

/* ================================================================== */
/* 2. fixtures/storefront — every rule and every resolver outcome      */
/* ================================================================== */

const storefront = await analyzeProject(fixture('storefront'));

assert.equal(storefront.filesScanned, 27);
assert.deepEqual(storefront.summary, { error: 2, warning: 9, info: 23 });
assert.equal(storefront.suppressedCount, 4);
assert.deepEqual(counts(storefront), { NCT001: 3, NCT002: 2, NCT003: 3, NCT005: 10, NCT006: 1, NCT007: 2, NCT009: 4, NCT900: 9 });
assert.deepEqual([storefront.graph.producers.length, storefront.graph.invalidations.length, storefront.graph.boundaries.length], [14, 9, 15]);

// NCT002: flagged inside shared and remote entries, silent inside a private one.
assert.deepEqual(sites(storefront, 'NCT002'), ['app/(marketing)/home/data.ts:9', 'app/reports/secure.ts:9']);
assert.ok(message(storefront, 'NCT002', 'app/(marketing)/home/data.ts').includes('use cache: remote'));
assert.ok(!storefront.findings.some(f => f.file === 'app/(shop)/cart/data.ts'));
// draftMode() is not a per-request identity read and must never be flagged.
assert.ok(!message(storefront, 'NCT002', 'app/reports/secure.ts').includes('draftMode'));

// NCT001: a typo, a case mismatch and a genuine miss with no near match.
assert.deepEqual(sites(storefront, 'NCT001'), ['app/(shop)/products/actions.ts:7', 'app/admin/actions.ts:6', 'app/invoices/actions.ts:7']);
assert.ok(message(storefront, 'NCT001', 'app/admin/actions.ts').includes('"shared-menu" (app/(marketing)/home/data.ts)'));
assert.ok(message(storefront, 'NCT001', 'app/(shop)/products/actions.ts').includes('"products:list" (app/(shop)/products/data.ts)'));
assert.ok(!message(storefront, 'NCT001', 'app/invoices/actions.ts').includes('Possible spelling'));

// NCT003: one tag produced in three route areas, reported at each producer.
assert.deepEqual(sites(storefront, 'NCT003'), ['app/(marketing)/home/data.ts:7', 'app/(shop)/products/data.ts:8', 'app/admin/data.ts:8']);
assert.ok(storefront.findings.filter(f => f.code === 'NCT003').every(f => f.message.includes('route areas home, products, admin')));

// NCT006 fires only for the single-argument call; the two-argument forms do not.
assert.deepEqual(sites(storefront, 'NCT006'), ['app/orders/actions.ts:8']);
// NCT007 is reported on both the producer and the invalidation side.
assert.deepEqual(sites(storefront, 'NCT007'), ['app/settings/actions.ts:7', 'app/settings/data.ts:7']);
assert.ok(storefront.findings.filter(f => f.code === 'NCT007').every(f => f.message.includes('280 UTF-16 code units')));
// NCT009 is opt-in and is enabled by the fixture's own config file.
assert.equal(sites(storefront, 'NCT009').length, 4);

// NCT005 covers only boundaries without a direct cacheLife call.
assert.equal(sites(storefront, 'NCT005').length, 10);
assert.equal(storefront.graph.boundaries.filter(b => b.explicitLifetime).length, 5);
for (const cached of ['app/(shop)/cart/data.ts', 'app/invoices/data.ts']) assert.ok(!sites(storefront, 'NCT005').some(s => s.startsWith(cached)));

// NCT900: one entry per unsupported resolver path, each with its own reason.
assert.deepEqual(new Map(storefront.findings.filter(f => f.code === 'NCT900').map(f => [f.file + ':' + f.line, f.message.split(': ').slice(1).join(': ')])), new Map([
  ['app/(marketing)/home/promo.ts:6', 'Constant is read before its declaration.'],
  ['app/(shop)/collections/data.ts:7', 'Computed property keys are not resolved.'],
  ['app/(shop)/products/related.ts:7', 'No supported local constant or direct named export in the scanned sources.'],
  ['app/admin/labels.ts:6', 'The constant or one of its aliases is written to.'],
  ['app/admin/labels.ts:7', 'The object/array escapes supported read-only uses; as const is not runtime immutability.'],
  ['app/admin/labels.ts:8', 'Only const declarations with simple names are supported.'],
  ['app/orders/actions.ts:16', 'The tag is not a statically resolved string; runtime expressions are not evaluated.'],
  ['app/orders/data.ts:10', 'The object/array escapes supported read-only uses; as const is not runtime immutability.'],
  ['app/reports/data.ts:11', 'The tag is not a statically resolved string; runtime expressions are not evaluated.']
]));

// Producers: aliases, namespace imports, local export lists and path aliases all
// resolve; excluded files and a shadowed local function never become producers.
assert.deepEqual(tagCounts(storefront.graph.producers), {
  'admin:audit': 1, 'cart:session': 1, 'invoices:list': 1, 'orders:list': 1,
  'products:featured': 1, 'products:hidden': 1, 'products:list': 2,
  'reports:daily': 1, 'reports:secure': 1, 'shared-menu': 3,
  ['settings-snapshot-' + 'a'.repeat(262)]: 1
});
for (const absent of ['mock-only:tag', 'test-only:tag', 'declaration-only:tag', 'admin:shadowed']) {
  assert.ok(!storefront.graph.producers.some(p => p.tag === absent), absent + ' must stay out of the graph');
}
// The namespace import and the aliased import are both recognised as producers.
assert.ok(storefront.graph.producers.some(p => p.file === 'app/admin/data.ts' && p.tag === 'shared-menu'));
assert.ok(storefront.graph.producers.some(p => p.file === 'app/admin/data.ts' && p.tag === 'admin:audit'));
// A local export list resolves, a re-export barrel does not.
assert.equal(storefront.graph.producers.find(p => p.tag === 'invoices:list').resolution, 'resolved');
// One partially resolved call: the scalar read survives, the spread does not.
assert.ok(storefront.graph.producers.some(p => p.file === 'app/orders/data.ts' && p.tag === 'orders:list'));
assert.ok(!storefront.graph.producers.some(p => p.file === 'app/orders/data.ts' && p.tag === 'products:list'));

assert.deepEqual(
  [storefront.coverage.literalProducers, storefront.coverage.resolvedProducers, storefront.coverage.literalInvalidations, storefront.coverage.resolvedInvalidations],
  [4, 10, 5, 4]
);
assert.equal(storefront.coverage.parseErrors, 0);

console.log('fixtures/storefront: 27 files, 2 errors, 9 warnings, 23 info, 4 suppressed; nine distinct resolver outcomes verified.');

/* ---- configuration overrides change exactly what they claim to ---- */

// Turning Cache Components off reports every file that has a cache usage site.
// unstable_cache and fetch options are usages but not directive sites, so
// app/orders/data.ts and app/reports/data.ts stay out.
const disabled = await analyzeProject(fixture('storefront'), { cacheComponents: false });
assert.deepEqual(disabled.summary, { error: 15, warning: 9, info: 23 });
assert.equal(sites(disabled, 'NCT004').length, 13);
for (const quiet of ['app/orders/data.ts', 'app/reports/data.ts', 'app/layout.tsx']) {
  assert.ok(!sites(disabled, 'NCT004').some(s => s.startsWith(quiet)), quiet + ' has no directive site');
}

// Switching a rule off suppresses exactly its own findings and nothing else.
const withoutAdvisory = await analyzeProject(fixture('storefront'), { rules: { NCT009: 'off' } });
assert.deepEqual(withoutAdvisory.summary, { error: 2, warning: 9, info: 19 });
assert.equal(withoutAdvisory.suppressedCount, 8);
const withoutUnresolved = await analyzeProject(fixture('storefront'), { rules: { NCT900: 'off' } });
assert.deepEqual(withoutUnresolved.summary, { error: 2, warning: 9, info: 14 });
assert.equal(withoutUnresolved.suppressedCount, 13);

// Excluding a route area removes its files, and the cross-file rules recompute:
// "shared-menu" now spans two areas instead of three, and the typo that pointed
// at it disappears with the file that contained it.
const narrowed = await analyzeProject(fixture('storefront'), { exclude: ['app/admin/**'] });
assert.equal(narrowed.filesScanned, 24);
assert.deepEqual(narrowed.summary, { error: 2, warning: 7, info: 17 });
assert.deepEqual(sites(narrowed, 'NCT003'), ['app/(marketing)/home/data.ts:7', 'app/(shop)/products/data.ts:8']);
assert.ok(narrowed.findings.filter(f => f.code === 'NCT003').every(f => f.message.includes('route areas home, products;')));
assert.equal(tagCounts(narrowed.graph.producers)['shared-menu'], 2);
assert.equal(narrowed.suppressedCount, 1);

// A different analysis configuration must invalidate a baseline rather than
// silently compare against an unrelated scan.
assert.notEqual(storefront.analysisSignature, narrowed.analysisSignature);
assert.throws(() => applyBaseline(narrowed, createBaseline(storefront)), /incompatible with this tool, schema or analysis configuration/);

console.log('fixtures/storefront: cacheComponents, rule and exclusion overrides each change only their own findings.');

/* ================================================================== */
/* 3. fixtures/legacy-js — JavaScript, jsconfig aliases, flag off      */
/* ================================================================== */

const legacy = await analyzeProject(fixture('legacy-js'));
assert.equal(legacy.filesScanned, 4);
assert.deepEqual(legacy.summary, { error: 1, warning: 2, info: 1 });
assert.deepEqual(legacy.config, { enabled: false, file: 'next.config.js', reason: 'Statically inspected exported config object' });
assert.deepEqual(counts(legacy), { NCT001: 1, NCT004: 1, NCT005: 1, NCT006: 1 });
// Only the .jsx file holds a directive site, so it alone carries NCT004.
assert.deepEqual(sites(legacy, 'NCT004'), ['src/components/panel.jsx:5']);
assert.deepEqual(sites(legacy, 'NCT001'), ['src/actions.mjs:7']);
// The jsconfig "~/*" alias resolves across .js, .jsx and .mjs files.
assert.deepEqual(tagCounts(legacy.graph.producers), { 'legacy:menu': 2 });
assert.deepEqual([legacy.coverage.literalProducers, legacy.coverage.resolvedProducers], [0, 2]);

console.log('fixtures/legacy-js: CommonJS config read, jsconfig alias resolved across js/jsx/mjs, Cache Components reported off.');

/* ================================================================== */
/* 4. fixtures/dynamic-config — the flag cannot be determined          */
/* ================================================================== */

const dynamic = await analyzeProject(fixture('dynamic-config'));
assert.equal(dynamic.config.enabled, null);
assert.equal(dynamic.config.file, 'next.config.mjs');
assert.deepEqual(counts(dynamic), { NCT901: 1 });
assert.deepEqual(sites(dynamic, 'NCT901'), ['app/data.ts:4']);
// Undetermined is not the same as disabled: NCT004 must not be invented.
assert.equal(sites(dynamic, 'NCT004').length, 0);
// An explicit override replaces the guess instead of arguing with it.
const forced = await analyzeProject(fixture('dynamic-config'), { cacheComponents: true });
assert.deepEqual(forced.config, { enabled: true, file: null, reason: 'Explicit analyzer override' });
assert.deepEqual(counts(forced), {});

console.log('fixtures/dynamic-config: a spread export stays undetermined and is never reported as disabled.');

/* ================================================================== */
/* 5. fixtures/broken — a syntax error stops inference, not the scan   */
/* ================================================================== */

const broken = await analyzeProject(fixture('broken'));
assert.deepEqual(broken.summary, { error: 1, warning: 0, info: 2 });
assert.deepEqual(sites(broken, 'NCT902'), ['app/tags.ts:6']);
assert.equal(broken.coverage.parseErrors, 1);
// The consumer still parses, but nothing is proven from the unparseable module.
assert.deepEqual(sites(broken, 'NCT900'), ['app/data.ts:7']);
assert.equal(broken.graph.producers.length, 0);
assert.throws(() => createBaseline(broken), /Fix source parse errors before creating a baseline/);

console.log('fixtures/broken: the parse error is reported, no tag is inferred from it, and a baseline is refused.');

/* ================================================================== */
/* 6. fixtures/limits — tag length and tag count, at the boundary      */
/* ================================================================== */

const limits = await analyzeProject(fixture('limits'));
assert.equal(limits.filesScanned, 6);
assert.deepEqual(limits.summary, { error: 0, warning: 3, info: 3 });
assert.deepEqual(counts(limits), { NCT005: 3, NCT007: 2, NCT008: 1 });

// 130 resolvable tags in one call is over the limit and is counted exactly.
assert.deepEqual(sites(limits, 'NCT008'), ['app/search/data.ts:6']);
assert.ok(message(limits, 'NCT008', 'app/search/data.ts').includes('130 resolved tags'));
// A tag of exactly 256 units is the largest supported one and is never flagged.
assert.ok(limits.graph.producers.some(p => p.tag.length === 256));
assert.ok(!sites(limits, 'NCT007').some(s => s.startsWith('app/search/edge.ts')));
// 300 units is over the limit, on the producer and the invalidation side alike.
assert.deepEqual(sites(limits, 'NCT007'), ['app/search/actions.ts:7', 'app/search/mixed.ts:8']);
assert.ok(limits.findings.filter(f => f.code === 'NCT007').every(f => f.message.includes('300 UTF-16 code units')));
// The same call carries 131 tags, but one is oversized, so the count is not
// trusted and NCT008 is withheld rather than reported on shaky evidence.
assert.ok(!sites(limits, 'NCT008').some(s => s.startsWith('app/search/mixed.ts')));
assert.equal(limits.graph.producers.length, 262);

console.log('fixtures/limits: 128-tag and 256-unit limits verified at and past the boundary, including the withheld count.');

/* ================================================================== */
/* 7. fixtures/nested-guard — two applications are never merged        */
/* ================================================================== */

await assert.rejects(analyzeProject(fixture('nested-guard')), /Nested Next\.js app found at/);
// Each application audits cleanly on its own.
const inner = await analyzeProject(join(fixture('nested-guard'), 'apps', 'site'));
assert.deepEqual(tagCounts(inner.graph.producers), { 'nested:site': 1 });

console.log('fixtures/nested-guard: a nested application is refused, and the inner root still audits on its own.');

/* ================================================================== */
/* 8. the testbed is read-only, and the reports render                 */
/* ================================================================== */

assert.deepEqual(await hashes(testbed), before, 'Testbed sources must remain unchanged');

const out = join(packageRoot, 'artifacts');
await mkdir(out, { recursive: true });
for (const [name, report] of [['ayaz', ayaz], ['storefront', storefront]]) {
  for (const [extension, formatter] of [['json', formatJson], ['html', formatHtml], ['sarif', formatSarif], ['md', formatMarkdown]]) {
    const rendered = formatter(report);
    assert.ok(rendered.length > 0);
    if (extension === 'sarif') JSON.parse(rendered);
    if (extension === 'html') assert.ok(!/<script/i.test(rendered), 'HTML reports must never contain script tags');
    await writeFile(join(out, 'testbed-' + name + '.' + extension), rendered);
  }
}

console.log('Testbed sources unchanged; reports written to ' + join(out, 'testbed-{ayaz,storefront}.{html,json,sarif,md}'));
