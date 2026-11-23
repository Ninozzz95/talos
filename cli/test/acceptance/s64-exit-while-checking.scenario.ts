/**
 * s64 — the process ends when the screen does, whatever the provider is doing (gate red of 13/10/2026 on 1de5f84af: s52's first
 * test, «exitTalos: TALOS did not exit 10 s after Ctrl+C Ctrl+C. Screen:» followed by an EMPTY screen — the TUI had left and the
 * process stayed — and then «one TALOS at a time» for the test after it).
 *
 * The cause, measured on the built CLI the same day: the status row's one background check of the provider (C1R, on the real
 * screen since 0.6.2) sent its request with no way to stop it. With a provider that accepts the connection and never answers,
 * Ctrl+C Ctrl+C right after the composer -> the process ended 31 s later (the kernel probe's own timeout); with the check not made
 * -> 1.5 s. The early raw mode of run.ts, the first suspect, was not it. The fake provider of the other scenarios answers at once,
 * so only a loaded machine showed it: this one is a provider that never answers, where it shows every time.
 */
import assert from 'node:assert/strict';
import {existsSync,readdirSync,readFileSync} from 'node:fs';
import net from 'node:net';
import {join} from 'node:path';
import {after,before,test} from 'node:test';
import {exitTalos,FAKE_MODEL_ID,toComposer} from './harness.ts';
import {assertFreshBuild,createProfile,type Profile} from './profile.ts';
import {TerminalSession} from './terminal.ts';

let profile:Profile;let server:net.Server;
/* every connection TALOS opened to the provider, kept open and never answered */
const opened:net.Socket[]=[];
before(async()=>{
  assertFreshBuild();
  server=net.createServer(socket=>{opened.push(socket);socket.on('error',()=>{});});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  profile=createProfile({name:'s64',files:{'README.md':'# demo\n'},providerUrl:`http://127.0.0.1:${(server.address() as net.AddressInfo).port}`,extraEnv:{}});
  for(const args of [['model','use',FAKE_MODEL_ID,'--scope','user'],['project','trust','--include-nested']]){
    const r=await profile.talos(args);if(r.status!==0)throw new Error(`${args.join(' ')} failed (${r.status}): ${r.stdout}${r.stderr}`);
  }
});
after(async()=>{for(const socket of opened)socket.destroy();await new Promise(resolve=>server.close(resolve));profile?.dispose();});

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
/*
 * Second review of 0.6.2 (13/10/2026). Since the exit backstop (runtime/exit-backstop.ts: two seconds after the clean-up, the
 * process ends whatever still holds it) the time alone no longer tells WHY the process ended: with `stopProviderChecks` taken out
 * this scenario would still end inside its six seconds, by the backstop. What tells the two apart is what the backstop writes
 * when it fires — `cli.exit.backstop` in the development log. A prompt exit, the check's request ended with the screen, writes
 * none; so each run's own log is read, and it must hold the run (`cli.main.enter`) and no backstop.
 */
const logEvents=(dir:string):string[]=>existsSync(dir)?readdirSync(dir).flatMap(name=>readFileSync(join(dir,name),'utf8').split('\n').filter(Boolean).map(line=>{try{return String(JSON.parse(line).event??'');}catch{return'';}})):[];
async function launchAndLeave(label:string){
  const asked=opened.length;
  const logs=join(profile.home,`dev-log-${label.replace(' ','-')}`);profile.env.TALOS_CLI_DEV_LOG_DIR=logs;
  const t=TerminalSession.launch(profile,[],{cols:100,rows:30});
  try{
    await toComposer(t);
    /* the premise: the check is in flight — TALOS has a request open that nobody answers */
    for(let waited=0;opened.length===asked&&waited<10_000;waited+=50)await sleep(50);
    assert.ok(opened.length>asked,`${label}: the provider was never asked, so this run proves nothing`);
    const started=Date.now();
    const exited=await exitTalos(t);
    const took=Date.now()-started;
    assert.equal(exited,true,`${label}: the screen left and the process did not (still alive after ${took} ms)`);
    assert.ok(took<6_000,`${label}: the process took ${took} ms to end after Ctrl+C Ctrl+C`);
    const events=logEvents(logs);
    assert.ok(events.includes('cli.main.enter'),`${label}: the run's development log was not found in ${logs}, so the next line proves nothing`);
    assert.equal(events.includes('cli.exit.backstop'),false,`${label}: the process ended because the exit backstop cut it (${took} ms), not because the check's request ended with the screen`);
  }finally{await t.close();}
}

test('s64 · Ctrl+C Ctrl+C while the provider check is unanswered: the process ends with the screen',async()=>{
  await launchAndLeave('first start');
});

test('s64 · and again at the next start (the «not verified» it kept is checked again, and left again)',async()=>{
  await launchAndLeave('second start');
});
