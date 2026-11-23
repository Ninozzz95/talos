/*
 * 14/10/2026: the same wake as background-wake.test.ts, on the CLI's ISOLATED path (the broker). The hermetic profile has no
 * verified sandbox, so there the command takes the kernel's host path, where the background already existed. Here a broker
 * stands in for the sandbox: it really starts the process (the same `cmd /d /s /c` request the sandbox gets), ends it on the
 * request's signal or time, and hands over its output at the end, as the broker's contract does. Before 14/10 this path killed
 * the command at 2 minutes and the turn waited for it: nothing was ever in the background, so nothing could wake.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import test from 'node:test';
import {dummyKey,hermetic} from '../provider/first-run-fixture.ts';
import {composeWithFake,runTurn,startScriptedProvider} from './r5a-r-fixture.ts';

const COMMAND=`node -e "setTimeout(function(){console.log('finished-bg')},3000)"`;
const EVIDENCE={requestedEnforcement:'windows-sandbox',appliedEnforcement:'windows-sandbox',backend:'test-broker',appContainer:true,filesystem:'bfs',network:'deny',processTree:'job-object',verifiedAt:new Date().toISOString()};

function hostBroker(){
  const requests:any[]=[];
  const broker={async execute(request:any):Promise<any>{
    requests.push(request);
    return new Promise((resolve,reject)=>{
      const child=spawn(request.executable,request.args,{cwd:request.cwd,windowsVerbatimArguments:true,stdio:['ignore','pipe','pipe']});
      let stdout='',stderr='';child.stdout.on('data',(d)=>{stdout+=d;});child.stderr.on('data',(d)=>{stderr+=d;});
      const timer=setTimeout(()=>child.kill(),request.timeoutMs);
      request.signal?.addEventListener('abort',()=>{child.kill();reject(Object.assign(new Error('stopped'),{code:'EXECUTION_ABORTED'}));},{once:true});
      child.on('close',(code)=>{clearTimeout(timer);resolve({exitCode:code??1,stdout,stderr,evidence:EVIDENCE});});
    });
  }};
  return{requests,factory:()=>broker as any};
}

test('on the isolated path too, a command outlives its time in the background and wakes the conversation when it ends',{timeout:180_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');const host=hostBroker();
  const fake=await startScriptedProvider({goodKey:key,respond:(request)=>{
    if(request.lastUser.includes('start the slow job')&&request.toolResults===0)return{kind:'tool',name:/^shell$/u,args:[{pattern:/^(command|comando)$/u,value:COMMAND},{pattern:/^timeout$/u,value:'1000'}]};
    if(request.lastUser.includes('start the slow job'))return{kind:'text',text:'It is running in the background.'};
    return{kind:'text',text:'Seen: the job ended.'};
  }});
  const context=await composeWithFake(h,fake.url,key,{brokerFactory:host.factory});
  try{
    const {raw}=await runTurn(context,h,'start the slow job');
    assert.ok(raw.some(e=>e?.type==='RunFinished'));
    assert.ok(host.requests.some(r=>String(r.args?.at(-1)).includes('finished-bg')),'the command went through the broker (the isolated path)');
    const tool=JSON.stringify(fake.requests[1]?.body?.messages?.find((m:any)=>m.role==='tool')?.content??'');
    assert.match(tool,/IN BACKGROUND/u,tool.slice(0,300));
    const before=fake.requests.length;const deadline=Date.now()+60_000;
    while(fake.requests.length===before&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));
    assert.ok(fake.requests.length>before,'the conversation woke by itself');
    assert.match(JSON.stringify(fake.requests[before]!.body.messages??[]),/node -e/u,'and the model is told which command ended');
  }finally{await context.runtime.close?.();await fake.close();}
}));
