/*
 * Owner decisions 139, 140 and 142 (04/11/2026): live blocks turn on BY DEFAULT on the PC, through the PC host only
 * (FORMA-BLOCCHI-VIVI-DI-SERIE-2026-11-04.md, A.1-A.3: `catalogoBlocchiDaAmbiente` becomes `{ clic: true }` unless
 * TALOS_CATALOGO_BLOCCHI=0, and the registry asks its host for a function). The kernel keeps `null` by default, and the CLI 0.7.0 stays
 * at `null`: a terminal cannot draw a block, so a catalog in its system prompt would make the model answer in a form nobody sees.
 * These pins hold the CLI side whatever the PC host does: the CLI never passes a catalog (empty environment or not), never calls the
 * PC's environment reader, and every catalog parameter the kernel's registry takes still defaults to `null`.
 * Hermes keeps its rich-output hints per platform (agent/prompt_builder.py PLATFORM_HINTS: the CLI hint asks for plain text a terminal
 * can show); Node docs, node:test «test runner» for the module mocks in the same shape as composition.test.ts.
 */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {composeTalosRuntime} from '../../src/runtime/talos-composition.ts';

const CLI_SRC=fileURLToPath(new URL('../../src/',import.meta.url));
const REGISTRY=readFileSync(new URL('../../../harness-ui/src/session-registry.mjs',import.meta.url),'utf8');
const KERNEL=readFileSync(new URL('../../../harness-ui/src/kernel/talosHarness.mjs',import.meta.url),'utf8');
const sources=(dir:string):string[]=>readdirSync(dir).flatMap((name)=>{const p=join(dir,name);return statSync(p).isDirectory()?sources(p):/\.(ts|tsx|mjs|js)$/.test(name)?[p]:[];});
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

test('the CLI gives its registry no block catalog, with an empty environment or with the switch on',async()=>{
  const envs:Record<string,string>[]=[{},{TALOS_CATALOGO_BLOCCHI:'1'},{TALOS_CATALOGO_BLOCCHI:'0'}];
  for(const env of envs){
    const opts=await compose(env);
    assert.ok(opts,'the registry was created');
    const keys=Object.keys(opts).filter((k)=>/^catalogoBlocchi/i.test(k)&&opts[k]!=null);
    assert.deepEqual(keys,[],`no catalog with ${JSON.stringify(env)}`);
  }
});

test('no CLI source reads or passes the catalog, nor names the block fence',()=>{
  const hits=sources(CLI_SRC).filter((f)=>/catalogoBlocchi|talos-blocco|prompt-del-catalogo/.test(readFileSync(f,'utf8')));
  assert.deepEqual(hits,[]);
});

test('every catalog parameter of the kernel registry still defaults to null (pinned)',()=>{
  const start=REGISTRY.indexOf('export function createSessionRegistry({');
  assert.ok(start>0);
  const head=REGISTRY.slice(start,REGISTRY.indexOf('}) {',start));
  const params=[...head.matchAll(/^\s*(catalogoBlocchi\w*)\s*=\s*([^,\n]+),/gm)].map((m)=>[m[1],m[2].trim()]);
  assert.ok(params.length>=1,'the registry still takes a catalog parameter');
  for(const [name,value] of params)assert.equal(value,'null',`${name} defaults to null`);
  assert.match(KERNEL,/catalogoBlocchi = null,/);
});
