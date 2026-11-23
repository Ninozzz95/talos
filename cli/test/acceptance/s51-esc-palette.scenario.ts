/**
 * s51 — REV-ESC-PTY (owner 07/10: «Sì, promuovila ora»): the Esc key closes the /theme page and the very next keys
 * reach the composer as text. It pins the regression measured in the registro (Voce 13bis): a lone ESC rode the
 * mouse→focus filter give-back dance, the Esc key died and the next key fused into an Alt chord (theme page open,
 * Esc mute, 'THINK' became Alt+T). The cure lets a lone ESC through at once — the filters are armed for 60 ms to
 * still reassemble split reports/markers (ghost ESC <20 ms, Ink's pending window) — and this scenario is its PTY
 * gate: real ConPTY, a person's rhythm (the delivery wait between keys is part of the contract).
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {composerReady} from './checks.ts';
import {stage,toComposer} from './harness.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const s=stage({name:'s51-esc-palette',files:{'README.md':'# demo\n'}});
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const themePage=(x:Screen)=>/██ \S+ +in use/u.test(x.text);

test('s51 · Esc closes /theme at once and the next keys reach the composer, not an Alt chord',async()=>{
  const t=s.launch([],{cols:100,rows:30});
  try{
    await toComposer(t);
    /* 1. /theme opens the theme page; the composer is covered. */
    await t.submit('/theme');
    const page=await t.waitFor('the theme page open',themePage,{timeout:15_000});
    assert.ok(!composerReady(page),'the theme page replaces the composer');
    /* 2. Esc closes it. The 150 ms pause before waiting is the DELIVERY wait of a person's next keypress —
       quiet() alone returns on an already-silent channel and hides the regression (sonda 07/10). */
    t.press('esc');
    const closed=await t.waitFor('Esc closed the theme page',x=>!themePage(x)&&composerReady(x),{timeout:5_000});
    assert.doesNotMatch(closed.lines.join('\n'),/\[200~|\[201~|\[</u,'control bytes leaked into the composer');
    /* 3. The very next keys land as text in the composer — the Alt+T fusion is the defect this pins. */
    await t.submit('THINK about the project');
    const turn=await t.waitFor('the answer landed and the footer counted it',x=>composerReady(x)&&/↓\d/u.test(x.text),{timeout:30_000});
    assert.match(turn.lines.join('\n'),/THINK/u,'the submitted text is not in the transcript');
    /* 4. The palette still opens filtered and Enter runs the command (the old guarantees intact). */
    await t.type('/',60);
    await t.waitFor('the command menu opens',x=>x.text.includes('│Commands'),{timeout:5_000});
    await t.type('theme',60);
    await t.waitFor('the palette is filtered to /theme',x=>/› \/theme/u.test(x.text),{timeout:5_000});
    t.press('enter');
    await t.waitFor('Enter on the filtered palette reopens the theme page',themePage,{timeout:10_000});
    /* 5. And Esc closes it again — the round trip ends where it began. */
    t.press('esc');
    await pause(150);
    await t.waitFor('the second Esc closes the theme page',x=>!themePage(x)&&composerReady(x),{timeout:5_000});
  }finally{await t.close();}
});
