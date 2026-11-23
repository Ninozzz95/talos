/*
 * 0.6.6 (the 0.6.6 review's F1) — one process hosts a profile's automations (automations/host-lease.ts): the lease is taken by
 * one, refused to the others with who holds it, taken over only when its holder is gone or frozen past HOST_STALE_MS, never
 * released or beaten by a process that lost it; the requests of the others are taken once and answered once.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,utimesSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {HOST_BEAT_MS,HOST_STALE_CONFIRM_MS,HOST_STALE_MS,RESULT_KEEP_MS,createHostLease,processAlive} from '../../src/automations/host-lease.ts';

function dir(t:{after:(fn:()=>void)=>void}){const d=mkdtempSync(join(tmpdir(),'talos-host-lease-'));t.after(()=>rmSync(d,{recursive:true,force:true}));return d;}

test('one holder: the second is refused and told who holds; after the release it takes the lease',t=>{
  const d=dir(t);
  const a=createHostLease({dir:d,role:'serve',pid:1001,isAlive:()=>true});const b=createHostLease({dir:d,role:'run',pid:1002,isAlive:()=>true});
  assert.deepEqual(a.tryAcquire(),{ok:true});
  const refused=b.tryAcquire();assert.equal(refused.ok,false);assert.equal(!refused.ok&&refused.holder.pid,1001);assert.equal(!refused.ok&&refused.holder.role,'serve');
  b.release();assert.equal(a.holder()?.pid,1001,'a release by a process that does not hold the lease leaves it');
  a.release();assert.equal(a.holder(),null);
  assert.deepEqual(b.tryAcquire(),{ok:true});assert.equal(b.holder()?.pid,1002);
});

test('a holder whose process is gone, or whose beat is older than HOST_STALE_MS, is taken over; a fresh live one is not',t=>{
  const d=dir(t);let alive=true;let now=Date.parse('2026-10-15T09:00:00Z');
  const a=createHostLease({dir:d,role:'serve',pid:2001,isAlive:()=>alive,now:()=>now});
  const b=createHostLease({dir:d,role:'serve',pid:2002,isAlive:pid=>pid===2002||alive,now:()=>now});
  assert.equal(a.tryAcquire().ok,true);
  now+=HOST_STALE_MS-1_000;assert.equal(b.tryAcquire().ok,false,'alive and beaten less than HOST_STALE_MS ago');
  assert.equal(a.beat(),true);now+=HOST_STALE_MS-1_000;assert.equal(b.tryAcquire().ok,false,'the beat keeps it');
  alive=false;assert.equal(b.tryAcquire().ok,true,'its process is gone');
  a.release();assert.equal(b.holder()?.pid,2002,'the old holder\'s release does not remove the new lease');

  assert.equal(a.beat(),false,'the old holder sees it lost the lease');assert.equal(b.holder()?.pid,2002);
  alive=true;let clock=0;const c=createHostLease({dir:d,role:'run',pid:2003,isAlive:()=>true,now:()=>now,monotonic:()=>clock});
  now+=HOST_STALE_MS+1;
  assert.equal(c.tryAcquire().ok,false,'a live holder whose beat looks old is not taken at the first look (a sleep, a clock jump)');
  clock+=HOST_STALE_CONFIRM_MS;assert.equal(c.tryAcquire().ok,true,'the same beat, unchanged for HOST_STALE_CONFIRM_MS of the reader\'s own time: frozen, or a reused process number');
});

/* the second review of 0.6.6 (N1): after a laptop's sleep EVERY beat looks old; a live host that beats again within its period
   is never taken over, and a process waiting on it never reads it as gone */
test('after a sleep, a live host that beats again is never taken over nor read as gone',t=>{
  const d=dir(t);let now=Date.parse('2026-10-15T09:00:00Z');let clock=0;
  const host=createHostLease({dir:d,role:'serve',pid:3101,isAlive:()=>true,now:()=>now});
  const waiter=createHostLease({dir:d,role:'run',pid:3102,isAlive:()=>true,now:()=>now,monotonic:()=>clock});
  assert.equal(host.tryAcquire().ok,true);
  now+=10*60_000;/* ten minutes asleep: the waiter wakes first */
  assert.ok(waiter.holder(),'the first look after the sleep still sees the host');assert.equal(waiter.tryAcquire().ok,false);
  clock+=HOST_BEAT_MS-1;now+=HOST_BEAT_MS-1;assert.equal(host.beat(),true,'the host wakes and beats');
  clock+=HOST_STALE_CONFIRM_MS;now+=1_000;
  assert.ok(waiter.holder(),'a new beat: not stale');assert.equal(waiter.tryAcquire().ok,false);
  /* a clock jump on the waiter's side: every beat it reads looks old; each NEW beat starts its count again */
  const skew=60*60_000;const skewed=createHostLease({dir:d,role:'run',pid:3103,isAlive:()=>true,now:()=>now+skew,monotonic:()=>clock});
  assert.ok(skewed.holder(),'first look');
  clock+=HOST_STALE_CONFIRM_MS-1;now+=HOST_BEAT_MS;assert.equal(host.beat(),true);
  clock+=2;assert.ok(skewed.holder(),'the beat changed: the count starts again, the host is not gone');
  clock+=HOST_STALE_CONFIRM_MS;assert.equal(skewed.holder(),null,'the same beat for the whole count: gone');
});

test('an unreadable lease file is held while it is young (being written), and taken once it is as old as a stale beat',t=>{
  const d=dir(t);const file=join(d,'automation-host.json');writeFileSync(file,'');
  const a=createHostLease({dir:d,role:'serve',pid:3001,isAlive:()=>true});
  assert.equal(a.tryAcquire().ok,false);
  const old=(Date.now()-HOST_STALE_MS-5_000)/1000;utimesSync(file,old,old);
  assert.equal(a.tryAcquire().ok,true);
});

test('requests: taken once, answered once; a request withdrawn before it is taken is not taken, one taken cannot be withdrawn',t=>{
  const d=dir(t);
  const host=createHostLease({dir:d,role:'serve',pid:4001,isAlive:()=>true});const asker=createHostLease({dir:d,role:'run',pid:4002,isAlive:()=>true});
  const first=asker.send('run','auto-1');const second=asker.send('stop','auto-2');const third=asker.send('run','auto-3');
  assert.equal(asker.withdraw(third),true);
  const taken=host.take();assert.deepEqual(taken.map(r=>[r.requestId,r.op,r.id]).sort(),[[first,'run','auto-1'],[second,'stop','auto-2']].sort());
  assert.deepEqual(host.take(),[],'taken once');assert.equal(asker.withdraw(first),false,'already taken');
  assert.equal(asker.result(first),null,'no answer yet');
  host.answer(first,{ok:true,runId:'r1',sessionId:'s1'});
  assert.deepEqual(asker.result(first),{ok:true,runId:'r1',sessionId:'s1'});assert.equal(asker.result(first),null,'read once');
});

test('processAlive: this process is, a number that cannot be one is not',()=>{
  assert.equal(processAlive(process.pid),true);assert.equal(processAlive(0),false);assert.equal(processAlive(-5),false);assert.equal(processAlive(1.5),false);
});

/* the second review of 0.6.6 (N9): answers nobody came for (an asker that died) do not pile up */
test('an answer nobody read is removed once it is RESULT_KEEP_MS old; a fresh one stays',t=>{
  const d=dir(t);
  const host=createHostLease({dir:d,role:'serve',pid:4101,isAlive:()=>true});const asker=createHostLease({dir:d,role:'run',pid:4102,isAlive:()=>true});
  const old=asker.send('run','a');host.take();host.answer(old,{ok:true});
  const past=(Date.now()-RESULT_KEEP_MS-60_000)/1000;utimesSync(join(d,'requests',`${old}.result.json`),past,past);
  const fresh=asker.send('run','b');host.take();host.answer(fresh,{ok:true});
  host.take();
  assert.equal(asker.result(old),null,'the old answer is gone');assert.deepEqual(asker.result(fresh),{ok:true},'the fresh one is still there');
});

/* the fifth review of 0.6.6: this process's beats are atomic, so text that does not parse is another process's create in the middle
   of a takeover — not this process's lease */
test('a lease file that does not parse is not this process\'s',t=>{
  const d=dir(t);const lease=createHostLease({dir:d,role:'serve',isAlive:()=>true});assert.equal(lease.tryAcquire().ok,true);
  writeFileSync(join(d,'automation-host.json'),'{"pid":12,"tok');
  assert.equal(lease.owns(),false);
});
