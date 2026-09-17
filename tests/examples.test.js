import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeProject } from '../dist/index.js';

test('buildable Next example has a complete literal tag relationship', async () => {
  const r=await analyzeProject('examples/next16-blog');
  assert.equal(r.findings.length,0);
  assert.deepEqual(r.graph.producers.map(({tag,method,scope})=>({tag,method,scope})),[{tag:'posts',method:'cacheTag',scope:'getPosts'}]);
  assert.deepEqual(r.graph.invalidations.map(({tag,method,scope})=>({tag,method,scope})),[{tag:'posts',method:'updateTag',scope:'refreshPosts'}]);
  assert.equal(r.graph.boundaries.length,1);
});
test('intentional-risk example demonstrates all five rules', async () => {
  const r=await analyzeProject('examples/next16-cache-risks');
  assert.deepEqual([...new Set(r.findings.map(f=>f.code))].sort(),['NCT001','NCT002','NCT003','NCT004','NCT005']);
});
