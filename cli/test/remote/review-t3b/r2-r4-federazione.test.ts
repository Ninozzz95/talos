/*
 * R2 — il FLUSSO non segue il proprietario. `chiama` sceglie il proprietario a OGNI operazione; `iscriviConRigiocata` lo sceglie UNA
 *      volta all'iscrizione e lo cambia solo se la finestra muore o va in `lag`. Se la chat passa da B all'ospite (B la toglie dallo
 *      schermo, l'affitto scade) il giro chiesto dal telefono gira nell'ospite e il flusso del telefono resta attaccato a B; e al
 *      contrario.
 * R3 — l'elenco delle chat CHIUSE si legge una volta sola (`if(!closedCache.length)`): una chat nata dopo l'avvio dell'ospite e poi
 *      chiusa (la finestra che la teneva si chiude) sparisce dall'elenco del telefono e `esiste` dice false.
 * R4 — `closedRow` mette sempre `interrotta:false`, anche per una riga dell'indice con `interrupted:true` (morta a metà giro): il
 *      Mobile vuole `interrotta:true` proprio lì («Da riprendere»).
 * R12 — `session.start` (POST /api/v1/sessions/custom) passa da SESSION_ROUTE: «custom» è preso per un id di sessione e caricato.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {fakeLocal,fakeWindows,fed,noTimer,register,setup} from './comune.ts';

test('R2a ROSSO: il telefono guarda X a schermo in B; B la toglie dallo schermo; il messaggio del telefono gira nell\'ospite, il flusso resta su B',async()=>{
  const s=setup();const w=fakeWindows();const b=w.add('wB');b.attached=['X'];register(s.dir,'wB',4242);const l=fakeLocal(s.sessionsRoot);
  const f=fed.createFederation({local:l.local,dataRoot:s.dir,selfId:'me',connect:w.connect,alive:()=>true,leaseHolder:()=>null,setInterval:noTimer,clearInterval:()=>{}});
  try{
    await f.refresh();
    const got:any[]=[];
    const off=f.iscriviConRigiocata({sessionRegistry:null,sessionId:'X',daSequenza:0,manda:(e:any)=>got.push(e)});
    await new Promise(r=>setImmediate(r));
    assert.equal(b.subs,1,'il flusso parte da B');
    b.attached=[];await f.refresh(); // B passa a un'altra chat; nessun affitto (fermo da più di 30 s)
    const r=await f.chiama({metodo:'POST',percorso:'/api/v1/sessions/X/resume',corpo:{testo:'dal telefono'}});
    console.log('R2a misura:',JSON.stringify({giroIn:r.dati.by,iscrizioniOspite:l.localSubs(),iscrizioniB:b.subs}));
    assert.equal(r.dati.by,'host','il giro gira nell\'ospite');
    assert.ok(l.localSubs()>0,'il flusso del telefono dovrebbe seguire la chat dove ora gira il giro (ospite): resta su B, che non riceve niente');
    off?.();
  }finally{f.close();s.done();}
});

test('R2b ROSSO: il telefono guarda X servita dall\'ospite; la persona la apre in B e il telefono manda un messaggio: gira in B, il flusso resta sull\'ospite',async()=>{
  const s=setup();const w=fakeWindows();const b=w.add('wB');register(s.dir,'wB',4242);const l=fakeLocal(s.sessionsRoot);
  const f=fed.createFederation({local:l.local,dataRoot:s.dir,selfId:'me',connect:w.connect,alive:()=>true,leaseHolder:()=>null,setInterval:noTimer,clearInterval:()=>{}});
  try{
    await f.refresh();
    const off=f.iscriviConRigiocata({sessionRegistry:null,sessionId:'Y',daSequenza:0,manda:()=>{}});
    for(let i=0;i<20&&l.localSubs()===0;i++)await new Promise(r=>setImmediate(r));
    assert.equal(l.localSubs(),1,'il flusso parte dall\'ospite');
    b.attached=['Y'];await f.refresh();
    const r=await f.chiama({metodo:'POST',percorso:'/api/v1/sessions/Y/resume',corpo:{testo:'dal telefono'}});
    console.log('R2b misura:',JSON.stringify({giroIn:r.dati.by,iscrizioniB:b.subs}));
    assert.equal(r.dati.by,'wB');
    assert.ok(b.subs>0,'il flusso del telefono dovrebbe passare a B, dove ora gira il giro');
    off?.();
  }finally{f.close();s.done();}
});

test('R3 ROSSO: una chat chiusa nata dopo l\'avvio dell\'ospite non compare mai nell\'elenco del telefono, ed `esiste` dice false',async()=>{
  const s=setup();const indice:any[]=[{id:'vecchia',sessionId:'vecchia',name:'Vecchia',startedAt:'2026-10-01T10:00:00.000Z',outcome:'completed',depth:0,parentId:null}];
  let letture=0;
  const l=fakeLocal(s.sessionsRoot,{listAll:async()=>{letture++;return[...indice];}});
  const f=fed.createFederation({local:l.local,dataRoot:s.dir,selfId:'me',alive:()=>true,leaseHolder:()=>null,setInterval:noTimer,clearInterval:()=>{}});
  try{
    await f.refresh();await new Promise(r=>setTimeout(r,20));
    /* una finestra apre «nuova», ci lavora e si chiude: ora è solo nell'indice */
    indice.push({id:'nuova',sessionId:'nuova',name:'Nuova',startedAt:'2026-10-26T19:00:00.000Z',outcome:'completed',depth:0,parentId:null});
    const elenco=await f.chiama({metodo:'GET',percorso:'/api/v1/sessions'});
    const ids=elenco.dati.items.map((r:any)=>r.sessionId);
    console.log('R3 misura:',JSON.stringify({ids,letture,esisteNuova:f.sessionRegistry.esiste('nuova')}));
    assert.ok(ids.includes('nuova'),'la chat chiusa dopo l\'avvio deve stare nell\'elenco');
    assert.equal(f.sessionRegistry.esiste('nuova'),true);
  }finally{f.close();s.done();}
});

test('R4 ROSSO: una riga dell\'indice morta a metà giro (`interrupted:true`) esce `interrotta:false`',()=>{
  const row=fed.closedRow({id:'m',sessionId:'m',name:'Morta',startedAt:'2026-10-26T10:00:00.000Z',updatedAt:'2026-10-26T10:05:00.000Z',endedAt:null,outcome:'unknown',interrupted:true,depth:0,parentId:null});
  console.log('R4 misura:',JSON.stringify(row));
  assert.equal(row.interrotta,true);
});

test('R12 misura: session.start (POST /api/v1/sessions/custom) fa caricare «custom» come se fosse una chat',async()=>{
  const s=setup();const l=fakeLocal(s.sessionsRoot);
  const f=fed.createFederation({local:l.local,dataRoot:s.dir,selfId:'me',alive:()=>true,leaseHolder:()=>null,setInterval:noTimer,clearInterval:()=>{}});
  try{
    await f.chiama({metodo:'POST',percorso:'/api/v1/sessions/custom',corpo:{}});
    console.log('R12 misura:',JSON.stringify({caricate:l.ensured}));
    assert.deepEqual(l.ensured,[],'custom non è una chat');
  }finally{f.close();s.done();}
});
