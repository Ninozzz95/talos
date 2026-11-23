/*
 * Prove su PIPE VERE (window-channel.ts reale, connectWindow reale).
 * R5 — `lag` durante la rigiocata SINCRONA: il `subscribe` della finestra chiama `onEvent` dentro `handlers.subscribe(...)`, prima di
 *      `subscriptions.set(sub, …)`. Al superamento del backlog `subscriptions.get(sub)?.()` non trova niente: l'iscrizione del motore
 *      resta viva (l'ascoltatore resta in `voce.ascoltatori`) finché la connessione dell'ospite non si chiude. L'ospite si iscrive di
 *      nuovo da `last` a ogni `lag` (federation.ts) e il cliente non manda `unsub` per un'iscrizione chiusa da `lag` ⇒ uno in più per giro.
 * R6 — misura: elenco con una finestra appesa (pipe che accetta e non risponde mai) e un indice lento.
 * R7 — misura: 100 aperture e chiusure del canale: registrazioni orfane, maniglie.
 * R8 — misura: un cliente che non scrive non riceve niente; una lunghezza enorme prima della stretta chiude subito.
 * R9 — misura: passaggio B → ospite col VERO `iscriviConRigiocata` del motore da entrambe le parti: quante `talos.fine-rigiocata`.
 */
import assert from 'node:assert/strict';
import {readdirSync,writeFileSync} from 'node:fs';
import {createConnection,createServer} from 'node:net';
import {join} from 'node:path';
import test from 'node:test';
import {chan,fed,fakeLocal,setup,sleep,url} from './comune.ts';

const frame=await import(url('cli/src/remote/window-frame.ts'));
const iscr=await import(url('harness-ui/src/iscrizione-sessione.mjs'));

test('R5 ROSSO: lag durante la rigiocata sincrona ⇒ l\'iscrizione della finestra non si chiude finché resta la connessione',async()=>{
  const s=setup();
  const vivi=new Set<number>();let n=0;
  const window=await chan.openWindowChannel({dataRoot:s.dir,label:'B',backlogBytes:64*1024,handlers:{
    attached:()=>['X'],call:async()=>({stato:200,dati:null}),
    subscribe:(_id:string,from:number,onEvent:(e:unknown)=>void)=>{
      const me=++n;vivi.add(me);
      for(let i=from+1;i<=from+200;i++)onEvent({_sequenza:i,type:'TextMessageContent',messageId:'m',delta:'x'.repeat(4096)}); // ~800 KiB, sincrono
      return()=>{vivi.delete(me);};
    },
  }});
  const [registration]=chan.readRegistrations(s.dir);
  const client=await chan.connectWindow(registration);
  try{
    /* come federation.ts: a ogni lag ci si iscrive di nuovo dall'ultima sequenza ricevuta */
    let last=0;let lags=0;let clientSubs=0;
    await new Promise<void>(done=>{
      const go=()=>{clientSubs++;client.subscribe('X',last,(e:any)=>{if(Number.isInteger(e?._sequenza))last=e._sequenza;},(r:any)=>{if(r.lag!==undefined){lags++;if(lags<3)go();else done();}});};
      go();
      setTimeout(done,5000);
    });
    await sleep(100);
    console.log('R5 misura:',JSON.stringify({lags,ultimaSequenza:last,iscrizioniDelCliente:clientSubs,ascoltatoriVivi:vivi.size}));
    assert.ok(lags>=1,'il lag deve scattare (backlog 64 KiB, 800 KiB in rigiocata)');
    assert.equal(vivi.size,0,'ogni iscrizione chiusa da lag deve aver tolto il suo ascoltatore dal motore');
  }finally{
    client.close();await sleep(100);
    console.log('R5 misura dopo la chiusura della connessione:',JSON.stringify({ascoltatoriVivi:vivi.size}));
    await window.close();s.done();
  }
});

test('R6 misura: elenco con una finestra appesa (accetta e non risponde) e un indice che non risponde: sotto i 10 s?',async()=>{
  const s=setup();
  const pipe=`\\\\.\\pipe\\rev-t3b-appesa-${process.pid}-${Date.now()}`;
  const sockets:any[]=[];const hung=createServer(sock=>{sockets.push(sock);/* mai una risposta */});
  await new Promise<void>(r=>hung.listen(pipe,()=>r()));
  writeFileSync(join(chan.windowsFolder(s.dir),'appesa.json'),JSON.stringify({v:1,id:'appesa',pid:process.pid,startedAt:'2026-10-26T18:00:00.000Z',label:'appesa',channel:pipe,token:'AAAA'}));
  const l=fakeLocal(s.sessionsRoot,{listAll:()=>new Promise(()=>{})});
  const f=fed.createFederation({local:l.local,dataRoot:s.dir,selfId:'me',alive:()=>true,leaseHolder:()=>null,setInterval:()=>0 as any,clearInterval:()=>{}});
  try{
    await sleep(3500); // il primo giro di federation (avvio) finisce
    const t0=Date.now();
    const r=await f.chiama({metodo:'GET',percorso:'/api/v1/sessions'});
    const ms=Date.now()-t0;
    console.log('R6 misura:',JSON.stringify({ms,righe:r.dati.items.length,registrazioneRimasta:readdirSync(chan.windowsFolder(s.dir))}));
    assert.ok(ms<10_000);
  }finally{f.close();for(const x of sockets)x.destroy();hung.close();s.done();}
});

test('R7 misura: 100 aperture e chiusure del canale, con un cliente collegato ogni volta',async()=>{
  const s=setup();
  const handlesPrima=(process as any)._getActiveHandles().length;
  for(let i=0;i<100;i++){
    const w=await chan.openWindowChannel({dataRoot:s.dir,label:'B',handlers:{attached:()=>[],call:async()=>({stato:200,dati:null}),subscribe:()=>()=>{}}});
    const [reg]=chan.readRegistrations(s.dir);
    const c=await chan.connectWindow(reg);
    await w.close();
    for(let k=0;k<50&&!c.closed;k++)await sleep(5);
  }
  await sleep(200);
  const handlesDopo=(process as any)._getActiveHandles().length;
  const rimaste=readdirSync(chan.windowsFolder(s.dir));
  console.log('R7 misura:',JSON.stringify({handlesPrima,handlesDopo,registrazioniRimaste:rimaste.length}));
  assert.equal(rimaste.length,0);
  assert.ok(handlesDopo<=handlesPrima+2);
  s.done();
});

test('R8 misura: niente scritto a chi non scrive; lunghezza enorme prima della stretta ⇒ chiusura senza allocare',async()=>{
  const s=setup();
  const w=await chan.openWindowChannel({dataRoot:s.dir,label:'B',handlers:{attached:()=>['segreto'],call:async()=>({stato:200,dati:null}),subscribe:()=>()=>{}}});
  try{
    const [reg]=chan.readRegistrations(s.dir);
    const muto=createConnection(reg.channel);let byteMuto=0;let chiusoMuto=-1;const t0=Date.now();
    muto.on('data',(b:Buffer)=>{byteMuto+=b.length;});muto.on('close',()=>{chiusoMuto=Date.now()-t0;});muto.on('error',()=>{});
    const grande=createConnection(reg.channel);let byteGrande=0;let chiusoGrande=-1;const t1=Date.now();
    grande.on('connect',()=>{const h=Buffer.alloc(4);h.writeUInt32BE(0x7fffffff,0);grande.write(h);});
    grande.on('data',(b:Buffer)=>{byteGrande+=b.length;});grande.on('close',()=>{chiusoGrande=Date.now()-t1;});grande.on('error',()=>{});
    /* un hello valido con una prova sbagliata: riceve solo la sfida, poi la chiusura */
    const finto=createConnection(reg.channel);const ricevuti:any[]=[];const r=frame.createFrameReader();
    finto.on('connect',()=>{finto.write(frame.encodeFrame({t:'hello',nc:Buffer.alloc(32,7).toString('base64url')}));});
    finto.on('data',(b:Buffer)=>{for(const f of r.push(b)){ricevuti.push(f.t);if(f.t==='challenge')finto.write(frame.encodeFrame({t:'proof',mc:Buffer.alloc(32,1).toString('base64url')}));}});
    finto.on('error',()=>{});
    /* -1 = not closed yet: a close within the same millisecond measures 0 ms, which a «>0» check took for «never» and waited 8 s */
    /* the silent client closes at the handshake's 2 s; under a loaded suite the close can land after a fixed 2.6 s wait (seen at
       three workers): wait for the closes, at most 8 s, the property is the same */
    for(let waited=0;waited<8000&&!(chiusoMuto>=0&&chiusoGrande>=0&&ricevuti.length>0);waited+=50)await sleep(50);
    await sleep(100);
    console.log('R8 misura:',JSON.stringify({byteMuto,chiusoMutoMs:chiusoMuto,byteGrande,chiusoGrandeMs:chiusoGrande,fintoRicevuti:ricevuti}));
    assert.equal(byteMuto,0);assert.ok(chiusoMuto>=0,'the silent client was closed');assert.equal(byteGrande,0);assert.ok(chiusoGrande>=0&&chiusoGrande<1000,'the huge length was closed at once');
    assert.deepEqual(ricevuti,['challenge']);
  }finally{await w.close();s.done();}
});

test('R9 misura: B muore a metà flusso, l\'ospite riprende col vero iscriviConRigiocata: fine-rigiocata e sequenze',async()=>{
  const s=setup();
  /* B: registro finto con gli eventi 1..5 in memoria, il vero iscriviConRigiocata */
  const eventiB=[1,2,3,4,5].map(i=>({_sequenza:i,type:'TextMessageContent',messageId:'m',delta:`b${i}`}));
  const registroB={iscriviti:(_id:string,l:(e:any)=>void,da=0)=>{for(const e of eventiB)if(e._sequenza>da)l(e);return()=>{};},statoCoda:()=>({voci:[],inPausa:false}),statoObiettivo:()=>({obiettivo:null})};
  const b=await chan.openWindowChannel({dataRoot:s.dir,label:'B',handlers:{attached:()=>['X'],call:async()=>({stato:200,dati:{items:[]}}),
    subscribe:(id:string,from:number,on:(e:unknown)=>void)=>iscr.iscriviConRigiocata({sessionRegistry:registroB,sessionId:id,daSequenza:from,manda:on})}});
  /* l'ospite: dal disco solo 1..3 (4 e 5 non scritti quando B è morto), poi un giro nuovo nell'ospite: 4, 5, 6 */
  const eventiOspite=[1,2,3].map(i=>({_sequenza:i,type:'TextMessageContent',messageId:'m',delta:`d${i}`}));
  const ascoltatori=new Set<(e:any)=>void>();
  const registroOspite={esiste:()=>true,iscriviti:(_id:string,l:(e:any)=>void,da=0)=>{for(const e of eventiOspite)if(e._sequenza>da)l(e);ascoltatori.add(l);return()=>ascoltatori.delete(l);},statoCoda:()=>({voci:[],inPausa:false}),statoObiettivo:()=>({obiettivo:null})};
  const l=fakeLocal(s.sessionsRoot,{registry:registroOspite,subscribeWithReplay:(x:any)=>iscr.iscriviConRigiocata({...x,sessionRegistry:registroOspite})});
  const f=fed.createFederation({local:l.local,dataRoot:s.dir,selfId:'me',leaseHolder:()=>null,setInterval:()=>0 as any,clearInterval:()=>{}});
  try{
    await f.refresh();
    const got:any[]=[];
    const off=f.iscriviConRigiocata({sessionRegistry:null,sessionId:'X',daSequenza:0,manda:(e:any)=>got.push(e)});
    for(let i=0;i<100&&got.length<8;i++)await sleep(10);
    await b.close();
    for(let i=0;i<100&&ascoltatori.size===0;i++)await sleep(10);
    for(const i of [4,5,6]){const e={_sequenza:i,type:'TextMessageContent',messageId:'m2',delta:`ospite${i}`};for(const a of ascoltatori)a(e);}
    const fini=got.filter(e=>e?.name==='talos.fine-rigiocata').length;
    const seq=got.filter(e=>Number.isInteger(e?._sequenza)).map(e=>`${e._sequenza}:${e.delta}`);
    console.log('R9 misura:',JSON.stringify({fineRigiocata:fini,coda:got.filter(e=>e?.name==='talos.coda').length,sequenze:seq}));
    off?.();
  }finally{f.close();await b.close();s.done();}
});
