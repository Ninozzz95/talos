/*
 * Owner 27/10/2026 («da remoto il dispositivo collegato deve poter istantaneamente e robustamente cambiare tutte le impostazioni e sul
 * pc devono essere visibili subito come modello, ragionamento etc»; Desktop f573cdc93, the shape of Codex `thread/settings/updated`):
 * the kernel's CUSTOM talos.impostazioni-sessione carries `istantanea`, the WHOLE settings with a `versione` that only grows.
 * - v2: a change of settings, name or provider is `session.settings.changed` in English; the plan's own changes stay
 *   `session.mode.changed`, now with the version; an older kernel (no snapshot) reads as before.
 * - the controller: follows model and mode, tells the screen; a snapshot older than one already seen is dropped (either event);
 *   a replay only remembers the version.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';

const clock=()=>'2026-10-27T14:00:00.000Z';
const snapshot=(versione:number,over:Record<string,unknown>={})=>({modello:'openai:gpt-5-mini',modelId:'openai:gpt-5-mini',provider:'cloud',runtimeId:null,
  modelloPlanner:null,reasoning:{effort:'high'},permessi:'On request',permessiPerAttrezzo:{},modalitaOperativa:'normale',fallbackProviders:[],
  doveGiranoIComandi:null,comandiNellaConversazione:false,nome:'Fix the login',versione,...over});
const settings=(value:Record<string,unknown>)=>({type:'CUSTOM',name:'talos.impostazioni-sessione',value});

test('v2: a settings change is session.settings.changed in English, with the device it came from; durable',()=>{
  const bridge=createV2EventBridge('s-1',clock);
  const event=bridge.translate(settings({modalitaOperativa:'normale',permessi:'On request',motivo:'impostazioni',
    origine:{tipo:'dispositivo',dispositivoId:'p1'},istantanea:snapshot(1793110000000)}));
  assert.equal(event?.type,'session.settings.changed');
  assert.equal(event?.durability,'durable');
  assert.deepEqual(event?.data,{version:1793110000000,reason:'settings',model:'openai:gpt-5-mini',reasoningEffort:'high',mode:'default',name:'Fix the login',
    origin:{kind:'device',deviceId:'p1'}});
  const fromPc=bridge.translate(settings({modalitaOperativa:'piano',permessi:'Read only',motivo:'nome',origine:{tipo:'pc'},
    istantanea:snapshot(7,{modalitaOperativa:'piano',permessi:'Read only',reasoning:null,nome:'Renamed'})}));
  assert.deepEqual(fromPc?.data,{version:7,reason:'name',model:'openai:gpt-5-mini',reasoningEffort:null,mode:'plan',name:'Renamed',origin:{kind:'computer'}});
  const fullAccess=bridge.translate(settings({modalitaOperativa:'normale',permessi:'Full access',motivo:'cambio-fornitore',istantanea:snapshot(8,{permessi:'Full access'})}));
  assert.equal((fullAccess?.data as any).mode,undefined,'a permission the CLI does not map is not invented');
  assert.equal((fullAccess?.data as any).reason,'provider-switch');
});

test('v2: the plan\'s own changes stay session.mode.changed, now with the version; an older kernel reads as before',()=>{
  const bridge=createV2EventBridge('s-1',clock);
  const plan=bridge.translate(settings({modalitaOperativa:'piano',permessi:'Read only',motivo:'piano-richiesto-dal-modello',istantanea:snapshot(9,{modalitaOperativa:'piano'})}));
  assert.equal(plan?.type,'session.mode.changed');
  assert.deepEqual(plan?.data,{mode:'plan',reason:'model-requested',version:9});
  const old=bridge.translate(settings({modalitaOperativa:'normale',permessi:'On request',motivo:'piano-approvato'}));
  assert.deepEqual(old?.data,{mode:'default',reason:'plan-approved'});
  const broken=bridge.translate(settings({modalitaOperativa:'normale',permessi:'On request',motivo:'impostazioni',istantanea:{versione:'x'}}));
  assert.equal(broken?.type,'session.mode.changed','a snapshot without a version is not a settings event');
});

function fakeRuntime(history:any[]=[],outcome='running'){
  const sinks=new Map<string,(e:any)=>void>();
  const r:any={restore:async()=>({restored:1,total:1}),listSessions:async()=>[{sessionId:'s1',outcome}],export:()=>({eventi:[]}),
    start:async()=>'s1',resume:async(id:string)=>id,fork:async()=>'f1',compact:async()=>({ok:true}),
    subscribe(id:string,sink:(e:any)=>void){sinks.set(id,sink);for(const e of history)sink(e);return()=>sinks.delete(id);},
    answerApproval:async()=>{},answerQuestion:async()=>{},answerPlan:async()=>{},cancel:async()=>{},close:async()=>{}};
  return{r,emit:(e:any)=>sinks.get('s1')?.(e)};
}
const tick=(ms=0)=>new Promise(r=>setTimeout(r,ms));
const deviceChange=(versione:number,over:Record<string,unknown>={},motivo='impostazioni')=>settings({modalitaOperativa:'normale',permessi:'On request',motivo,
  origine:{tipo:'dispositivo',dispositivoId:'p1'},istantanea:snapshot(versione,over)});

test('the controller follows a device\'s settings change and tells the screen; an older snapshot is dropped',async()=>{
  const f=fakeRuntime();const told:any[]=[];const modes:any[]=[];
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'ollama:old',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},
    onKernelMode:(x:any)=>modes.push(x),onKernelSettings:(x:any)=>told.push(x)} as any);
  await c.initialize({initialPrompt:'hello'});
  f.emit(deviceChange(100,{modello:'openai:gpt-5'}));await tick();
  assert.equal(c.model(),'openai:gpt-5','the next readiness check and status read the device\'s model');
  assert.deepEqual(told,[{model:'openai:gpt-5',reasoningEffort:'high',origin:{kind:'device',deviceId:'p1'},reason:'settings'}]);
  /* two changes crossing: the older one arrives second and is dropped */
  f.emit(deviceChange(99,{modello:'openai:stale'}));await tick();
  assert.equal(c.model(),'openai:gpt-5');
  assert.equal(told.length,1);
  /* the plan's own mode change, older than the snapshot already seen, is dropped too; a newer one is followed */
  f.emit(settings({modalitaOperativa:'piano',permessi:'Read only',motivo:'piano-richiesto-dal-modello',istantanea:snapshot(100,{modalitaOperativa:'piano'})}));await tick();
  assert.equal(c.mode(),'default');
  f.emit(settings({modalitaOperativa:'piano',permessi:'Read only',motivo:'piano-richiesto-dal-modello',istantanea:snapshot(101,{modalitaOperativa:'piano'})}));await tick();
  assert.equal(c.mode(),'plan');
  assert.deepEqual(modes,[{mode:'plan',reason:'model-requested'}]);
  /* a settings snapshot that puts the mode back is followed as a mode change too */
  f.emit(deviceChange(102,{modalitaOperativa:'normale'}));await tick();
  assert.equal(c.mode(),'default');
});

test('a replay only remembers the version: nothing is applied or said, and a live older snapshot after it is dropped',async()=>{
  const replay=fakeRuntime([{type:'RunStarted',runId:'r1'},deviceChange(200,{modello:'openai:replayed'}),{type:'RunFinished',runId:'r1'}],'completed');
  const told:any[]=[];
  const c=createTuiSessionController({runtime:replay.r,projectRoot:process.cwd(),model:'ollama:saved',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},
    onKernelSettings:(x:any)=>told.push(x)} as any);
  await c.resumeSession('s1');await tick(5);
  assert.deepEqual(told,[]);
  assert.equal(c.model(),'ollama:saved');
  replay.emit(deviceChange(150,{modello:'openai:older'}));await tick();
  assert.deepEqual(told,[],'older than the replayed one');
  replay.emit(deviceChange(201,{modello:'openai:newer'}));await tick();
  assert.equal(told.length,1);
});
