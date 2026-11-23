/*
 * 0.6.15 remote control inside the TUI (owner 26/10/2026: «Finché TALOS è aperto», and for several windows «la proposta completa»).
 * A `talos` window hosts the remote only when it was turned on (`talos remote` saved acceso + a relay) and only ONE window does:
 * the first that takes the lease `<data>/remote/host.json` (the automations' host lease: exclusive create, a beat, a dead or frozen
 * holder taken over — automations/host-lease.ts). The other windows say «via the window “<project>”» and keep trying: when the
 * host window closes it releases the lease and the next window takes it within one beat (HANDOVER_MS), with the same identity and
 * relay, so the phone sees only a short reconnection. (Claude Code keeps one remote session per process and ends it with the
 * terminal; Happy keeps a daemon — the research of 26/10, PREPARAZIONE-REMOTO-CLI-0615.md.)
 * Nothing is loaded when remote control is off: one small settings read. The snapshot is what the screen shows: the phones online
 * (footer «⌁ <phone>»), the window that hosts, the consent requests waiting (the card «Allow <device> to work in <folder>?»).
 * T3b (26/10/2026): while remote control is on, EVERY window — the host too — keeps its local channel open (window-channel.ts), so
 * the host can hand a device's operation to the window that owns the conversation, and a window that becomes host later reaches the
 * others the same way. Off, or the window closing: the channel closes and its registration goes.
 * Administrator windows (owner 27/10/2026, «Ammetterla con avviso», «Quella da amministratore»): Windows does not let a normal process
 * open an administrator process's channel (elevation.ts), so an administrator window is the bridge whenever it is open — a normal
 * window does not take a free lease while one is open, and a normal host hands it over at its beat (never in the middle of a
 * pairing). An administrator window says, fixed in its footer, that devices act there with administrator rights; a normal window
 * asked for remote control while an administrator window has it says REMOTE_HOST_ELEVATED instead of failing to connect.
 */
import {readFileSync} from 'node:fs';
import {createConnection} from 'node:net';
import {createHostLease,HOST_BEAT_MS,processAlive,type HostLeaseHandle} from '../automations/host-lease.ts';
import {createCoordinatorService,createPairingGuard,guardedCoordinator,type DeviceFiles,type DeviceFolders,type FullCoordinator} from './coordinator-service.ts';
import {connectHostWindow,proxyCoordinator} from './coordinator-proxy.ts';
import {remotePaths,type RemoteHost} from './host.ts';
import {processElevated} from './elevation.ts';
import {isOwnChannel,readRegistrations,type WindowClient,type WindowConnection,type WindowRegistration} from './window-channel.ts';

export const REMOTE_HOST_LEASE='host.json';
/* T4: the lease's label when `talos remote` holds it (the windows show their own line for it, remote.footer.command) */
export const COMMAND_LEASE_LABEL='talos remote';
/* how often a window that does not host looks whether the lease became free (the host's beat is HOST_BEAT_MS) */
export const HANDOVER_MS=2_000;
/* review 6 C-R1: how long a call from `talos remote` waits for this window's host to finish starting — under the proxy's own limit
   for a read (coordinator-proxy.ts READ_MS, 10 s), so the answer is «not host» rather than a time out */
export const HOST_READY_WAIT_MS=8_000;

export type TuiRemoteConsent={richiestaId:string;device:string;folder:string;expiresAt:number};
export type TuiRemoteSnapshot={
  state:'off'|'starting'|'host'|'elsewhere'|'error';
  /** the phones connected now (host only) */
  phones:readonly {id:string;name:string}[];
  /** the window that hosts, when it is another one */
  elsewhere:string|null;
  /** T4: who holds the host lease when it is not this window — another window, or `talos remote` in a terminal */
  elsewhereKind?:'window'|'command'|null;
  /** owner 27/10/2026: this window runs as administrator (known once remote control is on) */
  elevated?:boolean;
  /** the window that has remote control (or is taking it) runs as administrator */
  elsewhereElevated?:boolean;
  consents:readonly TuiRemoteConsent[];
  /** T5: the devices a notification was sent to for a conversation on this screen that waits for the person (names, one each) */
  notified?:readonly string[];
  error:string|null;
};
/**
 * T5 («waiting for you · notification sent to “<device>”», contract with the Desktop for review 7 B-R2, 27/10/2026): the kernel keeps
 * one record per (device, session) in `stato().sveglie` = [{telefono, sessione, alle, nome}], cleared when that session stops
 * waiting (its 5 s round) or the device is revoked. The names of the devices sent a notification for these sessions, one per
 * device. «Sent», never «received»: a push service only accepts it (RFC 8030 §5).
 * `since` (block 8, Desktop's hunt point 1): when this screen's wait began, wall clock. A record from an EARLIER wait of the same
 * conversation lives until the kernel's next 5 s round; a new wait started meanwhile must not say «sent» for it. One second of
 * slack for the two clocks of one machine; a record without a readable time does not count then.
 */
export const NOTIFIED_SLACK_MS=1_000;
/* Block 9 H-R3 / block 10 E-R2: the one filter for a device's name (device-name.ts) */
export {cleanDeviceName} from './device-name.ts';
import {cleanDeviceName} from './device-name.ts';
export function notifiedOfState(stato:any,sessions:readonly string[],since=0):string[]{
  const wanted=new Set(sessions);const names=new Map<string,string>();
  for(const row of Array.isArray(stato?.sveglie)?stato.sveglie:[]){
    if(!wanted.has(row?.sessione)||typeof row?.telefono!=='string'||names.has(row.telefono))continue;
    /* block 8 E-R1: the kernel writes `alle` as a NUMBER (ms, its clock()); a text date is read too, anything else is unknown */
    const at=typeof row?.alle==='number'?row.alle:typeof row?.alle==='string'?Date.parse(row.alle):Number.NaN;
    if(since>0&&!(at>=since-NOTIFIED_SLACK_MS))continue;
    names.set(row.telefono,cleanDeviceName(row.nome));
  }
  return [...names.values()];
}
/** The consent requests waiting in the kernel's state (`stato().consensi`), as the card shows them. */
export function consentsOfState(stato:any):TuiRemoteConsent[]{
  return (stato?.consensi??[]).map((c:any)=>({richiestaId:c.richiestaId,device:cleanDeviceName(c.nomeDispositivo),folder:String(c.percorso),expiresAt:Date.parse(c.scadeAlle)}));
}
const OFF:TuiRemoteSnapshot=Object.freeze({state:'off',phones:[],elsewhere:null,elsewhereKind:null,consents:[],notified:[],error:null});

/** Whether remote control was turned on, from the kernel's settings file — without loading the kernel. */
export function remoteTurnedOn(dataRoot:string,read:(file:string)=>string=file=>readFileSync(file,'utf8')):boolean{
  try{const settings=JSON.parse(read(remotePaths(dataRoot).settings));return settings?.acceso===true&&Boolean(settings?.relay);}catch{return false;}
}

export type TuiRemoteInput={
  dataRoot:string;
  /** this window's name for the others: its project folder's name */
  label:string;
  createHost:()=>Promise<RemoteHost>;
  lease?:HostLeaseHandle;
  turnedOn?:()=>boolean;
  /** tests: how long a call waits for this window's host to finish starting (HOST_READY_WAIT_MS) */
  hostReadyWaitMs?:number;
  setInterval?:(fn:()=>void,ms:number)=>{unref?():void};
  clearInterval?:(timer:any)=>void;
  /** T3b: opens this window's local channel (only while remote control is on) */
  openChannel?:(meta:{elevated:boolean})=>Promise<{close():Promise<void>}>;
  /** T6: reaches the window that holds the host lease (tests pass a fake) */
  connectHost?:typeof connectHostWindow;
  /** owner 27/10/2026: whether this process runs as administrator (elevation.ts; tests pass their own) */
  elevated?:()=>Promise<boolean>;
  /** the other windows' registrations and whether a process lives (tests pass their own) */
  registrations?:()=>WindowRegistration[];
  alive?:(pid:number)=>boolean;
  /** block 8 E-R2: what an administrator window's channel answers this window (tests pass their own; default: a real connect) */
  probeChannel?:(channel:string)=>Promise<ChannelProbe>;
  /** block 8 E-R2: how long a free bridge waits for an administrator window before a normal one takes it (ADMIN_GRACE_MS) */
  adminGraceMs?:number;
  now?:()=>number;
  /** block 9 H-R1: whether a registration's channel is one this profile's windows make (tests pass their own) */
  ownChannel?:(channel:string)=>boolean;
};
/*
 * Block 8 E-R2 (the CLI's own hunt points on 431b02e0a, confirmed by the reviewer): an administrator window counts as the bridge only
 * when it proves it is one. Its registration is a file anyone of the same user can write, and its pid can be reused after it fell:
 * - its channel must exist and refuse this normal window (a named pipe made by an elevated process: Everyone may only read, so the
 *   connect is denied — CreateNamedPipe, Microsoft Learn). Missing ⇒ a stale registration (a fallen window, a reused pid); opened ⇒
 *   no administrator's pipe, the claim is false. Hermes checks a reused pid by the process's `create_time`; the channel is this
 *   check's equivalent here, and cheaper (one refused connect, once per ADMIN_RECHECK_MS);
 * - it must take the free bridge within ADMIN_GRACE_MS: an administrator window that cannot start its host (an error at every beat)
 *   is then passed over, and the normal windows host again instead of nobody.
 */
export type ChannelProbe='denied'|'missing'|'open';
export const ADMIN_GRACE_MS=20_000;
export const ADMIN_RECHECK_MS=10_000;
export function probeChannelByConnect(channel:string,timeoutMs=1_500,connect:(channel:string)=>import('node:net').Socket=createConnection):Promise<ChannelProbe>{
  return new Promise(resolve=>{
    let settled=false;const done=(answer:ChannelProbe)=>{if(settled)return;settled=true;socket.destroy();resolve(answer);};
    const socket=connect(channel);
    socket.once('connect',()=>done('open'));
    /* block 9 H-R1: only a refusal proves an administrator's pipe (measured live 27/10: EPERM); any other error or no answer in time
       proves nothing, so it counts as not there */
    socket.once('error',(error:any)=>done(error?.code==='EPERM'||error?.code==='EACCES'?'denied':'missing'));
    socket.setTimeout(timeoutMs,()=>done('missing'));
  });
}
const failCode=(code:string,message:string)=>Object.assign(new Error(message),{code});

export function createTuiRemote(input:TuiRemoteInput){
  /* owner 27/10/2026: whether this window runs as administrator, asked once when remote control is first on */
  let elevated=false;let elevationAsked:Promise<void>|null=null;
  const knowElevation=()=>elevationAsked??=(input.elevated??processElevated)().then(answer=>{elevated=answer===true;},()=>{elevated=false;});
  const lease=input.lease??createHostLease({dir:remotePaths(input.dataRoot).dir,role:'serve',fileName:REMOTE_HOST_LEASE,label:input.label,kind:'window',elevated:()=>elevated});
  const alive=input.alive??processAlive;
  const now=input.now??Date.now;
  const probe=input.probeChannel??probeChannelByConnect;
  const grace=input.adminGraceMs??ADMIN_GRACE_MS;
  /* block 8 E-R2: per registration id, what its channel proved and when; the ids passed over for not taking the bridge in time */
  const proven=new Map<string,{real:boolean;at:number}>();
  const passedOver=new Set<string>();
  let freeSince:{id:string;at:number}|null=null;
  let provenAdmin:WindowRegistration|null=null;
  /** an administrator window open now (not this one), proven by its channel, when this window is not one: it is the bridge */
  const adminWindow=():WindowRegistration|null=>elevated?null:provenAdmin;
  async function checkAdmin(){
    if(elevated){provenAdmin=null;return;}
    let candidates:WindowRegistration[]=[];
    /* block 9 H-R1: and only a channel this profile's windows would make (window-channel.ts isOwnChannel) */
    try{candidates=(input.registrations??(()=>readRegistrations(input.dataRoot)))().filter(r=>r.elevated===true&&r.pid!==process.pid&&alive(r.pid)&&!passedOver.has(r.id)&&(input.ownChannel??((c:string)=>isOwnChannel(input.dataRoot,c)))(r.channel));}catch{candidates=[];}
    let found:WindowRegistration|null=null;
    for(const r of candidates){
      let seen=proven.get(r.id);
      if(!seen||(seen.real&&now()-seen.at>=ADMIN_RECHECK_MS)){
        /* block 10 E-R2: a probe that throws proves nothing */
        const answer=await probe(r.channel).catch(():ChannelProbe=>'missing');
        seen={real:answer==='denied',at:now()};proven.set(r.id,seen);
      }
      if(seen.real){found=r;break;}
    }
    /* the bridge left free for it: counted from the first beat that saw it free, reset when anyone holds it */
    if(found&&!lease.holder()){
      if(freeSince?.id!==found.id)freeSince={id:found.id,at:now()};
      else if(now()-freeSince.at>=grace){passedOver.add(found.id);freeSince=null;found=null;}
    }else freeSince=null;
    provenAdmin=found;
  }
  const elevatedHostError=()=>failCode('REMOTE_HOST_ELEVATED','Remote control runs in the TALOS window opened as administrator, and this window is not one, so it cannot reach it.');
  /* T4: one pairing at a time on this host, whoever opens it (`talos remote` by proxy, `/remote` here) */
  const guard=createPairingGuard();
  /* review 6 C-R1: the host being started (the kernel and the binding load: seconds on a first start); the service waits for it */
  let hostStarting:Promise<void>|null=null;
  const serveCoordinator=createCoordinatorService({coordinator:()=>(host?.remote as FullCoordinator|undefined)??null,owns:token=>lease.owns()&&lease.token()===token,guard,
    /* review 7 E-R2: false when the wait ran out with the host still starting, so the answer says that instead of «no longer hosts» */
    whenReady:async()=>{if(!hostStarting)return true;return await Promise.race([hostStarting.then(()=>true),new Promise<boolean>(resolve=>{const timer=setTimeout(()=>resolve(false),input.hostReadyWaitMs??HOST_READY_WAIT_MS);(timer as any).unref?.();})]);}});
  const turnedOn=input.turnedOn??(()=>remoteTurnedOn(input.dataRoot));
  const every=input.setInterval??((fn,ms)=>setInterval(fn,ms));
  const stopEvery=input.clearInterval??((timer)=>clearInterval(timer));
  let snapshot:TuiRemoteSnapshot=OFF;
  const listeners=new Set<()=>void>();
  let host:RemoteHost|null=null;
  let timer:any=null;
  let offState:(()=>void)|null=null;
  let offConsents:(()=>void)|null=null;
  let stopped=false;
  let starting:Promise<void>|null=null;
  /* one beat at a time: starting the host can take longer than a beat, and the next beat must not find its own lease «elsewhere» */
  let busy=false;
  /* T3b: the conversations this window has on screen (the TUI sets the source: its current conversation and its descendants) */
  let attachedSource:()=>string[]=()=>[];
  /* T5: whether this screen waits for the person now (an approval, a question, a plan): only then is «notified» read */
  let waitingSource:()=>boolean|number|null=()=>null;
  /* T3b: this window's channel, open while remote control is on */
  let channel:{close():Promise<void>}|null=null;let channelOpening:Promise<void>|null=null;
  const openChannel=()=>{
    if(channel||channelOpening||!input.openChannel)return;
    channelOpening=input.openChannel({elevated}).then(opened=>{if(stopped){void opened.close();return;}channel=opened;},()=>{/* the next beat tries again */}).finally(()=>{channelOpening=null;});
  };
  const closeChannel=async()=>{const was=channel;channel=null;await channelOpening?.catch(()=>{});const late=channel as {close():Promise<void>}|null;channel=null;await was?.close().catch(()=>{});await late?.close().catch(()=>{});};
  const set=(next:Partial<TuiRemoteSnapshot>)=>{snapshot={...snapshot,...next};for(const listener of listeners){try{listener();}catch{/* a listener's own fault */}}};

  async function refresh(){
    if(!host)return;
    try{
      const stato=await host.remote.stato();
      const online=new Set<string>(stato.inLinea??[]);
      const phones=(stato.telefoni??[]).filter((p:any)=>online.has(p.id)).map((p:any)=>({id:p.id,name:cleanDeviceName(p.nome??p.id)}));
      const consents=consentsOfState(stato);
      set({state:'host',phones,consents,elsewhere:null,elsewhereElevated:false,error:null,elevated});
    }catch(error){set({error:String((error as any)?.code??'REMOTE_ERROR')});}
  }

  function becomeHost():Promise<void>{
    const run=becomeHostNow().finally(()=>{if(hostStarting===run)hostStarting=null;});
    hostStarting=run;
    return run;
  }
  async function becomeHostNow(){
    set({state:'starting',elsewhere:null,elsewhereElevated:false,elevated});
    try{
      host=await input.createHost();
      if(stopped){await host.stop();host=null;return;}
      /* block 9 H-R2: a start that took longer than the lease lives (a slow first load) may find the lease taken meanwhile — then
         another window hosts with the same PC identity, and this one must not turn on a second host beside it */
      if(!lease.beat()){const late=host;host=null;await late.stop().catch(()=>{});const holder=lease.holder();
        set({state:'elsewhere',elsewhere:holder?.label??null,elsewhereKind:holder?.kind==='command'?'command':'window',elsewhereElevated:holder?.elevated===true,elevated});return;}
      await host.remote.riprendi();
      offState=host.remote.ascoltaStato?.(()=>{void refresh();})??null;
      offConsents=host.remote.cartelle?.ascolta?.(()=>{void refresh();})??null;
      await refresh();
    }catch(error){
      set({state:'error',error:String((error as any)?.code??'REMOTE_ERROR')});
      lease.release();
    }
  }

  /* one step of the beat: the host keeps its lease (and gives the remote up if it lost it); the others try to take it */
  async function tick(){
    if(stopped||busy)return;
    busy=true;
    try{await beatOnce();await updateNotified();}finally{busy=false;}
  }
  const attachedNow=()=>{try{return attachedSource().filter(id=>typeof id==='string'&&id.length>0);}catch{return[];}};
  /* null: not waiting; else when the wait began (0: unknown, every record counts) */
  const waitingNow=():number|null=>{try{const w=waitingSource();return typeof w==='number'&&Number.isFinite(w)?w:w===true?0:null;}catch{return null;}};
  /*
   * T5: who was sent a notification for this screen's conversation, read at the beat and only while it waits for the person: from
   * this window's coordinator when it hosts; from the hosting window's by proxy (a read, the same link as the model's tools) when
   * another window hosts. Never a host started for it, and nothing from `talos remote` in a terminal (it has no channel) or from an
   * administrator window this one cannot open. A read that fails keeps the last answer for the next beat.
   */
  async function updateNotified(){
    const since=waitingNow();
    const sessions=since===null?[]:attachedNow();
    let names:string[]=[];
    if(sessions.length){
      try{
        if(host)names=notifiedOfState(await host.remote.stato(),sessions,since??0);
        else{
          const holder=lease.holder();
          if(!holder?.token||holder.kind==='command'||(holder.elevated===true&&!elevated))names=[];
          else names=notifiedOfState(await proxyCoordinator(await linkTo(holder),holder.token).stato(),sessions,since??0);
        }
      }catch{return;}
    }
    const was=snapshot.notified??[];
    if(names.length!==was.length||names.some((name,i)=>name!==was[i]))set({notified:names});
  }
  /* a device waits for its code to be confirmed here (the kernel's `attese`); a read that fails counts as waiting: never hand over blind */
  const codeWaiting=async()=>{try{return ((await host?.remote.stato())?.attese??[]).length>0;}catch{return true;}};
  async function beatOnce(){
    await checkAdmin();
    if(host){
      openChannel();
      if(!lease.beat()){await giveUp();return;}
      /* owner 27/10/2026: an administrator window opened — this normal host hands it the bridge, never in the middle of a pairing:
         a QR still open, or (block 8 E-R2, REV-B8-E1) a device that read the QR and waits for its code to be confirmed */
      const admin=adminWindow();
      if(admin&&!guard.busy()&&!(await codeWaiting())){await giveUp();lease.release();set({state:'elsewhere',elsewhere:admin.label,elsewhereKind:'window',elsewhereElevated:true,phones:[],consents:[]});return;}
      /* review 01/11 (Mobile and Desktop agreed): a window that hosts only because a read or a model's tool asked — remote control still off —
         gives the place back at its beat, as /remote does when its card closes (pairingEnded); never in a pairing, never with a code waiting.
         Hosting never turned the bridge on (riprendi needs acceso and a relay), so this frees the place another window or a terminal wants. */
      if(!turnedOn()&&!guard.busy()&&!(await codeWaiting())){await giveUp();lease.release();}
      return;
    }
    if(!turnedOn()){if(snapshot.state!=='off')set({...OFF,elevated});await closeChannel();return;}
    await knowElevation();
    openChannel();
    /* a free lease is left to an administrator window that is open: it takes it at its own beat */
    const admin=adminWindow();
    if(admin&&!lease.holder()){set({state:'elsewhere',elsewhere:admin.label,elsewhereKind:'window',elsewhereElevated:true,phones:[],consents:[],elevated});return;}
    const taken=lease.tryAcquire();
    if(taken.ok){await becomeHost();return;}
    set({state:'elsewhere',elsewhere:taken.holder.label??null,elsewhereKind:taken.holder.kind==='command'?'command':'window',elsewhereElevated:taken.holder.elevated===true,phones:[],consents:[],elevated});
  }
  /*
   * T6 (owner «come nel desktop»): the coordinator the model's remote_* tools use in this window. The desktop's server always has
   * one; here it is, at the moment of each call:
   * - this window's, when it hosts;
   * - the hosting window's, by proxy over its channel, with the lease token read now (a newer lease means a new connection);
   * - when nobody hosts (remote control off), this window hosts on demand, so the tools can read the paired devices and turn
   *   remote control on after the person's card, as on the desktop;
   * - `talos remote` holding the lease in a terminal → REMOTE_BUSY_COMMAND, said by the tool.
   */
  let toolLink:{client:WindowClient;token:string}|null=null;
  /* the connection to the hosting window for this lease token, opened once (a newer lease means a new connection) */
  async function linkTo(holder:{token:string}&Record<string,any>):Promise<WindowClient>{
    if(!toolLink||toolLink.client.closed||toolLink.token!==holder.token){
      toolLink?.client.close();toolLink=null;
      const client=await (input.connectHost??connectHostWindow)(input.dataRoot,holder as any);
      if(!client)throw failCode('REMOTE_HOST_UNREACHABLE','The TALOS window that hosts remote control did not answer.');
      toolLink={client,token:holder.token};
    }
    return toolLink.client;
  }
  async function toolTarget():Promise<FullCoordinator>{
    if(host)return host.remote as FullCoordinator;
    await knowElevation();
    await checkAdmin();
    const holder=lease.holder();
    if(holder?.token){
      if(holder.kind==='command')throw failCode('REMOTE_BUSY_COMMAND','Another talos remote is running on this PC.');
      if(holder.elevated===true&&!elevated)throw elevatedHostError();
      return proxyCoordinator(await linkTo(holder),holder.token);
    }
    if(adminWindow())throw elevatedHostError();
    if(await hostNowInternal()&&host)return (host as RemoteHost).remote as FullCoordinator;
    throw failCode('REMOTE_HOST_UNREACHABLE','The TALOS window that hosts remote control did not answer.');
  }
  const viaTarget=<T,>(use:(remote:FullCoordinator)=>Promise<T>|T):Promise<T>=>toolTarget().then(remote=>use(remote));
  const folders=(remote:FullCoordinator):DeviceFolders=>{if(!remote.cartelle)throw failCode('REMOTE_METHOD_UNAVAILABLE','This computer\'s remote control does not offer device folders.');return remote.cartelle;};
  const files=(remote:FullCoordinator):DeviceFiles=>{if(!remote.file)throw failCode('REMOTE_METHOD_UNAVAILABLE','This computer\'s remote control does not offer file offers.');return remote.file;};
  const toolCoordinator:FullCoordinator&{cartelle:DeviceFolders;file:DeviceFiles}={
    stato:()=>viaTarget(r=>r.stato()),
    imposta:(i)=>viaTarget(r=>r.imposta(i)),
    apriAccoppiamento:(o)=>viaTarget(r=>r.apriAccoppiamento(o)),
    chiudiAccoppiamento:(g)=>{void viaTarget(r=>r.chiudiAccoppiamento(g)).catch(()=>{});},
    conferma:(id)=>viaTarget(r=>r.conferma(id)),
    rifiuta:(id)=>viaTarget(r=>r.rifiuta(id)),
    revoca:(id)=>viaTarget(r=>r.revoca(id)),
    rinomina:(id,nome)=>viaTarget(r=>r.rinomina?r.rinomina(id,nome):Promise.reject(failCode('REMOTE_METHOD_UNAVAILABLE','Renaming is not available.'))),
    cartelle:{
      consensiDi:(id)=>viaTarget(r=>folders(r).consensiDi(id)),
      verifica:(percorso,id)=>viaTarget(r=>folders(r).verifica(percorso,id)),
      consentiInAnticipo:(id,percorso,options)=>viaTarget(r=>folders(r).consentiInAnticipo(id,percorso,options)),
      consensoDi:(id,cartellaOPercorso)=>viaTarget(r=>folders(r).consensoDi(id,cartellaOPercorso)),
      revoca:(id,cartellaId)=>viaTarget(r=>folders(r).revoca(id,cartellaId)),
      sblocca:(id,cartellaId)=>viaTarget(r=>{const f=folders(r);return f.sblocca?f.sblocca(id,cartellaId):Promise.reject(failCode('REMOTE_METHOD_UNAVAILABLE',"This computer's remote control cannot unblock a folder."));}),
    },
    file:{
      esaminaOfferta:(i)=>viaTarget(r=>files(r).esaminaOfferta(i)),
      registraOfferta:(i)=>viaTarget(r=>files(r).registraOfferta(i)),
    },
  };
  async function hostNowInternal():Promise<boolean>{
    if(host)return true;
    await knowElevation();
    await checkAdmin();
    const admin=adminWindow();
    if(admin){set({state:'elsewhere',elsewhere:admin.label,elsewhereKind:'window',elsewhereElevated:true,elevated});return false;}
    const taken=lease.tryAcquire();
    if(!taken.ok){set({state:'elsewhere',elsewhere:taken.holder.label??null,elsewhereKind:taken.holder.kind==='command'?'command':'window',elsewhereElevated:taken.holder.elevated===true,elevated});return false;}
    await becomeHost();
    return host!==null;
  }

  async function giveUp(){
    offState?.();offConsents?.();offState=offConsents=null;
    const was=host;host=null;
    await was?.stop().catch(()=>{});
    set({...OFF,elevated});
  }

  return{
    subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
    getSnapshot():TuiRemoteSnapshot{return snapshot;},
    /** Starts watching: hosts now if remote control is on and the lease is free, else says who hosts and tries again. */
    start():Promise<void>{
      if(starting)return starting;
      starting=(async()=>{
        await tick();
        timer=every(()=>{void tick();},Math.min(HANDOVER_MS,HOST_BEAT_MS));
        timer?.unref?.();
      })();
      return starting;
    },
    /** T3b: the TUI tells which conversations it has on screen; the window's channel answers `attached` from here. */
    setAttached(source:()=>string[]){attachedSource=source;},
    attached():string[]{return attachedNow();},
    /** T5: the TUI tells whether its screen waits for the person; «notification sent to» is read only then */
    setWaiting(source:()=>boolean|number|null){waitingSource=source;},
    /** The coordinator, for `/remote` in this window (null when another window hosts or remote is off and not yet started). */
    coordinator(){return host?.remote??null;},
    /** T4: the channel's `coordinator` operation (window-channel.ts), served only while this window hosts with that lease token */
    serveCoordinator(request:{method:string;args:unknown[];token:string},connection:WindowConnection){return serveCoordinator(request,connection);},
    /** `/remote` turned remote on in this window: host now, if no other window does. */
    hostNow:()=>hostNowInternal(),
    /** T6: the coordinator for the model's remote_* tools (session-registry.mjs `remotoFn`), resolved at each call */
    toolCoordinator(){return toolCoordinator;},
    /**
     * T4: the coordinator for `/remote` in this window, resolved once when the card opens: this window's own under the
     * one-pairing-at-a-time rule when it hosts (or hosts now, nobody else doing it), the hosting window's by proxy (the rule is
     * that host's), REMOTE_BUSY_COMMAND while `talos remote` pairs in a terminal.
     */
    /** owner 27/10/2026: whether the devices act with administrator rights through the remote control this window uses now */
    servesAsAdministrator():boolean{return host?elevated:lease.holder()?.elevated===true;},
    async pairingTarget(owner='window'):Promise<FullCoordinator>{
      const target=await toolTarget();
      return host?guardedCoordinator(host.remote as FullCoordinator,guard,owner):target;
    },
    /**
     * T4 research §5.11: `/remote` ended. Its pairing no longer holds the host, and a window that started hosting only for it — remote
     * control still off, the person closed the card before turning it on — gives the lease back, so it is not a host with nothing on.
     */
    async pairingEnded(owner='window'){
      guard.release(owner);
      if(host&&!turnedOn()){await giveUp();lease.release();}
    },
    /** The person's answer on the consent card: only a person answers it (never the model, never Full access). */
    async decideConsent(richiestaId:string,allow:boolean){
      if(!host?.remote.cartelle)return;
      await host.remote.cartelle.rispondi(richiestaId,allow?'consentita':'negata');
      await refresh();
    },
    /** The window closes: the remote stops and the lease is released, so another window takes over at once. */
    async stop(){
      stopped=true;
      if(timer)stopEvery(timer);
      toolLink?.client.close();toolLink=null;
      await giveUp();
      await closeChannel();
      lease.release();
    },
  };
}
export type TuiRemote=ReturnType<typeof createTuiRemote>;
