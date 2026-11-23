/*
 * Row 224, fourth road (0.7.0): the plan approved «in a clean conversation», two edges found by the reviewer (23/11/2026).
 * 0. A permission card waiting while the plan is approved stays with its conversation: it does not vanish unanswered,
 *    and a yes given after the move answers the old conversation, never the new one.
 * 1. The view is emptied before the move, so when the clean conversation fails to open the screen shows «Plan failed»
 *    and nothing of the conversation before (the same as /resume of a conversation that fails to open).
 * Real TuiApp (r5a-s-fixture.ts), temp profile, no kernel, no network. Adapted from the reviewer's proof.
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile,sleep,v2} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
let n=0;const project=()=>{const root=join(env.root,`plan-clean-card-${++n}`);mkdirSync(root,{recursive:true});return root;};
const LINT={tipo:'comando',comando:'npm run lint'};
const HASH='sha256:'+'c'.repeat(64);
const OLD=/Done in|Audit the dep|Move the worker|↑91/u;

/* a runtime of our own, so a test can say which session's events arrive and fail the opening of one */
function ownRuntime({failSubscribe}:{failSubscribe?:string}={}){
  const sinks=new Map<string,(event:any)=>void>();const log:string[]=[];
  const runtime={
    listSessions:async()=>[{sessionId:'s1'},{sessionId:'s7'}],
    subscribe(id:string,sink:(event:any)=>void){log.push(`subscribe ${id}`);if(id===failSubscribe)throw Object.assign(new Error('SESSION_NOT_FOUND'),{code:'SESSION_NOT_FOUND'});sinks.set(id,sink);return()=>sinks.delete(id);},
    setPermissionMode:async(id:string,mode:string)=>{log.push(`mode ${id} ${mode}`);},
    answerApproval:async(...args:any[])=>{log.push(`answer ${args.slice(0,3).join(' ')}`);},
    answerPlan:async(id:string,choice:any)=>{log.push(`plan ${id} ${choice.decision}`);},
    resume:async(id:string,prompt?:string)=>{log.push(`resume ${id} ${prompt}`);return id;},
    start:async()=>{log.push('start');return 's1';},
  };
  const emit=(id:string,type:string,data:Record<string,unknown>)=>sinks.get(id)?.(v2(id,type,data));
  return{runtime,emit,log};
}
async function oldConversation(app:any,emit:(id:string,type:string,data:Record<string,unknown>)=>void,{withApproval=false,complete=true}={}){
  const at=new Date().toISOString();
  emit('s1','run.started',{runId:'r1'});
  emit('s1','agent.changed',{childId:'k1',parentId:'s1',reason:'created',kind:'lifecycle',status:'running',task:'Audit the dependencies',startedAt:at});
  emit('s1','usage.updated',{value:{promptTokens:91_234,completionTokens:4_321}});
  emit('s1','plan.required',{requestId:'p1',hash:HASH,content:'1. Move the worker',revision:1});
  await sleep(200);
  if(withApproval){emit('s1','approval.required',{requestId:'q1',azione:LINT});await sleep(400);}
  if(complete){emit('s1','run.completed',{runId:'r1'});await sleep(200);}
  return app.settle();
}
const waitLog=async(log:string[],re:RegExp,ms=3000)=>{for(let i=0;i<ms/25&&!log.some(l=>re.test(l));i++)await sleep(25);return log.some(l=>re.test(l));};

for(const [cols,rows] of [[80,24],[120,40]] as const){
  test(`row 224 ${cols}x${rows}: a permission card waiting while the plan is approved in a clean conversation stays with the conversation before`,async()=>{
    const r=ownRuntime();
    const app=await mountR5a({cols,rows,root:project(),paths:env.paths,runtimeExtra:r.runtime});
    try{
      const before=await oldConversation(app,r.emit,{withApproval:true,complete:false});
      assert.match(before.text,/npm run lint/u,'premise: the card is on screen before the move');
      r.emit('s1','plan.resolved',{requestId:'p1',status:'approved',decision:'clean-conversation',newSessionId:'s7',by:'device'});
      assert.ok(await waitLog(r.log,/^subscribe s7/u),'premise: the screen moved to s7');
      await sleep(600);
      const afterMove=await app.settle();
      assert.match(afterMove.text,/npm run lint/u,`the card of s1 vanished without an answer:\n${afterMove.text}`);
      app.press('1');await waitLog(r.log,/^answer /u,2000);await sleep(400);
      const answer=r.log.find(l=>/^answer /u.test(l))??null;
      assert.match(String(answer),/^answer s1 q1 /u,`the yes went to the wrong conversation: ${r.log.join(' | ')}`);
    }finally{app.unmount();await sleep(50);}
  });

  test(`row 224 ${cols}x${rows}: when the clean conversation fails to open, the view is already empty and says «Plan failed»`,async()=>{
    const r=ownRuntime({failSubscribe:'s7'});
    const app=await mountR5a({cols,rows,root:project(),paths:env.paths,runtimeExtra:r.runtime});
    try{
      const before=await oldConversation(app,r.emit);
      assert.match(before.text,OLD,'premise: the conversation before is on screen');
      r.emit('s1','plan.resolved',{requestId:'p1',status:'approved',decision:'clean-conversation',newSessionId:'s7',by:'person'});
      assert.ok(await waitLog(r.log,/^subscribe s7/u),'premise: the move to s7 was tried');
      await sleep(600);
      const afterFail=await app.settle();
      assert.match(afterFail.text,/Plan failed/u,`no «Plan failed» on screen:\n${afterFail.text}`);
      assert.doesNotMatch(afterFail.text,OLD,`the conversation before is still on screen after the failed move:\n${afterFail.text}`);
    }finally{app.unmount();await sleep(50);}
  });
}
