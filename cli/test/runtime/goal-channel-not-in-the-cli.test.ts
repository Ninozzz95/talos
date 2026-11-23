/*
 * 0.6.6, the eighth review (S2): the CLI has no goal surface, so it never offers the `goal_*` tools (seventh review). But the list
 * sent to the model is not a boundary: a model that calls `goal_create` anyway (a hallucination, an adapter fault, a prompt
 * injection in a file it read) reached the goal's channel, set an active goal, and its judge kept calling the model after the turn
 * ended, with nobody typing. The composition now drops the channel: the kernel answers «not available» and no goal is born.
 * Real composition with a person, real registry and kernel, a scripted local provider (127.0.0.1), a dummy key.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import {hermetic,settle} from '../provider/first-run-fixture.ts';
import {composeWithFake,runTurn} from './r5a-r-fixture.ts';

async function scriptedProvider(log:{tools:string[]}[]){
  const server=http.createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    const url=new URL(req.url??'/','http://127.0.0.1');
    if(req.method==='GET'&&url.pathname.endsWith('/models')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:[{id:'deepseek-flash',name:'x'}]}));return;}
    let body:any={};try{body=JSON.parse(raw||'{}');}catch{}
    const messages=Array.isArray(body.messages)?body.messages:[];
    const tools=(body.tools??[]).map((tool:any)=>tool?.function?.name??tool?.name);
    const last=messages.at(-1);
    log.push({tools});
    const id='c',created=1;
    /* the judge (no stream) would say «not yet», which keeps a goal going */
    if(!body.stream){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id,object:'chat.completion',created,model:'fake',choices:[{index:0,message:{role:'assistant',content:'{"verdicts":[{"id":"obiettivo","verdict":"no","reason":"tests still fail"}]}'},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}}));return;}
    res.writeHead(200,{'content-type':'text/event-stream'});
    const send=(payload:any)=>res.write(`data: ${JSON.stringify(payload)}\n\n`);
    const forced=tools.length>0&&last?.role==='user'&&String(last?.content??'').includes('PLEASE');
    if(forced)send({id,object:'chat.completion.chunk',created,model:'fake',choices:[{index:0,delta:{role:'assistant',tool_calls:[{index:0,id:'call_goal',type:'function',function:{name:'goal_create',arguments:JSON.stringify({objective:'Make every test in the project pass'})}}]},finish_reason:null}]});
    else send({id,object:'chat.completion.chunk',created,model:'fake',choices:[{index:0,delta:{role:'assistant',content:'done'},finish_reason:null}]});
    send({id,object:'chat.completion.chunk',created,model:'fake',choices:[{index:0,delta:{},finish_reason:forced?'tool_calls':'stop'}]});
    send({id,object:'chat.completion.chunk',created,model:'fake',choices:[],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}});
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  return{url:`http://127.0.0.1:${(server.address() as any).port}`,close:()=>new Promise<void>(resolve=>{server.closeAllConnections?.();server.close(()=>resolve());})};
}

test('a goal_create the model calls although it is not offered sets no goal, and nothing calls the model after the turn',async()=>hermetic(async h=>{
  const log:{tools:string[]}[]=[];const provider=await scriptedProvider(log);
  const context=await composeWithFake(h,provider.url,'sk-dummy-goal-channel-0000',{askPerson:true});
  try{
    const {raw}=await runTurn(context,h,'PLEASE set a goal and keep going',{permissionMode:'bypassPermissions',timeoutMs:60_000});
    assert.deepEqual(log[0]?.tools?.filter(name=>/^goal_/u.test(name)),[],'the goal tools are not offered');
    const results=raw.filter((event:any)=>event?.type==='ToolCallResult'||event?.type==='TOOL_CALL_RESULT').map((event:any)=>String(event.content??event.result??''));
    assert.ok(results.some(text=>/goal_create is not available in this session/u.test(text)),`the kernel answers «not available»: ${JSON.stringify(results)}`);
    assert.deepEqual(raw.filter((event:any)=>event?.type==='CUSTOM'&&/obiettivo/u.test(String(event?.name))),[],'no goal event');
    const afterTurn=log.length;
    /* the review's probe saw the judge within the first seconds (3 calls in 8 s) */
    await new Promise(resolve=>setTimeout(resolve,6_000));
    assert.equal(log.length,afterTurn,'nothing calls the model once the turn is over');
  }finally{await context.runtime?.close?.();await provider.close();await settle(h.root);}
}));
