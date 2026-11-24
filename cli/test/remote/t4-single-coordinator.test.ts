/*
 * 0.6.15 T4: one remote coordinator per profile (RICERCA-T4-COORDINATORE-UNICO.md).
 * - The hosting window serves its coordinator on its channel: a closed list of methods with checked arguments, a lease token
 *   (fencing), one pairing at a time (owner 26/10/2026 «Uno alla volta»), and a QR closed when the connection that opened it drops.
 * - `talos remote` uses that coordinator by proxy, or takes the host lease as kind `command` and renews it, or says another
 *   `talos remote` runs. A beat that finds the lease taken stops its coordinator: never two.
 * - The other windows say «pairing in another terminal» while the command holds the lease.
 * The channel is a REAL named pipe in a temporary data folder; the kernel's coordinator is a fake that records its calls.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,mkdirSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {checkedArgs,COORDINATOR_METHODS,createCoordinatorService,createPairingGuard,guardedCoordinator,type FullCoordinator} from '../../src/remote/coordinator-service.ts';
import {connectHostWindow,proxyCoordinator} from '../../src/remote/coordinator-proxy.ts';
import {openWindowChannel,type WindowConnection} from '../../src/remote/window-channel.ts';
import {createHostLease} from '../../src/automations/host-lease.ts';
import {openCoordinator,HOST_WINDOW_ATTEMPTS} from '../../src/commands/remote-cli.ts';
import {createTuiRemote,REMOTE_HOST_LEASE} from '../../src/remote/tui-remote.ts';
import {remotePaths} from '../../src/remote/host.ts';
import {footerModeRow} from '../../src/tui/components/chrome-rows.ts';

const folder=()=>{const dir=mkdtempSync(join(tmpdir(),'talos-t4-'));return{dir,done:()=>rmSync(dir,{recursive:true,force:true})};};
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

function fakeCoordinator(over:Partial<FullCoordinator>={}){
  const calls:Array<[string,...unknown[]]>=[];let n=0;
  const remote:FullCoordinator={
    stato:async()=>{calls.push(['stato']);return{disponibile:true,sceltaFatta:true,telefoni:[{id:'p1',nome:'Pad di Nino',inLinea:true}],attese:[],inLinea:['p1']};},
    imposta:async(input)=>{calls.push(['imposta',input]);return{ok:true};},
    apriAccoppiamento:async()=>{calls.push(['apriAccoppiamento']);n++;return{gettone:`g${n}`,qr:'talos://pair?x',scadeAlle:Date.now()+300_000,moduli:{lato:2,righe:['10','01']}};},
    chiudiAccoppiamento:(gettone)=>{calls.push(['chiudiAccoppiamento',gettone]);},
    conferma:async(id)=>{calls.push(['conferma',id]);return{id};},
    rifiuta:(id)=>{calls.push(['rifiuta',id]);return true;},
    revoca:async(id)=>{calls.push(['revoca',id]);return{revocato:id};},
    rinomina:async(id,nome)=>{calls.push(['rinomina',id,nome]);return{id,nome};},
    ...over,
  };
  return{remote,calls};
}
const connection=()=>{const listeners:Array<()=>void>=[];const c:WindowConnection={id:Math.random().toString(36).slice(2),onClose:l=>{listeners.push(l);}};return{c,drop:()=>{for(const l of listeners.splice(0))l();}};};

test('the closed list: only the pairing and list methods cross the channel, each with its own arguments checked',()=>{
  /* T6 adds the devices' folders and file offers the model's tools call (t6-device-tools.test.ts checks their arguments) */
  assert.deepEqual([...COORDINATOR_METHODS],['stato','imposta','apriAccoppiamento','chiudiAccoppiamento','conferma','rifiuta','revoca','rinomina',
    'cartelle.consensiDi','cartelle.verifica','cartelle.consentiInAnticipo','cartelle.consensoDi','cartelle.revoca','cartelle.sblocca','file.esaminaOfferta','file.registraOfferta']);
  for(const method of ['ferma','riprendi','cartelle','file','ascoltaStato','constructor','__proto__','toString'])
    assert.throws(()=>checkedArgs(method,[]),{code:'REMOTE_METHOD_REFUSED'},method);
  assert.deepEqual(checkedArgs('stato',[]),[]);
  assert.throws(()=>checkedArgs('stato',['x']),{code:'REMOTE_BAD_ARGUMENTS'});
  assert.deepEqual(checkedArgs('imposta',[{relay:{modo:'n0'}}]),[{relay:{modo:'n0'}}]);
  assert.deepEqual(checkedArgs('imposta',[{acceso:true,relay:{modo:'proprio',url:'https://relay.example'}}]),[{acceso:true,relay:{modo:'proprio',url:'https://relay.example'}}]);
  for(const bad of [[{relay:{modo:'n0',url:'x'}}],[{relay:{modo:'proprio'}}],[{acceso:'yes'}],[{relay:{modo:'n0'},extra:1}],[null],[[]],[]])
    assert.throws(()=>checkedArgs('imposta',bad),{code:'REMOTE_BAD_ARGUMENTS'},JSON.stringify(bad));
  assert.deepEqual(checkedArgs('apriAccoppiamento',[]),[{}]);
  assert.throws(()=>checkedArgs('apriAccoppiamento',[{soloSeAcceso:true,x:1}]),{code:'REMOTE_BAD_ARGUMENTS'});
  for(const method of ['chiudiAccoppiamento','conferma','rifiuta','revoca']){
    assert.deepEqual(checkedArgs(method,['p1']),['p1']);
    for(const bad of [[],[1],[''],['x'.repeat(201)],['a','b']])assert.throws(()=>checkedArgs(method,bad),{code:'REMOTE_BAD_ARGUMENTS'},method);
  }
  assert.deepEqual(checkedArgs('rinomina',['p1','Pad']),['p1','Pad']);
  assert.throws(()=>checkedArgs('rinomina',['p1','x'.repeat(65)]),{code:'REMOTE_BAD_ARGUMENTS'});
});

test('one pairing at a time (owner «Uno alla volta»): a second owner gets PAIR_BUSY until the first closes, confirms or its QR expires',async()=>{
  let now=1_000_000;const guard=createPairingGuard({now:()=>now});
  let opened=0;
  const {remote}=fakeCoordinator({apriAccoppiamento:async()=>{opened++;return{gettone:'g1',qr:'q',scadeAlle:now+300_000,moduli:{lato:1,righe:['1']}};}});
  const a=guardedCoordinator(remote,guard,'terminal'),b=guardedCoordinator(remote,guard,'window');
  const offer=await a.apriAccoppiamento();
  await assert.rejects(b.apriAccoppiamento(),{code:'PAIR_BUSY',message:'Already pairing in another window.'});
  assert.equal(opened,1,'the second never reached the kernel');
  await a.apriAccoppiamento();/* the same owner may open again («r» after an expired QR) */
  a.chiudiAccoppiamento(offer.gettone);
  await b.apriAccoppiamento();
  /* b's QR expired with no device waiting: the next owner may pair */
  now+=300_001;
  await a.apriAccoppiamento();
  /* a device waiting for its code keeps a's pairing going past its QR's minutes */
  now+=300_001;
  const waiting=fakeCoordinator({stato:async()=>({attese:[{id:'w1',nome:'Pad',codice:'645739'}]})});
  const guard2=createPairingGuard({now:()=>now});
  const x=guardedCoordinator({...waiting.remote,apriAccoppiamento:async()=>({gettone:'g9',qr:'q',scadeAlle:now-1,moduli:{lato:1,righe:['1']}})},guard2,'x');
  const y=guardedCoordinator(waiting.remote,guard2,'y');
  await x.apriAccoppiamento();
  await assert.rejects(y.apriAccoppiamento(),{code:'PAIR_BUSY'});
  await x.conferma('w1');
  await y.apriAccoppiamento();
});

test('the service: refused without the lease token, without a host, or after the lease moved (fencing)',async()=>{
  const {remote,calls}=fakeCoordinator();
  let token='T1';let hosting:FullCoordinator|null=remote;
  const serve=createCoordinatorService({coordinator:()=>hosting,owns:t=>t===token,guard:createPairingGuard()});
  const {c}=connection();
  assert.deepEqual(await serve({method:'revoca',args:['p1'],token:'T1'},c),{revocato:'p1'});
  await assert.rejects(serve({method:'revoca',args:['p1'],token:'T0'},c),{code:'REMOTE_NOT_HOST'});
  await assert.rejects(serve({method:'revoca',args:['p1'],token:''},c),{code:'REMOTE_NOT_HOST'});
  token='T2';/* another window took the lease: the old token is refused even by a coordinator still in memory */
  await assert.rejects(serve({method:'stato',args:[],token:'T1'},c),{code:'REMOTE_NOT_HOST'});
  hosting=null;
  await assert.rejects(serve({method:'stato',args:[],token:'T2'},c),{code:'REMOTE_NOT_HOST'});
  await assert.rejects(serve({method:'ferma',args:[],token:'T2'},c),{code:'REMOTE_METHOD_REFUSED'});
  assert.deepEqual(calls,[['revoca','p1']],'only the first call reached the kernel');
});

test('a terminal closed in the middle of pairing: its QR closes in the host, and the next pairing is free',async()=>{
  const {remote,calls}=fakeCoordinator();const guard=createPairingGuard();
  const serve=createCoordinatorService({coordinator:()=>remote,owns:t=>t==='T',guard});
  const first=connection(),second=connection();
  const offer:any=await serve({method:'apriAccoppiamento',args:[],token:'T'},first.c);
  await assert.rejects(serve({method:'apriAccoppiamento',args:[],token:'T'},second.c),{code:'PAIR_BUSY'});
  first.drop();
  assert.deepEqual(calls.at(-1),['chiudiAccoppiamento',offer.gettone]);
  await serve({method:'apriAccoppiamento',args:[],token:'T'},second.c);
});

test('end to end on a real channel: talos remote by proxy reaches the hosting window\'s coordinator, PAIR_LOCKED keeps its wait, a dropped proxy closes its QR',async()=>{
  const f=folder();
  const {remote,calls}=fakeCoordinator({imposta:async()=>{calls.push(['imposta']);throw Object.assign(new Error('Too many attempts'),{code:'PAIR_LOCKED',retryAfterMs:900_000});}});
  const serve=createCoordinatorService({coordinator:()=>remote,owns:t=>t==='LEASE',guard:createPairingGuard()});
  const channel=await openWindowChannel({dataRoot:f.dir,label:'site',handlers:{attached:()=>[],call:async()=>({stato:200,dati:null}),subscribe:()=>()=>{},coordinator:serve}});
  try{
    const client=await connectHostWindow(f.dir,{pid:process.pid,token:'LEASE',role:'serve',startedAt:'',beatAt:''});
    assert.ok(client,'the window with the lease holder\'s pid answered');
    const proxy=proxyCoordinator(client!,'LEASE');
    const stato=await proxy.stato();
    assert.equal(stato.telefoni[0].nome,'Pad di Nino');
    assert.deepEqual(await proxy.revoca('p1'),{revocato:'p1'});
    const offer=await proxy.apriAccoppiamento();
    assert.deepEqual(offer.moduli,{lato:2,righe:['10','01']},'the QR modules cross the channel whole');
    await assert.rejects(proxy.imposta({relay:{modo:'n0'}}),(e:any)=>e.code==='PAIR_LOCKED'&&e.retryAfterMs===900_000);
    await assert.rejects(proxyCoordinator(client!,'OLD').stato(),{code:'REMOTE_NOT_HOST'});
    client!.close();
    for(let i=0;i<40&&calls.at(-1)?.[0]!=='chiudiAccoppiamento';i++)await pause(25);
    assert.deepEqual(calls.at(-1),['chiudiAccoppiamento',offer.gettone],'the dropped proxy\'s QR closed in the host');
    assert.deepEqual(calls.map(c=>c[0]),['stato','revoca','apriAccoppiamento','imposta','chiudiAccoppiamento']);
  }finally{await channel.close();f.done();}
});

test('a proxy call that changes something and times out is «outcome unknown»; chiudiAccoppiamento never rejects unhandled',async()=>{
  const client:any={request:async(_op:string,args:any)=>{if(args.method==='chiudiAccoppiamento')throw Object.assign(new Error('gone'),{code:'WINDOW_GONE'});throw Object.assign(new Error('late'),{code:'WINDOW_TIMEOUT'});}};
  const proxy=proxyCoordinator(client,'T');
  await assert.rejects(proxy.revoca('p1'),{code:'REMOTE_OUTCOME_UNKNOWN'});
  await assert.rejects(proxy.conferma('p1'),{code:'REMOTE_OUTCOME_UNKNOWN'});
  await assert.rejects(proxy.stato(),{code:'WINDOW_TIMEOUT'},'a read that times out says so');
  let unhandled=0;const count=()=>{unhandled++;};process.on('unhandledRejection',count);
  try{proxy.chiudiAccoppiamento('g1');await pause(50);}finally{process.off('unhandledRejection',count);}
  assert.equal(unhandled,0);
});

/* openCoordinator: the lease in a temporary data folder, the own coordinator and the window's connection as fakes */
const ctxFor=(dataRoot:string)=>({paths:{dataRoot}}) as any;
const leaseFile=(dataRoot:string)=>join(remotePaths(dataRoot).dir,REMOTE_HOST_LEASE);
function holdLease(dataRoot:string,lease:Record<string,unknown>){mkdirSync(remotePaths(dataRoot).dir,{recursive:true});writeFileSync(leaseFile(dataRoot),JSON.stringify({pid:process.pid,token:'HELD',role:'serve',startedAt:new Date().toISOString(),beatAt:new Date().toISOString(),...lease}));}

test('nobody hosts: talos remote takes the lease as a command, renews it, and releases it at the end',async()=>{
  const f=folder();const timers:Array<()=>void>=[];let stopped=0;
  try{
    const {remote}=fakeCoordinator();
    const got=await openCoordinator(ctxFor(f.dir),{openOwn:async()=>({remote,stop:async()=>{stopped++;}}),setInterval:(fn)=>{timers.push(fn);return 1;},clearInterval:()=>{}});
    assert.equal(got.via,'own');
    const lease=JSON.parse(readFileSync(leaseFile(f.dir),'utf8'));
    assert.equal(lease.kind,'command');assert.equal(lease.label,'talos remote');
    /* 24/11/2026 (judge v2684): the beat writes the time of the beat; after a fixed 5 ms a clock that steps every 15.6 ms (the
       Windows default) can still read the same millisecond, and the renewal looked missing. The real beat is 15 s apart. The test
       waits until the clock has passed the first beat, however coarse it is. */
    const before=lease.beatAt;while(Date.now()<=Date.parse(before))await pause(2);timers[0]!();
    assert.notEqual(JSON.parse(readFileSync(leaseFile(f.dir),'utf8')).beatAt,before,'the beat renewed it');
    await got.close();
    assert.equal(existsSync(leaseFile(f.dir)),false,'released');assert.equal(stopped,1);
  }finally{f.done();}
});

test('the lease taken while the command was frozen: the beat stops its own coordinator at once (never two)',async()=>{
  const f=folder();const timers:Array<()=>void>=[];let stopped=0;
  try{
    const {remote}=fakeCoordinator();
    const got=await openCoordinator(ctxFor(f.dir),{openOwn:async()=>({remote,stop:async()=>{stopped++;}}),setInterval:(fn)=>{timers.push(fn);return 1;},clearInterval:()=>{}});
    holdLease(f.dir,{token:'WINDOW',kind:'window'});
    timers[0]!();
    assert.equal(got.lost(),true);assert.equal(stopped,1,'stopped at the beat');
    await got.close();
    assert.equal(stopped,1,'not stopped twice');
    assert.equal(JSON.parse(readFileSync(leaseFile(f.dir),'utf8')).token,'WINDOW','the window\'s lease is left alone');
  }finally{f.done();}
});

test('another talos remote holds it: REMOTE_BUSY_COMMAND; a window holds it: by proxy; a window that never answers: REMOTE_HOST_UNREACHABLE',async()=>{
  const f=folder();
  try{
    holdLease(f.dir,{kind:'command',label:'talos remote'});
    let opened=0;
    await assert.rejects(openCoordinator(ctxFor(f.dir),{openOwn:async()=>{opened++;throw new Error('no');}}),{code:'REMOTE_BUSY_COMMAND'});
    holdLease(f.dir,{kind:'window',label:'site'});
    const asked:string[]=[];
    const client:any={request:async(op:string,args:any)=>{asked.push(`${op}:${args.method}:${args.token}`);return{ok:true};},close(){asked.push('close');}};
    const got=await openCoordinator(ctxFor(f.dir),{openOwn:async()=>{opened++;throw new Error('no');},connect:async()=>client});
    assert.equal(got.via,'window');
    await got.remote.stato();await got.close();
    assert.deepEqual(asked,['coordinator:stato:HELD','close'],'the proxy names the lease token it read');
    let tries=0;
    await assert.rejects(openCoordinator(ctxFor(f.dir),{openOwn:async()=>{opened++;throw new Error('no');},connect:async()=>{tries++;return null;},sleep:async()=>{}}),{code:'REMOTE_HOST_UNREACHABLE'});
    assert.equal(tries,HOST_WINDOW_ATTEMPTS);
    assert.equal(opened,0,'never a second coordinator while a window holds the lease');
  }finally{f.done();}
});

test('the windows: while talos remote holds the lease they do not host and say «pairing in another terminal»',async()=>{
  const f=folder();
  try{
    mkdirSync(remotePaths(f.dir).dir,{recursive:true});
    const command=createHostLease({dir:remotePaths(f.dir).dir,role:'run',fileName:REMOTE_HOST_LEASE,label:'talos remote',kind:'command'});
    assert.equal(command.tryAcquire().ok,true);
    let created=0;
    const remote=createTuiRemote({dataRoot:f.dir,label:'site',turnedOn:()=>true,createHost:async()=>{created++;throw new Error('no');},setInterval:()=>({}),clearInterval:()=>{}});
    await remote.start();
    const snap=remote.getSnapshot();
    assert.equal(snap.state,'elsewhere');assert.equal(snap.elsewhereKind,'command');assert.equal(created,0);
    const row=footerModeRow({mode:'default',noSandbox:false,queueCount:0,width:120,remote:{phones:[],elsewhere:snap.elsewhere,byCommand:true}} as any);
    const text=row.map((s:any)=>s.text).join('');
    assert.match(text,/⌁ Remote control: pairing in another terminal/u);
    assert.doesNotMatch(text,/via the window/u);
    await remote.stop();command.release();
  }finally{f.done();}
});
