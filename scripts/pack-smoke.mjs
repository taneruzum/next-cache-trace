import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root=resolve('.');
const temp=await mkdtemp(join(tmpdir(),'nct-pack-'));
const npm=process.env.npm_execpath;
if (!npm) throw new Error('Run via npm run test:pack');
function command(args,cwd=temp) {
  const r=spawnSync(process.execPath,[npm,...args],{cwd,encoding:'utf8',timeout:180000});
  if(r.status!==0) throw new Error(r.error?.message || r.stderr || r.stdout);
  return r.stdout;
}
try {
  const core=JSON.parse(command(['pack','--json','--ignore-scripts','--pack-destination',temp],root))[0];
  const plugin=JSON.parse(command(['pack','--workspace','eslint-plugin-next-cache-trace','--json','--ignore-scripts','--pack-destination',temp],root))[0];
  assert.ok(core.files.some(f=>f.path==='dist/index.d.ts'));
  assert.ok(!core.files.some(f=>f.path.startsWith('tests/') || f.path.startsWith('node_modules/')));
  const manifest=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
  await writeFile(join(temp,'package.json'),JSON.stringify({private:true,type:'module'}));
  command(['install','--ignore-scripts','--no-audit','--no-fund',join(temp,core.filename),join(temp,plugin.filename),'eslint@'+manifest.devDependencies.eslint]);
  await mkdir(join(temp,'app'));
  await writeFile(join(temp,'app','action.js'),"import {updateTag} from 'next/cache'; updateTag('missing');");
  const installed=join(temp,'node_modules','next-cache-trace','bin','next-cache-trace.js');
  const cli=spawnSync(process.execPath,[installed,'audit',temp,'--format','json'],{encoding:'utf8'});
  assert.equal(cli.status,0,cli.stderr);
  assert.equal(JSON.parse(cli.stdout).summary.warning,1);
  const viaBin=JSON.parse(command(['exec','--offline','--','next-cache-trace','audit',temp,'--format','json']));
  assert.equal(viaBin.summary.warning,1);
  const consumerTypes=join(temp,'consumer.ts');
  await writeFile(consumerTypes,"import {analyzeProject, type Report} from 'next-cache-trace'; const report: Promise<Report> = analyzeProject('.'); void report;");
  const typecheck=spawnSync(process.execPath,[join(temp,'node_modules','typescript','bin','tsc'),'--noEmit','--skipLibCheck','--module','NodeNext','--target','ES2022',consumerTypes],{cwd:temp,encoding:'utf8'});
  assert.equal(typecheck.status,0,typecheck.stdout+typecheck.stderr);
  // Resolve both public exports from a fresh consumer, not the development source tree.
  const check=spawnSync(process.execPath,['--input-type=module','-e',"import {analyzeProject} from 'next-cache-trace'; import plugin from 'eslint-plugin-next-cache-trace'; import {Linter} from 'eslint'; if(typeof analyzeProject!=='function')process.exit(1); const l=new Linter(); const messages=l.verify(\"import {cookies} from 'next/headers'; async function a(){'use cache';cookies();}\",[plugin.configs.recommended]); if(!messages.some(m=>m.ruleId==='next-cache-trace/NCT002'))process.exit(2);"],{cwd:temp,encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);
  console.log('Clean consumer smoke passed: main tarball, TypeScript consumer, installed bin, CLI, plugin export and ESLint rule.');
} finally { await rm(temp,{recursive:true,force:true}); }
