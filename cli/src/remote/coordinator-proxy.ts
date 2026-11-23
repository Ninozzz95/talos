/*
 * 0.6.15 T4: `talos remote` in a terminal while a TALOS window hosts remote control uses THAT window's coordinator, over the
 * window's local channel (coordinator-service.ts). The window is found by the host lease (`<data>/remote/host.json`: the holder's
 * pid and token) and the windows' registrations (window-channel.ts); `connectWindow` proves it is that window (handshake plus
 * `identify`). Every call names the lease token read here: a window that no longer holds that lease refuses (REMOTE_NOT_HOST).
 * Timeouts (T4 research §5.9): 10 s to read or close, 30 s to change something; a change that times out is «outcome unknown»,
 * never repeated on its own (the caller reads the state again).
 */
import {createHostLease,type HostLease} from '../automations/host-lease.ts';
import type {FullCoordinator} from './coordinator-service.ts';
import {remotePaths} from './host.ts';
import {connectWindow,readRegistrations,type WindowClient,type WindowRegistration} from './window-channel.ts';

export const READ_MS=10_000,CHANGE_MS=30_000;
const CHANGES=new Set(['imposta','apriAccoppiamento','conferma','revoca','rinomina','cartelle.consentiInAnticipo','cartelle.revoca','cartelle.sblocca','file.registraOfferta']);
const fail=(code:string,message:string)=>Object.assign(new Error(message),{code});

/** The lease on the disk (null when nobody holds it), read without taking it. */
export function readHostLease(dataRoot:string,leaseFile:string):HostLease|null{
  return createHostLease({dir:remotePaths(dataRoot).dir,role:'run',fileName:leaseFile}).holder();
}

/** The coordinator of `client`'s window, by proxy, under the lease token `token`. */
export function proxyCoordinator(client:WindowClient,token:string):FullCoordinator{
  const call=async(method:string,args:unknown[]):Promise<any>=>{
    try{return await client.request('coordinator',{method,args,token},CHANGES.has(method)?CHANGE_MS:READ_MS);}
    catch(error:any){
      if(error?.code==='WINDOW_TIMEOUT'&&CHANGES.has(method))throw Object.assign(fail('REMOTE_OUTCOME_UNKNOWN','The window that hosts remote control did not answer in time: it may or may not have done it.'),{method});
      /* review 6: a window of an older TALOS (before T4) hosts and does not know the operation */
      if(error?.code==='WINDOW_UNKNOWN_OPERATION')throw fail('REMOTE_HOST_OUTDATED','The TALOS window that hosts remote control is an older version.');
      throw error;
    }
  };
  return{
    stato:()=>call('stato',[]),
    imposta:(input)=>call('imposta',[input]),
    apriAccoppiamento:(options)=>call('apriAccoppiamento',options===undefined?[]:[options]),
    /* the flow does not wait for it: a refusal (the window closed) must not become an unhandled rejection (research §5.6) */
    chiudiAccoppiamento(gettone){void call('chiudiAccoppiamento',[gettone]).catch(()=>{});},
    conferma:(id)=>call('conferma',[id]),
    rifiuta:(id)=>call('rifiuta',[id]),
    revoca:(id)=>call('revoca',[id]),
    rinomina:(id,nome)=>call('rinomina',[id,nome]),
    /* T6: the model's tools in a window that does not host (coordinator-service.ts NESTED_METHODS) */
    cartelle:{
      consensiDi:(id)=>call('cartelle.consensiDi',[id]),
      verifica:(percorso,id)=>call('cartelle.verifica',id===undefined?[percorso]:[percorso,id]),
      consentiInAnticipo:(id,percorso,options)=>call('cartelle.consentiInAnticipo',options===undefined?[id,percorso]:[id,percorso,options]),
      consensoDi:(id,cartellaOPercorso)=>call('cartelle.consensoDi',[id,cartellaOPercorso]),
      revoca:(id,cartellaId)=>call('cartelle.revoca',[id,cartellaId]),
      sblocca:(id,cartellaId)=>call('cartelle.sblocca',[id,cartellaId]),
    },
    file:{
      esaminaOfferta:(input)=>call('file.esaminaOfferta',[input]),
      registraOfferta:(input)=>call('file.registraOfferta',[input]),
    },
  };
}

/**
 * The window that holds the host lease `holder`, connected: its registrations with the holder's pid are tried in turn, and only one
 * that proves itself answers. Null when none answers (a window still starting, or gone without its registration).
 */
export async function connectHostWindow(dataRoot:string,holder:HostLease,connect:(r:WindowRegistration)=>Promise<WindowClient>=connectWindow):Promise<WindowClient|null>{
  for(const registration of readRegistrations(dataRoot).filter(r=>r.pid===holder.pid)){
    try{return await connect(registration);}catch{/* the next one, if any */}
  }
  return null;
}
