/*
 * 0.6.6 — the kernel's scheduler as the CLI hosts it (automations/cli-scheduler.ts), on the kernel's real store: a run in a folder
 * that is not trusted never reaches the registry (the history says why); a run in a trusted one reaches it with «On request» and
 * its approvals answered by the CLI's engine; `runEnded` waits for the run's end as the store writes it.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {answerHostRequests,createCliAutomationScheduler,folderTrustCache} from '../../src/automations/cli-scheduler.ts';

const REPO=fileURLToPath(new URL('../../../',import.meta.url));
async function world(t:{after:(fn:()=>void)=>void}){
  const root=mkdtempSync(join(tmpdir(),'talos-auto-sched-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const mod:any=await import(new URL('../../../harness-ui/src/automation-store.mjs',import.meta.url).href);
  const store=mod.createAutomationStore({cartella:join(root,'automations')});
  const folder=mkdtempSync(join(root,'work-'));
  const auto=await store.crea({nome:'n',istruzioni:'say hi',cartella:folder,permessi:'Full access',pianificazione:{tipo:'manuale'}});
  const starts:any[]=[];let end!:(v:unknown)=>void;
  const registry:any={
    avviaGiroAutomazione:(input:any)=>{starts.push(input);return{sessionId:'s-auto',fine:new Promise(resolve=>{end=resolve;})};},
    iscriviti:()=>()=>{},rispondiApprovazione:()=>({}),statoGiroAutomazione:()=>'in-corso',
    leggiEsitoSessioneDiPasso:async()=>null,ferma:()=>{},
  };
  return{root,store,folder,auto,starts,registry,finish:(v:unknown)=>end(v)};
}
const paths=(root:string)=>({dataRoot:join(root,'data'),trust:{projects:join(root,'trust')}}) as any;

test('a folder that is not trusted: the run never reaches the registry, and the history says why',async t=>{
  const w=await world(t);
  const host=await createCliAutomationScheduler({repoRoot:REPO,paths:paths(w.root),registry:w.registry,store:w.store,assess:async()=>({trusted:false}) as any,engineFor:()=>({decide:async()=>({kind:'allow'})})});
  const result=await host.runNow(w.auto.id);
  assert.equal(result.ok,false);assert.equal(result.code,'PROJECT_TRUST_REQUIRED');
  assert.equal(w.starts.length,0,'nothing started');
  const runs=await w.store.giri(w.auto.id);assert.ok(runs.some((r:any)=>r.motivo==='PROJECT_TRUST_REQUIRED'),JSON.stringify(runs));
});

test('a trusted folder: the run starts with «On request», whatever the store keeps, and its end is waited for',async t=>{
  const w=await world(t);
  const host=await createCliAutomationScheduler({repoRoot:REPO,paths:paths(w.root),registry:w.registry,store:w.store,assess:async()=>({trusted:true}) as any,engineFor:()=>({decide:async()=>({kind:'allow'})})});
  const result=await host.runNow(w.auto.id);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(w.starts[0].permessi,'On request','«Full access» in the store is the CLI engine\'s to apply, not the kernel\'s');
  assert.equal(w.starts[0].cartella,w.folder);
  let ended=false;const waiting=host.runEnded(w.auto.id,result.runId).then(()=>{ended=true;});
  await new Promise(resolve=>setTimeout(resolve,700));assert.equal(ended,false,'still under way');
  w.finish({sessionId:'s-auto',esito:'succeeded',testoFinale:'All good.'});
  await waiting;assert.equal(ended,true);
  const runs=await w.store.giri(w.auto.id);assert.ok(runs.some((r:any)=>r.esito==='finita'),JSON.stringify(runs));
});

test('the trust cache: a folder not read is not trusted; a failing check is not trusted',async()=>{
  const cache=folderTrustCache();assert.equal(cache.isTrusted('C:/x'),false);
  await cache.refresh(['C:/a','C:/b'],'t',async({projectRoot})=>{if(projectRoot==='C:/b')throw new Error('broken');return{trusted:true} as any;});
  assert.equal(cache.isTrusted('C:/a'),true);assert.equal(cache.isTrusted('C:/b'),false);
});

/* the 0.6.6 review's F4: an entry of the old format switched on (by an older TALOS, or by hand) reaches the kernel's v1 path,
   which calls the registry's `avvia` with a catalog task: the CLI's registry refuses it, nothing starts */
test('an old-format entry switched on never starts a session',async t=>{
  const w=await world(t);let avvia=0;w.registry.avvia=()=>{avvia++;return{sessionId:'s-v1'};};
  const legacy=await w.store.crea({taskId:'catalog-task',intervalloMinuti:5});await w.store.imposta(legacy.id,true);
  const host=await createCliAutomationScheduler({repoRoot:REPO,paths:paths(w.root),registry:w.registry,store:w.store,assess:async()=>({trusted:true}) as any,engineFor:()=>({decide:async()=>({kind:'allow'})}),clock:()=>new Date(Date.now()+3_600_000)});
  await host.tick();
  assert.equal(avvia,0,'the registry\'s avvia is never reached');assert.equal(w.starts.length,0);
});

/* the 0.6.6 review's F1: the host answers the requests of the processes that do not host */
test('the host answers each request once: a run with what runNow said, a stop with what stopRun said, an error as a refusal',async()=>{
  const answered:any[]=[];const pending=[{requestId:'q1',op:'run',id:'a1'},{requestId:'q2',op:'stop',id:'a1'},{requestId:'q3',op:'run',id:'gone'},{requestId:'q4',op:'run',id:'broken'}];
  const host={runNow:async(id:string)=>id==='a1'?{ok:true,runId:'r',sessionId:'s'}:id==='gone'?null:(()=>{throw Object.assign(new Error('no store'),{code:'AUTOMATION_STORE_INVALID'});})(),stopRun:async()=>({ok:true,sessionId:'s'})};
  await answerHostRequests(host,{take:()=>pending.splice(0) as any,answer:(requestId:string,result:unknown)=>{answered.push([requestId,result]);}});
  /* a stop gets no answer: its asker waits on the store, and an answer nobody reads would stay on the disk (review N9) */
  assert.deepEqual(answered,[['q1',{ok:true,runId:'r',sessionId:'s'}],['q3',{ok:false,code:'AUTOMATION_NOT_FOUND'}],['q4',{ok:false,code:'AUTOMATION_STORE_INVALID',erroreAvvio:'no store'}]]);
});

/* the fifth review of 0.6.6: stopHere stops as the system (no wake with the agents' results), the agents and the runs */
test('stopHere stops this process\'s agents and runs as the system, never as the person',async t=>{
  const w=await world(t);const stops:any[]=[];w.registry.ferma=(sessionId:string,options:any)=>{stops.push([sessionId,options?.daChi]);};
  let sink:((raw:unknown)=>void)|null=null;w.registry.iscriviti=(_id:string,next:(raw:unknown)=>void)=>{sink=next;return()=>{};};
  const host=await createCliAutomationScheduler({repoRoot:REPO,paths:paths(w.root),registry:w.registry,store:w.store,assess:async()=>({trusted:true}) as any,engineFor:()=>({decide:async()=>({kind:'allow'})})});
  assert.equal((await host.runNow(w.auto.id)).ok,true);
  sink!({type:'CUSTOM',name:'talos.agenti',value:{childId:'s-child',parentId:'s-auto',reason:'created',agent:{}}});
  host.stopHere();
  assert.deepEqual(stops,[['s-child','sistema'],['s-auto','sistema']]);
});
