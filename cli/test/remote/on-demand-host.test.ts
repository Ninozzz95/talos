/*
 * Review 01/11 (Mobile and Desktop agreed): a window that hosts remote control only because a read asked — the model's remote_* tools
 * (T6) or /devices — while remote control is off gives the place back at its next beat, as /remote does when its card closes. Hosting
 * never turned the bridge on; the place is what another window or `talos remote` in a terminal wants. A pairing keeps it.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createHostLease} from '../../src/automations/host-lease.ts';
import {remotePaths} from '../../src/remote/host.ts';
import {REMOTE_HOST_LEASE,createTuiRemote} from '../../src/remote/tui-remote.ts';

const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const leaseOnDisk=(data:string)=>{try{return JSON.parse(readFileSync(join(remotePaths(data).dir,REMOTE_HOST_LEASE),'utf8'));}catch{return null;}};
function fakeHost(log:string[],waiting:()=>number){
  return{remote:{riprendi:async()=>{log.push('riprendi');},stato:async()=>({acceso:false,telefoni:[{id:'p',nome:'Pad'}],attese:Array.from({length:waiting()},(_,i)=>({id:`w${i}`}))}),
    ascoltaStato:()=>()=>{},apriAccoppiamento:async()=>({gettone:'g',qr:'q',scadeAlle:Date.now()+300_000,moduli:{lato:1,righe:['1']}}),chiudiAccoppiamento:()=>{},revoca:async()=>({}),cartelle:{ascolta:()=>()=>{},consensiDi:async()=>[]}},
    call:async()=>({stato:200,dati:{}}),stop:async()=>{log.push('stop');}} as any;
}
function windowOff(data:string,log:string[],waiting=()=>0,on=()=>false){
  let beat!:()=>void;
  const r=createTuiRemote({dataRoot:data,label:'w',
    lease:createHostLease({dir:remotePaths(data).dir,role:'serve',fileName:REMOTE_HOST_LEASE,label:'w',kind:'window',pid:process.pid,isAlive:()=>true,elevated:()=>false}),
    createHost:async()=>fakeHost(log,waiting),turnedOn:on,elevated:async()=>false,registrations:()=>[],alive:()=>true,probeChannel:async()=>'denied',ownChannel:()=>true,
    setInterval:(fn)=>{beat=fn;return{unref(){}};},clearInterval:()=>{}});
  return{r,beat:async()=>{beat();await pause(30);}};
}

test('remote off: a read hosts on demand, and the next beat gives the place back',async()=>{
  const data=mkdtempSync(join(tmpdir(),'talos-ondemand-'));const log:string[]=[];
  try{
    const {r,beat}=windowOff(data,log);await r.start();
    assert.equal(leaseOnDisk(data)?.token??null,null,'remote off: nobody hosts at the start');
    const stato:any=await r.toolCoordinator().stato();
    assert.equal(stato.telefoni.length,1,'the read answers from the devices on disk');
    assert.ok(leaseOnDisk(data)?.token,'the read took the place');
    await beat();
    assert.equal(leaseOnDisk(data)?.token??null,null,'the next beat gave it back');
    assert.ok(log.includes('stop'),'the host it started for the read is stopped');
    await r.stop();
  }finally{rmSync(data,{recursive:true,force:true});}
});

test('remote off: a device waiting for its code keeps the place until the pairing is over',async()=>{
  const data=mkdtempSync(join(tmpdir(),'talos-ondemand-'));const log:string[]=[];let waiting=1;
  try{
    const {r,beat}=windowOff(data,log,()=>waiting);await r.start();
    await r.toolCoordinator().stato();
    await beat();
    assert.ok(leaseOnDisk(data)?.token,'never in the middle of a pairing');
    waiting=0;await beat();
    assert.equal(leaseOnDisk(data)?.token??null,null,'once nobody waits, the place goes back');
    await r.stop();
  }finally{rmSync(data,{recursive:true,force:true});}
});

test('Desktop 01/11, the other way round: remote control on, the host keeps the place at every beat, with or without a code waiting',async()=>{
  const data=mkdtempSync(join(tmpdir(),'talos-ondemand-'));const log:string[]=[];let waiting=0;
  try{
    const {r,beat}=windowOff(data,log,()=>waiting,()=>true);await r.start();
    assert.ok(leaseOnDisk(data)?.token,'remote on: this window hosts from the start');
    await beat();await beat();
    assert.ok(leaseOnDisk(data)?.token,'two beats later it still hosts');
    waiting=1;await beat();
    assert.ok(leaseOnDisk(data)?.token,'and with a code waiting');
    assert.equal(log.includes('stop'),false,'the host was never stopped');
    await r.stop();
  }finally{rmSync(data,{recursive:true,force:true});}
});
