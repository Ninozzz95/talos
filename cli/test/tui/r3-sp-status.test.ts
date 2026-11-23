/*
 * R3 lane SP — gate E7, owner decision Q-R3-7: one status derivation with the words starting · thinking · writing ·
 * running <tool> · waiting for you, and after the turn done / interrupted / failed. Before R3, `deriveLiveActivity`
 * knew only idle / tool / thinking (gate §0.1): streaming text, an open approval and a command streaming its output all
 * said "thinking" (review D-08, acceptance s05/s07).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {deriveLiveActivity} from '../../src/tui/live-activity.ts';
import {activityRow,activityView} from '../../src/tui/activity-line.ts';
import {agentRosterLine,mainRosterLine} from '../../src/tui/components/terminal-shell.ts';
import {initialTuiState,reduceTuiEvent} from '../../src/tui/state.ts';

const base={running:true,reasoning:null,tools:[] as {status:string;name?:string}[]};
/* Stage 4: the status row is the approved mockup's activity line (activity-line.ts); the words below are its. */
const line=(state:any,activity:any,glyph='⠋')=>{const view=activityView(state,activity,{key:'k',start:0},0);return view?activityRow(view,{now:2000,cols:120,glyph}).map(s=>s.text).join(''):'';};

test('R3-SP E7: streaming answer text is "writing", not "thinking"',()=>{
  const activity=deriveLiveActivity({...base,streamingAssistant:{id:'m',text:'Hello'}} as any,100);
  assert.equal(activity.kind,'writing');
});

test('R3-SP E7: an open approval dialog is "waiting for you" and wins over everything else',()=>{
  const activity=deriveLiveActivity({...base,streamingAssistant:{id:'m',text:'x'},tools:[{status:'approval',name:'shell'}],waitingForPerson:true} as any,100);
  assert.equal(activity.kind,'waiting');
  assert.match(line({...base,waitingForPerson:true},activity),/^ \? Waiting for your answer · 2s/u);
});

test('R3-SP E7: a command streaming its output is "running <tool>" (it was "thinking")',()=>{
  const activity=deriveLiveActivity({...base,tools:[{status:'streaming',name:'shell'}]} as any,100);
  assert.equal(activity.kind,'tool');
  assert.equal(activity.tool,'Shell');
  assert.match(line({...base,tools:[{id:'t',status:'streaming',name:'shell',argsText:'{"comando":"npm test"}'}]},activity),/^ ⠋ Running npm test · 2s · esc to stop/u);
});

test('R3-SP E7: sent but not yet started is "starting", timed from the send',()=>{
  assert.deepEqual(deriveLiveActivity({running:false,reasoning:null,tools:[],sentAt:42} as any,7),{kind:'starting',startedAt:42});
});

test('R3-SP E7: reasoning without answer text stays "thinking"',()=>{
  assert.equal(deriveLiveActivity({...base,reasoning:{id:'r',text:'hmm'}} as any,1).kind,'thinking');
});

test('R3-SP E7: after the turn the status says done / interrupted / failed with the turn time, frozen',()=>{
  for(const outcome of ['done','interrupted','failed'] as const){
    const activity=deriveLiveActivity({running:false,reasoning:null,tools:[],lastTurn:{outcome,durationMs:12_300}} as any,0);
    assert.equal(activity.kind,outcome);
    assert.equal(activity.frozenMs,12_300);
    const state={running:false,reasoning:null,tools:[],lastTurn:{outcome,durationMs:12_300}};
    const text=line(state,activity,'⠸');
    assert.match(text,new RegExp(`^ [✓■✗] ${{done:'Done in',interrupted:'Stopped after',failed:'Failed after'}[outcome]} 12s$`,'u'));
    assert.equal(text,line(state,activity,'⠋'),'a finished turn does not animate');
  }
});

test('R3-SP E7: the state records how the last turn ended and clears it when a new one is sent',()=>{
  let state=initialTuiState({model:'m',permissionMode:'default'});
  state={...state,sentAt:10} as any;
  state=reduceTuiEvent(state,{type:'run.started',sessionId:'s',runId:'r1'});
  assert.equal((state as any).sentAt,null,'run.started ends "starting"');
  state=reduceTuiEvent(state,{type:'run.completed',runId:'r1'});
  assert.equal((state as any).lastTurn?.outcome,'done');
  state=reduceTuiEvent(state,{type:'run.started',sessionId:'s',runId:'r2'});
  assert.equal((state as any).lastTurn,null);
  state=reduceTuiEvent(state,{type:'run.cancelled',runId:'r2',interrupted:true});
  assert.equal((state as any).lastTurn?.outcome,'interrupted');
  state=reduceTuiEvent(state,{type:'run.started',sessionId:'s',runId:'r3'});
  state=reduceTuiEvent(state,{type:'run.failed',runId:'r3',message:'boom'});
  assert.equal((state as any).lastTurn?.outcome,'failed');
});

test('R3-SP E7: the main roster row shows the CLI activity while a turn is open, not the kernel list word',()=>{
  const row={id:'s',role:'main',name:null,task:null,model:'m',outcome:'unknown',interrupted:false,startedAt:null,endedAt:null,level:0,focused:true,hasCollision:false,collisionCount:0} as any;
  assert.match(agentRosterLine({row,width:100,nowMs:0,status:'starting'} as any),/main · starting/u);
  assert.doesNotMatch(agentRosterLine({row,width:100,nowMs:0,status:'starting'} as any),/unknown/u);
  assert.match(agentRosterLine({row,width:100,nowMs:0}),/main · unknown/u,'without a CLI status the kernel word stays');
  assert.match(mainRosterLine({kind:'waiting',model:'m',width:80}),/main · waiting for you · model m/u);
});

/*
 * Owner decision (R3 follow-up): one vocabulary after a turn. The roster says done / interrupted / failed like the status
 * row, never the kernel's session words (`completed`, `cancelled`, `stopped`), for the main row and for any other row.
 */
test('R3-SP one vocabulary: a roster row after its turn says done / interrupted / failed, not the kernel word',()=>{
  const row={id:'s',role:'main',name:null,task:null,model:'m',outcome:'completed',interrupted:false,startedAt:null,endedAt:null,level:0,focused:true,hasCollision:false,collisionCount:0} as any;
  for(const [outcome,word] of [['completed','done'],['cancelled','interrupted'],['stopped','interrupted'],['interrupted','interrupted'],['failed','failed'],['running','running']] as const){
    assert.match(agentRosterLine({row:{...row,outcome},width:100,nowMs:0}),new RegExp(`main · ${word} `,'u'),outcome);
  }
});
