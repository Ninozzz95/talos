/*
 * 0.6.6, the ninth review (S3, owner «Correggo ora»): with nobody in front (`talos -p`, a command) a proposed plan or a question
 * waited for an answer nobody could give. `talos -p --permission-mode plan` stalled until RUN_TIMEOUT whenever the model called
 * present_plan (the kernel told it «the only way to get it approved»), and a forced ask_user_question did the same. Without a
 * person the composition now drops the two channels: present_plan is not offered (the model writes the plan in its answer) and
 * a question gets the kernel's no-person answer at once. With a person nothing changes.
 * Real composition, real registry and kernel, the real headless run, a scripted local provider (127.0.0.1), a dummy key.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import {hermetic,settle} from '../provider/first-run-fixture.ts';
import {composeWithFake} from './r5a-r-fixture.ts';
import {collectHeadlessRun} from '../../src/headless/run.ts';

const FORCED:Record<string,{name:string;args:unknown}>={
  PLAN:{name:'present_plan',args:{plan:'## Goal\nRead the code, then fix it.'}},
  ASK:{name:'ask_user_question',args:{questions:[{id:'which_db',question:'Which database?',why:'It decides the schema',options:[{label:'Postgres',description:'server'},{label:'SQLite',description:'file'}]}]}},
};

async function scriptedProvider(log:{tools:string[];system:string;lastTool:string|null}[]){
  const server=http.createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    const url=new URL(req.url??'/','http://127.0.0.1');
    if(req.method==='GET'&&url.pathname.endsWith('/models')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:[{id:'deepseek-flash',name:'x'}]}));return;}
    let body:any={};try{body=JSON.parse(raw||'{}');}catch{}
    const messages=Array.isArray(body.messages)?body.messages:[];
    const tools=(body.tools??[]).map((tool:any)=>tool?.function?.name??tool?.name);
    /* 06/11 realignment: the kernel's notes after the head (the plan-mode note among them) reach the provider as `user` messages wrapped
       in <talos-note> (sistema-piegato.mjs, RIGA_DI_TESTA): TALOS speaking, read here with the system messages */
    const said=(m:any)=>typeof m?.content==='string'?m.content:Array.isArray(m?.content)?m.content.map((p:any)=>String(p?.text??'')).join('\n'):'';
    log.push({tools,system:messages.filter((m:any)=>m?.role==='system'||(m?.role==='user'&&/^<talos-note>/u.test(said(m)))).map(said).join('\n'),lastTool:((found:any)=>found?String(found.content??''):null)([...messages].reverse().find((m:any)=>m?.role==='tool'))});
    const id='c',created=1;
    if(!body.stream){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id,object:'chat.completion',created,model:'fake',choices:[{index:0,message:{role:'assistant',content:'ok'},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}}));return;}
    res.writeHead(200,{'content-type':'text/event-stream'});
    const send=(payload:any)=>res.write(`data: ${JSON.stringify(payload)}\n\n`);
    const text=JSON.stringify(messages.filter((m:any)=>m?.role==='user'));
    const key=Object.keys(FORCED).find(name=>text.includes(`FORCE_${name}`));
    /* the first request only (in plan mode a system note follows the person's message) */
    const forced=key&&!messages.some((m:any)=>m?.role==='tool')?FORCED[key]:null;
    if(forced)send({id,object:'chat.completion.chunk',created,model:'fake',choices:[{index:0,delta:{role:'assistant',tool_calls:[{index:0,id:`call_${key}`,type:'function',function:{name:forced.name,arguments:JSON.stringify(forced.args)}}]},finish_reason:null}]});
    else send({id,object:'chat.completion.chunk',created,model:'fake',choices:[{index:0,delta:{role:'assistant',content:'done'},finish_reason:null}]});
    send({id,object:'chat.completion.chunk',created,model:'fake',choices:[{index:0,delta:{},finish_reason:forced?'tool_calls':'stop'}]});
    send({id,object:'chat.completion.chunk',created,model:'fake',choices:[],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}});
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  return{url:`http://127.0.0.1:${(server.address() as any).port}`,close:()=>new Promise<void>(resolve=>{server.closeAllConnections?.();server.close(()=>resolve());})};
}

async function headless(askPerson:boolean,prompt:string,permissionMode:string){
  return await hermetic(async h=>{
    const log:{tools:string[];system:string;lastTool:string|null}[]=[];const provider=await scriptedProvider(log);
    const context=await composeWithFake(h,provider.url,'sk-dummy-nobody-in-front-00',{askPerson});
    const started=Date.now();
    try{
      const out:any=await collectHeadlessRun(context.runtime,{prompt,model:'deepseek:deepseek-flash',projectRoot:h.project,permissionMode,timeoutSeconds:20,protocolVersion:'v1'} as any);
      return{out,ms:Date.now()-started,log};
    }finally{await context.runtime?.close?.();await provider.close();await settle(h.root);}
  });
}

test('-p in plan mode: present_plan is not offered, and a forced call ends the run at once instead of waiting for nobody',{timeout:120_000},async()=>{
  const {out,ms,log}=await headless(false,'FORCE_PLAN please','plan');
  assert.equal(log[0]?.tools.includes('present_plan'),false,'present_plan is not offered with nobody in front');
  assert.doesNotMatch(log[0]?.system??'',/the only way to get it approved/u,'the model is not told to wait for an approval');
  assert.notEqual(out.result?.error?.code,'RUN_TIMEOUT');
  assert.ok(ms<15_000,`the run ends without waiting for the timeout (${ms} ms)`);
  /* r4 7784d574e (the desktop, after the tenth review of 0.6.6): the refusal and the plan-mode note say why, and what to do instead */
  assert.match(log[0]?.system??'',/Nobody can approve a plan in this session: write the full plan in your answer/u,'the model is told to write the plan in its answer');
  assert.ok(log.some(entry=>/REFUSED\. Nobody can approve a plan in this session/u.test(entry.lastTool??'')),`the kernel refuses the call and the model goes on: ${JSON.stringify(log.map(entry=>entry.lastTool))}`);
  assert.equal(out.result?.ok,true,'the run succeeds');
});

test('-p: a forced ask_user_question gets the no-person answer at once',{timeout:120_000},async()=>{
  const {out,ms,log}=await headless(false,'FORCE_ASK please','bypassPermissions');
  assert.notEqual(out.result?.error?.code,'RUN_TIMEOUT');
  assert.ok(ms<15_000,`the run ends without waiting for the timeout (${ms} ms)`);
  assert.ok(log.some(entry=>/"unanswerable"/u.test(entry.lastTool??'')&&/no-interface/u.test(entry.lastTool??'')),`the kernel's no-person answer: ${JSON.stringify(log.map(entry=>entry.lastTool))}`);
});

test('with a person on the screen, plan mode still offers present_plan',{timeout:120_000},async()=>{
  const {log}=await headless(true,'hello','plan');
  assert.ok(log[0]?.tools.includes('present_plan'),'present_plan is offered when someone can approve it');
  assert.match(log[0]?.system??'',/the only way to get it approved/u);
});
