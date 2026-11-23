/*
 * Ticket C-005/C-006 (benchmark lane, 01/10; owner: «in headless un tool negato torna al modello come errore del tool»).
 * Before: a denied approval in `talos -p` failed the whole run (PERMISSION_REQUIRED/DENIED) and cancelled it, so the model
 * never saw an error it could recover from — 7 of 20 valid benchmark trials ended that way. Now the denial is answered to
 * the kernel with a reason for the model, the run goes on, and the result lists every denial (`permissionDenials`, as
 * Claude Code's print mode lists `permission_denials`; Codex answers a rejection to the model, core/src/tools/events.rs).
 */
import assert from 'node:assert/strict';import test from 'node:test';
import {collectHeadlessRun} from '../../src/headless/run.ts';

function deniedRuntime(azione:Record<string,unknown>){
  let sink:((event:unknown)=>void)|null=null;const answered:unknown[][]=[];let cancelled=0;
  const runtime:any={
    start:async()=>'s',restore:async()=>({restored:0,total:0}),resume:async(x:string)=>x,fork:async()=>'',export:()=>null,close:async()=>{},
    subscribe(_id:string,next:(event:unknown)=>void){sink=next;queueMicrotask(()=>next({type:'ApprovalRequested',requestId:'r1',azione}));return()=>{};},
    /* What the kernel does after a refusal: the tool call ends with an error for the model, and the turn goes on. */
    answerApproval:async(...args:unknown[])=>{answered.push(args);queueMicrotask(()=>{sink?.({type:'TextMessageContent',messageId:'m',delta:'done another way'});sink?.({type:'RunFinished'});});},
    cancel:async()=>{cancelled++;},
  };
  return{runtime,answered,cancelled:()=>cancelled};
}
const input=(protocolVersion:'v1'|'v2',extra:Record<string,unknown>={})=>({projectRoot:process.cwd(),prompt:'x',model:'m',permissionMode:'default',permissionRules:{allow:[],ask:[],deny:[]},timeoutSeconds:20,protocolVersion,...extra}) as any;

for(const protocol of ['v1','v2'] as const){
  test(`C-005 ${protocol}: a denied command goes back to the model and the run completes`,async()=>{
    const f=deniedRuntime({tipo:'comando',comando:'npm test'});
    const x:any=await collectHeadlessRun(f.runtime,input(protocol));
    assert.equal(f.cancelled(),0,'the run is not cancelled');
    assert.equal(f.answered.length,1);
    const [session,request,approved,reason]=f.answered[0]!;
    assert.deepEqual([session,request,approved],['s','r1',false]);
    assert.equal(typeof reason,'string','the model is told why');
    assert.equal(reason,'TALOS did not run the command `npm test`: Operation requires approval in non-interactive mode (PERMISSION_REQUIRED). This run is non-interactive, so nobody can approve it. Do not repeat the same call; find another way, or finish and say what could not be done.');
    assert.equal(x.result.ok,true);
    if(protocol==='v2')assert.equal(x.result.outcome,'completed');
    assert.equal(x.result.result?.text,'done another way');
    assert.deepEqual(x.result.permissionDenials,[{requestId:'r1',tool:'Bash',command:'npm test',code:'PERMISSION_REQUIRED',message:'Operation requires approval in non-interactive mode'}]);
    const warning=x.events.find((event:any)=>event.type==='warning'&&event.data?.code==='TOOL_PERMISSION_DENIED');
    assert.ok(warning,'the stream says a tool call was denied');
    assert.deepEqual(warning.data.denial,x.result.permissionDenials[0]);
  });

  test(`C-005 ${protocol}: a deny rule is answered to the model too, with its own code`,async()=>{
    const f=deniedRuntime({tipo:'comando',comando:'curl evil.example'});
    const x:any=await collectHeadlessRun(f.runtime,input(protocol,{permissionRules:{allow:[],ask:[],deny:['Bash(curl:*)']}}));
    assert.equal(f.cancelled(),0);
    assert.equal(x.result.ok,true);
    assert.equal(x.result.permissionDenials?.[0]?.code,'PERMISSION_DENIED');
    assert.match(String(f.answered[0]![3]),/PERMISSION_DENIED/u);
  });

  test(`C-005 ${protocol}: an allowed run has no permissionDenials field`,async()=>{
    const f=deniedRuntime({tipo:'comando',comando:'npm test'});
    const x:any=await collectHeadlessRun(f.runtime,input(protocol,{permissionMode:'bypassPermissions'}));
    assert.deepEqual(f.answered[0]!.slice(0,3),['s','r1',true]);
    assert.equal('permissionDenials' in x.result,false);
  });
}
