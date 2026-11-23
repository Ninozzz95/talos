/*
 * R10 — misura: il gettone non passa mai sul filo. Un proxy fra connectWindow (vero) e la finestra (vera) registra i byte nei due
 *       versi; si cercano il gettone in base64url e i suoi 32 byte grezzi.
 * R11 — `elenca` del registro federato (lo legge la SVEGLIA, sveglia.mjs `giro()`): la riga dell'OSPITE vince sempre su quella della
 *       finestra proprietaria. Con una copia vecchia nell'ospite (caricata da `listAll`/`restore`, o da un'operazione di prima) la sveglia
 *       non vede l'attesa di approvazione che la finestra B ha davvero ⇒ nessuna notifica al telefono. `mergedList` invece fa vincere il
 *       proprietario: le due viste non coincidono.
 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createConnection,createServer} from 'node:net';
import {join} from 'node:path';
import test from 'node:test';
import {chan,fakeLocal,fakeWindows,fed,noTimer,register,setup,sleep} from './comune.ts';

test('R10 misura: il gettone non compare nei byte del filo (proxy in mezzo)',async()=>{
  const s=setup();
  const w=await chan.openWindowChannel({dataRoot:s.dir,label:'B',handlers:{attached:()=>['X'],call:async(r:any)=>({stato:200,dati:{eco:r.percorso}}),subscribe:()=>()=>{}}});
  const [reg]=chan.readRegistrations(s.dir);
  const proxyPipe=`\\\\.\\pipe\\rev-t3b-proxy-${process.pid}-${Date.now()}`;
  const filo:Buffer[]=[];
  const proxy=createServer(lato=>{const vero=createConnection(reg.channel);lato.on('data',b=>{filo.push(b);vero.write(b);});vero.on('data',b=>{filo.push(b);lato.write(b);});lato.on('close',()=>vero.destroy());vero.on('close',()=>lato.destroy());lato.on('error',()=>{});vero.on('error',()=>{});});
  await new Promise<void>(r=>proxy.listen(proxyPipe,()=>r()));
  try{
    const c=await chan.connectWindow({...reg,channel:proxyPipe});
    const r=await c.request('call',{metodo:'GET',percorso:'/x'});
    c.close();await sleep(50);
    const tutto=Buffer.concat(filo);const grezzo=Buffer.from(reg.token,'base64url');
    const trovato={base64url:tutto.includes(Buffer.from(reg.token)),grezzo:tutto.indexOf(grezzo)>=0};
    console.log('R10 misura:',JSON.stringify({byte:tutto.length,risposta:r,trovato}));
    assert.equal(trovato.base64url,false);assert.equal(trovato.grezzo,false);
  }finally{proxy.close();await w.close();s.done();}
});

test('R11 ROSSO: elenca (la sveglia) dà la riga vecchia dell\'ospite invece di quella della finestra che ha la chat',async()=>{
  const s=setup();const w=fakeWindows();const b=w.add('wB');register(s.dir,'wB',4242);
  b.attached=['X'];b.rows=[{sessionId:'X',nome:'in B',inAttesaApprovazione:true,conclusa:false}];
  const l=fakeLocal(s.sessionsRoot);
  /* l'ospite ha una copia di X caricata prima (ferma, nessuna attesa) */
  l.local.registry.elenca=()=>[{sessionId:'X',nome:'copia vecchia',inAttesaApprovazione:false,conclusa:true}];
  const f=fed.createFederation({local:l.local,dataRoot:s.dir,selfId:'me',connect:w.connect,alive:()=>true,leaseHolder:()=>null,setInterval:noTimer,clearInterval:()=>{}});
  try{
    await f.refresh();
    const sveglia=f.sessionRegistry.elenca().find((r:any)=>r.sessionId==='X');
    console.log('R11 misura:',JSON.stringify({rigaVistaDallaSveglia:sveglia}));
    assert.equal(sveglia.inAttesaApprovazione,true,'la sveglia deve vedere l\'attesa che la finestra proprietaria ha davvero');
  }finally{f.close();s.done();}
});
