import assert from 'node:assert/strict';
import test from 'node:test';
import {activityRow,activityView} from '../../src/tui/activity-line.ts';
import {deriveLiveActivity,type LiveActivity} from '../../src/tui/live-activity.ts';
import {initialTuiState,reduceTuiEvent,type TuiState} from '../../src/tui/state.ts';

/* Stage 4: the end of a turn is the mockup's activity line («✓ Done in 0s», «■ Stopped after …», «✗ Failed after …»). */
const text=(state:TuiState,activity:LiveActivity,glyph='⠋')=>{
  const view=activityView(state,activity,{key:'k',start:0},0);
  return view?activityRow(view,{now:999_999,cols:120,glyph,unicode:false}).map(s=>s.text).join(''):'';
};
const WORDS={done:'Done in',interrupted:'Stopped after',failed:'Failed after'} as const;

for(const [id,outcome,duration,event] of [
  ['DONE','done',200,{type:'run.completed',runId:'r'}],
  ['CANCELLED','interrupted',450,{type:'run.cancelled',runId:'r',interrupted:true}],
  ['FAILED','failed',1200,{type:'run.failed',runId:'r',message:'fixture failure'}],
] as const){
  test(`REV-FAST-DURATION-${id}: a fast turn without reasoning or tools retains its final duration`,ctx=>{
    let now=1000;
    ctx.mock.method(Date,'now',()=>now);
    let state=initialTuiState({model:'fixture',permissionMode:'default'});
    state=reduceTuiEvent(state,{type:'run.started',sessionId:'s',runId:'r'});
    now+=duration;
    state=reduceTuiEvent(state,event);
    const activity=deriveLiveActivity(state,1000);
    assert.equal(activity.kind,outcome);
    assert.equal(activity.frozenMs,duration);
    assert.match(text(state,activity),new RegExp(`${WORDS[outcome]} ${Math.floor(duration/1000)}s$`,'u'));
  });
}

test('REV-FAST-DURATION-FROZEN: later renders cannot advance a completed turn',ctx=>{
  let now=1000;
  ctx.mock.method(Date,'now',()=>now);
  let state=reduceTuiEvent(initialTuiState({model:'fixture',permissionMode:'default'}),{type:'run.started',sessionId:'s',runId:'r'});
  now=3200;
  state=reduceTuiEvent(state,{type:'run.completed',runId:'r'});
  const first=deriveLiveActivity(state,1000);
  now=100_000;
  const later=deriveLiveActivity(state,90_000);
  assert.match(text(state,first),/Done in 2s$/u);
  assert.equal(text(state,later,'x'),text(state,first));
});

test('REV-FAST-DURATION-ZERO: a measured zero is visible in every final state',()=>{
  for(const outcome of ['done','interrupted','failed'] as const){
    const state={...initialTuiState({model:'m',permissionMode:'default'}),lastTurn:{outcome,durationMs:0}};
    assert.match(text(state,{kind:outcome,startedAt:null,frozenMs:0}),new RegExp(`${WORDS[outcome]} 0s$`,'u'));
  }
});

test('REV-FAST-DURATION-UNKNOWN: missing duration remains absent, distinct from measured zero',()=>{
  for(const outcome of ['done','interrupted','failed'] as const){
    const state={...initialTuiState({model:'m',permissionMode:'default'}),lastTurn:{outcome,durationMs:null}};
    assert.doesNotMatch(text(state,{kind:outcome,startedAt:null,frozenMs:null}),/\d/u);
  }
});

for(const [id,event] of [
  ['DONE',{type:'run.completed',runId:'old'}],
  ['CANCELLED',{type:'run.cancelled',runId:'old',interrupted:true}],
  ['FAILED',{type:'run.failed',runId:'old',message:'historical failure'}],
] as const){
  test(`REV-FAST-DURATION-REPLAY-${id}: history never measures replay as a turn, then a live turn measures normally`,ctx=>{
    let now=1000;
    ctx.mock.method(Date,'now',()=>now);
    let state=reduceTuiEvent(initialTuiState({model:'fixture',permissionMode:'default'}),{type:'run.started',sessionId:'s',runId:'old',history:true});
    now+=200;
    state=reduceTuiEvent(state,event);
    assert.equal(state.lastTurn?.durationMs,null,'replay elapsed time is not the original turn duration');
    assert.doesNotMatch(text(state,deriveLiveActivity(state,1000)),/\d/u);
    state=reduceTuiEvent(state,{type:'run.started',sessionId:'s',runId:'live'});
    now+=2000;
    state=reduceTuiEvent(state,{type:'run.completed',runId:'live'});
    const live=deriveLiveActivity(state,1200);
    assert.equal(live.frozenMs,2000);
    assert.match(text(state,live),/Done in 2s$/u);
  });
}

test('REV-FAST-DURATION-IDLE: idle and error never display a line',()=>{
  const state=initialTuiState({model:'m',permissionMode:'default'});
  for(const kind of ['idle','error'] as const)assert.equal(text(state,{kind,startedAt:null}),'');
});
