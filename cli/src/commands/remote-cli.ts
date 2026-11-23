/*
 * 0.6.15 (owner 26/10/2026, «Subito, è la 0.6.15»): `talos remote` pairs a phone with this PC, as the approved mockup v3 draws it
 * for the terminal — and the TALOS sessions open on this PC are what the phone then works with («Remote control is on while
 * TALOS runs here»: decision «Finché TALOS è aperto»). Operations:
 *   talos remote                   pair a phone: first time the relay, then the QR, the code, Enter pairs (a terminal only)
 *   talos remote list              the phones, when they were paired, last seen, state (the mockup's cliList); --json
 *   talos remote revoke <name|id>  revoke one; its connection closes at once
 *   talos remote folders [<name|id>] [--allow <folder>|--revoke <folder id|path>|--unblock <folder id|path>]  the folders a device may work in (T5)
 *   talos remote relay [n0|<url>]  how a phone reaches this PC away from home (no argument: the mockup's choice)
 * Everything real is the kernel's remote coordinator, hosted in process by src/remote/host.ts with the desktop's own routes.
 * Research: Claude Code `claude remote-control` (QR with the space bar, `/rc` in a session), Codex `codex remote-control`
 * (one-to-one QR per phone and host, list and revoke from the terminal), Happy (relay that never reads) — PREPARAZIONE-REMOTO-CLI-0615.md.
 */
import type {CommandContext} from './context.ts';import {folderNobodyDecided,projectSettingsIgnoredLine} from './any-folder.ts';
import {assertNoUnknownOptions,takeOption,writeValue} from './context.ts';
import {resolve as resolvePath} from 'node:path';
import {t} from '../i18n/index.ts';
import {copyText} from '../tui/clipboard.ts';
import {detectTerminalCapabilities} from '../tui/terminal-capabilities.ts';
import {liveTheme,parseThemeChoice} from '../tui/theme-store.ts';
import {DEFAULT_THEME_ACCENT} from '../tui/theme-catalog.ts';
import {loadEffectiveConfig} from '../config/load.ts';
import {createRemoteHost,remotePaths,remotePcName,type RemoteHost} from '../remote/host.ts';
export {remotePcName};
import {cliHttpDeps} from '../remote/http-deps.ts';
import {ensureIrohComponent} from '../remote/iroh-component.ts';
import {chooseRelayFlow,runPairingFlow,type PairingIo} from '../remote/pairing-flow.ts';
import {folderListRows,pairingRows,phoneListRows,revokedRows,type FolderListRow,type PairingState,type PhoneListRow,type RemoteRow} from '../remote/pairing-view.ts';
import {createInlineScreen,paintRow,readTerminalKeys} from '../remote/terminal.ts';
import {createHostLease,HOST_BEAT_MS,type HostLeaseHandle} from '../automations/host-lease.ts';
import type {FullCoordinator} from '../remote/coordinator-service.ts';
import {connectHostWindow,proxyCoordinator} from '../remote/coordinator-proxy.ts';
import {COMMAND_LEASE_LABEL,REMOTE_HOST_LEASE,consentsOfState} from '../remote/tui-remote.ts';
import {cleanDeviceName} from '../remote/device-name.ts';
import {cardRowToRemote,createCommandConsent,type CommandConsentSource} from '../remote/command-consent.ts';
import {processElevated} from '../remote/elevation.ts';

const fail=(code:string)=>Object.assign(new Error(code),{code});

/**
 * The model a device's new session gets when it names none (live run 27/10/2026 with the Pad): the one asked with --model, else the
 * person's configured model, else the default. Before, `talos remote` skipped the configuration, so a profile set to any other
 * provider started the device's sessions on openai:gpt-5-mini and, with no OpenAI key, refused them (PROVIDER_KEY_MISSING). Same
 * order as the automations' host (advanced-cli.ts).
 */
export async function remoteHostModel(ctx:Pick<CommandContext,'paths'|'projectRoot'|'invocation'>,{projectTrusted=true}:{projectTrusted?:boolean}={}):Promise<string>{
  if(ctx.invocation.model)return ctx.invocation.model;
  try{const effective=await loadEffectiveConfig({paths:ctx.paths,projectRoot:ctx.projectRoot,cli:{},projectTrusted});if(effective.value.model)return effective.value.model;}catch{/* an unreadable configuration keeps the default */}
  return 'openai:gpt-5-mini';
}
export async function openHost(ctx:CommandContext,deps:{httpDeps?:typeof cliHttpDeps;createHost?:typeof createRemoteHost}={}):Promise<{host:RemoteHost;context:any}>{
  /* judge v1534 point 2: the host does not stop on trust; in a folder nobody decided it takes nothing from the folder's settings (its
     model included), runs in form B and says so in one line (any-folder.ts) */
  const undecided=Boolean(ctx.paths?.trust?.projects)&&await folderNobodyDecided(ctx);if(undecided)ctx.io.writeErr(projectSettingsIgnoredLine());
  const context=await ctx.createRuntimeContext({projectRoot:ctx.projectRoot,paths:ctx.paths,repoRoot:ctx.repoRoot,model:await remoteHostModel(ctx,{projectTrusted:!undecided}),environmentKeys:'consent',...(undecided?{trustVerified:true,projectUntrusted:true}:{})});
  if(!context.remoteKeyring)throw fail('REMOTE_KEYRING_MISSING');
  /* live run 27/10/2026 with the Pad: a device renamed a session made by the previous `talos remote` and got «session not found» —
     this host never loaded the saved sessions. Restored before the host serves anything, as the automations' host does
     (advanced-cli.ts); the kernel's journal replay, measured 08/10 at ~2 s for 54 MB */
  await context.registry?.ripristina?.();
  const httpDeps=await (deps.httpDeps??cliHttpDeps)({repoRoot:ctx.repoRoot,context,sessionsRoot:ctx.paths.sessionsRoot,dataRoot:ctx.paths.dataRoot});
  const host=await (deps.createHost??createRemoteHost)({repoRoot:ctx.repoRoot,dataRoot:ctx.paths.dataRoot,registry:context.registry,keyring:context.remoteKeyring,chatImageStore:context.chatImageStore,httpDeps,pcName:remotePcName(),ephemeral:context.credentialStore?.kind==='memory'});
  return{host,context};
}

/* T4: how long `talos remote` waits for a window that holds the host lease but is still opening its channel */
export const HOST_WINDOW_ATTEMPTS=3,HOST_WINDOW_RETRY_MS=1_000;
/* owner 27/10/2026: `administrator` — the devices act with administrator rights through this coordinator (it, or its window, is elevated) */
export type Coordinated={remote:FullCoordinator;via:'window'|'own';close():Promise<void>;lost():boolean;administrator:boolean;
  /** T5: this command hosts — the devices' folder requests, for the card it shows while pairing (a hosting window shows its own) */
  consents?:CommandConsentSource};
export type CoordinatorDeps={
  lease?:HostLeaseHandle;
  openOwn?:()=>Promise<{remote:FullCoordinator;stop():Promise<void>}>;
  connect?:typeof connectHostWindow;
  sleep?:(ms:number)=>Promise<void>;
  setInterval?:(fn:()=>void,ms:number)=>any;
  clearInterval?:(timer:any)=>void;
  elevated?:()=>Promise<boolean>;
};

/**
 * T4 (RICERCA-T4-COORDINATORE-UNICO.md): one coordinator per profile.
 * - A TALOS window hosts remote control → its coordinator, by proxy over its channel (no second iroh endpoint, a revoke reaches
 *   the live connection).
 * - Nobody hosts → this command takes the host lease for its whole run, as kind `command` (the windows then say «pairing in another
 *   terminal» and do not host halfway), renews it every HOST_BEAT_MS (pairing lasts minutes; a lease is stale after 120 s), and
 *   releases it at the end. A beat that finds the lease taken stops this coordinator at once: never two.
 * - Another `talos remote` holds it → REMOTE_BUSY_COMMAND.
 */
export async function openCoordinator(ctx:CommandContext,deps:CoordinatorDeps={}):Promise<Coordinated>{
  const dataRoot=ctx.paths.dataRoot;
  const elevated=await (deps.elevated??processElevated)().catch(()=>false);
  const lease=deps.lease??createHostLease({dir:remotePaths(dataRoot).dir,role:'run',fileName:REMOTE_HOST_LEASE,label:COMMAND_LEASE_LABEL,kind:'command',elevated:()=>elevated});
  const sleep=deps.sleep??(ms=>new Promise<void>(resolve=>setTimeout(resolve,ms)));
  const every=deps.setInterval??((fn:()=>void,ms:number)=>setInterval(fn,ms));
  const stopEvery=deps.clearInterval??((timer:any)=>clearInterval(timer));
  const connect=deps.connect??connectHostWindow;
  for(let attempt=0;attempt<HOST_WINDOW_ATTEMPTS;attempt++){
    const taken=lease.tryAcquire();
    if(taken.ok){
      let own:{remote:FullCoordinator;stop():Promise<void>};
      try{own=deps.openOwn?await deps.openOwn():await (async()=>{const {host}=await openHost(ctx);return{remote:host.remote as FullCoordinator,stop:()=>host.stop()};})();}
      catch(error){lease.release();throw error;}
      let lost=false;
      const loseNow=()=>{if(!lost){lost=true;void own.stop().catch(()=>{});}};
      const timer=every(()=>{if(!lost&&!lease.beat())loseNow();},HOST_BEAT_MS);
      timer?.unref?.();
      /* review 6 C-R3: the beat runs every 15 s, so a command frozen past the lease's staleness and woken before its next beat would
         still change something from its own coordinator while a window hosts. Every change asks the lease first — the proxy's
         fencing (coordinator-service.ts `owns`), on this side too. */
      const stillMine=()=>{if(!lost&&!lease.owns())loseNow();if(lost)throw fail('REMOTE_LEASE_LOST');};
      const base=own.remote;
      const remote:FullCoordinator={
        ...base,
        stato:()=>base.stato(),
        imposta:async(i)=>{stillMine();return base.imposta(i);},
        apriAccoppiamento:async(o)=>{stillMine();return base.apriAccoppiamento(o);},
        chiudiAccoppiamento:(g)=>{if(!lost&&lease.owns())base.chiudiAccoppiamento(g);},
        conferma:async(id)=>{stillMine();return base.conferma(id);},
        rifiuta:async(id)=>{stillMine();return base.rifiuta(id);},
        revoca:async(id)=>{stillMine();return base.revoca(id);},
        ...(base.rinomina?{rinomina:async(id:string,nome:string)=>{stillMine();return base.rinomina!(id,nome);}}:{}),
        /* T5 `talos remote folders`: allowing and revoking a folder are changes too (the proxy's CHANGES), so they ask the lease first */
        ...(base.cartelle?{cartelle:{
          consensiDi:(id:string)=>base.cartelle!.consensiDi(id),
          verifica:(percorso:string,id?:string|null)=>base.cartelle!.verifica(percorso,id),
          consensoDi:(id:string,cartellaOPercorso:string)=>base.cartelle!.consensoDi(id,cartellaOPercorso),
          consentiInAnticipo:async(id:string,percorso:string,options?:{da?:string;attesa?:string|null})=>{stillMine();return base.cartelle!.consentiInAnticipo(id,percorso,options);},
          revoca:async(id:string,cartellaId:string)=>{stillMine();return base.cartelle!.revoca(id,cartellaId);},
          /* blocked folders step B: unblocking is a change too */
          ...(base.cartelle.sblocca?{sblocca:async(id:string,cartellaId:string)=>{stillMine();return base.cartelle!.sblocca!(id,cartellaId);}}:{})}}:{}),
      };
      /* the kernel's consent requests (cartelle-dispositivi.mjs `ascolta`, `rispondi`); an answer is a change, so it asks the lease first */
      const kernelFolders=base.cartelle as any;
      const consents:CommandConsentSource|undefined=typeof kernelFolders?.rispondi==='function'?{
        list:async()=>consentsOfState(await base.stato()),
        listen:(onChange)=>kernelFolders.ascolta?.(onChange)??(()=>{}),
        answer:async(requestId,allow)=>{stillMine();await kernelFolders.rispondi(requestId,allow?'consentita':'negata');},
      }:undefined;
      return{remote,via:'own',lost:()=>lost,administrator:elevated,...(consents?{consents}:{}),async close(){stopEvery(timer);if(!lost)await own.stop().catch(()=>{});lease.release();}};
    }
    if(taken.holder.kind==='command')throw fail('REMOTE_BUSY_COMMAND');
    /* owner 27/10/2026: Windows does not let this normal terminal open an administrator window's channel — said, not three failed connects */
    if(taken.holder.elevated===true&&!elevated)throw fail('REMOTE_HOST_ELEVATED');
    const client=taken.holder.token?await connect(dataRoot,taken.holder):null;
    if(client)return{remote:proxyCoordinator(client,taken.holder.token),via:'window',lost:()=>false,administrator:taken.holder.elevated===true,async close(){client.close();}};
    if(attempt<HOST_WINDOW_ATTEMPTS-1)await sleep(HOST_WINDOW_RETRY_MS);
  }
  throw fail('REMOTE_HOST_UNREACHABLE');
}

async function themeColors(ctx:CommandContext){
  const caps=detectTerminalCapabilities({stdinIsTTY:ctx.io.stdinIsTTY,stdoutIsTTY:ctx.io.stdoutIsTTY,color:ctx.invocation.color!==false,env:process.env});
  let id=DEFAULT_THEME_ACCENT as any;
  try{const value=(await loadEffectiveConfig({paths:ctx.paths,projectRoot:ctx.projectRoot})).value as any;id=parseThemeChoice(value?.ui?.theme)??id;}catch{/* the default theme */}
  return liveTheme(caps,id).theme.colors;
}
const print=(ctx:CommandContext,rows:readonly RemoteRow[],colors:any)=>ctx.io.writeOut(`${rows.map(row=>paintRow(row,colors)).join('\n')}\n`);

/* the mockup's cliList: PAIRED is always «17/10 12:41»; LAST SEEN says «today 12:58», «yesterday 18:20» or «now, direct» */
function dated(ms:number):string{
  const d=new Date(ms);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function when(ms:number|null|undefined,now:Date,relative=true):string{
  if(!Number.isFinite(ms))return '-';
  if(!relative)return dated(ms as number);
  const d=new Date(ms as number);
  const hm=`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  const day=(x:Date)=>`${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const yesterday=new Date(now);yesterday.setDate(now.getDate()-1);
  if(day(d)===day(now))return `today ${hm}`;
  if(day(d)===day(yesterday))return `yesterday ${hm}`;
  return dated(ms as number);
}
/** The phones the list shows: the paired ones and the ones revoked from the phone (revoked here, they leave the list). */
export function phoneRows(telefoni:readonly any[],now=new Date()):PhoneListRow[]{
  return telefoni.filter(p=>!p.revocatoAlle||p.revocatoDa==='telefono').map(p=>({
    /* block 10 E-R1: printed by paintRow, so cleaned first (device-name.ts) */
    name:cleanDeviceName(p.nome??p.id),
    paired:when(p.collegatoAlle,now,false),
    /* the kernel's path is {tipo:'relay'|'diretto', rttMs} (trasporto-iroh.mjs `percorso`) */
    lastSeen:p.inLinea?`now, ${p.percorso?.tipo==='relay'?'relay':'direct'}`:when(p.ultimaVoltaAlle,now),
    state:p.revocatoAlle?'revoked-by-phone':p.inLinea?'online':'offline',
  }));
}
/** The phone a name or id means: exact id, else the one name (case does not matter); none or two is an error that says which. */
export function findPhone(telefoni:readonly any[],which:string):any{
  const active=telefoni.filter(p=>!p.revocatoAlle);
  const byId=active.find(p=>p.id===which);if(byId)return byId;
  /* the name as stored or as shown: the person types what the list printed */
  const named=active.filter(p=>String(p.nome??'').toLowerCase()===which.toLowerCase()||cleanDeviceName(p.nome,'').toLowerCase()===which.toLowerCase());
  if(named.length===1)return named[0];
  throw fail(named.length?'REMOTE_PHONE_AMBIGUOUS':'REMOTE_PHONE_NOT_FOUND');
}

function terminalIo(ctx:CommandContext,draw:(state:PairingState)=>void,keys:{next():Promise<any>}):PairingIo{
  return{
    nextKey:()=>keys.next(),
    sleep:(ms,signal)=>new Promise<void>(resolve=>{const timer=setTimeout(resolve,ms);signal.addEventListener('abort',()=>{clearTimeout(timer);resolve();},{once:true});}),
    now:()=>Date.now(),
    draw,
    copy:async text=>(await copyText(text)).ok,
    ensureComponent:async onDownload=>{onDownload('6.3 MB');await ensureIrohComponent({dataRoot:ctx.paths.dataRoot});},
  };
}

/** One frame of `talos remote`'s pairing, as the inline screen draws it: a blank row, then the screen's rows fitted to the window (T4). */
export function pairingFrame(state:PairingState,colors:any,size:{columns:number;rows:number},administrator=false):string[]{
  return['',...pairingRows(state,{width:size.columns,rows:size.rows,administrator}).map(row=>paintRow(row,colors))];
}

async function pair(ctx:CommandContext,remote:FullCoordinator,administrator=false,consents?:CommandConsentSource):Promise<number>{
  if(!ctx.io.stdinIsTTY||!ctx.io.stdoutIsTTY)throw fail('REMOTE_REQUIRES_TERMINAL');
  const colors=await themeColors(ctx);
  const screen=createInlineScreen(text=>ctx.io.writeOut(text));
  const width=()=>process.stdout.columns||100;
  /* T4: the window's height, so a QR that would be cut becomes the «too small» screen (pairingRows `rows`) */
  const height=()=>process.stdout.rows||24;
  const keys=readTerminalKeys(process.stdin);
  /* T5: hosting itself, a device's folder request shows its card here; the pairing waits under it */
  const gate=consents?createCommandConsent({source:consents,keys,width,draw:lines=>screen.draw(lines),
    paint:rows=>['',...rows.map(row=>paintRow(cardRowToRemote(row),colors))]}):null;
  screen.hideCursor();
  try{
    await gate?.start();
    const drawFrame=(lines:string[])=>gate?gate.draw(lines):screen.draw(lines);
    const outcome=await runPairingFlow(remote,terminalIo(ctx,state=>drawFrame(pairingFrame(state,colors,{columns:width(),rows:height()},administrator)),gate?gate.keys:keys));
    screen.keep();
    if(outcome.result==='failed')throw fail(outcome.code);
    return outcome.result==='paused'?1:0;
  }finally{gate?.stop();keys.close();screen.showCursor();}
}

async function relay(ctx:CommandContext,remote:FullCoordinator,value:string|undefined):Promise<number>{
  if(value!==undefined){
    await remote.imposta({relay:value==='n0'?{modo:'n0'}:{modo:'proprio',url:value}});
    const stato=await remote.stato();
    writeValue(ctx,{relay:stato.relay},`${stato.relay?.modo==='n0'?'n0':stato.relay?.url}\n`);
    return 0;
  }
  if(!ctx.io.stdinIsTTY||!ctx.io.stdoutIsTTY)throw fail('REMOTE_REQUIRES_TERMINAL');
  const colors=await themeColors(ctx);
  const screen=createInlineScreen(text=>ctx.io.writeOut(text));
  const keys=readTerminalKeys(process.stdin);
  screen.hideCursor();
  try{
    const chosen=await chooseRelayFlow(remote,terminalIo(ctx,state=>screen.draw(['',...pairingRows(state).map(row=>paintRow(row,colors))]),keys));
    screen.keep();
    return chosen?0:1;
  }finally{keys.close();screen.showCursor();}
}

/* T5, `talos remote folders`: a device's folders, through the one coordinator (the hosting window's by proxy, or this command's) */
const FOLDER_SOURCES=new Set(['anticipo','chat','domanda']);
const dayTime=(iso:unknown)=>{const ms=Date.parse(String(iso??''));return Number.isFinite(ms)?dated(ms):'-';};
export type FolderChange={allow:string}|{revoke:string}|{unblock:string}|null;
/**
 * List (every device, or `which`), allow one folder (`--allow <path>`, a relative path read from where the command runs) or revoke one
 * (`--revoke <folder id|path>`). The person typing the command is the consent (as the desktop's «allow in advance»): from the device
 * it then reads, writes and runs commands there. Returns the rows to print and the JSON value.
 */
export async function remoteFolders(remote:FullCoordinator,which:string|undefined,change:FolderChange,cwd:string=process.cwd()):Promise<{rows:RemoteRow[];json:unknown}>{
  const folders=remote.cartelle;
  if(!folders)throw fail('REMOTE_METHOD_UNAVAILABLE');
  const stato=await remote.stato();
  const all=stato.telefoni??[];
  if(change){
    if(!which)throw fail('REMOTE_PHONE_REQUIRED');
    const phone=findPhone(all,which);const device=cleanDeviceName(phone.nome??phone.id);
    if('allow' in change){
      const esame=await folders.verifica(resolvePath(cwd,change.allow),phone.id);
      if(esame?.esito==='inesistente')throw fail('REMOTE_FOLDER_MISSING');
      if(esame?.esito==='esclusa')throw fail('REMOTE_FOLDER_TALOS');
      if(esame?.consentita)return{rows:[[{text:`  ${t('remote.folders.already',{device,path:esame.percorso})}`,style:'dim'}]],json:{ok:true,already:true,device:{id:phone.id,name:phone.nome},folder:{id:esame.cartellaId,path:esame.percorso}}};
      try{await folders.consentiInAnticipo(phone.id,esame.percorso,{da:'anticipo',attesa:esame.cartellaId});}
      catch(error:any){
        if(error?.code==='FOLDER_CHANGED')throw fail('REMOTE_FOLDER_CHANGED');
        if(error?.code==='FOLDER_INVALID')throw fail('REMOTE_FOLDER_MISSING');
        if(error?.code==='FOLDER_NOT_ALLOWED')throw fail('REMOTE_FOLDER_TALOS');
        /* blocked folders step B: inside a folder blocked for this device, allowing would not make it usable */
        if(error?.code==='FOLDER_BLOCKED')throw fail('REMOTE_FOLDER_INSIDE_BLOCKED');
        throw error;
      }
      return{rows:[[{text:`  ${t('remote.folders.added',{device,path:esame.percorso})}`,style:'ok'}]],json:{ok:true,allowed:{device:{id:phone.id,name:phone.nome},folder:{id:esame.cartellaId,path:esame.percorso}}}};
    }
    if('unblock' in change){
      /* blocked folders step B (owner 27/10 «il nega vince»): only the block goes; the folder is not allowed by it, the device
         reaches it again through the folders it is allowed. The person typing is the consent, as for --allow. */
      if(!folders.sblocca)throw fail('REMOTE_METHOD_UNAVAILABLE');
      const key=(p:string)=>{const r=resolvePath(cwd,p);return process.platform==='win32'?r.toLowerCase():r;};
      const blocked=((await folders.consensiDi(phone.id)) as any[]??[]).find(c=>c.bloccata===true&&(c.cartellaId===change.unblock||key(String(c.percorso))===key(change.unblock)));
      if(!blocked)throw fail('REMOTE_FOLDER_NOT_BLOCKED');
      try{await folders.sblocca(phone.id,blocked.cartellaId);}
      catch(error:any){if(error?.code==='NOT_FOUND')throw fail('REMOTE_FOLDER_NOT_BLOCKED');throw error;}
      return{rows:[[{text:`  ${t('remote.folders.unblocked',{device,path:blocked.percorso})}`,style:'ok'}]],
        json:{ok:true,unblocked:{device:{id:phone.id,name:phone.nome},folder:{id:blocked.cartellaId,path:blocked.percorso}}}};
    }
    /* a folder id or the full path as the list shows them; a path typed relative is read from where the command runs */
    const given=await folders.consensoDi(phone.id,change.revoke)??await folders.consensoDi(phone.id,resolvePath(cwd,change.revoke));
    if(!given)throw fail('REMOTE_FOLDER_NOT_GIVEN');
    /* the blocks before, so the one this revoke makes is named by its own id: through a link it sits on the real path, not on
       the revoked folder's */
    const blocksOf=async()=>(((await folders.consensiDi(phone.id)) as any[])??[]).filter(c=>c?.bloccata===true).map(c=>String(c.cartellaId));
    const blocksBefore=new Set(await blocksOf());
    let out:any;
    try{out=await folders.revoca(phone.id,given.cartellaId);}
    catch(error:any){if(error?.code==='NOT_FOUND')throw fail('REMOTE_FOLDER_NOT_GIVEN');throw error;}
    const revoked={device:{id:phone.id,name:phone.nome},folder:{id:given.cartellaId,path:given.percorso}};
    /* blocked folders step B: still reachable through a folder the device keeps (one above it, a junction to it) — the kernel blocked
       it, and the person is told through which, and how to undo the block */
    if(out?.bloccata===true){
      const through=String(out.tramite?.nome??'');
      const blockId=(await blocksOf()).find(id=>!blocksBefore.has(id))??null;
      return{rows:[[{text:`  ${t('remote.folders.removed',{device,path:given.percorso})}`,style:'ok'}],
        /* a link that leads to a folder the device keeps (the kernel's `stessaCartella`): that very folder is the one now blocked.
           The command to copy names the device by its id: the name is the device's own, and pasted it would run what it holds (review D) */
        [{text:`  ${t(out.stessaCartella===true?'remote.folders.blockedSame':'remote.folders.blockedNow',{through,device,undo:t(blockId?'remote.folders.undoBlock':'remote.folders.undoBlockList',{deviceId:phone.id,id:blockId??''})})}`,style:'warn'}]],
        json:{ok:true,revoked:{...revoked,blocked:true,through:{id:String(out.tramite?.cartellaId??''),name:through},sameFolder:out.stessaCartella===true,block:{id:blockId}}}};
    }
    return{rows:[[{text:`  ${t('remote.folders.removed',{device,path:given.percorso})}`,style:'ok'}]],json:{ok:true,revoked}};
  }
  const devices=which?[findPhone(all,which)]:all.filter((p:any)=>!p.revocatoAlle);
  const listed=[];
  for(const phone of devices){
    const consents=(await folders.consensiDi(phone.id)) as any[]??[];
    /* blocked folders step B: the kernel lists the device's blocks after its folders (`bloccata`, `bloccataAlle`); never read as allowed */
    listed.push({id:phone.id,name:cleanDeviceName(phone.nome??phone.id),folders:consents.map(c=>{
      const blocked=c.bloccata===true;const at=blocked?c.bloccataAlle:c.consentitaAlle;
      return{id:String(c.cartellaId),name:String(c.nome),path:String(c.percorso),allowedAt:dayTime(at),allowedAtIso:at??null,
        from:(FOLDER_SOURCES.has(c.da)?c.da:'domanda') as FolderListRow['from'],exists:c.esiste!==false,blocked};
    })});
  }
  return{rows:folderListRows(listed),json:{devices:listed.map(d=>({id:d.id,name:d.name,folders:d.folders.map(f=>f.blocked
    ?{id:f.id,name:f.name,path:f.path,blocked:true,blockedAt:f.allowedAtIso,exists:f.exists}
    :{id:f.id,name:f.name,path:f.path,allowedAt:f.allowedAtIso,from:f.from==='anticipo'?'in-advance':f.from==='chat'?'chat':'device',exists:f.exists,blocked:false})}))}};
}

/* `talos remote revoke <device>`: the printed line names the device with the one filter for device names (Desktop review block 11
   E-R4: the printing had no test); the JSON is unchanged */
export async function remoteRevoke(remote:Pick<FullCoordinator,'revoca'>,telefoni:readonly any[],which:string):Promise<{rows:RemoteRow[];json:unknown}>{
  const phone=findPhone(telefoni,which);
  await remote.revoca(phone.id);
  return{rows:revokedRows(cleanDeviceName(phone.nome??phone.id)),json:{ok:true,revoked:{id:phone.id,name:phone.nome}}};
}
export async function runRemoteCommand(ctx:CommandContext,args:string[]):Promise<number>{
  const op=args[0]&&!args[0].startsWith('-')?args.shift():undefined;
  if(op!==undefined&&!['list','revoke','relay','folders'].includes(op))throw fail('REMOTE_OPERATION_UNKNOWN');
  /* the folder options first: `folders --allow . "Pad"` and `folders "Pad" --allow .` say the same */
  const allow=op==='folders'?takeOption(args,'--allow'):undefined;
  const revokeFolder=op==='folders'?takeOption(args,'--revoke'):undefined;
  const unblock=op==='folders'?takeOption(args,'--unblock'):undefined;
  /* one dash is not an option here: a device id may start with it (base64url), and the hint gives the id to copy (review D) */
  const which=op==='revoke'||op==='relay'||(op==='folders'&&args[0]&&!args[0].startsWith('--'))?args.shift():undefined;
  assertNoUnknownOptions(args);
  if(args.length)throw fail('REMOTE_EXTRA_ARGUMENT');
  if(op==='revoke'&&!which)throw fail('REMOTE_PHONE_REQUIRED');
  const changes=[allow,revokeFolder,unblock].filter(v=>v!==undefined).length;
  if(changes>1)throw fail('REMOTE_FOLDER_ONE_CHANGE');
  if(changes&&!which)throw fail('REMOTE_PHONE_REQUIRED');
  /* pairing and the relay choice draw a screen and read keys: without a terminal they say so before anything is loaded */
  if((op===undefined||(op==='relay'&&which===undefined))&&(!ctx.io.stdinIsTTY||!ctx.io.stdoutIsTTY))throw fail('REMOTE_REQUIRES_TERMINAL');
  const coordinated=await openCoordinator(ctx);
  const remote=coordinated.remote;
  try{
    if(op===undefined)return await pair(ctx,remote,coordinated.administrator,coordinated.consents);
    if(op==='relay')return await relay(ctx,remote,which);
    if(op==='folders'){
      const out=await remoteFolders(remote,which,allow!==undefined?{allow}:revokeFolder!==undefined?{revoke:revokeFolder}:unblock!==undefined?{unblock}:null);
      if(ctx.invocation.outputFormat==='json')writeValue(ctx,out.json);
      else print(ctx,out.rows,await themeColors(ctx));
      return 0;
    }
    const stato=await remote.stato();
    if(op==='list'){
      const rows=phoneRows(stato.telefoni??[]);
      if(ctx.invocation.outputFormat==='json')writeValue(ctx,{phones:rows,pc:stato.nomePc,relay:stato.relay??null});
      else print(ctx,phoneListRows(rows),await themeColors(ctx));
      return 0;
    }
    const out=await remoteRevoke(remote,stato.telefoni??[],which!);
    if(ctx.invocation.outputFormat==='json')writeValue(ctx,out.json);
    else print(ctx,out.rows,await themeColors(ctx));
    return 0;
  }catch(error){
    /* a window took the lease while this command was frozen: this coordinator stopped at the beat, never two at once */
    if(coordinated.lost())throw fail('REMOTE_LEASE_LOST');
    throw error;
  }finally{await coordinated.close();}
}
