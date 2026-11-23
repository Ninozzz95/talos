/*
 * R3 lane SP — gate E3 / E4 / E10 / E12 (owner decisions Q-R3-1/2/3/4/15). The row of a tool states who ran it, why it was
 * allowed to run, its exit code, duration and isolation; these facts existed in the kernel events and the permission
 * engine and were dropped on the way to the screen (gate §0.4-§0.6):
 * - the model's tools: receipt evidence `exitCode` / `sandboxEnforcement` and `durataMs` (talosHarness.mjs:8661-8675);
 * - the person's `!` command: `ComandoUtenteIniziato` + `ToolCallStart{shell}` … `ComandoUtenteFinito{codice,enforcement}`
 *   (agent-service.mjs:2124-2168), dropped by the v2 bridge;
 * - the engine's allow `source` (permission-engine.ts:38-42) and the person's answer, dropped by the coordinator;
 * - the written file's before/after (`StateDelta /file/<path>`, agui-events.mjs:427-436), dropped by the bridge.
 * E12 / Q-R3-15: a replayed approval of a run that is not open never opens the dialog.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiEventAdapter,type TuiEvent} from '../../src/tui/event-adapter.ts';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';

const SANDBOX='⛉ sandbox (microsoft-mxc-0.8.0) — isolation verified: AppContainer on, filesystem bfs, network deny, process tree job';
const HOST='⛶ host · not isolated — no verified Windows sandbox backend';
const tick=(ms=0)=>new Promise(r=>setTimeout(r,ms));

function adapter(secrets:string[]=[]){const a=createTuiEventAdapter(secrets);a.bindSession('s1');return a;}
const ofType=<T extends TuiEvent['type']>(events:readonly TuiEvent[],type:T)=>events.filter(e=>e.type===type) as Extract<TuiEvent,{type:T}>[];

test('R3-SP E3: a model command\'s exit code, duration and isolation reach the screen as tool.facts',()=>{
  const a=adapter();
  const events=a.translateAll({type:'ToolCallResult',toolCallId:'t1',content:'exit 2 [sandbox: x]\nboom',durataMs:1234,receipt:{status:'failed',consentito:true,evidence:{exitCode:2,sandboxEnforcement:SANDBOX}}});
  assert.equal(events[0]?.type,'tool.completed');
  assert.deepEqual(ofType(events,'tool.facts').map(e=>[e.toolCallId,e.facts]),[['t1',{exitCode:2,durationMs:1234,isolation:'sandbox'}]]);
  const host=a.translateAll({type:'ToolCallResult',toolCallId:'t2',content:'exit 0',receipt:{status:'succeeded',consentito:true,evidence:{exitCode:0,sandboxEnforcement:HOST}}});
  assert.deepEqual(ofType(host,'tool.facts')[0]?.facts,{exitCode:0,isolation:'host'});
});

test('R3-SP E3: a tool with no measured facts gets none (never a zero that means "unknown")',()=>{
  const events=adapter().translateAll({type:'ToolCallResult',toolCallId:'t3',content:'file text',receipt:{status:'succeeded',consentito:true}});
  assert.deepEqual(ofType(events,'tool.facts'),[]);
  const unknown=adapter().translateAll({type:'ToolCallResult',toolCallId:'t4',content:'x',receipt:{status:'succeeded',consentito:true,evidence:{exitCode:0,sandboxEnforcement:'none'}}});
  assert.deepEqual(ofType(unknown,'tool.facts')[0]?.facts,{exitCode:0},'an enforcement the CLI did not annotate states no isolation');
});

test('R3-SP E10: a written file\'s before/after becomes file.changed, tied to the open write call, redacted',()=>{
  const a=adapter(['sekret-value']);
  a.translateAll({type:'ToolCallStart',toolCallId:'w1',toolCallName:'scrivi'});
  a.translateAll({type:'ToolCallArgs',toolCallId:'w1',delta:'{"percorso":"src/a.ts","contenuto":"x"}'});
  a.translateAll({type:'ToolCallStart',toolCallId:'r1',toolCallName:'leggi'});
  a.translateAll({type:'ToolCallArgs',toolCallId:'r1',delta:'{"percorso":"src/b.ts"}'});
  const events=a.translateAll({type:'StateDelta',delta:[{op:'replace',path:'/file/src/a.ts',value:'new sekret-value\n',prima:'old\n'}]});
  const changes=ofType(events,'file.changed').map(e=>'change' in e?e.change:null);
  assert.equal(changes.length,1);
  assert.equal(changes[0]?.path,'src/a.ts');
  assert.equal(changes[0]?.before,'old\n');
  assert.equal(changes[0]?.after.includes('sekret-value'),false,'the after text is redacted like every v2 string');
  assert.equal(changes[0]?.toolCallId,'w1');
  const created=a.translateAll({type:'StateDelta',delta:[{op:'add',path:'/file/new.md',value:'# hi\n'}]});
  assert.deepEqual(ofType(created,'file.changed').map(e=>'change' in e?e.change:null),[{path:'new.md',before:null,after:'# hi\n'}]);
  const unknownBefore=a.translateAll({type:'StateDelta',delta:[{op:'replace',path:'/file/c.ts',value:'x'}]});
  assert.deepEqual(ofType(unknownBefore,'file.changed'),[],'a replaced file whose before is unknown is not shown as new');
  const usage=a.translateAll({type:'StateDelta',delta:[{op:'replace',path:'/usage',value:{prompt_tokens:1,completion_tokens:1}}]});
  assert.equal(usage[0]?.type,'usage.updated');
});

function fakeRuntime(history:any[]=[],outcome='completed'){
  const sinks=new Map<string,(e:any)=>void>();const answers:any[]=[];
  const r:any={
    restore:async()=>({restored:1,total:1}),listSessions:async()=>[{sessionId:'s1',outcome}],export:()=>({eventi:[]}),
    start:async()=>'s1',resume:async(id:string)=>id,fork:async()=>'f1',compact:async()=>({ok:true}),
    subscribe(id:string,sink:(e:any)=>void){sinks.set(id,sink);for(const e of history)sink(e);return()=>sinks.delete(id);},
    answerApproval:async(...a:any[])=>{answers.push(a);},cancel:async()=>{},close:async()=>{},shell:async()=>{},
  };
  return{r,sinks,answers};
}
function controller(f:ReturnType<typeof fakeRuntime>,events:any[],approvals:any[]=[],rules:any={allow:[],ask:[],deny:[]},mode='default'){
  return createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode,rules,autoClassifier:async()=>'allow',onEvent:(e:any)=>events.push(e),onApproval:(p:any)=>approvals.push(p)} as any);
}
const personCommand=(finish:Record<string,unknown>)=>[
  {type:'ComandoUtenteIniziato',comandoId:'c1',comando:'npm test'},
  {type:'ToolCallStart',toolCallId:'t1',toolCallName:'shell'},
  {type:'ToolCallArgs',toolCallId:'t1',delta:'{"comando":"npm test"}'},
  {type:'ToolCallResult',toolCallId:'t1',content:'exit 0 [sandbox: x]\nok'},
  {type:'ComandoUtenteFinito',comandoId:'c1',...finish},
];

test('R3-SP E4: the person\'s ! command is theirs (origin person, why typed) with its exit code, isolation and duration',async()=>{
  const f=fakeRuntime();const events:any[]=[];const c=controller(f,events);c.attach('s1');
  const [start,...rest]=personCommand({codice:3,enforcement:HOST});
  f.sinks.get('s1')!(start);f.sinks.get('s1')!(rest[0]);await tick(15);for(const e of rest.slice(1))f.sinks.get('s1')!(e);
  assert.deepEqual(events.filter(e=>e.type==='tool.origin').map(e=>[e.toolCallId,e.origin]),[['t1','person']]);
  assert.deepEqual(events.filter(e=>e.type==='tool.decision').map(e=>[e.toolCallId,e.decision]),[['t1',{kind:'typed'}]]);
  const facts=events.filter(e=>e.type==='tool.facts');
  assert.equal(facts.length,1);assert.equal(facts[0].toolCallId,'t1');
  assert.equal(facts[0].facts.exitCode,3);assert.equal(facts[0].facts.isolation,'host');
  assert.ok(typeof facts[0].facts.durationMs==='number'&&facts[0].facts.durationMs>=10,`measured live: ${facts[0].facts.durationMs}`);
});

test('R3-SP E4: the model\'s shell call is not the person\'s, and a replayed ! command states no observer duration',async()=>{
  const f=fakeRuntime([...personCommand({codice:0,enforcement:SANDBOX})]);const events:any[]=[];const c=controller(f,events);
  await c.resumeSession('s1');
  assert.deepEqual(events.filter(e=>e.type==='tool.origin').map(e=>e.origin),['person']);
  assert.deepEqual(events.find(e=>e.type==='tool.facts')?.facts,{exitCode:0,isolation:'sandbox'});
  f.sinks.get('s1')!({type:'ToolCallStart',toolCallId:'m1',toolCallName:'shell'});
  assert.equal(events.filter(e=>e.type==='tool.origin').length,1,'a model call is never marked as the person\'s');
});

test('R3-SP E4: why a model tool ran — an allow rule, or the person\'s answer', async()=>{
  const f=fakeRuntime();const events:any[]=[];const approvals:any[]=[];
  const c=controller(f,events,approvals,{allow:['Bash(npm test)'],ask:[],deny:[]});c.attach('s1');
  f.sinks.get('s1')!({type:'RunStarted',runId:'r1',threadId:'s1'});
  f.sinks.get('s1')!({type:'ApprovalRequested',requestId:'q1',azione:{tipo:'shell',comando:'npm test',toolCallId:'a1'}});
  await tick();
  assert.deepEqual(events.filter(e=>e.type==='tool.decision').map(e=>[e.toolCallId,e.decision]),[['a1',{kind:'rule',rule:'Bash(npm test)'}]]);
  f.sinks.get('s1')!({type:'ApprovalRequested',requestId:'q2',azione:{tipo:'shell',comando:'npm run build',toolCallId:'a2'}});
  await tick();
  assert.equal(approvals.at(-1)?.requestId,'q2');
  await c.resolveApproval('q2','allow-session');
  assert.deepEqual(events.filter(e=>e.type==='tool.decision').at(-1),{type:'tool.decision',toolCallId:'a2',decision:{kind:'session'}});
  f.sinks.get('s1')!({type:'ApprovalRequested',requestId:'q3',azione:{tipo:'shell',comando:'npm run build',toolCallId:'a3'}});
  await tick();
  assert.deepEqual(events.filter(e=>e.type==='tool.decision').at(-1),{type:'tool.decision',toolCallId:'a3',decision:{kind:'session'}},'the session grant answers the next identical request');
  f.sinks.get('s1')!({type:'ApprovalRequested',requestId:'q4',azione:{tipo:'shell',comando:'rm -rf build',toolCallId:'a4'}});
  await tick();await c.resolveApproval('q4','allow-once');
  assert.deepEqual(events.filter(e=>e.type==='tool.decision').at(-1)?.decision,{kind:'once'});
  f.sinks.get('s1')!({type:'ApprovalRequested',requestId:'q5',azione:{tipo:'shell',comando:'rm -rf dist',toolCallId:'a5'}});
  await tick();const before=events.filter(e=>e.type==='tool.decision').length;await c.resolveApproval('q5','deny-once');
  assert.equal(events.filter(e=>e.type==='tool.decision').length,before,'a denied tool did not run: no why');
});

test('R3-SP E4: accept-edits, full access and auto are named as the why',async()=>{
  for(const [mode,expected] of [['acceptEdits','accept-edits'],['bypassPermissions','full-access'],['auto','auto']] as const){
    const f=fakeRuntime();const events:any[]=[];const c=controller(f,events,[],{allow:[],ask:[],deny:[]},mode);c.attach('s1');
    f.sinks.get('s1')!({type:'ApprovalRequested',requestId:'q',azione:{tipo:'scrivi',percorso:'src/x.ts',toolCallId:'w'}});
    await tick();
    assert.deepEqual(events.filter(e=>e.type==='tool.decision').map(e=>e.decision.kind),[expected],mode);
  }
});

test('R3-SP E12 / Q-R3-15: a replayed approval of a run that is no longer open never opens the dialog',async()=>{
  const history=[{type:'RunStarted',runId:'r1',threadId:'s1'},{type:'ApprovalRequested',requestId:'old',azione:{tipo:'shell',comando:'npm run x',toolCallId:'t9'}}];
  const f=fakeRuntime(history,'stopped');const events:any[]=[];const approvals:any[]=[];const c=controller(f,events,approvals);
  await c.resumeSession('s1');await tick(5);
  assert.deepEqual(approvals.filter(Boolean).map(a=>a.requestId),[],`E12: a dead approval opened the dialog`);
  assert.equal(f.answers.length,0,'nothing is answered for a request of a run that is over');
  const answered=fakeRuntime([...history,{type:'ApprovalResolved',requestId:'old',approvato:true}],'completed');const seen:any[]=[];
  await controller(answered,[],seen).resumeSession('s1');await tick(5);
  assert.deepEqual(seen.filter(Boolean),[],'a replayed, already answered approval never opens');
});

test('R3-SP E12: a replayed approval of the run still waiting in the kernel does open, once the replay is over',async()=>{
  const history=[{type:'RunStarted',runId:'r1',threadId:'s1'},{type:'ApprovalRequested',requestId:'live',azione:{tipo:'shell',comando:'npm run x',toolCallId:'t9'}}];
  const f=fakeRuntime(history,'running');const approvals:any[]=[];const c=controller(f,[],approvals);
  await c.resumeSession('s1');await tick(5);
  assert.deepEqual(approvals.filter(Boolean).map(a=>a.requestId),['live']);
});

test('R3-SP E12: a live approval resolved before its dialog could open does not open it',async()=>{
  const f=fakeRuntime();const approvals:any[]=[];const c=controller(f,[],approvals);c.attach('s1');
  f.sinks.get('s1')!({type:'RunStarted',runId:'r1',threadId:'s1'});
  f.sinks.get('s1')!({type:'ApprovalRequested',requestId:'q',azione:{tipo:'shell',comando:'npm run x',toolCallId:'t'}});
  f.sinks.get('s1')!({type:'ApprovalResolved',requestId:'q',approvato:false});
  f.sinks.get('s1')!({type:'RunError',runId:'r1',code:'fermato',message:'x'});
  await tick(5);
  assert.deepEqual(approvals.filter(Boolean),[],'the dialog opened after its request was already answered');
});

test('R3-SP E10: a change whose path no argument names goes to the only open call; with two open calls it names none',()=>{
  const a=adapter();
  a.translateAll({type:'ToolCallStart',toolCallId:'w2',toolCallName:'scrivi'});
  a.translateAll({type:'ToolCallArgs',toolCallId:'w2',delta:'{"target":"docs/x.md"}'});
  const only=a.translateAll({type:'StateDelta',delta:[{op:'add',path:'/file/docs/x.md',value:'x'}]});
  assert.equal((ofType(only,'file.changed')[0] as any)?.change?.toolCallId,'w2');
  a.translateAll({type:'ToolCallStart',toolCallId:'w3',toolCallName:'scrivi'});
  const two=a.translateAll({type:'StateDelta',delta:[{op:'add',path:'/file/docs/y.md',value:'y'}]});
  assert.equal((ofType(two,'file.changed')[0] as any)?.change?.toolCallId,undefined,'ambiguous: lane RD matches by path');
});

/*
 * Coordinator (R3 acceptance, R3-ROW red on the real TUI): with the real kernel, `ApprovalResolved` arrives DURING the
 * await of the answer; processEvent then dropped the request → tool link, and the person's answer never reached the row
 * (`you allowed once` missing). The link is taken before the await.
 */
test('R3-SP E4: the person\'s answer reaches the row even when the runtime resolves the approval inside the answer',async()=>{
  const f=fakeRuntime();const events:any[]=[];const approvals:any[]=[];
  f.r.answerApproval=async(id:string,requestId:string,approved:boolean)=>{f.answers.push([id,requestId,approved]);f.sinks.get(id)!({type:'ApprovalResolved',requestId,approvato:approved});};
  const c=controller(f,events,approvals);c.attach('s1');
  f.sinks.get('s1')!({type:'RunStarted',runId:'r1',threadId:'s1'});
  f.sinks.get('s1')!({type:'ApprovalRequested',requestId:'q1',azione:{tipo:'shell',comando:'cmd /c dir /b',toolCallId:'t1'}});
  await tick();
  assert.equal(approvals.at(-1)?.requestId,'q1');
  await c.resolveApproval('q1','allow-once');
  assert.deepEqual(events.filter(e=>e.type==='tool.decision').map(e=>[e.toolCallId,e.decision]),[['t1',{kind:'once'}]],'R3-ROW: "you allowed once" never reached the row');
});

/*
 * Q-R3-13 (owner, already decided; R3 follow-up): `Full access` is the why of EVERY row that ran in bypass mode, including
 * the tools the kernel ran without asking (only rows the CLI engine allowed carried it). A refused tool did not run, the
 * person's `!` command is theirs (`typed by you`), and a row the person answered keeps that answer.
 */
test('R3-SP Q-R3-13: in bypass mode every tool that ran carries Full access, once; refused and typed rows do not',async()=>{
  const f=fakeRuntime();const events:any[]=[];const c=controller(f,events,[],{allow:[],ask:[],deny:[]},'bypassPermissions');c.attach('s1');
  const sink=f.sinks.get('s1')!;
  sink({type:'RunStarted',runId:'r1',threadId:'s1'});
  sink({type:'ToolCallStart',toolCallId:'w1',toolCallName:'scrivi'});
  sink({type:'ToolCallResult',toolCallId:'w1',content:'written',receipt:{status:'succeeded',consentito:true}});
  sink({type:'ToolCallStart',toolCallId:'s2',toolCallName:'shell'});
  sink({type:'ApprovalRequested',requestId:'q',azione:{tipo:'shell',comando:'npm run build',toolCallId:'s2'}});
  await tick();
  sink({type:'ToolCallResult',toolCallId:'s2',content:'exit 0',receipt:{status:'succeeded',consentito:true,evidence:{exitCode:0}}});
  sink({type:'ToolCallStart',toolCallId:'x3',toolCallName:'scrivi'});
  sink({type:'ToolCallResult',toolCallId:'x3',content:'refused',receipt:{status:'denied',consentito:false,via:'permesso-per-attrezzo-nega'}});
  for(const e of personCommand({codice:0,enforcement:HOST}))sink(e);
  const decisions=events.filter(e=>e.type==='tool.decision').map(e=>[e.toolCallId,e.decision.kind]);
  assert.deepEqual(decisions,[['w1','full-access'],['s2','full-access'],['t1','typed']],JSON.stringify(decisions));
  const plain=fakeRuntime();const seen:any[]=[];const d=controller(plain,seen);d.attach('s1');
  plain.sinks.get('s1')!({type:'ToolCallStart',toolCallId:'w1',toolCallName:'scrivi'});
  plain.sinks.get('s1')!({type:'ToolCallResult',toolCallId:'w1',content:'written',receipt:{status:'succeeded',consentito:true}});
  assert.deepEqual(seen.filter(e=>e.type==='tool.decision'),[],'outside bypass mode a tool nobody was asked about has no why');
});

test('R3-SP Q-R3-13: when the engine\'s answer lands after the result, the row still gets Full access once',async()=>{
  const f=fakeRuntime();const events:any[]=[];const c=controller(f,events,[],{allow:[],ask:[],deny:[]},'bypassPermissions');c.attach('s1');
  const sink=f.sinks.get('s1')!;
  sink({type:'RunStarted',runId:'r1',threadId:'s1'});
  sink({type:'ToolCallStart',toolCallId:'s9',toolCallName:'shell'});
  sink({type:'ApprovalRequested',requestId:'q9',azione:{tipo:'shell',comando:'npm run build',toolCallId:'s9'}});
  sink({type:'ToolCallResult',toolCallId:'s9',content:'exit 0',receipt:{status:'succeeded',consentito:true,evidence:{exitCode:0}}});
  await tick();
  assert.deepEqual(events.filter(e=>e.type==='tool.decision').map(e=>[e.toolCallId,e.decision.kind]),[['s9','full-access']]);
});
