/* UI phase, cure 2c follow-up (registro 12, 01/10): a resize under the row writer draws ONE frame, through the writer.
   s11 R1-IDLE caught a full repaint (ED 2 + ED 3, ~1.6 KB) ~33 ms after the 60×20 frame was already on screen. Traced
   in the TALOS process: Ink's `resized` renders at once with the tree laid out for the OLD height, a frame taller than the
   new screen, and on win32 any frame as tall as the screen goes through Ink's own `clearTerminal` write, which bypasses
   the writer; the frame React lays out for the new size then follows through the same full clear. Real Ink 7.1.1 here,
   on a fake terminal whose app follows the size the way TALOS does (one row short of the screen on win32). */
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import test from 'node:test';
import React from 'react';
import * as Ink from 'ink';
import {installRowWriter} from '../../src/tui/row-writer.ts';

const ESC='\u001B[';
const settle=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

function fakeTerminal(columns:number,rows:number){
  const stdout=Object.assign(new EventEmitter(),{isTTY:true,columns,rows,writes:[] as string[],write(chunk:unknown){stdout.writes.push(String(chunk));return true;}});
  return stdout;
}

/* `grow` makes the next frame taller than the screen without any resize: such a frame is not stale, it is the app's. */
const control={grow:(_extra:number)=>{}};
function App({stdout}:{stdout:ReturnType<typeof fakeTerminal>}){
  const [size,setSize]=React.useState({columns:stdout.columns,rows:stdout.rows});
  const [extra,setExtra]=React.useState(0);control.grow=setExtra;
  React.useEffect(()=>{const onResize=()=>setSize({columns:stdout.columns,rows:stdout.rows});stdout.on('resize',onResize);return()=>{stdout.off('resize',onResize);};},[stdout]);
  const height=Math.max(1,size.rows-1)+extra;
  return React.createElement(Ink.Box,{flexDirection:'column',width:size.columns,height,borderStyle:'single'},
    React.createElement(Ink.Text,null,extra?`TALL ${height}`:`TALOS ${size.columns}x${size.rows}`));
}

async function mounted(){
  const stdout=fakeTerminal(100,30);const stdin=Object.assign(new PassThrough(),{isTTY:false});
  const app=Ink.render(React.createElement(App,{stdout}),{stdout:stdout as any,stdin:stdin as any,exitOnCtrlC:false,interactive:true,alternateScreen:true,patchConsole:false});
  await settle(80);
  assert.equal(await installRowWriter(stdout),true,'the row writer must find the Ink instance');
  await settle(80);
  return{stdout,app};
}

test('without a size change, a frame taller than the screen is still drawn (only a frame laid out for the old size is dropped)',async()=>{
  const {stdout,app}=await mounted();
  try{
    stdout.writes.length=0;control.grow(5);await settle(150);
    assert.match(stdout.writes.join(''),/TALL 34/u,'a tall frame with no resize was dropped');
    control.grow(0);await settle(150);
    stdout.columns=60;stdout.rows=20;stdout.emit('resize');await settle(200);
    stdout.writes.length=0;control.grow(5);await settle(150);
    assert.match(stdout.writes.join(''),/TALL 24/u,'once the resize is drawn, a tall frame is the app\'s again and is drawn');
  }finally{app.unmount();}
});

test('a resize to a smaller terminal draws one frame, through the row writer, at the new size',async()=>{
  const {stdout,app}=await mounted();
  try{
    stdout.writes.length=0;
    stdout.columns=60;stdout.rows=20;stdout.emit('resize');
    await settle(200);
    const out=stdout.writes.join('');
    assert.equal(out.split(`${ESC}3J`).length-1,0,`Ink cleared the scrollback (its own full clear) after the resize: ${JSON.stringify(out.slice(0,120))}`);
    assert.equal(out.split(`${ESC}2J`).length-1,1,'one full redraw after a size change, no more');
    assert.ok(out.indexOf(`${ESC}2J`)<out.indexOf(`${ESC}2K`),'rows erased before the full redraw (a blank screen between frames)');
    assert.match(out,/TALOS 60x20/u,'the frame laid out for the new size is drawn');
    assert.doesNotMatch(out,/TALOS 100x30/u,'a frame laid out for the old size is never drawn');
    assert.doesNotMatch(out,new RegExp(`${ESC.replace('[','\\[')}(2[1-9]|30);1H`,'u'),'no row is written below the 20-row screen');
  }finally{app.unmount();}
});

test('a resize to a larger terminal draws the new size through the row writer, without Ink\'s full clear',async()=>{
  const {stdout,app}=await mounted();
  try{
    stdout.columns=60;stdout.rows=20;stdout.emit('resize');await settle(200);
    stdout.writes.length=0;
    stdout.columns=100;stdout.rows=30;stdout.emit('resize');
    await settle(200);
    const out=stdout.writes.join('');
    assert.equal(out.split(`${ESC}3J`).length-1,0,'Ink cleared the scrollback (its own full clear) after the resize');
    assert.match(out,/TALOS 100x30/u);
  }finally{app.unmount();}
});

test('Ctrl+L at the same size still erases the drawn rows (clear is not skipped without a size change)',async()=>{
  const {stdout,app}=await mounted();
  try{
    stdout.writes.length=0;
    const ink=(await import(new URL('./instances.js',import.meta.resolve('ink')).href)).default.get(stdout);
    ink.log.clear();
    assert.match(stdout.writes.join(''),new RegExp(`${ESC.replace('[','\\[')}1;1H${ESC.replace('[','\\[')}0m${ESC.replace('[','\\[')}2K`,'u'));
  }finally{app.unmount();}
});
