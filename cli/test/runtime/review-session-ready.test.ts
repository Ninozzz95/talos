import test from 'node:test';
import assert from 'node:assert/strict';
import {dummyKey,hermetic} from '../provider/first-run-fixture.ts';
import {composeWithFake,startScriptedProvider,UNKNOWN_MODEL as MODEL,UNKNOWN_MODELS} from './r5a-r-fixture.ts';

// From the 2026-09-27 review (a kernel completion/readiness race, no longer red: green at 0.6.12, 6cedd615d): RunFinished must make the history
// available to an immediate compact, without sleeps, retries or skip. 0.6.13 (22/10/2026): on a model whose window no
// source knows (the kernel's compaction): deepseek-flash is a registry row since d54028b4a (1M window), which turns the
// Context Engine on, and the engine refuses to compact one exchange (CTX_NOTHING_TO_COMPACT), a different question.
test('REV-SESSION-READY RunFinished makes history available to an immediate compact',{timeout:30_000},async()=>hermetic(async h=>{
 const key=dummyKey('deepseek');
 const fake=await startScriptedProvider({goodKey:key,models:UNKNOWN_MODELS,respond:()=>({kind:'text',text:'OK'})});
 const context=await composeWithFake(h,fake.url,key,{model:MODEL});
 let off=()=>{};let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  type Outcome={value?:any;code?:string;message?:string;initialError?:unknown;timeout?:boolean};
  let finish!:(value:Outcome)=>void;
  const done=new Promise<Outcome>(resolve=>{finish=resolve;});let seen=false;
  const id=await context.runtime.start({projectRoot:h.project,model:MODEL,permissionMode:'default',prompt:'hello'});
  off=context.runtime.subscribe(id,(event:any)=>{
   if(event.type==='RunError')finish({initialError:event});
   if(event.type==='RunFinished'&&!seen){
    seen=true;
    context.runtime.compact(id).then((value:any)=>finish({value}),(error:any)=>finish({code:error.code,message:error.message}));
   }
  },0);
  timer=setTimeout(()=>finish({timeout:true}),10_000);
  const outcome=await done;
  assert.equal(outcome.value?.ok,true,`REV-SESSION-READY: ${JSON.stringify(outcome)}`);
 }finally{if(timer)clearTimeout(timer);off();await context.runtime.close();await fake.close();}
}));
