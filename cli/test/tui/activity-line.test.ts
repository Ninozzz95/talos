/*
 * Stage 4 (owner 01/10, the approved mockup's activity line; owner decisions 02/10): the line says the REAL phase with its
 * own clock (the «⠹ thinking 306.1s» the owner reported was the turn's clock under every phase), the tokens while the model
 * writes, a stall after 30 s without data — only while the model is awaited —, and at the end «✓ Done in …» with the
 * clock stopped and a summary of measured facts only. The working, waiting and retry lines are compared with the golden
 * frames of the mockup (spinner glyph masked: it depends on the animation's instant).
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {activityClock,activityHeader,activityRow,activityView,phaseKey,reasoningHeader,STALL_MS,trackPhase,turnSummary,type ActivityView} from '../../src/tui/activity-line.ts';
import {initialTuiState,reduceTuiEvent,type TuiState} from '../../src/tui/state.ts';
import type {TuiEvent} from '../../src/tui/event-adapter.ts';

/* the activity row of each golden frame (lavoro/mockup-golden), copied once: the tests never read outside the repo */
const GOLDEN:Record<string,string>=JSON.parse(readFileSync(new URL('./fixtures/activity-line-golden.json',import.meta.url),'utf8')).lines;
const goldenLine=(size:string,name:string):string=>GOLDEN[`${size}/${name}`]!;
const text=(row:readonly {text:string}[])=>row.map(s=>s.text).join('').replace(/\s+$/u,'');
const masked=(line:string)=>line.replace(/^ \S /u,' * ');
type Seg={text:string;roles:readonly string[]};
const working=(extra:Partial<Extract<ActivityView,{phase:'working'}>>={}):ActivityView=>({phase:'working',kind:'thinking',header:'Reading the login flow',flow:true,phaseStart:0,modelWaitSince:0,turnStart:0,tokens:0,...extra});

test('the working, waiting and retry lines are the mockup\'s, at 120 and 80 columns',()=>{
  const cases:Array<[string,string,ActivityView,number,number]>=[
    ['120x40','step-03-domande-del-modello-t0',working(),0,120],
    ['120x40','step-03-domande-del-modello-t2s',working({tokens:76,modelWaitSince:2000}),2000,120],
    ['120x40','step-03-domande-del-modello-t6s',working({kind:'tool',header:'Searching for "retry"',flow:false,phaseStart:5800,modelWaitSince:null}),6000,120],
    ['120x40','step-03-domande-del-modello-t12s',{phase:'waiting',phaseStart:6600},12000,120],
    ['80x24','step-03-domande-del-modello-t2s',working({tokens:76,modelWaitSince:2000}),2000,80],
    ['120x40','step-05-stallo-e-nuovi-tentativi-t12s',working({kind:'writing',header:'Writing the answer',phaseStart:10000,turnStart:0,tokens:211,modelWaitSince:12000}),12000,120],
  ];
  for(const [size,name,view,now,cols] of cases)
    assert.equal(masked(text(activityRow(view,{now,cols,glyph:'⠋'}))),masked(goldenLine(size,name)),`${size} ${name}`);
  const retry={attempt:2,maxAttempts:4,status:429,retryAfterMs:null,waitMs:7000,at:0};
  assert.equal(text(activityRow({phase:'retry',retry},{now:0,cols:120,glyph:'⠋'})),goldenLine('120x40','step-05-stallo-e-nuovi-tentativi-t0'));
  assert.equal(text(activityRow({phase:'retry',retry},{now:2000,cols:120,glyph:'⠋'})),goldenLine('120x40','step-05-stallo-e-nuovi-tentativi-t2s'));
});

test('the styles are the mockup\'s roles: accent glyph and bold header, dim clock, faint hint',()=>{
  const row=activityRow(working({tokens:76}),{now:2000,cols:120,glyph:'⠋'});
  assert.deepEqual(row.filter((s:Seg)=>s.text).map((s:Seg)=>[s.text,s.roles.join(' ')]),[[' ⠋ ','acc'],['Reading the login flow','acc b'],[' · 2s','dim'],[' · ↓ 76 tokens','dim'],[' · esc to stop','faint'],['   turn 2s','faint']]);
});

test('the compact clock: seconds, then minutes with two-digit seconds',()=>{
  assert.deepEqual([0,999,59_999,60_000,72_000,3_600_000].map(activityClock),['0s','0s','59s','1m 00s','1m 12s','60m 00s']);
});

/* F-Q4 (owner 03/10, «Solo colore, come Claude Code»): a silence of the model is no sentence; the same line turns to the warning
   colour, counted from the last data, only while the model is awaited. */
test('a silence of the model changes only the colour of the line (F-Q4), counted from the last data',()=>{
  const quietRow=activityRow(working({modelWaitSince:1000}),{now:1000+STALL_MS+5000,cols:120,glyph:'⠋'});
  const stalled=text(quietRow);
  assert.match(stalled,/^ ⠋ Reading the login flow · \d+s .*· esc to stop/u,stalled);
  assert.doesNotMatch(stalled,/No data|still waiting|request stays open/u);
  assert.deepEqual(quietRow.filter((s:Seg)=>s.text).slice(0,2).map((s:Seg)=>s.roles.join(' ')),['warn','warn b'],'the glyph and the header turn to the warning colour');
  assert.deepEqual(activityRow(working({modelWaitSince:1000}),{now:1000+STALL_MS,cols:120,glyph:'⠋'}).filter((s:Seg)=>s.text).slice(0,2).map((s:Seg)=>s.roles.join(' ')),['acc','acc b'],'30 s exactly is not yet a silence');
  assert.match(text(activityRow(working({modelWaitSince:1000}),{now:1000+STALL_MS,cols:120,glyph:'⠋'})),/Reading the login flow/u,'30 s exactly is not yet a stall');
  const tool=text(activityRow(working({kind:'tool',header:'Running npm test',flow:false,modelWaitSince:null}),{now:90_000,cols:120,glyph:'⠋'}));
  assert.equal(tool,' ⠋ Running npm test · 1m 30s · esc to stop   turn 1m 30s','a silent tool keeps its own clock, no stall');
});

test('tokens flow only while the model writes (owner decision 2)',()=>{
  for(const kind of ['thinking','writing'] as const)assert.match(text(activityRow(working({kind,flow:true,tokens:1500}),{now:0,cols:120,glyph:'⠋'})),/ · ↓ 1\.5k tokens/u);
  assert.doesNotMatch(text(activityRow(working({kind:'tool',header:'Calling the github MCP server',flow:false,tokens:1500}),{now:0,cols:120,glyph:'⠋'})),/tokens/u);
});

test('the end of the turn: the clock stops, in the same style, with measured facts only (owner decision 3)',()=>{
  const done:ActivityView={phase:'ended',outcome:'done',ms:72_000,summary:['2 files changed','the model was silent for 48s once']};
  const at=(now:number)=>text(activityRow(done,{now,cols:120,glyph:'⠋'}));
  assert.equal(at(0),' ✓ Done in 1m 12s · 2 files changed · the model was silent for 48s once');
  assert.equal(at(600_000),at(0),'the clock never counts after the turn (Claude Code #98720)');
  assert.equal(text(activityRow({phase:'ended',outcome:'interrupted',ms:12_000,summary:[]},{now:0,cols:120,glyph:'⠋'})),' ■ Stopped after 12s');
  assert.equal(text(activityRow({phase:'ended',outcome:'failed',ms:12_000,summary:['edit denied']},{now:0,cols:120,glyph:'⠋'})),' ✗ Failed after 12s · edit denied');
  assert.deepEqual(activityRow({phase:'ended',outcome:'failed',ms:1,summary:[]},{now:0,cols:120,glyph:'⠋'}).filter((s:Seg)=>s.text).map((s:Seg)=>s.roles.join(' ')),['del','del']);
});

test('the phase has its own start: a new key restarts it, the same key keeps it',()=>{
  const first=trackPhase(null,'thinking|A',100);
  assert.equal(trackPhase(first,'thinking|A',900),first);
  assert.deepEqual(trackPhase(first,'tool|t1',900),{key:'tool|t1',start:900});
});

test('the reasoning header is the last bold title of the summary (Codex), or none',()=>{
  assert.equal(reasoningHeader('**Reading the login flow**\nlooking…\n**Checking the retry timing**\nmore'),'Checking the retry timing');
  assert.equal(reasoningHeader('plain reasoning without a title'),null);
  assert.equal(reasoningHeader('**ab**'),null,'too short to be a title');
});

/* the state the screen keeps, driven by the screen's events */
let clock=0;
function drive(...events:Array<TuiEvent|number>):TuiState{
  let state=initialTuiState({model:'m',permissionMode:'default'});
  const realNow=Date.now;clock=0;Date.now=()=>clock;
  try{for(const event of events){if(typeof event==='number'){clock+=event;continue;}state=reduceTuiEvent(state,event);}}finally{Date.now=realNow;}
  return state;
}
const ev=(type:string,extra:Record<string,unknown>={})=>({type,sessionId:'s1',...extra}) as unknown as TuiEvent;
const started=ev('run.started',{runId:'r1'});

test('the pulse: tokens from the model\'s text, the last data, the turn\'s facts',()=>{
  const s=drive(started,1000,ev('reasoning.started',{messageId:'r'}),ev('reasoning.delta',{messageId:'r',delta:'x'.repeat(40)}),500,ev('message.started',{messageId:'m',role:'assistant'}),ev('message.delta',{messageId:'m',delta:'y'.repeat(8)}));
  assert.equal(s.pulse.tokens,12);
  assert.equal(s.pulse.modelWaitSince,1500);
  const tool=drive(started,ev('tool.started',{toolCallId:'t1',toolName:'shell'}),40_000);
  assert.equal(tool.pulse.modelWaitSince,null,'a running tool is not a wait on the model');
  const back=drive(started,ev('tool.started',{toolCallId:'t1',toolName:'shell'}),40_000,ev('tool.completed',{toolCallId:'t1',content:'ok'}));
  assert.equal(back.pulse.modelWaitSince,40_000,'the model is awaited again once the tool is done');
  const again=drive(started,ev('message.delta',{messageId:'m',delta:'abcd'}),ev('run.completed',{}),ev('run.started',{runId:'r2'}));
  assert.equal(again.pulse.tokens,0,'a new turn starts from zero');
});

test('the summary: files changed, a long silence of the model, a denial, agents still working',()=>{
  const write=(id:string,path:string)=>[ev('tool.started',{toolCallId:id,toolName:'scrivi'}),ev('tool.args',{toolCallId:id,delta:JSON.stringify({percorso:path})}),ev('tool.completed',{toolCallId:id,content:'ok',outcome:{status:'completed'}})];
  const s=drive(started,...write('a','src/a.ts'),...write('b','src/b.ts'),...write('c','src/a.ts'),48_000,ev('message.delta',{messageId:'m',delta:'done'}),ev('run.completed',{}));
  assert.deepEqual(turnSummary(s,0),['2 files changed','the model was silent for 48s once']);
  const denied=drive(started,ev('tool.started',{toolCallId:'e',toolName:'file_edit'}),ev('approval.required',{requestId:'q',toolCallId:'e',payload:{tool:'file_edit'}}),ev('approval.resolved',{requestId:'q',approved:false}),ev('run.completed',{}));
  assert.deepEqual(turnSummary(denied,3),['edit denied','3 agents working']);
  const quiet=drive(started,29_000,ev('message.delta',{messageId:'m',delta:'x'}),ev('run.completed',{}));
  assert.deepEqual(turnSummary(quiet,0),[],'under 30 s the model was not silent: nothing to say');
});

test('the header of each phase, from what the screen knows',()=>{
  const at=(state:TuiState)=>activityHeader(state,{kind:'tool',startedAt:0});
  const search=drive(started,ev('tool.started',{toolCallId:'t',toolName:'cerca'}),ev('tool.args',{toolCallId:'t',delta:'{"testo":"retry"}'}));
  assert.equal(at(search),'Searching for "retry"');
  const read=drive(started,ev('tool.started',{toolCallId:'t',toolName:'leggi'}),ev('tool.args',{toolCallId:'t',delta:'{"percorso":"src/export/"}'}));
  assert.equal(at(read),'Reading src/export/');
  const partial=drive(started,ev('tool.started',{toolCallId:'t',toolName:'leggi'}),ev('tool.args',{toolCallId:'t',delta:'{"perc'}));
  assert.equal(at(partial),'Reading','arguments still streaming: the verb alone');
  const mcp=drive(started,ev('tool.started',{toolCallId:'t',toolName:'mcp__github__create_pr'}));
  assert.equal(at(mcp),'Calling the github MCP server');
  assert.equal(activityHeader(drive(started),{kind:'agents',startedAt:0,agents:3}),'Delegating to 3 agents');
  assert.equal(activityHeader(drive(started,ev('reasoning.delta',{messageId:'r',delta:'**Reading the login flow**'})),{kind:'thinking',startedAt:0}),'Reading the login flow');
  assert.equal(activityHeader(drive(started),{kind:'thinking',startedAt:0}),'Thinking');
  assert.equal(activityHeader(drive(started),{kind:'writing',startedAt:0}),'Writing the answer');
});

test('the view: waiting, retry, working and ended come from the state; a new phase key per tool call',()=>{
  const base=drive(started);
  const mark={key:'k',start:5};
  assert.deepEqual(activityView({...base,waitingForPerson:true},{kind:'waiting',startedAt:0},mark,0),{phase:'waiting',phaseStart:5});
  const think=activityView(base,{kind:'thinking',startedAt:0},mark,0) as Extract<ActivityView,{phase:'working'}>;
  assert.deepEqual([think.phase,think.kind,think.flow,think.phaseStart,think.turnStart],['working','thinking',true,5,0]);
  const tool=activityView(base,{kind:'tool',startedAt:0},mark,0) as Extract<ActivityView,{phase:'working'}>;
  assert.equal(tool.flow,false);assert.equal(tool.modelWaitSince,null,'never a stall during a tool');
  const ended=drive(started,10_000,ev('run.completed',{}));
  assert.deepEqual(activityView(ended,{kind:'done',startedAt:null,frozenMs:10_000},mark,0),{phase:'ended',outcome:'done',ms:10_000,summary:[]});
  const two=drive(started,ev('tool.started',{toolCallId:'a',toolName:'shell'}));
  const other=drive(started,ev('tool.started',{toolCallId:'b',toolName:'shell'}));
  assert.notEqual(phaseKey(two,{kind:'tool',startedAt:0}),phaseKey(other,{kind:'tool',startedAt:0}));
  assert.equal(activityView(drive(),{kind:'idle',startedAt:null},mark,0),null);
});

test('the summary counts every long silence and only the requests the person refused',()=>{
  const twice=drive(started,31_000,ev('message.delta',{messageId:'m',delta:'a'}),40_000,ev('message.delta',{messageId:'m',delta:'b'}),ev('run.completed',{}));
  assert.deepEqual(turnSummary(twice,0),['the model was silent 2 times, the longest 40s']);
  const allowed=drive(started,ev('tool.started',{toolCallId:'e',toolName:'file_edit'}),ev('approval.required',{requestId:'q',toolCallId:'e',payload:{tool:'file_edit'}}),ev('approval.resolved',{requestId:'q',approved:true}),ev('run.completed',{}));
  assert.deepEqual(turnSummary(allowed,0),[],'an allowed request is not a denial');
  const command=drive(started,ev('tool.started',{toolCallId:'c',toolName:'shell'}),ev('approval.required',{requestId:'q',toolCallId:'c',payload:{tool:'shell'}}),ev('approval.resolved',{requestId:'q',approved:false}),ev('run.completed',{}));
  assert.deepEqual(turnSummary(command,0),['command denied']);
});

test('a narrow line shortens the header first: the time and «esc to stop» always stay (s17 at 60 columns)',()=>{
  const long='Running powershell -NoProfile -Command "1..10 | ForEach-Object { line }"';
  const narrow=text(activityRow(working({kind:'tool',header:long,flow:false,modelWaitSince:null}),{now:3000,cols:60,glyph:'⠋'}));
  assert.ok([...narrow].length<=60,`fits 60 columns: ${narrow}`);
  assert.match(narrow,/^ ⠋ Running powershell.*… · 3s · esc to stop$/u);
  const wide=text(activityRow(working({kind:'tool',header:long,flow:false,modelWaitSince:null}),{now:3000,cols:120,glyph:'⠋'}));
  assert.ok(wide.includes(long),'a wide line keeps the whole header');
  const tiny=text(activityRow(working({tokens:1500,background:2}),{now:3000,cols:40,glyph:'⠋'}));
  assert.match(tiny,/· 3s · esc to stop$/u,`the background count and the tokens give way on a very narrow line: ${tiny}`);
  const stalled=text(activityRow(working({modelWaitSince:0}),{now:40_000,cols:80,glyph:'⠋'}));
  /* F-Q4: a silence keeps the working line on a narrow terminal too, with «esc to stop» and no alarm sentence */
  assert.match(stalled,/ · 40s · .*esc to stop$/u,'a narrow silent line keeps its clock and «esc to stop»');
  assert.doesNotMatch(stalled,/still waiting|No data/u);
});

test('a terminal without Unicode gets the ASCII marks',()=>{
  const ascii=(view:ActivityView)=>text(activityRow(view,{now:0,cols:120,glyph:'-',unicode:false}));
  assert.equal(ascii({phase:'ended',outcome:'done',ms:2000,summary:[]}),' + Done in 2s');
  assert.equal(ascii({phase:'ended',outcome:'failed',ms:2000,summary:[]}),' x Failed after 2s');
  assert.equal(ascii({phase:'ended',outcome:'interrupted',ms:2000,summary:[]}),' - Stopped after 2s');
  assert.match(ascii({phase:'retry',retry:{attempt:2,maxAttempts:4,status:429,retryAfterMs:null,waitMs:7000,at:0}}),/^ ~ Retrying/u);
});
