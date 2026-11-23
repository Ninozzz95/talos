/*
 * 0.6.15: the pairing flow drives the kernel's coordinator in the approved mockup's order — relay (first time), QR, the phone's
 * six digits, Enter pairs / Esc rejects, then done — with the expired QR, the rejection with its attempts left and «r» for a new
 * QR, the 15-minute pause, the own relay's address, the component download and «c» copy link. Keys come from a queue, the clock
 * is a number, the coordinator is a fake that records every call. A key typed while the phone's request arrives is never lost.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {PAIR_ATTEMPTS,runPairingFlow,type PairingKey,type RemoteCoordinator} from '../../src/remote/pairing-flow.ts';
import type {PairingState} from '../../src/remote/pairing-view.ts';

const MODULES={lato:1,righe:['1']};
function fakeRemote(over:Partial<{disponibile:boolean;sceltaFatta:boolean;bloccatoFinoA:number|null;sbagliati:number}>={}){
  const calls:any[]=[];
  const state={disponibile:true,sceltaFatta:true,bloccatoFinoA:null as number|null,sbagliati:0,attese:[] as any[],...over};
  let offers=0;
  const remote:RemoteCoordinator={
    async stato(){return{disponibile:state.disponibile,sceltaFatta:state.sceltaFatta,attese:state.attese,accoppiamento:{sbagliati:state.sbagliati,bloccatoFinoA:state.bloccatoFinoA}};},
    async imposta(input){calls.push(['imposta',input]);if((input.relay as any)?.url==='bad')throw Object.assign(new Error('x'),{code:'REMOTE_RELAY_INVALID'});state.sceltaFatta=true;return{};},
    async apriAccoppiamento(){offers+=1;calls.push(['apri']);if(state.bloccatoFinoA)throw Object.assign(new Error('x'),{code:'PAIR_LOCKED',retryAfterMs:60_000});return{gettone:`g${offers}`,qr:`talos-remote:1?t=g${offers}`,scadeAlle:clock.now+300_000,moduli:MODULES};},
    chiudiAccoppiamento(g){calls.push(['chiudi',g]);},
    async conferma(id){calls.push(['conferma',id]);state.attese=[];},
    rifiuta(id){calls.push(['rifiuta',id]);state.attese=[];state.sbagliati+=1;if(state.sbagliati>=PAIR_ATTEMPTS)state.bloccatoFinoA=clock.now+900_000;return true;},
  };
  return{remote,calls,state};
}
const clock={now:Date.UTC(2026,9,26,12,0,0)};
function io(keys:(PairingKey|null)[],hooks:{onDraw?:(s:PairingState,n:number)=>void;copy?:(t:string)=>Promise<boolean>;ensure?:(cb:(size:string)=>void)=>Promise<void>}={}){
  const drawn:PairingState[]=[];
  const queue=[...keys];
  const waiters:((k:PairingKey|null)=>void)[]=[];
  const push=(k:PairingKey|null)=>{const w=waiters.shift();if(w)w(k);else queue.push(k);};
  return{drawn,push,io:{
    nextKey:()=>queue.length?Promise.resolve(queue.shift()!):new Promise<PairingKey|null>(r=>waiters.push(r)),
    sleep:(ms:number,signal:AbortSignal)=>new Promise<void>(r=>{const t=setTimeout(r,1);signal.addEventListener('abort',()=>{clearTimeout(t);r();});}),
    now:()=>clock.now,
    draw:(s:PairingState)=>{drawn.push(s);hooks.onDraw?.(s,drawn.length);},
    copy:hooks.copy??(async()=>true),
    ensureComponent:hooks.ensure??(async()=>{}),
  }};
}
const screens=(d:PairingState[])=>d.map(s=>s.screen).filter((s,i,a)=>s!==a[i-1]);

test('first time: relay n0, QR, the phone\'s code, Enter pairs — done',async()=>{
  const {remote,calls,state}=fakeRemote({sceltaFatta:false});
  const t=io(['enter'],{onDraw:(s)=>{if(s.screen==='qr'&&!state.attese.length&&!calls.some(c=>c[0]==='conferma')){state.attese=[{id:'w1',nome:'Pad di Nino',codice:'482913'}];setTimeout(()=>t.push('enter'),5);}}});
  const out=await runPairingFlow(remote,t.io);
  assert.deepEqual(out,{result:'paired',phone:'Pad di Nino'});
  assert.deepEqual(screens(t.drawn),['relay','qr','code','done']);
  assert.deepEqual(calls.find(c=>c[0]==='imposta')[1],{relay:{modo:'n0'}});
  assert.deepEqual(calls.filter(c=>c[0]==='conferma'),[['conferma','w1']]);
  const code=t.drawn.find(s=>s.screen==='code') as any;
  assert.deepEqual([code.code,code.attemptsLeft],['482913',5]);
});

test('a key typed while the phone\'s request arrives is not lost: the pending read answers the code screen',async()=>{
  const {remote,calls,state}=fakeRemote();
  let pushed=false;
  const t=io([],{onDraw:(s)=>{if(s.screen==='qr'&&!pushed){pushed=true;state.attese=[{id:'w9',nome:'Pixel',codice:'111111'}];setTimeout(()=>t.push('enter'),30);}}});
  const out=await runPairingFlow(remote,t.io);
  assert.equal(out.result,'paired');
  assert.deepEqual(calls.filter(c=>c[0]==='conferma'),[['conferma','w9']]);
});

test('Esc on the code rejects it: «4 attempts left», then r opens a new QR, then Esc closes it',async()=>{
  const {remote,calls,state}=fakeRemote();
  let first=true;
  const t=io([],{onDraw:(s)=>{
    if(s.screen==='qr'&&first){first=false;state.attese=[{id:'w2',nome:'Stranger',codice:'000001'}];setTimeout(()=>t.push('esc'),5);}
    if(s.screen==='rejected')setTimeout(()=>t.push('r'),5);
    if(s.screen==='qr'&&!first&&calls.filter(c=>c[0]==='apri').length===2)setTimeout(()=>t.push('esc'),5);
  }});
  const out=await runPairingFlow(remote,t.io);
  assert.deepEqual(out,{result:'cancelled'});
  assert.deepEqual(screens(t.drawn),['qr','code','rejected','qr']);
  assert.equal((t.drawn.find(s=>s.screen==='rejected') as any).attemptsLeft,4);
  assert.deepEqual(calls.filter(c=>c[0]!=='apri').map(c=>c.join(':')),['rifiuta:w2','chiudi:g2']);
});

test('the QR expires after its 5 minutes: closed in the kernel, «The QR expired», Esc closes',async()=>{
  const {remote,calls}=fakeRemote();
  const t=io([],{onDraw:(s)=>{if(s.screen==='qr'&&calls.filter(c=>c[0]==='apri').length===1&&clock.now<Date.UTC(2026,9,26,12,6)){clock.now+=301_000;}if(s.screen==='expired')setTimeout(()=>t.push('esc'),5);}});
  const out=await runPairingFlow(remote,t.io);
  clock.now=Date.UTC(2026,9,26,12,0,0);
  assert.deepEqual(out,{result:'cancelled'});
  assert.deepEqual(screens(t.drawn),['qr','expired']);
  assert.deepEqual(calls.filter(c=>c[0]==='chiudi'),[['chiudi','g1']]);
});

test('the fifth rejection pauses pairing: the pause screen with its time, no new QR',async()=>{
  const {remote,calls,state}=fakeRemote({sbagliati:4});
  const t=io([],{onDraw:(s)=>{if(s.screen==='qr'){state.attese=[{id:'w5',nome:'X',codice:'123456'}];setTimeout(()=>t.push('esc'),5);}}});
  const out=await runPairingFlow(remote,t.io);
  assert.equal(out.result,'paused');
  assert.equal(t.drawn.at(-1)!.screen,'paused');
  assert.match((t.drawn.at(-1) as any).until,/^\d\d:\d\d$/u);
  assert.equal(calls.filter(c=>c[0]==='apri').length,1);
  /* already paused when the flow starts: straight to the pause, the kernel is not asked for a QR */
  const again=fakeRemote({bloccatoFinoA:clock.now+60_000});
  const t2=io([]);
  assert.equal((await runPairingFlow(again.remote,t2.io)).result,'paused');
  assert.equal(again.calls.filter(c=>c[0]==='apri').length,0);
});

test('my own relay: a wrong address is refused and asked again, a right one is saved',async()=>{
  const {remote,calls}=fakeRemote({sceltaFatta:false});
  const typed=(s:string)=>[...s].map(char=>({char}));
  const t=io(['down','enter',...typed('bad'),'enter',...typed('https://relay.example?token=x'),'backspace','enter','esc']);
  const out=await runPairingFlow(remote,t.io);
  assert.deepEqual(out,{result:'cancelled'});
  assert.deepEqual(calls.filter(c=>c[0]==='imposta').map(c=>c[1].relay.url),['bad','https://relay.example?token=']);
  assert.ok(t.drawn.some(s=>s.screen==='relay'&&s.selected==='own'));
});

test('the component is missing: it is downloaded first (the screen says so), and a failure ends with its code',async()=>{
  const {remote,state}=fakeRemote({disponibile:false});
  const t=io(['esc'],{ensure:async(cb)=>{cb('6.3 MB');state.disponibile=true;}});
  assert.deepEqual(await runPairingFlow(remote,t.io),{result:'cancelled'});
  assert.deepEqual(t.drawn[0],{screen:'downloading',size:'6.3 MB'});
  const failing=fakeRemote({disponibile:false});
  const t2=io([],{ensure:async()=>{throw Object.assign(new Error('x'),{code:'REMOTE_COMPONENT_HASH_MISMATCH'});}});
  assert.deepEqual(await runPairingFlow(failing.remote,t2.io),{result:'failed',code:'REMOTE_COMPONENT_HASH_MISMATCH'});
});

test('c copies the pairing link once and says so; Esc closes the QR in the kernel',async()=>{
  const {remote,calls}=fakeRemote();
  const copied:string[]=[];
  const t=io(['c','c','esc'],{copy:async(text)=>{copied.push(text);return true;}});
  assert.deepEqual(await runPairingFlow(remote,t.io),{result:'cancelled'});
  assert.deepEqual(copied,['talos-remote:1?t=g1']);
  assert.ok(t.drawn.some(s=>s.screen==='qr'&&s.copied===true));
  assert.deepEqual(calls.filter(c=>c[0]==='chiudi'),[['chiudi','g1']]);
});
