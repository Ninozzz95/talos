import assert from 'node:assert/strict';
import test from 'node:test';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';

function fake(){const calls:string[]=[];const listeners=new Map<string,(e:unknown)=>void>();return {calls,listeners,registry:{
  async ripristina(){calls.push('ripristina');return {ripristinate:2,totali:3};},
  avviaLibero(input:Record<string,unknown>){calls.push(`avvia:${String(input.cartellaLibera)}:${String(input.permessi)}`);return {sessionId:'s1'};},
  iscriviti(id:string,sink:(e:unknown)=>void){calls.push(`sub:${id}`);listeners.set(id,sink);return()=>listeners.delete(id);},
  rispondiApprovazione(id:string,rid:string,ok:boolean){calls.push(`approve:${id}:${rid}:${ok}`);return {ok:true};},
  ferma(id:string){calls.push(`stop:${id}`);return true;},
  esporta(id:string){return {schema:'talos.harness-ui.session-export.v1',sessionId:id,eventi:[]};},
}};}

test('FA-SETTINGS-01: live permissions use the existing durable registry API and fail closed',async()=>{
  const f=fake();const patches:unknown[]=[];
  (f.registry as any).aggiornaImpostazioni=async(id:string,patch:unknown)=>{patches.push([id,patch]);return{ok:true};};
  const runtime=createSessionFacade(f.registry as never,{model:'m'});
  for(const mode of ['plan','bypassPermissions','default'] as const)await runtime.setPermissionMode('s1',mode);
  /* stage 3 (registro 12, pezzo 13b): the operating mode travels with the permission — plan mode is the kernel's plan mode */
  assert.deepEqual(patches,[['s1',{permessi:'Read only',modalitaOperativa:'piano'}],['s1',{permessi:'On request',modalitaOperativa:'normale'}],['s1',{permessi:'On request',modalitaOperativa:'normale'}]]);
  (f.registry as any).aggiornaImpostazioni=async()=>({});
  await assert.rejects(()=>runtime.setPermissionMode('s1','plan'),(error:any)=>error.code==='SESSION_SETTINGS_FAILED');
  (f.registry as any).aggiornaImpostazioni=async()=>({erroreAvvio:'missing',code:'NOT_FOUND'});
  await assert.rejects(()=>runtime.setPermissionMode('s1','plan'),(error:any)=>error.code==='NOT_FOUND');
  delete (f.registry as any).aggiornaImpostazioni;
  await assert.rejects(()=>runtime.setPermissionMode('s1','plan'),(error:any)=>error.code==='SESSION_SETTINGS_UNAVAILABLE');
});

test('facade restores and starts free task in exact project root', async()=>{const f=fake();const r=createSessionFacade(f.registry as never,{model:'openai:gpt',origin:'talos-cli'});assert.deepEqual(await r.restore(),{restored:2,total:3});assert.equal(await r.start({projectRoot:'/repo',prompt:'fix',model:'openai:gpt',permissionMode:'default'}),'s1');/* the kernel's first call is the preparing one (empty selection), then the whole archive that restore() asked for, then the start */assert.deepEqual(f.calls.slice(0,3),['ripristina','ripristina','avvia:/repo:On request']);});

test('permission modes map to least-privilege registry modes', async()=>{const f=fake();const r=createSessionFacade(f.registry as never,{model:'x',origin:'talos-cli'});await r.start({projectRoot:'/r',prompt:'x',model:'x',permissionMode:'plan'});await r.start({projectRoot:'/r',prompt:'x',model:'x',permissionMode:'acceptEdits'});await r.start({projectRoot:'/r',prompt:'x',model:'x',permissionMode:'bypassPermissions'});assert.ok(f.calls.includes('avvia:/r:Read only'));assert.ok(f.calls.includes('avvia:/r:On request'),'F-P-001: acceptEdits asks the CLI for commands');assert.equal(f.calls.filter(c=>c==='avvia:/r:On request').length,2,'F-P-001: Full access too is decided by the CLI engine');assert.ok(!f.calls.includes('avvia:/r:Workspace write'));});

test('cancel is idempotent per session', async()=>{const f=fake();const r=createSessionFacade(f.registry as never,{model:'x',origin:'talos-cli'});await r.cancel('s1');await r.cancel('s1');assert.equal(f.calls.filter(x=>x==='stop:s1').length,1);});

test('approval answer correlates exact request id', async()=>{const f=fake();const r=createSessionFacade(f.registry as never,{model:'x',origin:'talos-cli'});await r.answerApproval('s1','r17',true);assert.ok(f.calls.includes('approve:s1:r17:true'));});

test('resume delegates to registry with the new prompt and returns the session id', async()=>{const f=fake();(f.registry as any).resume=(id:string,prompt:string|null)=>{f.calls.push(`resume:${id}:${prompt??''}`);return{sessionId:id};};const r=createSessionFacade(f.registry as never,{model:'x',origin:'talos-cli'});assert.equal(await r.resume('s1','continue'),'s1');assert.ok(f.calls.includes('resume:s1:continue'));});

test('fork delegates to registry forka and returns the new session id', async()=>{const f=fake();(f.registry as any).forka=(id:string)=>{f.calls.push(`fork:${id}`);return{sessionId:'s2'};};const r=createSessionFacade(f.registry as never,{model:'x',origin:'talos-cli'});assert.equal(await r.fork('s1'),'s2');assert.ok(f.calls.includes('fork:s1'));});
test('fork queues an optional branch prompt on the new live session',async()=>{let queued:any=null;const registry:any={ripristina:async()=>({}),forka:()=>({sessionId:'child'}),accodaMessaggio:(id:string,prompt:string)=>{queued={id,prompt};return{ok:true,posizione:1};},iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({})};const r=createSessionFacade(registry,{model:'m'});assert.equal(await r.fork('parent','change direction'),'child');assert.deepEqual(queued,{id:'child',prompt:'change direction'});});
test('listSessions exposes restored registry ordering for resume last',async()=>{const registry:any={ripristina:async()=>({}),elenca:()=>[{sessionId:'older',avviataAlle:'2026-01-01'},{sessionId:'newer',avviataAlle:'2026-02-01'}],iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({})};const r=createSessionFacade(registry,{model:'m'});assert.equal((await r.listSessions()).at(-1)?.sessionId,'newer');});

test('compact delegates to sessionRegistry.compatta for the exact session',async()=>{
  const f=fake();
  (f.registry as any).compatta=async(id:string)=>{f.calls.push(`compact:${id}`);return {ok:true,compattato:true};};
  const r=createSessionFacade(f.registry as never,{model:'x',origin:'talos-cli'});
  assert.deepEqual(await r.compact('s1'),{ok:true,compattato:true});
  assert.ok(f.calls.includes('compact:s1'));
});

test('cancel idempotence resets when the same session starts a later turn',async()=>{
 const f=fake();(f.registry as any).resume=(id:string)=>({sessionId:id});const r=createSessionFacade(f.registry as never,{model:'x',origin:'talos-cli'});
 await r.cancel('s1');await r.cancel('s1');await r.resume('s1','next');await r.cancel('s1');
 assert.equal(f.calls.filter(x=>x==='stop:s1').length,2);
});

test('facade exposes shell and delegates the exact command to the registry',async()=>{
  const f=fake();const seen:any[]=[];
  (f.registry as any).shell=(id:string,comando:string)=>{seen.push([id,comando]);return{ok:true};};
  const r=createSessionFacade(f.registry as never,{model:'x',origin:'talos-cli'});
  await r.shell('s1','  npm install  ');
  assert.deepEqual(seen,[['s1','npm install']]);
});

test('facade shell fails loudly when the registry cannot run it',async()=>{
  const f=fake();
  const noShell=createSessionFacade(f.registry as never,{model:'x',origin:'talos-cli'});
  await assert.rejects(()=>noShell.shell('s1','ls'),(e:any)=>e.code==='SESSION_SHELL_UNAVAILABLE');
  (f.registry as any).shell=()=>({erroreAvvio:'Sessione non trovata',code:'NOT_FOUND'});
  const r=createSessionFacade(f.registry as never,{model:'x',origin:'talos-cli'});
  await assert.rejects(()=>r.shell('gone','ls'),(e:any)=>e.code==='NOT_FOUND');
  (f.registry as any).shell=()=>({});
  const silent=createSessionFacade(f.registry as never,{model:'x',origin:'talos-cli'});
  await assert.rejects(()=>silent.shell('s1','ls'),(e:any)=>e.code==='SESSION_SHELL_FAILED');
  await assert.rejects(()=>silent.shell('s1','   '),(e:any)=>e.code==='SHELL_COMMAND_REQUIRED');
});


test('M3-E RED — facade maps steer only to registry reindirizza and reuses attachment preparation',async()=>{
  const redirects:any[]=[];let resumes=0,queued=0,materialized=0;
  const registry:any={
    ripristina:async()=>({}),elenca:()=>[{sessionId:'s1',modello:'openai:vision'}],
    reindirizza:(id:string,prompt:string,options:any)=>{redirects.push({id,prompt,options});return{ok:true,redirectId:'redir-1'};},
    resume:()=>{resumes++;return{sessionId:'s1'};},accodaMessaggio:()=>{queued++;return{ok:true};},
    iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({}),
  };
  const image:any={kind:'image',path:'image.png',mimeType:'image/png',bytes:12,dataBase64:Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]).toString('base64')};
  const text:any={kind:'text',path:'notes.txt',mimeType:'text/plain',bytes:5,text:'hello'};
  const runtime=createSessionFacade(registry,{
    model:'openai:vision',modelImageCapability:async()=>true,
    materializeImage:async attachment=>{materialized++;return{id:'a'.repeat(64),tipo:'immagine',nome:attachment.path,mimeType:attachment.mimeType,byte:attachment.bytes};},
  });
  const result=await runtime.steer('s1','change direction @notes.txt',[text,image]);
  assert.deepEqual(result,{redirectId:'redir-1'});
  assert.equal(redirects.length,1);assert.equal(redirects[0].id,'s1');assert.match(redirects[0].prompt,/TALOS project reference: notes\.txt/u);
  assert.equal(redirects[0].options.immagini[0].id,'a'.repeat(64));assert.equal(materialized,1);
  assert.equal(resumes,0);assert.equal(queued,0);
});

test('M3-E RED — facade steer preserves registry rejection code and never falls back to queue/resume',async()=>{
  let resume=0,queue=0;
  const registry:any={
    ripristina:async()=>({}),elenca:()=>[{sessionId:'s1',modello:'m'}],
    reindirizza:()=>({erroreAvvio:'not running',code:'SESSION_NOT_READY'}),
    resume:()=>{resume++;return{sessionId:'s1'};},accodaMessaggio:()=>{queue++;return{ok:true};},
    iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({}),
  };
  const runtime=createSessionFacade(registry,{model:'m'});
  await assert.rejects(()=>runtime.steer('s1','change'),(error:any)=>error?.code==='SESSION_NOT_READY'&&/not running/u.test(error.message));
  assert.equal(resume,0);assert.equal(queue,0);
});

/* C2 (08/10): the facade hands the cursor and the options to the registry's `iscriviti` */
test('the facade passes the subscribe cursor and options to the registry',()=>{
  const seen:unknown[][]=[];
  const registry:any={ripristina:async()=>({}),avviaLibero:()=>({sessionId:'s'}),iscriviti:(...args:unknown[])=>{seen.push(args.slice(1));return()=>{};},ferma:()=>true,rispondiApprovazione:()=>({})};
  const runtime=createSessionFacade(registry,{model:'m'} as any);
  runtime.subscribe('s',()=>{},0,{resultsForScreen:true});
  runtime.subscribe('s',()=>{});
  assert.deepEqual(seen.map(args=>args.slice(1)),[[0,{resultsForScreen:true}],[0,undefined]]);
});
