/*
 * UI plan, Phase 3 (owner 27/09: mouse on by default, can be switched off; one hour, reduced scope): the wheel scrolls the
 * conversation. The terminal's mouse reports (SGR 1006: ESC[<b;x;yM) are taken out of the input BEFORE Ink parses it, so a
 * report never reaches the composer as text; Shift keeps the terminal's own selection (the terminal does that).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {EventEmitter} from 'node:events';
import {MOUSE_OFF,MOUSE_ON,createMouseFilter,installMouseFilter,mouseWanted} from '../../src/tui/mouse.ts';
import {installFocusFilter} from '../../src/tui/focus.ts';
import {PARTIAL_SEQUENCE_HOLD_MS} from '../../src/tui/input-timing.ts';

const ESC='\u001b';

test('P3 mouse: wheel reports become scroll events and leave the input; keys around them stay', () => {
  const wheel:number[]=[];const filter=createMouseFilter(delta=>wheel.push(delta));
  assert.equal(filter.take(`a${ESC}[<64;10;5Mb${ESC}[<65;10;5M`),'ab');
  assert.deepEqual(wheel,[-1,1],'up = -1 (towards older rows), down = +1');
  assert.equal(filter.take(`${ESC}[<0;3;4M${ESC}[<0;3;4m`),'','a click and its release are dropped (clicks are out of this phase), never typed');
  assert.equal(filter.take(`${ESC}[<68;1;1M`),'','the wheel with Shift held is still the wheel');
  assert.deepEqual(wheel,[-1,1,-1]);
  assert.equal(filter.take(`${ESC}[A`),`${ESC}[A`,'an arrow key is untouched');
});

test('P3 mouse: a report split across two reads is still taken out whole', () => {
  const wheel:number[]=[];const filter=createMouseFilter(delta=>wheel.push(delta));
  assert.equal(filter.take(`x${ESC}[<6`),'x');
  assert.equal(filter.take(`4;2;2My`),'y');
  assert.deepEqual(wheel,[-1]);
  /* REV-ESC-PTY: a lone Esc is never held — it passes through at once and the filter arms for
     60 ms, so a report split right after its first byte is still reassembled on the next chunk. */
  assert.equal(filter.take(`${ESC}`),ESC,'a lone Esc goes straight through');
  assert.equal(filter.flush(),'','nothing is held for a bare Esc');
  assert.equal(filter.take(`${ESC}[<65;2;2M`),'','the armed window reassembles a report split after byte 1');
  assert.deepEqual(wheel,[-1,1],'the reassembled report still steers');
});

test('P3 mouse: the filter sits on stdin.read, keeps the chunk type, and comes off cleanly', () => {
  const stdin=new EventEmitter() as any;const queue=[Buffer.from(`h${ESC}[<65;1;1Mi`),null];stdin.read=()=>queue.shift()??null;
  const wheel:number[]=[];const off=installMouseFilter(stdin,delta=>wheel.push(delta));
  const chunk=stdin.read();
  assert.ok(Buffer.isBuffer(chunk));assert.equal(chunk.toString(),'hi');assert.deepEqual(wheel,[1]);
  off();queue.unshift(Buffer.from('z'));assert.equal(stdin.read().toString(),'z');
});

/* REV-NATIVE-SELECTION (28/09) kept the terminal's selection by default; the owner reversed it on 02/10 (stage 6c, «mouse
   acceso, selezione della CLI»): the mouse is on by default and `ui.mouse:false` gives the selection back (ui-6c-pointer). */
test('stage 6c: the mouse is on by default in the full screen; ui.mouse:false gives the selection back to the terminal', () => {
  assert.equal(mouseWanted({alternateScreen:true,interactive:true,setting:undefined}),true);
  assert.equal(mouseWanted({alternateScreen:true,interactive:true,setting:true}),true);
  assert.equal(mouseWanted({alternateScreen:true,interactive:true,setting:false}),false);
  assert.equal(mouseWanted({alternateScreen:false,interactive:true,setting:true}),false);
  assert.equal(mouseWanted({alternateScreen:true,interactive:false,setting:true}),false);
  assert.equal(MOUSE_ON,`${ESC}[?1000h${ESC}[?1002h${ESC}[?1006h`);assert.equal(MOUSE_OFF,`${ESC}[?1006l${ESC}[?1002l${ESC}[?1000l`);
});

/* Startup stage 1 (02/10, REV-INPUT-E2E 100 in the full run): with the screen up while the kernel loads, a wheel report
   split across two reads met a busy event loop. Node runs late timers BEFORE it polls for input, so the 30 ms timer gave
   the held `ESC` back while the rest was already waiting: `[<64;20;5M` reached the composer as text. The timer now lets
   one input poll happen first (setImmediate runs after the poll phase). */
test('P3 mouse: a lone Esc goes straight through; a report split after byte 1 is still taken out within the arm window',async()=>{
  const queue:string[]=['\u001b'];const reads:string[]=[];const wheel:number[]=[];
  const stdin:any=Object.assign(new EventEmitter(),{read(){return queue.shift()??null;}});
  installMouseFilter(stdin,delta=>wheel.push(delta));
  const pull=()=>{for(let chunk=stdin.read();chunk!==null&&chunk!==undefined;chunk=stdin.read())if(chunk!=='')reads.push(String(chunk));};
  stdin.on('readable',pull);pull();
  /* REV-ESC-PTY: the Esc key is delivered at once — held, it died in the give-back dance. */
  assert.deepEqual(reads,['\u001b']);
  /* The rest of a report split right after its first byte arrives within the 60 ms arm window:
     reassembled and taken out whole, exactly as the old hold did. */
  queue.push('[<64;20;5M');pull();
  assert.deepEqual(reads,['\u001b'],'nothing of the report reached the input');
  assert.deepEqual(wheel,[-1],'the report became one wheel step');
});

/* 08/10/2026 (s34 flaked in 2 of the last 6 full gates, 1 of 10 under CPU saturation, 0 of 20 on a quiet machine): the rest of a split report can come later than the old 30 ms hold.
   An incomplete sequence is held PARTIAL_SEQUENCE_HOLD_MS (input-timing.ts: Pi holds 50 ms, Node's readline 500 ms); a lone Esc is still never held. Deterministic: mocked timers. */
test('P3 mouse: the rest of a report that comes late (past the old 30 ms) is still reassembled; a piece that never comes is given back only after the hold',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  assert.ok(PARTIAL_SEQUENCE_HOLD_MS>=50&&PARTIAL_SEQUENCE_HOLD_MS<=150,'the hold stays inside the range the research supports (Pi 50 ms … a fifth of Node\'s 500 ms)');
  const queue:string[]=[];const reads:string[]=[];const wheel:number[]=[];
  const stdin:any=Object.assign(new EventEmitter(),{read(){return queue.shift()??null;}});
  installMouseFilter(stdin,delta=>wheel.push(delta));
  const pull=()=>{for(let chunk=stdin.read();chunk!==null&&chunk!==undefined;chunk=stdin.read())if(chunk!=='')reads.push(String(chunk));};
  stdin.on('readable',pull);
  queue.push(`${ESC}[`);pull();
  t.mock.timers.tick(60);                                   // twice the old hold
  await new Promise<void>(resolve=>setImmediate(resolve));  // let a give-back that already fired run: with the old 30 ms it would have flushed the piece by now
  assert.deepEqual(reads,[],'still held at 60 ms');
  queue.push('<64;20;5M');pull();
  assert.deepEqual(wheel,[-1],'the late rest completed the report: one wheel step');
  assert.deepEqual(reads,[],'nothing of the report reached the input');
  /* AL CONTRARIO — a piece that never comes is not held for ever. */
  queue.push(`${ESC}[<6`);pull();
  t.mock.timers.tick(PARTIAL_SEQUENCE_HOLD_MS-1);
  assert.deepEqual(reads,[],'held until the hold is over');
  t.mock.timers.tick(1);
  await new Promise<void>(resolve=>setImmediate(resolve)); // the give-back lets one input poll happen first (setImmediate), and the flush follows
  assert.deepEqual(reads,[`${ESC}[<6`],'given back as it came once the hold is over');
});

test('P3 focus: a focus report whose last byte comes late is still taken out; a lone Esc is still never held',t=>{
  t.mock.timers.enable({apis:['setTimeout','Date']});
  const queue:string[]=[];const reads:string[]=[];const focus:boolean[]=[];
  const stdin:any=Object.assign(new EventEmitter(),{read(){return queue.shift()??null;}});
  installFocusFilter(stdin,focused=>focus.push(focused));
  const pull=()=>{for(let chunk=stdin.read();chunk!==null&&chunk!==undefined;chunk=stdin.read())if(chunk!=='')reads.push(String(chunk));};
  stdin.on('readable',pull);
  queue.push(`${ESC}[`);pull();t.mock.timers.tick(60);
  assert.deepEqual(reads,[]);
  queue.push('I');pull();
  assert.deepEqual(focus,[true]);assert.deepEqual(reads,[],'the focus report did not reach the input');
  queue.push(ESC);pull();
  assert.deepEqual(reads,[ESC],'a lone Esc goes straight through, no hold');
});
