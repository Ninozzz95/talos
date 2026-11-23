/*
 * Block 9 (the Desktop's review of the CLI up to bdb63558f, REV-B9-H2/H4/H5), cured:
 * - H-R1: an administrator registration counts only with a channel this profile's windows make; a refused connect is the only proof
 *   (no answer in time proves nothing);
 * - H-R2: a host start that outlives the lease does not turn on a second host beside the window that took it meanwhile;
 * - H-R3: a device's own name reaches the terminal without control or bidi characters.
 */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createHostLease} from '../../src/automations/host-lease.ts';
import {remotePaths} from '../../src/remote/host.ts';
import {REMOTE_HOST_LEASE,cleanDeviceName,consentsOfState,createTuiRemote,notifiedOfState} from '../../src/remote/tui-remote.ts';
import {isOwnChannel,openWindowChannel,readRegistrations,type WindowRegistration} from '../../src/remote/window-channel.ts';

const folder=()=>{const d=mkdtempSync(join(tmpdir(),'talos-b9-'));return{d,done:()=>rmSync(d,{recursive:true,force:true})};};
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
function fakeHost(log:string[],name:string){
  return{remote:{riprendi:async()=>{log.push(`${name}:on`);},stato:async()=>({inLinea:[],telefoni:[],consensi:[],attese:[]}),ascoltaStato:()=>()=>{},cartelle:{ascolta:()=>()=>{}}},
    call:async()=>({stato:200,dati:{}}),stop:async()=>{log.push(`${name}:off`);}} as any;
}
function windowOf(data:string,opts:{pid:number;registrations?:()=>WindowRegistration[];createHost?:()=>Promise<any>;log:string[];probe?:(c:string)=>Promise<any>}){
  let beat!:()=>void;
  const r=createTuiRemote({dataRoot:data,label:'site',
    lease:createHostLease({dir:remotePaths(data).dir,role:'serve',fileName:REMOTE_HOST_LEASE,label:'site',kind:'window',pid:opts.pid,isAlive:()=>true,elevated:()=>false}),
    createHost:opts.createHost??(async()=>fakeHost(opts.log,'site')),turnedOn:()=>true,elevated:async()=>false,
    registrations:opts.registrations??(()=>[]),alive:()=>true,probeChannel:opts.probe??(async()=>'denied'),
    setInterval:(fn)=>{beat=fn;return{unref(){}};},clearInterval:()=>{}});
  return{r,beat:async()=>{beat();await pause(30);}};
}

test('H-R1: only a channel this profile\'s windows make; a system pipe that also refuses a normal process is no administrator window',async()=>{
  const f=folder();const log:string[]=[];
  try{
    const handlers={attached:()=>[],call:async()=>({stato:200,dati:{}}),subscribe:()=>()=>{}};
    const real=await openWindowChannel({dataRoot:f.d,label:'x',handlers});
    try{
      const [reg]=readRegistrations(f.d);
      assert.equal(isOwnChannel(f.d,reg!.channel),true,'a channel this profile makes');
      assert.equal(isOwnChannel(join(f.d,'other'),reg!.channel),false,'another profile\'s');
    }finally{await real.close();}
    for(const channel of [String.raw`\\.\pipe\PIPE_EVENTROOT\CIMV2SCM EVENT PROVIDER`,String.raw`\\.\pipe\talos-cli-000000000000-`+'a'.repeat(32),42 as any])
      assert.equal(isOwnChannel(f.d,channel,'win32'),false,String(channel));
    const fake:WindowRegistration={v:1,id:'fake',pid:4242,startedAt:'2026-10-27T00:00:00.000Z',label:'ops',channel:String.raw`\\.\pipe\PIPE_EVENTROOT\CIMV2SCM EVENT PROVIDER`,token:'t',elevated:true};
    const probed:string[]=[];
    const w=windowOf(f.d,{pid:101,registrations:()=>[fake],log,probe:async(c)=>{probed.push(c);return'denied';}});
    await w.r.start();
    assert.equal(w.r.getSnapshot().state,'host','the normal window hosts');
    assert.deepEqual(probed,[],'a foreign pipe is not even asked');
    await w.r.stop();
  }finally{f.done();}
});

test('H-R2: the host start outlived the lease and another window took it meanwhile — no second host is turned on',async()=>{
  const f=folder();const log:string[]=[];let finish:(h:any)=>void=()=>{};
  try{
    const w=windowOf(f.d,{pid:101,log,createHost:()=>new Promise(resolve=>{finish=resolve;})});
    void w.r.start();
    await pause(50);
    /* meanwhile the lease aged out and another window took it */
    const dir=remotePaths(f.d).dir;mkdirSync(dir,{recursive:true});const now=new Date().toISOString();
    writeFileSync(join(dir,REMOTE_HOST_LEASE),JSON.stringify({pid:process.pid,token:'OTHER',role:'serve',kind:'window',label:'ops',startedAt:now,beatAt:now}));
    finish(fakeHost(log,'site'));
    await pause(50);
    assert.deepEqual(log,['site:off'],'built, then stopped without ever turning on');
    assert.deepEqual([w.r.getSnapshot().state,w.r.getSnapshot().elsewhere],['elsewhere','ops']);
    await w.r.stop();
  }finally{f.done();}
});

test('H-R3: a device name with a line break, an ESC (OSC 52), tabs or a bidi override reaches the terminal clean',()=>{
  const nasty='Pad\n\u001b]52;c;ZXZpbA==\u0007di\tNino\u202Eevil';
  assert.equal(cleanDeviceName(nasty),'Pad ]52;c;ZXZpbA== di Nino evil');
  assert.equal(cleanDeviceName('\u0000\u202E  '),'device');
  assert.deepEqual(notifiedOfState({sveglie:[{telefono:'p1',sessione:'s1',alle:1,nome:nasty}]},['s1']),['Pad ]52;c;ZXZpbA== di Nino evil']);
  assert.equal(consentsOfState({consensi:[{richiestaId:'c',nomeDispositivo:'A\u001b[2Jb',percorso:'C:\\x',scadeAlle:new Date().toISOString()}]})[0]!.device,'A [2Jb');
});

test('block 10 E-R2: a probe that throws proves nothing — the normal window hosts',async()=>{
  const f=folder();const log:string[]=[];
  try{
    const reg:WindowRegistration={v:1,id:'thrower',pid:4242,startedAt:'2026-10-27T00:00:00.000Z',label:'ops',channel:'x',token:'t',elevated:true};
    let beat!:()=>void;
    const r=createTuiRemote({dataRoot:f.d,label:'site',
      lease:createHostLease({dir:remotePaths(f.d).dir,role:'serve',fileName:REMOTE_HOST_LEASE,label:'site',kind:'window',pid:101,isAlive:()=>true,elevated:()=>false}),
      createHost:async()=>fakeHost(log,'site'),turnedOn:()=>true,elevated:async()=>false,registrations:()=>[reg],alive:()=>true,ownChannel:()=>true,
      probeChannel:async()=>{throw new Error('probe broke');},setInterval:(fn)=>{beat=fn;return{unref(){}};},clearInterval:()=>{}});
    await r.start();
    assert.equal(r.getSnapshot().state,'host');
    assert.equal(r.servesAsAdministrator(),false);
    await r.stop();
  }finally{f.done();}
});
