/*
 * P13 (owner decisions 2026-09-26): the chosen agent's real transcript takes the main view, read-only, event-driven (the
 * replay first, then live, as Claude Code, Codex, OpenCode and Cline show a sub-agent), and the view says when the agent is
 * done. The agent tree says what Enter does; the status line says how to watch the agents at work.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createAgentView} from '../../src/tui/agent-view.ts';
import {agentTreeOverlayLines,createAgentTreeOverlayModel} from '../../src/tui/overlays/agent-tree.ts';
import {activityRow,activityView} from '../../src/tui/activity-line.ts';

const tick=(ms=0)=>new Promise(resolve=>setTimeout(resolve,ms));
const textOf=(state:any)=>state.transcript.items.map((item:any)=>item.text??item.finalOutput??'').join('\n');

function fakeRuntime(history:any[]){
  const sinks=new Set<(event:any)=>void>();
  return{
    subscribe(_id:string,sink:(event:any)=>void){for(const event of history)sink(event);sinks.add(sink);return()=>sinks.delete(sink);},
    emit:(event:any)=>{for(const sink of sinks)sink(event);},
    listeners:()=>sinks.size,
  };
}

test('P13: a running agent is watched live, batched per frame, and its end is seen',async()=>{
  const runtime=fakeRuntime([
    {type:'RunStarted',runId:'c1'},
    {type:'TextMessageStart',messageId:'m1',role:'assistant'},
    {type:'TextMessageContent',messageId:'m1',delta:'Reading the file. '},
  ]);
  const seen:any[]=[];
  const view=createAgentView({runtime,target:{sessionId:'child',task:'read it'},onChange:state=>seen.push(state),batchMs:10});
  assert.equal(seen.length,1,'the replay is shown at once');
  assert.equal(seen[0].running,true);assert.equal(seen[0].done,false);assert.equal(seen[0].task,'read it');
  assert.match(textOf(seen[0]),/Reading the file\./u);
  runtime.emit({type:'TextMessageContent',messageId:'m1',delta:'Almost there. '});
  runtime.emit({type:'TextMessageContent',messageId:'m1',delta:'Done.'});
  await tick(40);
  assert.equal(seen.length,2,'two live events, one screen update');
  assert.match(textOf(seen[1]),/Almost there\. Done\./u);
  runtime.emit({type:'TextMessageEnd',messageId:'m1'});runtime.emit({type:'RunFinished',runId:'c1'});
  await tick(40);
  assert.equal(seen.at(-1).done,true,'the view says the agent is done');assert.equal(seen.at(-1).running,false);
  view.close();assert.equal(runtime.listeners(),0,'closing lets go of the agent');
  runtime.emit({type:'TextMessageContent',messageId:'m1',delta:'late'});await tick(40);
  assert.doesNotMatch(textOf(seen.at(-1)),/late/u,'nothing arrives after close');
});

test('P13: an agent that already finished opens whole and done',()=>{
  const runtime=fakeRuntime([
    {type:'RunStarted',runId:'c1'},
    {type:'TextMessageStart',messageId:'m1',role:'assistant'},{type:'TextMessageContent',messageId:'m1',delta:'All read.'},{type:'TextMessageEnd',messageId:'m1'},
    {type:'RunFinished',runId:'c1'},
  ]);
  let last:any=null;
  createAgentView({runtime,target:{sessionId:'child',task:null},onChange:state=>{last=state;}}).close();
  assert.equal(last.done,true);assert.match(textOf(last),/All read\./u);
});

test('P13: the agent tree says what Enter does, and the status line how to watch',()=>{
  const rows:any[]=[
    {id:'main',parentId:null,level:0,nativeDepth:0,role:'main',focused:true,name:'main',task:null,model:'m',outcome:'running',interrupted:false,startedAt:null,updatedAt:null,endedAt:null,usage:null,collisionCount:0,hasCollision:false,delegationOutcome:null,delegationEvidence:null},
    {id:'child',parentId:'main',level:1,nativeDepth:1,role:'subagent',focused:false,name:null,task:'read it',model:'m',outcome:'running',interrupted:false,startedAt:null,updatedAt:null,endedAt:null,usage:null,collisionCount:0,hasCollision:false,delegationOutcome:null,delegationEvidence:null},
  ];
  const input={width:100,nowMs:0,currentSessionId:'main',running:true};
  assert.match(agentTreeOverlayLines(createAgentTreeOverlayModel(rows,'child'),input).at(-1)!,/Enter watch live/u);
  assert.match(agentTreeOverlayLines(createAgentTreeOverlayModel(rows,'child'),{...input,viewingId:'child'}).at(-1)!,/watching now/u);
  assert.match(agentTreeOverlayLines(createAgentTreeOverlayModel(rows,'main'),{...input,viewingId:'child'}).at(-1)!,/Enter back to main/u);
  assert.match(agentTreeOverlayLines(createAgentTreeOverlayModel(rows,'main'),input).at(-1)!,/Alt\+S steer/u,'without a watched agent the main row keeps its hint');
  /* Stage 4: agents working with no turn of the main agent to report (a resumed session) say how to watch them; a turn
     at work says «esc to stop» instead, and its end says «✓ Done in … · 1 agent working» (the mockup). */
  const line=(state:any,activity:any)=>activityRow(activityView(state,activity,{key:'k',start:0},1)!,{now:1000,cols:120,glyph:'⠋'}).map(s=>s.text).join('');
  assert.equal(line({running:false,reasoning:null,tools:[]},{kind:'agents',startedAt:0,agents:1}),' ⠋ 1 agent working · 1s · alt+a to watch');
  assert.doesNotMatch(line({running:true,reasoning:null,tools:[]},{kind:'thinking',startedAt:0}),/alt\+a/iu);
  assert.equal(line({running:false,reasoning:null,tools:[],lastTurn:{outcome:'done',durationMs:3000}},{kind:'agents',startedAt:0,agents:1}),' ✓ Done in 3s · 1 agent working');
});
