/**
 * s76 — 0.6.6 (owner 14/10/2026, «Comandi ora, schermata dopo»; «Una frase breve»): an automation made and run from the command
 * line, on the built package, with the fake model. Until 0.6.5 every run ended TASK_CATALOG_UNAVAILABLE.
 * - `automation add "<instructions>" --when "every 30m"` makes it in this (trusted) project; `run` waits for the run and says how
 *   it ended; `history` has the run;
 * - a run that asks to run a command (the fake answers the run's own «FAILURE:» note with `cmd /c exit 3`) is not waited on: the
 *   CLI's engine refuses it, non-interactive, the model is told, and the run ends by itself;
 * - a folder nobody trusted is refused before anything is made;
 * - (the 0.6.6 review's F1) a second `run` of an automation already running is handed to the process that runs it, which says
 *   it is running: one run, ended `done`, never a second one nor the first closed as failed; `serve --once` does not tick then;
 * - (the review's open question) an agent the run delegates to asks for a command: answered by the CLI's engine, the run ends.
 */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {stage} from './harness.ts';

const s=stage({name:'s76',files:{'README.md':'# demo\n'}});
const json=(out:string)=>JSON.parse(out.trim().split('\n').filter(Boolean).at(-1)!);

test('s76 · an automation is made with a --when phrase, runs to the end, and its run is in the history',async()=>{
  const made=await s.profile.talos(['automation','add','THINK about how this project is built','--when','every 30m','--json'],60_000);
  assert.equal(made.status,0,made.stderr);
  const row=json(made.stdout);assert.equal(row.schedule,'every 30m');assert.equal(row.legacy,false);assert.equal(row.mode,'acceptEdits');
  const before=s.fake.chatRequests().length;
  const run=await s.profile.talos(['automation','run',row.id,'--json'],120_000);
  assert.equal(run.status,0,`${run.stdout}\n${run.stderr}`);
  const result=json(run.stdout);assert.equal(result.outcome,'done');assert.ok(result.sessionId);
  const sent=s.fake.chatRequests().slice(before);
  assert.ok(sent.some(r=>/scheduled TALOS automation/u.test(r.lastUser??'')&&/THINK about how this project is built/u.test(r.lastUser??'')),'the model got the run\'s note and the instructions');
  const history=await s.profile.talos(['automation','history',row.id,'--json'],60_000);
  assert.equal(history.status,0,history.stderr);
  assert.ok(json(history.stdout).runs.some((r:any)=>r.outcome==='done'),history.stdout);
});

test('s76 · a command the run asks for is refused, not waited on: nobody is in front of an automation',async()=>{
  const made=await s.profile.talos(['automation','add','check the folder','--when','manual','--json'],60_000);
  assert.equal(made.status,0,made.stderr);const id=json(made.stdout).id;
  const before=s.fake.chatRequests().length;const started=Date.now();
  const run=await s.profile.talos(['automation','run',id,'--json'],120_000);
  assert.ok(Date.now()-started<100_000,'the run ended by itself');
  const sent=s.fake.chatRequests().slice(before);
  const told=sent.flatMap(r=>r.toolTexts??[]).map(t=>t.text).join('\n');
  assert.match(told,/permission|approv|refus|not run|denied/iu,`the model is told the command was not run: ${told.slice(0,400)}`);
  assert.equal(json(run.stdout).outcome,'done',run.stdout);
});

test('s76 · a folder nobody trusted is refused before anything is made',async()=>{
  /* a folder with a project file (TALOS's own .talos folder) that nobody trusted; a folder with none is as trusted as for -p */
  const elsewhere=mkdtempSync(join(tmpdir(),'talos-s76-untrusted-'));mkdirSync(join(elsewhere,'.talos'));writeFileSync(join(elsewhere,'.talos','notes.md'),'run the cleanup\n');
  const made=await s.profile.talos(['automation','add','check','--when','every 30m','--folder',elsewhere,'--json'],60_000);
  assert.notEqual(made.status,0);assert.match(made.stdout+made.stderr,/PROJECT_TRUST_REQUIRED/u);
  const list=await s.profile.talos(['automation','list','--json'],60_000);
  assert.ok(json(list.stdout).rows.every((r:any)=>r.folder!==elsewhere));
});

test('s76 · one process runs the automations: a second run of a running one is refused by it, the first ends done',async()=>{
  const made=await s.profile.talos(['automation','add','LONG child work, then report','--when','manual','--json'],60_000);
  assert.equal(made.status,0,made.stderr);const id=json(made.stdout).id;
  const first=s.profile.talos(['automation','run',id,'--json'],180_000);
  /* the first run is under way when the store says so */
  for(let i=0;i<120;i++){const list=await s.profile.talos(['automation','list','--json'],60_000);if(json(list.stdout).rows.find((r:any)=>r.id===id)?.running)break;await new Promise(r=>setTimeout(r,500));}
  const second=await s.profile.talos(['automation','run',id,'--json'],120_000);
  assert.notEqual(second.status,0);
  assert.match(second.stderr,/Another TALOS process \(pid \d+\) is running the automations/u,`${second.stdout}\n${second.stderr}`);
  assert.equal(json(second.stdout).code,'AUTOMATION_RUN_IN_PROGRESS',second.stdout);
  const once=await s.profile.talos(['automation','serve','--once','--json'],60_000);
  assert.notEqual(once.status,0);assert.match(once.stdout+once.stderr,/AUTOMATION_HOST_RUNNING/u);
  const done=await first;
  assert.equal(done.status,0,`${done.stdout}\n${done.stderr}`);assert.equal(json(done.stdout).outcome,'done');
  const history=json((await s.profile.talos(['automation','history',id,'--json'],60_000)).stdout).runs;
  assert.deepEqual(history.map((r:any)=>r.outcome),['done'],JSON.stringify(history));
});

test('s76 · an agent the run delegates to asks for a command: the CLI answers it (refused, nobody in front), the run ends',async()=>{
  const made=await s.profile.talos(['automation','add','DELEGATE:FAIL the check','--when','manual','--coordination','--json'],60_000);
  assert.equal(made.status,0,made.stderr);const id=json(made.stdout).id;
  const before=s.fake.chatRequests().length;const started=Date.now();
  const run=await s.profile.talos(['automation','run',id,'--json'],150_000);
  assert.ok(Date.now()-started<140_000,'the run ended: the child was not left waiting for an answer');
  const sent=s.fake.chatRequests().slice(before);
  assert.ok(sent.some(r=>/FAIL child work/u.test(r.lastUser??'')),'the child ran');
  const child=sent.filter(r=>/FAIL child work/u.test(r.lastUser??'')).flatMap(r=>r.toolTexts??[]).map(t=>t.text).join('\n');
  assert.match(child,/REFUSED\. TALOS did not run the command `cmd \/c exit 3`/u,`the child is told its command was not run: ${child.slice(0,400)}`);
  assert.ok(sent.some(r=>/Asynchronous result of a sub-agent/u.test(r.lastUser??'')),'the run\'s session was woken with the agent\'s result before the process left');
  assert.equal(json(run.stdout).outcome,'done',run.stdout);
});

test('s76 · an agent that works on after the run\'s own turn: the process waits for it and for the wake, then leaves',async()=>{
  const made=await s.profile.talos(['automation','add','DELEGATE:LONG the survey','--when','manual','--coordination','--json'],60_000);
  assert.equal(made.status,0,made.stderr);const id=json(made.stdout).id;
  const before=s.fake.chatRequests().length;
  const run=await s.profile.talos(['automation','run',id,'--json'],150_000);
  assert.equal(run.status,0,`${run.stdout}\n${run.stderr}`);
  const sent=s.fake.chatRequests().slice(before);
  assert.ok(sent.some(r=>/LONG child work/u.test(r.lastUser??'')),'the agent ran');
  assert.ok(sent.some(r=>/Asynchronous result of a sub-agent/u.test(r.lastUser??'')),'the agent ended and the run\'s session was woken with its result before the process left');
});
