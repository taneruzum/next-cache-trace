import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeProject, formatHtml, formatJson, formatSarif } from '../dist/index.js';

if (!process.argv[2]) throw new Error('Usage: npm run test:testbed -- /path/to/next-cache-testbed (the known external fixture only)');
const root = resolve(process.argv[2]);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function hashes(directory, prefix = '') {
  const result = {};
  for (const entry of (await readdir(directory, {withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    if (['node_modules','.git','.next'].includes(entry.name)) continue;
    const path = join(directory,entry.name), name = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(result, await hashes(path, name + '/'));
    else if (entry.isFile()) result[name] = createHash('sha256').update(await readFile(path)).digest('hex');
  }
  return result;
}
const before = await hashes(root);
const report = await analyzeProject(root);
assert.equal(report.filesScanned,15);
assert.deepEqual(report.summary,{error:1,warning:9,info:5});
assert.equal(report.suppressedCount,1);
assert.deepEqual([report.graph.producers.length,report.graph.invalidations.length,report.graph.boundaries.length],[7,5,7]);
assert.equal(report.findings.filter(f=>f.code==='NCT006').length,5);
assert.ok(report.findings.some(f=>f.code==='NCT001' && f.message.includes('"shared-menu" (app/admin/data.ts)')));
assert.ok(!report.findings.some(f=>f.code==='NCT001' && /orders\/actions|settings\/actions/.test(f.file)));
const legacy = await analyzeProject(root,{rules:{NCT006:'off'}});
assert.deepEqual(legacy.summary,{error:1,warning:4,info:5});
assert.equal(legacy.suppressedCount,6);
const disabled = await analyzeProject(root,{cacheComponents:false});
assert.deepEqual(disabled.summary,{error:7,warning:9,info:5});
const excluded = await analyzeProject(root,{exclude:['app/admin/**']});
assert.deepEqual(excluded.summary,{error:0,warning:3,info:5});
const quiet = await analyzeProject(root,{rules:{NCT900:'off'}});
assert.deepEqual(quiet.summary,{error:1,warning:9,info:1});
assert.equal(quiet.suppressedCount,5);
assert.deepEqual(await hashes(root),before,'Testbed source must remain unchanged');
const out = join(packageRoot,'artifacts');
await mkdir(out,{recursive:true});
// Explicitly replace only these generated smoke-test reports in our package.
for (const [extension, formatter] of [['json',formatJson],['html',formatHtml],['sarif',formatSarif]]) {
  await writeFile(join(out,'testbed-updated.'+extension),formatter(report));
}
console.log('External testbed passed: 15 files; 1 error, 9 warnings, 5 info; 1 suppressed.');
console.log('Five migration warnings and the shared-meny -> shared-menu hint verified.');
console.log('Graph, exclusions, suppression and disabled-config override verified; source hashes unchanged.');
console.log('Generated reports: ' + join(out,'testbed-updated.{html,json,sarif}'));
