/*
 * 14/10/2026, owner: a question of the model that nobody answers in time does NOT stop the turn in the CLI. The kernel registry
 * stops it by default (decision 9 of 24/09, still the desktop's default); the CLI hands it `domandaScadutaFerma: false`, so the
 * model is told the person did not answer and goes on with its own judgment, saying what it assumed.
 */
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {fileURLToPath} from 'node:url';
import {composeTalosRuntime} from '../../src/runtime/talos-composition.ts';
import {t} from '../../src/i18n/index.ts';

const REPO_ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const roots:string[]=[];
after(async()=>{for(const directory of roots)await rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
function pathsUnder(root:string){return{configRoot:join(root,'config'),dataRoot:join(root,'data'),cacheRoot:join(root,'cache'),sessionsRoot:join(root,'data','sessions'),logsRoot:join(root,'data','logs'),projectOverridesRoot:join(root,'data','projects'),queueRoot:join(root,'data','queues'),trust:{hooks:join(root,'trust','hooks'),mcp:join(root,'trust','mcp'),plugins:join(root,'trust','plugins'),projects:join(root,'trust','projects')}};}

test('the composed CLI asks the kernel registry not to stop the turn when a question expires',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-question-expiry-'));roots.push(root);
  let registryOpts:any=null;
  const modules:any={
    createProviderCredentialStore:()=>({loadFromKeyring(){},getKey:()=>'k',getRuntime:()=>({}),hasKey:()=>true}),
    createOwnerRuntimeAdapter:()=>({talosLavora:async()=>({}),attrezziKernel:async()=>({base:[],estesi:[]})}),
    avviaSessione:async()=>({}),
    eseguiComandoDiretto:async()=>({ok:true}),
    STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),
    createSessionRegistry:(o:any)=>{registryOpts=o;return{ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:()=>({sessionId:'s'}),iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({ok:true})};},
  };
  await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:REPO_ROOT,paths:pathsUnder(root) as any,model:'m',env:{},modules,keyring:null});
  assert.equal(registryOpts?.domandaScadutaFerma,false);
});

test('the screen says the model went on, not that the turn stopped',()=>{
  const text=t('screen.question.expired');
  assert.doesNotMatch(text,/stopped/u);
  assert.match(text,/went on/u);
});
