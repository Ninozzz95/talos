/*
 * 0.6.15 T3b (owner 26/10/2026, «la proposta completa»): the device commands ALL open windows. The kernel's remote module takes from
 * its host three things for the conversations — `chiama` (the HTTP routes), a session registry, `iscriviConRigiocata` (the event
 * stream). The host gives it FEDERATED ones: each conversation goes to the window that owns it; nothing in the kernel changes.
 *
 * Who owns a conversation, in order (DISEGNO-T3B-INOLTRO-FINESTRE.md; the Desktop, 26/10: «the lease is a WRITE lock, not an
 * ownership signal»):
 *   1. the process holding its lease (`<sessions>/.affitti/<id>.json`: a live turn, a recent write) — the window whose registration
 *      has the same pid AND the same process start (`avviatoIl`), so a reused pid never routes;
 *   2. otherwise the window that has it ON SCREEN (`attached`, published by each window on its channel);
 *   3. otherwise this host: loaded from disk, and the lease is taken at its first write as always (whoever writes next reads the
 *      journal again first — the owner's decision of 10/10, «ricaricarla da sola»).
 * The device's list: the host's rows ∪ every window's rows (their own GET /api/v1/sessions, identical) ∪ the CLOSED conversations of the
 * index, which nobody holds in memory (the Mobile, 26/10: `conclusa:true, interrotta:false` unless it died mid-turn, no waits,
 * `ultimaRispostaAlle` = the last real date). The windows are asked in parallel with a cap each: the list answers within the phone's
 * 10 s, a slow window stays out.
 *
 * Adversarial review of 26/10 (REVISIONE-T3B-2026-10-26.md), cured here:
 * - R1 (critical): the kernel's consent check (`operazioni.mjs` `richiedeConsenso`) asks the registry for the conversation's folder and
 *   lets the write pass when it gets none. The federated `cartellaPerChatFile` answers for every conversation — the owning window's
 *   folder, or the archive's after loading it here — and a WRITE forwarded to another window is checked again here, CLOSED on failure:
 *   a folder that cannot be known is a refusal. This host's own handler gets `remotoFn` (host.ts), so the kernel's second gate in
 *   http-app is armed for what runs here.
 * - R2: the event stream follows the conversation when its owner changes (re-checked after every operation on it and at every poll),
 *   from the last sequence delivered; a sequence already delivered and a second end-of-replay marker are not delivered twice (R9).
 * - R11: for the wake-up (`elenca`) the owner's row wins, as in the device's list.
 * - R3: `esiste` asks the journal itself too; the closed rows are read again at every list, the newest 500 (the wire's 1 MiB).
 * - R4: a conversation that died mid-turn is `interrotta`; R12: `custom` (a new session) is not a conversation to load.
 * The device files of a conversation another window holds see no history (`iscriviti` is synchronous there): said, not hidden.
 */
import {existsSync,readFileSync,statSync} from 'node:fs';
import {hostname} from 'node:os';
import {join} from 'node:path';
import {connectWindow,readRegistrations,removeStaleRegistration,type WindowClient,type WindowRegistration} from './window-channel.ts';

export const PEER_POLL_MS=3_000;
export const PEER_ANSWER_MS=2_500;
/* a forwarded operation answers before the phone's own 10 s (ATTESA_CONTROLLO_MS): past it, the outcome is said unknown, not left hanging */
export const FORWARD_MS=9_000;
export const LIST_CLOSED_MS=3_000;
/* ~331 bytes a closed row: 500 keep the device's list far under the wire's 1 MiB (filo.mjs BYTE_MASSIMI) */
export const CLOSED_ROWS_MAX=500;
/* session-lease.mjs SCADENZA_MS: an mtime older than this is an expired lease */
export const LEASE_EXPIRY_MS=30_000;
/* the process start written in the lease and in a window's registration are two readings of `uptime`: they differ by milliseconds */
export const START_TOLERANCE_MS=2_000;

type Request={metodo:string;percorso:string;corpo?:unknown;origine?:string;origineRemota?:unknown};
type Call=(request:Request)=>Promise<{stato:number;dati:any}>;
type Subscribe=(input:{sessionRegistry:any;sessionId:string;daSequenza?:number;manda:(event:any)=>void})=>(()=>void)|undefined;
export type FederationLocal={
  call:Call;
  registry:any;
  /** the kernel's `iscriviConRigiocata`, on this window's registry */
  subscribeWithReplay:Subscribe;
  /** loads a conversation of the archive into this window when it is not in memory; false when the archive has none */
  ensureLoaded(sessionId:string):Promise<boolean>;
  /** every conversation of the index (CliSessionSummary rows) */
  listAll():Promise<any[]>;
  sessionsRoot:string;
  /** the remote's device folders (`remote.cartelle`), once the host runs; none ⇒ no folder consent, as in the kernel */
  consent?:()=>{consentita(dispositivoId:string,cartella:string):Promise<boolean>;descrivi?(cartella:string):Promise<unknown>}|null;
};
export type LeaseHolder={pid:number;startedAt:string}|null;

/** Who holds a conversation's lease now, read from its file; null when nobody does or the lease expired (session-lease.mjs rules). */
export function readLeaseHolder(sessionsRoot:string,sessionId:string,{now=Date.now(),host=hostname(),alive=processAlive}:{now?:number;host?:string;alive?:(pid:number)=>boolean}={}):LeaseHolder{
  const file=join(sessionsRoot,'.affitti',`${sessionId}.json`);
  try{
    const mtime=statSync(file).mtimeMs;
    if(now-mtime>LEASE_EXPIRY_MS)return null;
    const lease=JSON.parse(readFileSync(file,'utf8'));
    if(!Number.isSafeInteger(lease?.pid))return null;
    if(lease.host===host&&!alive(lease.pid))return null;
    return{pid:lease.pid,startedAt:String(lease.avviatoIl??'')};
  }catch{return null;}
}
export function processAlive(pid:number){try{process.kill(pid,0);return true;}catch(error:any){return error?.code==='EPERM';}}
const sameStart=(a:string,b:string)=>{const x=Date.parse(a),y=Date.parse(b);return Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x-y)<=START_TOLERANCE_MS;};
/* the kernel's own session id filter (remoto/index.mjs device.seen): no separator, no dots-only name */
const SESSION_ID=/^(?!\.+$)[A-Za-z0-9._:-]{1,200}$/u;

/** A row of the device's list for a conversation nobody has in memory (the Mobile's fields, 26/10/2026). */
export function closedRow(summary:any):any|null{
  const id=typeof summary?.sessionId==='string'&&summary.sessionId?summary.sessionId:typeof summary?.id==='string'?summary.id:null;
  if(!id)return null;
  const last=summary.endedAt??summary.updatedAt??summary.startedAt??null;
  /* review R4: «Da riprendere» only for a conversation that really died mid-turn */
  const interrupted=summary.interrupted===true;
  return{sessionId:id,nome:summary.name??null,progetto:summary.project??null,...(summary.parentId?{padreId:summary.parentId}:{}),
    ...(Number.isInteger(summary.depth)&&summary.depth>0?{profonditaDelega:summary.depth}:{}),...(summary.delegatedTask?{taskDelega:summary.delegatedTask}:{}),
    avviataAlle:summary.startedAt??null,ultimaRispostaAlle:last,conclusa:!interrupted,interrotta:interrupted,
    ...(summary.outcome==='failed'?{ultimoEsito:'errore'}:summary.outcome==='completed'?{ultimoEsito:'successo'}:{})};
}

/**
 * A device's WRITE in a conversation, as the kernel's second gate classifies it (http-app.mjs, R5.12): any method but GET/HEAD on
 * `/api/v1/sessions/<id>/…`, except stopping (`…/stop`, `…/close`, `…/processes/<id>/stop`, `…/delegation/pause`).
 */
export function isConversationWrite(request:{metodo?:string;percorso?:string}):boolean{
  const method=String(request?.metodo??'GET').toUpperCase();
  if(method==='GET'||method==='HEAD')return false;
  const parts=String(request?.percorso??'').split('?')[0]!.split('/');
  const stopping=(parts.length===6&&(parts[5]==='stop'||parts[5]==='close'))
    ||(parts.length===8&&parts[5]==='processes'&&parts[6]!==''&&parts[7]==='stop')
    ||(parts.length===7&&parts[5]==='delegation'&&parts[6]==='pause');
  return parts.length>=6&&parts[1]==='api'&&parts[2]==='v1'&&parts[3]==='sessions'&&parts[4]!==''&&!stopping;
}

const SESSION_ROUTE=/^\/api\/v1\/sessions\/([^/?#]+)(?:[/?#]|$)/u;
const withTimeout=<T,>(promise:Promise<T>,ms:number,fallback:T)=>new Promise<T>(resolve=>{const timer=setTimeout(()=>resolve(fallback),ms);promise.then(v=>{clearTimeout(timer);resolve(v);},()=>{clearTimeout(timer);resolve(fallback);});});
const gone=(message:string)=>Object.assign(new Error(message),{code:'OPERATION_FAILED',stato:503});
const consentRequired=(params:unknown)=>Object.assign(new Error('The computer must allow this device to write in this folder.'),
  {code:'CONSENT_REQUIRED',stato:403,reason:'consent-required',params:params&&typeof params==='object'?params:{}});
const folderOfAnswer=(w:any)=>typeof w?.cartella==='string'&&w.cartella?w.cartella:null;

type Peer={registration:WindowRegistration;client:WindowClient|null;connecting:Promise<void>|null;rows:any[];attached:string[]};
type ActiveStream={sessionId:string;rehome():void};

export function createFederation(input:{local:FederationLocal;dataRoot:string;/** this window's own channel id (known once its channel is open): never a peer */selfId:string|(()=>string);connect?:typeof connectWindow;alive?:(pid:number)=>boolean;
  leaseHolder?:(sessionId:string)=>LeaseHolder;setInterval?:typeof setInterval;clearInterval?:typeof clearInterval;pollMs?:number;now?:()=>number}){
  const {local}=input;
  const connect=input.connect??connectWindow;const alive=input.alive??processAlive;const now=input.now??Date.now;
  const leaseHolder=input.leaseHolder??((id:string)=>readLeaseHolder(local.sessionsRoot,id,{alive}));
  const peers=new Map<string,Peer>();
  const streams=new Set<ActiveStream>();
  let closedCache:any[]=[];let stopped=false;let refreshing:Promise<void>|null=null;

  const connectPeer=(peer:Peer)=>{
    if(peer.client&&!peer.client.closed)return Promise.resolve();
    peer.connecting??=connect(peer.registration).then(client=>{
      if(stopped){client.close();return;}
      peer.client=client;client.onClose(()=>{if(peer.client===client)peer.client=null;});
    },()=>{removeStaleRegistration(input.dataRoot,peer.registration,alive);}).finally(()=>{peer.connecting=null;});
    return peer.connecting;
  };
  const askPeer=async(peer:Peer)=>{
    const client=peer.client;if(!client||client.closed)return;
    const [list,attached]=await Promise.all([
      withTimeout(client.request<{stato:number;dati:any}>('call',{metodo:'GET',percorso:'/api/v1/sessions'},PEER_ANSWER_MS).then(r=>Array.isArray(r?.dati?.items)?r.dati.items:null),PEER_ANSWER_MS,null),
      withTimeout(client.request<string[]>('attached',undefined,PEER_ANSWER_MS).then(a=>Array.isArray(a)?a.filter(x=>typeof x==='string'):null),PEER_ANSWER_MS,null),
    ]);
    if(list)peer.rows=list;if(attached)peer.attached=attached;
  };
  /** the windows as their files say, connected, and asked for their rows and their screen; one at a time (review: no overlap) */
  const refresh=()=>{
    refreshing??=(async()=>{
      const seen=new Set<string>();
      const self=typeof input.selfId==='function'?input.selfId():input.selfId;
      for(const registration of readRegistrations(input.dataRoot,self||undefined)){
        seen.add(registration.id);
        if(!peers.has(registration.id))peers.set(registration.id,{registration,client:null,connecting:null,rows:[],attached:[]});
      }
      for(const [id,peer] of peers)if(!seen.has(id)){peer.client?.close();peers.delete(id);}
      await Promise.all([...peers.values()].map(peer=>withTimeout(connectPeer(peer).then(()=>askPeer(peer)),PEER_ANSWER_MS+500,undefined)));
      for(const stream of streams)stream.rehome();
    })().finally(()=>{refreshing=null;});
    return refreshing;
  };
  const refreshClosed=async()=>{
    const rows=(await withTimeout(local.listAll(),LIST_CLOSED_MS,null as any[]|null));
    if(!rows)return;
    const all=rows.map(closedRow).filter(Boolean);
    all.sort((a:any,b:any)=>String(b.ultimaRispostaAlle??'').localeCompare(String(a.ultimaRispostaAlle??'')));
    closedCache=all.slice(0,CLOSED_ROWS_MAX);
  };
  const every=input.setInterval??setInterval;const stop=input.clearInterval??clearInterval;
  const timer=every(()=>{void refresh();},input.pollMs??PEER_POLL_MS);(timer as any)?.unref?.();
  void refresh();void refreshClosed();

  /** the peer that owns a conversation now, or null for this host (synchronous: the lease file and the last copy of each screen) */
  const ownerOf=(sessionId:string):Peer|null=>{
    const holder=leaseHolder(sessionId);
    if(holder){
      if(holder.pid===process.pid)return null;
      for(const peer of peers.values())if(peer.registration.pid===holder.pid&&sameStart(peer.registration.startedAt,holder.startedAt)&&peer.client&&!peer.client.closed)return peer;
    }
    for(const peer of peers.values())if(peer.attached.includes(sessionId)&&peer.client&&!peer.client.closed)return peer;
    return null;
  };
  const forward=async(peer:Peer,request:Request)=>{
    try{return await peer.client!.request<{stato:number;dati:any}>('call',request,FORWARD_MS);}
    catch(error:any){
      if(['WINDOW_GONE','WINDOW_TIMEOUT','WINDOW_UNREACHABLE'].includes(error?.code))throw gone('The window that had this conversation closed or did not answer; the outcome is not known. Reload the conversation.');
      throw error;
    }
  };
  /* review R1: a device's write forwarded to another window — the folder from that window, the consent from this host, CLOSED on failure */
  const checkForwardedWrite=async(peer:Peer,sessionId:string,request:Request)=>{
    const folders=local.consent?.()??null;
    if(!folders||!isConversationWrite(request))return;
    const device=(request.origineRemota as any)?.dispositivoId;
    let answer:any=null;
    try{answer=await peer.client!.request('folderOf',sessionId,PEER_ANSWER_MS);}catch{answer=null;}
    if(answer?.code==='NOT_FOUND')return; /* not a conversation of that window: its route answers 404, nothing is written */
    const folder=folderOfAnswer(answer);
    if(folder&&typeof device==='string'&&device&&await folders.consentita(device,folder))return;
    throw consentRequired(folder&&folders.descrivi?await folders.descrivi(folder).catch(()=>null):null);
  };
  const mergedList=async(request:Request)=>{
    const own=await local.call(request);
    await withTimeout(refresh(),PEER_ANSWER_MS+1_000,undefined);
    /* review R3: read again at every list (the index answers fast; the list is asked when the device opens or refreshes it) */
    await refreshClosed();
    const byId=new Map<string,any>();
    for(const row of closedCache)byId.set(row.sessionId,row);
    for(const peer of peers.values())for(const row of peer.rows)if(typeof row?.sessionId==='string')byId.set(row.sessionId,row);
    for(const row of Array.isArray(own?.dati?.items)?own.dati.items:[])if(typeof row?.sessionId==='string'&&!ownerOf(row.sessionId))byId.set(row.sessionId,row);
    /* the owner's row wins: the window that has it on screen or holds its lease knows its live state */
    for(const peer of peers.values())for(const row of peer.rows)if(typeof row?.sessionId==='string'&&ownerOf(row.sessionId)===peer)byId.set(row.sessionId,row);
    return{...own,dati:{...(own?.dati??{}),items:[...byId.values()]}};
  };
  const rehome=(sessionId:string)=>{for(const stream of streams)if(stream.sessionId===sessionId)stream.rehome();};

  const chiama:Call=async(request)=>{
    const path=String(request?.percorso??'');
    if(request?.metodo==='GET'&&path==='/api/v1/sessions')return mergedList(request);
    const match=SESSION_ROUTE.exec(path);
    /* review R12: `POST /api/v1/sessions/custom` starts a new session here; «custom» is not a conversation to load */
    if(match&&!(match[1]==='custom'&&path.split('?')[0]==='/api/v1/sessions/custom')){
      const sessionId=decodeURIComponent(match[1]!);
      const peer=ownerOf(sessionId);
      if(peer){
        await checkForwardedWrite(peer,sessionId,request);
        try{return await forward(peer,request);}finally{rehome(sessionId);}
      }
      if(!local.registry?.esiste?.(sessionId)&&SESSION_ID.test(sessionId))await local.ensureLoaded(sessionId);
      try{return await local.call(request);}finally{rehome(sessionId);}
    }
    return local.call(request);
  };

  const subscribeWithReplay:Subscribe=({sessionId,daSequenza=0,manda})=>{
    let cancelled=false;let off:(()=>void)|null=null;let last=daSequenza;let ownerKey:string|null=null;let replayEnded=false;let switching=false;
    /* review R2/R9: across owners the phone sees each sequence once, and one end-of-replay marker */
    const send=(event:any)=>{
      if(Number.isInteger(event?._sequenza)){if(event._sequenza<=last&&ownerKey!==null&&replayEnded)return;last=Math.max(last,event._sequenza);}
      if(event?.type==='CUSTOM'&&event?.name==='talos.fine-rigiocata'){if(replayEnded)return;replayEnded=true;}
      manda(event);
    };
    const keyOf=(peer:Peer|null)=>peer?peer.registration.id:'local';
    const start=async()=>{
      if(cancelled)return;
      const peer=ownerOf(sessionId);
      ownerKey=keyOf(peer);
      if(peer?.client){
        const mine=ownerKey;
        off=peer.client.subscribe(sessionId,last,send,()=>{if(ownerKey!==mine)return;off=null;if(!cancelled)void start();});
        return;
      }
      if(!local.registry?.esiste?.(sessionId))await local.ensureLoaded(sessionId);
      if(cancelled)return;
      off=local.subscribeWithReplay({sessionRegistry:local.registry,sessionId,daSequenza:last,manda:send})??null;
    };
    const stream:ActiveStream={sessionId,rehome(){
      if(cancelled||switching||ownerKey===null)return;
      if(keyOf(ownerOf(sessionId))===ownerKey)return;
      switching=true;const was=off;off=null;ownerKey=null;try{was?.();}catch{/* gone */}
      void start().finally(()=>{switching=false;});
    }};
    streams.add(stream);
    void start();
    return()=>{cancelled=true;streams.delete(stream);off?.();off=null;};
  };

  /* the registry the kernel's module reads; everything not federated is this window's own */
  const sessionRegistry=new Proxy(local.registry??{},{
    get(target,key){
      /* review R3: the journal itself says whether a conversation exists, not a list read once */
      if(key==='esiste')return(sessionId:string)=>Boolean(target.esiste?.(sessionId))
        ||[...peers.values()].some(p=>p.attached.includes(sessionId)||p.rows.some((r:any)=>r?.sessionId===sessionId))
        ||closedCache.some((r:any)=>r.sessionId===sessionId)
        ||(SESSION_ID.test(String(sessionId))&&existsSync(join(local.sessionsRoot,`${sessionId}.jsonl`)));
      /* review R11: for the wake-up the owner's row wins, as in the device's list */
      if(key==='elenca')return()=>{
        const out=new Map<string,any>();
        for(const row of (target.elenca?.()??[]) as any[])if(typeof row?.sessionId==='string'&&!ownerOf(row.sessionId))out.set(row.sessionId,row);
        for(const peer of peers.values())for(const row of peer.rows){
          if(typeof row?.sessionId!=='string')continue;
          if(ownerOf(row.sessionId)===peer||!out.has(row.sessionId))out.set(row.sessionId,row);
        }
        return[...out.values()];
      };
      /* review R1: the folder of every conversation — the owning window's, or the archive's once loaded here */
      if(key==='cartellaPerChatFile')return async(sessionId:string)=>{
        const peer=ownerOf(sessionId);
        if(peer?.client){try{return await peer.client.request('folderOf',sessionId,PEER_ANSWER_MS);}catch{return null;}}
        if(!target.esiste?.(sessionId)&&SESSION_ID.test(String(sessionId)))await local.ensureLoaded(sessionId);
        return target.cartellaPerChatFile?.(sessionId);
      };
      /* synchronous replay (the device files): another window's history cannot come back synchronously — nothing, and no stream opened */
      if(key==='iscriviti')return(sessionId:string,sink:(e:unknown)=>void,from=0,options?:unknown)=>{
        if(ownerOf(sessionId))return()=>{};
        return target.iscriviti?.(sessionId,sink,from,options);
      };
      const value=Reflect.get(target,key);
      return typeof value==='function'?value.bind(target):value;
    },
  });

  return{
    chiama,sessionRegistry,iscriviConRigiocata:subscribeWithReplay,
    /** for tests and the footer: the windows known now */
    peers:()=>[...peers.values()].map(p=>({id:p.registration.id,label:p.registration.label,connected:Boolean(p.client&&!p.client.closed),attached:[...p.attached]})),
    refresh,
    close(){stopped=true;stop(timer as any);for(const peer of peers.values())peer.client?.close();peers.clear();streams.clear();},
  };
}
export type Federation=ReturnType<typeof createFederation>;
