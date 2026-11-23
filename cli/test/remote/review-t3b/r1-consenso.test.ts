/*
 * R1 — CONSENSO SALTATO. Il modulo remoto del motore (operazioni.mjs, codice VERO) controlla il consenso della cartella prima di ogni
 * scrittura (`richiedeConsenso`): chiede `sessionRegistry.cartellaPerChatFile(id)` e, se non trova una cartella, LASCIA PASSARE
 * (`if (!cartella || ...) return;`). Il cancello vero di http-app (R5.12) nella CLI è spento: `cliHttpDeps` non passa `remotoFn`.
 * Con T3b il registro federato inoltra `cartellaPerChatFile` al SOLO registro dell'ospite: per una chat della finestra B, o per una
 * chat dell'archivio non ancora caricata nell'ospite, la risposta è NOT_FOUND ⇒ nessuna cartella ⇒ nessun consenso chiesto ⇒ la
 * scrittura parte (inoltrata a B, o caricata ed eseguita nell'ospite).
 * Controllo: la stessa scrittura su una chat già in memoria nell'ospite dice CONSENT_REQUIRED (il consenso funziona lì).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {fakeLocal,fakeWindows,fed,noTimer,register,setup,url} from './comune.ts';

const ops=await import(url('harness-ui/src/remoto/operazioni.mjs'));

function harness(){
  const s=setup();const w=fakeWindows();const b=w.add('wB');b.attached=['s-in-B'];register(s.dir,'wB',4242);
  /* ported: the host's device folders reach the federation as in the real host (host.ts `consent`) */
  const cartelleDelOspite:{consentita:(d:string,c:string)=>Promise<boolean>}={consentita:async(d,c)=>(cartelle as any).consentita(d,c)};
  const l=fakeLocal(s.sessionsRoot,{consent:()=>cartelleDelOspite});
  const federation=fed.createFederation({local:l.local,dataRoot:s.dir,selfId:'me',connect:w.connect,alive:()=>true,leaseHolder:()=>null,setInterval:noTimer,clearInterval:()=>{}});
  /* nessun consenso dato a nessuno: ogni scrittura deve dire CONSENT_REQUIRED */
  const consentiteChieste:string[]=[];
  const cartelle={consentita:async(_d:string,c:string)=>{consentiteChieste.push(c);return false;},descrivi:async(c:string)=>({cartellaId:'f-1',nome:c}),elenco:async()=>[]};
  const operazioni=ops.creaOperazioni({chiama:federation.chiama,sessionRegistry:federation.sessionRegistry,iscriviConRigiocata:federation.iscriviConRigiocata,cartelle,file:null});
  const contesto={dispositivo:{id:'dev-1',nome:'Telefono'},iscrizioni:new Map(),iscrivi:()=>()=>{}};
  return{s,b,l,federation,operazioni,contesto,consentiteChieste};
}

test('R1 controllo: chat in memoria nell\'ospite, nessun consenso ⇒ CONSENT_REQUIRED e la rotta non parte',async()=>{
  const h=harness();
  try{
    await h.federation.refresh();
    await assert.rejects(h.operazioni.esegui('session.send',{sessionId:'local-1',testo:'ciao'},h.contesto),{code:'CONSENT_REQUIRED'});
    assert.equal(h.l.calls.filter((c:any)=>c.percorso.includes('local-1')).length,0);
  }finally{h.federation.close();h.s.done();}
});

test('R1a ROSSO: chat a schermo nella finestra B, nessun consenso ⇒ deve dire CONSENT_REQUIRED, invece il messaggio arriva a B',async()=>{
  const h=harness();
  try{
    await h.federation.refresh();
    let esito:any;let errore:any=null;
    try{esito=await h.operazioni.esegui('session.send',{sessionId:'s-in-B',testo:'scrivi in una cartella non consentita'},h.contesto);}catch(e){errore=e;}
    const arrivatiAB=h.b.calls.filter((c:any)=>c?.percorso==='/api/v1/sessions/s-in-B/resume');
    console.log('R1a misura:',JSON.stringify({errore:errore?.code??null,esito,arrivatiAB:arrivatiAB.length,consentitaChiesta:h.consentiteChieste.length}));
    assert.equal(errore?.code,'CONSENT_REQUIRED','la scrittura senza consenso deve essere rifiutata');
    assert.equal(arrivatiAB.length,0,'e non deve arrivare alla finestra B');
  }finally{h.federation.close();h.s.done();}
});

test('R1b ROSSO: chat dell\'archivio non ancora in memoria nell\'ospite ⇒ caricata ed eseguita senza consenso',async()=>{
  const h=harness();
  try{
    await h.federation.refresh();
    let errore:any=null;
    try{await h.operazioni.esegui('session.send',{sessionId:'s-archivio',testo:'ciao'},h.contesto);}catch(e){errore=e;}
    const eseguite=h.l.calls.filter((c:any)=>c.percorso==='/api/v1/sessions/s-archivio/resume');
    console.log('R1b misura:',JSON.stringify({errore:errore?.code??null,caricate:h.l.ensured,eseguiteNellOspite:eseguite.length}));
    assert.equal(errore?.code,'CONSENT_REQUIRED');
    assert.equal(eseguite.length,0);
  }finally{h.federation.close();h.s.done();}
});
