/* UI phase stage 2 (heap probe 01/10, registro 12): the 0.4.0 TUI loaded React's DEVELOPMENT build, whose Performance
   Tracks leave one `performance.measure` (with a cloned `detail`) per component per render in Node's timeline, never
   cleared: ~87 of ~93 MB live after 100 turns (1,406 measures for 200 renders of a two-line component). Both places that
   draw with Ink — the TUI and the project trust prompt — must load React's production build whatever NODE_ENV says, and
   must leave NODE_ENV exactly as they found it, because the commands TALOS runs for the person inherit it (`npm install`
   under NODE_ENV=production skips devDependencies). Same cure as cc-outline PR #57 (30/09/2026). */
import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const CHILD=fileURLToPath(new URL('../fixtures/react-production-child.ts',import.meta.url));
function load(mode:'tui'|'trust-prompt',nodeEnv:string|undefined){
  const env={...process.env};delete env.NODE_ENV;if(nodeEnv!==undefined)env.NODE_ENV=nodeEnv;
  const run=spawnSync(process.execPath,[CHILD,mode],{env,encoding:'utf8',timeout:60_000,windowsHide:true});
  assert.equal(run.status,0,run.stderr);
  return JSON.parse(run.stdout.trim().split('\n').at(-1)!) as {before:string|null;after:string|null;builds:string[];measures:number};
}

for(const mode of ['tui','trust-prompt'] as const)for(const nodeEnv of [undefined,'development','test']){
  test(`${mode}: React's production build with NODE_ENV ${nodeEnv??'unset'}, and NODE_ENV left as it was`,()=>{
    const report=load(mode,nodeEnv);
    assert.equal(report.before,nodeEnv??null);
    assert.equal(report.after,report.before,'NODE_ENV must be restored for the processes TALOS starts');
    const development=report.builds.filter(path=>/development/.test(path));
    assert.deepEqual(development,[],`development builds ran: ${development.join(', ')}`);
    for(const build of ['react/cjs/react.production.js','react-reconciler/cjs/react-reconciler.production.js','scheduler/cjs/scheduler.production.js'])
      assert.ok(report.builds.includes(build),`${build} did not run; ran: ${report.builds.join(', ')}`);
    assert.equal(report.measures,0,'renders must leave no performance measures behind');
  });
}
