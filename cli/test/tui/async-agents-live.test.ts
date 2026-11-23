/*
 * ASYNC phase, step 3 (owner 01/10: «conteggio + /agents», max potential with Claude Code and Codex read in their code).
 * Delegated agents now outlive their parent's turn, so what the screen says about them comes from the kernel's own events
 * (`talos.agenti` → v2 `agent.changed`), not from the parent's open tool call:
 *  - the status line says «N agents working» while the main agent is idle and children work, and «· N in background»
 *    while it works itself (Claude Code's footer pill «N local agents»);
 *  - the footer roster keeps a child that is alive after the turn, and drops one the kernel said has ended even when the
 *    session list still lags behind with `running` (frame 15, 27/09);
 *  - `/agents` (and Alt+A) lists them with the selected agent's last three activity lines, Codex `/subagents`
 *    (`agent_status_feed.rs`: 3 preview lines, 6 items, «No recent activity yet.»), and `x` stops the selected one
 *    (Claude Code agent panel «x to stop»); `/agents stop <n|id|all>` and `/agents show <n|id>` name them.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {createTuiEventAdapter,type TuiEvent} from '../../src/tui/event-adapter.ts';
import {agentActivityLine,agentPreview,reduceLiveAgents,workingAgents,type LiveAgent} from '../../src/tui/live-agents.ts';
import {initialTuiState,reduceTuiEvent} from '../../src/tui/state.ts';
import {deriveLiveActivity} from '../../src/tui/live-activity.ts';
import {activityRow,activityView} from '../../src/tui/activity-line.ts';
import {agentCards,agentsPill} from '../../src/tui/agents-panel.ts';
import {agentListSelection,agentTreeOverlayLines,createAgentTreeOverlayModel} from '../../src/tui/overlays/agent-tree.ts';
import {resolveAgentTargets,type AgentRosterRow} from '../../src/tui/agent-roster.ts';
import {parseSlashCommand,SLASH_COMMANDS} from '../../src/tui/slash-commands.ts';
import {slashTiming} from '../../src/tui/busy-input.ts';
import {stoppableAgent} from '../../src/tui/overlays/agent-tree.ts';
import {looksItalian} from '../../src/i18n/kernel-map.ts';

const clock=()=>'2026-10-01T10:00:00.000Z';
function changed(childId:string,reason:string,operation:Record<string,unknown>,agent:Record<string,unknown>={}){
  return{type:'CUSTOM',name:'talos.agenti',value:{version:1,sessionId:'main',parentId:'main',childId,reason,
    agent:{sessionId:childId,taskCorto:`task ${childId}`,conclusa:false,interrotta:false,avviataAlle:'2026-10-01T09:59:50.000Z',...agent},operation}};
}
function events(raw:readonly unknown[]):TuiEvent[]{
  const adapter=createTuiEventAdapter();adapter.bindSession('main');
  return raw.flatMap(item=>adapter.translateAll(item)).filter(event=>event.type==='agent.changed');
}
function live(raw:readonly unknown[]):readonly LiveAgent[]{
  let list:readonly LiveAgent[]=[];
  for(const event of events(raw))list=reduceLiveAgents(list,event);
  return list;
}
function row(overrides:Partial<AgentRosterRow>={}):AgentRosterRow{
  return{id:'main',parentId:null,level:0,nativeDepth:0,role:'main',focused:true,name:null,task:null,model:null,outcome:'completed',
    interrupted:false,startedAt:'2026-10-01T09:59:00.000Z',updatedAt:null,endedAt:null,usage:null,collisionCount:0,hasCollision:false,
    delegationOutcome:null,delegationEvidence:null,...overrides};
}
const child=(id:string,overrides:Partial<AgentRosterRow>={})=>row({id,parentId:'main',level:1,nativeDepth:1,role:'subagent',focused:false,task:`task ${id}`,outcome:'running',...overrides});

test('ASYNC 3: agent.changed carries the tool, the start and whether the kernel stopped the child (v2 and screen)',()=>{
  const bridge=createV2EventBridge('main',clock);
  const tool=bridge.translate(changed('c1','updated',{kind:'tool',status:'running',label:'cerca in corso',toolName:'cerca'}));
  assert.deepEqual([tool?.data.tool,tool?.data.startedAt,tool?.data.interrupted,tool?.data.ended],['cerca','2026-10-01T09:59:50.000Z',false,false]);
  const stopped=bridge.translate(changed('c1','updated',{kind:'response',status:'completed',label:'Risposta aggiornata'},{interrotta:true}));
  assert.deepEqual([stopped?.data.interrupted,stopped?.data.ended],[true,true],'a child the kernel stopped has ended');
  const files=bridge.translate(changed('c1','updated',{kind:'files',status:'updated',label:'12 file aggiornati'}));
  assert.deepEqual([files?.data.count,tool?.data.count],[12,null],'the file count, out of the label; nothing for other steps');
  assert.doesNotMatch(JSON.stringify(files?.data),/aggiornati/u);
  const numbered=bridge.translate(changed('c1','updated',{kind:'tool',status:'running',label:'3 attrezzi',toolName:'x'}));
  assert.equal(numbered?.data.count,null,'only a files step has a count, whatever its label starts with');
  const [screen]=events([changed('c1','updated',{kind:'tool',status:'running',label:'cerca in corso',toolName:'cerca'})]) as any[];
  assert.deepEqual([screen.tool,screen.startedAt,screen.interrupted],['cerca','2026-10-01T09:59:50.000Z',false]);
});

test('ASYNC 3: each child\'s activity in English, newest last, repeats folded, capped at six (Codex /subagents)',()=>{
  const list=live([
    changed('c1','created',{kind:'lifecycle',status:'started',label:'Agente avviato'}),
    changed('c1','updated',{kind:'reasoning',status:'running',label:'Ragionamento in corso'}),
    changed('c1','updated',{kind:'reasoning',status:'completed',label:'Ragionamento concluso'}),
    changed('c1','updated',{kind:'reasoning',status:'running',label:'Ragionamento in corso'}),
    changed('c1','updated',{kind:'tool',status:'running',label:'leggi in corso',toolName:'leggi'}),
    changed('c1','updated',{kind:'tool',status:'running',label:'cerca in corso',toolName:'cerca'}),
    changed('c1','updated',{kind:'tool',status:'completed',label:'cerca concluso',toolName:'cerca'}),
    changed('c1','updated',{kind:'approval',status:'waiting',label:'In attesa di approvazione',toolName:'scrivi'}),
    changed('c1','updated',{kind:'files',status:'updated',label:'2 file aggiornati'}),
    changed('c1','updated',{kind:'usage',status:'updated',label:'Utilizzo aggiornato'}),
    changed('c1','updated',{kind:'response',status:'running',label:'Risposta in corso'}),
    changed('c2','created',{kind:'lifecycle',status:'started',label:'Agente avviato'}),
  ]);
  assert.deepEqual(list.map(agent=>agent.childId),['c1','c2'],'in the order they were started');
  const first=list[0]!;
  assert.equal(first.task,'task c1');
  assert.equal(first.startedAtMs,Date.parse('2026-10-01T09:59:50.000Z'));
  assert.deepEqual(first.activity,['Thinking','Read file','Search files','Waiting for approval','2 files updated','Answering'],'the last six of seven, in English, the second «Thinking» folded');
  assert.deepEqual(agentPreview(first),['Waiting for approval','2 files updated','Answering'],'the preview is the last three');
  assert.equal(first.activity.some(line=>looksItalian(line)),false);
  assert.deepEqual(workingAgents(list).map(agent=>agent.childId),['c1','c2']);
  assert.equal(agentActivityLine({kind:'usage',status:'updated',tool:null}),null,'usage is not an activity');
  assert.equal(agentActivityLine({kind:'tool',status:'completed',tool:'cerca'}),null,'the end of a tool says nothing new');
  assert.equal(agentActivityLine({kind:'files',status:'updated',tool:null,count:1}),'1 file updated');
});

test('ASYNC 3: a child ends finished, not finished or stopped; the state keeps it, the count drops it',()=>{
  const list=live([
    changed('ok','created',{kind:'lifecycle',status:'started'}),
    changed('ko','created',{kind:'lifecycle',status:'started'}),
    changed('st','created',{kind:'lifecycle',status:'started'}),
    changed('ok','completed',{kind:'lifecycle',status:'completed'},{conclusa:true}),
    changed('ko','completed',{kind:'lifecycle',status:'failed'},{conclusa:true}),
    changed('st','completed',{kind:'lifecycle',status:'failed'},{conclusa:true,interrotta:true}),
  ]);
  assert.deepEqual(list.map(agent=>[agent.childId,agent.outcome,agent.ended]),[['ok','completed',true],['ko','failed',true],['st','stopped',true]]);
  assert.deepEqual(list.map(agent=>agent.activity.at(-1)),['Finished','Did not finish','Stopped']);
  assert.equal(workingAgents(list).length,0);
  const state=events([changed('x','created',{kind:'lifecycle',status:'started'})]).reduce(reduceTuiEvent,initialTuiState({model:'m',permissionMode:'ask'}));
  assert.deepEqual(state.agents.map(agent=>agent.childId),['x'],'the TUI state folds agent.changed');
  const same=reduceLiveAgents(list,{type:'agent.changed',childId:'ok',parentId:'main',reason:'updated',kind:'usage',status:'updated',task:null,tool:null,startedAt:null,interrupted:false,count:null,ended:true} as any);
  assert.equal(same,list,'nothing new: the same list (no repaint)');
  const busy=live([changed('w','created',{kind:'lifecycle',status:'started'}),changed('w','updated',{kind:'reasoning',status:'running'}),
    changed('w','updated',{kind:'reasoning',status:'completed'}),changed('w','updated',{kind:'reasoning',status:'running'})]);
  assert.deepEqual(busy[0]!.activity,['Started','Thinking'],'a step said twice in a row is said once');
  const quiet=reduceLiveAgents(busy,{type:'agent.changed',childId:'w',parentId:'main',reason:'updated',kind:'usage',status:'updated',task:'task w',tool:null,startedAt:'2026-10-01T09:59:50.000Z',interrupted:false,count:null,ended:false} as any);
  assert.equal(quiet,busy,'a working agent\'s usage update changes nothing on screen: the same list');
});

test('ASYNC 3: the status line counts children working while the main agent is idle, and says they run in background while it works',()=>{
  const working=live([changed('a','created',{kind:'lifecycle',status:'started'}),changed('b','created',{kind:'lifecycle',status:'started'})]);
  const idle=deriveLiveActivity({running:false,reasoning:null,tools:[],lastTurn:{outcome:'done',durationMs:1200},agents:working},5000);
  assert.deepEqual([idle.kind,idle.agents,idle.startedAt],['agents',2,Date.parse('2026-10-01T09:59:50.000Z')],'idle main, two children: «2 agents working», counted from the first start');
  const busy=deriveLiveActivity({running:true,reasoning:null,tools:[],agents:working},5000);
  assert.deepEqual([busy.kind,busy.background],['thinking',2]);
  /* Stage 4: the activity line of the mockup keeps the count beside its own phase. */
  const line=(activity:any)=>activityRow(activityView({running:true,reasoning:null,tools:[]},activity,{key:'k',start:0},0)!,{now:1000,cols:120,glyph:'⠋'}).map(s=>s.text).join('');
  assert.match(line(busy),/^ ⠋ Thinking · 1s · ↓ 0 tokens · 2 agents in background · esc to stop/u);
  assert.doesNotMatch(line({kind:'thinking',startedAt:0}),/background/u);
  const none=deriveLiveActivity({running:false,reasoning:null,tools:[],lastTurn:{outcome:'done',durationMs:1200},agents:[]},5000);
  assert.equal(none.kind,'done','no child: the turn\'s end, as before');
  const starting=deriveLiveActivity({running:false,reasoning:null,tools:[],sentAt:4000,agents:working},5000);
  assert.equal(starting.kind,'starting','a prompt just sent wins over the children');
});

test('ASYNC 3: the footer keeps a child alive after the turn and drops one the kernel ended',()=>{
  const list=live([
    changed('a','created',{kind:'lifecycle',status:'started'}),
    changed('b','created',{kind:'lifecycle',status:'started'}),
    changed('b','completed',{kind:'lifecycle',status:'completed'},{conclusa:true}),
  ]);
  assert.equal(agentsPill(agentCards(list,[],[])).map(segment=>segment.text).join(''),' ← 1 agent ','a works, b ended');
});

test('ASYNC 3: /agents shows the selected agent\'s last three activities and offers x to stop it while it works',()=>{
  const list=live([
    changed('a','created',{kind:'lifecycle',status:'started'}),
    changed('a','updated',{kind:'reasoning',status:'running'}),
    changed('a','updated',{kind:'tool',status:'running',toolName:'leggi'}),
    changed('a','updated',{kind:'tool',status:'running',toolName:'cerca'}),
    changed('a','updated',{kind:'response',status:'running'}),
    changed('quiet','created',{kind:'usage',status:'updated'}),
  ]);
  const rows=[row(),child('a'),child('quiet'),child('done',{outcome:'completed',endedAt:'2026-10-01T10:00:00.000Z'})];
  const input={width:100,nowMs:Date.parse(clock()),currentSessionId:'main',running:false,live:list};
  const onA=agentTreeOverlayLines(createAgentTreeOverlayModel(rows,'a'),input);
  assert.deepEqual(onA.slice(1+rows.length,4+rows.length),['    Read file','    Search files','    Answering'],'the preview comes after the rows, indented');
  assert.match(onA.at(-1)!,/x stop/u,'a working agent can be stopped from the list');
  const quiet=agentTreeOverlayLines(createAgentTreeOverlayModel(rows,'quiet'),input);
  assert.ok(quiet.some(line=>/No recent activity yet\./u.test(line)),'a working child without activity says so');
  const done=agentTreeOverlayLines(createAgentTreeOverlayModel(rows,'done'),input);
  assert.doesNotMatch(done.at(-1)!,/x stop/u,'an ended child cannot be stopped');
  const main=agentTreeOverlayLines(createAgentTreeOverlayModel(rows,'main'),input);
  assert.doesNotMatch(main.at(-1)!,/x stop/u,'the main agent is stopped with Esc, not here');
  assert.equal(onA.length,rows.length+1+3+1,'title, rows, three preview lines, hint');
  assert.equal(stoppableAgent(rows[1]!,list)?.childId,'a');
  assert.equal(stoppableAgent(rows[3]!,list),null,'ended in the list');
  assert.equal(stoppableAgent(child('a',{interrupted:true}),list),null,'stopped in the list');
  assert.equal(stoppableAgent(child('ghost'),list),null,'never announced: nothing says it works');
  assert.equal(stoppableAgent(rows[0]!,list),null,'the main agent');
  assert.equal(stoppableAgent(row({id:'a'}),list),null,'the session in use, even when the kernel announced it as someone\'s child: Esc stops it');
});

test('ASYNC 8: /agents opens on the first working delegated agent (its steps and x stop at once); none working: as before',()=>{
  const rows=[row(),child('done',{outcome:'completed',endedAt:'2026-10-01T10:00:00.000Z'}),child('b'),child('c')];
  const list=live([changed('b','created',{kind:'lifecycle',status:'started'}),changed('c','created',{kind:'lifecycle',status:'started'})]);
  assert.equal(agentListSelection(rows,list,'main'),'b','the first working one, not the main agent');
  assert.equal(agentListSelection(rows,[],'main'),'main','nothing working: the session in use');
  const ended=live([changed('b','created',{kind:'lifecycle',status:'started'}),changed('b','completed',{kind:'lifecycle',status:'completed'},{conclusa:true})]);
  assert.equal(agentListSelection(rows,ended,'main'),'main','an ended agent is not preferred');
  assert.equal(agentListSelection(rows,live([changed('ghost','created',{kind:'lifecycle',status:'started'})]),'main'),'main','an agent the list does not show is not selected');
});

test('ASYNC 3: /agents names its targets by number, id prefix or all; never the main agent',()=>{
  const rows=[row(),child('abffbb84-3fb3-4070-96db-1a8163ab6a61'),child('c0ffee12-0000-4000-8000-000000000000'),child('c0ffee99-0000-4000-8000-000000000000')];
  assert.deepEqual(resolveAgentTargets(rows,'1'),{rows:[rows[1]]});
  assert.deepEqual(resolveAgentTargets(rows,'3'),{rows:[rows[3]]});
  assert.deepEqual(resolveAgentTargets(rows,'abffbb84'),{rows:[rows[1]]},'the 8 characters the start line shows');
  assert.deepEqual(resolveAgentTargets(rows,'ABFF'),{rows:[rows[1]]},'case does not matter');
  assert.deepEqual(resolveAgentTargets(rows,'all'),{rows:rows.slice(1)});
  assert.deepEqual(resolveAgentTargets(rows,'c0ffee'),{error:'ambiguous'});
  assert.deepEqual(resolveAgentTargets(rows,'4'),{error:'unknown'});
  assert.deepEqual(resolveAgentTargets(rows,'0'),{error:'unknown'});
  assert.deepEqual(resolveAgentTargets(rows,'abf'),{error:'unknown'},'three characters are too few to name one');
  assert.deepEqual(resolveAgentTargets(rows,'main'),{error:'unknown'},'the main agent is not a target');
  assert.deepEqual(resolveAgentTargets(rows,undefined),{error:'missing'});
  const command=SLASH_COMMANDS.find(item=>item.name==='agents');
  assert.ok(command,'/agents exists');
  assert.equal(command!.usage,'[stop|show] [n|id|all]');
  assert.doesNotMatch(command!.description,/[àèéìòù]/u);
  assert.equal(parseSlashCommand('/subagents stop all').name,'agents','Codex\'s name for it works too');
  assert.equal(slashTiming('agents'),'now','it runs while a turn is open: it is how a person stops a child mid-turn');
});

/* Desktop, 31/10: a delegation the person stopped comes as conclusa:true, interrotta:false, esitoDelega:'fallito', motivoChiusura:'fermata';
   the screen and v2 called it failed */
test('a sub-agent the person stopped reads stopped, never failed',()=>{
  const [change]=events([changed('a9','completed',{},{conclusa:true,interrotta:false,esitoDelega:'fallito',motivoChiusura:'fermata'})]) as any[];
  assert.equal(change.interrupted,true);assert.equal(change.ended,true);
  const [agent]=reduceLiveAgents([],change);
  assert.equal(agent!.outcome,'stopped');
});

test('a sub-agent that failed by itself still reads failed',()=>{
  const [change]=events([changed('a10','completed',{},{conclusa:true,interrotta:false,esitoDelega:'fallito',motivoChiusura:'errore'})]) as any[];
  assert.equal(change.interrupted,false);
  assert.equal(reduceLiveAgents([],change)[0]!.outcome,'failed');
});
