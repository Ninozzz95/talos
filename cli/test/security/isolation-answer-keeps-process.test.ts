/*
 * Stress test 0.5.4, suspicion 2 (registro Voce 54): `talos --permission-mode auto config permissions dry-run --tool Bash --command "npm test"`
 * printed NOTHING and exited 0. `npm test` is a SAFE_EXACT command, so the auto classifier asks whether the shell is isolated; the answer comes
 * from a worker that never keeps TALOS alive (mxc-support-probe.ts `worker.unref()`), and a one-shot command had nothing else running: Node ended
 * the process while the answer was still on its way. Whoever awaits the answer keeps the process open until it lands; and a command that never
 * finishes says so and fails, it does not exit 0 with an empty output.
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {pathToFileURL} from 'node:url';

const SRC=new URL('../../src/',import.meta.url);
const runChild=(code:string)=>{
  const dir=mkdtempSync(join(tmpdir(),'talos-keep-alive-'));
  try{
    const file=join(dir,'child.mts');writeFileSync(file,code);
    return spawnSync(process.execPath,['--experimental-strip-types','--no-warnings',file],{encoding:'utf8',timeout:60_000,env:{...process.env,NODE_OPTIONS:''}});
  }finally{rmSync(dir,{recursive:true,force:true});}
};

test('a one-shot command that awaits only the isolation answer receives it (the answer arrives on a handle that keeps nothing alive)',()=>{
  const backends=pathToFileURL(new URL('security/execution-backends.ts',SRC).pathname.replace(/^\/([A-Za-z]:)/u,'$1')).href;
  const run=runChild(`
import {cliShellIsolation} from ${JSON.stringify(backends)};
const late=()=>new Promise(resolve=>{setTimeout(()=>resolve({isSupported:false,availableMethods:[],reason:'late answer (test)'}),200).unref();});
const source=cliShellIsolation({paths:{cacheRoot:${JSON.stringify(join(tmpdir(),'talos-keep-alive-cache'))}},platform:'win32',supportProbe:late});
const state=await source();
console.log(JSON.stringify(state));
`);
  assert.equal(run.status,0,`the child ended before the answer (status ${run.status}): ${run.stderr}`);
  assert.deepEqual(JSON.parse(run.stdout.trim()),{verified:false,reason:'late answer (test)'});
});

test('a command that never finishes fails with a sentence instead of exiting 0 with nothing',()=>{
  const guard=pathToFileURL(new URL('runtime/unfinished-command.ts',SRC).pathname.replace(/^\/([A-Za-z]:)/u,'$1')).href;
  const run=runChild(`
import {exitWhenFinished} from ${JSON.stringify(guard)};
exitWhenFinished(new Promise<number>(()=>{}),{writeErr:text=>process.stderr.write(text)});
`);
  assert.equal(run.status,70);
  assert.equal(run.stdout,'');
  assert.match(run.stderr,/TALOS stopped before this command finished/u);
  assert.match(run.stderr,/COMMAND_NEVER_FINISHED/u);
});

test('a command that finishes keeps its own exit code, and a thrown one is 70',()=>{
  const guard=pathToFileURL(new URL('runtime/unfinished-command.ts',SRC).pathname.replace(/^\/([A-Za-z]:)/u,'$1')).href;
  const ok=runChild(`
import {exitWhenFinished} from ${JSON.stringify(guard)};
exitWhenFinished(Promise.resolve(3),{writeErr:text=>process.stderr.write(text)});
`);
  assert.equal(ok.status,3);assert.equal(ok.stderr,'');
  const thrown=runChild(`
import {exitWhenFinished} from ${JSON.stringify(guard)};
exitWhenFinished(Promise.reject(new Error('boom (test)')),{writeErr:text=>process.stderr.write(text)});
`);
  assert.equal(thrown.status,70);assert.match(thrown.stderr,/boom \(test\)/u);
});
