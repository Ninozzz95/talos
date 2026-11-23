/*
 * 0.6.11, owner 20/10/2026 («Sì, accendilo di serie», after the measure in test/acceptance/m01-deferred-tools.measure.ts): the CLI
 * hands the kernel registry `attrezziDifferiti: true`, so the tools used only on request leave the first list and stay reachable
 * through the bridge (ponte-attrezzi.mjs). The kernel's own default is off; `TALOS_ATTREZZI_DIFFERITI=0` turns it off in the CLI.
 */
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {fileURLToPath} from 'node:url';
import {composeTalosRuntime} from '../../src/runtime/talos-composition.ts';

const REPO_ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const roots:string[]=[];
after(async()=>{for(const directory of roots)await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
function pathsUnder(root:string){return{configRoot:join(root,'config'),dataRoot:join(root,'data'),cacheRoot:join(root,'cache'),sessionsRoot:join(root,'data','sessions'),logsRoot:join(root,'data','logs'),projectOverridesRoot:join(root,'data','projects'),queueRoot:join(root,'data','queues'),trust:{hooks:join(root,'trust','hooks'),mcp:join(root,'trust','mcp'),plugins:join(root,'trust','plugins'),projects:join(root,'trust','projects')}};}

async function registryOptionsWith(env:Record<string,string>){
  const root=await mkdtemp(join(tmpdir(),'talos-deferred-tools-'));roots.push(root);
  let registryOpts:any=null;
  const modules:any={
    createProviderCredentialStore:()=>({loadFromKeyring(){},getKey:()=>'k',getRuntime:()=>({}),hasKey:()=>true}),
    createOwnerRuntimeAdapter:()=>({talosLavora:async()=>({}),attrezziKernel:async()=>({base:[],estesi:[]})}),
    avviaSessione:async()=>({}),
    eseguiComandoDiretto:async()=>({ok:true}),
    STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),
    createSessionRegistry:(o:any)=>{registryOpts=o;return{ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:()=>({sessionId:'s'}),iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({ok:true})};},
  };
  await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:REPO_ROOT,paths:pathsUnder(root) as any,model:'m',env,modules,keyring:null});
  return registryOpts;
}

test('the composed CLI turns the kernel\'s deferred tools on by default',async()=>{
  assert.equal((await registryOptionsWith({}))?.attrezziDifferiti,true);
});

test('TALOS_ATTREZZI_DIFFERITI=0 turns them off; any other value leaves them on',async()=>{
  assert.equal((await registryOptionsWith({TALOS_ATTREZZI_DIFFERITI:'0'}))?.attrezziDifferiti,false);
  assert.equal((await registryOptionsWith({TALOS_ATTREZZI_DIFFERITI:'1'}))?.attrezziDifferiti,true);
});

/* 0.6.12 (bugfixer's review 4, S2) turned the registry's end-of-turn summary off, because the bare kernel never read it; 0.6.13 loads
   the desktop's adapter, which does, and leaves it on for the screen; review 1 of 0.6.13 (S2-1, owner «Spento solo in -p») keeps
   it off with nobody at the screen, as this composition is (test/runtime/desktop-adapter-wiring.test.ts covers both). */
test('the composed CLI with nobody at the screen does not start the end-of-turn summary',async()=>{
  assert.equal((await registryOptionsWith({}))?.riassuntoDiFineGiro,false);
});

/* 0.6.12 (owner 21/10/2026, «Spento per Gemini»; r4 bb41e9d4a): with the bridge on, the kernel registry sends Gemini direct the
   full list (session-registry.mjs FORNITORE_SENZA_PONTE). It decides by the provider id, so the id it names must be the one the
   CLI offers for Gemini direct: a rename on either side would switch the rule off without a word. OpenRouter keeps the bridge. */
test('the provider the kernel keeps off the bridge is the CLI\'s own Gemini direct',async()=>{
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(join(REPO_ROOT,'harness-ui','src','session-registry.mjs'),'utf8');
  const named=/const FORNITORE_SENZA_PONTE = '([^']+)'/u.exec(source)?.[1];
  assert.equal(named,'gemini','the kernel names the provider it keeps off the bridge');
  assert.match(source,/providerEffettivo === FORNITORE_SENZA_PONTE \|\| String\(modelloEffettivo \?\? ''\)\.startsWith\(`\$\{FORNITORE_SENZA_PONTE\}:`\) \? false : attrezziDifferiti/u,'the rule reads the provider and the model prefix, and gives false');
  const {pathToFileURL}=await import('node:url');
  const registry:any=await import(pathToFileURL(join(REPO_ROOT,'harness-ui','src','provider-registry.mjs')).href);
  /* the desktop's review of 0.6.12: read the registry's own list and record, not a string search of the whole module */
  assert.ok(registry.ID_FORNITORI.includes('gemini'),'the provider registry the CLI uses has a provider with id gemini');
  assert.equal(registry.fornitore('gemini').wire,'gemini','and it is Gemini direct (its own wire), not a compatible endpoint');
});
