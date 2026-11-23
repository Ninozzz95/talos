/*
 * Stage 3, pezzo 13c (registro 12): when the kernel changes the mode by itself (the model asks for plan mode), the
 * controller follows it and tells the screen (ACP current_mode_update; claude-agent-acp #1139). Live only.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';

function fakeRuntime(history:any[]=[],outcome='running'){
  const sinks=new Map<string,(e:any)=>void>();
  const r:any={restore:async()=>({restored:1,total:1}),listSessions:async()=>[{sessionId:'s1',outcome}],export:()=>({eventi:[]}),
    start:async()=>'s1',resume:async(id:string)=>id,fork:async()=>'f1',compact:async()=>({ok:true}),
    subscribe(id:string,sink:(e:any)=>void){sinks.set(id,sink);for(const e of history)sink(e);return()=>sinks.delete(id);},
    answerApproval:async()=>{},answerQuestion:async()=>{},answerPlan:async()=>{},cancel:async()=>{},close:async()=>{}};
  return{r,emit:(e:any)=>sinks.get('s1')?.(e)};
}
const tick=(ms=0)=>new Promise(r=>setTimeout(r,ms));

test('when the model asks for plan mode the screen follows the kernel; a replayed change does not fire now',async()=>{
  const f=fakeRuntime();const followed:any[]=[];
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},onKernelMode:(x:any)=>followed.push(x)} as any);
  await c.initialize({initialPrompt:'think first'});
  f.emit({type:'RunStarted',runId:'r1'});
  f.emit({type:'CUSTOM',name:'talos.impostazioni-sessione',value:{modalitaOperativa:'piano',permessi:'Read only',motivo:'piano-richiesto-dal-modello'}});await tick();
  assert.equal(c.mode(),'plan');
  assert.deepEqual(followed,[{mode:'plan',reason:'model-requested'}]);
  const replay=fakeRuntime([{type:'RunStarted',runId:'r1'},{type:'CUSTOM',name:'talos.impostazioni-sessione',value:{modalitaOperativa:'piano',permessi:'Read only',motivo:'piano-richiesto-dal-modello'}}],'completed');const seen:any[]=[];
  const r=createTuiSessionController({runtime:replay.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},onKernelMode:(x:any)=>seen.push(x)} as any);
  await r.resumeSession('s1');await tick(5);
  assert.deepEqual(seen,[]);
});
