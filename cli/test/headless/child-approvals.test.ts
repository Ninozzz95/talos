/*
 * 0.6.8 (second review of 0.6.8, finding 4, S3, measured on the built CLI): in `talos -p` only the ROOT's approvals were answered;
 * a sub-agent that read `.env` held the run until RUN_TIMEOUT (180 s), in default and in Full access. The headless runner now
 * follows each child it learns about and decides its approvals as the root's: with nobody in front a secret is refused (default),
 * a plain read inside the project is allowed, and an approval the child asked BEFORE the runner subscribed is answered too.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {collectHeadlessRun} from '../../src/headless/run.ts';

function runtime(childEvents:any[]){
  const answered:any[]=[];const sinks=new Map<string,(e:any)=>void>();
  const r:any={
    start:async()=>'root',
    subscribe(id:string,next:(e:any)=>void){
      sinks.set(id,next);
      if(id==='root')queueMicrotask(()=>{
        next({type:'RunStarted',runId:'r1'});
        next({type:'CUSTOM',name:'talos.agenti',value:{version:1,sessionId:'root',parentId:'root',childId:'child',reason:'created',agent:{conclusa:false}}});
      });
      else if(id==='child')for(const event of childEvents)next(event);   // replayed synchronously, as the registry does
      return()=>{sinks.delete(id);};
    },
    answerApproval:async(...x:any[])=>{
      answered.push(x);
      if(x[0]==='child')queueMicrotask(()=>{
        const root=sinks.get('root');
        root?.({type:'CUSTOM',name:'talos.agenti',value:{version:1,sessionId:'root',parentId:'root',childId:'child',reason:'completed',agent:{conclusa:true}}});
        root?.({type:'RunFinished'});
      });
    },
    cancel:async()=>{},restore:async()=>({restored:0,total:0}),resume:async(x:string)=>x,fork:async()=>'',export:()=>null,close:async()=>{},listSessions:async()=>[],
  };
  return{answered,r};
}
const ask=(path:string,segreto?:object)=>({type:'ApprovalRequested',requestId:'c1',azione:{tipo:'leggi',percorso:path,...(segreto?{segreto}:{})}});

for(const protocolVersion of ['v1','v2'] as const){
  test(`${protocolVersion}: a child's secret read is answered no with nobody in front, not left until the timeout`,async()=>{
    const f=runtime([ask('.env',{classe:'segreto',percorso:'.env'})]);
    const started=Date.now();
    await collectHeadlessRun(f.r,{projectRoot:process.cwd(),prompt:'x',model:'m',permissionMode:'default',protocolVersion,agentWakeGraceMs:0,timeoutSeconds:20,permissionRules:{allow:[],ask:[],deny:[]}} as any,()=>{});
    const child=f.answered.find(row=>row[0]==='child');
    assert.ok(child,'the child\'s approval was answered');
    assert.equal(child[1],'c1');assert.equal(child[2],false);
    assert.ok(Date.now()-started<10_000,'well before the timeout');
  });
}

test('a child\'s plain read inside the project is allowed in default -p',async()=>{
  const f=runtime([ask('README.md')]);
  await collectHeadlessRun(f.r,{projectRoot:process.cwd(),prompt:'x',model:'m',permissionMode:'default',agentWakeGraceMs:0,timeoutSeconds:20,permissionRules:{allow:[],ask:[],deny:[]}} as any,()=>{});
  const child=f.answered.find(row=>row[0]==='child');
  assert.deepEqual(child?.slice(0,3),['child','c1',true]);
});

test('an approval the child already had answered is not answered again',async()=>{
  const f=runtime([ask('README.md'),{type:'ApprovalResolved',requestId:'c1',approvato:true}]);
  await collectHeadlessRun(f.r,{projectRoot:process.cwd(),prompt:'x',model:'m',permissionMode:'default',agentWakeGraceMs:0,timeoutSeconds:3,permissionRules:{allow:[],ask:[],deny:[]}} as any,()=>{});
  assert.equal(f.answered.filter(row=>row[0]==='child').length,0);
});
