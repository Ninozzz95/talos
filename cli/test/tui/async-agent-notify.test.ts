/*
 * ASYNC phase, step 5 (owner 01/10, plan: «notification when a child finishes with the main agent idle, per
 * ui.notifications»). When a delegated agent ends, the kernel wakes the main agent with its result; the notification for
 * that turn says WHICH agent finished (Codex names what a notification is about: `AgentTurnComplete { response }` shows
 * the reply's preview, an approval shows its command — chatwidget/notifications.rs), not the generic «Turn complete.».
 * While delegated agents work with the main agent idle, the terminal's progress indicator (OSC 9;4, Windows Terminal,
 * ConEmu, iTerm2, Ghostty) stays on, as it does during a turn: the tab says TALOS is still at work.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTerminalNotifications} from '../../src/tui/notifications.ts';

const BUSY='\u001b]9;4;3;0\u0007',IDLE='\u001b]9;4;0;0\u0007';
function fixture(){
  const writes:string[]=[];let pending:(()=>void)|null=null;
  const n=createTerminalNotifications({write:(s:string)=>writes.push(s),env:{TERM_PROGRAM:'iTerm.app'},platform:'darwin',
    schedule:(fn:()=>void)=>{pending=fn;return()=>{pending=null;};}} as any);
  n.start();n.focus(false);
  return{n,writes,flush(){const fn=pending;pending=null;fn?.();},notes:()=>writes.filter(x=>x.startsWith('\u001b]9;TALOS: ')).map(x=>x.slice('\u001b]9;TALOS: '.length,-1))};
}
const woken=(...results:{task:string|null;status:'completed'|'failed'}[])=>({type:'run.started',runId:'w',sessionId:'main',
  delegation:results.map((result,index)=>({childId:`c${index}`,summary:'…',...result}))});

test('ASYNC 5: the turn a finished agent woke says which agent finished',()=>{
  const one=fixture();
  one.n.event(woken({task:'Read the docs',status:'completed'}));one.n.event({type:'run.completed',runId:'w'});one.flush();
  assert.deepEqual(one.notes(),['Agent finished: Read the docs · TALOS answered.']);
  const failed=fixture();
  failed.n.event(woken({task:'Fix the build',status:'failed'}));failed.n.event({type:'run.completed',runId:'w'});failed.flush();
  assert.deepEqual(failed.notes(),['Agent did not finish: Fix the build · TALOS answered.']);
  const two=fixture();
  two.n.event(woken({task:'A',status:'completed'},{task:'B',status:'failed'}));two.n.event({type:'run.completed',runId:'w'});two.flush();
  assert.deepEqual(two.notes(),['2 agents finished · TALOS answered.']);
  const unnamed=fixture();
  unnamed.n.event(woken({task:null,status:'completed'}));unnamed.n.event({type:'run.completed',runId:'w'});unnamed.flush();
  assert.deepEqual(unnamed.notes(),['Agent finished · TALOS answered.']);
});

test('ASYNC 5: an ordinary turn keeps its words; a woken turn that fails says it failed',()=>{
  const plain=fixture();
  plain.n.event({type:'run.started',runId:'r'});plain.n.event({type:'run.completed',runId:'r'});plain.flush();
  assert.deepEqual(plain.notes(),['Turn complete.']);
  const after=fixture();
  after.n.event(woken({task:'A',status:'completed'}));after.n.event({type:'run.completed',runId:'w'});after.flush();
  after.n.event({type:'run.started',runId:'r2'});after.n.event({type:'run.completed',runId:'r2'});after.flush();
  assert.deepEqual(after.notes(),['Agent finished: A · TALOS answered.','Turn complete.'],'the next turn is an ordinary one again');
  const broke=fixture();
  broke.n.event(woken({task:'A',status:'completed'}));broke.n.event({type:'run.failed',runId:'w'});broke.flush();
  assert.deepEqual(broke.notes(),['Turn failed. Return to TALOS for details.']);
});

test('ASYNC 5: the progress indicator stays on while delegated agents work with the main agent idle',()=>{
  const f=fixture();
  f.n.agents(2);
  assert.equal(f.writes.at(-1),BUSY,'idle main agent, two working: busy');
  const before=f.writes.length;f.n.agents(1);
  assert.equal(f.writes.length,before,'still busy: nothing written again');
  f.n.agents(0);
  assert.equal(f.writes.at(-1),IDLE,'none left: idle');
  f.n.event({type:'run.started',runId:'r'});
  const during=f.writes.length;f.n.agents(3);f.n.agents(0);
  assert.equal(f.writes.length,during,'during a turn the turn owns the indicator: the last agent ending does not switch it off');
  f.n.event({type:'run.completed',runId:'r'});
  assert.equal(f.writes.at(-1),IDLE,'the turn ends');
  f.n.agents(3);
  assert.equal(f.writes.at(-1),BUSY,'agents still working after it: busy again');
});

test('ASYNC 5: no agent working never clears a failed turn\'s error state (s31 on the built CLI)',()=>{
  const ERROR='\u001b]9;4;2;100\u0007';
  const f=fixture();
  f.n.event({type:'run.started',runId:'r'});f.n.event({type:'run.failed',runId:'r'});
  assert.equal(f.writes.at(-1),ERROR,'the failed turn shows its error');
  const before=f.writes.length;f.n.agents(0);
  assert.equal(f.writes.length,before,'nothing working: the error stays, nothing is written');
  f.n.agents(1);f.n.agents(0);
  assert.equal(f.writes.at(-1),IDLE,'an agent that worked and ended clears its own busy state');
});
