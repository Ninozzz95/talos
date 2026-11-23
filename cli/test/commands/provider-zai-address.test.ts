/*
 * 14/10/2026, owner: the Z.AI key goes only to the address the person chose, and TALOS asks for it when the key is added
 * («Te lo chiede quando metti la chiave»). `set-key zai` asks before the key is read (so before the key test sends anything);
 * `--address plan|balance|plan-china|balance-china` answers in advance; `configure zai --address` changes it later.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {runProviderCommand} from '../../src/commands/provider-cli.ts';

function zaiCtx({runtime={},answers=[] as string[],tty=true}:{runtime?:Record<string,unknown>;answers?:string[];tty?:boolean}={}){
  const out:string[]=[];const err:string[]=[];const asked:string[]=[];const order:string[]=[];
  let current:Record<string,unknown>={endpoint:'https://api.z.ai/api/paas/v4',endpointConfigured:false,timeoutSeconds:60,...runtime};
  let key:string|null=null;
  const store={
    listPublic:()=>[{id:'zai',configured:Boolean(key)}],setKey:(_p:string,v:string)=>{key=v;},clearKey:()=>{key=null;},getKey:()=>key,
    getRuntime:(id:string)=>id==='zai'?current:{},
    setRuntime:(id:string,value:any)=>{if(id!=='zai')return;order.push(`address:${value.endpoint}`);current={...current,...value,endpointConfigured:true};},
  };
  const runtimeContext:any={providerStore:store,tuiCatalog:{
    setProviderKey:async(_p:string,v:string)=>{order.push('key-test');key=v;return{provider:'zai',label:'Z.AI',outcome:'valid',passed:true,httpStatus:200,message:'Z.AI accepted the key (HTTP 200).',saved:true};},
    listProviders:async()=>[],keyTestNotice:()=>null,
  }};
  const io:any={writeOut:(s:string)=>out.push(s),writeErr:(s:string)=>err.push(s),stdinIsTTY:tty,stdoutIsTTY:tty,readStdin:async()=>'',
    readSecret:async()=>{order.push('secret');return 'zai-secret';},
    ...(tty?{readLine:async(prompt:string)=>{asked.push(prompt);return answers.shift()??'';}}:{})};
  return{out,err,asked,order,current:()=>current,ctx:{invocation:{outputFormat:'json'} as any,io,projectRoot:'/p',paths:{} as any,repoRoot:'/repo',createRuntimeContext:async()=>runtimeContext} as any};
}

test('set-key zai with no address chosen asks for it BEFORE reading the key, and uses only that one',async()=>{
  const x=zaiCtx({answers:['3']});
  assert.equal(await runProviderCommand(x.ctx,['set-key','zai']),0);
  assert.equal(x.asked.length,1,'asked once');
  const listed=x.err.join('');
  for(const label of ['GLM Coding Plan','pay-as-you-go balance','GLM Coding Plan (China)','pay-as-you-go balance (China)'])assert.ok(listed.includes(label),label);
  assert.deepEqual(x.order,['address:https://open.bigmodel.cn/api/coding/paas/v4','secret','key-test'],'the address first, then the key, then its test');
  assert.equal(x.current().endpoint,'https://open.bigmodel.cn/api/coding/paas/v4');
});

test('set-key zai: an answer that is not one of the four asks again; nothing at all ends with nothing sent',async()=>{
  const again=zaiCtx({answers:['9','1']});
  assert.equal(await runProviderCommand(again.ctx,['set-key','zai']),0);
  assert.equal(again.asked.length,2);
  assert.equal(again.current().endpoint,'https://api.z.ai/api/coding/paas/v4');
  const none=zaiCtx({answers:['','']});
  await assert.rejects(runProviderCommand(none.ctx,['set-key','zai']),{code:'PROVIDER_ADDRESS_REQUIRED'});
  assert.deepEqual(none.order,[],'no key read, nothing sent');
});

test('set-key zai --address answers in advance; an address already chosen is not asked again',async()=>{
  const given=zaiCtx();
  assert.equal(await runProviderCommand(given.ctx,['set-key','zai','--address','balance']),0);
  assert.equal(given.asked.length,0);
  assert.deepEqual(given.order,['address:https://api.z.ai/api/paas/v4','secret','key-test']);
  const chosen=zaiCtx({runtime:{endpoint:'https://api.z.ai/api/coding/paas/v4',endpointConfigured:true}});
  assert.equal(await runProviderCommand(chosen.ctx,['set-key','zai']),0);
  assert.equal(chosen.asked.length,0);
  assert.deepEqual(chosen.order,['secret','key-test']);
  await assert.rejects(runProviderCommand(zaiCtx().ctx,['set-key','zai','--address','china']),{code:'PROVIDER_ADDRESS_INVALID'});
});

test('without a terminal to ask on, set-key zai refuses and says how to choose',async()=>{
  const x=zaiCtx({tty:false});
  await assert.rejects(runProviderCommand(x.ctx,['set-key','zai']),{code:'PROVIDER_ADDRESS_REQUIRED'});
  assert.deepEqual(x.order,[]);
  /* a line reader exists but stdin is not a terminal (piped): nothing is read from the pipe as an address */
  const piped=zaiCtx({answers:['1']});piped.ctx.io.stdinIsTTY=false;
  await assert.rejects(runProviderCommand(piped.ctx,['set-key','zai']),{code:'PROVIDER_ADDRESS_REQUIRED'});
  assert.equal(piped.asked.length,0);
  assert.deepEqual(piped.order,[]);
});

test('configure zai --address chooses it; --address is only for Z.AI',async()=>{
  const x=zaiCtx();
  assert.equal(await runProviderCommand(x.ctx,['configure','zai','--address','plan']),0);
  assert.equal(x.current().endpoint,'https://api.z.ai/api/coding/paas/v4');
  assert.equal(x.current().endpointConfigured,true);
  await assert.rejects(runProviderCommand(x.ctx,['configure','openai','--address','plan']),{code:'PROVIDER_ADDRESS_INVALID'});
});

test('review of 0.6.4 (S1): configure zai --timeout with no address chosen does not choose the default; with one chosen it keeps it',async()=>{
  const x=zaiCtx();
  await assert.rejects(runProviderCommand(x.ctx,['configure','zai','--timeout','120']),{code:'PROVIDER_ADDRESS_REQUIRED'});
  assert.equal(x.current().endpointConfigured,false,'nothing was chosen for the person');
  assert.deepEqual(x.order,[]);
  const y=zaiCtx({runtime:{endpoint:'https://open.bigmodel.cn/api/coding/paas/v4',endpointConfigured:true}});
  assert.equal(await runProviderCommand(y.ctx,['configure','zai','--timeout','120']),0);
  assert.equal(y.current().endpoint,'https://open.bigmodel.cn/api/coding/paas/v4');assert.equal(y.current().timeoutSeconds,120);
  const z=zaiCtx();
  assert.equal(await runProviderCommand(z.ctx,['configure','zai','--endpoint','https://proxy.example/v4','--timeout','90']),0,'an endpoint of the person\'s own is still taken');
});

test('provider list names the Z.AI address in use, or says none is chosen (B2)',async()=>{
  const profile=(endpoint:string,configured:boolean)=>({id:'zai',label:'Z.AI',auth:{type:'bearer'},execution:'collegato',endpoint:{value:endpoint,host:new URL(endpoint).host,valid:true,configured,supportsCustom:true}});
  for(const [configured,expected] of [[true,{chosen:true,address:'plan-china',label:'GLM Coding Plan (China)'}],[false,{chosen:false,address:null,label:null}]] as const){
    const x=zaiCtx();const out:string[]=[];
    x.ctx.io.writeOut=(s:string)=>out.push(s);
    const runtimeContext=await x.ctx.createRuntimeContext();runtimeContext.providerControlPlane={list:()=>[profile('https://open.bigmodel.cn/api/coding/paas/v4',configured)]};
    x.ctx.createRuntimeContext=async()=>runtimeContext;
    assert.equal(await runProviderCommand(x.ctx,['list']),0);
    const rows=JSON.parse(out.join(''));
    assert.deepEqual(rows[0].zaiAddress,expected);
  }
});
