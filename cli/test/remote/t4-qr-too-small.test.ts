/*
 * 0.6.15 T4 (measured 26/10/2026; owner «Dillo e offri il link»): the pairing QR is 22–30 terminal rows tall. In a window too small
 * for it, `talos remote` drew it anyway: its top was cut (unscannable) and every redraw left a stale copy in the scrollback (3 copies
 * after 3 seconds in a 120×30 xterm). Now the «too small» screen says the sizes, how to make room, and the copy key with the time
 * left; the QR appears by itself when the window fits it.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';
import {pairingRows,qrTextRows,rowsText,type PairingState,type QrModules} from '../../src/remote/pairing-view.ts';
import {createInlineScreen} from '../../src/remote/terminal.ts';

const require=createRequire(import.meta.url);
const {Terminal}=require('@xterm/headless') as typeof import('@xterm/headless');
/* a matrix of the real sizes: 57 modules (n0 relay, ECC M, today), 41 (no relay, ECC L, after the kernel change) */
const modules=(lato:number):QrModules=>({lato,righe:Array.from({length:lato},(_,r)=>Array.from({length:lato},(_,c)=>(r*7+c*3)%5<2?'1':'0').join(''))});
const qr=(lato:number,secondsLeft=299):PairingState=>({screen:'qr',qr:modules(lato),secondsLeft});

test('a 57-module QR in a 120×30 window: the «too small» screen with the sizes, the copy key and the time left, never a cut QR',()=>{
  const rows=rowsText(pairingRows(qr(57),{width:120,rows:30}));
  assert.equal(rows.some(line=>/[▀▄█]/u.test(line)),false,'no QR drawn');
  assert.match(rows.join('\n'),/This window is too small for the QR: it needs \d+×34, it is 120×30\./u);
  assert.match(rows.join('\n'),/Make the window bigger, or shrink the text with Ctrl\+−: the QR appears by itself\./u);
  assert.match(rows.join('\n'),/c copy link {3}Esc cancel/u);
  assert.match(rows.join('\n'),/expires 4:59 {2}· {2}works once/u);
  assert.ok(rows.length<=12,'the screen itself fits a small window');
});

test('the same QR fits a 120×40 window and is drawn whole; a 41-module QR (after the kernel change) fits 120×30',()=>{
  const tall=rowsText(pairingRows(qr(57),{width:120,rows:40}));
  /* the QR rows that hold dark modules (its last row can be the light border alone) */
  assert.equal(tall.filter(line=>/[▀▄█]/u.test(line)).length,qrTextRows(modules(57)).filter(line=>/[▀▄█]/u.test(line)).length,'every QR row drawn');
  const small=rowsText(pairingRows(qr(41),{width:120,rows:30}));
  assert.ok(small.some(line=>/[▀▄█]/u.test(line)),'41 modules: 22 rows, drawn at 120×30');
  /* without a height (the tests of the mockup's frames) nothing changes */
  assert.ok(rowsText(pairingRows(qr(57),{width:120})).some(line=>/[▀▄█]/u.test(line)));
});

test('a window narrower than the QR: the «too small» screen too (the QR would wrap)',()=>{
  const rows=rowsText(pairingRows(qr(57),{width:58,rows:80}));
  assert.equal(rows.some(line=>/[▀▄█]/u.test(line)),false);
  /* the size easiest to reach: the QR beside its words (99 columns, 34 rows) rather than the words below it (61 × 49) */
  assert.match(rows.map(row=>row.trim()).join(' '),/needs 99×34, it is 58×80/u,'the sentence wraps between words at 58 columns');
  assert.ok(rows.every(row=>row.length<=58),'no row wider than the window');
});

test('in a real 120×30 terminal the redraws leave no stale copy, and the screen is whole; widened to 40 rows the QR appears',async()=>{
  const term=new Terminal({cols:120,rows:30,allowProposedApi:true,scrollback:1000,convertEol:true});
  let pending=Promise.resolve();
  const screen=createInlineScreen(text=>{pending=pending.then(()=>new Promise<void>(resolve=>term.write(text,resolve)));});
  term.write('PS C:\\site> talos remote\r\n');
  /* the command's own frame (remote-cli.ts `pairingFrame`), colours off */
  const {pairingFrame}=await import('../../src/commands/remote-cli.ts');
  const frame=(state:PairingState)=>pairingFrame(state,{},{columns:120,rows:height});
  let height=30;
  for(let tick=0;tick<3;tick++)screen.draw(frame(qr(57,299-tick)));
  await pending;
  const buffer=()=>{const b=term.buffer.active;const all:string[]=[];for(let y=0;y<b.length;y++)all.push(b.getLine(y)?.translateToString(true)??'');return all;};
  assert.equal(buffer().filter(line=>/TALOS remote control/u.test(line)).length,1,'one screen, no stale copies');
  assert.match(buffer().join('\n'),/expires 4:57/u,'the time left keeps counting');
  /* the person makes the window taller: the next redraw draws the QR whole, its top on screen */
  term.resize(120,40);height=40;
  screen.draw(frame(qr(57,296)));
  await pending;
  const b=term.buffer.active;const visible:string[]=[];for(let y=0;y<term.rows;y++)visible.push(b.getLine(b.viewportY+y)?.translateToString(true)??'');
  const firstQr=visible.findIndex(line=>/[▀▄█]/u.test(line));
  assert.ok(firstQr>=0,'the QR is on screen');
  assert.equal(visible.filter(line=>/[▀▄█]/u.test(line)).length,qrTextRows(modules(57)).filter(line=>/[▀▄█]/u.test(line)).length,'whole');
});
