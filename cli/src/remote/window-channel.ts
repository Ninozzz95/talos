/*
 * 0.6.15 T3b (owner 26/10/2026, «la proposta completa»): every TUI window with remote control on opens a LOCAL channel, so the window
 * that hosts remote control can hand a device's operation to the window that owns the conversation. Never the network.
 * Research of 26/10 (RICERCA-T3B-INOLTRO-FINESTRE.md), followed point by point:
 * - no new daemon: the host connects to the owner's channel, as Hermes does (`gateway/host_attach.py`);
 * - Windows: a named pipe with a RANDOM name per window, `\\.\pipe\talos-cli-<sha256(data folder)[:12]>-<32 hex>`. libuv sets
 *   FILE_FLAG_FIRST_PIPE_INSTANCE (a taken name is EADDRINUSE, measured): on that a new name, never «connect to whoever is there».
 *   Node cannot set a private DACL (READ for Everyone, measured): nothing is written before the handshake (window-auth.ts).
 *   Never `readableAll`/`writableAll`.
 * - elsewhere: a Unix socket in a 0700 folder of the data folder (refused, not repaired, if its mode is not 0700 — Codex
 *   `daemon_directory.rs`), the socket itself 0600; never the abstract namespace;
 * - discovery by files: `<data>/remote/windows/<id>.json` = {v,id,pid,startedAt,label,channel,token}, written with tmp+rename,
 *   rewritten if it goes missing (OpenCode checks its own every 5 s), removed on an orderly exit;
 * - a window is alive only if the handshake AND `identify` answer (Hermes): a file alone never routes anything;
 * - the event stream respects `write()===false`: past a bounded backlog the subscription ends with `lag` and its last sequence, and
 *   the host subscribes again from there (the kernel replays from a sequence), so nothing is lost and memory does not grow.
 */
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {chmodSync,mkdirSync,readdirSync,readFileSync,renameSync,statSync,unlinkSync,writeFileSync} from 'node:fs';
import {createConnection,createServer,type Server,type Socket} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {clientProof,HANDSHAKE_TIMEOUT_MS,newNonce,newWindowToken,sameProof,validNonce,windowProof} from './window-auth.ts';
import {createFrameReader,encodeFrame,FRAME_CAP_AFTER_AUTH,FRAME_CAP_BEFORE_AUTH,type WindowFrame} from './window-frame.ts';

export const REGISTRATION_VERSION=1;
export const REGISTRATION_REFRESH_MS=5_000;
/* the backlog one subscription may hold in the socket before it ends with `lag` (research: 4 MiB) */
export const SUBSCRIPTION_BACKLOG_BYTES=4*1024*1024;

/* owner 27/10/2026: `elevated` — this window runs as administrator; the normal windows leave it the bridge (tui-remote.ts) */
export type WindowRegistration={v:number;id:string;pid:number;startedAt:string;label:string;channel:string;token:string;elevated?:boolean};
export type WindowIdentity={id:string;pid:number;startedAt:string;label:string};
export type WindowHandlers={
  /** the conversations this window has on screen (the current one) */
  attached():string[];
  /** T3b review R1: the real folder of a conversation of this window (the kernel's `cartellaPerChatFile`), for the host's consent check */
  folderOf?(sessionId:string):Promise<unknown>;
  /** the window's own in-process HTTP handler (`creaChiamataInterna`) */
  call(request:{metodo:string;percorso:string;corpo?:unknown;origine?:string;origineRemota?:unknown}):Promise<{stato:number;dati:unknown}>;
  /** the window's own event stream of a conversation, replayed from a sequence; returns the unsubscribe */
  subscribe(sessionId:string,from:number,onEvent:(event:unknown)=>void):()=>void;
  /**
   * T4: the remote coordinator of the window that HOSTS, for `talos remote` in a terminal (one coordinator per profile, never two
   * iroh endpoints with the same key). `connection` is the asking connection: what it opened (a pairing QR) closes when it drops.
   */
  coordinator?(request:{method:string;args:unknown[];token:string},connection:WindowConnection):Promise<unknown>;
};
/** T4: one authenticated connection to this window, as the coordinator service sees it */
export type WindowConnection={id:string;onClose(listener:()=>void):void};

const fail=(code:string,message:string)=>Object.assign(new Error(message),{code});
/* Desktop block 11 (r4 6a4fc5e2b, remoto/chiamata-interna.mjs): a kernel refusal carries `reason`, `params` and the precise
   `explanation` the device's sentence is chosen from (servizio.mjs cleans them for the phone); a call forwarded to another window
   keeps them, bounded, or the device reads only the code's generic sentence */
function refusalWords(error:any):Record<string,unknown>{
  const out:Record<string,unknown>={};
  if(typeof error?.reason==='string'&&error.reason)out.reason=error.reason.slice(0,100);
  if(typeof error?.explanation==='string'&&error.explanation)out.explanation=error.explanation.slice(0,1000);
  if(error?.params&&typeof error.params==='object'&&!Array.isArray(error.params)){
    try{const json=JSON.stringify(error.params);if(json.length<=2048)out.params=JSON.parse(json);}catch{}
  }
  return out;
}
export function windowsFolder(dataRoot:string){return join(dataRoot,'remote','windows');}
/** The process start, as `session-lease.mjs` writes it (`avviatoIl`): with the pid it tells a reused pid from the window. */
export function processStartedAt(now=Date.now(),uptimeSeconds=process.uptime()):string{return new Date(now-Math.round(uptimeSeconds*1000)).toISOString();}

const folderHashOf=(dataRoot:string)=>createHash('sha256').update(dataRoot).digest('hex').slice(0,12);
/**
 * Block 9 H-R1: whether a registration's channel is one THIS data folder's windows make (channelName below). On Windows the name is
 * fixed: `\\.\pipe\talos-cli-<12 hex of this folder>-<32 hex>`; a registration naming any other pipe (a system one that also refuses a
 * normal process) is no TALOS window of this profile. Elsewhere a socket path in this profile's channels folder or the private temp one.
 */
export function isOwnChannel(dataRoot:string,channel:unknown,platform:string=process.platform):boolean{
  if(typeof channel!=='string')return false;
  const hash=folderHashOf(dataRoot);
  if(platform==='win32'){const prefix=String.raw`\\.\pipe\talos-cli-`+`${hash}-`;return channel.startsWith(prefix)&&/^[0-9a-f]{32}$/u.test(channel.slice(prefix.length));}
  return channel.startsWith(join(dataRoot,'remote','channels'))||channel.startsWith(join(tmpdir(),'talos-cli-'));
}

function channelName(dataRoot:string,platform:string):string{
  const folderHash=folderHashOf(dataRoot);
  const random=randomBytes(16).toString('hex');
  if(platform==='win32')return `\\\\.\\pipe\\talos-cli-${folderHash}-${random}`;
  /* Unix: sun_path is ~104-108 bytes; past 100 a private folder in the temp directory, with the same checks */
  const inData=join(dataRoot,'remote','channels');
  const folder=join(inData,'x').length+28>100?join(tmpdir(),`talos-cli-${process.getuid?.()??'u'}`):inData;
  privateFolder(folder);
  return join(folder,`${random.slice(0,12)}.sock`);
}
/** A 0700 folder of this user: created so, refused (never repaired) when it is not. */
function privateFolder(folder:string){
  mkdirSync(folder,{recursive:true,mode:0o700});
  const info=statSync(folder);
  const uid=process.getuid?.();
  if((info.mode&0o777)!==0o700||(uid!==undefined&&info.uid!==uid))throw fail('WINDOW_CHANNEL_FOLDER_UNSAFE',`The folder ${folder} is not private to this user (mode 0700).`);
}

function writeRegistration(file:string,registration:WindowRegistration){
  mkdirSync(join(file,'..'),{recursive:true,mode:0o700});
  const temp=`${file}.${process.pid}.tmp`;
  writeFileSync(temp,JSON.stringify(registration),{mode:0o600});
  renameSync(temp,file);
}

export type WindowChannel={identity:WindowIdentity;channel:string;close():Promise<void>};

/**
 * Opens this window's channel and registers it. Each connection: the client writes `hello{nc}` first (nothing is written to a client
 * that has not), the window answers `challenge{ns,ms}`, the client proves itself with `proof{mc}`; from there `req`/`res`, `sub`/`evt`/
 * `lag`/`unsub`, `ping`/`pong`. Any error, any frame out of place, any time out: the connection is destroyed in silence.
 */
export async function openWindowChannel(input:{dataRoot:string;label:string;handlers:WindowHandlers;platform?:string;now?:()=>number;elevated?:boolean;
  setInterval?:typeof setInterval;clearInterval?:typeof clearInterval;backlogBytes?:number}):Promise<WindowChannel>{
  const backlog=input.backlogBytes??SUBSCRIPTION_BACKLOG_BYTES;
  const platform=input.platform??process.platform;
  const identity:WindowIdentity={id:randomUUID(),pid:process.pid,startedAt:processStartedAt(),label:input.label};
  const token=newWindowToken();
  const sockets=new Set<Socket>();
  const serve=(socket:Socket)=>{
    sockets.add(socket);
    const reader=createFrameReader(FRAME_CAP_BEFORE_AUTH);
    let stage:'hello'|'proof'|'ready'='hello';let clientNonce='';let windowNonce='';
    const subscriptions=new Map<string,()=>void>();
    /* T4: what the coordinator service tied to this connection (a pairing it opened), undone when the connection drops */
    const closeListeners:Array<()=>void>=[];
    const connection:WindowConnection={id:randomUUID(),onClose(listener){closeListeners.push(listener);}};
    const end=()=>{for(const off of subscriptions.values()){try{off();}catch{/* the stream may already be gone */}}subscriptions.clear();socket.destroy();};
    const timer=setTimeout(()=>{if(stage!=='ready')end();},HANDSHAKE_TIMEOUT_MS);
    const send=(frame:{t:string;[key:string]:unknown})=>{if(!socket.destroyed)return socket.write(encodeFrame(frame));return false;};
    const answer=async(frame:WindowFrame)=>{
      const id=String(frame.id??'');
      try{
        let data:unknown;
        if(frame.op==='identify')data=identity;
        else if(frame.op==='attached')data=input.handlers.attached();
        else if(frame.op==='call')data=await input.handlers.call(frame.args as any);
        else if(frame.op==='folderOf'&&input.handlers.folderOf)data=await input.handlers.folderOf(String(frame.args??''));
        else if(frame.op==='coordinator'&&input.handlers.coordinator){
          const a=(frame.args??{}) as {method?:unknown;args?:unknown;token?:unknown};
          data=await input.handlers.coordinator({method:String(a.method??''),args:Array.isArray(a.args)?a.args:[],token:String(a.token??'')},connection);
        }
        else throw fail('WINDOW_UNKNOWN_OPERATION','Unknown operation on the window channel.');
        send({t:'res',id,ok:true,data});
      }catch(error:any){
        /* the numbers a caller acts on travel too (T4 research §5.5: PAIR_LOCKED's wait), a closed list, integers only */
        const numbers:Record<string,number>={};
        for(const key of ['stato','retryAfterMs'] as const)if(Number.isInteger(error?.[key]))numbers[key]=error[key];
        send({t:'res',id,ok:false,error:{code:String(error?.code??'WINDOW_CALL_FAILED'),message:String(error?.message??'The window could not do it.').slice(0,500),...numbers,...refusalWords(error)}});
      }
    };
    const subscribe=(frame:WindowFrame)=>{
      const sub=String(frame.id??'');const sessionId=String(frame.sessionId??'');const from=Number.isInteger(frame.from)?Number(frame.from):0;
      if(!sub||subscriptions.has(sub))return;
      let last=from;let ended=false;let off:(()=>void)|null=null;
      const stop=()=>{ended=true;const was=off;off=null;try{was?.();}catch{/* the stream may already be gone */}};
      const unsubscribe=input.handlers.subscribe(sessionId,from,(event:any)=>{
        if(ended)return;
        if(Number.isInteger(event?._sequenza))last=event._sequenza;
        send({t:'evt',sub,e:event});
        if(socket.writableLength>backlog){ended=true;send({t:'lag',sub,last});stop();subscriptions.delete(sub);}
      });
      /* T3b review R5: the kernel replays synchronously INSIDE subscribe, so a lag can come before the unsubscribe exists: it is
         called the moment it does, never left alive in the kernel */
      off=unsubscribe;
      if(ended){stop();return;}
      subscriptions.set(sub,stop);
    };
    socket.on('data',(chunk:Buffer)=>{
      let frames:WindowFrame[];
      try{frames=reader.push(chunk);}catch{end();return;}
      for(const frame of frames){
        if(stage==='hello'){
          if(frame.t!=='hello'||!validNonce(frame.nc)){end();return;}
          clientNonce=frame.nc;windowNonce=newNonce();stage='proof';
          send({t:'challenge',ns:windowNonce,ms:windowProof(token,clientNonce,windowNonce)});
        }else if(stage==='proof'){
          if(frame.t!=='proof'||!sameProof(clientProof(token,windowNonce,clientNonce),frame.mc)){end();return;}
          stage='ready';clearTimeout(timer);reader.raiseCap(FRAME_CAP_AFTER_AUTH);send({t:'ready'});
        }else if(frame.t==='req')void answer(frame);
        else if(frame.t==='sub')subscribe(frame);
        else if(frame.t==='unsub'){const off=subscriptions.get(String(frame.id??''));if(off){off();subscriptions.delete(String(frame.id??''));}}
        else if(frame.t==='ping')send({t:'pong'});
        else{end();return;}
      }
    });
    socket.on('error',()=>end());
    socket.on('close',()=>{
      clearTimeout(timer);for(const off of subscriptions.values()){try{off();}catch{/* gone */}}subscriptions.clear();sockets.delete(socket);
      for(const listener of closeListeners.splice(0)){try{listener();}catch{/* the service's own fault */}}
    });
  };
  /* a taken name (EADDRINUSE) gets a new random one, a few times; never a connection to whoever holds it */
  let server:Server|null=null;let channel='';
  for(let attempt=0;attempt<4&&!server;attempt++){
    channel=channelName(input.dataRoot,platform);
    const candidate=createServer(serve);
    try{
      await new Promise<void>((resolve,reject)=>{candidate.once('error',reject);candidate.listen(channel,()=>{candidate.off('error',reject);resolve();});});
      server=candidate;
    }catch(error:any){candidate.close();if(error?.code!=='EADDRINUSE')throw error;}
  }
  if(!server)throw fail('WINDOW_CHANNEL_UNAVAILABLE','The window channel could not open.');
  if(platform!=='win32'){try{chmodSync(channel,0o600);}catch{/* the folder is 0700 already */}}
  const file=join(windowsFolder(input.dataRoot),`${identity.id}.json`);
  const registration:WindowRegistration={v:REGISTRATION_VERSION,...identity,channel,token,...(input.elevated?{elevated:true}:{})};
  writeRegistration(file,registration);
  const every=input.setInterval??setInterval;const stop=input.clearInterval??clearInterval;
  /* OpenCode's check: the registration still exists and is still this window's, or it is written again */
  const refresh=every(()=>{
    try{const now=JSON.parse(readFileSync(file,'utf8'));if(now?.id===identity.id&&now?.token===token)return;}catch{/* missing or broken: written again */}
    try{writeRegistration(file,registration);}catch{/* next beat */}
  },REGISTRATION_REFRESH_MS);
  (refresh as any)?.unref?.();
  let closed=false;
  return{
    identity,channel,
    async close(){
      if(closed)return;closed=true;stop(refresh as any);
      for(const socket of sockets)socket.destroy();
      await new Promise<void>(resolve=>server!.close(()=>resolve()));
      try{const now=JSON.parse(readFileSync(file,'utf8'));if(now?.id===identity.id)unlinkSync(file);}catch{/* already gone */}
    },
  };
}

/** The registrations of the other windows (not this one), as written; a broken file is skipped. Nothing here proves a window alive. */
export function readRegistrations(dataRoot:string,exceptId?:string):WindowRegistration[]{
  let names:string[]=[];
  try{names=readdirSync(windowsFolder(dataRoot)).filter(name=>name.endsWith('.json'));}catch{return[];}
  const out:WindowRegistration[]=[];
  for(const name of names){
    try{
      const r=JSON.parse(readFileSync(join(windowsFolder(dataRoot),name),'utf8'));
      if(r?.v!==REGISTRATION_VERSION||typeof r.id!=='string'||r.id===exceptId||typeof r.channel!=='string'||typeof r.token!=='string'||!Number.isInteger(r.pid))continue;
      out.push({v:r.v,id:r.id,pid:r.pid,startedAt:String(r.startedAt??''),label:String(r.label??''),channel:r.channel,token:r.token,...(r.elevated===true?{elevated:true}:{})});
    }catch{/* written half: skipped this time */}
  }
  return out;
}

/** A registration whose channel refuses AND whose pid is gone is removed; never on a time out (research, recommendation 6). */
export function removeStaleRegistration(dataRoot:string,registration:WindowRegistration,alive:(pid:number)=>boolean){
  if(alive(registration.pid))return false;
  try{unlinkSync(join(windowsFolder(dataRoot),`${registration.id}.json`));return true;}catch{return false;}
}

export type WindowClient={
  identity:WindowIdentity;
  request<T=unknown>(op:'identify'|'attached'|'call'|'folderOf'|'coordinator',args?:unknown,timeoutMs?:number):Promise<T>;
  subscribe(sessionId:string,from:number,onEvent:(event:unknown)=>void,onEnd:(reason:{lag?:number;gone?:boolean})=>void):()=>void;
  onClose(listener:()=>void):void;
  close():void;
  readonly closed:boolean;
};

/**
 * Connects to another window: the handshake (the window must prove it holds the token too), then `identify`, which must name the
 * registration's own id, pid and start. Fails with WINDOW_UNREACHABLE (no channel), WINDOW_HANDSHAKE (wrong proof, time out) or
 * WINDOW_MISMATCH (another window answered).
 */
export function connectWindow(registration:WindowRegistration,{timeoutMs=HANDSHAKE_TIMEOUT_MS}:{timeoutMs?:number}={}):Promise<WindowClient>{
  return new Promise((resolve,reject)=>{
    const socket=createConnection(registration.channel);
    const reader=createFrameReader(FRAME_CAP_BEFORE_AUTH);
    const clientNonce=newNonce();
    let stage:'connecting'|'challenge'|'ready'|'identify'|'open'='connecting';
    let settled=false;let closed=false;
    const pending=new Map<string,{resolve:(v:any)=>void;reject:(e:any)=>void;timer:ReturnType<typeof setTimeout>}>();
    const subs=new Map<string,{onEvent:(e:unknown)=>void;onEnd:(r:{lag?:number;gone?:boolean})=>void}>();
    const closeListeners:Array<()=>void>=[];
    let seq=0;const nextId=()=>`${Date.now().toString(36)}-${++seq}`;
    const giveUp=(code:string,message:string)=>{if(settled)return;settled=true;clearTimeout(handshake);socket.destroy();reject(fail(code,message));};
    const handshake=setTimeout(()=>giveUp('WINDOW_HANDSHAKE','The window did not answer in time.'),timeoutMs);
    const send=(frame:{t:string;[key:string]:unknown})=>{if(!socket.destroyed)socket.write(encodeFrame(frame));};
    const request=<T,>(op:string,args?:unknown,ms=10_000)=>new Promise<T>((ok,no)=>{
      if(closed){no(fail('WINDOW_GONE','The window closed.'));return;}
      const id=nextId();
      const timer=setTimeout(()=>{pending.delete(id);no(fail('WINDOW_TIMEOUT','The window did not answer in time.'));},ms);
      pending.set(id,{resolve:ok,reject:no,timer});
      send({t:'req',id,op,...(args===undefined?{}:{args})});
    });
    const client:WindowClient={
      identity:{id:registration.id,pid:registration.pid,startedAt:registration.startedAt,label:registration.label},
      request:(op,args,ms)=>request(op,args,ms),
      subscribe(sessionId,from,onEvent,onEnd){
        const id=nextId();subs.set(id,{onEvent,onEnd});send({t:'sub',id,sessionId,from});
        return()=>{if(subs.delete(id))send({t:'unsub',id});};
      },
      onClose(listener){closeListeners.push(listener);},
      close(){socket.destroy();},
      get closed(){return closed;},
    };
    socket.on('connect',()=>{stage='challenge';send({t:'hello',nc:clientNonce});});
    socket.on('data',(chunk:Buffer)=>{
      let frames:WindowFrame[];
      try{frames=reader.push(chunk);}catch{giveUp('WINDOW_HANDSHAKE','The window sent a broken frame.');socket.destroy();return;}
      for(const frame of frames){
        if(stage==='challenge'){
          if(frame.t!=='challenge'||!validNonce(frame.ns)||!sameProof(windowProof(registration.token,clientNonce,frame.ns),frame.ms)){giveUp('WINDOW_HANDSHAKE','The window could not prove who it is.');return;}
          stage='ready';send({t:'proof',mc:clientProof(registration.token,frame.ns,clientNonce)});
        }else if(stage==='ready'){
          if(frame.t!=='ready'){giveUp('WINDOW_HANDSHAKE','The window refused the proof.');return;}
          reader.raiseCap(FRAME_CAP_AFTER_AUTH);stage='identify';
          request<WindowIdentity>('identify',undefined,timeoutMs).then(who=>{
            if(who?.id!==registration.id||who?.pid!==registration.pid||who?.startedAt!==registration.startedAt){giveUp('WINDOW_MISMATCH','Another window answered on this channel.');return;}
            if(settled)return;settled=true;clearTimeout(handshake);stage='open';resolve(client);
          },(error:any)=>giveUp(String(error?.code??'WINDOW_HANDSHAKE'),'The window did not identify itself.'));
        }else if(frame.t==='res'){
          const waiting=pending.get(String(frame.id??''));if(!waiting)continue;
          pending.delete(String(frame.id));clearTimeout(waiting.timer);
          if(frame.ok===true)waiting.resolve(frame.data);
          else{
            const e=(frame.error??{}) as any;const numbers:Record<string,number>={};
            for(const key of ['stato','retryAfterMs'])if(Number.isInteger(e[key]))numbers[key]=e[key];
            waiting.reject(Object.assign(fail(String(e.code??'WINDOW_CALL_FAILED'),String(e.message??'The window could not do it.')),numbers,refusalWords(e)));
          }
        }else if(frame.t==='evt'){subs.get(String(frame.sub??''))?.onEvent(frame.e);}
        else if(frame.t==='lag'){const s=subs.get(String(frame.sub??''));if(s){subs.delete(String(frame.sub));s.onEnd({lag:Number(frame.last)||0});}}
      }
    });
    const onGone=()=>{
      if(closed)return;closed=true;clearTimeout(handshake);
      if(!settled){settled=true;reject(fail('WINDOW_UNREACHABLE','The window channel is not there.'));}
      for(const waiting of pending.values()){clearTimeout(waiting.timer);waiting.reject(fail('WINDOW_GONE','The window closed before answering.'));}
      pending.clear();
      for(const s of subs.values()){try{s.onEnd({gone:true});}catch{/* listener */}}
      subs.clear();
      for(const listener of closeListeners){try{listener();}catch{/* listener */}}
    };
    socket.on('error',()=>onGone());
    socket.on('close',()=>onGone());
  });
}
