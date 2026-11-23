/**
 * s66 — suspect 9 of the 0.5.3 stress test: «in plan mode a model's tool call ends the turn with PROVIDER_OUTCOME_UNKNOWN
 * (resume) instead of a clean refusal». Not reproduced on 07bce984a (14/10/2026) with the fake model's `PLANWRITE` script,
 * which calls a changing tool the plan mode does not offer: `-p` (v1 and v2, fresh and resumed) and the screen (started in
 * plan mode, Shift+Tab to plan before the turn, Shift+Tab to plan while the turn runs) all refuse cleanly, the turn goes on,
 * nothing is written, and no «outcome unknown» or «resume» appears. This scenario keeps it that way on the BUILT CLI.
 */
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {test} from 'node:test';
import {idleFooter,modeOf} from './checks.ts';
import {stage,toComposer} from './harness.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const s=stage({name:'s66',files:{'README.md':'# demo\n'}});
const UNCLEAN=/OUTCOME_UNKNOWN|did not finish|could not tell|\/resume|--resume|closed in the middle/u;
const notWritten=()=>assert.ok(!existsSync(join(s.profile.project,'notes.txt')),'nothing was written');
const turnEnded=(t:TerminalSession,label:string)=>t.waitFor(label,(x:Screen)=>idleFooter(x)&&/Tool said:/u.test(x.text),{timeout:40_000});
async function toPlan(t:TerminalSession){
  for(let i=0;i<6&&modeOf(t.screen())!=='plan mode';i++){const before=modeOf(t.screen());t.press('shift+tab');await t.waitFor('the mode changed',x=>modeOf(x)!==before,{timeout:5_000});}
  assert.equal(modeOf(t.screen()),'plan mode');
}

test('s66 · -p in plan mode: a write, a command and an edit are refused and the run completes',async()=>{
  for(const name of ['scrivi','shell','file_edit']){
    const r=await s.profile.talos(['-p',`PLANWRITE:${name} do it`,'--permission-mode','plan','--output-format','json','--protocol','v2']);
    assert.equal(r.status,0,`${name}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout,/"outcome":"completed"/u,r.stdout);
    assert.match(r.stdout,/"status":"failed","content":"REFUSED\. Plan mode is active/u,r.stdout);
    assert.doesNotMatch(r.stdout+r.stderr,UNCLEAN);
  }
  notWritten();
});

test('s66 · -p in plan mode on a resumed conversation: refused with the plan-mode code, the run completes',async()=>{
  const first=await s.profile.talos(['-p','hello','--output-format','json']);
  const id=/"sessionId":"([^"]+)"/u.exec(first.stdout)?.[1];
  assert.ok(id,first.stdout);
  const r=await s.profile.talos(['-p','PLANWRITE:scrivi do it','--resume',id!,'--permission-mode','plan','--output-format','json']);
  assert.equal(r.status,0,`${r.stdout}${r.stderr}`);
  assert.match(r.stdout,/"ok":true/u,r.stdout);
  assert.match(r.stdout,/REFUSED|PLAN_MODE_READ_ONLY/u,r.stdout);
  assert.doesNotMatch(r.stdout+r.stderr,UNCLEAN);
  notWritten();
});

test('s66 · on the screen: started in plan mode, the write is refused in plain words and the turn ends',async()=>{
  const t=s.launch(['--permission-mode','plan'],{cols:120,rows:36});
  try{
    await toComposer(t);
    await t.submit('PLANWRITE:scrivi do it');
    const end=await turnEnded(t,'the refused write');
    assert.match(end.text,/Write file notes\.txt · failed/u,end.text);
    assert.match(end.text,/Plan mode is active: this tool is not available until the work mode changes\. Nothing was done\./u,end.text);
    assert.doesNotMatch(end.text,UNCLEAN,end.text);
  }finally{await t.close();}
  notWritten();
});

test('s66 · on the screen: Shift+Tab to plan while the turn runs, the write that follows is denied, not lost',async()=>{
  const t=s.launch([],{cols:120,rows:36});
  try{
    await toComposer(t);
    await t.submit('PLANWRITE:scrivi GENTLY do it');
    await t.waitFor('the turn is running',x=>/esc to stop/u.test(x.text),{timeout:20_000});
    await toPlan(t);
    const end=await turnEnded(t,'the denied write');
    assert.match(end.text,/Write file notes\.txt · denied/u,end.text);
    assert.doesNotMatch(end.text,UNCLEAN,end.text);
    assert.equal(modeOf(end),'plan mode');
  }finally{await t.close();}
  notWritten();
});
