import assert from 'node:assert/strict';import test from 'node:test';import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {runConfigCommand} from '../../src/commands/config-cli.ts';
function p(r:string){return{configRoot:join(r,'c'),dataRoot:join(r,'d'),cacheRoot:join(r,'ca'),sessionsRoot:join(r,'d','s'),logsRoot:join(r,'d','l'),projectOverridesRoot:join(r,'d','p'),trust:{hooks:join(r,'th'),mcp:join(r,'tm'),plugins:join(r,'tp'),projects:join(r,'tpr')}};}
function ctx(r:string,out:string[]){return{invocation:{outputFormat:'json'} as any,io:{writeOut:(s:string)=>out.push(s),writeErr() {},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},projectRoot:join(r,'repo'),paths:p(r),repoRoot:r,createRuntimeContext:async()=>{throw new Error('no runtime')}} as any;}
test('config cli sets and retrieves json value',async()=>{const r=await mkdtemp(join(tmpdir(),'talos-clicfg-'));const out:string[]=[];const c=ctx(r,out);assert.equal(await runConfigCommand(c,['set','ui.theme','"mono"','--scope','user']),0);out.length=0;await runConfigCommand(c,['get','ui.theme']);assert.equal(JSON.parse(out[0]!), 'mono');});


test('M2-D config CLI refuses repository-scoped keymap writes but accepts user and project-user',async()=>{
  const r=await mkdtemp(join(tmpdir(),'talos-clicfg-keymap-'));const out:string[]=[];const c=ctx(r,out);
  await assert.rejects(
    ()=>runConfigCommand(c,['set','ui.keymap.model-picker','["Alt+M"]','--scope','project']),
    /CONFIG_KEYMAP_SCOPE_INVALID/u,
  );
  assert.equal(await runConfigCommand(c,['set','ui.keymap.model-picker','["Alt+M"]','--scope','user']),0);
  assert.equal(await runConfigCommand(c,['set','ui.keymap.provider-picker','["Ctrl+P"]','--scope','project-user']),0);
});


test('M2-E config CLI exposes explicit migrate and rollback operations',async()=>{
  const r=await mkdtemp(join(tmpdir(),'talos-clicfg-migrate-'));const out:string[]=[];const c=ctx(r,out);
  await mkdir(c.paths.configRoot,{recursive:true});
  await writeFile(join(c.paths.configRoot,'config.json'),'{"ui":{"theme":"dark"}}\n');
  assert.equal(await runConfigCommand(c,['migrate','--scope','user']),0);
  assert.equal(JSON.parse(out.at(-1)!).toVersion,2);/* R5b D4 (Q-R5-14): config v2 */
  assert.equal(JSON.parse(out.at(-1)!).changed,true);
  out.length=0;
  assert.equal(await runConfigCommand(c,['rollback','--scope','user']),0);
  assert.equal(JSON.parse(out.at(-1)!).restored,true);
});
