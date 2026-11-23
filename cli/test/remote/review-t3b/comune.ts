/*
 * Revisione avversaria T3b (26/10/2026): attrezzi comuni alle prove rosse. Importa i sorgenti della CLI e del motore per percorso
 * assoluto (nessuna copia: si prova il codice del commit 0539ced55 com'è sul disco, sha256 annotati in sha256-sorgenti-inizio.txt).
 */
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

/* ported into the CLI (0.6.15, cures of the T3b review): the repository root, relative to this file */
export const url=(rel:string)=>new URL(`../../../../${rel}`,import.meta.url).href;

export const fed=await import(url('cli/src/remote/federation.ts'));
export const chan=await import(url('cli/src/remote/window-channel.ts'));

export const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
export const START='2026-10-26T18:00:00.000Z';

export function setup(){
  const dir=mkdtempSync(join(tmpdir(),'rev-t3b-'));const sessionsRoot=join(dir,'sessions');mkdirSync(join(sessionsRoot,'.affitti'),{recursive:true});
  mkdirSync(chan.windowsFolder(dir),{recursive:true});
  return{dir,sessionsRoot,done:()=>rmSync(dir,{recursive:true,force:true})};
}
export function register(dir:string,id:string,pid:number,label='other'){
  const r={v:1,id,pid,startedAt:START,label,channel:`\\\\.\\pipe\\fake-${id}`,token:'t'};
  writeFileSync(join(chan.windowsFolder(dir),`${id}.json`),JSON.stringify(r));return r;
}
export type FakeWindow={rows:any[];attached:string[];calls:any[];emit:(e:any)=>void;end:(r:any)=>void;froms:number[];subs:number;unsubs:number;kill:()=>void};
/* finestre finte dietro file di registrazione veri (stessa forma dell'attrezzo di federation.test.ts) */
export function fakeWindows(){
  const windows=new Map<string,FakeWindow>();
  const connect=async(registration:any)=>{
    const w=windows.get(registration.id);if(!w)throw Object.assign(new Error('no'),{code:'WINDOW_UNREACHABLE'});
    let closed=false;const closeListeners:Array<()=>void>=[];const ends:Array<(r:any)=>void>=[];
    w.kill=()=>{closed=true;for(const end of ends)end({gone:true});for(const l of closeListeners)l();};
    return{
      identity:{id:registration.id,pid:registration.pid,startedAt:registration.startedAt,label:registration.label},
      async request(op:string,args?:any){
        if(closed)throw Object.assign(new Error('gone'),{code:'WINDOW_GONE'});
        if(op==='attached')return w.attached as any;
        w.calls.push(args);
        if(args?.percorso==='/api/v1/sessions')return{stato:200,dati:{items:w.rows}} as any;
        return{stato:200,dati:{by:registration.id,percorso:args?.percorso}} as any;
      },
      subscribe(_sessionId:string,from:number,onEvent:(e:unknown)=>void,onEnd:(r:any)=>void){w.subs++;w.froms.push(from);w.emit=onEvent;w.end=onEnd;ends.push(onEnd);return()=>{w.unsubs++;};},
      onClose(l:()=>void){closeListeners.push(l);},
      close(){closed=true;},
      get closed(){return closed;},
    };
  };
  const add=(id:string)=>{const w:FakeWindow={rows:[],attached:[],calls:[],emit:()=>{},end:()=>{},froms:[],subs:0,unsubs:0,kill:()=>{}};windows.set(id,w);return w;};
  return{connect,add};
}
/* l'ospite finto: un registro con le sessioni caricate, `cartellaPerChatFile` come il motore (NOT_FOUND per una sessione non in memoria) */
export function fakeLocal(sessionsRoot:string,over:any={}){
  const loaded=new Set<string>(['local-1']);const calls:any[]=[];const ensured:string[]=[];let localEmit:((e:any)=>void)|null=null;let localFrom=-1;let localSubs=0;
  const local:any={
    sessionsRoot,
    registry:{
      esiste:(id:string)=>loaded.has(id),elenca:()=>[...loaded].map(sessionId=>({sessionId})),iscriviti:()=>()=>{},
      cartellaPerChatFile:async(id:string)=>loaded.has(id)?{ok:true,cartella:'C:\\progetti\\negozio'}:{ok:false,code:'NOT_FOUND',reason:'session-not-found'},
    },
    call:async(request:any)=>{calls.push(request);if(request.percorso==='/api/v1/sessions')return{stato:200,dati:{items:[...loaded].map(sessionId=>({sessionId,nome:'local'}))}};return{stato:200,dati:{by:'host',percorso:request.percorso}};},
    subscribeWithReplay:({daSequenza,manda}:any)=>{localSubs++;localFrom=daSequenza??0;localEmit=manda;return()=>{};},
    ensureLoaded:async(id:string)=>{ensured.push(id);loaded.add(id);return true;},
    listAll:async()=>[],
    ...over,
  };
  return{local,calls,ensured,loaded,emitLocal:(e:any)=>localEmit?.(e),localFrom:()=>localFrom,localSubs:()=>localSubs};
}
export const noTimer=()=>0 as any;
