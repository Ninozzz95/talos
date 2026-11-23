/*
 * A1 — dev-log cure (decisione owner 07/10 09:45, tutti e tre i rimedi ratificati; dossier
 * RICERCA-5x5x5x5-DEVLOG-A1-2026-10-07). RED contract:
 *   QUEUED   a record is QUEUED, not written synchronously per call (Hermes: «loggers only do a
 *            non-blocking enqueue», hermes_logging.py:660-663); it reaches the file on flush
 *            (threshold, timer, manual `developmentLogFlush()`, close, exit). Il process.start dell'init
 *            è pure lui in coda: conta come record.
 *   EXIT     process.exit WITHOUT close still leaves every record on disk (Hermes atexit + Codex WorkerGuard).
 *   CRASH    a fatal crash (uncaughtExceptionMonitor) flushes the queue: the buffered records AND the
 *            fatal record land, because the monitor path flushes synchronously after the fatal log.
 *   SIZE     rotation by size with an IN-MEMORY byte counter (no existsSync/statSync per record),
 *            threshold from TALOS_CLI_DEV_LOG_MAX_BYTES, same .part-N convention.
 *   TIME     rotation by time from TALOS_CLI_DEV_LOG_ROTATE_MS: records flushed after the interval
 *            land in a NEW stamped file.
 *   TOTAL    logging never throws, even when the log folder disappears mid-run (R0 unchanged).
 * ⚠ Stato globale: `initializeDevelopmentLogging` su uno stato ancora APPOGGIATO fa solo context_update
 *   (by design) — ogni test therefore opens in a dir of its own, ASSERTS the returned path lives in that
 *   dir, and its finally ALWAYS closes first, so a failing test cannot poison the next one.
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {closeDevelopmentLogging,developmentLog,developmentLogFlush,developmentLogPath,initializeDevelopmentLogging} from '../../src/diagnostics/development-log.ts';

function freshDir(prefix:string){return mkdtempSync(join(tmpdir(),prefix));}
function rows(dir:string){
  const names=readdirSync(dir).filter(name=>name.endsWith('.jsonl')).sort();
  return names.map(name=>({name,rows:readFileSync(join(dir,name),'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line))}));
}
function setEnv(overrides:Record<string,string|undefined>){for(const [key,value] of Object.entries(overrides)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
function payload(size:number){return 'x'.repeat(Math.max(0,size));}
function openIn(prefix:string,component:string){const dir=freshDir(prefix);const file=initializeDevelopmentLogging({logDir:dir,component});assert.ok(file,'init must return a path');assert.ok(file.startsWith(dir),'init must own THIS dir (a stale open state would context_update elsewhere)');return{dir,file};}
function cleanup(dir:string){closeDevelopmentLogging();setEnv({TALOS_CLI_DEV_LOG_FLUSH_MS:undefined,TALOS_CLI_DEV_LOG_MAX_BYTES:undefined,TALOS_CLI_DEV_LOG_ROTATE_MS:undefined});rmSync(dir,{recursive:true,force:true});}

test('A1-QUEUED: a debug record is queued and reaches the file only on flush, not synchronously per call',()=>{
  setEnv({TALOS_CLI_DEV_LOG_FLUSH_MS:'0'});
  const{dir}=openIn('talos-devlog-queued-','a1-test');
  try{
    developmentLog('a1.queued',{note:'must not be on disk yet'});
    const immediate=rows(dir).flatMap(entry=>entry.rows);
    assert.equal(immediate.length,0,'with the timer disabled and the threshold untouched, nothing is on disk yet');
    developmentLogFlush();
    const flushed=rows(dir).flatMap(entry=>entry.rows);
    assert.equal(flushed.filter(row=>row.event==='a1.queued').length,1,'the manual flush drains the queue');
    assert.ok(flushed.some(row=>row.event==='process.start'),'process.start was queued by the init and flushes with the batch');
  }finally{cleanup(dir);}
});

test('A1-EXIT: process.exit without close still leaves every record on disk (flush-on-exit)',()=>{
  const dir=freshDir('talos-devlog-exit-');
  const loggerUrl=new URL('../../src/diagnostics/development-log.ts',import.meta.url).href;
  const script=`
    import {initializeDevelopmentLogging,developmentLog} from ${JSON.stringify(loggerUrl)};
    initializeDevelopmentLogging({logDir:process.env.A1_DIR,component:'a1-exit'});
    for(let i=0;i<300;i+=1)developmentLog('a1.exit.record',{index:i});
    process.exit(0);
  `;
  try{
    const child=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','--eval',script],
      {env:{...process.env,A1_DIR:dir,TALOS_CLI_DEV_LOG_FLUSH_MS:'0'},encoding:'utf8',timeout:10000});
    assert.equal(child.status,0,child.stderr);
    const all=rows(dir).flatMap(entry=>entry.rows);
    assert.equal(all.filter(row=>row.event==='a1.exit.record').length,300,'flush-on-exit must drain the queue on the exit path');
    assert.ok(all.some(row=>row.event==='process.start'));
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('A1-CRASH: a fatal uncaught exception flushes the queue (buffered rows and the fatal row both land)',()=>{
  const dir=freshDir('talos-devlog-crash-');
  const loggerUrl=new URL('../../src/diagnostics/development-log.ts',import.meta.url).href;
  const script=`
    import {initializeDevelopmentLogging,developmentLog} from ${JSON.stringify(loggerUrl)};
    initializeDevelopmentLogging({logDir:process.env.A1_DIR,component:'a1-crash'});
    developmentLog('a1.crash.before1',{});
    developmentLog('a1.crash.before2',{});
    developmentLog('a1.crash.before3',{});
    setTimeout(()=>{throw new Error('a1 fatal crash');},20);
    setTimeout(()=>{},120);
  `;
  try{
    const child=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','--eval',script],
      {env:{...process.env,A1_DIR:dir,TALOS_CLI_DEV_LOG_FLUSH_MS:'0'},encoding:'utf8',timeout:10000});
    assert.notEqual(child.status,0,'the crash must still crash');
    const all=rows(dir).flatMap(entry=>entry.rows);
    const events=new Set(all.map(row=>row.event));
    for(const name of ['a1.crash.before1','a1.crash.before2','a1.crash.before3'])assert.ok(events.has(name),`buffered record ${name} must survive the crash`);
    assert.ok(events.has('process.uncaughtExceptionMonitor'),'the fatal record must be logged');
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('A1-SIZE: rotation by size with the in-memory counter, threshold from TALOS_CLI_DEV_LOG_MAX_BYTES',()=>{
  setEnv({TALOS_CLI_DEV_LOG_FLUSH_MS:'0',TALOS_CLI_DEV_LOG_MAX_BYTES:'1000'});
  const{dir}=openIn('talos-devlog-size-','a1-size');
  try{
    const sizes=[280,280,280,280];
    for(const [index,size] of sizes.entries()){
      developmentLog('a1.size.record',{index,payload:payload(size)});
      developmentLogFlush();
    }
    const parts=rows(dir);
    assert.ok(parts.length>=2,`rotation by size must produce at least two files, got ${parts.length}`);
    assert.ok(parts.some(entry=>entry.name.endsWith('.jsonl')),'the first file keeps the base name');
    assert.ok(parts.some(entry=>entry.name.endsWith('.part-2.jsonl')),'the rotation uses the .part-2 convention');
    const total=parts.flatMap(entry=>entry.rows);
    assert.equal(total.filter(row=>row.event==='a1.size.record').length,sizes.length,'no record is lost across the rotation');
    assert.equal(total.filter(row=>row.event==='process.start').length,1,'process.start flushed with the first batch');
    const first=parts.find(entry=>entry.name.endsWith('.jsonl'))!;
    assert.ok(first.rows.length>=1,'the first file holds the records that fit (a single record bigger than the threshold is never split)');
    const order=parts.flatMap(entry=>entry.rows).filter(row=>row.event==='a1.size.record').map(row=>row.data.index);
    assert.deepEqual(order,[0,1,2,3],'record order is preserved across the rotation');
  }finally{cleanup(dir);}
});

test('A1-TIME: rotation by time from TALOS_CLI_DEV_LOG_ROTATE_MS lands later records in a new stamped file',async()=>{
  setEnv({TALOS_CLI_DEV_LOG_FLUSH_MS:'0',TALOS_CLI_DEV_LOG_ROTATE_MS:'50'});
  const{dir}=openIn('talos-devlog-time-','a1-time');
  try{
    developmentLog('a1.time.first',{});
    developmentLogFlush();
    await new Promise(resolve=>setTimeout(resolve,120));
    developmentLog('a1.time.second',{});
    developmentLogFlush();
    const parts=rows(dir);
    assert.equal(parts.length,2,`rotation by time must produce a new file, got ${parts.map(entry=>entry.name).join(', ')}`);
    assert.ok(parts[0]!.rows.some(row=>row.event==='a1.time.first'),'the first interval holds the first record');
    assert.ok(parts[0]!.rows.every(row=>row.event!=='a1.time.second'),'the first file never holds records flushed after the interval');
    assert.deepEqual(parts[1]!.rows.map(row=>row.event),['a1.time.second'],'the new file holds the records flushed after the interval');
  }finally{cleanup(dir);}
});

test('A1-TOTAL: logging never throws when the log folder disappears mid-run (R0 unchanged with the queue)',()=>{
  setEnv({TALOS_CLI_DEV_LOG_FLUSH_MS:'0'});
  const{dir,file}=openIn('talos-devlog-total-','a1-total');
  try{
    assert.equal(developmentLogPath(),file);
    developmentLog('a1.total.before',{});
    developmentLogFlush();
    rmSync(dir,{recursive:true,force:true});
    assert.doesNotThrow(()=>developmentLog('a1.total.after-vanish',{}));
    assert.doesNotThrow(()=>developmentLogFlush());
    assert.doesNotThrow(()=>closeDevelopmentLogging());
  }finally{cleanup(dir);}
});

test('A1-EXIT-GUARD: closeDevelopmentLogging flushes the whole queue and developmentLogPath stays stable',()=>{
  setEnv({TALOS_CLI_DEV_LOG_FLUSH_MS:'0'});
  const{dir,file}=openIn('talos-devlog-close-','a1-close');
  try{
    for(let i=0;i<100;i+=1)developmentLog('a1.close.record',{index:i});
    assert.equal(developmentLogPath(),file);
    closeDevelopmentLogging({exitCode:0});
    const all=rows(dir).flatMap(entry=>entry.rows);
    assert.equal(all.filter(row=>row.event==='a1.close.record').length,100,'all 100 records land after close');
    assert.ok(all.some(row=>row.event==='process.start'),'process.start is on disk');
    assert.ok(all.some(row=>row.event==='process.stop'),'process.stop is on disk');
  }finally{cleanup(dir);}
});
