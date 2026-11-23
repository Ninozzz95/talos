import assert from 'node:assert/strict';
import test from 'node:test';
import {displayWidth} from '../../src/tui/text-width.ts';
import {edgeRosterLine,mainRosterLine,queueRosterLine,residualFooterFields,shellSafeText,terminalFrameProps,terminalShortcutStrip} from '../../src/tui/components/terminal-shell.ts';

test('shortcut strip exposes real keyboard affordances and interrupt only while running',()=>{
  const running=terminalShortcutStrip({mode:'default',running:true,queueCount:2,width:160});
  assert.match(running,/Shift\+Tab cycle/u);
  assert.match(running,/Esc\/Ctrl\+C interrupt/u);
  assert.match(running,/PageUp\/PageDown transcript/u);
  assert.match(running,/\? help/u);
  assert.match(running,/queue 2/u);
  const idle=terminalShortcutStrip({mode:'plan',running:false,queueCount:0,width:160});
  assert.doesNotMatch(idle,/interrupt/u);
});

test('shell chrome never exceeds the supplied terminal width',()=>{
  for(const width of [12,20,40,80]){
    assert.ok(displayWidth(terminalShortcutStrip({mode:'acceptEdits',running:true,queueCount:9,width}))<=width);
    assert.ok(displayWidth(mainRosterLine({kind:'thinking',model:'provider:very-long-model-name',width}))<=width);
    assert.ok(displayWidth(queueRosterLine({count:12,preview:'a very long queued follow-up that must be cut',width}))<=width);
    assert.ok(displayWidth(edgeRosterLine({left:'● main · ready · model x:y',right:'context 12k/128k',width}))<=width);
  }
});

test('shell chrome neutralizes controls bidi and invisible unicode without creating rows',()=>{
  const unsafe='safe\u001b[2J\u202Ehidden\nnext\u2066';
  const safe=shellSafeText(unsafe);
  assert.equal(safe.includes('\u001b'),false);
  assert.equal(safe.includes('\u202e'),false);
  assert.equal(safe.includes('\n'),false);
  assert.match(safe,/\\u001b/u);
  assert.match(safe,/\\u202e/u);
  assert.match(safe,/\\u2066/u);
});

test('roster reports only real main and queue state, never fabricates subagents',()=>{
  /* R3 Q-R3-7 (gate E7): a running tool reads `running` (was the internal word `tool`). */
  assert.match(mainRosterLine({kind:'tool',model:'openai:gpt-5-mini',width:120}),/main · running · model openai:gpt-5-mini/u);
  const queue=queueRosterLine({count:2,preview:'follow up',width:120});
  assert.match(queue,/queue · 2 pending/u);
  assert.doesNotMatch(queue,/agent|subagent/iu);
});

test('context occupies the right edge only when it fits and residual footer omits mode model context',()=>{
  const wide=edgeRosterLine({left:'● main · ready · model x:y',right:'context 8k/128k',width:80});
  assert.match(wide,/context 8k\/128k$/u);
  const narrow=edgeRosterLine({left:'● main · ready · model x:y',right:'context 8k/128k',width:20});
  assert.doesNotMatch(narrow,/context/u);
  const residual=residualFooterFields({workspace:'/repo',sessionId:'s1',unseen:3});
  assert.deepEqual(residual.map(row=>row.id),['unseen','session','workspace']);
});


test('M2-C terminal frame paints only the fullscreen color session and never paints plain fallback',()=>{
  /* R1 Q-R1-6 (lane L): the frame height depends on the platform (win32 policy in terminal-shell.ts), so the paint
     contract is pinned on a platform that keeps `rows`; the win32 height is pinned in r1-layout-frame.test.ts. */
  const full=terminalFrameProps({
    session:{mode:'full',alternateScreen:true,paintBackground:true,fallbackReason:null},
    background:'#0B0D10',rows:40,columns:120,platform:'linux',
  } as any);
  assert.deepEqual(full,{flexDirection:'column',width:120,height:40,backgroundColor:'#0B0D10'});

  const mono=terminalFrameProps({
    session:{mode:'mono',alternateScreen:true,paintBackground:false,fallbackReason:null},
    background:undefined,rows:20,columns:80,platform:'linux',
  } as any);
  assert.deepEqual(mono,{flexDirection:'column',width:80,height:20});

  const plain=terminalFrameProps({
    session:{mode:'plain',alternateScreen:false,paintBackground:false,fallbackReason:'term-dumb'},
    background:undefined,rows:0,columns:0,
  } as any);
  assert.deepEqual(plain,{flexDirection:'column'});
});
