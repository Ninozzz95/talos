/*
 * Owner decision 143 (04/11/2026): «Passi» (the steps list, FE-008) on by default ON THE PC, off with the setting or TALOS_PASSI=0. The
 * CLI's OK (11:26) has one condition, the same as for the live blocks: the PC host turns it on; the kernel registry's own default
 * (`listaPassi = false`) stays false. The CLI 0.7.0 has no steps view: with the list on, its model would get `steps_update` and the
 * stream the steps events with nothing to show them, and the cached prefix would change. These pins hold the CLI side: the CLI gives its
 * registry no `listaPassi` (empty environment, or TALOS_PASSI at 1 or 0), and the registry default stays false.
 * Hermes keeps its todo tool behind its own toolset switch (tools/todo_tool.py, registered in the "todo" toolset); Node docs, node:test.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {composeTalosRuntime} from '../../src/runtime/talos-composition.ts';

const REGISTRY=readFileSync(new URL('../../../harness-ui/src/session-registry.mjs',import.meta.url),'utf8');
const paths={configRoot:'/cli/config',dataRoot:'/cli/data',cacheRoot:'/cli/cache',sessionsRoot:'/cli/data/sessions',logsRoot:'/cli/data/logs',projectOverridesRoot:'/cli/config/projects',trust:{hooks:'/cli/data/trust/hooks',mcp:'/cli/data/trust/mcp',plugins:'/cli/data/trust/plugins',projects:'/cli/data/trust/projects'}};

const compose=async(env:Record<string,string>)=>{
  let registryOpts:any;
  const providerStore={loadFromKeyring(){},getKey:()=>'k',getRuntime:()=>({endpoint:'https://provider.invalid',timeoutSeconds:60}),hasKey:()=>true};
  const modules:any={createProviderCredentialStore:()=>providerStore,createOwnerRuntimeAdapter:()=>({talosLavora:async()=>({}),attrezziKernel:async()=>({base:[],estesi:[]})}),
    avviaSessione:async()=>({comeFinita:'concluso'}),verificaTrustPlugin:async()=>true,STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),
    createSessionRegistry:(o:any)=>{registryOpts=o;return{ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:()=>({sessionId:'s'}),iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({ok:true})};}};
  await composeTalosRuntime({repoRoot:'/repo',projectRoot:'/repo/p',paths:paths as any,model:'openai:gpt',env,modules});
  return registryOpts;
};

test('the CLI gives its registry no steps list, with an empty environment or with TALOS_PASSI set',async()=>{
  const envs:Record<string,string>[]=[{},{TALOS_PASSI:'1'},{TALOS_PASSI:'0'}];
  for(const env of envs){
    const opts=await compose(env);
    assert.ok(opts,'the registry was created');
    const keys=Object.keys(opts).filter((k)=>/passi/i.test(k)&&opts[k]!=null&&opts[k]!==false);
    assert.deepEqual(keys,[],`no steps with ${JSON.stringify(env)}`);
  }
});

test('the kernel registry keeps the steps list off by default (pinned)',()=>{
  const start=REGISTRY.indexOf('export function createSessionRegistry({');
  assert.ok(start>0);
  const head=REGISTRY.slice(start,REGISTRY.indexOf('} = {}) {',start));
  const params=[...head.matchAll(/^\s*(listaPassi\w*)\s*=\s*([^,\n]+),/gm)].map((m)=>[m[1],m[2].trim()]);
  assert.ok(params.length>=1,'the registry still takes a steps parameter');
  for(const [name,value] of params)assert.ok(value==='false'||value==='null',`${name} defaults to off (${value})`);
});
