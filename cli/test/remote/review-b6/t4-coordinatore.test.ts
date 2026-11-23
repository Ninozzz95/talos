/*
 * Review block 6 of the Desktop (26/10/2026, REVISIONE-BLOCCO-6 section C, T4 `95060b0a9`), ported: the reviewer's tests, real lease
 * in a temporary folder, the real window (`createTuiRemote`) with its real service, a fake kernel coordinator that records its calls.
 * - C-R1: REV-B6-C1 as written awaited `stato()` BEFORE letting the host finish loading, so any cure that waits deadlocks; here the
 *   call is in flight, the host finishes, the call answers.
 * - C-R2, C-R3: as the reviewer wrote them.
 * - The older window (observation): its WINDOW_UNKNOWN_OPERATION is REMOTE_HOST_OUTDATED.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {openCoordinator} from '../../../src/commands/remote-cli.ts';
import {createTuiRemote,REMOTE_HOST_LEASE} from '../../../src/remote/tui-remote.ts';
import {remotePaths} from '../../../src/remote/host.ts';
import {createCoordinatorService,createPairingGuard} from '../../../src/remote/coordinator-service.ts';
import {proxyCoordinator} from '../../../src/remote/coordinator-proxy.ts';

const folder=()=>{const dir=mkdtempSync(join(tmpdir(),'rev-b6-t4-'));return{dir,done:()=>rmSync(dir,{recursive:true,force:true})};};
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
/* the window took the lease (it asks for elevation first): polled, bounded, never a fixed pause that a loaded suite outruns */
const leaseTaken=async(dir:string,ms=5000)=>{const file=join(remotePaths(dir).dir,REMOTE_HOST_LEASE);for(const end=Date.now()+ms;Date.now()<end;await pause(10)){try{if(JSON.parse(readFileSync(file,'utf8')).kind==='window')return;}catch{}}throw new Error('the window never took the lease');};
const ctxFor=(dataRoot:string)=>({paths:{dataRoot}}) as any;
function fakeCoordinator(){
  const calls:string[]=[];
  const remote:any={
    stato:async()=>{calls.push('stato');return{disponibile:true,sceltaFatta:true,telefoni:[{id:'p1',nome:'Pad'}],attese:[],inLinea:[]};},
    imposta:async()=>{calls.push('imposta');return{ok:true};},
    apriAccoppiamento:async()=>{calls.push('apri');return{gettone:'g1',qr:'q',scadeAlle:Date.now()+300_000,moduli:{lato:1,righe:['1']}};},
    chiudiAccoppiamento:()=>{calls.push('chiudi');},
    conferma:async(id:string)=>{calls.push(`conferma:${id}`);return{id};},
    rifiuta:()=>{calls.push('rifiuta');return true;},
    revoca:async(id:string)=>{calls.push(`revoca:${id}`);return{revocato:id};},
    riprendi:async()=>{},
  };
  return{remote,calls};
}

test('REV-B6-C1 a window just opened holds the lease while it loads: the call from talos remote waits for it, never «no longer hosts»',async()=>{
  const f=folder();
  try{
    let finish:(h:any)=>void=()=>{};
    const host=fakeCoordinator();
    const win=createTuiRemote({dataRoot:f.dir,label:'site',turnedOn:()=>true,elevated:async()=>false,setInterval:()=>({unref(){}}),clearInterval:()=>{},
      openChannel:async()=>({close:async()=>{}}),
      createHost:()=>new Promise(r=>{finish=r;})});
    void win.start();
    await leaseTaken(f.dir);
    const lease=JSON.parse(readFileSync(join(remotePaths(f.dir).dir,REMOTE_HOST_LEASE),'utf8'));
    assert.equal(lease.kind,'window','premise: the window took the lease');
    const connection={id:'c1',onClose(){}};
    const client:any={request:async(_op:string,args:any)=>win.serveCoordinator(args,connection),close(){}};
    const got=await openCoordinator(ctxFor(f.dir),{openOwn:async()=>{throw new Error('never a second coordinator');},connect:async()=>client});
    assert.equal(got.via,'window');
    const asked=got.remote.stato().then(value=>({value}),error=>({error}));
    await pause(100);
    finish({remote:host.remote,stop:async()=>{}});
    const answer:any=await asked;
    await got.close();
    assert.equal(answer.error?.code,undefined,`talos remote got ${answer.error?.code}`);
    assert.deepEqual(answer.value.telefoni,[{id:'p1',nome:'Pad'}]);
    await win.stop();
  }finally{f.done();}
});

test('review 7 E-R2: a window still loading when the wait runs out says it is starting, never «no longer hosts»; once loaded it answers',async()=>{
  const f=folder();
  try{
    let finish:(h:any)=>void=()=>{};
    const host=fakeCoordinator();
    const win=createTuiRemote({dataRoot:f.dir,label:'site',turnedOn:()=>true,elevated:async()=>false,setInterval:()=>({unref(){}}),clearInterval:()=>{},hostReadyWaitMs:150,
      openChannel:async()=>({close:async()=>{}}),
      createHost:()=>new Promise(r=>{finish=r;})});
    void win.start();
    await leaseTaken(f.dir);
    const connection={id:'c1',onClose(){}};
    const client:any={request:async(_op:string,args:any)=>win.serveCoordinator(args,connection),close(){}};
    const got=await openCoordinator(ctxFor(f.dir),{openOwn:async()=>{throw new Error('never a second coordinator');},connect:async()=>client});
    await assert.rejects(got.remote.stato(),{code:'REMOTE_HOST_STARTING'});
    finish({remote:host.remote,stop:async()=>{}});
    await pause(20);
    assert.deepEqual((await got.remote.stato()).telefoni,[{id:'p1',nome:'Pad'}]);
    await got.close();
    await win.stop();
  }finally{f.done();}
});

test('review 7 E-R2: a window that no longer holds the lease still says «no longer hosts», even while a host would be starting',async()=>{
  const guard=createPairingGuard();
  const serve=createCoordinatorService({coordinator:()=>null,owns:()=>false,guard,whenReady:async()=>false});
  await assert.rejects(serve({method:'stato',args:[],token:'T'},{id:'c',onClose(){}} as any),{code:'REMOTE_NOT_HOST'});
  /* it held the lease when asked and lost it during the wait: a real hand-over, not a start */
  let owns=true;
  const handed=createCoordinatorService({coordinator:()=>null,owns:()=>owns,guard,whenReady:async()=>{owns=false;return false;}});
  await assert.rejects(handed({method:'stato',args:[],token:'T'},{id:'c2',onClose(){}} as any),{code:'REMOTE_NOT_HOST'});
});

test('REV-B6-C2 talos remote frozen past the lease: a window took it; on waking, BEFORE its beat, the revoke does not leave its own coordinator',async()=>{
  const f=folder();
  try{
    const own=fakeCoordinator();
    let beat:()=>void=()=>{};
    const got=await openCoordinator(ctxFor(f.dir),{openOwn:async()=>({remote:own.remote,stop:async()=>{own.calls.push('stop');}}),setInterval:(fn:()=>void)=>{beat=fn;return 1;},clearInterval:()=>{}});
    assert.equal(got.via,'own');
    const file=join(remotePaths(f.dir).dir,REMOTE_HOST_LEASE);
    writeFileSync(file,JSON.stringify({pid:process.pid,token:'WINDOW',role:'serve',kind:'window',label:'site',startedAt:new Date().toISOString(),beatAt:new Date().toISOString()}));
    await assert.rejects(got.remote.revoca('p1'),{code:'REMOTE_LEASE_LOST'});
    beat();
    await got.close();
    assert.deepEqual(own.calls.filter(c=>c.startsWith('revoca')),[],JSON.stringify(own.calls));
    assert.equal(own.calls.filter(c=>c==='stop').length,1,'its coordinator stopped once');
    assert.equal(got.lost(),true);
  }finally{f.done();}
});

test('REV-B6-C5 the terminal closes WHILE the window opens the QR: the QR is closed and the pairing is free at once',async()=>{
  const host=fakeCoordinator();
  let release:()=>void=()=>{};
  const quick=host.remote.apriAccoppiamento;
  host.remote.apriAccoppiamento=async()=>{host.calls.push('apri');await new Promise<void>(r=>{release=r;});return{gettone:'g1',qr:'q',scadeAlle:Date.now()+300_000,moduli:{lato:1,righe:['1']}};};
  const guard=createPairingGuard();
  const serve=createCoordinatorService({coordinator:()=>host.remote,owns:(t:string)=>t==='T',guard});
  const closers:Array<()=>void>=[];
  const conn={id:'terminal',onClose:(l:()=>void)=>{closers.push(l);}};
  const opening=serve({method:'apriAccoppiamento',args:[],token:'T'},conn).catch((e:any)=>e);
  await pause(20);
  for(const l of closers.splice(0))l();
  release();
  const first:any=await opening;
  assert.equal(first?.code,'WINDOW_GONE');
  /* the next pairing opens at once (the reviewer's version kept the slow QR maker, so a free pairing would wait for ever) */
  host.remote.apriAccoppiamento=quick;
  let second:any=null;
  try{await serve({method:'apriAccoppiamento',args:[],token:'T'},{id:'other',onClose(){}});}catch(e){second=e;}
  assert.deepEqual({closed:host.calls.includes('chiudi'),second:second?.code??'ok'},{closed:true,second:'ok'},JSON.stringify(host.calls));
});

test('a window of an older TALOS hosts: its «unknown operation» is said as REMOTE_HOST_OUTDATED',async()=>{
  const client:any={request:async()=>{throw Object.assign(new Error('Unknown operation on the window channel.'),{code:'WINDOW_UNKNOWN_OPERATION'});}};
  await assert.rejects(proxyCoordinator(client,'T').stato(),{code:'REMOTE_HOST_OUTDATED'});
});
