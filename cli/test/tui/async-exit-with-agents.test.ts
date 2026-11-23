/*
 * ASYNC phase, step 4 (owner 01/10). Esc stops only the main agent: the kernel's `ferma` aborts that one session and
 * touches no child (pinned below). Exiting stops every delegated agent, because they run inside this CLI's process (Claude
 * Code's keep running in a process of their own: «Press Ctrl-C again to exit · N agents will keep running»; Codex shuts
 * its threads down without asking). Owner's decisions:
 *  - `/exit` with agents working asks: «Wait for them, then exit» · «Stop them and exit» · «Stay» (Claude Code's
 *    «Background anyway (N tasks will be stopped) / Stay», plus the wait, as `talos -p` waits for its children);
 *  - the double Ctrl+C / Ctrl+D still exits, and its first press says what it costs: «· 2 agents will be stopped».
 * «Wait» ends when the agents it waited for have ended, the main agent has answered their results (the kernel wakes it
 * with them: a run that starts with `delegation` naming them) and no turn is open; if no wake comes, it exits after a grace.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {exitHintText} from '../../src/tui/interrupt.ts';
import {EXIT_WAIT_GRACE_MS,exitWaitDone,exitWithAgentsOverlay,EXIT_CHOICES} from '../../src/tui/exit-with-agents.ts';
import {reduceLiveAgents,type LiveAgent} from '../../src/tui/live-agents.ts';
import type {TuiEvent} from '../../src/tui/event-adapter.ts';
import {initialTuiState,reduceTuiEvent} from '../../src/tui/state.ts';

const changed=(childId:string,ended=false):TuiEvent=>({type:'agent.changed',childId,parentId:'main',reason:ended?'completed':'created',kind:'lifecycle',
  status:ended?'completed':'started',task:`task ${childId}`,tool:null,startedAt:null,interrupted:false,count:null,ended} as any);
const woken=(...childIds:string[]):TuiEvent=>({type:'run.started',sessionId:'main',runId:'r',delegation:childIds.map(childId=>({childId,status:'completed',task:null,summary:'ok'}))} as any);
function fold(events:readonly TuiEvent[]):readonly LiveAgent[]{return events.reduce<readonly LiveAgent[]>((list,event)=>reduceLiveAgents(list,event),[]);}

test('ASYNC 4: Esc stops the main agent only — the kernel\'s stop touches no child (pinned)',()=>{
  const registry=readFileSync(new URL('../../../harness-ui/src/session-registry.mjs',import.meta.url),'utf8');
  /* K2 (F-020, desktop): the stop now also says who stopped (`daChi`) and keeps only the person's queued messages paused */
  /* r4 block 13: `figlie:'tutte'` is the one way to stop the children too, and the CLI's Esc never asks for it */
  const signature='    ferma(sessionId, { redirectId: redirectIdInVolo = null, daChi = \'persona\', figlie = null } = {}) {';
  const start=registry.indexOf(signature);
  assert.ok(start>0,'the kernel\'s ferma moved');
  /* the code only: the kernel's comments now talk about the children's results, which the stop leaves alone */
  const body=registry.slice(start+signature.length,registry.indexOf('\n    },\n',start)).replace(/\/\*[\s\S]*?\*\//gu,'').replace(/ *if \(figlie === 'tutte'\) return [^\n]*\n/u,'');
  assert.match(body,/voce\.controller\.abort\(\);/u,'it aborts the session it was given');
  assert.doesNotMatch(body,/padreId|figli|elencaFigli|ferma\(/u,'and no child: no cascade');
  const controller=readFileSync(new URL('../../src/runtime/session-facade.ts',import.meta.url),'utf8');
  assert.doesNotMatch(controller,/figlie\s*:/u,'the CLI never asks to stop the children');
});

test('ASYNC 4: the first Ctrl+C says how many agents the exit stops',()=>{
  assert.equal(exitHintText('ctrl-c'),'Press Ctrl+C again to exit','no agent: as before');
  assert.equal(exitHintText('ctrl-c',0),'Press Ctrl+C again to exit');
  assert.equal(exitHintText('ctrl-c',1),'Press Ctrl+C again to exit · 1 agent will be stopped');
  assert.equal(exitHintText('ctrl-d',3),'Press Ctrl+D again to exit · 3 agents will be stopped');
});

test('ASYNC 4: /exit with agents working asks wait · stop · stay, wait first',()=>{
  assert.deepEqual(EXIT_CHOICES,['wait','stop','stay']);
  const content=exitWithAgentsOverlay(0,2);
  const text=[...(content.head??[]),...content.sections.flatMap(section=>section.lines),...(content.foot??[])].map(line=>line.text);
  assert.equal(text[0],'2 agents are still working');
  assert.match(text[1]!,/Exiting stops them/u);
  assert.deepEqual(content.sections[0]!.lines.map(line=>[line.text,line.tone]),[
    ['› Wait for them, then exit','selected'],['  Stop them and exit','plain'],['  Stay','plain']]);
  assert.equal(content.sections[0]!.selected,0);
  assert.equal(exitWithAgentsOverlay(2,1).head?.[0]?.text,'1 agent is still working');
  assert.equal(exitWithAgentsOverlay(2,1).sections[0]!.selected,2);
  assert.deepEqual(exitWithAgentsOverlay(2,1).sections[0]!.lines.map(line=>line.tone),['plain','plain','selected'],'the highlight follows the choice');
  assert.match(text.at(-1)!,/Enter confirms · Esc stays/u);
});

test('ASYNC 4: a woken run marks the agents whose results it carries as answered',()=>{
  const list=fold([changed('a'),changed('b'),changed('a',true),woken('a')]);
  assert.deepEqual(list.map(agent=>[agent.childId,agent.ended,agent.reported]),[['a',true,true],['b',false,false]]);
  assert.equal(fold([changed('a'),woken('a')])[0]!.reported,true,'reported even if the end arrives later');
  const same=fold([changed('a')]);
  assert.equal(reduceLiveAgents(same,{type:'run.started',sessionId:'main',runId:'r'} as any),same,'a run without results changes nothing');
  const state=[changed('a',true),woken('a')].reduce(reduceTuiEvent,initialTuiState({model:'m',permissionMode:'ask'}));
  assert.deepEqual(state.agents.map(agent=>[agent.childId,agent.reported]),[['a',true]],'the TUI state folds the woken run');
  assert.equal(state.running,true,'and the run still starts');
});

test('ASYNC 4: «wait» exits once its agents ended, their results were answered and no turn is open; a grace if no wake comes',()=>{
  const waitFor=['a','b'];
  const at=(events:readonly TuiEvent[])=>fold(events);
  const now=100_000;
  assert.equal(exitWaitDone({waitFor,agents:at([changed('a'),changed('b')]),running:false,settledSinceMs:0,nowMs:now}),false,'still working');
  assert.equal(exitWaitDone({waitFor,agents:at([changed('a',true),changed('b')]),running:false,settledSinceMs:0,nowMs:now}),false,'one still working');
  const ended=at([changed('a',true),changed('b',true)]);
  assert.equal(exitWaitDone({waitFor,agents:ended,running:false,settledSinceMs:now-1000,nowMs:now}),false,'ended, but the main agent has not answered yet');
  const answered=at([changed('a',true),changed('b',true),woken('a','b')]);
  assert.equal(exitWaitDone({waitFor,agents:answered,running:true,settledSinceMs:null,nowMs:now}),false,'the main agent is answering');
  assert.equal(exitWaitDone({waitFor,agents:answered,running:false,settledSinceMs:now,nowMs:now}),true,'answered and idle: exit');
  assert.equal(exitWaitDone({waitFor,agents:ended,running:false,settledSinceMs:now-EXIT_WAIT_GRACE_MS,nowMs:now}),true,'no wake within the grace: exit anyway');
  assert.equal(exitWaitDone({waitFor,agents:ended,running:false,settledSinceMs:null,nowMs:now}),false,'the grace counts from idle only');
  assert.equal(exitWaitDone({waitFor:['gone'],agents:answered,running:false,settledSinceMs:now,nowMs:now}),true,'an agent the list no longer knows is not waited for');
  assert.equal(exitWaitDone({waitFor:[],agents:[],running:false,settledSinceMs:now,nowMs:now}),true);
  assert.equal(exitWaitDone({waitFor:['a','b'],agents:[...answered,...at([changed('later')])],running:false,settledSinceMs:now,nowMs:now}),true,'an agent started after the choice is not waited for');
  assert.ok(EXIT_WAIT_GRACE_MS>=10_000&&EXIT_WAIT_GRACE_MS<=30_000,'a grace long enough for the kernel\'s wake, short enough not to hang');
});
