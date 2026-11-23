/*
 * 0.6.6 (the 0.6.6 review's F3 and its open question on sub-agents) — an automation run as the CLI starts it
 * (automations/kernel-runs.ts):
 * - the model reads the automation's real mode from its first turn (the start runs inside `withStartingMode`) and later turns
 *   (the session's mode is remembered), in the words for nobody in front;
 * - an approval asked by an agent the run delegated to — on ITS OWN session, announced on the root's by `talos.agenti` — is
 *   answered by the same engine in the same mode, never left waiting; a request already resolved in the replay is not answered.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {registryForAutomations} from '../../src/automations/kernel-runs.ts';
import {permissionForModel,permissionForModelWithNobody} from '../../src/runtime/model-permission.ts';
import {sessionModeOf} from '../../src/runtime/session-modes.ts';

function fakeRegistry(sessionId:string){
  const sinks=new Map<string,(raw:unknown)=>void>();const answers:any[]=[];const seenAtStart:any[]=[];let end!:(value:unknown)=>void;
  const registry:any={
    avviaGiroAutomazione(_input:any){seenAtStart.push(permissionForModelWithNobody({sessionId}));return{sessionId,fine:new Promise(resolve=>{end=resolve;})};},
    iscriviti(id:string,next:(raw:unknown)=>void){sinks.set(id,next);return()=>{sinks.delete(id);};},
    rispondiApprovazione(...args:any[]){answers.push(args);return{};},
    statoGiroAutomazione:()=>'in-corso',
  };
  return{registry,answers,seenAtStart,emit:(id:string,raw:unknown)=>sinks.get(id)?.(raw),watching:()=>[...sinks.keys()].sort(),end:(v:unknown)=>end(v)};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,20));

test('the model reads the automation\'s mode from the first turn, in the words for nobody in front; the session keeps it',()=>{
  const f=fakeRegistry('s-auto-mode');
  registryForAutomations(f.registry,()=>({decide:async()=>({kind:'allow'})})).avviaGiroAutomazione({automazioneId:'a',runId:'r',cartella:'C:/p',consegna:'x',permessi:'Full access'});
  assert.match(String(f.seenAtStart[0]),/^Full access: .*refused: nobody is here to answer/u,'the first turn');
  assert.equal(sessionModeOf('s-auto-mode'),'bypassPermissions','remembered for the next turns (and the network rule)');
  assert.match(String(permissionForModelWithNobody({sessionId:'s-auto-mode'})),/^Full access/u);
  assert.doesNotMatch(String(permissionForModelWithNobody({sessionId:'s-auto-mode'})),/Being asked is not a refusal/u);
  assert.match(String(permissionForModel({sessionId:'s-auto-mode'})),/are asked to the person\.$/u,'the screen\'s words stay the screen\'s');
});

test('an agent the run delegated to: its approvals are answered in the automation\'s mode, its end lets go of it',async()=>{
  const f=fakeRegistry('s-root');const decided:any[]=[];
  const engine={decide:async(action:any,context:any)=>{decided.push(context);return action.command==='npm test'?{kind:'allow'}:{kind:'ask'};}};
  registryForAutomations(f.registry,()=>engine).avviaGiroAutomazione({automazioneId:'a',runId:'r',cartella:'C:/p',consegna:'x',permessi:'Workspace write'});
  assert.deepEqual(f.watching(),['s-root']);
  f.emit('s-root',{type:'CUSTOM',name:'talos.agenti',value:{childId:'s-child',parentId:'s-root',reason:'created',agent:{}}});
  assert.deepEqual(f.watching(),['s-child','s-root'],'the child is watched once announced');
  f.emit('s-root',{type:'CUSTOM',name:'talos.agenti',value:{childId:'s-child',parentId:'s-root',reason:'changed',agent:{}}});
  f.emit('s-child',{type:'ApprovalRequested',requestId:'c1',azione:{tipo:'shell',comando:'npm test'}});
  f.emit('s-child',{type:'ApprovalRequested',requestId:'c2',azione:{tipo:'shell',comando:'rm -rf build'}});
  await settle();
  assert.deepEqual(decided,[{interactive:false,mode:'acceptEdits',sessionId:'s-child'},{interactive:false,mode:'acceptEdits',sessionId:'s-child'}]);
  assert.deepEqual(f.answers[0],['s-child','c1',true,{motivo:'regola'}]);
  assert.deepEqual(f.answers[1].slice(0,3),['s-child','c2',false]);assert.match(String(f.answers[1][3]),/\S/u);
  /* a grandchild is announced to every ancestor, the root included */
  f.emit('s-root',{type:'CUSTOM',name:'talos.agenti',value:{childId:'s-grandchild',parentId:'s-child',reason:'created',agent:{}}});
  assert.deepEqual(f.watching(),['s-child','s-grandchild','s-root']);
  f.emit('s-root',{type:'CUSTOM',name:'talos.agenti',value:{childId:'s-child',parentId:'s-root',reason:'completed',agent:{conclusa:true}}});
  assert.deepEqual(f.watching(),['s-grandchild','s-root'],'an ended child is let go');
});

test('a request the replay shows resolved is not answered again',async()=>{
  const f=fakeRegistry('s-replay');let calls=0;
  const registry={...f.registry,iscriviti(id:string,next:(raw:unknown)=>void){
    next({type:'ApprovalRequested',requestId:'old',azione:{tipo:'shell',comando:'ls'}});next({type:'ApprovalResolved',requestId:'old',approvato:true});
    return f.registry.iscriviti(id,next);
  }};
  registryForAutomations(registry,()=>({decide:async()=>{calls++;return{kind:'allow'};}})).avviaGiroAutomazione({automazioneId:'a',runId:'r',cartella:'C:/p',consegna:'x',permessi:'Workspace write'});
  await settle();
  assert.equal(f.answers.length,0,JSON.stringify(f.answers));assert.equal(calls,1);
});

/* found by s76 on 15/10/2026: the kernel ends an automation run at its own turn's end while the agents it delegated to still work;
   a host that left then (`run`, `serve --once`) ended them. The run's agents are read from its stream, as -p does (children.ts). */
test('agents at work, and their results waiting for the wake, keep the run waited for; the wake that answers them lets it go',async()=>{
  const f=fakeRegistry('s-wait');
  const permitted:any=registryForAutomations(f.registry,()=>({decide:async()=>({kind:'allow'})}),{graceMs:60_000});
  permitted.avviaGiroAutomazione({automazioneId:'a',runId:'r',cartella:'C:/p',consegna:'x',permessi:'Workspace write'});
  assert.equal(permitted.agentsWorking(),true,'the run itself');
  f.emit('s-wait',{type:'RunStarted',runId:'t1'});
  f.emit('s-wait',{type:'CUSTOM',name:'talos.agenti',value:{childId:'c1',parentId:'s-wait',reason:'created',agent:{}}});
  f.emit('s-wait',{type:'RunFinished',runId:'t1'});f.end({esito:'succeeded'});await settle();
  assert.equal(permitted.agentsWorking(),true,'its own turn ended, its agent works');
  f.emit('s-wait',{type:'CUSTOM',name:'talos.agenti',value:{childId:'c1',parentId:'s-wait',reason:'completed',agent:{conclusa:true}}});
  assert.equal(permitted.agentsWorking(),true,'the agent ended, its result waits for the wake');
  const result=`Asynchronous result of a sub-agent.\n${JSON.stringify({schema:'talos.subagent-result.v1',childId:'c1',stato:'concluso',risultatoNonFidato:'ok'})}`;
  f.emit('s-wait',{type:'RunStarted',runId:'t2',input:{origine:'delega',risultatiDelega:[{childId:'c1',testo:result}]}});
  assert.equal(permitted.agentsWorking(),true,'the wake turn is open');
  f.emit('s-wait',{type:'RunFinished',runId:'t2'});
  assert.equal(permitted.agentsWorking(),false,'answered, and no turn open');
  await new Promise(resolve=>setTimeout(resolve,600));assert.deepEqual(f.watching(),[],'and the watch lets go');
});

/* the fifth review of 0.6.6: a host that loses the lease stops the agents too (separate sessions a root's stop does not reach) */
test('the live sessions are the agents at work first, then the runs; an ended agent leaves the list',()=>{
  const f=fakeRegistry('s-live');
  const permitted:any=registryForAutomations(f.registry,()=>({decide:async()=>({kind:'allow'})}));
  permitted.avviaGiroAutomazione({automazioneId:'a',runId:'r',cartella:'C:/p',consegna:'x',permessi:'Workspace write'});
  f.emit('s-live',{type:'CUSTOM',name:'talos.agenti',value:{childId:'c-1',parentId:'s-live',reason:'created',agent:{}}});
  f.emit('s-live',{type:'CUSTOM',name:'talos.agenti',value:{childId:'c-2',parentId:'s-live',reason:'created',agent:{}}});
  assert.deepEqual(permitted.liveSessions(),['c-1','c-2','s-live']);
  f.emit('s-live',{type:'CUSTOM',name:'talos.agenti',value:{childId:'c-1',parentId:'s-live',reason:'completed',agent:{conclusa:true}}});
  assert.deepEqual(permitted.liveSessions(),['c-2','s-live']);
});

/* 0.6.7 (sixth review of 0.6.6, N3): an agent announced again after its end ("changed", the kernel resuming it) was added back to
   the shared list, and nothing took it out once the run settled — the list grew for the host's whole life */
test('when a run settles, its agents leave the live sessions, even one announced again after its end',async()=>{
  const f=fakeRegistry('s-n3');
  const permitted:any=registryForAutomations(f.registry,()=>({decide:async()=>({kind:'allow'})}),{graceMs:60_000});
  permitted.avviaGiroAutomazione({automazioneId:'a',runId:'r',cartella:'C:/p',consegna:'x',permessi:'Workspace write'});
  f.emit('s-n3',{type:'RunStarted',runId:'t1'});
  f.emit('s-n3',{type:'CUSTOM',name:'talos.agenti',value:{childId:'c1',parentId:'s-n3',reason:'created',agent:{}}});
  f.emit('s-n3',{type:'CUSTOM',name:'talos.agenti',value:{childId:'c1',parentId:'s-n3',reason:'completed',agent:{conclusa:true}}});
  f.emit('s-n3',{type:'CUSTOM',name:'talos.agenti',value:{childId:'c1',parentId:'s-n3',reason:'changed',agent:{}}});
  f.emit('s-n3',{type:'RunFinished',runId:'t1'});f.end({esito:'succeeded'});await settle();
  const result=`Asynchronous result of a sub-agent.\n${JSON.stringify({schema:'talos.subagent-result.v1',childId:'c1',stato:'concluso',risultatoNonFidato:'ok'})}`;
  f.emit('s-n3',{type:'RunStarted',runId:'t2',input:{origine:'delega',risultatiDelega:[{childId:'c1',testo:result}]}});
  f.emit('s-n3',{type:'RunFinished',runId:'t2'});
  await new Promise(resolve=>setTimeout(resolve,600));
  assert.equal(permitted.agentsWorking(),false);
  assert.deepEqual(permitted.liveSessions(),[],'nothing of the settled run is left');
});
