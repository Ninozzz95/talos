/*
 * Owner decision 02/10 («Nel registro + avviso discreto», registro 12): while the TUI is up, whatever reaches the console —
 * the kernel's console.error on a failed save, pdf.js's three warnings when it loads without @napi-rs/canvas — goes to the
 * development log, never onto the screen (Ink's patchConsole clears the frame, writes the line and redraws: in fullscreen
 * the lines pile up over the TUI). Real warnings and errors are counted for a small status segment; pdf.js's expected
 * warnings are logged, not counted. As Gemini CLI's ConsolePatcher: the five methods, and everything put back on exit.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {installConsoleCapture} from '../../src/tui/console-capture.ts';

function fakeConsole(){
  const written:string[]=[];
  const target:any={};
  for(const level of ['log','info','warn','error','debug'])target[level]=(...args:unknown[])=>{written.push(`${level}:${args.join(' ')}`);};
  return{target,written};
}

test('captured: every console method goes to the log with its level and text, nothing reaches the terminal',()=>{
  const {target,written}=fakeConsole();const original={...target};
  const records:Array<{level:string;text:string}>=[];
  const capture=installConsoleCapture({target,record:(level,text)=>records.push({level,text})});
  target.log('plain %s',1);target.info('info');target.warn('careful',{a:1});target.error(new Error('broken'));target.debug('noise');
  assert.deepEqual(written,[],'nothing written to the real console while captured');
  assert.deepEqual(records.map(r=>r.level),['log','info','warn','error','debug']);
  assert.equal(records[0]!.text,'plain 1','formatted like console does');
  assert.match(records[2]!.text,/careful \{ a: 1 \}/u);
  assert.match(records[3]!.text,/Error: broken/u,'an error keeps its message (and stack)');
  capture.restore();
  for(const level of ['log','info','warn','error','debug'])assert.equal(target[level],original[level],`${level} put back`);
});

test('counted: warnings and errors, not log, info or debug, and not pdf.js\'s expected warnings',()=>{
  const {target}=fakeConsole();const counts:number[]=[];
  const capture=installConsoleCapture({target,record:()=>{},onCount:count=>counts.push(count)});
  target.warn('Warning: Cannot load "@napi-rs/canvas" package: "Error: Cannot find module \'@napi-rs/canvas\'".');
  target.warn('Warning: Cannot polyfill `DOMMatrix`, rendering may be broken.');
  target.warn('Warning: Cannot polyfill `Path2D`, rendering may be broken.');
  target.log('x');target.info('y');target.debug('z');
  assert.equal(capture.count(),0);assert.deepEqual(counts,[]);
  target.warn('[session-store] proposta piano non salvata');target.error('[session-store] risposta non salvata');
  assert.equal(capture.count(),2);assert.deepEqual(counts,[1,2]);
  capture.restore();
});

test('a record that throws never breaks the caller (a broken log is not a broken kernel)',()=>{
  const {target}=fakeConsole();
  const capture=installConsoleCapture({target,record:()=>{throw new Error('disk full');}});
  assert.doesNotThrow(()=>target.error('still fine'));
  assert.equal(capture.count(),1);
  capture.restore();
});

test('restore twice is harmless, and a method replaced by someone else meanwhile is left alone',()=>{
  const {target}=fakeConsole();const original=target.warn;
  const capture=installConsoleCapture({target,record:()=>{}});
  const someoneElse=()=>{};target.error=someoneElse;
  capture.restore();capture.restore();
  assert.equal(target.warn,original);assert.equal(target.error,someoneElse,'not ours to put back');
});
