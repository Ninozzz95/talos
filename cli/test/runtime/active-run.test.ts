import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resolveCliPaths} from '../../src/paths.ts';
import {MAX_MARKER_AGE_MS,hasActiveRuns,parseProcStat,registerActiveRun,reconcileActiveRuns,releaseOnSignals,signalsForPlatform} from '../../src/runtime/active-run.ts';

async function fixture(){const home=await mkdtemp(join(tmpdir(),'talos-active-'));const paths=resolveCliPaths({XDG_CONFIG_HOME:join(home,'c'),XDG_STATE_HOME:join(home,'s'),XDG_CACHE_HOME:join(home,'x')},'linux',home);await mkdir(paths.dataRoot,{recursive:true});return{home,paths};}

test('active run marker blocks updates until released',async()=>{
  const f=await fixture();
  const release=await registerActiveRun(f.paths,{projectRoot:'/repo',sessionId:'s1'});
  assert.equal(await hasActiveRuns(f.paths),true);
  const marker=JSON.parse(await readFile(join(f.paths.dataRoot,'active-runs',`${process.pid}.json`),'utf8'));
  assert.equal(marker.pid,process.pid);assert.equal(marker.sessionId,'s1');
  await release();
  assert.equal(await hasActiveRuns(f.paths),false);
});

test('stale active run markers are removed and do not block update',async()=>{
  const f=await fixture();const dir=join(f.paths.dataRoot,'active-runs');await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'999999.json'),JSON.stringify({pid:999999,startedAt:new Date().toISOString()}));
  assert.equal(await hasActiveRuns(f.paths,{isProcessAlive:()=>false}),false);
});

/* R5b D3: the TUI's /undo asks whether ANOTHER TALOS works on the same project; main.ts registers the TUI's own process for
   its whole life, so without these filters /undo inside the TUI would always be refused. A marker without a project counts. */
test('R5b D3: other runs of the same project, not this process and not another project',async()=>{
  const f=await fixture();const dir=join(f.paths.dataRoot,'active-runs');await mkdir(dir,{recursive:true});
  await registerActiveRun(f.paths,{projectRoot:'/repo'});
  const only={exceptPid:process.pid,projectRoot:'/repo',isProcessAlive:()=>true};
  assert.equal(await hasActiveRuns(f.paths,only),false,'this process alone is not another run');
  await writeFile(join(dir,'424242.json'),JSON.stringify({pid:424242,projectRoot:'/other',startedAt:new Date().toISOString()}));
  assert.equal(await hasActiveRuns(f.paths,only),false,'another project does not count');
  await writeFile(join(dir,'434343.json'),JSON.stringify({pid:434343,projectRoot:'/repo',startedAt:new Date().toISOString()}));
  assert.equal(await hasActiveRuns(f.paths,only),true,'another TALOS on the same project');
  await writeFile(join(dir,'434343.json'),JSON.stringify({pid:434343,startedAt:new Date().toISOString()}));
  assert.equal(await hasActiveRuns(f.paths,only),true,'a run that does not say its project counts');
  assert.equal(await hasActiveRuns(f.paths,{isProcessAlive:()=>true}),true,'without filters, as before');
});

/* F-022/RIF-1 (owner 05/10): a window closed or a second Ctrl+C leaves the marker behind, and hasActiveRuns only
   cleans when someone asks; reconcileActiveRuns is the boot-time sweep that trusts nothing on disk. */
test('F-022: reconcileActiveRuns removes dead, unparsable and over-age markers, keeps the live ones',async()=>{
  const f=await fixture();const dir=join(f.paths.dataRoot,'active-runs');await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'1111.json'),JSON.stringify({pid:1111,startedAt:new Date().toISOString()}));
  await writeFile(join(dir,'2222.json'),JSON.stringify({pid:2222,startedAt:new Date().toISOString()}));
  await writeFile(join(dir,'3333.json'),JSON.stringify({pid:3333,startedAt:new Date(Date.now()-31*24*60*60*1000).toISOString()}));
  await writeFile(join(dir,'4444.json'),'not json'); /* a marker-shaped file with junk content */
  await writeFile(join(dir,'not-a-marker.txt'),'{"pid":1}'); /* not marker-shaped: ignored by name */
  const removed=await reconcileActiveRuns(f.paths,{isProcessAlive:(pid)=>pid===1111||pid===3333,now:()=>Date.now()+60_000});
  assert.equal(removed,3,'dead 2222, over-age-but-alive 3333, unparsable 4444.json');
  await readFile(join(dir,'1111.json'),'utf8'); /* the live, fresh marker survives */
});

test('F-022: reconcileActiveRuns on a missing folder reports zero and creates nothing',async()=>{
  const f=await fixture();
  assert.equal(await reconcileActiveRuns(f.paths,{isProcessAlive:()=>true}),0);
  await assert.rejects(()=>readFile(join(f.paths.dataRoot,'active-runs','x.json')),{code:'ENOENT'});
});

/* D2: SIGHUP (console closed on Windows), SIGTERM and SIGBREAK must release the marker before exiting 128+signal.
   D-3.4 (review 2): the exit code is emitted once — a real second signal cannot run again, the process is already gone. */
test('F-022: releaseOnSignals releases then exits 128+signal, and the uninstaller removes the handlers',async()=>{
  const handlers=new Map<string,()=>void>();
  const install=(signal:string,handler:()=>void)=>{handlers.set(signal,handler);return()=>handlers.delete(signal);};
  const released:string[]=[];const codes:number[]=[];
  const off=releaseOnSignals(['SIGHUP','SIGTERM'],{release:()=>{released.push('x');},exit:(code)=>codes.push(code),install});
  handlers.get('SIGHUP')!();
  await new Promise<void>((resolve)=>setImmediate(resolve));
  assert.deepEqual(released,['x'],'the marker is released before the exit');
  assert.deepEqual(codes,[129],'128+1 for SIGHUP');
  handlers.get('SIGTERM')!();
  await new Promise<void>((resolve)=>setImmediate(resolve));
  assert.equal(released.length,1,'after the exit nothing fires again: the process is gone');
  assert.deepEqual(codes,[129],'the exit code is emitted once');
  off();
  assert.equal(handlers.size,0,'the uninstaller removes every handler');
});

/* Review F-022 blocker 2: writeFile creates the file before the content lands; a boot sweep running in that window sees
   an unparsable file and would delete a live run's marker. A young unparsable file gets a grace window; an old one is junk. */
test('F-022 review: a marker caught mid-write is spared by the grace window, an old junk file is swept',async()=>{
  const f=await fixture();const dir=join(f.paths.dataRoot,'active-runs');await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'5555.json'),''); /* exactly what a reader sees between create and write */
  const now=Date.now();
  const fresh={stat:async()=>({mtimeMs:now-1000}),now:()=>now};
  const old={stat:async()=>({mtimeMs:now-60_000}),now:()=>now};
  assert.equal(await reconcileActiveRuns(f.paths,fresh),0,'one second old: maybe a live marker mid-write, spared');
  assert.equal(await hasActiveRuns(f.paths,fresh),true,'while spared it still counts as an active run');
  assert.equal(await reconcileActiveRuns(f.paths,old),1,'past the grace window the junk is removed');
  assert.equal(await hasActiveRuns(f.paths,old),false,'and nothing is left to block an update');
});

/* Review F-022 blocker 1 hardening: SIGBREAK exists on Windows only, so the installed list follows the platform. */
test('F-022 review: the signal list follows the platform',()=>{
  assert.deepEqual([...signalsForPlatform('win32')],['SIGHUP','SIGTERM','SIGBREAK']);
  assert.deepEqual([...signalsForPlatform('linux')],['SIGHUP','SIGTERM']);
  assert.deepEqual([...signalsForPlatform('darwin')],['SIGHUP','SIGTERM']);
  assert.ok(signalsForPlatform().includes('SIGTERM'),'the default uses the running platform');
});

/* Review F-022: the 30-day ratchet is `>` — exactly at the limit the marker is still fresh, one ms past it is stale. */
test('F-022 review: exactly 30 days is still fresh, one millisecond more is stale',async()=>{
  const f=await fixture();const dir=join(f.paths.dataRoot,'active-runs');await mkdir(dir,{recursive:true});
  const now=Date.now();const limit=MAX_MARKER_AGE_MS;
  await writeFile(join(dir,'6666.json'),JSON.stringify({pid:6666,startedAt:new Date(now-limit).toISOString()}));
  assert.equal(await hasActiveRuns(f.paths,{isProcessAlive:()=>true,now:()=>now}),true,'exactly at the limit: fresh');
  await writeFile(join(dir,'6666.json'),JSON.stringify({pid:6666,startedAt:new Date(now-limit-1).toISOString()}));
  assert.equal(await hasActiveRuns(f.paths,{isProcessAlive:()=>true,now:()=>now}),false,'one ms past: stale');
});

/* Review F-022: if the installer fails mid-way the already-installed handlers must not leak. */
test('F-022 review: an installer that fails mid-way leaves no handler behind',()=>{
  const handlers=new Map<string,()=>void>();
  const install=(signal:string,handler:()=>void)=>{if(signal==='SIGBREAK')throw new Error('no such signal');handlers.set(signal,handler);return()=>handlers.delete(signal);};
  assert.throws(()=>releaseOnSignals(['SIGHUP','SIGTERM','SIGBREAK'],{release:()=>{},install}),/no such signal/u,'the failure surfaces');
  assert.equal(handlers.size,0,'the handlers installed before the failure are rolled back');
});

/* Review F-022 point 4: a well-formed marker without a usable startedAt must not dodge the 30-day ratchet — the file's
   own mtime is the fallback clock, so a corrupt marker cannot block an update for ever. */
test('F-022 review: a marker without startedAt ages by its file mtime',async()=>{
  const f=await fixture();const dir=join(f.paths.dataRoot,'active-runs');await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'7777.json'),JSON.stringify({pid:7777}));
  const now=Date.now();
  assert.equal(await hasActiveRuns(f.paths,{isProcessAlive:()=>true,now:()=>now}),true,'young on disk: still active');
  const stale={isProcessAlive:()=>true,now:()=>now,stat:async()=>({mtimeMs:now-MAX_MARKER_AGE_MS-86_400_000})};
  assert.equal(await hasActiveRuns(f.paths,stale),false,'31 days by mtime: stale even without startedAt');
});

/* Review 2 D-3.4: the exit must not queue behind a hung release. The first signal waits (ordered release before exit);
   a SECOND signal fires the idempotent release again but exits at once — TERM stays able to kill the CLI. */
test('F-022 review D-3.4: a second signal while the release hangs must not queue behind it',async()=>{
  const handlers=new Map<string,()=>void>();
  const install=(signal:string,handler:()=>void)=>{handlers.set(signal,handler);return()=>handlers.delete(signal);};
  let releaseCalls=0;const codes:number[]=[];
  let unblock!:()=>void;const hung=new Promise<void>((resolve)=>{unblock=resolve;});
  const off=releaseOnSignals(['SIGTERM'],{release:()=>{releaseCalls+=1;return hung;},exit:(code)=>codes.push(code),install});
  handlers.get('SIGTERM')!();
  await new Promise<void>((resolve)=>setImmediate(resolve));
  assert.deepEqual(codes,[],'the first signal waits: release comes before exit');
  handlers.get('SIGTERM')!(); /* the second TERM must not wait for the hung rm */
  assert.deepEqual(codes,[143],'the second signal exits immediately, 128+15');
  unblock();
  await new Promise<void>((resolve)=>setImmediate(resolve));
  assert.deepEqual(codes,[143],'still one exit code: the process cannot exit twice');
  assert.equal(releaseCalls,2,'both signals fired the idempotent release');
  off();
});

/* Review 2 D-3.4: a release that never resolves (rm stuck on a slow mount) cannot hold the exit hostage for ever. */
test('F-022 review D-3.4: a release that never resolves cannot block the exit for ever',async()=>{
  const handlers=new Map<string,()=>void>();
  const install=(signal:string,handler:()=>void)=>{handlers.set(signal,handler);return()=>handlers.delete(signal);};
  const codes:number[]=[];
  const off=releaseOnSignals(['SIGTERM'],{release:()=>new Promise<void>(()=>{}),exit:(code)=>codes.push(code),install,releaseTimeoutMs:10});
  handlers.get('SIGTERM')!();
  assert.deepEqual(codes,[],'not immediately: the release has its chance first');
  await new Promise<void>((resolve)=>setTimeout(resolve,80));
  assert.deepEqual(codes,[143],'the bounded wait expires and the exit happens anyway');
  off();
});

/* Review 2 D-3.5: SIGINT is mapped in SIGNAL_NUMBERS, so releaseOnSignals(['SIGINT']) exits 130 like Ctrl+C always did. */
test('F-022 review D-3.5: a SIGINT release exits 130, not the 129 fallback',async()=>{
  const handlers=new Map<string,()=>void>();
  const install=(signal:string,handler:()=>void)=>{handlers.set(signal,handler);return()=>handlers.delete(signal);};
  const codes:number[]=[];
  const off=releaseOnSignals(['SIGINT'],{release:()=>{},exit:(code)=>codes.push(code),install});
  handlers.get('SIGINT')!();
  await new Promise<void>((resolve)=>setImmediate(resolve));
  assert.deepEqual(codes,[130],'128+2 for SIGINT');
  off();
});

/* Review 2 / RESERVE-V: exit 149 (128+21, SIGBREAK) was never asserted anywhere. */
test('F-022 review: a SIGBREAK release exits 149',async()=>{
  const handlers=new Map<string,()=>void>();
  const install=(signal:string,handler:()=>void)=>{handlers.set(signal,handler);return()=>handlers.delete(signal);};
  const codes:number[]=[];
  const off=releaseOnSignals(['SIGBREAK'],{release:()=>{},exit:(code)=>codes.push(code),install});
  handlers.get('SIGBREAK')!();
  await new Promise<void>((resolve)=>setImmediate(resolve));
  assert.deepEqual(codes,[149],'128+21 for SIGBREAK');
  off();
});

/* Review 2 / RESERVE-V: a release that throws must not swallow the exit — the marker stays released-or-not, but the
   process still leaves with the signal code. */
test('F-022 review: a release that throws does not prevent the exit',async()=>{
  const handlers=new Map<string,()=>void>();
  const install=(signal:string,handler:()=>void)=>{handlers.set(signal,handler);return()=>handlers.delete(signal);};
  const codes:number[]=[];
  const off=releaseOnSignals(['SIGTERM'],{release:()=>{throw new Error('rm exploded');},exit:(code)=>codes.push(code),install});
  handlers.get('SIGTERM')!();
  await new Promise<void>((resolve)=>setImmediate(resolve));
  assert.deepEqual(codes,[143],'the exit happens even though the release threw');
  off();
});

/* Review 2 D-3.2: deciding and unlinking are two steps — if the marker is rewritten in between (pid reused by a new
   TALOS that registers again), the sweep must not delete the new owner's protection. */
test('F-022 review D-3.2: a marker rewritten between the read and the unlink is left alone',async()=>{
  const f=await fixture();const dir=join(f.paths.dataRoot,'active-runs');await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'8888.json'),JSON.stringify({pid:8888,startedAt:new Date().toISOString()}));
  const readMtime=Date.now()-1000;const rewrittenMtime=Date.now();
  let statCalls=0;const stat=async()=>{statCalls+=1;return{mtimeMs:statCalls===1?readMtime:rewrittenMtime};};
  const removed=await reconcileActiveRuns(f.paths,{isProcessAlive:()=>false,stat});
  assert.equal(removed,0,'the mtime moved since our snapshot: someone rewrote it, not ours to unlink');
  await readFile(join(dir,'8888.json'),'utf8'); /* the new owner keeps its protection */
});

/* Review 2 D-3.7: a file another concurrent sweep already took must not be counted as removed by this one. */
test('F-022 review D-3.7: removed counts only markers this sweep truly unlinked',async()=>{
  const f=await fixture();const dir=join(f.paths.dataRoot,'active-runs');await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'777.json'),'not json'); /* unparsable: the removal path runs */
  const stat=async()=>{throw Object.assign(new Error('already gone'),{code:'ENOENT'});}; /* what a lost race looks like */
  const removed=await reconcileActiveRuns(f.paths,{stat});
  assert.equal(removed,0,'the file was already gone when we looked: nothing was removed by this sweep');
  /* an rm that fails (EACCES/EPERM — the D-3.1 case) is equally not a removal: the marker survives and is not counted */
  const g=await fixture();const dir2=join(g.paths.dataRoot,'active-runs');await mkdir(dir2,{recursive:true});
  await writeFile(join(dir2,'778.json'),'not json');
  let rmCalls=0;const rm=async()=>{rmCalls+=1;throw Object.assign(new Error('denied'),{code:'EACCES'});};
  const oldMtime=Date.now()-60_000;
  const old={stat:async()=>({mtimeMs:oldMtime}),rm};
  assert.equal(await reconcileActiveRuns(g.paths,old),0,'the unlink failed: the marker is still there, not counted');
  assert.equal(rmCalls,1,'the sweep did try to unlink it');
  await readFile(join(dir2,'778.json'),'utf8'); /* and it is still on disk */
});

/* RESERVE-V: hasActiveRuns on a missing folder was never tested directly. */
test('F-022 review: hasActiveRuns on a missing folder is false and creates nothing',async()=>{
  const f=await fixture();
  assert.equal(await hasActiveRuns(f.paths,{isProcessAlive:()=>true}),false);
  await assert.rejects(()=>readFile(join(f.paths.dataRoot,'active-runs')),{code:'ENOENT'});
});
