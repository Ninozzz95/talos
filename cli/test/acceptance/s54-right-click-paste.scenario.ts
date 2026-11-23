/**
 * Owner 08/10/2026 (stress test of 0.5.0): «già primo errore: tasto destro non pasta». With the mouse captured, the terminal
 * hands the right button to TALOS instead of pasting; TALOS did nothing with it. Claude Code fullscreen: «Right-click and
 * middle-click paste continue to work on terminals that support them». On the BUILT CLI through ConPTY: a right click puts the
 * clipboard into the composer the way the terminal's own paste does — one line typed as it is, several lines folded into
 * `[Pasted text #N +X lines]`. The clipboard is the test profile's own file (TALOS_CLIPBOARD_FILE), never the person's.
 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {test} from 'node:test';
import {stage,toComposer} from './harness.ts';
import type {TerminalSession} from './terminal.ts';

const s=stage({name:'s54',files:{'README.md':'# demo\n'}});
const ESC='\u001b';
const setClipboard=(text:string)=>writeFileSync(join(s.profile.home,'clipboard.txt'),text,'utf8');
let t:TerminalSession;
/* the right button (SGR code 2), pressed and released on the composer's row */
function rightClick(){
  const lines=t.screen().lines,row=lines.findIndex(line=>/^│ ›/u.test(line));
  assert.ok(row>=0,`no composer row:\n${t.screen().text}`);
  t.send(`${ESC}[<2;10;${row+1}M${ESC}[<2;10;${row+1}m`);
}

test('s54 · a right click pastes the clipboard into the composer',async()=>{
  t=s.launch([],{cols:100,rows:30});
  try{
    await toComposer(t);
    setClipboard('hello from the clipboard');
    rightClick();
    await t.waitFor('one line pasted as it is',x=>x.lines.some(line=>/^│ › hello from the clipboard/u.test(line)),{timeout:10_000});
    t.press('ctrl+c');
    await t.waitFor('the composer is empty again',x=>x.lines.some(line=>/^│ › Ask TALOS/u.test(line)),{timeout:5_000});
    setClipboard(Array.from({length:12},(_,i)=>`clipboard line ${i+1}`).join('\n'));
    rightClick();
    const folded=await t.waitFor('several lines folded like a paste',x=>/\[Pasted text #\d+ \+11 lines\]/u.test(x.text),{timeout:10_000});
    assert.doesNotMatch(folded.text,/clipboard line 7/u,'the lines stay folded');
  }finally{await t.close();}
});
