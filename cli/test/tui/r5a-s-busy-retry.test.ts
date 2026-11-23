/*
 * R5a lane S — S4 (the retry line, Q-R5-6, E5) and S5 (busy input, Q-R5-7, Q-R5-8, E8; owner 2026-09-16), pure and at the
 * controller. `provider.attempt` is built here (lane R produces it later): `attempt` is the attempt about to be made.
 */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {busyCommand,busyEnterAction,slashTiming,SLASH_AFTER_TURN,SLASH_VIEWS,tipsOnEnter} from '../../src/tui/busy-input.ts';
import {activityRow,activityView} from '../../src/tui/activity-line.ts';
import {terminalShortcutStrip} from '../../src/tui/components/terminal-shell.ts';
import {deriveLiveActivity,isAnimatedActivity,retryCountdownEnd,retryLine} from '../../src/tui/live-activity.ts';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';
import {initialTuiState,reduceTuiEvent,type TuiState} from '../../src/tui/state.ts';
import {displayWidth} from '../../src/tui/text-width.ts';
import {loadUiPreferences,saveUiPreference} from '../../src/tui/ui-preferences.ts';
import {deriveShellLayout} from '../../src/tui/shell-layout.ts';
import {createTuiAppState} from '../../src/tui/shell-model.ts';

const attempt=(over:Record<string,unknown>={})=>({type:'provider.attempt' as const,attempt:2,maxAttempts:4,status:429,retryAfterMs:7000,waitMs:7000,...over});
const running=()=>reduceTuiEvent(initialTuiState({model:'m',permissionMode:'default'}),{type:'run.started',sessionId:'s1',runId:'r1'});

test('S4 Q-R5-6: a retry is its own state with the owner\'s line; the countdown only while a known wait lasts',()=>{
  const realNow=Date.now;let clock=50_000;Date.now=()=>clock;
  try{
    let state:TuiState=reduceTuiEvent(running(),attempt());
    assert.deepEqual(state.retry,{attempt:2,maxAttempts:4,status:429,retryAfterMs:7000,waitMs:7000,at:50_000});
    const activity=deriveLiveActivity(state,1);
    assert.deepEqual(activity,{kind:'retrying',startedAt:50_000});
    assert.equal(isAnimatedActivity('retrying'),false,'no spinner clock: the countdown ticks once a second');
    assert.equal(retryLine(state.retry!,50_000),'Retrying · attempt 2 of 4 · HTTP 429 · in 7s');
    assert.equal(retryLine(state.retry!,52_100),'Retrying · attempt 2 of 4 · HTTP 429 · in 5s');
    assert.equal(retryLine(state.retry!,57_000),'Retrying · attempt 2 of 4 · HTTP 429','the wait is over: no time');
    assert.equal(retryCountdownEnd(state.retry),57_000);
    /* E5: no known wait, no countdown — the provider's own ask is stated, never counted */
    assert.equal(retryLine({...state.retry!,waitMs:null},50_000),'Retrying · attempt 2 of 4 · HTTP 429 · the provider asked to wait 7s');
    assert.equal(retryLine({...state.retry!,waitMs:null,retryAfterMs:null,status:null},50_000),'Retrying · attempt 2 of 4 · no response');
    assert.equal(retryCountdownEnd({...state.retry!,waitMs:null}),null,'nothing to count: no clock');
    /* never drawn as "thinking" */
    const view=activityView(state,activity,{key:'retrying',start:50_000},0)!;
    const text=activityRow(view,{now:50_000,cols:120,glyph:'⠋'}).map(s=>s.text).join('');
    assert.equal(text,' ↻ Retrying · attempt 2 of 4 · HTTP 429 · in 7s · esc to stop');assert.doesNotMatch(text,/thinking/iu);
    /* the first attempt is not a retry */
    assert.equal(deriveLiveActivity(reduceTuiEvent(running(),attempt({attempt:1,status:null,waitMs:null,retryAfterMs:null})),1).kind,'thinking');
    /* the model answered: the retry is over; the turn ended: over too */
    assert.equal(reduceTuiEvent(state,{type:'message.delta',messageId:'a',delta:'ok'}).retry,null);
    assert.equal(reduceTuiEvent(state,{type:'run.failed',message:'x'}).retry,null);
    assert.equal(reduceTuiEvent(state,{type:'run.cancelled'}).retry,null);
    /* E1: malformed numbers are unknown, never 0 */
    state=reduceTuiEvent(running(),attempt({status:'429',waitMs:-5,retryAfterMs:Number.NaN}) as any);
    assert.deepEqual([state.retry!.status,state.retry!.waitMs,state.retry!.retryAfterMs],[null,null,null]);
  }finally{Date.now=realNow;}
});

test('S5 Q-R5-7/8: what Enter does, by mode; `!` always queues during a turn; views run at once, session commands wait',()=>{
  for(const mode of ['queue','steer','interrupt'] as const){
    assert.equal(busyEnterAction({text:'hello',running:false,mode}),'send');
    assert.equal(busyEnterAction({text:'!dir',running:true,mode}),'queue','owner 2026-09-16: a command typed during a turn is queued');
    for(const view of ['/help','/status','/context','/queue','/usage'])assert.equal(busyEnterAction({text:view,running:true,mode}),'slash-now',view);
    /* F-Q2 (owner 03/10: «tutti i comandi tipo /effort mentre il modello gira … devono cambiare immediatamente»; Claude Code
       interactive-mode: «Claude Code runs some commands as soon as you send them instead of queueing them, among them /model,
       /effort»): the settings run at once; the commands that act on the session still wait for the turn. */
    for(const name of ['model','effort','permissions'])assert.equal(busyEnterAction({text:`/${name} x`,running:true,mode}),'slash-now',name);
    for(const name of ['provider','compact','clear','resume','fork'])assert.equal(busyEnterAction({text:`/${name} x`,running:true,mode}),'slash-after-turn',name);
    /* Owner 2026-09-24 (after R5a lane S): /busy changes what Enter does NOW, even mid-turn (a screen preference, not the
       session; Hermes has no busy guard on it, ui-tui/src/app/slash/commands/session.ts:622). */
    assert.equal(busyEnterAction({text:'/busy steer',running:true,mode}),'slash-now','/busy runs at once during a turn');
    assert.equal(busyEnterAction({text:'/model x',running:false,mode}),'slash-now');
  }
  assert.equal(busyEnterAction({text:'hello',running:true,mode:'queue'}),'queue');
  assert.equal(busyEnterAction({text:'hello',running:true,mode:'steer'}),'steer');
  assert.equal(busyEnterAction({text:'hello',running:true,mode:'interrupt'}),'interrupt-and-send');
  assert.deepEqual([...SLASH_VIEWS].sort(),['context','help','queue','status','usage']);
  assert.equal(SLASH_AFTER_TURN.size,5);/* owner 2026-09-24: /busy left the list (it runs at once); /effort joined it (it changes the session, like /model) */assert.equal(slashTiming('diff'),'now','a command the owner did not list keeps today\'s behaviour');
  assert.equal(tipsOnEnter('queue'),true);assert.equal(tipsOnEnter('slash-now'),false);assert.equal(tipsOnEnter('send'),false);
  assert.deepEqual(busyCommand(['steer'],'queue'),{text:'Busy input set to steer: while TALOS works, Enter steers the running turn with your message.',mode:'steer'});
  assert.deepEqual(busyCommand([],'interrupt'),{text:'Busy input: interrupt. While TALOS works, Enter stops the turn and sends your message. /busy queue|steer|interrupt changes it.',mode:null});
  assert.equal(busyCommand(['loud'],'queue').mode,null);assert.match(busyCommand(['loud'],'queue').text,/^Usage: \/busy/u);
});

test('S5 E8: while a turn runs the strip says what Enter does in the mode, and the mode, within 60 columns',()=>{
  const at=(busyInput:'queue'|'steer'|'interrupt',width:number)=>terminalShortcutStrip({mode:'default',running:true,queueCount:1,width,busyInput});
  assert.equal(at('queue',60),'Enter queues · Alt+S steers · Esc interrupts · mode manual');
  assert.equal(at('steer',60),'Enter steers · Esc interrupts · mode manual · queue 1');
  assert.equal(at('interrupt',120),'Enter interrupts and sends · Alt+S steers · Esc interrupts · mode manual · queue 1 · PageUp/PageDown transcript');
  for(const width of [40,60,80,120])for(const mode of ['queue','steer','interrupt'] as const)assert.ok(displayWidth(at(mode,width))<=width);
  /* idle: as before (no busy line) */
  assert.match(terminalShortcutStrip({mode:'default',running:false,queueCount:0,width:120,busyInput:'queue'}),/^mode manual · Shift\+Tab cycle/u);/* the strip itself (still the agent view's); the main screen draws the mockup's mode row */
  /* the layout: the busy line while the turn runs, but not while the approval dialog takes Enter and Esc */
  const layout=(waitingForPerson:boolean)=>deriveShellLayout({state:{...running(),waitingForPerson},appState:createTuiAppState(),viewport:{offset:0,pageSize:10,unseen:0,followingTail:true},terminalRows:30,terminalColumns:120,projectRoot:'C:\\p',queuedActions:[],busySince:0,bullet:'•',branch:'├',busyInput:'queue'}).shortcutLine;
  assert.match(layout(false),/^Enter queues · Alt\+S steers · Esc interrupts/u);
  assert.doesNotMatch(layout(true),/Enter queues/u);
});

function fakeRuntime(){
  const sinks=new Map<string,(event:any)=>void>();const log:string[]=[];
  const runtime:any={
    restore:async()=>({restored:0,total:0}),listSessions:async()=>[],start:async()=>'new',
    resume:async(id:string,prompt?:string)=>{log.push(`resume ${prompt}`);return id;},
    fork:async()=>'fork',compact:async()=>({ok:true}),subscribe(id:string,sink:(e:any)=>void){sinks.set(id,sink);return()=>sinks.delete(id);},
    answerApproval:async()=>{},cancel:async()=>{log.push('cancel');},shell:async(_id:string,command:string)=>{log.push(`shell ${command}`);},export:()=>null,close:async()=>{},
  };
  return{runtime,sinks,log};
}
function paths(root:string){return{dataRoot:root,queueRoot:join(root,'queues'),configRoot:join(root,'config'),cacheRoot:join(root,'cache'),sessionsRoot:join(root,'sessions'),logsRoot:join(root,'logs'),projectOverridesRoot:join(root,'projects'),trust:{hooks:join(root,'trust','hooks'),mcp:join(root,'trust','mcp'),plugins:join(root,'trust','plugins'),projects:join(root,'trust','projects')}} as any;}
async function until(predicate:()=>boolean,label:string){for(let i=0;i<300;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.fail(`timed out waiting for ${label}`);}

test('S5 E8 (gate finding 8): a queued `!` command\'s own line is shown before it runs, so its row lands after it',async t=>{
  const root=await mkdtemp(join(tmpdir(),'r5a-s-queue-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const f=fakeRuntime();
  const c=createTuiSessionController({runtime:f.runtime,projectRoot:root,model:'openai:m',mode:'default',rules:{allow:[],ask:[],deny:[]},paths:paths(root),onEvent:()=>{},onQueuedDispatch:(action)=>f.log.push(`echo ${action.kind} ${action.text}`)} as any);
  c.attach('s1');await c.queueReady();
  await c.send('!cmd /c echo typed-while-busy',{model:'m',running:true});
  assert.deepEqual(f.log,[],'queued while the turn runs');
  f.sinks.get('s1')!({type:'RunFinished'});
  await until(()=>f.log.length>=2,'the queued command');
  assert.deepEqual(f.log,['echo command cmd /c echo typed-while-busy','shell cmd /c echo typed-while-busy']);
});

test('S5 Q-R5-8: a session command typed during a turn waits in order with the prompts, and is never written to the queue store',async t=>{
  const root=await mkdtemp(join(tmpdir(),'r5a-s-slash-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const f=fakeRuntime();
  const c=createTuiSessionController({runtime:f.runtime,projectRoot:root,model:'openai:m',mode:'default',rules:{allow:[],ask:[],deny:[]},paths:paths(root),onEvent:()=>{},onQueuedSlash:async(text:string)=>{f.log.push(`slash ${text}`);}} as any);
  c.attach('s1');await c.queueReady();
  await c.send('A',{model:'m',running:true});
  assert.equal(await c.deferSlash('/model openai:other',{running:true}),2);
  await c.send('B',{model:'m',running:true});
  assert.deepEqual(c.queue().map((row:any)=>`${row.kind} ${row.text}`),['prompt A','slash /model openai:other','prompt B']);
  const stored=JSON.parse(await readFile(join(root,'queues',(await readdir(join(root,'queues'))).find(name=>name.endsWith('.json'))!),'utf8'));
  assert.deepEqual(stored.entries.map((row:any)=>row.text),['A','B'],'a screen command is not work to recover after a restart');
  f.sinks.get('s1')!({type:'RunFinished'});
  await until(()=>f.log.includes('resume A'),'prompt A');
  assert.deepEqual(f.log,['resume A'],'A starts a turn; the next entries wait for its end');
  f.sinks.get('s1')!({type:'RunFinished'});
  await until(()=>f.log.includes('resume B'),'prompt B');
  assert.deepEqual(f.log,['resume A','slash /model openai:other','resume B']);
  /* when no turn runs any more (B's dispatch has settled), a deferred command does not wait for an end that will not come */
  await until(()=>c.queue().length===0,'the queue drained');await new Promise(resolve=>setTimeout(resolve,50));
  await c.deferSlash('/compact',{running:false});
  await until(()=>f.log.includes('slash /compact'),'the command with no turn open');
});

test('S5/S8: /busy and Ctrl+T are remembered in the user configuration (ui.busyInput, ui.reasoning)',async t=>{
  const root=await mkdtemp(join(tmpdir(),'r5a-s-prefs-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const p=paths(root),projectRoot=join(root,'project');
  assert.deepEqual(await loadUiPreferences({paths:p,projectRoot}),{busyInput:'queue',reasoning:'collapsed'},'defaults: queue, collapsed');
  await saveUiPreference({paths:p,projectRoot,patch:{busyInput:'steer'}});
  await saveUiPreference({paths:p,projectRoot,patch:{reasoning:'visible'}});
  assert.deepEqual(await loadUiPreferences({paths:p,projectRoot}),{busyInput:'steer',reasoning:'visible'});
  const user=JSON.parse(await readFile(join(p.configRoot,'config.json'),'utf8'));
  assert.deepEqual(user.ui,{busyInput:'steer',reasoning:'visible'},'written in the user scope');
});
