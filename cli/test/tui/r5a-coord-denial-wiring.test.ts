/*
 * R5a (coordinator wiring, lanes R and S hand-backs): the session controller tells the adapter WHO refused a tool before the
 * kernel hears the "no", so the row names the rule, the policy or the person (Q-R5-17, R5 gate finding 15). The fake kernel
 * here answers a refusal at once, inside `answerApproval`, as the real one may: a note written after the answer would lose
 * the race and the row would fall back to a refusal nobody named.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';

const tick=(ms=0)=>new Promise(r=>setTimeout(r,ms));
const FINDING_15='cmd /c for /L %i in (1,1,3) do @echo rule line %i';

function fakeRuntime(){
  const sinks=new Map<string,(e:any)=>void>();const tools=new Map<string,string>();
  const r:any={
    restore:async()=>({restored:0,total:0}),listSessions:async()=>[{sessionId:'s1',outcome:'completed'}],export:()=>({eventi:[]}),
    start:async()=>'s1',resume:async(id:string)=>id,fork:async()=>'f1',compact:async()=>({ok:true}),
    subscribe(id:string,sink:(e:any)=>void){sinks.set(id,sink);return()=>sinks.delete(id);},
    /* The kernel's own receipt for a "no" (talosHarness.mjs verificaPermessoScrittura), delivered before answerApproval returns. */
    answerApproval:async(id:string,requestId:string,approved:boolean)=>{
      const toolCallId=tools.get(requestId)!;
      sinks.get(id)!({type:'ApprovalResolved',requestId,approvato:approved});
      if(!approved)sinks.get(id)!({type:'ToolCallResult',toolCallId,content:'refused',receipt:{status:'denied',consentito:false,via:'livello-su-richiesta',motivo:"l'owner non ha approvato questa azione"}});
    },
    cancel:async()=>{},close:async()=>{},shell:async()=>{},
  };
  return{r,sinks,tools};
}
async function refused(command:string,{rules={allow:[],ask:[],deny:[]} as any,answer=null as null|'deny-once'}={}){
  const f=fakeRuntime();const events:any[]=[];
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules,onEvent:(e:any)=>events.push(e),onApproval:()=>{}} as any);
  c.attach('s1');const sink=f.sinks.get('s1')!;
  sink({type:'RunStarted',runId:'r1',threadId:'s1'});
  sink({type:'ToolCallStart',toolCallId:'t1',toolCallName:'shell'});
  f.tools.set('q1','t1');
  sink({type:'ApprovalRequested',requestId:'q1',azione:{tipo:'shell',comando:command,toolCallId:'t1'}});
  await tick(20);
  if(answer)await c.resolveApproval('q1',answer);
  await tick(20);
  return events.filter(e=>e.type==='tool.facts'&&e.toolCallId==='t1').map(e=>e.facts.denial).filter(Boolean);
}

test('R5a wiring: a command the policy cannot split is refused BY THE POLICY, noted before the kernel hears the "no"',async()=>{
  const denials=await refused(FINDING_15);
  assert.equal(denials.length,1,'the refusal carries who decided');
  assert.equal(denials[0].by,'policy');
  assert.match(denials[0].reason??'',/unsupported shell composition|part by part/iu);
});

test('R5a wiring: a matched deny rule is named on the refusal',async()=>{
  const denials=await refused('rm -rf dist',{rules:{allow:[],ask:[],deny:['Bash(rm -rf dist)']}});
  assert.deepEqual(denials.map(d=>[d.by,d.rule]),[['rule','Bash(rm -rf dist)']]);
});

test('R5a wiring: the person\'s own "no" is theirs',async()=>{
  const denials=await refused('npm run build',{answer:'deny-once'});
  assert.deepEqual(denials.map(d=>d.by),['person']);
});
