/*
 * 0.6.15 T4: ONE remote coordinator per profile. Before T4, `talos remote` built its own coordinator on the same files while a
 * window hosted: two iroh endpoints with one key (the relay keeps the newest and silently sets the other aside), and a revoke
 * written to disk that the host never read (the kernel keeps the phone list in memory, dispositivi.mjs). Now the window that hosts
 * serves its coordinator over its local channel (window-channel.ts `coordinator`), and `talos remote` uses it by proxy
 * (coordinator-proxy.ts) — what Codex `remote-control pair`, OpenCode `pair`, VS Code's `code` and Electron's single instance do: a
 * one-shot command talks to the owner already running and only builds its own when there is none (RICERCA-T4-COORDINATORE-UNICO.md).
 * - A closed list of methods, each with its arguments checked: nothing else of the coordinator crosses the channel.
 * - A fencing token: the proxy names the lease token it read, and the window serves only while it still owns THAT lease.
 * - Owner 26/10/2026 «Uno alla volta»: one pairing at a time per host. A second one (another terminal, `/remote` in the window)
 *   gets PAIR_BUSY instead of a second screen with the same code that could answer the opposite way.
 * - A pairing opened through a connection is closed when that connection drops (a terminal closed in the middle): its QR does not
 *   stay valid for five minutes in the host.
 */
import type {RemoteCoordinator} from './pairing-flow.ts';
import type {WindowConnection} from './window-channel.ts';

/* T6 (owner «come nel desktop»): the model's remote_* tools run in the window of their conversation and reach the host's devices'
   folders and file offers (session-registry.mjs `ospiteTelefoni`), so those nested methods are listed too, each by its full name */
export const NESTED_METHODS=['cartelle.consensiDi','cartelle.verifica','cartelle.consentiInAnticipo','cartelle.consensoDi','cartelle.revoca',
  /* blocked folders step B (Desktop block 11): the unblock tool of a conversation in a window that does not host calls it too */
  'cartelle.sblocca','file.esaminaOfferta','file.registraOfferta'] as const;
export const COORDINATOR_METHODS=['stato','imposta','apriAccoppiamento','chiudiAccoppiamento','conferma','rifiuta','revoca','rinomina',...NESTED_METHODS] as const;
export type CoordinatorMethod=typeof COORDINATOR_METHODS[number];
/** the devices' folders and file offers (cartelle-dispositivi.mjs, file-dispositivi.mjs), as the model's tools call them */
export type DeviceFolders={
  consensiDi(id:string):Promise<unknown>;verifica(percorso:string,id?:string|null):Promise<any>;
  consentiInAnticipo(id:string,percorso:string,options?:{da?:string;attesa?:string|null}):Promise<unknown>;
  consensoDi(id:string,cartellaOPercorso:string):Promise<any>;revoca(id:string,cartellaId:string):Promise<unknown>;
  /** blocked folders step B: takes away only the block (the folder is not allowed by it); a kernel before block 11 has none */
  sblocca?(id:string,cartellaId:string):Promise<unknown>;
};
export type DeviceFiles={
  esaminaOfferta(input:{sessionId:string;percorso:string}):Promise<any>;
  registraOfferta(input:{sessionId:string;dispositivoId:string;percorso:string;versioneAttesa?:string|null}):Promise<any>;
};
/** the coordinator methods the proxy and the guard use: the pairing flow's, plus the list's revoke and rename, and T6's folders and files */
export type FullCoordinator=RemoteCoordinator&{revoca(id:string):Promise<unknown>;rinomina?(id:string,nome:string):Promise<unknown>;cartelle?:DeviceFolders|null;file?:DeviceFiles|null};

const fail=(code:string,message:string)=>Object.assign(new Error(message),{code});
const MAX_ID=200,MAX_URL=2048,MAX_NAME=64,MAX_PATH=4096,MAX_VERSION=200;
const isText=(value:unknown,max:number):value is string=>typeof value==='string'&&value.length>0&&value.length<=max;
const isPlain=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const onlyKeys=(value:Record<string,unknown>,keys:readonly string[])=>Object.keys(value).every(key=>keys.includes(key));

/** The arguments of one method, checked; anything else is refused before it reaches the kernel. */
export function checkedArgs(method:string,args:readonly unknown[]):unknown[]{
  const bad=()=>fail('REMOTE_BAD_ARGUMENTS','The remote operation was called with arguments it does not take.');
  switch(method){
    case 'stato':if(args.length)throw bad();return[];
    case 'apriAccoppiamento':{
      if(args.length>1)throw bad();
      const options=args[0]??{};
      if(!options||typeof options!=='object'||Array.isArray(options))throw bad();
      const keys=Object.keys(options);
      if(keys.some(key=>key!=='soloSeAcceso')||((options as any).soloSeAcceso!==undefined&&typeof (options as any).soloSeAcceso!=='boolean'))throw bad();
      return[options];
    }
    case 'imposta':{
      if(args.length!==1||!args[0]||typeof args[0]!=='object'||Array.isArray(args[0]))throw bad();
      const input=args[0] as Record<string,unknown>;const out:Record<string,unknown>={};
      for(const key of Object.keys(input))if(key!=='acceso'&&key!=='relay')throw bad();
      if(input.acceso!==undefined){if(typeof input.acceso!=='boolean')throw bad();out.acceso=input.acceso;}
      if(input.relay!==undefined){
        const relay=input.relay as any;
        if(relay?.modo==='n0'&&Object.keys(relay).length===1)out.relay={modo:'n0'};
        else if(relay?.modo==='proprio'&&isText(relay.url,MAX_URL)&&Object.keys(relay).length===2)out.relay={modo:'proprio',url:relay.url};
        else throw bad();
      }
      return[out];
    }
    case 'chiudiAccoppiamento':case 'conferma':case 'rifiuta':case 'revoca':
      if(args.length!==1||!isText(args[0],MAX_ID))throw bad();return[args[0]];
    case 'rinomina':
      if(args.length!==2||!isText(args[0],MAX_ID)||!isText(args[1],MAX_NAME))throw bad();return[args[0],args[1]];
    /* T6: the model's tools, the shapes session-registry.mjs `ospiteTelefoni` passes */
    case 'cartelle.consensiDi':
      if(args.length!==1||!isText(args[0],MAX_ID))throw bad();return[args[0]];
    case 'cartelle.verifica':
      if(args.length<1||args.length>2||!isText(args[0],MAX_PATH)||(args.length===2&&args[1]!==null&&!isText(args[1],MAX_ID)))throw bad();return[...args];
    case 'cartelle.consentiInAnticipo':{
      if(args.length<2||args.length>3||!isText(args[0],MAX_ID)||!isText(args[1],MAX_PATH))throw bad();
      if(args.length===2)return[args[0],args[1]];
      const options=args[2];
      if(!isPlain(options)||!onlyKeys(options,['da','attesa'])||(options.da!==undefined&&options.da!=='chat'&&options.da!=='anticipo')
        ||(options.attesa!==undefined&&options.attesa!==null&&!isText(options.attesa,MAX_ID)))throw bad();
      return[args[0],args[1],options];
    }
    case 'cartelle.consensoDi':
      if(args.length!==2||!isText(args[0],MAX_ID)||!isText(args[1],MAX_PATH))throw bad();return[args[0],args[1]];
    case 'cartelle.revoca':case 'cartelle.sblocca':
      if(args.length!==2||!isText(args[0],MAX_ID)||!isText(args[1],MAX_ID))throw bad();return[args[0],args[1]];
    case 'file.esaminaOfferta':{
      const input=args[0];
      if(args.length!==1||!isPlain(input)||!onlyKeys(input,['sessionId','percorso'])||!isText(input.sessionId,MAX_ID)||!isText(input.percorso,MAX_PATH))throw bad();
      return[{sessionId:input.sessionId,percorso:input.percorso}];
    }
    case 'file.registraOfferta':{
      const input=args[0];
      if(args.length!==1||!isPlain(input)||!onlyKeys(input,['sessionId','dispositivoId','percorso','versioneAttesa'])||!isText(input.sessionId,MAX_ID)
        ||!isText(input.dispositivoId,MAX_ID)||!isText(input.percorso,MAX_PATH)||(input.versioneAttesa!==undefined&&input.versioneAttesa!==null&&!isText(input.versioneAttesa,MAX_VERSION)))throw bad();
      return[{sessionId:input.sessionId,dispositivoId:input.dispositivoId,percorso:input.percorso,versioneAttesa:input.versioneAttesa??null}];
    }
    default:throw fail('REMOTE_METHOD_REFUSED','That remote operation is not available from another window.');
  }
}

export type PairingOwner={id:string};
/**
 * One pairing at a time on a host. A pairing belongs to whoever opened the QR, until they close it, confirm a phone, or their QR
 * expires with no phone waiting for its code.
 */
export function createPairingGuard(input:{now?:()=>number}={}){
  const now=input.now??Date.now;
  let current:{owner:string;gettone:string;until:number}|null=null;
  return{
    /** Throws PAIR_BUSY when another owner's pairing is still going; `phoneWaiting` keeps it going past its QR's minutes. */
    async claim(owner:string,phoneWaiting:()=>Promise<boolean>){
      if(!current||current.owner===owner)return;
      if(now()<current.until||await phoneWaiting().catch(()=>false))throw fail('PAIR_BUSY','Already pairing in another window.');
      current=null;
    },
    opened(owner:string,gettone:string,until:number){current={owner,gettone,until};},
    /** the owner's pairing ended (closed, confirmed); with a token, only that QR */
    release(owner:string,gettone?:string){if(current?.owner===owner&&(gettone===undefined||current.gettone===gettone))current=null;},
    /** owner 27/10/2026: a pairing is going, its QR not expired (a normal host never hands the bridge over in its middle) */
    busy():boolean{return current!==null&&now()<current.until;},
    /** the QR this owner holds now, if any (to close it when its connection drops) */
    heldBy(owner:string):string|null{return current?.owner===owner?current.gettone:null;},
  };
}
export type PairingGuard=ReturnType<typeof createPairingGuard>;

/** The coordinator as one owner sees it: the same methods, with the one-pairing-at-a-time rule on the pairing ones. */
export function guardedCoordinator(remote:FullCoordinator,guard:PairingGuard,owner:string):FullCoordinator{
  const phoneWaiting=async()=>((await remote.stato())?.attese??[]).length>0;
  return{
    stato:()=>remote.stato(),
    imposta:(input)=>remote.imposta(input),
    async apriAccoppiamento(options){
      await guard.claim(owner,phoneWaiting);
      const offer=await remote.apriAccoppiamento(options);
      guard.opened(owner,offer.gettone,Number(offer.scadeAlle)||0);
      return offer;
    },
    chiudiAccoppiamento(gettone){guard.release(owner,gettone);remote.chiudiAccoppiamento(gettone);},
    async conferma(id){const out=await remote.conferma(id);guard.release(owner);return out;},
    rifiuta:(id)=>remote.rifiuta(id),
    revoca:(id)=>remote.revoca(id),
    ...(remote.rinomina?{rinomina:(id:string,nome:string)=>remote.rinomina!(id,nome)}:{}),
  };
}

/**
 * The window's service for the channel's `coordinator` operation. `coordinator()` is the hosting window's coordinator (null when it
 * does not host); `owns(token)` says whether the lease that token names is still this window's.
 */
export function createCoordinatorService(input:{coordinator:()=>FullCoordinator|null;owns:(token:string)=>boolean;guard:PairingGuard;
  /** review 6 C-R1: resolves when this window's host has finished starting (or failed), bounded by the caller */
  whenReady?:()=>Promise<boolean|void>}){
  const tied=new Set<string>();
  /* review 6 C-R2: the connections that closed — a QR still being opened for one of them is closed the moment it exists */
  const dead=new WeakSet<WindowConnection>();
  return async function serve(request:{method:string;args:unknown[];token:string},connection:WindowConnection):Promise<unknown>{
    if(!(COORDINATOR_METHODS as readonly string[]).includes(request.method))throw fail('REMOTE_METHOD_REFUSED','That remote operation is not available from another window.');
    const args=checkedArgs(request.method,request.args);
    let remote=input.coordinator();
    /* review 6 C-R1: a window just opened holds the lease while its host is still starting (the kernel and the binding load): the
       call waits for it instead of answering «no longer hosts», which `talos remote` cannot tell from a real hand-over */
    if(!remote&&request.token&&input.owns(request.token)&&input.whenReady){
      const ready=await input.whenReady();remote=input.coordinator();
      /* review 7 E-R2: still loading when the wait ran out — it does still host, so say it is starting (temporary, like HTTP 503 or
         gRPC UNAVAILABLE) rather than «no longer hosts» (gone, like 410) */
      if(!remote&&ready===false&&input.owns(request.token))throw fail('REMOTE_HOST_STARTING','This window is still starting remote control.');
    }
    if(!remote||!request.token||!input.owns(request.token))throw fail('REMOTE_NOT_HOST','This window no longer hosts remote control.');
    const owner=`channel:${connection.id}`;
    if(!tied.has(owner)){
      tied.add(owner);
      /* a terminal closed in the middle of pairing: its QR closes in the host, the next pairing is free */
      connection.onClose(()=>{
        tied.delete(owner);dead.add(connection);
        const gettone=input.guard.heldBy(owner);
        if(gettone){input.guard.release(owner,gettone);try{input.coordinator()?.chiudiAccoppiamento(gettone);}catch{/* the host is stopping */}}
      });
    }
    let result:unknown;
    if(request.method.includes('.')){
      /* T6: the devices' folders and files, called on their own object (they keep `this`); a host without them says so */
      const [area,name]=request.method.split('.') as ['cartelle'|'file',string];
      const holder=(remote as any)[area];
      if(!holder||typeof holder[name]!=='function')throw fail('REMOTE_METHOD_UNAVAILABLE','This computer\'s remote control does not offer that operation.');
      result=await holder[name](...args);
    }else{
      const guarded=guardedCoordinator(remote,input.guard,owner) as any;
      result=await guarded[request.method](...args);
      /* review 6 C-R2: the terminal closed while the kernel was making this QR — nobody will show it: closed now, the guard freed */
      const gettone=(result as {gettone?:unknown}|null)?.gettone;
      if(request.method==='apriAccoppiamento'&&dead.has(connection)&&typeof gettone==='string'){
        input.guard.release(owner,gettone);
        try{remote.chiudiAccoppiamento(gettone);}catch{/* the host is stopping */}
        throw fail('WINDOW_GONE','The terminal closed before the QR was shown.');
      }
    }
    /* what crosses the channel is data: a result that does not survive JSON is not sent half */
    return result===undefined?null:JSON.parse(JSON.stringify(result));
  };
}
