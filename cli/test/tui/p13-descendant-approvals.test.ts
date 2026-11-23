/*
 * P13, owner decision 8 (2026-09-26). Measured on the built CLI before the cure: in manual mode a sub-agent's approval was
 * written on the CHILD's session, the TUI listened only to the parent, and the turn waited forever on "1 agent working".
 * Here: the descendants of the running session are found at every level; the approvals they ask for reach the person's
 * dialog, saying who asks; the answer goes to the child's own session; what a replay already answered is never asked again.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createDescendantApprovals,descendantsOf} from '../../src/tui/descendant-approvals.ts';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';

const tick=(ms=0)=>new Promise(resolve=>setTimeout(resolve,ms));

test('P13: the descendants of a session, at every level, and nothing else',()=>{
  const rows=[
    {sessionId:'main',parentId:null,depth:0},
    {sessionId:'child',parentId:'main',depth:1,delegatedTask:'read the file'},
    {sessionId:'grandchild',parentId:'child',depth:2,delegatedTask:'  '},
    {sessionId:'other',parentId:null,depth:0},
    {sessionId:'cousin',parentId:'other',depth:1},
  ];
  /* 0.6.8 L3-17: a named sub-agent is called by its name */
  assert.deepEqual(descendantsOf([{sessionId:'m',parentId:null},{sessionId:'k',parentId:'m',depth:1,name:'read the file-2',delegatedTask:'read the file'}],'m'),[{sessionId:'k',task:'read the file-2',depth:1}]);
  assert.deepEqual(descendantsOf(rows,'main'),[
    {sessionId:'child',task:'read the file',depth:1},
    {sessionId:'grandchild',task:null,depth:2},
  ]);
  assert.deepEqual(descendantsOf(rows,'child').map(row=>row.sessionId),['grandchild']);
  assert.deepEqual(descendantsOf(rows,'cousin'),[]);
});

function fakeRuntime(){
  const sinks=new Map<string,Set<(event:any)=>void>>();const history=new Map<string,any[]>();const answers:any[]=[];
  let rows:any[]=[{sessionId:'main',parentId:null,depth:0}];
  const r:any={
    restore:async()=>({restored:0,total:0}),start:async()=>'main',listSessions:async()=>rows,export:()=>({eventi:[]}),
    subscribe(id:string,sink:(event:any)=>void){for(const event of history.get(id)??[])sink(event);const set=sinks.get(id)??new Set();set.add(sink);sinks.set(id,set);return()=>set.delete(sink);},
    answerApproval:async(...args:any[])=>{answers.push(args);},cancel:async()=>{},close:async()=>{},
  };
  const emit=(id:string,event:any)=>{for(const sink of sinks.get(id)??[])sink(event);};
  return{r,answers,emit,history,sinks,setRows:(next:any[])=>{rows=next;},listeners:(id:string)=>sinks.get(id)?.size??0};
}

test('P13: a replay hands over only the approvals still waiting; live ones follow; stop lets go of every child',async()=>{
  const f=fakeRuntime();
  f.setRows([{sessionId:'main',parentId:null,depth:0},{sessionId:'child',parentId:'main',depth:1,delegatedTask:'run it'}]);
  f.history.set('child',[
    {type:'RunStarted',runId:'c1'},
    {type:'ApprovalRequested',requestId:'answered',azione:{tipo:'comando',comando:'echo 1'}},
    {type:'ApprovalResolved',requestId:'answered',approvato:true},
    {type:'ApprovalRequested',requestId:'waiting',azione:{tipo:'comando',comando:'echo 2'}},
  ]);
  const required:string[]=[],resolved:string[]=[];
  const watch=createDescendantApprovals({runtime:f.r,intervalMs:10_000,onRequired:(origin,event)=>required.push(`${origin.sessionId}:${origin.task}:${event.requestId}`),onResolved:(_origin,id)=>resolved.push(id)});
  watch.start('main');await watch.sync();
  assert.deepEqual(required,['child:run it:waiting'],'the answered request is not asked again');
  f.emit('child',{type:'ApprovalRequested',requestId:'live',azione:{tipo:'comando',comando:'echo 3'}});
  f.emit('child',{type:'ApprovalResolved',requestId:'live',approvato:false});
  assert.deepEqual(required,['child:run it:waiting','child:run it:live']);
  assert.deepEqual(resolved,['live']);
  await watch.sync();assert.equal(f.listeners('child'),1,'a child is subscribed once');
  watch.stop();assert.equal(f.listeners('child'),0);assert.deepEqual(watch.watching(),[]);
});

test('P13: through the controller, a child\'s approval opens the dialog with its origin and is answered on the child\'s session',async()=>{
  const f=fakeRuntime();let pending:any=null;
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},onApproval:(p:any)=>{pending=p;}} as any);
  const id=(await c.initialize({initialPrompt:'DELEGATE'}))!;
  f.emit(id,{type:'RunStarted',runId:'r1'});
  f.setRows([{sessionId:'main',parentId:null,depth:0},{sessionId:'child',parentId:'main',depth:1,delegatedTask:'FAIL child work'}]);
  for(let i=0;i<40&&f.listeners('child')===0;i++)await tick(25);
  assert.equal(f.listeners('child'),1,'the controller watches the running session\'s child');
  f.emit('child',{type:'ApprovalRequested',requestId:'q1',azione:{tipo:'comando',comando:'cmd /c exit 3'}});
  for(let i=0;i<20&&!pending;i++)await tick(5);
  assert.equal(pending?.requestId,'q1');
  assert.equal(pending?.sessionId,'child');
  assert.deepEqual(pending?.origin,{kind:'agent',task:'FAIL child work'});
  await c.resolveApproval('q1','allow-once');
  assert.deepEqual(f.answers.at(-1),['child','q1',true],'the answer goes to the child\'s session');
  /* ASYNC (owner 01/10, the unified kernel's asynchronous delegations): the parent's run ends while its child still works;
     the child stays watched until the session list says it ended. */
  f.emit(id,{type:'RunFinished'});await tick();
  assert.equal(f.listeners('child'),1,'the run is over but the child is alive: still watched');
  f.setRows([{sessionId:'main',parentId:null,depth:0},{sessionId:'child',parentId:'main',depth:1,delegatedTask:'FAIL child work',outcome:'completed',endedAt:'2026-10-01T10:00:00.000Z'}]);
  f.emit(id,{type:'CUSTOM',name:'talos.agenti',value:{version:1,sessionId:id,parentId:id,childId:'child',reason:'completed',agent:{sessionId:'child',taskCorto:'FAIL child work',conclusa:true},operation:{kind:'lifecycle',status:'completed'}}});
  for(let i=0;i<40&&f.listeners('child')>0;i++)await tick(25);
  assert.equal(f.listeners('child'),0,'the child ended and no run is open: no longer watched');
  c.close();
});

test('ASYNC: a child that starts after the parent\'s turn ended is watched, and its approval says who asks',async()=>{
  const f=fakeRuntime();let pending:any=null;
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},onApproval:(p:any)=>{pending=p;}} as any);
  const id=(await c.initialize({initialPrompt:'DELEGATE'}))!;
  f.emit(id,{type:'RunStarted',runId:'r1'});f.emit(id,{type:'RunFinished'});await tick();
  /* the kernel announces the child to its parent (session-registry.mjs annunciaAgenteAgliAntenati, reason «created») */
  f.setRows([{sessionId:'main',parentId:null,depth:0},{sessionId:'child',parentId:'main',depth:1,delegatedTask:'FAIL child work',outcome:'running'}]);
  f.emit(id,{type:'CUSTOM',name:'talos.agenti',value:{version:1,sessionId:id,parentId:id,childId:'child',reason:'created',agent:{sessionId:'child',taskCorto:'FAIL child work',conclusa:false},operation:{kind:'lifecycle',status:'started'}}});
  for(let i=0;i<40&&f.listeners('child')===0;i++)await tick(25);
  assert.equal(f.listeners('child'),1,'no run is open, yet the new child is watched');
  f.emit('child',{type:'ApprovalRequested',requestId:'q2',azione:{tipo:'comando',comando:'cmd /c exit 3'}});
  for(let i=0;i<20&&!pending;i++)await tick(5);
  assert.equal(pending?.requestId,'q2','the approval reaches the person with no parent run open');
  assert.deepEqual(pending?.origin,{kind:'agent',task:'FAIL child work'});
  c.close();
});

test('B1: the descendants are looked for in what is in memory, never by restoring the archive',async()=>{
  const f=fakeRuntime();const asked:unknown[]=[];
  const original=f.r.listSessions;
  f.r.listSessions=async(options?:unknown)=>{asked.push(options??'all');return original(options);};
  const watch=createDescendantApprovals({runtime:f.r,intervalMs:10_000,onRequired:()=>{},onResolved:()=>{}});
  watch.start('main');await watch.sync();watch.stop();
  assert.deepEqual(asked,[{scope:'loaded'}]);
});
