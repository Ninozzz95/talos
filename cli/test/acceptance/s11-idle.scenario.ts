/**
 * s11 — idle means idle: after boot and after an answered turn TALOS writes nothing for 5 s (gate E5, E6; Q-R1-6, Q-R1-7).
 *
 * The baseline is an idle trivial Node child under the same ConPTY and size, measured over the same window, because the
 * bytes the harness sees are ConPTY's re-rendering, not the program's own writes. Pass = no DEC 2026 frame in the window
 * and no more bytes than the baseline. `TALOS_TUI_RENDER_METRICS=1` is set so the in-process summary (Ink renders,
 * frames, bytes, clears once run.ts wires them) is printed at exit and reported next to the pty numbers.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertIdleQuiet,assertMouseAsDecided,composerReady,idleFooter} from './checks.ts';
import {IDLE_WINDOW_MS,exitTalos,idleBaseline,stage,toComposer,turn} from './harness.ts';
import {describeOutput,type OutputCount,type TerminalSession} from './terminal.ts';

const SIZE={cols:100,rows:30};
const s=stage({name:'s11',files:{'README.md':'# demo\n'}});
let t:TerminalSession;let baseline:OutputCount;

test('s11 · baseline: what ConPTY writes for an idle trivial child in 5 s',async ctx=>{
  const measured=await idleBaseline(SIZE);baseline=measured;
  ctx.diagnostic(`baseline start-up: ${describeOutput(measured.startup)}`);
  ctx.diagnostic(`baseline idle window: ${describeOutput(measured)}`);
  /* If ConPTY framed output on its own, "0 frames" could not be the pass rule of E6. */
  assert.equal(measured.esu,0,`ConPTY wrote DEC 2026 frames for a child that writes nothing: ${describeOutput(measured)}`);
});

test('s11 · TALOS boots to an idle composer',async()=>{
  s.profile.env.TALOS_TUI_RENDER_METRICS='1';
  t=s.launch([],SIZE);
  await toComposer(t);
  /* 0.6.2: the status row's provider badge lands once, a moment after the composer (one background check, then «verified»);
     that one frame belongs to the start, so the idle window opens after it. From there on the row is silent: see below. */
  /* second review of 0.6.2 (13/10/2026): «not verified» was accepted here too; the fake provider answers, so the row ends at
     «verified» (an answer later than the check's 2 s still reaches the row: catalog-service.ts, N5) */
  await t.waitFor('the provider check landed',x=>/\bollama: verified(?=\s|$)/mu.test(x.text),{timeout:15_000});
});

test('s11 · after boot, 5 s of idle write no frame and no more than the baseline',async ctx=>{
  const idle=await t.observe(IDLE_WINDOW_MS);
  ctx.diagnostic(`idle after boot: ${describeOutput(idle)}`);
  assertIdleQuiet(idle,baseline);
});

test('s11 · a turn answers through the fake provider',async()=>{
  const screen=await turn(t,s.fake,'hello idle');
  assert.match(screen.text,/^ {2}OK$/mu);
});

test('s11 · after an answered turn, 5 s of idle write no frame and no more than the baseline',async ctx=>{
  const idle=await t.observe(IDLE_WINDOW_MS);
  ctx.diagnostic(`idle after a turn: ${describeOutput(idle)}`);
  assertIdleQuiet(idle,baseline);
});

test('s11 · a Markdown answer (measured transcript rows) arrives',async()=>{
  const screen=await turn(t,s.fake,'MD idle after markdown');
  assert.match(screen.text,/Second step/u);
});

test('s11 · after a Markdown answer, 5 s of idle write no frame and no more than the baseline',async ctx=>{
  const idle=await t.observe(IDLE_WINDOW_MS);
  ctx.diagnostic(`idle after a Markdown answer: ${describeOutput(idle)}`);
  assertIdleQuiet(idle,baseline);
});

/* Measured 2026-09-24 at 4658f479f: one identical full repaint (ESC[2J ESC[3J + 3.4 KB) ~35 ms after the overlay opens,
   and the same after a resize. Its source is `Ink.useBoxMetrics` in `MeasuredTranscriptRow` (app.ts:169): it tracks
   `top`/`left` too, so rows that only MOVE re-render once more; replacing it with a stub removed both frames. */
test('s11 · R1-IDLE with the help overlay open, 5 s of idle write no frame and no more than the baseline',async ctx=>{
  t.send('?');
  await t.waitFor('help open',x=>/│Help +│/u.test(x.text),{timeout:10_000})/* R5b D7: grouped /help, known by its title */;
  const idle=await t.observe(IDLE_WINDOW_MS);
  ctx.diagnostic(`idle with the help overlay open: ${describeOutput(idle)}`);
  t.press('esc');await t.waitFor('help closed',x=>!/│Help +│/u.test(x.text)&&composerReady(x),{timeout:5_000});
  assertIdleQuiet(idle,baseline);
});

test('s11 · R1-IDLE after a resize to 60×20, 5 s of idle write no frame and no more than the baseline',async ctx=>{
  t.resize(60,20);
  await t.waitFor('the frame at 60 columns',x=>x.lines.some(line=>/^╭─{50,58}╮$/u.test(line.trimEnd())),{timeout:10_000});
  const idle=await t.observe(IDLE_WINDOW_MS);
  ctx.diagnostic(`idle after a resize to 60×20: ${describeOutput(idle)}`);
  t.resize(SIZE.cols,SIZE.rows);
  await t.waitFor('the frame at 100 columns',x=>x.lines.some(line=>/^╭─{90,98}╮$/u.test(line.trimEnd())),{timeout:10_000});
  assertIdleQuiet(idle,baseline);
});

/* The check must be able to fail on this very terminal: while an answer streams, TALOS commits frames. */
test('s11 · the idle check fails while an answer is streaming (the check bites)',async ctx=>{
  await t.submit('SLOW idle control');
  await t.waitForText('can be observed while it is still arriving',{timeout:20_000});
  const busy=await t.observe(2_000);
  ctx.diagnostic(`while streaming: ${describeOutput(busy)}`);
  assert.throws(()=>assertIdleQuiet(busy,baseline),/^AssertionError[^]*R1-IDLE: TALOS kept writing while idle/u);
  await t.waitFor('the SLOW answer ended',x=>idleFooter(x)&&composerReady(x),{timeout:60_000});
});

/* stage 6c (owner 02/10) replaced REV-NATIVE-SELECTION: the mouse is on by default, drag selection included */
test('s11 · stage 6c: the mouse is on by default, as decided (buttons, drag, SGR, and motion for the hover)',()=>{
  assertMouseAsDecided(t.output.read());
});

test('s11 · at exit the in-process render metrics are printed',async ctx=>{
  assert.equal(await exitTalos(t),true,`TALOS is still running\n${t.dump('exit')}`);
  ctx.diagnostic(`whole session through the pty: ${describeOutput({...t.output.read(),frameAt:[]})}`);
  const line=t.normalLines().find(row=>row.includes('talos.cli.tui-render-metrics.v1'));
  assert.ok(line,`no render-metrics summary after exit:\n${t.normalLines().filter(Boolean).slice(-10).join('\n')}`);
  const summary=JSON.parse(line.slice(line.indexOf('{'),line.lastIndexOf('}')+1));
  ctx.diagnostic(`in-process summary: ${JSON.stringify(summary)}`);
  assert.equal(summary.schema,'talos.cli.tui-render-metrics.v1');
});
