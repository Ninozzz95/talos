/*
 * 0.6.15 T5 («waiting for you · notification sent to “<device>”», owner «Notifica inviata», «Riga discreta»; contract with the Desktop
 * for review 7 B-R2): while this screen waits for the person, the activity line says which paired devices were sent a notification
 * for its conversation. The kernel keeps one record per (device, session) in `stato().sveglie`; the window reads it only while it
 * waits, from its own coordinator when it hosts and by proxy from the hosting window otherwise; never from `talos remote` in a
 * terminal. «Sent», never «received» (RFC 8030 §5).
 */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createHostLease} from '../../src/automations/host-lease.ts';
import {remotePaths} from '../../src/remote/host.ts';
import {REMOTE_HOST_LEASE,createTuiRemote,notifiedOfState} from '../../src/remote/tui-remote.ts';
import {activityRow,activityView} from '../../src/tui/activity-line.ts';
import {displayWidth} from '../../src/tui/text-width.ts';

const folder=()=>{const d=mkdtempSync(join(tmpdir(),'talos-t5-notified-'));return{d,done:()=>rmSync(d,{recursive:true,force:true})};};
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const SVEGLIE=[
  {telefono:'p1',sessione:'s1',alle:'2026-10-27T08:00:00.000Z',nome:'Pad di Nino'},
  {telefono:'p1',sessione:'s2',alle:'2026-10-27T08:00:01.000Z',nome:'Pad di Nino'},
  {telefono:'p2',sessione:'s2',alle:'2026-10-27T08:00:02.000Z',nome:'Phone'},
];
const text=(segments:{text:string}[])=>segments.map(s=>s.text).join('');

test('notifiedOfState: only this screen\'s sessions, one name per device, nothing when the kernel has no records',()=>{
  assert.deepEqual(notifiedOfState({sveglie:SVEGLIE},['s1']),['Pad di Nino']);
  assert.deepEqual(notifiedOfState({sveglie:SVEGLIE},['s2']),['Pad di Nino','Phone']);
  assert.deepEqual(notifiedOfState({sveglie:SVEGLIE},['s1','s2']),['Pad di Nino','Phone'],'one name per device');
  assert.deepEqual(notifiedOfState({sveglie:SVEGLIE},['s3']),[]);
  assert.deepEqual(notifiedOfState({},['s1']),[],'an older kernel without sveglie');
  assert.deepEqual(notifiedOfState({sveglie:[{telefono:'p9',sessione:'s1'}]},['s1']),['device'],'no name: «device»');
});

test('block 8 hunt point 1: a record from an EARLIER wait of the same conversation (the kernel clears it at its next 5 s round) never says «sent» for a new wait',()=>{
  const since=Date.parse('2026-10-27T08:00:10.000Z');
  assert.deepEqual(notifiedOfState({sveglie:SVEGLIE},['s2'],since),[],'both records are from 8–9 s before this wait began');
  assert.deepEqual(notifiedOfState({sveglie:[{telefono:'p1',sessione:'s1',alle:'2026-10-27T08:00:10.400Z',nome:'Pad'}]},['s1'],since),['Pad'],'sent after it began');
  assert.deepEqual(notifiedOfState({sveglie:[{telefono:'p1',sessione:'s1',alle:'2026-10-27T08:00:09.500Z',nome:'Pad'}]},['s1'],since),['Pad'],'within the 1 s of slack between two clocks');
  assert.deepEqual(notifiedOfState({sveglie:[{telefono:'p1',sessione:'s1',nome:'Pad'}]},['s1'],since),[],'no readable time: not counted for a timed wait');
  /* block 8 E-R1: the kernel's real shape — `alle` is a number of ms (sveglia.mjs segnaInviata, clock()) */
  assert.deepEqual(notifiedOfState({sveglie:[{telefono:'p1',sessione:'s1',alle:since+400,nome:'Pad'}]},['s1'],since),['Pad'],'a number after the start counts');
  assert.deepEqual(notifiedOfState({sveglie:[{telefono:'p1',sessione:'s1',alle:since-8_000,nome:'Pad'}]},['s1'],since),[],'a number from an earlier wait does not');
  assert.deepEqual(notifiedOfState({sveglie:[{telefono:'p1',sessione:'s1',alle:Number.NaN,nome:'Pad'}]},['s1'],since),[]);
});

test('the activity line: one device by name in the note\'s place, more by count, a long name shortened; nothing sent: the note',()=>{
  const live={kind:'waiting',startedAt:0} as any;const mark={key:'w',start:1000};
  const state={running:true,waitingForPerson:true,reasoning:null,tools:[]} as any;
  const one=text(activityRow(activityView(state,live,mark,0,['Pad di Nino'])!,{now:13_000,cols:80,glyph:'⠋'}));
  assert.match(one,/Waiting for your answer · 12s · notification sent to “Pad di Nino”$/u);
  assert.doesNotMatch(one,/paused/u);
  assert.match(text(activityRow(activityView(state,live,mark,0,['Pad','Phone'])!,{now:13_000,cols:80,glyph:'⠋'})),/notification sent to 2 devices$/u);
  const long=text(activityRow(activityView(state,live,mark,0,['A very long device name that goes on and on'])!,{now:13_000,cols:80,glyph:'⠋'}));
  assert.match(long,/“A very long device…”$/u);
  assert.ok(long.length<=80,'fits 80 columns');
  assert.match(text(activityRow(activityView(state,live,mark,0)!,{now:13_000,cols:80,glyph:'⠋'})),/the turn is paused until you answer$/u);
  assert.doesNotMatch(text(activityRow(activityView(state,live,mark,0,['Pad'])!,{now:13_000,cols:80,glyph:'⠋'})),/received/u,'«sent», never «received»');
});

test('block 8 E-R3: after a long wait the line still fits its columns (display width, not characters): the name shrinks first, then the count or «notification sent»',()=>{
  const live={kind:'waiting',startedAt:0} as any;const state={running:true,waitingForPerson:true,reasoning:null,tools:[]} as any;
  for(const waited of [12_000,59*60_000+59_000,1560*60_000]){
    for(const names of [['Pad di Nino'],['A very long device name that goes on and on'],['平板电脑设备的名字很长很长'],['Pad','Phone','Laptop']]){
      for(const cols of [80,60]){
        const line=text(activityRow(activityView(state,live,{key:'w',start:1000},0,names)!,{now:1000+waited,cols,glyph:'⠋'}));
        assert.ok(displayWidth(line)<=cols,`${displayWidth(line)} > ${cols}: ${line}`);
        assert.match(line,/notification sent/u,'it still says a notification was sent');
        assert.doesNotMatch(line,/“[^”]{0,2}…”/u,'never a name cut to almost nothing: then «notification sent» alone');
      }
    }
  }
  const wide=text(activityRow(activityView(state,live,{key:'w',start:1000},0,['Pad di Nino'])!,{now:1000+59*60_000+59_000,cols:80,glyph:'⠋'}));
  assert.match(wide,/“Pad di Nino”$/u,'a short name still fits whole after an hour at 80 columns');
});

function hostWindow(data:string,stato:()=>any){
  let beat!:()=>void;let reads=0;
  const r=createTuiRemote({dataRoot:data,label:'site',
    lease:createHostLease({dir:remotePaths(data).dir,role:'serve',fileName:REMOTE_HOST_LEASE,label:'site',kind:'window',pid:101,isAlive:()=>true,elevated:()=>false}),
    createHost:async()=>({remote:{riprendi:async()=>{},stato:async()=>{reads++;return stato();},ascoltaStato:()=>()=>{},cartelle:{ascolta:()=>()=>{}}},call:async()=>({stato:200,dati:{}}),stop:async()=>{}}) as any,
    turnedOn:()=>true,elevated:async()=>false,registrations:()=>[],alive:()=>true,
    setInterval:(fn)=>{beat=fn;return{unref(){}};},clearInterval:()=>{}});
  return{r,beat:async()=>{beat();await pause(30);},reads:()=>reads};
}

test('the hosting window: «notified» for its conversation only while it waits; cleared when it stops waiting; no reads while it does not',async()=>{
  const f=folder();
  try{
    let rows=SVEGLIE;
    const w=hostWindow(f.d,()=>({inLinea:[],telefoni:[],consensi:[],sveglie:rows}));
    let waiting=false;
    w.r.setAttached(()=>['s1']);w.r.setWaiting(()=>waiting);
    await w.r.start();
    assert.equal(w.r.getSnapshot().state,'host');
    assert.deepEqual(w.r.getSnapshot().notified??[],[],'not waiting: nothing');
    const before=w.reads();await w.beat();
    assert.equal(w.reads(),before,'not waiting: the beat reads nothing for it');
    waiting=true;await w.beat();
    assert.deepEqual(w.r.getSnapshot().notified,['Pad di Nino']);
    /* the kernel cleared the record (the wait was answered on the device) */
    rows=[];await w.beat();
    assert.deepEqual(w.r.getSnapshot().notified,[]);
    rows=SVEGLIE;await w.beat();
    assert.deepEqual(w.r.getSnapshot().notified,['Pad di Nino']);
    waiting=false;await w.beat();
    assert.deepEqual(w.r.getSnapshot().notified,[],'answered here: gone at once on the next beat');
    /* a new wait 10 s after those records: the kernel has not cleared them yet, and they do not count */
    w.r.setWaiting(()=>Date.parse('2026-10-27T08:00:12.000Z'));await w.beat();
    assert.deepEqual(w.r.getSnapshot().notified,[]);
    rows=[...SVEGLIE,{telefono:'p1',sessione:'s1',alle:'2026-10-27T08:00:15.000Z',nome:'Pad di Nino'}];await w.beat();
    assert.deepEqual(w.r.getSnapshot().notified,['Pad di Nino'],'the new notification for this wait');
    await w.r.stop();
  }finally{f.done();}
});

function otherHolds(data:string,kind:'window'|'command',elevated=false){
  const dir=remotePaths(data).dir;mkdirSync(dir,{recursive:true});
  const now=new Date().toISOString();
  writeFileSync(join(dir,REMOTE_HOST_LEASE),JSON.stringify({pid:process.pid,token:'HOST',role:'serve',kind,label:'ops',startedAt:now,beatAt:now,...(elevated?{elevated:true}:{})}));
}
function guestWindow(data:string,answer:()=>any,elevated=false){
  let beat!:()=>void;const asked:any[]=[];
  const r=createTuiRemote({dataRoot:data,label:'site',
    lease:createHostLease({dir:remotePaths(data).dir,role:'serve',fileName:REMOTE_HOST_LEASE,label:'site',kind:'window',pid:202,isAlive:()=>true,elevated:()=>elevated}),
    createHost:async()=>{throw new Error('never a host here');},turnedOn:()=>true,elevated:async()=>elevated,registrations:()=>[],alive:()=>true,
    connectHost:async()=>({closed:false,request:async(op:string,args:any)=>{asked.push([op,args]);return answer();},close(){}}) as any,
    setInterval:(fn)=>{beat=fn;return{unref(){}};},clearInterval:()=>{}});
  return{r,asked,beat:async()=>{beat();await pause(30);}};
}

test('another window hosts: read by proxy (a read, with the lease token) while this one waits; `talos remote` in a terminal: nothing',async()=>{
  const f=folder();
  try{
    otherHolds(f.d,'window');
    const w=guestWindow(f.d,()=>({inLinea:[],telefoni:[],sveglie:SVEGLIE}));
    w.r.setAttached(()=>['s2']);let waiting=true;w.r.setWaiting(()=>waiting);
    await w.r.start();
    assert.equal(w.r.getSnapshot().state,'elsewhere');
    assert.deepEqual(w.r.getSnapshot().notified,['Pad di Nino','Phone']);
    assert.equal(w.asked[0][1].method,'stato');assert.equal(w.asked[0][1].token,'HOST');
    waiting=false;await w.beat();
    assert.deepEqual(w.r.getSnapshot().notified,[]);
    const asked=w.asked.length;await w.beat();
    assert.equal(w.asked.length,asked,'not waiting: no calls to the host');
    await w.r.stop();
  }finally{f.done();}
  const g=folder();
  try{
    otherHolds(g.d,'command');
    const w=guestWindow(g.d,()=>({sveglie:SVEGLIE}));
    w.r.setAttached(()=>['s2']);w.r.setWaiting(()=>true);
    await w.r.start();
    assert.deepEqual(w.r.getSnapshot().notified??[],[]);
    assert.equal(w.asked.length,0,'talos remote has no channel: never asked');
    await w.r.stop();
  }finally{g.done();}
});

test('an administrator window hosts: a normal window does not try its channel (Windows would refuse it); an administrator one reads',async()=>{
  const f=folder();
  try{
    otherHolds(f.d,'window',true);
    const normal=guestWindow(f.d,()=>({sveglie:SVEGLIE}));
    normal.r.setAttached(()=>['s1']);normal.r.setWaiting(()=>true);
    await normal.r.start();
    assert.equal(normal.asked.length,0);
    assert.deepEqual(normal.r.getSnapshot().notified??[],[]);
    await normal.r.stop();
    const admin=guestWindow(f.d,()=>({sveglie:SVEGLIE}),true);
    admin.r.setAttached(()=>['s1']);admin.r.setWaiting(()=>true);
    await admin.r.start();
    assert.deepEqual(admin.r.getSnapshot().notified,['Pad di Nino']);
    await admin.r.stop();
  }finally{f.done();}
});

test('a host that does not answer: the last answer stays, and the beat goes on',async()=>{
  const f=folder();
  try{
    otherHolds(f.d,'window');
    let fail=false;
    const w=guestWindow(f.d,()=>{if(fail)throw Object.assign(new Error('gone'),{code:'REMOTE_HOST_UNREACHABLE'});return{sveglie:SVEGLIE};});
    w.r.setAttached(()=>['s1']);w.r.setWaiting(()=>true);
    await w.r.start();
    assert.deepEqual(w.r.getSnapshot().notified,['Pad di Nino']);
    fail=true;await w.beat();
    assert.deepEqual(w.r.getSnapshot().notified,['Pad di Nino']);
    assert.equal(w.r.getSnapshot().state,'elsewhere');
    await w.r.stop();
  }finally{f.done();}
});
