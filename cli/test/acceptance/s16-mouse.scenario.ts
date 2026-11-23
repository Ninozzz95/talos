/*
 * REV-NATIVE-SELECTION: this isolated profile explicitly enables the mouse wheel. In the real terminal:
 * the wheel scrolls the conversation 3 rows a step (SGR reports ESC[<64/65;x;yM, as Windows Terminal sends them), no
 * report ever reaches the composer as text, only button reports are asked for (never a motion mode, which would take the
 * terminal's drag selection away), and TALOS switches them off when it leaves.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertMouseAsDecided} from './checks.ts';
import {exitTalos,stage,toComposer,turn} from './harness.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const ESC='\u001b';
const WHEEL_UP=`${ESC}[<64;20;5M`,WHEEL_DOWN=`${ESC}[<65;20;5M`;
const HEAD='Summary of the project';const TAIL='Second step';
const s=stage({name:'s16',files:{'README.md':'# demo\n','src/index.js':"console.log('hi')\n"}});
let t:TerminalSession;
const shows=(x:Screen,text:string)=>x.lines.some(line=>line.includes(text));
const composerEmpty=(x:Screen)=>x.lines.some(line=>/^│ › (?:Ask TALOS, \/ for commands, @ for files)?\s*│?$/u.test(line.trimEnd()));

test('s16 · a Markdown answer taller than the screen arrives at 100×20, the mouse explicitly on',async()=>{
  const configured=await s.profile.talos(['config','set','ui.mouse','true','--scope','project-user']);
  assert.equal(configured.status,0,configured.stderr);
  t=s.launch([],{cols:100,rows:20});
  await toComposer(t);
  const answer=await turn(t,s.fake,'MD wheel check');
  assert.ok(shows(answer,TAIL)&&!shows(answer,HEAD),`the end of the answer on screen, its start above:\n${answer.text}`);
  assertMouseAsDecided(t.output.read());
});

test('s16 · the wheel up brings the start of the answer into view, and nothing is typed into the composer',async()=>{
  let up:Screen|null=null;
  for(let i=0;i<8&&!up;i++){t.send(WHEEL_UP);up=await t.waitFor(`wheel up #${i+1}`,x=>shows(x,HEAD),{timeout:800}).catch(()=>null);}
  assert.ok(up,`P3-WHEEL: eight wheel steps up never showed "${HEAD}":\n${t.screen().text}`);
  assert.ok(composerEmpty(up!),`P3-WHEEL: a mouse report reached the composer:\n${up!.text}`);
  assert.doesNotMatch(up!.text,/\[<6[45];/u,'P3-WHEEL: a raw report is on screen');
});

test('s16 · the wheel down goes back to the newest rows',async()=>{
  let down:Screen|null=null;
  for(let i=0;i<10&&!down;i++){t.send(WHEEL_DOWN);down=await t.waitFor(`wheel down #${i+1}`,x=>shows(x,TAIL)&&!shows(x,HEAD),{timeout:800}).catch(()=>null);}
  assert.ok(down,`P3-WHEEL: the wheel down never came back to "${TAIL}":\n${t.screen().text}`);
  assert.ok(composerEmpty(down!),'P3-WHEEL: the composer is still empty');
});

test('s16 · leaving TALOS switches the mouse reports off',async()=>{
  const meter=t.output.read();const enabledBefore=meter.mouseEnables.length;
  assert.ok(await exitTalos(t),'TALOS exits');
  const after=t.output.read();
  assert.ok(after.mouseDisables.some(seq=>seq.includes('1006'))&&after.mouseDisables.some(seq=>seq.includes('1000')),`P3-MOUSE: no switch-off at exit (${after.mouseDisables.join(' ')||'none'})`);
  assert.equal(after.mouseEnables.length,enabledBefore,'nothing turned the mouse back on while leaving');
});
