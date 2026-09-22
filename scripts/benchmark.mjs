import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { analyzeProjectSync } from '../dist/index.js';

const sizes = process.argv.slice(2).map(Number);
for (const size of sizes.length ? sizes : [100, 1000, 5000]) {
  if (!Number.isInteger(size) || size < 1 || size > 10000) throw new Error('Size must be 1..10000');
  const root = await mkdtemp(join(tmpdir(), 'nct-benchmark-'));
  try {
    await mkdir(join(root, 'app'));
    await writeFile(join(root, 'next.config.mjs'), 'export default {cacheComponents:true}');
    for (let i = 0; i < size; i++) await writeFile(join(root, 'app', `data-${i}.ts`),
      `import {cacheTag,cacheLife,updateTag} from 'next/cache'; export async function data(){'use cache';cacheLife('hours');cacheTag('tag-${i}')} updateTag('tag-${i}');`);
    const start = performance.now();
    const first = analyzeProjectSync(root);
    const middle = performance.now();
    const second = analyzeProjectSync(root);
    const end = performance.now();
    if (first.findings.length || second.findings.length || first.filesScanned !== size) throw new Error('Unexpected benchmark findings');
    console.log(JSON.stringify({files:size,coldMs:Math.round(middle-start),warmMs:Math.round(end-middle),peakRssMiB:Math.round(process.resourceUsage().maxRSS/1024),node:process.version}));
  } finally {
    if (resolve(root).startsWith(resolve(tmpdir()) + '\\nct-benchmark-') || resolve(root).startsWith(resolve(tmpdir()) + '/nct-benchmark-')) await rm(root,{recursive:true,force:true});
  }
}
