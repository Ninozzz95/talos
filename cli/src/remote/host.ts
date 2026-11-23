/*
 * 0.6.15 (owner 26/10/2026): the CLI hosts remote control the way the desktop does, with the desktop's own rules.
 * - «Stesse regole del desktop»: the phone's operations go through the kernel's HTTP handler (`createHttpApp`), created HERE,
 *   IN PROCESS, with no port: `creaChiamataInterna` hands it an in-memory request (measured 26/10: `GET /api/v1/sessions` → 200
 *   in 12 ms, nothing written, no socket). Every cure the desktop makes to a route reaches the CLI with the next realign.
 * - «Due voci separate»: the CLI's own iroh identity. The kernel keeps it under the keyring service `talos-harness-remote`; the
 *   installed desktop scopes it as `talos-harness-remote-desktop` (adattatore-keyring.mjs). The CLI maps it to `talos-cli-remote`
 *   and refuses any other service, so the two programs never share a key (one key per process, trasporto-iroh.mjs:12).
 * - «Finché TALOS è aperto»: the host lives inside a `talos` process and stops with it. Never in `-p`.
 * - The iroh binding is the one src/remote/iroh-component.ts downloaded and checked; nothing else is ever loaded.
 * The desktop's wiring this mirrors: harness-ui/server.mjs at r4 849c4fb17, the `creaRemoto({...})` block.
 */
import {randomBytes} from 'node:crypto';
import {existsSync} from 'node:fs';
import {hostname} from 'node:os';
import {dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {KeyringAdapter} from '../provider/store.ts';
import {loadIrohComponent} from './iroh-component.ts';

export const KERNEL_REMOTE_SERVICE='talos-harness-remote';
export const CLI_REMOTE_SERVICE='talos-cli-remote';
/* What the phone shows under the computer's name (pair.code / pair.ok `pc.programma`; the desktop sends «TALOS desktop»). */
export const CLI_PROGRAM_NAME='TALOS CLI';
/*
 * `creaChiamataInterna` writes `Host: 127.0.0.1:<port>` and the handler checks it against the same port; nothing listens on it.
 * Any number would do: this one says what it is.
 */
export const IN_PROCESS_PORT=1;

/** The PC's name on the phone: TALOS_REMOTE_PC_NAME (printable, 64 at most), else the hostname — as the desktop's server.mjs. */
export function remotePcName(env:Record<string,string|undefined>=process.env,host:()=>string=hostname):string{
  const chosen=String(env.TALOS_REMOTE_PC_NAME??'').replace(/[\p{Cc}\p{Cf}]/gu,'').trim().slice(0,64);
  return chosen||host();
}

type SyncKeyring={get(service:string,account:string):string|null;set(service:string,account:string,value:string):void;remove(service:string,account:string):void};

/** The CLI's keyring, seen by the kernel's remote module: only its one service, renamed to the CLI's own. */
export function cliRemoteKeyring(base:KeyringAdapter):SyncKeyring{
  const service=(name:string)=>{
    if(name!==KERNEL_REMOTE_SERVICE)throw Object.assign(new Error('REMOTE_KEYRING_SCOPE'),{code:'REMOTE_KEYRING_SCOPE'});
    return CLI_REMOTE_SERVICE;
  };
  /* the kernel's identity reads synchronously (identita.mjs `leggi`): a store that answers with a promise is not one it can use */
  const sync=<T>(value:T|Promise<T>):T=>{
    if(value&&typeof (value as any).then==='function')throw Object.assign(new Error('REMOTE_KEYRING_ASYNC'),{code:'REMOTE_KEYRING_ASYNC'});
    return value as T;
  };
  return{
    get:(name,account)=>{const v=sync(base.get(service(name),account));return typeof v==='string'&&v?v:null;},
    set:(name,account,value)=>{sync(base.set(service(name),account,value));},
    remove:(name,account)=>{sync(base.remove(service(name),account));},
  };
}

/** Where the remote keeps its files: settings, paired phones, folder consents and their secret, the devices' chat folder. */
export function remotePaths(dataRoot:string){
  const dir=join(dataRoot,'remote');
  return{
    dir,
    settings:join(dir,'settings.json'),
    phones:join(dir,'phones.json'),
    consents:join(dir,'consents.json'),
    /* blocked folders (kernel cartelle-dispositivi.mjs: next to the consents; talos-composition.ts reads it in every window) */
    blocked:join(dir,'cartelle-bloccate.json'),
    folderSecret:join(dir,'folder-secret'),
    /* the name the PC shows on the consent card for the devices' own chat (English first, as the desktop's) */
    chatFolder:join(dir,'Chats from devices'),
  };
}

export type RemoteHostInput={
  repoRoot:string;
  dataRoot:string;
  registry:any;
  keyring:KeyringAdapter;
  chatImageStore?:any;
  /* the kernel's `createHttpApp` deps beyond the registry that the CLI can give (models, providers, doctor…) */
  httpDeps?:Record<string,unknown>;
  pcName:string;
  ephemeral?:boolean;
  notify?:(event:{tipo?:string;motivo?:string}&Record<string,unknown>)=>void;
  importModule?:(file:string)=>Promise<any>;
  loadBinding?:(dataRoot:string)=>unknown;
  /** T3b: the device commands every window: the federated call, registry and stream (none: this window's own, as before) */
  federate?:Federate;
};
export type RemoteHost={remote:any;call:(request:{metodo:string;percorso:string;corpo?:unknown;origine?:string})=>Promise<{stato:number;dati:any}>;stop():Promise<void>};
export type InProcessCall=(request:{metodo:string;percorso:string;corpo?:unknown;origine?:string;origineRemota?:unknown})=>Promise<{stato:number;dati:any}>;

/**
 * T3b: this window's in-process HTTP handler (the kernel's `createHttpApp`, no port) and the kernel's `iscriviConRigiocata` — the host
 * uses them for its own conversations, and every window answers the host's forwarded operations with them, under its own rules.
 */
export async function createInProcessCall(input:{repoRoot:string;registry:any;chatImageStore?:any;httpDeps?:Record<string,unknown>|undefined;importModule?:((file:string)=>Promise<any>)|undefined;
  /** T3b review R1: the remote coordinator, so the kernel's second consent gate in http-app (R5.12, closed on failure) is armed */
  remotoFn?:(()=>any)|undefined;
  /** blocked folders step B (Desktop 2874ea11e): in a window that does not host, the same gate reads the consents from the profile's files */
  cartelleDispositiviFn?:(()=>any)|undefined}){
  const src=join(input.repoRoot,'harness-ui','src');
  const load=input.importModule??((file:string)=>import(pathToFileURL(join(src,file)).href));
  const [http,internalCall,subscription]=await Promise.all([load('http-app.mjs'),load('remoto/chiamata-interna.mjs'),load('iscrizione-sessione.mjs')]);
  /* the handler's gate token: in-process only, never printed, new at every start */
  const token=randomBytes(24).toString('hex');
  const app=http.createHttpApp({...(input.httpDeps??{}),sessionRegistry:input.registry,token,...(input.chatImageStore?{chatImageStore:input.chatImageStore}:{}),
    ...(input.remotoFn?{remotoFn:input.remotoFn}:{}),...(input.cartelleDispositiviFn?{cartelleDispositiviFn:input.cartelleDispositiviFn}:{})});
  const call:InProcessCall=internalCall.creaChiamataInterna({httpApp:app,porta:IN_PROCESS_PORT,gettone:token});
  return{call,subscribeWithReplay:subscription.iscriviConRigiocata as (x:{sessionRegistry:any;sessionId:string;daSequenza?:number;manda:(e:any)=>void})=>(()=>void)};
}
/** T3b: what the host hands the kernel's remote module instead of its own call, registry and stream (remote/federation.ts). */
export type Federate=(own:{call:InProcessCall;registry:any;subscribeWithReplay:(x:any)=>(()=>void);consent:()=>any})=>{chiama:InProcessCall;sessionRegistry:any;iscriviConRigiocata:(x:any)=>((()=>void)|undefined);close():void};

/**
 * Builds the in-process handler and the kernel's remote coordinator. Nothing opens towards the network here: the coordinator
 * starts its transport only when remote control is turned on with a relay chosen (`remote.accendi`), as in the desktop.
 */
/** The folders never offered to a device: the CLI's own install, its data folder, Node's folder (the host and every window alike). */
export function deviceFolderExclusions(repoRoot:string,dataRoot:string):string[]{return[repoRoot,dataRoot,dirname(process.execPath)];}

/**
 * Blocked folders step B, defence in depth (Desktop 2874ea11e): what a window that does NOT host hands its http-app, so the device-write
 * consent gate holds there too (federation forwards a device's write to the window that owns the conversation; the host checks first).
 * The kernel's own coordinator of the device folders, with the host's files and rules; it re-reads consents and blocks by file
 * signature, so it sees the host's changes. ⛔ Built only once the folder-id secret exists — the host makes it at its first listing; a
 * window that made a new one would give the same folders other ids. Before that, every device write is refused (closed, never open).
 */
export function createWindowDeviceFolders(input:{repoRoot:string;dataRoot:string;registry:any;importModule?:((file:string)=>Promise<any>)|undefined;exists?:(file:string)=>boolean}){
  const paths=remotePaths(input.dataRoot);
  const src=join(input.repoRoot,'harness-ui','src');
  const load=input.importModule??((file:string)=>import(pathToFileURL(join(src,file)).href));
  const exists=input.exists??existsSync;
  const refuseAll=Object.freeze({consentita:async()=>false});
  let made:any=null;let module:any=null;
  const loading=load('remoto/cartelle-dispositivi.mjs').then(m=>{module=m;},()=>{module=null;});
  return Object.assign(()=>{
    if(made)return made;
    if(!module?.creaCartelleDeiDispositivi||!exists(paths.folderSecret))return refuseAll;
    made=module.creaCartelleDeiDispositivi({fileConsensi:paths.consents,fileSegreto:paths.folderSecret,sessionRegistry:input.registry,
      cartelleAmmesse:[],cartelleEscluse:deviceFolderExclusions(input.repoRoot,input.dataRoot),cartellaChat:paths.chatFolder});
    return made;
  },{ready:loading});
}

export async function createRemoteHost(input:RemoteHostInput):Promise<RemoteHost>{
  const src=join(input.repoRoot,'harness-ui','src');
  const load=input.importModule??((file:string)=>import(pathToFileURL(join(src,file)).href));
  let remoteRef:any=null;
  const [remoteIndex,own]=await Promise.all([
    load('remoto/index.mjs'),
    /* the coordinator is made below: the gate reads it when a request comes, never before */
    createInProcessCall({repoRoot:input.repoRoot,registry:input.registry,chatImageStore:input.chatImageStore,httpDeps:input.httpDeps,importModule:load,remotoFn:()=>remoteRef}),
  ]);
  const call=own.call;
  const federated=input.federate?.({call,registry:input.registry,subscribeWithReplay:own.subscribeWithReplay,consent:()=>remoteRef?.cartelle??null})??null;
  const paths=remotePaths(input.dataRoot);
  const loadBinding=input.loadBinding??loadIrohComponent;
  const remote=remoteRef=remoteIndex.creaRemoto({
    keyring:cliRemoteKeyring(input.keyring),
    fileImpostazioni:paths.settings,
    fileTelefoni:paths.phones,
    fileConsensi:paths.consents,
    fileSegretoCartelle:paths.folderSecret,
    cartellaChat:paths.chatFolder,
    ...(input.chatImageStore?{chatImageStore:input.chatImageStore}:{}),
    /* no administrator allowlist in the CLI: a device's folders are the PC's recent ones, each with the PC's consent */
    cartelleAmmesse:[],
    /* never offered to a device: the CLI's own install, its data folder, Node's folder */
    cartelleEscluse:deviceFolderExclusions(input.repoRoot,input.dataRoot),
    chiama:federated?.chiama??call,
    sessionRegistry:federated?.sessionRegistry??input.registry,
    iscriviConRigiocata:federated?.iscriviConRigiocata??own.subscribeWithReplay,
    caricaIroh:async()=>loadBinding(input.dataRoot)??null,
    nomePc:input.pcName,
    programma:CLI_PROGRAM_NAME,
    effimero:input.ephemeral===true,
    avvisa:input.notify??(()=>{}),
    /* decisions 43 and 47: the same archive as the window's handler; a new device then sends its files to TALOS's data */
    ...(input.httpDeps?.archivioAllegati?{archivioAllegati:input.httpDeps.archivioAllegati,capacita:(input.httpDeps.archivioAllegati as any).disponibile?['allegati-nei-dati']:[]}:{}),
  });
  let stopped=false;
  return{
    remote,
    call,
    async stop(){if(stopped)return;stopped=true;await remote.ferma?.().catch(()=>{});federated?.close();},
  };
}
