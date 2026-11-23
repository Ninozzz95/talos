/* Startup stage 1 (owner 02/10): the screen is up before the kernel, so before the catalog answers the TUI must not take
   «not loaded yet» for «nothing configured». Found by the acceptance gate (02/10): the footer said «none · /provider» for a
   configured model (the approved mockup shows the model from the first frame, step-01-avvio-t0), and /model typed at once
   opened the provider setup (s38). */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {hermeticProfile,KEY,mountApp,sleep} from './r1-layout-fixture.ts';

function gatedCatalog(){
  let open!:()=>void;const gate=new Promise<void>(resolve=>{open=resolve;});
  const row={id:'openai:gpt-5-mini',provider:'openai',name:'gpt-5-mini',reasoning:false};
  const after=<T>(value:T)=>gate.then(()=>value);
  const catalog:any={
    chosenProvider:()=>after('openai'),listProviders:()=>after([{id:'openai',label:'OpenAI',description:'',configured:true,requiresKey:true,authType:'api-key',local:false,cloud:true,endpointHost:null,supportsEndpoint:false,supportsOAuth:false,execution:'cloud',keySource:'saved',environmentVariable:null,benched:null}]),
    listModels:()=>after([row]),readiness:()=>after({ready:true}),
    providerModels:()=>after({provider:'openai',label:'OpenAI',rows:[row],verified:true,notice:''}),
  };
  return{catalog,open};
}
function paths(root:string){return{dataRoot:join(root,'data'),configRoot:join(root,'config'),cacheRoot:join(root,'cache'),stateRoot:join(root,'state')};}

test('before the catalog answers, the footer shows the configured model, not «none · /provider»',async t=>{
  const restore=hermeticProfile();t.after(restore);
  const root=mkdtempSync(join(tmpdir(),'talos-before-catalog-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const {catalog,open}=gatedCatalog();t.after(open);
  const app=await mountApp({cols:100,rows:30,root,paths:paths(root),catalog,configuredModel:'openai:gpt-5-mini'});
  try{
    const screen=await app.settle();
    assert.doesNotMatch(screen.text,/none · \/provider/u,screen.text);
    assert.match(screen.text,/openai:gpt-5-mini/u);
  }finally{app.unmount();}
});

test('/model typed before the catalog answers waits for it, and does not open the provider setup',async t=>{
  const restore=hermeticProfile();t.after(restore);
  const root=mkdtempSync(join(tmpdir(),'talos-before-catalog-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const {catalog,open}=gatedCatalog();t.after(open);
  const app=await mountApp({cols:100,rows:30,root,paths:paths(root),catalog,configuredModel:'openai:gpt-5-mini'});
  try{
    for(const ch of '/model')app.press(ch);
    await app.waitFor('the typed command',s=>s.lines.some(line=>/^│ ›\s*\/model/u.test(line)));
    app.press(KEY.enter);
    await sleep(400);
    assert.doesNotMatch((await app.screen()).text,/│Provider/u,'the provider setup opened while the catalog was still loading');
    open();
    await app.waitFor('the model sheet',s=>/── Model /u.test(s.text));/* stage 7.10: the mockup's sheet */
  }finally{app.unmount();}
});
