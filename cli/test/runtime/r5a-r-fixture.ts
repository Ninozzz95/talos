/*
 * R5a lane R — shared fixture for the r5a-r tests (not a test file). A scripted OpenAI-compatible provider on 127.0.0.1 with
 * dummy keys, composed through the REAL composition (`composeTalosRuntime`, the kernel's session registry, the kernel itself),
 * inside `hermetic()` from the first-run fixture: private APPDATA/LOCALAPPDATA, secret-named variables removed, and a
 * `globalThis.fetch` that refuses every host but 127.0.0.1 and records what it refused.
 *
 * Each chat request is answered by `respond(request)`, which sees the parsed body, the request's index and the tools offered,
 * and returns one Step: a streamed text answer, a tool call, a JSON answer, or an HTTP failure with headers. The log keeps the
 * parsed body and booleans for the authorization header, never its value.
 */
import http from 'node:http';
import type {AddressInfo} from 'node:net';
import {fakeKeyring,REPO_ROOT,writeProviderRuntime,type Hermetic} from '../provider/first-run-fixture.ts';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';

export type ChatRequest={index:number;at:number;path:string;body:any;authorized:boolean;lastUser:string;toolResults:number;tools:string[]};
export type Step=
 | {kind:'text';text:string;usage?:Record<string,unknown>|null;delayMs?:number;/** A5c cure: a reasoning chunk streamed before the text */reasoning?:string}
 | {kind:'tool';name:RegExp;args:Array<{pattern:RegExp;value:string}>;id?:string;usage?:Record<string,unknown>|null}
 | {kind:'json';content:string;usage?:Record<string,unknown>|null}
 | {kind:'fail';status:number;headers?:Record<string,string>;message?:string};
export type ScriptedProvider={url:string;requests:ChatRequest[];other:Array<{method:string;path:string}>;close():Promise<void>};

export const USAGE={prompt_tokens:1200,completion_tokens:340,total_tokens:1540,prompt_tokens_details:{cached_tokens:200}};
const toolName=(tool:any):string=>String(tool?.function?.name??tool?.name??'');
const toolProperties=(tool:any):Record<string,unknown>=>tool?.function?.parameters?.properties??tool?.parameters?.properties??{};
export function textOf(content:unknown):string{
  if(typeof content==='string')return content;
  if(Array.isArray(content))return content.map((part:any)=>typeof part?.text==='string'?part.text:'').join('');
  return '';
}
function argumentsFor(tool:any,wanted:Array<{pattern:RegExp;value:string}>):Record<string,unknown>{
  const names=Object.keys(toolProperties(tool));const out:Record<string,unknown>={};
  for(const {pattern,value} of wanted){const name=names.find(n=>pattern.test(n));if(name)out[name]=value;}
  return out;
}
/* Candidate bb3c61b4d (cure b78f4b29c, M2 and decision 194): a TALOS note after the last tool result (the shortened-results note)
   reaches a cloud provider as a `user` message of its own, wrapped in <talos-note> (sistema-piegato.mjs). It is TALOS speaking, not
   the person: the step of the plan and the person's last message are counted from the last user message that is not such a note. */
const TALOS_NOTE=/^<talos-note>/u;
export const isPersonMessage=(m:any):boolean=>m?.role==='user'&&!TALOS_NOTE.test(textOf(m.content));
/** Tool results after the person's last message: which step of a one-turn plan this request is. */
export function toolResultsOfTurn(body:any):number{
  const messages=Array.isArray(body?.messages)?body.messages:[];
  const lastUserAt=messages.map(isPersonMessage).lastIndexOf(true);
  return messages.slice(lastUserAt+1).filter((m:any)=>m?.role==='tool').length;
}

export async function startScriptedProvider({goodKey,models=[{id:'deepseek-flash',name:'DeepSeek Flash'}],respond,answerOther}:{goodKey:string|null;models?:Array<Record<string,unknown>>;respond:(request:ChatRequest)=>Step;answerOther?:(method:string,path:string)=>{status:number;body?:unknown}|null}):Promise<ScriptedProvider>{
  const requests:ChatRequest[]=[];const other:Array<{method:string;path:string}>=[];
  const sockets=new Set<import('node:net').Socket>();
  const json=(res:http.ServerResponse,status:number,body:unknown,headers:Record<string,string>={})=>{res.writeHead(status,{'content-type':'application/json',...headers});res.end(JSON.stringify(body));};
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url??'/','http://127.0.0.1');let raw='';for await(const chunk of req)raw+=chunk;
    if(!(req.method==='POST'&&url.pathname.endsWith('/chat/completions'))){
      other.push({method:String(req.method),path:url.pathname});
      const own=answerOther?.(String(req.method),url.pathname);if(own)return json(res,own.status,own.body??{error:{message:`fake HTTP ${own.status}`}});
      if(req.method==='GET'&&url.pathname.endsWith('/models'))return json(res,200,{data:models});
      return json(res,404,{error:{message:'not found (r5a-r fake)'}});
    }
    let body:any={};try{body=JSON.parse(raw||'{}');}catch{body={};}
    const messages=Array.isArray(body?.messages)?body.messages:[];
    const request:ChatRequest={index:requests.length,at:Date.now(),path:url.pathname,body,authorized:goodKey===null?req.headers.authorization===undefined:req.headers.authorization===`Bearer ${goodKey}`,
      lastUser:textOf([...messages].reverse().find(isPersonMessage)?.content),toolResults:toolResultsOfTurn(body),
      tools:(Array.isArray(body?.tools)?body.tools:[]).map(toolName)};
    requests.push(request);
    if(!request.authorized)return json(res,401,{error:{message:'Invalid credentials (fake)',code:401}});
    const step=respond(request);
    if(step.kind==='fail')return json(res,step.status,{error:{message:step.message??`fake HTTP ${step.status}`,code:step.status}},step.headers??{});
    const id='chatcmpl-r5a';const created=Math.floor(Date.now()/1000);
    const usage=step.usage===undefined?USAGE:step.usage;
    if(step.kind==='json'||!body.stream){
      const content=step.kind==='text'||step.kind==='json'?(step as any).text??(step as any).content:'';
      const toolCalls=step.kind==='tool'?toolCallsFor(step,body,request):[];
      return json(res,200,{id,object:'chat.completion',created,model:'fake',choices:[{index:0,message:{role:'assistant',content,...(toolCalls.length?{tool_calls:toolCalls}:{})},finish_reason:toolCalls.length?'tool_calls':'stop'}],...(usage?{usage}:{})});
    }
    res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});
    const sse=(payload:unknown)=>res.write(`data: ${JSON.stringify(payload)}\n\n`);
    if(step.kind==='text'){
      if(step.delayMs)await new Promise(resolve=>setTimeout(resolve,step.delayMs));
      if(step.reasoning)sse({id,object:'chat.completion.chunk',created,model:'fake',choices:[{index:0,delta:{role:'assistant',reasoning_content:step.reasoning},finish_reason:null}]});
      sse({id,object:'chat.completion.chunk',created,model:'fake',choices:[{index:0,delta:{role:'assistant',content:step.text},finish_reason:null}]});
      sse({id,object:'chat.completion.chunk',created,model:'fake',choices:[{index:0,delta:{},finish_reason:'stop'}]});
    }else{
      const calls=toolCallsFor(step,body,request).map((call,index)=>({index,...call}));
      sse({id,object:'chat.completion.chunk',created,model:'fake',choices:[{index:0,delta:{role:'assistant',tool_calls:calls},finish_reason:null}]});
      sse({id,object:'chat.completion.chunk',created,model:'fake',choices:[{index:0,delta:{},finish_reason:'tool_calls'}]});
    }
    if(usage&&body?.stream_options?.include_usage)sse({id,object:'chat.completion.chunk',created,model:'fake',choices:[],usage});
    res.end('data: [DONE]\n\n');
  });
  server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  const port=(server.address() as AddressInfo).port;
  return{url:`http://127.0.0.1:${port}`,requests,other,close:()=>new Promise<void>(resolve=>{for(const s of sockets)s.destroy();server.close(()=>resolve());})};
}
function toolCallsFor(step:Extract<Step,{kind:'tool'}>,body:any,request:ChatRequest){
  const tools=Array.isArray(body?.tools)?body.tools:[];const tool=tools.find((t:any)=>step.name.test(toolName(t)));
  if(!tool)throw new Error(`the fake was asked for a tool matching ${step.name} but none was offered: ${request.tools.join(', ')}`);
  return[{id:step.id??`call_${request.index}`,type:'function',function:{name:toolName(tool),arguments:JSON.stringify(argumentsFor(tool,step.args))}}];
}

export const MODEL='deepseek:deepseek-flash';
/* 0.6.13 (22/10/2026): since kernel d54028b4a the registry documents deepseek-flash (1M window, 393,216 output tokens, prices of
   2026-10-21), so it is no longer «a model no source knows». A test that needs an unknown window uses this id: no registry row, no
   provider row with a window (the fake's list names it, with no context length), models.dev off in a test profile. */
export const UNKNOWN_MODEL_ID='deepseek-unlisted-test';
export const UNKNOWN_MODEL=`deepseek:${UNKNOWN_MODEL_ID}`;
export const UNKNOWN_MODELS=[{id:UNKNOWN_MODEL_ID,name:'Unlisted (test)'}];
/** The real composition on the hermetic profile, with DeepSeek pointed at the fake and a dummy key saved; `extra.model` picks another model. */
export async function composeWithFake(h:Hermetic,url:string,key:string,extra:Record<string,unknown>={}):Promise<any>{
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  writeProviderRuntime(h.paths,{deepseek:url});
  const context:any=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:MODEL,env:{...process.env},environmentKeys:'consent',keyring:fakeKeyring(),...extra} as any);
  context.providerStore.setKey('deepseek',key);await context.tuiCatalog.chooseProvider('deepseek');
  return context;
}

/** Starts a run and collects every raw event the runtime delivers until the run ends (or the deadline passes). */
export async function runTurn(context:any,h:Hermetic,prompt:string,{permissionMode='bypassPermissions',timeoutMs=60_000,sessionId,model=MODEL}:{permissionMode?:string;timeoutMs?:number;sessionId?:string;model?:string}={}):Promise<{sessionId:string;raw:any[]}>{
  const terminal=(event:any)=>event?.type==='RunFinished'||event?.type==='RunError'||event?.type==='RunCancelled';
  let before=0;
  if(sessionId){await context.registry.attendiAssestamento(sessionId);const prior:any[]=[];const off=context.runtime.subscribe(sessionId,(event:any)=>prior.push(event),0);off();before=prior.filter(terminal).length;}
  const all:any[]=[];let ends=0;
  const id:string=sessionId?(await context.runtime.resume(sessionId,prompt),sessionId):await context.runtime.start({prompt,model,projectRoot:h.project,permissionMode});
  /* F-P-001: every mode but plan is the kernel's "On request", so the kernel asks the host for each command; as `-p` does
     (headless/run.ts), the CLI's own engine answers in the run's mode with nobody to ask. */
  const engine=createPermissionEngine({projectRoot:h.project??process.cwd(),rules:{allow:[],ask:[],deny:[]}}),answered=new Set<string>();
  const approve=(event:any)=>{const requestId=String(event.requestId);if(answered.has(requestId))return;answered.add(requestId);
    void engine.decide(permissionActionFromApproval(event),{interactive:false,mode:permissionMode as any,sessionId:id})
      .then(decision=>context.runtime.answerApproval(id,requestId,decision.kind==='allow')).catch(()=>{});};
  const unsubscribe=context.runtime.subscribe(id,(event:any)=>{all.push(event);if(event?.type==='ApprovalRequested')approve(event);if(terminal(event))ends++;},0);
  const deadline=Date.now()+timeoutMs;
  try{while(ends<=before){if(Date.now()>deadline)throw new Error(`the run did not end: ${JSON.stringify(all.map(e=>e?.type))}`);await new Promise(resolve=>setTimeout(resolve,20));}}
  finally{unsubscribe();}
  /* This run's events: everything after the previous run's terminal event. */
  let seen=0;const start=all.findIndex(event=>terminal(event)&&++seen===before);
  return{sessionId:id,raw:before?all.slice(start+1):all};
}

/*
 * G02: inside a long first turn the engine summarises the reads in SEGMENTS (context-engine compaction-planner.mjs
 * `planCompaction`), then merges the segment summaries. A real summariser quotes what it was given; so does this one:
 * the person's message when the segment holds it, else a line of a read result in the segment (a segment may begin in
 * the middle of a result, whose id is then its first source), and the merge reuses a citation of a segment summary.
 */
function ceCitationFor(request:ChatRequest,text:string):{id:string;quote:string}{
  let payload:any=null;try{payload=JSON.parse(String(request.body?.messages?.at(-1)?.content??''));}catch{/* not a summary request */}
  const segment=typeof payload?.untrustedSource==='string'?payload.untrustedSource:'';
  const ids:string[]=Array.isArray(payload?.sourceIds)?payload.sourceIds:[];
  const person=/(message-\d+) \(user\)\n[^\n]*read the ten files/u.exec(segment);
  if(person)return{id:person[1]!,quote:'read the ten files'};
  for(const id of ids){
    const own=new RegExp(`${id} \\(tool\\)\\n(compact file \\d+ line \\d{3})`,'u').exec(segment);
    if(own)return{id,quote:own[1]!};
  }
  /* r4 de8f33317 (C1): the pressure that reaches a summary is what the person wrote (a pasted log, test `Keep this log in mind:`); a
     segment of it cites one of its lines, under the person's message when the header is there, else under the segment's first source */
  const pasted=/(message-\d+) \(user\)\n[\s\S]*?(log line \d{4} service-\d)/u.exec(segment);
  if(pasted)return{id:pasted[1]!,quote:pasted[2]!};
  const pastedInside=/(log line \d{4} service-\d)/u.exec(segment);
  if(pastedInside&&ids[0])return{id:ids[0],quote:pastedInside[1]!};
  /* no header at all: the segment is the middle of its first source (it may even begin mid-line) */
  const inside=/(compact file \d+ line \d{3})/u.exec(segment);
  if(inside&&ids[0])return{id:ids[0],quote:inside[1]!};
  const reused=/recordId\\*"\s*:\s*\\*"(message-\d+)\\*"\s*,\s*\\*"quote\\*"\s*:\s*\\*"([^"\\]+)/u.exec(text);
  return reused?{id:reused[1]!,quote:reused[2]!}:{id:'message-2',quote:'read the ten files'};
}
/*
 * Realigned 13/10/2026 to r4 de8f33317 (C1, «rules before the summary»): tool outputs alone no longer reach a summary — the engine first
 * clears the old ones and shortens the big recent ones, with no model call. What it never touches is what the person wrote, so the
 * pressure that still needs a summary is an earlier turn where the person pasted a long log (about 115 KB against a 65,536 window).
 */
export const PASTE_NOTE='Keep this log in mind:';
export const pastedLog=(lines:number)=>`${PASTE_NOTE}\n`+Array.from({length:lines},(_,i)=>`log line ${String(i+1).padStart(4,'0')} service-${i%7} ${'y'.repeat(60)}`).join('\n');
export const PASTED_LOG=pastedLog(1500);
export function ceSummaryFor(request:ChatRequest):string{
  const text=JSON.stringify(request.body?.messages??[]);
  /* G02: inside a long first turn the engine summarises the reads in segments; a segment without the person's message
     cites a line that is really in one of its read results, as a real summariser would (a quote must match its record). */
  const {id,quote}=ceCitationFor(request,text);
  return JSON.stringify({schema:'talos.context.summary.v1',text:'The person asked to read ten files; the first ones were read.',goal:'Read the ten files.',decisions:[],constraints:[],completed:['read the first files'],pending:['read the rest'],resources:[],sources:[{recordId:id,quote}]});
}
