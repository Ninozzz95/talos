/*
 * The scripted fake model of the hermetic bench (scripts/bench-harness.ts) and of the UI frames (scripts/ui-frames.ts):
 * one server on 127.0.0.1 that speaks the OpenAI chat-completions dialect (TALOS through its `ollama` provider, Pi,
 * OpenCode) and the Responses dialect (Codex speaks only that: codex-rs/model-provider-info/src/lib.rs
 * `WireApi::Responses`). The turn is keyed by a word in the user's message, the same for every agent:
 *   BENCH_OK      no tool, a one-line answer
 *   BENCH_MD      no tool, a Markdown answer (heading, list, table, code, quote) after a short reasoning
 *   BENCH_READ6   six reads of f1.txt … f6.txt in one answer (read tool; an agent without one gets its shell)
 *   BENCH_GREP4   four searches in one answer (search tool, or the shell's `rg`)
 *   BENCH_SHELL3  three shell commands in one answer (`node sleep.cjs`)
 *   BENCH_SHELL1  one shell command (`node cat.cjs f1.txt`), to see each agent's approval
 * then a final answer. Tools and argument names are picked from the schemas the agent sent.
 */
import http from 'node:http';
import type {AddressInfo} from 'node:net';
import {MARKDOWN_ANSWER} from '../test/acceptance/fake-provider.ts';

export const BENCH_MODEL='qwen3-coder-test';
export const SLEEP_MS=400;
export type BenchRequest={at:number;endAt?:number;api:'chat'|'responses';scenario:string;tools:number;results:number;calls:number;samples?:string[]};
type Tool={name:string;props:Record<string,any>;required:string[]};
type Call={name:string;arguments:Record<string,unknown>};

function toolsOf(body:any):Tool[]{
  return(Array.isArray(body?.tools)?body.tools:[]).map((t:any)=>{const f=t?.function??t;const p=f?.parameters??{};return{name:String(f?.name??''),props:p.properties??{},required:Array.isArray(p.required)?p.required:[]};});
}
const textOf=(c:unknown):string=>typeof c==='string'?c:Array.isArray(c)?c.map((p:any)=>typeof p?.text==='string'?p.text:'').join(''):'';
function argsFor(tool:Tool,values:{path?:string;pattern?:string;command?:string}){
  const out:Record<string,unknown>={};
  for(const [key,schema] of Object.entries(tool.props)){
    if(values.path!==undefined&&/^(path|percorso|file_?path|filepath|file)$/iu.test(key))out[key]=values.path;
    else if(values.pattern!==undefined&&/^(pattern|testo|query|regex|text)$/iu.test(key))out[key]=values.pattern;
    else if(values.command!==undefined&&/^(command|comando|cmd)$/iu.test(key))out[key]=schema?.type==='array'?values.command.split(' '):values.command;
    else if(/^description$/iu.test(key)&&tool.required.includes(key))out[key]='bench';
  }
  return out;
}
const pick=(tools:Tool[],re:RegExp)=>tools.find(t=>re.test(t.name));
function plan(scenario:string,tools:Tool[],results:number):Call[]{
  if(results>0||!tools.length)return[];
  const shell=pick(tools,/^(shell|bash|shell_command|exec_command|run_command|esegui)$/iu);
  const viaShell=(command:string)=>shell?[{name:shell.name,arguments:argsFor(shell,{command})}]:[];
  if(scenario==='read6'){
    const read=pick(tools,/^(read|read_file|leggi)$/iu);
    return[1,2,3,4,5,6].flatMap(i=>read?[{name:read.name,arguments:argsFor(read,{path:`f${i}.txt`})}]:viaShell(`node cat.cjs f${i}.txt`));
  }
  if(scenario==='grep4'){
    const grep=pick(tools,/^(grep|cerca|search|search_files|grep_files)$/iu);
    return['NEEDLE_A','NEEDLE_B','NEEDLE_C','NEEDLE_D'].flatMap(p=>grep?[{name:grep.name,arguments:argsFor(grep,{pattern:p,path:'tree'})}]:viaShell(`rg -n ${p} tree`));
  }
  if(scenario==='shell3')return[1,2,3].flatMap(i=>viaShell(`node sleep.cjs ${SLEEP_MS} ${i}`));
  if(scenario==='shell1')return viaShell('node cat.cjs f1.txt');
  return[];
}
const scenarioOf=(text:string)=>/BENCH_([A-Z0-9]+)/u.exec(text)?.[1]?.toLowerCase()??'none';
const finalText=(scenario:string)=>scenario==='md'?MARKDOWN_ANSWER:scenario==='none'?'OK':'DONE bench';
const REASONING='Looking at the files first, then composing a short summary.';

export type BenchFake={url:string;log:BenchRequest[];schemas:Record<string,unknown>;setCurrent:(name:string)=>void;close:()=>Promise<void>};
export async function startBenchFake({verbose=false}:{verbose?:boolean}={}):Promise<BenchFake>{
  const log:BenchRequest[]=[];const schemas:Record<string,unknown>={};let current='';
  const chunks=(text:string,size:number)=>{const out:string[]=[];for(let i=0;i<text.length;i+=size)out.push(text.slice(i,i+size));return out;};

  async function chat(body:any,res:http.ServerResponse,rec:BenchRequest){
    const messages=Array.isArray(body?.messages)?body.messages:[];
    const lastUserAt=messages.map((m:any)=>m?.role).lastIndexOf('user');
    rec.scenario=scenarioOf(textOf(messages[lastUserAt]?.content));rec.results=messages.slice(lastUserAt+1).filter((m:any)=>m?.role==='tool').length;
    rec.samples=messages.slice(lastUserAt+1).filter((m:any)=>m?.role==='tool').map((m:any)=>textOf(m.content).replace(/\s+/gu,' ').slice(0,90));
    const tools=toolsOf(body);rec.tools=tools.length;
    if(tools.length&&current)schemas[current]??=tools;
    const calls=plan(rec.scenario,tools,rec.results);rec.calls=calls.length;
    const id='chatcmpl-bench',created=Math.floor(Date.now()/1000);
    const toolCalls=calls.map((c,i)=>({index:i,id:`call_${rec.at}_${i}`,type:'function',function:{name:c.name,arguments:JSON.stringify(c.arguments)}}));
    const content=calls.length?'':finalText(rec.scenario);
    const finish=calls.length?'tool_calls':'stop';
    const usage={prompt_tokens:100,completion_tokens:10,total_tokens:110};
    if(!body?.stream){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id,object:'chat.completion',created,model:BENCH_MODEL,choices:[{index:0,message:{role:'assistant',content,...(toolCalls.length?{tool_calls:toolCalls.map(({index:_,...r})=>r)}:{})},finish_reason:finish}],usage}));rec.endAt=Date.now();return;}
    res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});
    const sse=(p:unknown)=>res.write(`data: ${JSON.stringify(p)}\n\n`);
    const delta=(d:Record<string,unknown>)=>sse({id,object:'chat.completion.chunk',created,model:BENCH_MODEL,choices:[{index:0,delta:d,finish_reason:null}]});
    if(rec.scenario==='md'&&!calls.length){delta({role:'assistant',reasoning_content:REASONING});for(const piece of chunks(content,48))delta({content:piece});}
    else delta({role:'assistant',...(content?{content}:{}),...(toolCalls.length?{tool_calls:toolCalls}:{})});
    sse({id,object:'chat.completion.chunk',created,model:BENCH_MODEL,choices:[{index:0,delta:{},finish_reason:finish}]});
    if(body?.stream_options?.include_usage)sse({id,object:'chat.completion.chunk',created,model:BENCH_MODEL,choices:[],usage});
    res.end('data: [DONE]\n\n');rec.endAt=Date.now();
  }
  async function responses(body:any,res:http.ServerResponse,rec:BenchRequest){
    const input=Array.isArray(body?.input)?body.input:[];
    const lastUserAt=input.map((m:any)=>m?.type==='message'||m?.role?m?.role:'').lastIndexOf('user');
    rec.scenario=scenarioOf(textOf(input[lastUserAt]?.content));
    const outputs=input.slice(lastUserAt+1).filter((m:any)=>/function_call_output|custom_tool_call_output/u.test(String(m?.type)));
    rec.results=outputs.length;
    rec.samples=outputs.map((m:any)=>(typeof m.output==='string'?m.output:textOf(m.output?.content??m.output)).replace(/\s+/gu,' ').slice(0,90));
    const tools=toolsOf(body);rec.tools=tools.length;
    if(tools.length&&current)schemas[current]??=tools;
    const calls=plan(rec.scenario,tools,rec.results);rec.calls=calls.length;
    const id=`resp_${rec.at}`;
    res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});
    const ev=(e:any)=>res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
    ev({type:'response.created',response:{id}});
    calls.forEach((c,i)=>ev({type:'response.output_item.done',item:{type:'function_call',call_id:`call_${rec.at}_${i}`,name:c.name,arguments:JSON.stringify(c.arguments)}}));
    if(!calls.length)ev({type:'response.output_item.done',item:{type:'message',role:'assistant',id:`msg_${rec.at}`,content:[{type:'output_text',text:finalText(rec.scenario)}]}});
    ev({type:'response.completed',response:{id,usage:{input_tokens:100,input_tokens_details:null,output_tokens:10,output_tokens_details:null,total_tokens:110}}});
    res.end();rec.endAt=Date.now();
  }

  const sockets=new Set<import('node:net').Socket>();
  const server=http.createServer(async(req,res)=>{
    const url=req.url??'';
    const json=(s:number,b:unknown)=>{res.writeHead(s,{'content-type':'application/json'});res.end(JSON.stringify(b));};
    if(req.method==='GET'&&(url==='/api/tags'||url==='/api/ps'))return json(200,{models:[{name:BENCH_MODEL,model:BENCH_MODEL,size:1,digest:'bench',details:{format:'gguf',parameter_size:'1B'}}]});
    if(req.method==='POST'&&url==='/api/show')return json(200,{capabilities:['completion','tools'],model_info:{'general.context_length':131072}});
    if(req.method==='GET'&&/\/models$/u.test(url))return json(200,{object:'list',data:[{id:BENCH_MODEL,object:'model',owned_by:'bench'}]});
    if(req.method==='POST'&&/\/(chat\/completions|responses)$/u.test(url)){
      let raw='';try{for await(const chunk of req)raw+=chunk;}catch{return;}let body:any={};try{body=JSON.parse(raw||'{}');}catch{}
      res.on('error',()=>{});
      const rec:BenchRequest={at:Date.now(),api:url.endsWith('responses')?'responses':'chat',scenario:'none',tools:0,results:0,calls:0};log.push(rec);
      return rec.api==='chat'?chat(body,res,rec):responses(body,res,rec);
    }
    if(verbose)console.error(`fake 404: ${req.method} ${url}`);
    json(404,{error:{message:`not found (bench fake): ${req.method} ${url}`}});
  });
  /* A client that drops its connection (Codex resets them) must not bring the bench down. */
  server.on('connection',s=>{sockets.add(s);s.on('error',()=>{});s.on('close',()=>sockets.delete(s));});
  server.on('clientError',(_e,s)=>{try{s.destroy();}catch{}});
  await new Promise<void>((ok,ko)=>{server.once('error',ko);server.listen(0,'127.0.0.1',()=>ok());});
  const port=(server.address() as AddressInfo).port;
  return{url:`http://127.0.0.1:${port}`,log,schemas,setCurrent:(name)=>{current=name;},close:()=>new Promise<void>(r=>{for(const s of sockets)s.destroy();server.close(()=>r());})};
}
