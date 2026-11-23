/*
 * 0.6.11 (owner 17/10/2026, «Sì, nella prossima versione»): the theme's background fills the whole window. In the real terminal
 * TALOS sets the terminal's default background to the theme's (OSC 11) before the first frame, and gives it back (OSC 111) when
 * it leaves; with TALOS_TUI_TERMINAL_BACKGROUND=0 it never touches it. On Windows only inside Windows Terminal (`WT_SESSION`; owner
 * 21/10/2026 «Solo in Windows Terminal»): the system ConPTY absorbs OSC 111 (the bugfixer's review, F1), so elsewhere it stays off.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {exitTalos,stage,toComposer} from './harness.ts';

const on=stage({name:'s77',files:{'README.md':'# demo\n'},extraEnv:{WT_SESSION:'talos-s77',TERM_PROGRAM:''}});
const off=stage({name:'s77-off',files:{'README.md':'# demo\n'},extraEnv:{WT_SESSION:'talos-s77',TERM_PROGRAM:'',TALOS_TUI_TERMINAL_BACKGROUND:'0'}});
/* the system console (no Windows Terminal): an empty WT_SESSION, since the acceptance child inherits the engineer's own */
const consoleHost=stage({name:'s77-console',files:{'README.md':'# demo\n'},extraEnv:{WT_SESSION:''}});
/* review 2 S3-2: VS Code opened from a Windows Terminal tab inherits WT_SESSION, and is still not Windows Terminal */
const vscodeHost=stage({name:'s77-vscode',files:{'README.md':'# demo\n'},extraEnv:{WT_SESSION:'talos-s77',TERM_PROGRAM:'vscode'}});

test('s77 · the theme background is set on the terminal before the composer, and given back on the way out',async()=>{
  const t=on.launch([],{cols:100,rows:24});
  await toComposer(t);
  const up=t.output.read().backgrounds;
  assert.ok(up.length>=1&&/^rgb:[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{2}$/u.test(up[0]!),`OSC 11 with the theme colour was not written (${up.join(' ')||'none'})`);
  assert.ok(!up.includes('reset'),'the background was reset while the screen was up');
  assert.ok(await exitTalos(t),'TALOS exits');
  const all=t.output.read().backgrounds;
  /* Measured 20/10/2026: the system ConPTY passes OSC 11 but absorbs OSC 110/111 (and the `OSC 11 ; ?` query), so on Windows the
     reset never reaches this side of the pty. That TALOS writes it, once and before leaving the screen, is proven in
     test/tui/terminal-background-run.test.ts; here it is checked where the pty forwards it. */
  if(process.platform!=='win32'){
    assert.equal(all.at(-1),'reset',`the terminal background was not given back at exit (${all.join(' ')})`);
    assert.equal(all.filter(b=>b==='reset').length,1,'given back exactly once');
  }
  assert.equal(all.filter(b=>b!=='reset').length,1,`the background was set more than once without a theme change (${all.join(' ')})`);
});

test('s77 · AL CONTRARIO — with TALOS_TUI_TERMINAL_BACKGROUND=0 the terminal background is never touched',async()=>{
  const t=off.launch([],{cols:100,rows:24});
  await toComposer(t);
  assert.ok(await exitTalos(t),'TALOS exits');
  assert.deepEqual(t.output.read().backgrounds,[],'OSC 11/111 written although it was switched off');
});

test('s77 · on Windows outside Windows Terminal the terminal background is never touched (the reset would be lost)',{skip:process.platform!=='win32'},async()=>{
  const t=consoleHost.launch([],{cols:100,rows:24});
  await toComposer(t);
  assert.ok(await exitTalos(t),'TALOS exits');
  assert.deepEqual(t.output.read().backgrounds,[],'OSC 11 written on a host that cannot take the reset');
});

test('s77 · on Windows, a terminal that inherited WT_SESSION but names itself (VS Code) is never touched',{skip:process.platform!=='win32'},async()=>{
  const t=vscodeHost.launch([],{cols:100,rows:24});
  await toComposer(t);
  assert.ok(await exitTalos(t),'TALOS exits');
  assert.deepEqual(t.output.read().backgrounds,[],'OSC 11 written inside VS Code because WT_SESSION was inherited');
});
