/*
 * 0.6.7 (first review of 0.6.7, S2): since r4 7784d574e the kernel listens to SIGINT/SIGTERM outside Windows
 * (`creaPuliziaDeiGruppi`, talosHarness.mjs) and leaves the exit to the host only when another listener is still counted. The
 * automations host listened with `once`, which Node removes before calling it: the kernel saw nobody, re-sent the signal, and on
 * Linux/macOS the first Ctrl+C killed the host before it stopped its runs and released the lease. The kernel's real function on a
 * fake process, as on Linux, with one live command group.
 */
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import path from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';
import {REPO_ROOT} from '../provider/first-run-fixture.ts';
import {listenForStop} from '../../src/commands/advanced-cli.ts';

const kernel:any=await import(pathToFileURL(path.join(REPO_ROOT,'harness-ui','src','kernel','talosHarness.mjs')).href);

function linuxProcess(){
  const proc:any=new EventEmitter();proc.pid=1000;const killed:string[]=[];const exits:number[]=[];
  proc.exit=(code:number)=>{exits.push(code);};
  const timers:Array<()=>void>=[];
  const groups=kernel.creaPuliziaDeiGruppi({proc,piattaforma:'linux',killFn:(pid:number,signal:string|number)=>{if(signal!==0)killed.push(`${pid}:${signal}`);return true;},impostaTimer:(fn:()=>void)=>{timers.push(fn);return{unref(){}};}});
  groups.registra({pid:4242,once(){}});
  return{proc,killed,exits,timers};
}

for(const signal of ['SIGINT','SIGTERM'] as const){
  test(`${signal}: the kernel leaves the exit to the host, which stops gracefully; a second one ends it`,()=>{
    const {proc,killed,exits,timers}=linuxProcess();
    const kernelOwn=proc.listenerCount(signal);
    const stop=new AbortController();const done=listenForStop(proc,stop);
    proc.emit(signal);
    assert.equal(stop.signal.aborted,true,'the host was asked to stop');
    assert.equal(killed.includes(`1000:${signal}`),false,`the kernel did not re-send ${signal} to the host's own process: ${killed.join(', ')}`);
    assert.ok(killed.includes(`-4242:${signal}`),'the command group got the same signal');
    for(const fire of timers)fire();
    assert.equal(killed.includes(`1000:${signal}`),false,'not after the grace either');
    proc.emit(signal);
    assert.deepEqual(exits,[signal==='SIGINT'?130:143],'the second signal ends the process at once, with its own exit code');
    done();
    assert.equal(proc.listenerCount(signal),kernelOwn,'only the kernel\'s own listeners are left');
  });
}
