/*
 * Third review of 0.6.2 (13/10/2026, S4): the acceptance harness fails a scenario whose TALOS was ended by the exit backstop
 * (exit-backstop-check.ts). Proved here without a built CLI: the record is written by the product's own backstop and its own
 * development log, in a temp folder shaped like a scenario's profile, and read by the harness's reader.
 */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {assertNoExitBackstop,exitBackstopRecords} from './exit-backstop-check.ts';
import {armExitBackstop} from '../../src/runtime/exit-backstop.ts';
import {closeDevelopmentLogging,developmentLogLate,initializeDevelopmentLogging} from '../../src/diagnostics/development-log.ts';

test('S4: a run the exit backstop ended is found in the profile\'s development log and fails, once, naming what held it',async t=>{
  const home=mkdtempSync(join(tmpdir(),'talos-acceptance-backstop-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
  const logs=join(home,'localappdata','TALOS-CLI','logs','development');
  /* a healthy profile: a development log with no backstop, a conversation that only TALKS of it, a project file that looks like one */
  mkdirSync(join(home,'localappdata','TALOS-CLI','sessions'),{recursive:true});mkdirSync(join(home,'project'),{recursive:true});
  writeFileSync(join(home,'localappdata','TALOS-CLI','sessions','s1.jsonl'),JSON.stringify({type:'MessageDelta',text:'the event cli.exit.backstop is written when…'})+'\n');
  writeFileSync(join(home,'project','notes.jsonl'),JSON.stringify({schema:'talos.cli.development-log.v1',event:'cli.exit.backstop',data:{held:{Fake:1}}})+'\n');
  assert.deepEqual(exitBackstopRecords(home),[]);
  assert.doesNotThrow(()=>assertNoExitBackstop(home,'healthy'));
  /* asked to see the run's log first (`exitTalos`): with none under the profile it cannot look, so it does not pass */
  assert.throws(()=>assertNoExitBackstop(home,'exitTalos',{requireLog:true}),/EXIT_BACKSTOP_UNREADABLE \(exitTalos\)/u);
  /* the product's own backstop fires (its exit replaced, 20 ms instead of two seconds) and writes through the product's own log */
  initializeDevelopmentLogging({logDir:logs,argv:[],component:'cli-main'});
  let exitedWith:number|null=null;
  try{    closeDevelopmentLogging({runtimeClosed:true});/* as `main`'s finally leaves it: the backstop speaks after the log is closed */
    armExitBackstop({code:0,delayMs:20,resources:()=>['TCPSocketWrap','TCPSocketWrap','Timeout'],exit:code=>{exitedWith=code;},
      log:record=>developmentLogLate('cli.exit.backstop',{...record,why:'test'},'warning','cli-main')});
    const keepAlive=setTimeout(()=>{},1_000);/* the backstop's own timer is unref'd */
    for(let waited=0;exitedWith===null&&waited<900;waited+=10)await new Promise(resolve=>setTimeout(resolve,10));
    clearTimeout(keepAlive);
  }finally{closeDevelopmentLogging();}
  assert.equal(exitedWith,0,'the premise: the backstop fired');
  const found=exitBackstopRecords(home);
  assert.equal(found.length,1,`the record the product wrote was not found under ${home}`);
  assert.deepEqual(found[0]!.held,{TCPSocketWrap:2,Timeout:1});assert.equal(found[0]!.afterMs,20);assert.equal(found[0]!.exitCode,0);
  assert.throws(()=>assertNoExitBackstop(home,'exitTalos',{requireLog:true}),(error:Error)=>/EXIT_BACKSTOP_FIRED \(exitTalos\)/u.test(error.message)&&/"TCPSocketWrap":2/u.test(error.message));
  assert.doesNotThrow(()=>assertNoExitBackstop(home,'the end of the scenario'),'a record is reported once: the scenario that made it fails, not the ones after it');
});
