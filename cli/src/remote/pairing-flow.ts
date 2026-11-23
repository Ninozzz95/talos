/*
 * 0.6.15: the pairing flow of `talos remote` and `/remote`, the approved mockup's sequence (v3): first time the relay choice,
 * then the QR (5 minutes, works once), then the six digits to compare, Enter pairs and Esc rejects, then «paired until you revoke
 * it»; the QR that expired, a rejection and the 15-minute pause each have their own screen. The kernel's remote coordinator
 * (`creaRemoto`) does every real step: `imposta` (relay), `apriAccoppiamento` (QR), `stato().attese` (a phone waiting with its code),
 * `conferma`, `rifiuta`, `chiudiAccoppiamento`. This module only decides which screen comes next: keys, the clock and the
 * coordinator arrive from outside, so the tests drive it with a fake coordinator and the TUI and the command share it.
 */
import {cleanDeviceName} from './device-name.ts';
import type {PairingState,QrModules} from './pairing-view.ts';

/* contract §2 (FILO-REMOTO-v1): 5 wrong attempts — fake tokens and codes the person rejects — pause pairing for 15 minutes */
export const PAIR_ATTEMPTS=5;
/* T5: left, right and tab answer the consent card `talos remote` shows while it hosts (command-consent.ts); the flow ignores them */
export type PairingKey='up'|'down'|'left'|'right'|'tab'|'enter'|'esc'|'c'|'r'|'backspace'|{char:string};
export type PairingOutcome={result:'paired';phone:string}|{result:'cancelled'}|{result:'paused';until:number}|{result:'failed';code:string};

export type RemoteCoordinator={
  stato():Promise<any>;
  imposta(input:{acceso?:boolean;relay?:{modo:'n0'}|{modo:'proprio';url:string}}):Promise<any>;
  apriAccoppiamento(input?:{soloSeAcceso?:boolean}):Promise<{gettone:string;qr:string;scadeAlle:number;moduli:QrModules}>;
  chiudiAccoppiamento(gettone:string):void;
  conferma(id:string):Promise<unknown>;
  rifiuta(id:string):unknown;
};
export type PairingIo={
  /** the next key, or null when input ended (Ctrl+C, the stream closed) */
  nextKey():Promise<PairingKey|null>;
  /** resolves after `ms`, or earlier when `signal` aborts */
  sleep(ms:number,signal:AbortSignal):Promise<void>;
  now():number;
  draw(state:PairingState):void;
  copy(text:string):Promise<boolean>;
  /** makes sure the iroh component is there (src/remote/iroh-component.ts); throws with its code when it cannot */
  ensureComponent(onDownload:(size:string)=>void):Promise<void>;
};

/* a letter key arrives from the terminal as a character (the relay's address is typed with the same keys): «c» and «r» either way */
const isKey=(key:PairingKey|null,name:'c'|'r')=>key===name||(typeof key==='object'&&key!==null&&key.char.toLowerCase()===name);
const errorCode=(e:unknown)=>String((e as any)?.code??'REMOTE_ERROR');
const attemptsLeft=(stato:any)=>Math.max(0,PAIR_ATTEMPTS-Number(stato?.accoppiamento?.sbagliati??0));
const pausedUntil=(stato:any,now:number)=>{const until=Number(stato?.accoppiamento?.bloccatoFinoA??0);return until>now?until:0;};

/*
 * ONE outstanding read of the keyboard at a time. A wait that races a key with the clock and loses keeps its read pending; the
 * next screen asks again and gets THAT read, so no key typed while the phone's request arrived is lost to an abandoned promise.
 */
type Keys={next():Promise<PairingKey|null>};
function keyReader(io:PairingIo):Keys{
  let pending:Promise<PairingKey|null>|null=null;
  return{next(){
    if(!pending){const read=io.nextKey();pending=read;const clear=()=>{if(pending===read)pending=null;};read.then(clear,clear);}
    return pending;
  }};
}

/** Waits for a key, polling the clock and the coordinator in between with `onIdle`; the first of the two that has news wins. */
async function waitFor<T>(io:PairingIo,keys:Keys,onKey:(key:PairingKey|null)=>T,onIdle:()=>Promise<T|undefined>,pollMs=250):Promise<T>{
  for(;;){
    const stop=new AbortController();
    const tick=io.sleep(pollMs,stop.signal).then(()=>'tick' as const);
    const got=await Promise.race([keys.next().then(key=>({key})),tick]);
    stop.abort();
    if(got!=='tick')return onKey(got.key);
    const idle=await onIdle();
    if(idle!==undefined)return idle;
  }
}

/**
 * The whole pairing, start to end. The coordinator throws with the kernel's codes; the ones the person can act on have their
 * screen (PAIR_LOCKED the pause), the others end the flow with the code, said by the caller with its words.
 */
export async function runPairingFlow(remote:RemoteCoordinator,io:PairingIo,options:{open?:{soloSeAcceso?:boolean}}={}):Promise<PairingOutcome>{
  const keys=keyReader(io);
  try{
    let stato=await remote.stato();
    if(!stato.disponibile){
      await io.ensureComponent(size=>io.draw({screen:'downloading',size}));
      stato=await remote.stato();
      if(!stato.disponibile)return{result:'failed',code:'REMOTE_COMPONENT_NOT_LOADED'};
    }
    if(!stato.sceltaFatta){
      const relay=await chooseRelay(remote,io,keys);
      if(!relay)return{result:'cancelled'};
      stato=await remote.stato();
    }
    for(;;){
      const paused=pausedUntil(stato,io.now());
      if(paused){io.draw({screen:'paused',until:clock(paused)});return{result:'paused',until:paused};}
      let offer;
      /* T4: the QR the model asked for after the person's card (`remote_phone_pair`) opens with `soloSeAcceso`: the kernel turned
         remote control on after the card, and the QR never turns it on by itself (session-registry.mjs R5.12) */
      try{offer=await remote.apriAccoppiamento(options.open);}
      catch(e){
        if(errorCode(e)==='PAIR_LOCKED'){const until=io.now()+Number((e as any)?.retryAfterMs??0);io.draw({screen:'paused',until:clock(until)});return{result:'paused',until};}
        throw e;
      }
      const next=await showQr(remote,io,keys,offer);
      if(next.kind==='close')return{result:'cancelled'};
      if(next.kind==='paired')return{result:'paired',phone:next.phone};
      if(next.kind==='paused'){io.draw({screen:'paused',until:clock(next.until)});return{result:'paused',until:next.until};}
      /* «r» on the expired or rejected screen: a new QR */
      stato=await remote.stato();
    }
  }catch(e){return{result:'failed',code:errorCode(e)};}
}

/** `talos remote relay` with no argument: the relay choice alone (true when one was saved). */
export async function chooseRelayFlow(remote:RemoteCoordinator,io:PairingIo):Promise<boolean>{return chooseRelay(remote,io,keyReader(io));}

function clock(epochMs:number):string{const d=new Date(epochMs);return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}

async function chooseRelay(remote:RemoteCoordinator,io:PairingIo,keys:Keys):Promise<boolean>{
  let selected:'n0'|'own'='n0';
  for(;;){
    io.draw({screen:'relay',selected});
    const key=await keys.next();
    if(key===null||key==='esc')return false;
    if(key==='up'||key==='down'){selected=selected==='n0'?'own':'n0';continue;}
    if(key!=='enter')continue;
    if(selected==='n0'){await remote.imposta({relay:{modo:'n0'}});return true;}
    let value='';
    for(;;){
      io.draw({screen:'relay-address',value});
      const k=await keys.next();
      if(k===null)return false;
      if(k==='esc')break;
      if(k==='backspace'){value=[...value].slice(0,-1).join('');continue;}
      if(typeof k==='object'&&k.char){value+=k.char;continue;}
      if(k==='enter'&&value.trim()){
        try{await remote.imposta({relay:{modo:'proprio',url:value.trim()}});return true;}
        catch(e){if(errorCode(e)!=='REMOTE_RELAY_INVALID')throw e;value='';}
      }
    }
  }
}

type QrNext={kind:'close'}|{kind:'again'}|{kind:'paired';phone:string}|{kind:'paused';until:number};

async function showQr(remote:RemoteCoordinator,io:PairingIo,keys:Keys,offer:{gettone:string;qr:string;scadeAlle:number;moduli:QrModules}):Promise<QrNext>{
  let copied=false;
  const left=()=>Math.max(0,Math.ceil((offer.scadeAlle-io.now())/1000));
  const draw=()=>io.draw({screen:'qr',qr:offer.moduli,secondsLeft:left(),copied});
  draw();
  type Waiting={kind:'key';key:PairingKey|null}|{kind:'phone';waiting:any;stato:any}|{kind:'expired'};
  for(;;){
    const event:Waiting=await waitFor<Waiting>(io,keys,key=>({kind:'key',key}),async()=>{
      if(left()<=0)return{kind:'expired'};
      const stato=await remote.stato();
      const waiting=(stato.attese??[])[0];
      if(waiting)return{kind:'phone',waiting,stato};
      draw();
      return undefined;
    });
    if(event.kind==='key'){
      if(event.key===null||event.key==='esc'){remote.chiudiAccoppiamento(offer.gettone);return{kind:'close'};}
      if(isKey(event.key,'c')&&!copied){copied=await io.copy(offer.qr);draw();}
      continue;
    }
    if(event.kind==='expired'){
      remote.chiudiAccoppiamento(offer.gettone);
      io.draw({screen:'expired'});
      return afterwards(keys);
    }
    return confirmCode(remote,io,keys,event.waiting,event.stato);
  }
}

async function confirmCode(remote:RemoteCoordinator,io:PairingIo,keys:Keys,waiting:{id:string;nome:string;codice:string},stato:any):Promise<QrNext>{
  /* owner 27/10/2026 («device» on screen, never «phone»): the name shown when the device sent none */
  /* block 10 E-R1: the name the person decides on, without control or format characters (device-name.ts) */
  const phone=cleanDeviceName(waiting.nome);
  io.draw({screen:'code',phone,code:waiting.codice,attemptsLeft:attemptsLeft(stato)});
  for(;;){
    const key=await keys.next();
    if(key==='enter'){
      await remote.conferma(waiting.id);
      io.draw({screen:'done',phone});
      return{kind:'paired',phone};
    }
    if(key==='esc'||key===null){
      await remote.rifiuta(waiting.id);
      const after=await remote.stato();
      const paused=pausedUntil(after,io.now());
      if(paused)return{kind:'paused',until:paused};
      io.draw({screen:'rejected',attemptsLeft:attemptsLeft(after)});
      if(key===null)return{kind:'close'};
      return afterwards(keys);
    }
  }
}

/** The expired and rejected screens: «r» a new QR, «Esc» close. */
async function afterwards(keys:Keys):Promise<QrNext>{
  for(;;){
    const key=await keys.next();
    if(isKey(key,'r'))return{kind:'again'};
    if(key==='esc'||key===null)return{kind:'close'};
  }
}
