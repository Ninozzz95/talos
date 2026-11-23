/* UI phase stage 2, cure 2c (registro 12, 01/10): the TALOS row writer takes the place of Ink's log-update on the alternate
   screen. Ink's standard path rewrote every row of every frame (~87 KB per turn at 120×40); its incrementalRendering met the
   byte limit but lost the composer row on a repaint. The writer draws rows at absolute positions, only those that changed
   (Pi tui-alt-screen.ts), with autowrap off so the last column never scrolls the screen, and redraws the whole screen
   whenever the terminal size changed (Pi fullRedraw, Codex buffer reset). Same interface as Ink's log-update. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createRowWriter} from '../../src/tui/row-writer.ts';

const ESC='\u001B';
function stream(columns=40,rows=10){const out:string[]=[];return{out,columns,rows,write(chunk:string){out.push(String(chunk));return true;},take(){const text=out.join('');out.length=0;return text;}};}
const frame=(...rows:string[])=>rows.join('\n')+'\n';
const rowAt=(y:number)=>`${ESC}[${y};1H`;

test('the first frame turns autowrap off, hides the cursor and draws every row at its absolute position',()=>{
  const s=stream();const log=createRowWriter(s);
  log(frame('header','body','footer'));
  const text=s.take();
  assert.ok(text.includes(`${ESC}[?7l`),'autowrap off');
  assert.ok(text.includes(`${ESC}[?25l`),'cursor hidden');
  for(const [index,row] of ['header','body','footer'].entries())assert.ok(text.includes(`${rowAt(index+1)}${ESC}[0m${ESC}[2K${row}`),`row ${index+1}`);
});

test('a later frame writes only the rows that changed',()=>{
  const s=stream();const log=createRowWriter(s);
  log(frame('header','body','footer'));s.take();
  log(frame('header','BODY','footer'));
  const text=s.take();
  assert.ok(text.includes(`${rowAt(2)}${ESC}[0m${ESC}[2KBODY`));
  assert.ok(!text.includes(rowAt(1))&&!text.includes(rowAt(3)),`only row 2: ${JSON.stringify(text)}`);
});

test('an identical frame writes nothing and willRender says so',()=>{
  const s=stream();const log=createRowWriter(s);
  log(frame('a','b'));s.take();
  assert.equal(log.willRender(frame('a','b')),false);
  assert.equal(log(frame('a','b')),false);
  assert.equal(s.take(),'');
  assert.equal(log.willRender(frame('a','c')),true);
});

test('rows the new frame no longer has are cleared',()=>{
  const s=stream();const log=createRowWriter(s);
  log(frame('a','b','c'));s.take();
  log(frame('a'));
  const text=s.take();
  assert.ok(text.includes(`${rowAt(2)}${ESC}[0m${ESC}[2K`)&&text.includes(`${rowAt(3)}${ESC}[0m${ESC}[2K`),JSON.stringify(text));
});

test('after a size change the whole screen is cleared and every row drawn again',()=>{
  const s=stream(40,10);const log=createRowWriter(s);
  log(frame('a','b'));s.take();
  s.columns=30;
  log(frame('a','b'));
  const text=s.take();
  assert.ok(text.includes(`${ESC}[2J`),'screen cleared');
  assert.ok(text.includes(`${rowAt(1)}${ESC}[0m${ESC}[2Ka`)&&text.includes(`${rowAt(2)}${ESC}[0m${ESC}[2Kb`),JSON.stringify(text));
  s.rows=8;log(frame('a','b'));assert.ok(s.take().includes(`${ESC}[2J`),'a height change too');
});

test('rows below the bottom of the screen are never written (a transient frame taller than the screen)',()=>{
  const s=stream(40,3);const log=createRowWriter(s);
  log(frame('1','2','3','4','5'));
  const text=s.take();
  assert.ok(text.includes(rowAt(3))&&!text.includes(rowAt(4))&&!text.includes(rowAt(5)),JSON.stringify(text));
});

test('clear() erases the drawn rows and the next frame is drawn in full (Ctrl+L, Ink writeToStdout)',()=>{
  const s=stream();const log=createRowWriter(s);
  log(frame('a','b'));s.take();
  log.clear();
  const cleared=s.take();
  assert.ok(cleared.includes(`${rowAt(1)}${ESC}[0m${ESC}[2K`)&&cleared.includes(`${rowAt(2)}${ESC}[0m${ESC}[2K`),JSON.stringify(cleared));
  log(frame('a','b'));
  const again=s.take();
  assert.ok(again.includes(`${rowAt(1)}${ESC}[0m${ESC}[2Ka`)&&again.includes(`${rowAt(2)}${ESC}[0m${ESC}[2Kb`),JSON.stringify(again));
});

test('sync() records a frame drawn by someone else without writing; reset() forgets it',()=>{
  const s=stream();const log=createRowWriter(s);
  log.sync(frame('a','b'));
  assert.equal(s.take(),'');
  assert.equal(log(frame('a','b')),false,'the synced frame is what is on screen');
  log.reset();
  assert.equal(log(frame('a','b')),true);
});

/* A Windows console that shrinks keeps the cursor visible by shifting the screen up (the header left the screen after a
   resize, s37). The hidden cursor is parked at the top-left after every write, so a shrink never has to move anything. */
test('every write leaves the (hidden) cursor at the top-left corner',()=>{
  const s=stream();const log=createRowWriter(s);
  log(frame('a','b','c'));assert.ok(s.take().endsWith(`${ESC}[H`));
  log(frame('a','B','c'));assert.ok(s.take().endsWith(`${ESC}[H`));
  log.clear();assert.ok(s.take().endsWith(`${ESC}[H`));
});

test('done() turns autowrap back on and shows the cursor',()=>{
  const s=stream();const log=createRowWriter(s);
  log(frame('a'));s.take();
  log.done();
  const text=s.take();
  assert.ok(text.includes(`${ESC}[?7h`)&&text.includes(`${ESC}[?25h`),JSON.stringify(text));
});
