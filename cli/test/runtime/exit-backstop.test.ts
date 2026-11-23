/*
 * Second review of 0.6.2 (bugfixer, 13/10/2026, cure 2) — the backstop under every «the screen is gone and the process stays».
 * Twice in one day the cause was a request nobody could stop (a key provider's check: 31 s measured; the ChatGPT plan's list:
 * until OpenAI answers). Each got its own cure; this is the net under the whole class — a `/provider` test, a `/model` list, the
 * external agent, whatever comes next: once the interactive screen has ended and everything `main` awaits is done, a handle left
 * behind may hold the process for `EXIT_BACKSTOP_MS` and no longer.
 * What these pin:
 *   · the timer keeps nothing alive by itself: a process with nothing left ends at once, with its own code, and nothing is logged;
 *   · something still holds the event loop: the process ends after the delay with the code the run returned, and what held it is
 *     written to the development log first;
 *   · it is armed only when the command's work has finished (`exitWhenFinished`), never while a clean-up is still awaited, and
 *     only for the run that asks for it (the interactive screen): a `-p` run is left as it was.
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {armExitBackstop,EXIT_BACKSTOP_MS,summarizeHeldResources} from '../../src/runtime/exit-backstop.ts';

const SRC=new URL('../../src/',import.meta.url);
const href=(relative:string)=>pathToFileURL(new URL(relative,SRC).pathname.replace(/^\/([A-Za-z]:)/u,'$1')).href;
const runChild=(code:string)=>{
  const dir=mkdtempSync(join(tmpdir(),'talos-exit-backstop-'));
  try{
    const file=join(dir,'child.mts');writeFileSync(file,code);
    const started=Date.now();
    const run=spawnSync(process.execPath,['--experimental-strip-types','--no-warnings',file],{encoding:'utf8',timeout:60_000,env:{...process.env,NODE_OPTIONS:''}});
    return{...run,ms:Date.now()-started};
  }finally{rmSync(dir,{recursive:true,force:true});}
};

test('the backstop is two seconds, and what it reports is a count by kind, never a handle',()=>{
  assert.equal(EXIT_BACKSTOP_MS,2_000);
  assert.deepEqual(summarizeHeldResources(['TCPSocketWrap','Timeout','TCPSocketWrap','FSReqPromise']),{TCPSocketWrap:2,Timeout:1,FSReqPromise:1});
  assert.deepEqual(summarizeHeldResources(null as any),{});
});

test('armed: it fires once after the delay, logs what holds the process and exits with the run\'s code; disarmed, it does nothing',async()=>{
  const exits:number[]=[];const logged:any[]=[];
  armExitBackstop({code:7,delayMs:30,exit:code=>{exits.push(code);},log:record=>logged.push(record),resources:()=>['TCPSocketWrap','TCPSocketWrap']});
  await new Promise(resolve=>setTimeout(resolve,120));
  assert.deepEqual(exits,[7]);
  assert.deepEqual(logged,[{held:{TCPSocketWrap:2},afterMs:30,exitCode:7}]);
  /* a log or a reading that throws never keeps the process */
  const hard:number[]=[];
  armExitBackstop({code:0,delayMs:10,exit:code=>{hard.push(code);},log:()=>{throw new Error('the log is gone');},resources:()=>{throw new Error('not in this Node');}});
  await new Promise(resolve=>setTimeout(resolve,60));
  assert.deepEqual(hard,[0]);
  const never:number[]=[];
  const disarm=armExitBackstop({code:1,delayMs:20,exit:code=>{never.push(code);}});disarm();
  await new Promise(resolve=>setTimeout(resolve,80));
  assert.deepEqual(never,[]);
});

test('nothing left: the process ends at once with its own code — the backstop\'s timer keeps nothing alive',()=>{
  const run=runChild(`
import {armExitBackstop} from ${JSON.stringify(href('runtime/exit-backstop.ts'))};
armExitBackstop({code:9,delayMs:5_000,log:()=>{console.log('BACKSTOP');}});
process.exitCode=3;
`);
  assert.equal(run.status,3,run.stderr);
  assert.doesNotMatch(run.stdout,/BACKSTOP/u);
  assert.ok(run.ms<4_000,`the process waited for the backstop's own timer (${run.ms} ms)`);
});

test('a handle left behind (a connection nobody answers) holds the process for the delay, not for ever; the code is the run\'s',()=>{
  const run=runChild(`
import {createServer} from 'node:net';
import {exitWhenFinished} from ${JSON.stringify(href('runtime/unfinished-command.ts'))};
import {armExitBackstop} from ${JSON.stringify(href('runtime/exit-backstop.ts'))};
/* a provider that accepts the connection and never answers, and a request to it that nobody stops */
const server=createServer(()=>{});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
void fetch('http://127.0.0.1:'+server.address().port+'/v1/models').catch(()=>{});
let cleanedUp=false;
const main=async()=>{await new Promise(resolve=>setTimeout(resolve,300));cleanedUp=true;return 5;};
const started=Date.now();
exitWhenFinished(main(),{writeErr:text=>process.stderr.write(text),afterFinished:code=>{
  console.log(JSON.stringify({armedAfterCleanUp:cleanedUp,armedAtMs:Date.now()-started}));
  armExitBackstop({code,delayMs:400,log:record=>{console.log(JSON.stringify({record,firedAtMs:Date.now()-started}));}});
}});
`);
  assert.equal(run.status,5,`the process did not end with the run's code (status ${run.status}, ${run.ms} ms): ${run.stderr}`);
  const lines=run.stdout.trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(lines[0].armedAfterCleanUp,true,'the backstop was armed while the command\'s own clean-up was still awaited');
  assert.ok(lines[0].armedAtMs>=280);
  assert.equal(lines[1].record.exitCode,5);assert.equal(lines[1].record.afterMs,400);
  assert.ok(Object.keys(lines[1].record.held).length>=1,`what held the process is named: ${JSON.stringify(lines[1].record)}`);
  assert.ok(lines[1].firedAtMs>=lines[0].armedAtMs+380,'it fired before its delay');
  assert.ok(run.ms<20_000,`the stray request held the process (${run.ms} ms)`);
});

test('a command that fails or never finishes is not given the backstop: `exitWhenFinished` arms it only after a finished run',()=>{
  const run=runChild(`
import {exitWhenFinished} from ${JSON.stringify(href('runtime/unfinished-command.ts'))};
let armed=false;
exitWhenFinished(Promise.reject(new Error('boom')),{writeErr:()=>{},afterFinished:()=>{armed=true;}});
process.on('exit',()=>{console.log(JSON.stringify({armed,code:process.exitCode}));});
`);
  assert.deepEqual(JSON.parse(run.stdout.trim()),{armed:false,code:70});
});

test('what the backstop says reaches the development log although the log was closed by then, redacted like every record',async()=>{
  const {mkdtempSync:make,readFileSync,readdirSync}=await import('node:fs');
  const log=await import('../../src/diagnostics/development-log.ts');
  const dir=make(join(tmpdir(),'talos-exit-backstop-log-'));
  try{
    assert.ok(log.initializeDevelopmentLogging({logDir:dir,argv:[],component:'cli-main'}));
    log.closeDevelopmentLogging({runtimeClosed:true});
    log.developmentLog('after.close',{});/* the ordinary door is shut */
    log.developmentLogLate('cli.exit.backstop',{held:{TCPSocketWrap:1},afterMs:2000,exitCode:0},'warning','cli-main');
    const records=readdirSync(dir).flatMap(name=>readFileSync(join(dir,name),'utf8').trim().split('\n').map(line=>JSON.parse(line)));
    assert.deepEqual(records.map(record=>record.event).slice(-2),['process.stop','cli.exit.backstop']);
    assert.deepEqual(records.at(-1).data,{held:{TCPSocketWrap:1},afterMs:2000,exitCode:0});
    assert.equal(records.at(-1).severity,'warning');
  }finally{rmSync(dir,{recursive:true,force:true});}
});
