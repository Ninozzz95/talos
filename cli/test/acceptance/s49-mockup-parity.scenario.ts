/**
 * Mockup parity (owner 08/10/2026: «la parità col mockup non è stata raggiunta pienamente: i blocchi di ragionamento e tool call non sono così nella 0.5.0»).
 * The approved mockup is the 07/10 one (MOCKUP-FASE-UI-2026-10-07-badge.html); its golden frames at 120x40 (generated with MOCKUP-FASE-UI-golden.mjs,
 * step 02 «Conversazione e indicatore», t12s) draw a finished turn as:
 *   ` › The login e2e test is flaky. Find out why and fix it.`
 *   `  ▸ Thought for 4s  click to read`
 *   `  ● Read 2 files, searched 1 pattern · ctrl+o`
 *   `  ● edited 1 file, ran 1 command · ctrl+o`
 * The same turn, on the BUILT CLI through ConPTY, must draw the same rows (the duration is measured, so only its shape is fixed).
 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {after,test} from 'node:test';
import {stage,toComposer} from './harness.ts';
import {sinkEnv,startRefusingSink} from './sink.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const sink=await startRefusingSink();
after(()=>sink.close());
const s=stage({name:'s49',files:{'README.md':'# demo\n','src/index.js':'console.log(1)\n'},extraEnv:sinkEnv(sink)});
let t:TerminalSession;
const done=(x:Screen)=>x.text.includes('nothing else changed')&&!/esc to stop/u.test(x.text);

test('s49 · a finished turn draws the approved mockup\'s rows: the thought, one exploration group, one work group',async()=>{
  t=s.launch(['--permission-mode','bypassPermissions'],{cols:120,rows:40});
  try{
    await toComposer(t);
    await t.submit('MOCKUP The login e2e test is flaky. Find out why and fix it.');
    const x=await t.waitFor('the finished turn',done,{timeout:60_000});
    const lines=x.lines.map(line=>line.replace(/\s+$/u,''));
    const show=`\n--- frame ---\n${x.text}`;
    /* the side-by-side with the golden frame (TALOS_S49_FRAME=<file>): the frame as the terminal holds it */
    if(process.env.TALOS_S49_FRAME)writeFileSync(process.env.TALOS_S49_FRAME,`${x.text}\n`);
    assert.ok(lines.includes(' › MOCKUP The login e2e test is flaky. Find out why and fix it.'),`the prompt row${show}`);
    assert.ok(lines.some(line=>/^ {2}▸ Thought for \d+(?:\.\d+)?s {2}click to read$/u.test(line)),`the thought row${show}`);
    assert.ok(lines.includes('  ● Read 2 files, searched 1 pattern · ctrl+o'),`the exploration group${show}`);
    assert.ok(lines.includes('  ● edited 1 file, ran 1 command · ctrl+o'),`the work group${show}`);
    assert.equal(lines.filter(line=>/^Shell |^Edit file |^Read file /u.test(line.trim())).length,0,`no row per call under a closed group${show}`);
    /* the answer: no «TALOS» label, indented two cells; the prompt has no «You» label */
    assert.ok(lines.includes('  The fix is in src/index.js; nothing else changed.'),`the answer row${show}`);
    assert.equal(lines.filter(line=>/^(?:You|TALOS)$/u.test(line.trim())).length,0,`no You/TALOS labels${show}`);
    /* the chrome (mockup header, composerRows, footerRows): ` TALOS  <folder>`, the rounded composer with its placeholder,
       the mode row and, at 120 columns, the model row last */
    assert.match(lines[0]!,/^ TALOS {2}\S/u,`the header${show}`);
    const top=lines.findIndex(line=>/^╭─+╮$/u.test(line));
    assert.ok(top>0&&lines[top]!.length===120,`the composer's rounded top${show}`);
    assert.match(lines[top+1]!,/^│ › Ask TALOS, \/ for commands, @ for files +│$/u,`the composer's placeholder${show}`);
    assert.match(lines[top+2]!,/^╰─+╯$/u,`the composer's rounded bottom${show}`);
    assert.equal(lines[top+3],' full access · shift+tab · ? keys',`the mode row${show}`);
    assert.match(lines[top+4]!,/^ \S.* · ctx (?:~?\d+%|\?)(?: · .+)?$/u,`the model row${show}`);
  }finally{await t.close();}
});
