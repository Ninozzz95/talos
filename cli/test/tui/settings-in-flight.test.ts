/*
 * Desktop review of block 11 (27/10/2026, REVISIONE-BLOCCO-11 §E, E-R1/E-R3 and observation E10b), contract §F.3 point 5: the
 * answer to this window's own settings request does not win by itself over a newer snapshot that came in while it was in flight
 * (a device's later change); a kernel that sends no snapshot leaves the value to the answer, as before. Ported from the
 * reviewer's REV-B11-E8/E9/E10/E10b/E14, plus the verso contrario of each.
 */
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';
import {mountApp,sleep} from './consent-order-fixture.ts';
import {hermeticProfile} from './r1-layout-fixture.ts';

function held<T=void>(){let resolve!:(v:T)=>void,reject!:(e:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
const snapshot=(versione:number,over:Record<string,unknown>={})=>({modello:'openai:gpt-5-mini',reasoning:{effort:'high'},permessi:'On request',
  permessiPerAttrezzo:{},modalitaOperativa:'normale',fallbackProviders:[],nome:'Fix',versione,...over});
const settingsRaw=(value:Record<string,unknown>)=>({type:'CUSTOM',name:'talos.impostazioni-sessione',value});

async function controllerWithModeInFlight(startMode='default'){
  const kernelModes:string[]=[];const sinks=new Map<string,(e:any)=>void>();const flight=held<any>();
  const runtime:any={restore:async()=>({}),listSessions:async()=>[{sessionId:'s1',outcome:'running'}],export:()=>({eventi:[]}),start:async()=>'s1',resume:async(id:string)=>id,
    subscribe(id:string,sink:(e:any)=>void){sinks.set(id,sink);return()=>sinks.delete(id);},answerApproval:async()=>{},cancel:async()=>{},close:async()=>{},
    setPermissionMode:()=>flight.promise};
  const c=createTuiSessionController({runtime,projectRoot:process.cwd(),model:'openai:gpt-5-mini',mode:startMode,rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},
    onKernelMode:({mode}:{mode:string})=>{kernelModes.push(mode);},onKernelSettings:()=>{}} as any);
  await c.initialize({initialPrompt:'hello'});
  return{c,flight,kernelModes,emit:(e:any)=>sinks.get('s1')!(e)};
}

test('E8: a device\'s newer mode that came in while this window\'s own mode request was in flight stays; the answer does not bring the old one back',async()=>{
  const {c,flight,emit}=await controllerWithModeInFlight();
  const mine=c.setMode('plan');
  /* the kernel's real order: this window's request saved first (v5, plan), then the device's (v6, normal) */
  emit(settingsRaw({modalitaOperativa:'piano',permessi:'Read only',motivo:'impostazioni',origine:{tipo:'pc'},istantanea:snapshot(5,{modalitaOperativa:'piano'})}));
  emit(settingsRaw({modalitaOperativa:'normale',permessi:'On request',motivo:'impostazioni',origine:{tipo:'dispositivo',dispositivoId:'pad'},istantanea:snapshot(6)}));
  await sleep(5);
  flight.resolve({});await mine;
  assert.equal(c.mode(),'default','the kernel is at v6 (the device\'s normal mode)');
});

test('E8, verso contrario: with no snapshot during the request (an older kernel) the answer sets the mode, as before',async()=>{
  const {c,flight}=await controllerWithModeInFlight();
  const mine=c.setMode('plan');
  flight.resolve({});await mine;
  assert.equal(c.mode(),'plan');
});

/* adversarial review of 0.6.15, A2: the conversation changed while the request was in flight, and the word held for the old one
   was applied to the next one */
test('A2: a mode held for a conversation that is gone does not reach the next one',async()=>{
  const {c,flight,kernelModes,emit}=await controllerWithModeInFlight();
  const mine=c.setMode('plan');await sleep(5);
  emit(settingsRaw({modalitaOperativa:'piano',permessi:'Read only',motivo:'impostazioni',origine:{tipo:'dispositivo',dispositivoId:'pad'},istantanea:snapshot(5,{modalitaOperativa:'piano'})}));
  c.startFresh({running:false});
  flight.resolve({});
  await assert.rejects(mine,/SESSION_SETTINGS_FAILED/u);
  assert.equal(c.mode(),'default');assert.deepEqual(kernelModes,[]);
});

test('A2, verso contrario: a request that fails in the same conversation still leaves the kernel\'s own word',async()=>{
  const {c,flight,emit}=await controllerWithModeInFlight();
  const mine=c.setMode('acceptEdits');await sleep(5);
  emit(settingsRaw({modalitaOperativa:'piano',permessi:'Read only',motivo:'impostazioni',origine:{tipo:'dispositivo',dispositivoId:'pad'},istantanea:snapshot(5,{modalitaOperativa:'piano'})}));
  flight.reject(new Error('refused'));
  await assert.rejects(mine,/refused/u);
  assert.equal(c.mode(),'plan');
});

/* A5: the plan the model asks for comes as session.mode.changed, which was not held, so the answer to this window's request put the
   old level back on the screen while the kernel was in plan */
test('A5: the model\'s plan during this window\'s request stays after the answer',async()=>{
  const {c,flight,emit}=await controllerWithModeInFlight();
  const mine=c.setMode('acceptEdits');await sleep(5);
  emit(settingsRaw({modalitaOperativa:'normale',permessi:'On request',motivo:'impostazioni',origine:{tipo:'pc'},istantanea:snapshot(5)}));
  emit(settingsRaw({modalitaOperativa:'piano',permessi:'Read only',motivo:'piano-richiesto-dal-modello',istantanea:snapshot(6,{modalitaOperativa:'piano',permessi:'Read only'})}));
  await sleep(5);
  assert.equal(c.mode(),'plan','the plan shows at once');
  flight.resolve({});await mine;
  assert.equal(c.mode(),'plan');
});

test('A5, verso contrario: with no word from the kernel the answer still sets this window\'s mode',async()=>{
  const {c,flight,emit}=await controllerWithModeInFlight();
  const mine=c.setMode('acceptEdits');await sleep(5);
  emit(settingsRaw({modalitaOperativa:'normale',permessi:'On request',motivo:'impostazioni',origine:{tipo:'pc'},istantanea:snapshot(5)}));
  flight.resolve({});await mine;
  assert.equal(c.mode(),'acceptEdits');
});

/* F-P-001 against the real kernel (FA-LIVE-01 red on r4 6a4fc5e2b): Full access, manual and accept-edits are all the kernel's
   "On request", so its echo of Full access says normal; only a different LEVEL is a change */
test('Full access: its own echo ("On request") keeps Full access; the answer is this mode\'s',async()=>{
  const {c,flight,emit}=await controllerWithModeInFlight();
  const mine=c.setMode('bypassPermissions');
  emit(settingsRaw({modalitaOperativa:'normale',permessi:'On request',motivo:'impostazioni',origine:{tipo:'pc'},istantanea:snapshot(5)}));
  await sleep(5);flight.resolve({});await mine;
  assert.equal(c.mode(),'bypassPermissions');
});

test('Full access: a device that changes only the model does not take the PC out of Full access; a device\'s plan does',async()=>{
  const {c,flight,emit}=await controllerWithModeInFlight();
  flight.resolve({});await c.setMode('bypassPermissions');
  emit(settingsRaw({modalitaOperativa:'normale',permessi:'On request',motivo:'impostazioni',origine:{tipo:'dispositivo',dispositivoId:'pad'},istantanea:snapshot(7,{modello:'openai:gpt-5'})}));
  await sleep(5);
  assert.equal(c.mode(),'bypassPermissions','same level: the model changed, not the mode');
  emit(settingsRaw({modalitaOperativa:'piano',permessi:'Read only',motivo:'impostazioni',origine:{tipo:'dispositivo',dispositivoId:'pad'},istantanea:snapshot(8,{modalitaOperativa:'piano'})}));
  await sleep(5);
  assert.equal(c.mode(),'plan','another level: the device\'s plan');
  emit(settingsRaw({modalitaOperativa:'normale',permessi:'Workspace write',motivo:'impostazioni',origine:{tipo:'dispositivo',dispositivoId:'pad'},istantanea:snapshot(9)}));
  await sleep(5);
  assert.equal(c.mode(),'acceptEdits','"Workspace write" is a level the CLI never sends: the device\'s');
});

/* acceptance s53 and FA-E2E-01 on r4 6a4fc5e2b: plan asked during a turn echoes no mode (the kernel keeps it for the turn's end),
   and the echo of Full access asked from plan is this request's own, never a kernel change shown on the way */
test('plan asked while a turn runs: the echo without a mode leaves plan to the answer',async()=>{
  const {c,flight,emit}=await controllerWithModeInFlight();
  const mine=c.setMode('plan');
  emit(settingsRaw({modalitaOperativa:'normale',permessi:'Read only',motivo:'impostazioni',origine:{tipo:'pc'},istantanea:snapshot(5,{permessi:'Read only'})}));
  await sleep(5);flight.resolve({operatingModeDeferred:true});await mine;
  assert.equal(c.mode(),'plan');
});

test('Full access from plan: its echo ("On request") is not shown as the kernel changing the mode on the way',async()=>{
  const {c,flight,kernelModes,emit}=await controllerWithModeInFlight('plan');
  const mine=c.setMode('bypassPermissions');
  emit(settingsRaw({modalitaOperativa:'normale',permessi:'On request',motivo:'impostazioni',origine:{tipo:'pc'},istantanea:snapshot(5)}));
  await sleep(5);
  assert.equal(c.mode(),'plan','held until the answer');
  flight.resolve({});await mine;
  assert.equal(c.mode(),'bypassPermissions');
  assert.deepEqual(kernelModes,[],'no kernel mode said');
});

test('a request that fails leaves the kernel\'s own word said meanwhile (a device\'s plan)',async()=>{
  const {c,flight,kernelModes,emit}=await controllerWithModeInFlight();
  const mine=c.setMode('bypassPermissions');
  emit(settingsRaw({modalitaOperativa:'piano',permessi:'Read only',motivo:'impostazioni',origine:{tipo:'dispositivo',dispositivoId:'pad'},istantanea:snapshot(6,{modalitaOperativa:'piano'})}));
  await sleep(5);flight.reject(new Error('refused'));await mine.catch(()=>{});
  assert.equal(c.mode(),'plan');assert.deepEqual(kernelModes,['plan']);
});

const env=hermeticProfile();after(()=>env.restore());
const OFF={state:'off',phones:[],elsewhere:null,consents:[],notified:[],error:null};
const quietRemote={subscribe:()=>()=>{},getSnapshot:()=>OFF,setAttached(){},setWaiting(){},async decideConsent(){}};
const catalogExtra={listProviders:async()=>[{id:'openai',label:'OpenAI',configured:true,requiresKey:false}],probeProvider:async()=>({readinessCode:null,remediation:null}),
  selectModel:async()=>{},listModels:async()=>[]};
const change=(version:number,model:string,origin:any,reasoningEffort='high')=>({version,reason:'settings',model,reasoningEffort,mode:'default',name:null,origin});
const statusRow=(s:{lines:string[]})=>s.lines.filter(l=>/ · /u.test(l)&&!/changed/u.test(l)&&/openai:/u.test(l)).join(' | ');

async function appWithModelInFlight(){
  const flight=held<void>();let calls=0;
  const app=await mountApp({cols:120,rows:32,root:env.root,paths:env.paths,clock:()=>Date.now(),remote:quietRemote,
    runtimeExtra:{setSessionModel:()=>{calls++;return flight.promise;}},catalogExtra});
  await app.waitFor('status row',s=>/gpt-5-mini/u.test(s.text));
  /* a conversation open and idle between turns: only then /model saves the choice on the kernel */
  await app.type('hello');app.press('\r');await sleep(400);
  app.emit('run.started',{runId:'r1'});app.emit('run.completed',{runId:'r1',outcome:'completed'});await sleep(300);
  await app.type('/model openai:gpt-5-nano');await sleep(150);app.press('\r');
  const t0=Date.now();while(!calls&&Date.now()-t0<8000)await sleep(20);
  assert.equal(calls,1,'the window asked the kernel to save the model');
  return{app,flight};
}
async function nextSendModel(app:any){await app.type('hello');app.press('\r');await sleep(400);return app.readinessModels.at(-1);}

test('E9: /model in flight and a device\'s newer model: the status row and the next send both stay on the device\'s',async()=>{
  const {app,flight}=await appWithModelInFlight();
  try{
    app.emit('session.settings.changed',change(11,'openai:gpt-5-nano',{kind:'computer'}));
    app.emit('session.settings.changed',change(12,'openai:gpt-5-device',{kind:'device',deviceId:'pad'}));
    await app.waitFor('the device\'s change said',s=>/A device changed the model to openai:gpt-5-device/u.test(s.text));
    flight.resolve();
    await app.waitFor('this window\'s answer',s=>/Model changed to openai:gpt-5-nano/u.test(s.text));
    await sleep(100);
    assert.match(statusRow(await app.screen()),/gpt-5-device/u,'the kernel is at v12 (the device)');
    assert.equal(await nextSendModel(app),'openai:gpt-5-device');
  }finally{app.unmount();}
});

test('E9, verso contrario: /model with no device in between keeps this window\'s model on the row and for the next send',async()=>{
  const {app,flight}=await appWithModelInFlight();
  try{
    app.emit('session.settings.changed',change(11,'openai:gpt-5-nano',{kind:'computer'}));
    flight.resolve();
    await app.waitFor('this window\'s answer',s=>/Model changed to openai:gpt-5-nano/u.test(s.text));
    await sleep(100);
    assert.match(statusRow(await app.screen()),/gpt-5-nano/u);
    assert.equal(await nextSendModel(app),'openai:gpt-5-nano');
  }finally{app.unmount();}
});

test('E10: this window\'s /model fails after a device\'s newer model: the next send stays on the device\'s',async()=>{
  const {app,flight}=await appWithModelInFlight();
  try{
    app.emit('session.settings.changed',change(12,'openai:gpt-5-device',{kind:'device',deviceId:'pad'}));
    await app.waitFor('the device\'s change said',s=>/A device changed the model to openai:gpt-5-device/u.test(s.text));
    flight.reject(Object.assign(new Error('SESSION_SETTINGS_FAILED'),{code:'SESSION_SETTINGS_FAILED'}));
    await sleep(300);
    assert.equal(await nextSendModel(app),'openai:gpt-5-device');
  }finally{app.unmount();}
});

test('E10b: a /model the kernel refuses, no device: the next send goes back to the model the kernel kept (review B #6)',async()=>{
  const {app,flight}=await appWithModelInFlight();
  try{
    flight.reject(Object.assign(new Error('SESSION_SETTINGS_FAILED'),{code:'SESSION_SETTINGS_FAILED'}));
    await sleep(300);
    assert.equal(await nextSendModel(app),'openai:gpt-5-mini');
  }finally{app.unmount();}
});

async function planInFlight(device:boolean){
  const flight=held<void>();let calls=0;
  const app=await mountApp({cols:120,rows:32,root:env.root,paths:env.paths,clock:()=>Date.now(),remote:quietRemote,
    runtimeExtra:{setPermissionMode:()=>{calls++;return flight.promise;}}});
  try{
    await app.waitFor('status row',s=>/gpt-5-mini/u.test(s.text));
    await app.type('hello');app.press('\r');await sleep(400);
    app.emit('run.started',{runId:'r1'});app.emit('run.completed',{runId:'r1',outcome:'completed'});await sleep(300);
    await app.type('/plan on');await sleep(150);app.press('\r');
    const t0=Date.now();while(!calls&&Date.now()-t0<8000)await sleep(20);
    assert.equal(calls,1,'the window asked the kernel for plan mode');
    app.emit('session.settings.changed',{...change(5,'openai:gpt-5-mini',{kind:'computer'}),mode:'plan'});
    if(device)app.emit('session.settings.changed',{...change(6,'openai:gpt-5-mini',{kind:'device',deviceId:'pad'}),mode:'default'});
    await sleep(200);
    flight.resolve();await sleep(300);
    return (await app.screen()).lines;
  }finally{app.unmount();}
}
const planLine=(lines:string[])=>lines.some(l=>/^ plan mode · /u.test(l));

test('E8 on the screen: /plan in flight and a device\'s newer normal mode: the mode line does not say plan, and no "enabled"',async()=>{
  const lines=await planInFlight(true);
  assert.equal(planLine(lines),false,'the kernel is at v6 (the device\'s normal mode)');
  assert.ok(!lines.some(l=>/Plan mode enabled/u.test(l)),'the window does not announce a mode the kernel no longer has');
});

test('E8 on the screen, verso contrario: /plan in flight with only its own echo: plan mode, announced',async()=>{
  const lines=await planInFlight(false);
  assert.equal(planLine(lines),true);
  assert.ok(lines.some(l=>/Plan mode enabled/u.test(l)));
});

test('E14 (E-R3): a device picks «minimal», which the kernel takes: the screen says minimal, never «model default»',async()=>{
  const app=await mountApp({cols:120,rows:32,root:env.root,paths:env.paths,clock:()=>Date.now(),remote:quietRemote});
  try{
    await app.waitFor('status row',s=>/gpt-5-mini/u.test(s.text));
    app.emit('session.settings.changed',change(10,'openai:gpt-5',{kind:'device',deviceId:'pad'}));
    await app.waitFor('high',s=>/A device changed the reasoning to high/u.test(s.text));
    app.emit('session.settings.changed',change(11,'openai:gpt-5',{kind:'device',deviceId:'pad'},'minimal'));
    await app.waitFor('minimal',s=>/A device changed the reasoning to minimal/u.test(s.text));
    assert.doesNotMatch((await app.screen()).text,/reasoning to model default/u);
  }finally{app.unmount();}
});
