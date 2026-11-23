/*
 * A5h, the wiring: through the controller, a child's marked card in acceptEdits reaches the dialog with four choices (the CLI lifted
 * the mark: the origin says it is a child); the same marked card of the session the person is in keeps two. Same fake runtime as
 * p13-descendant-approvals.test.ts.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';
import {approvalChoicesFor} from '../../src/tui/overlays/approval-dialog.ts';

const tick=(ms=0)=>new Promise(resolve=>setTimeout(resolve,ms));
function fakeRuntime(){
  const sinks=new Map<string,Set<(event:any)=>void>>();const answers:any[]=[];
  let rows:any[]=[{sessionId:'main',parentId:null,depth:0}];
  const r:any={
    restore:async()=>({restored:0,total:0}),start:async()=>'main',listSessions:async()=>rows,export:()=>({eventi:[]}),
    subscribe(id:string,sink:(event:any)=>void){const set=sinks.get(id)??new Set();set.add(sink);sinks.set(id,set);return()=>set.delete(sink);},
    answerApproval:async(...args:any[])=>{answers.push(args);},cancel:async()=>{},close:async()=>{},
  };
  const emit=(id:string,event:any)=>{for(const sink of sinks.get(id)??[])sink(event);};
  return{r,answers,emit,setRows:(next:any[])=>{rows=next;},listeners:(id:string)=>sinks.get(id)?.size??0};
}

test('A5h: in acceptEdits a child\'s marked card has three choices, the root\'s keeps two',async()=>{
  const f=fakeRuntime();let pending:any=null;
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'acceptEdits',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},onApproval:(p:any)=>{pending=p;}} as any);
  const id=(await c.initialize({initialPrompt:'DELEGATE'}))!;
  f.emit(id,{type:'RunStarted',runId:'r1'});
  f.setRows([{sessionId:'main',parentId:null,depth:0},{sessionId:'child',parentId:'main',depth:1,delegatedTask:'run the tests'}]);
  for(let i=0;i<40&&f.listeners('child')===0;i++)await tick(25);
  f.emit('child',{type:'ApprovalRequested',requestId:'q1',azione:{tipo:'shell',comando:'npm test',sempreNonBasta:true}});
  for(let i=0;i<20&&!pending;i++)await tick(5);
  assert.equal(pending?.sessionId,'child');
  assert.equal(pending?.action?.alwaysNotEnough,undefined,'the child\'s card: mark lifted');
  assert.equal(approvalChoicesFor(pending.action).length,3,'once, for this session, deny');
  await c.resolveApproval('q1','deny-once');pending=null;
  f.emit(id,{type:'ApprovalRequested',requestId:'q2',azione:{tipo:'shell',comando:'npm test',sempreNonBasta:true}});
  for(let i=0;i<20&&!pending;i++)await tick(5);
  assert.equal(pending?.sessionId,id);
  assert.equal(pending?.action?.alwaysNotEnough,true,'the root\'s card keeps the mark');
  assert.equal(approvalChoicesFor(pending.action).length,2);
  c.close();
});
