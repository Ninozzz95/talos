/**
 * s50 — stage 7.3 (owner 01/10 «ogni comando deve avere il suo pannello»; the approved mockup's sheets). On the BUILT CLI
 * through ConPTY: /busy, /plan, /retry and /rename open their sheet in the composer's place as the mockup draws it (title
 * row with ✕, the rows, the row of keys); the keys and the clicks choose; the choice does what the command with its argument
 * does; Esc and the ✕ close.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {idleFooter} from './checks.ts';
import {stage,toComposer} from './harness.ts';
import type {TerminalSession} from './terminal.ts';

const s=stage({name:'s50',files:{'README.md':'# demo\n'}});
const ESC='\u001b';
let t:TerminalSession;
function click(text:string,offset=1){
  const lines=t.screen().lines;const row=lines.findIndex(line=>line.includes(text));
  assert.ok(row>=0,`"${text}" is not on screen:\n${t.screen().text}`);
  const col=lines[row]!.indexOf(text)+offset;
  t.send(`${ESC}[<0;${col+1};${row+1}M${ESC}[<0;${col+1};${row+1}m`);
}

test('s50 · /busy: the sheet as the mockup draws it; ↓ Enter chooses; the ✕ closes the next one',async()=>{
  t=s.launch([],{cols:120,rows:40});
  try{
  await toComposer(t);
  await t.submit('/busy');
  const sheet=await t.waitFor('the busy sheet',x=>x.text.includes('── While TALOS works, Enter… your choice for this project'),{timeout:10_000});
  for(const row of [' › ● Queues the message','     sent when the turn ends; see and edit it in /queue','   ○ Steers the turn',' ↑/↓ move   enter use   esc close'])
    assert.ok(sheet.lines.some(line=>line.startsWith(row)),`the sheet shows «${row}»\n${sheet.text}`);
  t.press('down');t.press('enter');
  await t.waitFor('chosen',x=>x.text.includes('While busy, Enter steers the turn')&&!x.text.includes('── While TALOS works'),{timeout:5_000});
  await t.submit('/busy');
  await t.waitFor('the sheet again, on its first row, with steer in use',x=>x.lines.some(line=>line.startsWith('   ● Steers the turn')),{timeout:10_000});
  click(' ✕',1);
  await t.waitFor('the ✕ closed it',x=>!x.text.includes('── While TALOS works'),{timeout:5_000});
  }finally{await t.close();}
});

test('s50 · /plan by click: a click selects «Plan first», a second click on it chooses; the mode is plan',async()=>{
  t=s.launch([],{cols:120,rows:40});
  try{
  await toComposer(t);
  await t.submit('/plan');
  await t.waitFor('the plan sheet',x=>x.text.includes('── Plan mode'),{timeout:10_000});
  /* the sheet opens on «Plan first»: a click on another row selects it; a click on the selected row chooses */
  click('Work normally',2);
  await t.waitFor('Work normally selected',x=>x.lines.some(line=>line.startsWith(' › ● Work normally')),{timeout:5_000});
  click('Plan first',2);
  await t.waitFor('Plan first selected',x=>x.lines.some(line=>line.startsWith(' › ○ Plan first')),{timeout:5_000});
  click('Plan first',2);
  await t.waitFor('plan mode on',x=>/^ plan mode\b/mu.test(x.text)&&x.text.includes('Plan mode on · shift+tab also switches'),{timeout:5_000});
  }finally{await t.close();}
});

test('s50 · /retry sends the last message again from its sheet; /rename renames from its form',async()=>{
  t=s.launch([],{cols:120,rows:40});
  try{
  await toComposer(t);
  await t.submit('SLOW tell me about it');
  await t.waitFor('answered',x=>idleFooter(x)&&/✓ Done in/u.test(x.text),{timeout:30_000});
  const before=s.fake.chatRequests().filter((r:any)=>r.lastUser?.includes('SLOW tell me about it')).length;
  await t.submit('/retry');
  await t.waitFor('the retry sheet',x=>x.text.includes('── Send again')&&x.text.includes('› SLOW tell me about it'),{timeout:10_000});
  t.press('enter');
  await t.waitFor('sent again',()=>s.fake.chatRequests().filter((r:any)=>r.lastUser?.includes('SLOW tell me about it')).length>before,{timeout:30_000});
  await t.waitFor('the second answer',x=>idleFooter(x),{timeout:30_000});
  await t.submit('/rename');
  await t.waitFor('the rename form',x=>x.text.includes('── Rename shown in /resume, the terminal title and exports'),{timeout:10_000});
  t.send('Demo work');t.press('enter');
  await t.waitFor('renamed',x=>x.text.includes('Renamed to "Demo work"')&&!x.text.includes('── Rename'),{timeout:5_000});
  }finally{await t.close();}
});
