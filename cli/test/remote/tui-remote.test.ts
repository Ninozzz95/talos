/*
 * 0.6.15 remote control in the TUI (owner 26/10/2026: «Finché TALOS è aperto», several windows «la proposta completa»): one window
 * hosts, chosen by the lease <data>/remote/host.json; the others say which window hosts and take over when it closes. Two windows
 * here are two bridges on the same real lease file (two process numbers, both alive). Remote turned off: nothing is loaded.
 * The consent card's answer reaches the kernel's `rispondi` and nothing else; a host that fails to start gives the lease back; a
 * start slower than a beat never reports its own lease as «another window».
 */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createHostLease} from '../../src/automations/host-lease.ts';
import {remotePaths} from '../../src/remote/host.ts';
import {REMOTE_HOST_LEASE,createTuiRemote,remoteTurnedOn} from '../../src/remote/tui-remote.ts';

function dir(t:{after:(fn:()=>void)=>void}){const d=mkdtempSync(join(tmpdir(),'talos-tui-remote-'));t.after(()=>rmSync(d,{recursive:true,force:true}));return d;}
function fakeHost(log:string[],name:string,over:any={}){
  const answers:any[]=[];
  return{answers,host:{
    remote:{
      riprendi:async()=>{log.push(`${name}:on`);},
      stato:async()=>({inLinea:['p1'],telefoni:[{id:'p1',nome:'Pad di Nino'},{id:'p2',nome:'Off'}],consensi:over.consensi??[]}),
      ascoltaStato:()=>()=>{},
      cartelle:{ascolta:()=>()=>{},rispondi:async(id:string,esito:string)=>{answers.push([id,esito]);}},
      ...over.remote,
    },
    call:async()=>({stato:200,dati:{}}),
    stop:async()=>{log.push(`${name}:off`);},
  }};
}
/* no real timers: the test beats by hand */
const manual={setInterval:()=>({unref(){}}),clearInterval:()=>{}};

test('remote turned off: nothing is created, the state is off; the settings file decides',async t=>{
  const data=dir(t);
  let created=0;
  const r=createTuiRemote({dataRoot:data,label:'site',createHost:async()=>{created++;return fakeHost([],'A').host as any;},turnedOn:()=>false,...manual});
  await r.start();
  assert.equal(r.getSnapshot().state,'off');
  assert.equal(created,0);
  assert.equal(remoteTurnedOn(data,()=>JSON.stringify({acceso:true,relay:{modo:'n0'}})),true);
  assert.equal(remoteTurnedOn(data,()=>JSON.stringify({acceso:true})),false,'on without a relay is not on');
  assert.equal(remoteTurnedOn(data,()=>{throw new Error('ENOENT');}),false);
  await r.stop();
});

test('two windows: the first hosts and shows the online phone; the second says which window hosts; closing the first hands over',async t=>{
  const data=dir(t);const log:string[]=[];
  const leaseOf=(pid:number,label:string)=>createHostLease({dir:remotePaths(data).dir,role:'serve',fileName:REMOTE_HOST_LEASE,label,pid,isAlive:()=>true});
  const a=createTuiRemote({dataRoot:data,label:'site',lease:leaseOf(101,'site'),createHost:async()=>fakeHost(log,'A').host as any,turnedOn:()=>true,...manual});
  const b=createTuiRemote({dataRoot:data,label:'api',lease:leaseOf(202,'api'),createHost:async()=>fakeHost(log,'B').host as any,turnedOn:()=>true,...manual});
  await a.start();await b.start();
  assert.equal(a.getSnapshot().state,'host');
  assert.deepEqual(a.getSnapshot().phones,[{id:'p1',name:'Pad di Nino'}],'only the online phone');
  assert.deepEqual([b.getSnapshot().state,b.getSnapshot().elsewhere],['elsewhere','site']);
  assert.equal(b.coordinator(),null,'the other window has no coordinator: /remote there says which window hosts');
  await a.stop();
  assert.deepEqual(log,['A:on','A:off']);
  /* B's next beat finds the lease free and becomes the host */
  assert.equal(await b.hostNow(),true);
  assert.equal(b.getSnapshot().state,'host');
  assert.deepEqual(log,['A:on','A:off','B:on']);
  await b.stop();
});

test('the consent card: the answer goes to the kernel\'s rispondi as consentita or negata, then the card list is read again',async t=>{
  const data=dir(t);
  const fake=fakeHost([],'A',{consensi:[{richiestaId:'r1',nomeDispositivo:'Pad di Nino',percorso:'C:\\progetti\\sito',scadeAlle:'2026-10-26T18:00:00.000Z'}]});
  const r=createTuiRemote({dataRoot:data,label:'site',lease:createHostLease({dir:remotePaths(data).dir,role:'serve',fileName:REMOTE_HOST_LEASE,pid:303,isAlive:()=>true}),createHost:async()=>fake.host as any,turnedOn:()=>true,...manual});
  await r.start();
  assert.deepEqual(r.getSnapshot().consents,[{richiestaId:'r1',device:'Pad di Nino',folder:'C:\\progetti\\sito',expiresAt:Date.parse('2026-10-26T18:00:00.000Z')}]);
  await r.decideConsent('r1',true);
  await r.decideConsent('r2',false);
  assert.deepEqual(fake.answers,[['r1','consentita'],['r2','negata']]);
  await r.stop();
});

test('a host that fails to start: the state says why and the lease is given back for another window',async t=>{
  const data=dir(t);
  const lease=createHostLease({dir:remotePaths(data).dir,role:'serve',fileName:REMOTE_HOST_LEASE,pid:404,isAlive:()=>true});
  const r=createTuiRemote({dataRoot:data,label:'site',lease,createHost:async()=>{throw Object.assign(new Error('x'),{code:'REMOTE_COMPONENT_NOT_LOADED'});},turnedOn:()=>true,...manual});
  await r.start();
  assert.deepEqual([r.getSnapshot().state,r.getSnapshot().error],['error','REMOTE_COMPONENT_NOT_LOADED']);
  assert.equal(lease.held(),false);
  assert.equal(createHostLease({dir:remotePaths(data).dir,role:'serve',fileName:REMOTE_HOST_LEASE,pid:505,isAlive:()=>true}).tryAcquire().ok,true,'free for the next window');
  await r.stop();
});

test('a start slower than a beat never reports its own lease as another window',async t=>{
  const data=dir(t);
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  let beat!:()=>void;
  let on=false;
  const r=createTuiRemote({dataRoot:data,label:'site',lease:createHostLease({dir:remotePaths(data).dir,role:'serve',fileName:REMOTE_HOST_LEASE,pid:606,isAlive:()=>true}),createHost:async()=>{await gate;return fakeHost([],'A').host as any;},turnedOn:()=>on,setInterval:(fn)=>{beat=fn;return {unref(){}};},clearInterval:()=>{}});
  await r.start();
  assert.equal(r.getSnapshot().state,'off');
  /* `talos remote` in another terminal turns it on while this window is open: the next beat starts the host, slowly */
  on=true;
  beat();
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(r.getSnapshot().state,'starting');
  /* a beat while the host is still starting: without the one-beat-at-a-time guard it found its own lease and said «elsewhere» */
  beat();
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.notEqual(r.getSnapshot().state,'elsewhere');
  release();
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(r.getSnapshot().state,'host');
  await r.stop();
});
