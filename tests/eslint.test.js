import test from 'node:test';
import assert from 'node:assert/strict';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import plugin from '../dist/eslint.js';
import { fixture, cacheImports, headerImports } from './helpers.js';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';

function lint(text, settings={}, filename='app/data.tsx', preset='recommended', cwd=process.cwd()) {
  const linter=new Linter({cwd});
  return linter.verify(text, [{files:['**/*.{ts,tsx,js}'], languageOptions:{parser:tseslint.parser}, ...plugin.configs[preset], settings:{'next-cache-trace':settings}}], {filename});
}
test('ESLint catches a TypeScript request API violation at the same location', () => {
  const messages=lint(cacheImports+headerImports+"export async function a(id:string){'use cache';cacheLife('hours');await cookies();return <div>{id}</div>}");
  assert.equal(messages.length,1,JSON.stringify(messages));
  assert.equal(messages[0].ruleId,'next-cache-trace/NCT002');
  assert.equal(messages[0].line,3);
  assert.equal(messages[0].severity,2);
});
test('recommended config does not invent file-local orphan warnings', () => {
  assert.equal(lint(cacheImports+"updateTag('external');").length,0);
});
test('ESLint supports standard disable comments', () => {
  const messages=lint(headerImports+"async function a(){'use cache';\n// eslint-disable-next-line next-cache-trace/NCT002\ncookies();}");
  assert.ok(!messages.some(m=>m.ruleId==='next-cache-trace/NCT002'));
});
test('project preset connects files and observes edited producers', async t => {
  const root=await fixture(t, {'next.config.ts':'export default {cacheComponents:true}', 'app/producer.ts':cacheImports+"async function p(){'use cache';cacheLife('hours');cacheTag('x')}", 'app/action.ts':cacheImports+"updateTag('x')"});
  const text=cacheImports+"updateTag('x');updateTag('missing');";
  const filename=join(root,'app/action.ts');
  let messages=lint(text,{projectRoot:root},filename,'project',root);
  assert.equal(messages.filter(m=>m.ruleId==='next-cache-trace/NCT001').length,1,JSON.stringify(messages));
  await writeFile(join(root,'app/producer.ts'),cacheImports+"async function p(){'use cache';cacheLife('hours');cacheTag('x','missing')}");
  messages=lint(text,{projectRoot:root},filename,'project',root);
  assert.equal(messages.length,0,JSON.stringify(messages));
});
test('explicit ESLint cacheComponents override enables configuration diagnostics', () => {
  const messages=lint(cacheImports+"async function a(){'use cache';cacheLife('hours');}",{cacheComponents:false},'app/x.ts','project');
  assert.ok(messages.some(m=>m.ruleId==='next-cache-trace/NCT004'));
});
