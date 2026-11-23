/*
 * After the review of 0.6.3 (bugfixer, 14/10/2026), item 2a. The exit's notice («Finishing a change to your ChatGPT sign-in…») is
 * written to stderr a second into the wait. When whatever read stderr is already gone — a pipe closed by the program that ran
 * `talos -p`, a terminal that went away — the write fails with EPIPE, and Node reports it as an 'error' event on process.stderr:
 * with nobody listening, that is an uncaught exception, and the exit that was waiting for a renewal crashes in the middle of it.
 * Measured on Windows (Node 24): a child that writes to a stderr pipe its parent has closed ends with exit code 1.
 * The notice is an extra: it must never throw, and never end the exit.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import test from 'node:test';

const SUPERVISOR=new URL('../../src/runtime/supervisor.ts',import.meta.url).href;
const PLAN=new URL('../../src/provider/chatgpt-plan.ts',import.meta.url).href;

/** A child that waits at exit for left-behind token work long enough to say the notice, with a stderr its parent has closed. */
function exitWithClosedStderr():Promise<{code:number|null;stdout:string}>{
  const child=spawn(process.execPath,['--input-type=module','-e',[
    `const {createRuntimeSupervisor}=await import(${JSON.stringify(SUPERVISOR)});`,
    `const {keepLeftBehind}=await import(${JSON.stringify(PLAN)});`,
    /* the parent closes its end first */
    `await new Promise(resolve=>setTimeout(resolve,300));`,
    `keepLeftBehind(new Promise(resolve=>setTimeout(resolve,1600)));`,
    `const supervisor=createRuntimeSupervisor({runtimeFactory:async()=>{throw new Error('never composed');}});`,
    `await supervisor.close();`,
    /* the error event of a failed write comes a moment later: the exit must still be alive after it */
    `await new Promise(resolve=>setTimeout(resolve,300));`,
    `process.stdout.write('closed\\n');`,
  ].join('\n')],{stdio:['ignore','pipe','pipe']});
  let stdout='';child.stdout.setEncoding('utf8').on('data',chunk=>{stdout+=chunk;});
  child.stderr.destroy();
  return new Promise(resolve=>child.on('close',code=>resolve({code,stdout})));
}

test('the exit notice written to a stderr that is already closed never crashes the exit',{timeout:60_000},async()=>{
  const {code,stdout}=await exitWithClosedStderr();
  assert.equal(stdout.trim(),'closed','the exit crashed while it said the notice to a closed stderr');
  assert.equal(code,0);
});

test('the notice is still written when stderr is open, and a stream that fails or is gone never throws',async()=>{
  const {writeExitNotice}=await import('../../src/provider/chatgpt-plan.ts');
  const {Writable}=await import('node:stream');
  const written:string[]=[];
  const open=new Writable({write(chunk,_encoding,done){written.push(String(chunk));done();}});
  writeExitNotice('notice\n',open);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(written,['notice\n']);
  assert.equal(open.listenerCount('error'),0,'a write that succeeded left a listener behind');
  /* a write that fails as a closed pipe does: the stream reports an 'error' event, which nobody else listens to */
  const broken=new Writable({write(_chunk,_encoding,done){done(Object.assign(new Error('write EPIPE'),{code:'EPIPE'}));}});
  const uncaught:unknown[]=[];const onUncaught=(error:unknown)=>{uncaught.push(error);};
  process.prependListener('uncaughtException',onUncaught);
  try{
    writeExitNotice('notice\n',broken);
    await new Promise(resolve=>setTimeout(resolve,50));
    /* a stream already destroyed is not written to, and nothing more is hung on it */
    assert.equal(broken.destroyed,true,'the premise: the failed write ended the stream');
    const listeners=broken.listenerCount('error');
    writeExitNotice('notice\n',broken);
    await new Promise(resolve=>setTimeout(resolve,50));
    assert.equal(broken.listenerCount('error'),listeners,'a stream already ended was written to again');
  }finally{process.off('uncaughtException',onUncaught);}
  assert.deepEqual(uncaught,[],'the failed write reached the process as an uncaught exception');
});
