/*
 * 0.6.6 — an automation run on the kernel's machinery, with the CLI's permissions (automations/kernel-runs.ts): the kernel is given
 * «On request» (or «Read only» for plan), whatever word the store keeps, and every approval the run asks is answered by the CLI's
 * engine in the automation's mode, NON-interactive: an allow is allowed, anything that would ask the person is refused with a
 * reason for the model — never waited for (owner 14/10: «da sole non aspettano nessuno»).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {AUTOMATION_MODES,modeForStoreWord,parseAutomationMode,registryForAutomations,storeWordFor} from '../../src/automations/kernel-runs.ts';

function fakeRegistry(){
  const calls:any[]=[];const answers:any[]=[];let sink:((raw:unknown)=>void)|null=null;let end!:(value:unknown)=>void;
  const registry:any={
    avviaGiroAutomazione(input:any){calls.push(input);return{sessionId:'s1',fine:new Promise(resolve=>{end=resolve;}),modello:null};},
    iscriviti(_id:string,next:(raw:unknown)=>void){sink=next;return()=>{sink=null;};},
    rispondiApprovazione(...args:any[]){answers.push(args);return{};},
    statoGiroAutomazione:()=>'in-corso',
  };
  return{registry,calls,answers,emit:(raw:unknown)=>sink?.(raw),end:(v:unknown)=>end(v),subscribed:()=>sink!==null};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,20));

test('the mode and the store\'s word, one table both ways; an unknown word is the narrowest mode',()=>{
  for(const [mode,word] of Object.entries(AUTOMATION_MODES)){assert.equal(storeWordFor(mode as any),word);assert.equal(modeForStoreWord(word),mode);}
  assert.equal(modeForStoreWord('Workspace sort-of'),'plan');assert.equal(modeForStoreWord(undefined),'plan');
  assert.equal(parseAutomationMode('full-access'),'bypassPermissions');assert.equal(parseAutomationMode('acceptEdits'),'acceptEdits');
  assert.throws(()=>parseAutomationMode('yolo'),{code:'AUTOMATION_MODE_INVALID'});
});

test('the kernel is given «On request» (or «Read only» for plan), never the stored word',()=>{
  for(const [word,sent] of [['Full access','On request'],['Workspace write','On request'],['On request','On request'],['Read only','Read only']] as const){
    const f=fakeRegistry();const decided:any[]=[];
    registryForAutomations(f.registry,()=>({decide:async(_a:unknown,c:any)=>{decided.push(c);return{kind:'allow'};}})).avviaGiroAutomazione({automazioneId:'a',runId:'r',cartella:'C:/p',consegna:'x',permessi:word});
    assert.equal(f.calls[0].permessi,sent,word);
  }
});

test('an approval is answered by the CLI\'s engine in the automation\'s mode, non-interactive; «ask» is refused, never waited for',async()=>{
  const f=fakeRegistry();const decided:any[]=[];
  const engine={decide:async(action:any,context:any)=>{decided.push({action,context});return action.command==='npm test'?{kind:'allow'}:{kind:'ask'};}};
  const started=registryForAutomations(f.registry,folder=>{assert.equal(folder,'C:/p');return engine;}).avviaGiroAutomazione({automazioneId:'a',runId:'r',cartella:'C:/p',consegna:'x',permessi:'Workspace write'});
  assert.equal(started.sessionId,'s1');
  f.emit({type:'ApprovalRequested',requestId:'q1',azione:{tipo:'shell',comando:'npm test'}});
  f.emit({type:'ApprovalRequested',requestId:'q2',azione:{tipo:'shell',comando:'rm -rf build'}});
  await settle();
  assert.deepEqual(decided.map(d=>d.context),[{interactive:false,mode:'acceptEdits',sessionId:'s1'},{interactive:false,mode:'acceptEdits',sessionId:'s1'}]);
  assert.deepEqual(f.answers[0],['s1','q1',true,{motivo:'regola'}]);
  assert.equal(f.answers[1][0],'s1');assert.equal(f.answers[1][1],'q2');assert.equal(f.answers[1][2],false);
  assert.match(String(f.answers[1][3]),/\S/u,'the refusal carries a reason for the model');
  /* the run's end lets go of the session */
  f.end({esito:'succeeded'});await settle();assert.equal(f.subscribed(),false);
});

test('an engine that fails refuses; a run the kernel refused is handed back as it is, with no subscription',async()=>{
  const f=fakeRegistry();
  registryForAutomations(f.registry,()=>({decide:async()=>{throw new Error('broken rules');}})).avviaGiroAutomazione({automazioneId:'a',runId:'r',cartella:'C:/p',consegna:'x',permessi:'Full access'});
  f.emit({type:'ApprovalRequested',requestId:'q1',azione:{tipo:'shell',comando:'ls'}});await settle();
  assert.equal(f.answers[0][2],false);
  const refused={erroreAvvio:'no folder',code:'CUSTOM_TASK_FOLDER_INVALID'};
  const g=fakeRegistry();g.registry.avviaGiroAutomazione=()=>refused;
  assert.equal(registryForAutomations(g.registry,()=>({decide:async()=>({kind:'allow'})})).avviaGiroAutomazione({permessi:'On request'}),refused);
  assert.equal(g.subscribed(),false);
});
