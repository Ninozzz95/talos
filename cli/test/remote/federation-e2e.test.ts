/*
 * 0.6.15 T3b end to end on REAL pipes: window B opens its channel (window-channel.ts) with B's own handlers; the host federates
 * (federation.ts, the real connectWindow). A device's message on the conversation B has on screen runs in B; its events come back
 * through the host; the list holds B's row; B closing ends the stream and the next operation is served by the host.
 */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createFederation,type FederationLocal} from '../../src/remote/federation.ts';
import {openWindowChannel} from '../../src/remote/window-channel.ts';

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

test('T3b end to end: the host hands B\'s conversation to B over the pipe, events come back, B closing hands it to the host',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'talos-fed-e2e-'));const sessionsRoot=join(dir,'sessions');mkdirSync(sessionsRoot,{recursive:true});
  const inB:any[]=[];let emitB:((e:any)=>void)|null=null;
  const b=await openWindowChannel({dataRoot:dir,label:'shop-api',handlers:{
    attached:()=>['s-b'],
    call:async(request)=>{inB.push(request);if(request.percorso==='/api/v1/sessions')return{stato:200,dati:{items:[{sessionId:'s-b',nome:'in B',progetto:'shop-api'}]}};return{stato:200,dati:{ranIn:'B'}};},
    subscribe:(_id,_from,on)=>{emitB=on;return()=>{emitB=null;};},
  }});
  const inHost:any[]=[];let hostFrom=-1;
  const local:FederationLocal={sessionsRoot,
    registry:{esiste:()=>false,elenca:()=>[],iscriviti:()=>()=>{}},
    call:async(request)=>{inHost.push(request);if(request.percorso==='/api/v1/sessions')return{stato:200,dati:{items:[]}};return{stato:200,dati:{ranIn:'host'}};},
    subscribeWithReplay:({daSequenza})=>{hostFrom=daSequenza??0;return()=>{};},
    ensureLoaded:async()=>true,listAll:async()=>[],
  };
  const fed=createFederation({local,dataRoot:dir,selfId:'host-window',leaseHolder:()=>null,setInterval:(()=>0) as any,clearInterval:()=>{}});
  try{
    await fed.refresh();
    assert.deepEqual(fed.peers().map(p=>[p.label,p.connected,p.attached]),[['shop-api',true,['s-b']]]);
    assert.deepEqual(await fed.chiama({metodo:'POST',percorso:'/api/v1/sessions/s-b/resume',corpo:{testo:'from the phone'}}),{stato:200,dati:{ranIn:'B'}});
    assert.deepEqual(inB.at(-1).corpo,{testo:'from the phone'});
    /* blocked folders round 2 (Desktop, 27/10): the device's identity reaches the owning window too — its kernel sets
       req[ORIGINE_REMOTA] from it (chiamata-interna.mjs), so a turn run there knows it came from that device */
    await fed.chiama({metodo:'POST',percorso:'/api/v1/sessions/s-b/resume',corpo:{testo:'again'},origine:'telefono:p1',origineRemota:{dispositivoId:'p1',nome:'Pad'}} as any);
    assert.deepEqual([inB.at(-1).origine,inB.at(-1).origineRemota],['telefono:p1',{dispositivoId:'p1',nome:'Pad'}]);
    assert.equal(inHost.filter(r=>r.percorso.includes('s-b')).length,0);
    const list=await fed.chiama({metodo:'GET',percorso:'/api/v1/sessions'});
    assert.deepEqual(list.dati.items.map((r:any)=>[r.sessionId,r.nome]),[['s-b','in B']]);
    const got:any[]=[];
    const off=fed.iscriviConRigiocata({sessionRegistry:null,sessionId:'s-b',daSequenza:0,manda:e=>got.push(e)});
    for(let i=0;i<100&&!emitB;i++)await sleep(10);
    emitB!({_sequenza:1,type:'TextMessageContent',delta:'hi'});emitB!({type:'CUSTOM',name:'talos.fine-rigiocata',value:null});
    for(let i=0;i<100&&got.length<2;i++)await sleep(10);
    assert.deepEqual(got.map(e=>e.type),['TextMessageContent','CUSTOM']);
    await b.close();
    for(let i=0;i<100&&hostFrom<0;i++)await sleep(10);
    assert.equal(hostFrom,1,'B gone: the host goes on from the last sequence');
    await fed.refresh();
    assert.deepEqual(await fed.chiama({metodo:'POST',percorso:'/api/v1/sessions/s-b/resume',corpo:{}}),{stato:200,dati:{ranIn:'host'}},'B closed: the host serves it');
    off?.();
  }finally{fed.close();await b.close();rmSync(dir,{recursive:true,force:true});}
});
