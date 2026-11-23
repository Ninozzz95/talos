/*
 * ASYNC phase, step 7 (owner 01/10). The delegated agents' limits and defaults are configurable, as Codex's
 * `agents.max_concurrent_threads_per_session`, `agents.max_depth`, `agents.default_subagent_model` and
 * `agents.default_subagent_reasoning_effort` (core/src/config/mod.rs:3845-3870). Owner's decisions: 1–32 agents at once
 * and depth 1–4 (defaults unchanged, 10 and 2, the kernel's); a value out of range is refused by name, never clamped; only
 * the person sets them — a repository's `.talos-cli/config.json` is ignored with a notice, like reasoningEffort, because a
 * cloned repository must not raise what the person spends.
 */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {loadEffectiveConfig} from '../../src/config/load.ts';
import {resolveCliPaths,ensureCliPaths} from '../../src/paths.ts';
import {AGENTS_MAX_CONCURRENT_RANGE,AGENTS_MAX_DEPTH_RANGE} from '../../src/config/types.ts';
import {kernelDelegationOptions} from '../../src/runtime/agents-options.ts';

async function fixture(run:(x:{user:(value:unknown)=>void;repo:(value:unknown)=>void;effective:()=>ReturnType<typeof loadEffectiveConfig>})=>Promise<void>){
  const root=mkdtempSync(path.join(tmpdir(),'async7-config-'));
  try{
    const env={APPDATA:path.join(root,'a'),LOCALAPPDATA:path.join(root,'l'),XDG_CONFIG_HOME:path.join(root,'c'),XDG_STATE_HOME:path.join(root,'s'),XDG_CACHE_HOME:path.join(root,'k')};
    const paths=resolveCliPaths(env as any,process.platform,root);await ensureCliPaths(paths);
    const project=path.join(root,'repo');mkdirSync(path.join(project,'.talos-cli'),{recursive:true});
    await run({
      user:value=>writeFileSync(path.join(paths.configRoot,'config.json'),JSON.stringify(value)),
      repo:value=>writeFileSync(path.join(project,'.talos-cli','config.json'),JSON.stringify(value)),
      effective:()=>loadEffectiveConfig({paths,projectRoot:project}),
    });
  }finally{rmSync(root,{recursive:true,force:true});}
}

test('ASYNC 7: agents.* from the person\'s configuration, within the owner\'s ranges',async()=>fixture(async({user,effective})=>{
  assert.deepEqual([AGENTS_MAX_CONCURRENT_RANGE,AGENTS_MAX_DEPTH_RANGE],[[1,32],[1,4]]);
  user({version:2});
  assert.equal((await effective()).value.agents,undefined,'nothing set: the kernel\'s defaults');
  user({version:2,agents:{maxConcurrent:32,maxDepth:4,model:'openrouter:qwen/qwen3-coder',reasoningEffort:'low'}});
  assert.deepEqual((await effective()).value.agents,{maxConcurrent:32,maxDepth:4,model:'openrouter:qwen/qwen3-coder',reasoningEffort:'low'});
  user({version:2,agents:{maxConcurrent:1,maxDepth:1}});
  assert.deepEqual((await effective()).value.agents,{maxConcurrent:1,maxDepth:1});
  for(const [agents,code] of [
    [{maxConcurrent:0},'CONFIG_INVALID_AGENTS_MAX_CONCURRENT'],
    [{maxConcurrent:33},'CONFIG_INVALID_AGENTS_MAX_CONCURRENT'],
    [{maxConcurrent:2.5},'CONFIG_INVALID_AGENTS_MAX_CONCURRENT'],
    [{maxConcurrent:'10'},'CONFIG_INVALID_AGENTS_MAX_CONCURRENT'],
    [{maxDepth:0},'CONFIG_INVALID_AGENTS_MAX_DEPTH'],
    [{maxDepth:5},'CONFIG_INVALID_AGENTS_MAX_DEPTH'],
    [{model:''},'CONFIG_INVALID_AGENTS_MODEL'],
    [{model:'no-provider'},'CONFIG_INVALID_AGENTS_MODEL'],
    [{reasoningEffort:'turbo'},'CONFIG_INVALID_AGENTS_REASONING_EFFORT'],
    [{threads:4},'CONFIG_INVALID_AGENTS'],
    [[],'CONFIG_INVALID_AGENTS'],
  ] as const){user({version:2,agents});await assert.rejects(effective(),new RegExp(`^Error: ${code}$`,'u'),JSON.stringify(agents));}
}));

test('ASYNC 7: a repository cannot set agents.* — ignored, with a notice that says where to set it',async()=>fixture(async({user,repo,effective})=>{
  user({version:2,agents:{maxConcurrent:4}});
  repo({version:2,agents:{maxConcurrent:32,maxDepth:4,model:'openrouter:expensive/model'}});
  const loaded=await effective();
  assert.deepEqual(loaded.value.agents,{maxConcurrent:4},'the person\'s value stays; the repository\'s is not used');
  const notice=loaded.ignored.find(row=>row.code==='PROJECT_AGENTS_IGNORED');
  assert.equal(notice?.path,'agents');
  assert.match(notice!.message,/repository configuration cannot raise what delegated agents spend; use user or project-user configuration/u);
}));

test('ASYNC 7: the kernel receives the limits and the child defaults only when set',()=>{
  assert.deepEqual(kernelDelegationOptions(undefined),{},'nothing set: the kernel keeps its own (no parameter at all)');
  assert.deepEqual(kernelDelegationOptions({}),{});
  assert.deepEqual(kernelDelegationOptions({maxConcurrent:16}),{limitiDelega:{figliConcorrenti:16}});
  assert.deepEqual(kernelDelegationOptions({maxDepth:3}),{limitiDelega:{profondita:3}});
  assert.deepEqual(kernelDelegationOptions({model:'openrouter:m'}),{figlioDefault:{modello:'openrouter:m'}});
  assert.deepEqual(kernelDelegationOptions({reasoningEffort:'high'}),{figlioDefault:{reasoning:{effort:'high'}}});
  assert.deepEqual(kernelDelegationOptions({maxConcurrent:2,maxDepth:1,model:'openrouter:m',reasoningEffort:'low'}),
    {limitiDelega:{figliConcorrenti:2,profondita:1},figlioDefault:{modello:'openrouter:m',reasoning:{effort:'low'}}});
});
