/*
 * Stage 6c (owner 02/10: «mouse acceso, selezione della CLI»; registro 12). The terminal's SGR reports (xterm ctlseqs: DEC
 * 1006 `CSI < b;x;y M` pressed or moved, `m` released; +32 motion, +4 Shift, +8 Meta, +16 Ctrl, 64/65 the wheel) become
 * pointer events with 0-based cells; DEC 1002 reports the motion while a button is held, which a drag selection needs. The
 * mouse is on by default in the full screen, and `ui.mouse:false` gives the selection back to the terminal (mockup /config:
 * «Off: your terminal selects as before»).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {MOUSE_OFF,MOUSE_ON,createMouseFilter,mouseWanted,type PointerEvent} from '../../src/tui/mouse.ts';

const ESC='\u001b';

test('6c: press, drag and release become pointer events with 0-based cells and the modifiers held',()=>{
  const seen:PointerEvent[]=[];const wheel:number[]=[];
  const filter=createMouseFilter(delta=>wheel.push(delta),event=>seen.push(event));
  assert.equal(filter.take(`a${ESC}[<0;10;5M${ESC}[<32;12;5M${ESC}[<0;14;6mb`),'ab','reports never reach the composer');
  assert.deepEqual(seen,[
    {kind:'press',button:0,col:9,row:4,shift:false,alt:false,ctrl:false},
    {kind:'drag',button:0,col:11,row:4,shift:false,alt:false,ctrl:false},
    {kind:'release',button:0,col:13,row:5,shift:false,alt:false,ctrl:false},
  ]);
  filter.take(`${ESC}[<20;1;1M${ESC}[<2;3;3M`);
  assert.deepEqual(seen.slice(-2).map(e=>[e.kind,e.button,e.shift,e.ctrl]),[['press',0,true,true],['press',2,false,false]]);
  filter.take(`${ESC}[<64;1;1M`);
  assert.deepEqual(wheel,[-1],'the wheel stays the wheel');
  assert.equal(seen.length,5,'a wheel step is not a pointer event');
});

test('6c: drag tracking (DEC 1002) is asked for and given back; the mouse is on by default, off only when asked',()=>{
  assert.equal(MOUSE_ON,`${ESC}[?1000h${ESC}[?1002h${ESC}[?1006h`);
  assert.equal(MOUSE_OFF,`${ESC}[?1006l${ESC}[?1002l${ESC}[?1000l`);
  assert.equal(mouseWanted({alternateScreen:true,interactive:true,setting:undefined}),true,'owner 02/10: on by default');
  assert.equal(mouseWanted({alternateScreen:true,interactive:true,setting:false}),false,'ui.mouse:false: the terminal selects as before');
  assert.equal(mouseWanted({alternateScreen:false,interactive:true,setting:true}),false,'never outside the full screen');
  assert.equal(mouseWanted({alternateScreen:true,interactive:false,setting:true}),false);
});
