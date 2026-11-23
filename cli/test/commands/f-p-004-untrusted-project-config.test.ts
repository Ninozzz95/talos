/*
 * F-P-004 (stress test of 0.5.0, 08/10/2026, reproduced 09/10 on the built CLI): in a project that is NOT trusted,
 * `config permissions dry-run` answered "deny · matched deny rule Write(x.txt)" and `config list` showed the rule among the
 * effective ones, while a real turn does not even start there (PROJECT_TRUST_REQUIRED). Owner 09/10/2026: «Escluse e dette
 * a parte (Consigliata)» — an untrusted project's settings are left out, and a line says how many rules and how to trust it.
 * Codex reads a project's config only when the project is trusted (docs «Config basics», project config layer).
 */
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {runConfigCommand} from '../../src/commands/config-cli.ts';
import {runProjectCommand} from '../../src/commands/project-cli.ts';

function paths(r:string){return{configRoot:join(r,'c'),dataRoot:join(r,'d'),cacheRoot:join(r,'ca'),sessionsRoot:join(r,'d','s'),logsRoot:join(r,'d','l'),projectOverridesRoot:join(r,'d','p'),trust:{hooks:join(r,'th'),mcp:join(r,'tm'),plugins:join(r,'tp'),projects:join(r,'tpr')}};}
function context(r:string,out:string[],err:string[],format:'json'|'text'){return{invocation:{outputFormat:format} as any,io:{writeOut:(s:string)=>out.push(s),writeErr:(s:string)=>err.push(s),stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},projectRoot:join(r,'repo'),paths:paths(r),repoRoot:r,createRuntimeContext:async()=>{throw new Error('no runtime');}} as any;}
async function hostileRepo(){
  const r=await mkdtemp(join(tmpdir(),'talos-fp004-'));
  await mkdir(join(r,'repo','.talos-cli'),{recursive:true});
  await writeFile(join(r,'repo','.talos-cli','config.json'),JSON.stringify({permissions:{deny:['Write(x.txt)']},ui:{theme:'mono'}}));
  return r;
}

test('F-P-004: an untrusted project\'s rules are not in the dry-run, and the dry-run says so',async()=>{
  const r=await hostileRepo();const out:string[]=[],err:string[]=[];
  assert.equal(await runConfigCommand(context(r,out,err,'text'),['permissions','dry-run','--tool','Write','--resource','x.txt']),0);
  const text=out.join('');
  assert.doesNotMatch(text,/Write\(x\.txt\)|matched deny rule/u,`the untrusted rule decided:\n${text}`);
  assert.match(text,/1 project rule not applied: this project is not trusted \(talos project trust\)/u,text);
  out.length=0;
  assert.equal(await runConfigCommand(context(r,out,err,'json'),['permissions','dry-run','--tool','Write','--resource','x.txt']),0);
  const json=JSON.parse(out.at(-1)!);
  assert.notEqual(json.effect,'deny');
  assert.deepEqual(json.untrustedProject,{rulesNotApplied:1,trustWith:'talos project trust'});
});

test('F-P-004: config list leaves an untrusted project\'s settings out, and says it on stderr',async()=>{
  const r=await hostileRepo();const out:string[]=[],err:string[]=[];
  assert.equal(await runConfigCommand(context(r,out,err,'json'),['list']),0);
  const value=JSON.parse(out.at(-1)!);
  assert.deepEqual(value.permissions.deny,[],'the rule is not effective');
  assert.notEqual(value.ui.theme,'mono','no setting of the untrusted project is effective');
  assert.match(err.join(''),/1 project rule not applied: this project is not trusted \(talos project trust\)/u);
});

test('F-P-004: once the project is trusted its rules apply again, and nothing is said',async()=>{
  const r=await hostileRepo();const out:string[]=[],err:string[]=[];
  const home=join(r,'home');await mkdir(home,{recursive:true});
  assert.equal(await runProjectCommand(context(r,[],[],'json'),['trust'],{homeDir:home}),0);
  assert.equal(await runConfigCommand(context(r,out,err,'json'),['permissions','dry-run','--tool','Write','--resource','x.txt']),0);
  const json=JSON.parse(out.at(-1)!);
  assert.equal(json.effect,'deny');
  assert.equal('untrustedProject' in json,false);
  out.length=0;
  assert.equal(await runConfigCommand(context(r,out,err,'json'),['list']),0);
  assert.deepEqual(JSON.parse(out.at(-1)!).permissions.deny,['Write(x.txt)']);
  assert.equal(err.join(''),'');
});
