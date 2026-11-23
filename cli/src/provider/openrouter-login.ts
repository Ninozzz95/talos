/*
 * P21 (owner, 2026-09-26: "la possibilità di fare accesso oauth con Open Router, come fa l'applicazione desktop"; decisions
 * the same day): sign in to OpenRouter from the CLI without pasting a key. The end of the flow is a plain OpenRouter API key,
 * stored like a pasted one.
 *
 * The PKCE arithmetic is the desktop's own (`harness-ui/src/openrouter-oauth.mjs`, researched 2026-09-10 on OpenRouter's
 * OAuth PKCE docs and RFC 7636): S256 always, the verifier never leaves this process, a single-use code that OpenRouter lets
 * live 10 minutes, `state` carried in the callback PATH because OpenRouter documents no `state`, and error codes without
 * response bodies. This file adds what a CLI needs, read on 2026-09-26:
 * - a one-shot loopback server on 127.0.0.1 and a port the system picks, open only while the sign-in lasts (RFC 8252 §7.3,
 *   §8.3: the IP literal, not `localhost`; listen on loopback only; close the port once the answer is in); the system browser,
 *   never an embedded one (§8.12). Pi (`packages/ai/src/auth/oauth/openrouter.ts`) and Hermes (`hermes_cli/auth_openrouter.py`)
 *   do the same, Codex for its own sign-in (`codex-rs/login/src/server.rs`);
 * - a code pasted by hand, raced against the browser (Pi): the code alone or the whole address the browser landed on;
 * - a remote session (SSH) goes to OpenRouter's no-callback mode at once, where the page SHOWS the code (Hermes).
 */
import {spawn} from 'node:child_process';
import {createServer,type Server} from 'node:http';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export type OpenRouterOAuth={
  creaCoppiaPkce():{verifier:string;challenge:string};
  creaStato():string;
  indirizzoDiAutorizzazione(input:{challenge:string;callbackUrl?:string|null;etichetta?:string}):string;
  scambiaCodicePerChiave(input:{codice:string;verifier:string;fetchDiRete?:typeof fetch}):Promise<{chiave:string}>;
};
/** The desktop's PKCE module, from the checkout or from the package's own copy of the kernel (`vendor/harness-ui`). */
export async function loadOpenRouterOAuth(repoRoot:string):Promise<OpenRouterOAuth>{
  return await import(pathToFileURL(join(repoRoot,'harness-ui','src','openrouter-oauth.mjs')).href) as OpenRouterOAuth;
}

/** What OpenRouter writes beside the key on the person's key page, so they can tell which program asked and revoke it. */
export const LOGIN_LABEL='TALOS CLI';
/** OpenRouter's code lives 10 minutes ("The code is single-use and expires after 10 minutes"); the wait is the same. */
export const LOGIN_TIMEOUT_MS=10*60*1000;
const EXCHANGE_TIMEOUT_MS=30_000;

export function isRemoteSession(env:Record<string,string|undefined>=process.env):boolean{
  return Boolean(env.SSH_CONNECTION||env.SSH_CLIENT||env.SSH_TTY);
}

/** The code in what the person pasted: the code itself, or the address (or query) the browser landed on. */
export function codeFromInput(input:string):string|null{
  const value=String(input??'').trim();
  if(!value)return null;
  try{const url=new URL(value);return url.searchParams.get('code')||null;}catch{/* not an address */}
  if(value.includes('code=')){const code=new URLSearchParams(value.replace(/^[^?]*\?/u,'')).get('code');return code||null;}
  return /\s/u.test(value)?null:value;
}

/**
 * Opens the address in the system browser, without a shell (on Windows `&` in an address would split a `cmd` line).
 * A test profile never opens a window: the address is only shown.
 */
export function openInBrowser(url:string,{env=process.env,platform=process.platform,spawnImpl=spawn}:{env?:Record<string,string|undefined>;platform?:string;spawnImpl?:typeof spawn}={}):boolean{
  if(env.TALOS_TEST_PROFILE==='1')return false;
  if(!/^https:\/\//u.test(url))return false;
  const [command,args]=platform==='win32'?['rundll32',['url.dll,FileProtocolHandler',url]]:platform==='darwin'?['open',[url]]:['xdg-open',[url]];
  try{const child=spawnImpl(command,args,{detached:true,stdio:'ignore',windowsHide:true});child.on('error',()=>{});child.unref();return true;}
  catch{return false;}
}

export class OpenRouterLoginError extends Error{
  code:string;status:number|null;
  constructor(code:string,message:string,status:number|null=null){super(message);this.name='OpenRouterLoginError';this.code=code;this.status=status;}
}
const failure=(error:unknown)=>error instanceof OpenRouterLoginError?error:new OpenRouterLoginError(String((error as any)?.code??'OAUTH_FAILED'),'The sign-in did not complete.',typeof (error as any)?.stato==='number'?(error as any).stato:null);

const PAGE=(title:string)=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>TALOS</title></head><body style="font-family:sans-serif;margin:3em"><h1>${title}</h1></body></html>`;

export type OpenRouterLogin={
  /** The address to open. */
  url:string;
  /** `browser`: the browser comes back by itself (a code may still be pasted); `paste`: OpenRouter shows the code to paste. */
  mode:'browser'|'paste';
  /** Whether the browser was asked to open the address. */
  opened:boolean;
  /** The key, once the browser came back or a pasted code was exchanged. */
  key:Promise<string>;
  /** A code (or the address the browser landed on) pasted by the person. */
  submit(input:string):Promise<string>;
  /** Stops waiting; closes the loopback port. */
  cancel():void;
};

export async function startOpenRouterLogin({oauth,env=process.env,paste=false,open=openInBrowser,fetchImpl=globalThis.fetch,timeoutMs=LOGIN_TIMEOUT_MS,label=LOGIN_LABEL}:{
  oauth:OpenRouterOAuth;env?:Record<string,string|undefined>;paste?:boolean;open?:(url:string)=>boolean;fetchImpl?:typeof fetch;timeoutMs?:number;label?:string;
}):Promise<OpenRouterLogin>{
  const {verifier,challenge}=oauth.creaCoppiaPkce();
  const state=oauth.creaStato();
  const byHand=paste||isRemoteSession(env);
  let settled=false,claimed=false,server:Server|null=null,timer:ReturnType<typeof setTimeout>|null=null;
  let resolveKey:(key:string)=>void=()=>{};let rejectKey:(error:Error)=>void=()=>{};
  const key=new Promise<string>((resolve,reject)=>{resolveKey=resolve;rejectKey=reject;});
  key.catch(()=>{/* a caller that only uses submit() still sees the error there */});
  /* The port stops taking requests as soon as the sign-in is decided (RFC 8252 §8.3); the page the browser is waiting for is
     still sent (a forced close there showed the person a broken connection instead of "Signed in"). Only a cancel or a
     timeout drops the open connections too. */
  const close=(force:boolean)=>{if(timer){clearTimeout(timer);timer=null;}if(server){server.close();if(force)server.closeAllConnections?.();server=null;}};
  const finish=(outcome:{key:string}|{error:Error},force=false)=>{if(settled)return;settled=true;close(force);if('key' in outcome)resolveKey(outcome.key);else rejectKey(outcome.error);};
  const fetchDiRete=((input:any,init:any)=>fetchImpl(input,{...init,signal:AbortSignal.timeout(EXCHANGE_TIMEOUT_MS)})) as typeof fetch;
  const exchange=async(code:string)=>{
    claimed=true;
    try{const {chiave}=await oauth.scambiaCodicePerChiave({codice:code,verifier,fetchDiRete});finish({key:chiave});}
    catch(error){finish({error:failure(error)});}
    return key;
  };

  let callbackUrl:string|null=null;
  if(!byHand){
    const path=`/openrouter/callback/${encodeURIComponent(state)}`;
    server=createServer((request,response)=>{
      const send=(status:number,title:string)=>{response.statusCode=status;response.setHeader('content-type','text/html; charset=utf-8');response.setHeader('cache-control','no-store');response.setHeader('connection','close');response.end(PAGE(title));};
      const requestUrl=new URL(request.url??'/','http://127.0.0.1');
      if(request.method!=='GET'||requestUrl.pathname!==path){send(404,'Not found.');return;}
      if(claimed||settled){send(409,'This sign-in has already been used.');return;}
      if(requestUrl.searchParams.get('error')){send(400,'OpenRouter sign-in was cancelled. You can close this page.');finish({error:new OpenRouterLoginError('OAUTH_DENIED','OpenRouter sign-in was cancelled in the browser.')});return;}
      const code=requestUrl.searchParams.get('code');
      if(!code){send(400,'OpenRouter returned no code.');return;}
      void exchange(code).then(()=>send(200,'Signed in to OpenRouter. You can close this page and go back to TALOS.'),()=>send(502,'The sign-in did not complete. Go back to TALOS.'));
    });
    await new Promise<void>((resolve,reject)=>{server!.once('error',reject);server!.listen(0,'127.0.0.1',()=>{server!.removeListener('error',reject);resolve();});});
    const address=server.address();
    if(!address||typeof address==='string'){close(true);throw new OpenRouterLoginError('OAUTH_CALLBACK_UNAVAILABLE','TALOS could not listen for OpenRouter on this machine.');}
    callbackUrl=`http://127.0.0.1:${address.port}${path}`;
  }
  const url=oauth.indirizzoDiAutorizzazione({challenge,callbackUrl,etichetta:label});
  timer=setTimeout(()=>finish({error:new OpenRouterLoginError('OAUTH_TIMEOUT','The sign-in took longer than 10 minutes.')},true),timeoutMs);
  timer.unref?.();
  const opened=byHand?false:open(url);
  return{
    url,mode:byHand?'paste':'browser',opened,key,
    async submit(input:string){
      if(settled||claimed)return key;
      const code=codeFromInput(input);
      if(!code)throw new OpenRouterLoginError('OAUTH_CODE_MISSING','That is not a code from OpenRouter.');
      return exchange(code);
    },
    cancel(){finish({error:new OpenRouterLoginError('OAUTH_CANCELLED','The sign-in was cancelled.')},true);},
  };
}
