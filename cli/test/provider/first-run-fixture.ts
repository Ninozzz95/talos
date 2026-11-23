/*
 * B1 slice 18 — shared fixture for the first-run tests. Not a test file (no `.test.ts`), imported by them.
 *
 * ⛔ HERMETIC, because this host holds real provider keys in its environment:
 *   - every variable whose NAME matches the redactor's rule (`diagnostics/redact.ts`) is removed for the test
 *     and restored afterwards, by name, before any dummy value is set;
 *   - APPDATA and LOCALAPPDATA point into a fresh temporary directory (`resolveCliPaths` ignores XDG on win32);
 *   - the keyring is an in-memory map, never the Windows keyring;
 *   - `globalThis.fetch` refuses every host but 127.0.0.1 for the test's duration, and records the origin it refused;
 *   - on 127.0.0.1 it reaches only a port a server of THIS process is listening on (0.7.0, judge v2451 item 13): the kernel's probes
 *     of the local engines (harness-ui/src/provider-probe.mjs:350, Ollama on 11434 and LM Studio on 1234) and any other port are
 *     answered here, in the process, as a closed port answers (undici's `fetch failed`, cause ECONNREFUSED), and recorded; they never
 *     knock on an engine the machine may be running;
 *   - the only provider that answers is a local HTTP server started here, and every key is a dummy.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensureCliPaths,resolveCliPaths,type CliPaths} from '../../src/paths.ts';

export const REPO_ROOT=fileURLToPath(new URL('../../../',import.meta.url));
export const SECRET_NAME=/^(?:.*(?:api[-_]?key|authorization|password|secret|token).*)$/iu;
export const CHR=(code:number)=>String.fromCodePoint(code);
export const ESC=CHR(0x1b);
export const KEYS={enter:'\r',down:`${ESC}[B`,up:`${ESC}[A`,right:`${ESC}[C`,backspace:CHR(0x7f),killStart:CHR(0x15)};

export type Hermetic={root:string;appdata:string;local:string;project:string;paths:CliPaths;network:{blocked:string[];allowedPaths:string[];otherSchemes:string[];localEngines:string[]}};

/* The loopback ports a server of this process listens on now, wherever it was started (these fixtures, a test's own server, an
   in-process kernel). Recorded once per process by wrapping `net.Server.prototype.listen`; a closed server leaves the set. */
export const LOCAL_ENGINE_PORTS:ReadonlySet<number>=new Set([11434,1234]);
const OWN_PORTS=new Set<number>();
const LISTEN_WRAPPED=Symbol.for('talos.test.first-run-fixture.listen');
if(!(net.Server.prototype as any)[LISTEN_WRAPPED]){
  const listen=net.Server.prototype.listen;
  net.Server.prototype.listen=function(this:net.Server,...args:any[]){
    this.once('listening',()=>{const address=this.address();if(address&&typeof address==='object'){const port=address.port;OWN_PORTS.add(port);this.once('close',()=>OWN_PORTS.delete(port));}});
    return (listen as any).apply(this,args);
  } as typeof listen;
  (net.Server.prototype as any)[LISTEN_WRAPPED]=true;
}
/** Whether a server of this process listens on that loopback port right now (for the tests of this fixture). */
export function ownLoopbackPort(port:number):boolean{return OWN_PORTS.has(port);}
/* what undici throws for a closed port: the same object a probe reads as «not reachable» */
function refusedHere(origin:string):TypeError{const cause=Object.assign(new Error(`connect ECONNREFUSED ${origin.replace(/^https?:\/\//u,'')}`),{code:'ECONNREFUSED',errno:-4078,syscall:'connect'});return new TypeError('fetch failed',{cause});}

const BORDER=String.fromCodePoint(0x2502);
/** A frame as a person reads it: border columns dropped, wrapped lines joined, whitespace collapsed. */
export function flat(frame:string){return frame.split('\n').map(line=>line.split(BORDER).join(' ').trim()).filter(Boolean).join(' ').replace(/\s+/gu,' ');}
/** Ink 7.1.1 emits these mode toggles separately from its complete debug frames. Keep every raw write. */
export function lastInkDebugFrame(frames:readonly string[]):string{return frames.findLast(frame=>frame!=='\x1b[?2004h'&&frame!=='\x1b[?2004l')??'';}
/** Every whitespace and border character removed: a key wrapped across lines or boxed is still found. */
export function compact(text:string){return text.split(BORDER).join('').replace(/\s+/gu,'');}

/** A dummy key that no provider issued: distinctive enough that any copy of it in an artefact is unambiguous. */
export function dummyKey(label:string){return `sk-talos-test-${label}-${Math.random().toString(36).slice(2,12)}${Math.random().toString(36).slice(2,12)}`;}

/**
 * Waits until nothing under `root` has changed for `quietMs`. Measured on this host: the session registry appends the tail of a
 * session (usage, RunFinished) after the screen already shows the answer, and once recreated a deleted temporary directory.
 * A key-absence scan taken before that tail would not cover the whole session file.
 */
export async function settle(root:string,{quietMs=600,timeoutMs=15000}:{quietMs?:number;timeoutMs?:number}={}){
  const snapshot=()=>{const rows:string[]=[];const walk=(dir:string)=>{let entries:fs.Dirent[]=[];try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}for(const entry of entries){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else{try{const st=fs.statSync(full);rows.push(`${full}:${st.size}:${st.mtimeMs}`);}catch{/* removed while walking */}}}};walk(root);return rows.sort().join('|');};
  const deadline=Date.now()+timeoutMs;let last=snapshot();let stableSince=Date.now();
  while(Date.now()-stableSince<quietMs){if(Date.now()>deadline)throw new Error(`files under ${root} kept changing`);await new Promise(resolve=>setTimeout(resolve,100));const now=snapshot();if(now!==last){last=now;stableSince=Date.now();}}
}

/* P17 (owner decisions 2026-09-26): a first launch with something missing opens the guided setup. These fixtures mount the
   app for other purposes, so their profile has launched before — recorded with another version, which keeps the full boot
   (`launch-state.ts`: an update is a full boot too). `firstLaunch:true` gives a profile that has never launched. */
export async function hermetic<T>(fn:(h:Hermetic)=>Promise<T>,{processEnv={},firstLaunch=false}:{processEnv?:Record<string,string>;firstLaunch?:boolean}={}):Promise<T>{
  const saved=new Map<string,string|undefined>();
  const save=(name:string)=>{if(!saved.has(name))saved.set(name,process.env[name]);};
  for(const name of Object.keys(process.env))if(SECRET_NAME.test(name)){save(name);delete process.env[name];}
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'talos-slice18-'));
  const appdata=path.join(root,'appdata');const local=path.join(root,'local');const project=path.join(root,'project');
  for(const dir of [appdata,local,project])fs.mkdirSync(dir,{recursive:true});
  const overrides:Record<string,string>={APPDATA:appdata,LOCALAPPDATA:local,XDG_CONFIG_HOME:path.join(root,'xdg-config'),XDG_STATE_HOME:path.join(root,'xdg-state'),XDG_CACHE_HOME:path.join(root,'xdg-cache'),FORCE_COLOR:'0',...processEnv};
  for(const [name,value] of Object.entries(overrides)){save(name);process.env[name]=value;}
  // Proven before anything runs: no real secret-looking variable survives into the test.
  for(const name of Object.keys(process.env))if(SECRET_NAME.test(name))assert.ok(Object.hasOwn(processEnv,name),`hermetic environment still holds ${name}`);
  const realFetch=globalThis.fetch;const network={blocked:[] as string[],allowedPaths:[] as string[],otherSchemes:[] as string[],localEngines:[] as string[]};
  globalThis.fetch=(async(input:any,init?:any)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:String(input?.url));
    // Only http and https reach a network; a file: or data: fetch (a dependency loading its own asset) is recorded by scheme.
    if(url.protocol!=='http:'&&url.protocol!=='https:'){network.otherSchemes.push(url.protocol);return realFetch(input,init);}
    if(url.hostname!=='127.0.0.1'){network.blocked.push(url.origin);throw new TypeError('TEST_NETWORK_BLOCKED');}
    /* a loopback port no server of this process listens on is answered here, as a closed port: the local engines' probes are
       recorded apart (they are the product's own, expected), any other port as blocked */
    const port=Number(url.port||(url.protocol==='https:'?443:80));
    if(!OWN_PORTS.has(port)){(LOCAL_ENGINE_PORTS.has(port)?network.localEngines:network.blocked).push(url.origin);throw refusedHere(url.origin);}
    network.allowedPaths.push(url.pathname);return realFetch(input,init);
  }) as typeof fetch;
  const paths=resolveCliPaths(process.env,process.platform,root);
  await ensureCliPaths(paths);
  if(!firstLaunch){const {bootPlan}=await import('../../src/tui/launch-state.ts');bootPlan({dataRoot:paths.dataRoot,version:'0.0.0-fixture'});}
  try{return await fn({root,appdata,local,project,paths,network});}
  finally{
    await settle(root).catch(()=>{});
    globalThis.fetch=realFetch;
    // Restored in reverse: on win32 `process.env` names are case-insensitive, so an override spelled `OpenRouter_Api_Key`
    // must be removed BEFORE the saved `OPENROUTER_API_KEY` comes back, or its removal would take the restored value with it.
    for(const [name,value] of [...saved].reverse()){if(value===undefined)delete process.env[name];else process.env[name]=value;}
    fs.rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:50});
  }
}

export function fakeKeyring(){
  const entries=new Map<string,string>();const k=(s:string,a:string)=>`${s}\u0000${a}`;
  return{entries,get:(s:string,a:string)=>entries.get(k(s,a))??null,set:(s:string,a:string,v:string)=>{entries.set(k(s,a),v);},remove:(s:string,a:string)=>{entries.delete(k(s,a));}};
}

export type FakeRequest={method:string;path:string;hadAuthorization:boolean;authorizedAs:'good'|'other'|null};
export type FakeProvider={url:string;port:number;requests:FakeRequest[];close():Promise<void>};

/**
 * An OpenAI-compatible provider on 127.0.0.1. `/models` is public (as OpenRouter's is), `/models/user` wants the good key,
 * `/chat/completions` streams "OK" to the good key and answers 401 to anything else (optionally echoing the header).
 * The request log keeps booleans, never a header value.
 */
export async function startFakeProvider({goodKey,models,echoAuthorizationOnFailure=false,revokedForChat=false}:{goodKey:string;models:Array<{id:string;name:string;context_length?:number}>;echoAuthorizationOnFailure?:boolean;revokedForChat?:boolean}):Promise<FakeProvider>{
  const requests:FakeRequest[]=[];
  const json=(res:http.ServerResponse,status:number,body:unknown)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url??'/','http://127.0.0.1');const auth=typeof req.headers.authorization==='string'?req.headers.authorization:null;
    let raw='';for await(const chunk of req)raw+=chunk;
    requests.push({method:String(req.method),path:url.pathname,hadAuthorization:Boolean(auth),authorizedAs:auth?auth===`Bearer ${goodKey}`?'good':'other':null});
    if(req.method==='GET'&&url.pathname.endsWith('/models/user')){if(auth!==`Bearer ${goodKey}`)return json(res,401,{error:{message:'No auth credentials found',code:401}});return json(res,200,{data:models});}
    if(req.method==='GET'&&url.pathname.endsWith('/models'))return json(res,200,{data:models});
    if(req.method==='POST'&&url.pathname.endsWith('/chat/completions')){
      if(revokedForChat||auth!==`Bearer ${goodKey}`)return json(res,401,{error:{message:echoAuthorizationOnFailure?`Invalid credentials: ${auth}`:'Invalid credentials',code:401}});
      let body:any={};try{body=JSON.parse(raw||'{}');}catch{body={};}
      if(body.stream){
        res.writeHead(200,{'content-type':'text/event-stream'});
        res.write(`data: ${JSON.stringify({id:'c1',choices:[{index:0,delta:{role:'assistant',content:'OK'}}]})}\n\n`);
        res.write(`data: ${JSON.stringify({id:'c1',choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:3,completion_tokens:1,total_tokens:4}})}\n\n`);
        res.end('data: [DONE]\n\n');return;
      }
      return json(res,200,{id:'c1',choices:[{index:0,message:{role:'assistant',content:'OK'},finish_reason:'stop'}],usage:{prompt_tokens:3,completion_tokens:1,total_tokens:4}});
    }
    json(res,404,{error:{message:'not found'}});
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  const port=(server.address() as any).port as number;
  return{url:`http://127.0.0.1:${port}`,port,requests,close:()=>new Promise<void>(resolve=>{server.closeAllConnections?.();server.close(()=>resolve());})};
}

export type OneTokenRequest={method:string;path:string;url:string;authorizedAs:'good'|'other'|null;headerNames:string[];body:string};
export type OneTokenProvider={url:string;requests:OneTokenRequest[];close():Promise<void>};

/**
 * B1 slice 18, fix round — a provider that answers ONE shape of minimal generation on 127.0.0.1:
 * `anthropic-messages` at `/messages` (the body the kernel validates) or `openai-chat` at `/chat/completions`.
 * The good key gets a well-formed 200, or, with `malformed`, a 200 whose body lacks the shape; any other key gets 401.
 * Every request is recorded with its raw body and URL, so a test can prove the key travelled only in the header.
 */
export async function startOneTokenProvider({goodKey,shape,malformed=false}:{goodKey:string;shape:'anthropic-messages'|'openai-chat';malformed?:boolean}):Promise<OneTokenProvider>{
  const requests:OneTokenRequest[]=[];
  const json=(res:http.ServerResponse,status:number,body:unknown)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url??'/','http://127.0.0.1');let raw='';for await(const chunk of req)raw+=chunk;
    const bearer=typeof req.headers.authorization==='string'?req.headers.authorization:null;const apiKey=typeof req.headers['x-api-key']==='string'?req.headers['x-api-key']:null;
    const presented=bearer??(apiKey?`Bearer ${apiKey}`:null);
    requests.push({method:String(req.method),path:url.pathname,url:String(req.url),authorizedAs:presented?presented===`Bearer ${goodKey}`?'good':'other':null,headerNames:Object.keys(req.headers),body:raw});
    const path=shape==='anthropic-messages'?'/messages':'/chat/completions';
    if(req.method!=='POST'||!url.pathname.endsWith(path))return json(res,404,{error:{message:'not found'}});
    if(presented!==`Bearer ${goodKey}`)return json(res,401,{error:{message:'invalid credentials'}});
    if(malformed)return json(res,200,{ok:true});
    if(shape==='anthropic-messages')return json(res,200,{id:'msg_1',type:'message',role:'assistant',model:'m',content:[{type:'text',text:'.'}],stop_reason:'max_tokens',usage:{input_tokens:8,output_tokens:1}});
    return json(res,200,{id:'c1',object:'chat.completion',choices:[{index:0,message:{role:'assistant',content:''},finish_reason:'length'}],usage:{prompt_tokens:8,completion_tokens:1,total_tokens:9}});
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  const port=(server.address() as any).port as number;
  return{url:`http://127.0.0.1:${port}`,requests,close:()=>new Promise<void>(resolve=>{server.closeAllConnections?.();server.close(()=>resolve());})};
}

/**
 * A server that answers 307 to every request, pointing at a SECOND 127.0.0.1 port that answers 200 to anything with a body
 * of every shape a key test accepts. If a key test followed the redirect, the second server would record it.
 */
export async function startRedirectPair():Promise<{url:string;target:{requests:Array<{method:string;path:string;hadAuthorization:boolean}>};close():Promise<void>}>{
  const targetRequests:Array<{method:string;path:string;hadAuthorization:boolean}>=[];
  const target=http.createServer(async(req,res)=>{
    for await(const _chunk of req){/* drain */}
    targetRequests.push({method:String(req.method),path:new URL(req.url??'/','http://127.0.0.1').pathname,hadAuthorization:typeof req.headers.authorization==='string'||typeof req.headers['x-api-key']==='string'});
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({data:[{id:'m1'}],id:'x',type:'message',role:'assistant',content:[],choices:[{index:0,message:{role:'assistant',content:''}}],usage:{prompt_tokens:1,input_tokens:1}}));
  });
  await new Promise<void>(resolve=>target.listen(0,'127.0.0.1',()=>resolve()));
  const targetPort=(target.address() as any).port as number;
  const redirect=http.createServer(async(req,res)=>{
    for await(const _chunk of req){/* drain */}
    res.writeHead(307,{location:`http://127.0.0.1:${targetPort}${req.url??'/'}`});res.end();
  });
  await new Promise<void>(resolve=>redirect.listen(0,'127.0.0.1',()=>resolve()));
  const port=(redirect.address() as any).port as number;
  const close=(server:http.Server)=>new Promise<void>(resolve=>{server.closeAllConnections?.();server.close(()=>resolve());});
  return{url:`http://127.0.0.1:${port}`,target:{requests:targetRequests},close:async()=>{await close(redirect);await close(target);}};
}

/** A port that was listening a moment ago and no longer is: "the provider cannot be reached". */
export async function closedPort():Promise<number>{
  const server=http.createServer();await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  const port=(server.address() as any).port as number;await new Promise<void>(resolve=>server.close(()=>resolve()));return port;
}

export function writeProviderRuntime(paths:CliPaths,providers:Record<string,string>){
  const rows=Object.fromEntries(Object.entries(providers).map(([id,endpoint])=>[id,{endpoint,endpointConfigured:true,timeoutSeconds:30}]));
  fs.writeFileSync(path.join(paths.dataRoot,'provider-runtime.json'),`${JSON.stringify({version:1,providers:rows},null,2)}\n`);
}

/** Every file under a directory, read as bytes and as UTF-8 and UTF-16LE text, so a key cannot hide by encoding. */
/** Call `settle(root)` first when a run may still be writing: see `settle`. */
export function filesContaining(root:string,needle:string):string[]{
  const hits:string[]=[];const utf16=Buffer.from(needle,'utf16le');const utf8=Buffer.from(needle,'utf8');
  const walk=(dir:string)=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(entry.isFile()){const bytes=fs.readFileSync(full);if(bytes.includes(utf8)||bytes.includes(utf16))hits.push(path.relative(root,full));}}};
  walk(root);return hits;
}
export function listFiles(root:string):string[]{
  const out:string[]=[];const walk=(dir:string)=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else out.push(path.relative(root,full));}};walk(root);return out.sort();
}

export type MountedTui={frames:string[];last():string;write(text:string):void;until(check:(frame:string)=>boolean,label:string,timeoutMs?:number):Promise<string>;typeAndEnter(text:string):Promise<void>;starts:any[];resumes:any[];unmount():void};

/** The real TuiApp, rendered by Ink into a fake TTY; returns the bytes it writes. */
export async function mountTui({context,projectRoot,paths,model='openai:gpt-5-mini',columns=80,rows=48,initialPrompt}:{context:any;projectRoot:string;paths:CliPaths;model?:string;columns?:number;rows?:number;initialPrompt?:string}):Promise<MountedTui>{
  const React=(await import('react')).default;const Ink:any=await import('ink');
  const {createTuiAppComponent}=await import('../../src/tui/app.ts');
  const {EventEmitter}=await import('node:events');const {PassThrough}=await import('node:stream');
  const frames:string[]=[];
  const stdout:any=Object.assign(new EventEmitter(),{columns,rows,isTTY:true,write(chunk:string){frames.push(String(chunk));return true;}});
  const stdin:any=Object.assign(new PassThrough(),{isTTY:true,setRawMode(){return stdin;},ref(){},unref(){}});
  const starts:any[]=[];const resumes:any[]=[];
  const real=context.runtime;
  const runtime:any={...real,start:async(input:any)=>{starts.push(input);return real.start(input);},resume:async(id:string,prompt?:string)=>{resumes.push({id});return real.resume(id,prompt);}};
  const TuiApp=createTuiAppComponent(React,Ink,{interactive:true,color:true,motion:false,unicode:true});
  const app=Ink.render(React.createElement(TuiApp,{runtime,catalog:context.tuiCatalog,invocation:{model,permissionMode:'default'},projectRoot,paths,permissionRules:{allow:[],ask:[],deny:[]},...(initialPrompt?{initialPrompt}:{})}),{stdout,stdin,stderr:stdout,debug:true,exitOnCtrlC:false,patchConsole:false});
  const last=()=>lastInkDebugFrame(frames);
  // `check` reads the frame as a person does (`flat`): a sentence wrapped at 80 columns is still the sentence.
  const until=async(check:(frame:string)=>boolean,label:string,timeoutMs=15000)=>{const deadline=Date.now()+timeoutMs;while(!check(flat(last()))){if(Date.now()>deadline)throw new Error(`timed out waiting for ${label}: ${JSON.stringify(last().slice(-1500))}`);await new Promise(resolve=>setTimeout(resolve,10));}return flat(last());};
  const write=(text:string)=>{stdin.write(text);};
  // The boot screen leaves on a key once the runtime is ready; the right arrow does nothing else.
  const deadline=Date.now()+20000;
  while(!last().includes(' · shift+tab')){if(Date.now()>deadline)throw new Error(`boot did not end: ${JSON.stringify(last().slice(-800))}`);write(KEYS.right);await new Promise(resolve=>setTimeout(resolve,50));}
  const typeAndEnter=async(text:string)=>{write(text);await until(frame=>frame.includes(`› ${text}`),`the composer to hold ${JSON.stringify(text)}`);write(KEYS.enter);};
  return{frames,last,write,until,typeAndEnter,starts,resumes,unmount:()=>app.unmount()};
}
