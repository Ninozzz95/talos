/* R1 lane X (E10, review D-12): Ctrl+C at idle asks for a second press; during a run it interrupts. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {EXIT_CONFIRM_WINDOW_MS,EXIT_HINT,createInterruptController} from '../../src/tui/interrupt.ts';

test('R1 X first Ctrl+C at idle does not exit; the second within the window does',()=>{
  let now=1000;const i=createInterruptController({now:()=>now});
  assert.equal(i.ctrlC(false),'arm-exit');
  assert.equal(i.exitArmed(),true);
  now+=300;
  assert.equal(i.ctrlC(false),'exit');
  assert.equal(i.exitArmed(),false);
});

test('R1 X an expired first press re-arms instead of exiting',()=>{
  let now=1000;const i=createInterruptController({now:()=>now,exitWindowMs:1000});
  assert.equal(i.ctrlC(false),'arm-exit');
  now+=1001;
  assert.equal(i.exitArmed(),false);
  assert.equal(i.ctrlC(false),'arm-exit');
  now+=999;
  assert.equal(i.ctrlC(false),'exit');
});

test('R1 X the default window covers the s10 cadence (second press 1.5 s later) and the hint names the key',()=>{
  let now=0;const i=createInterruptController({now:()=>now});
  assert.ok(EXIT_CONFIRM_WINDOW_MS>=1800,String(EXIT_CONFIRM_WINDOW_MS));
  assert.equal(i.ctrlC(false),'arm-exit');
  now+=1600;
  assert.equal(i.ctrlC(false),'exit');
  assert.equal(EXIT_HINT,'Press Ctrl+C again to exit');
});

test('R1 X during a run Ctrl+C cancels, a quick second press forces exit, and neither arms the idle exit',()=>{
  let now=1000;const i=createInterruptController({now:()=>now,windowMs:1000});
  assert.equal(i.ctrlC(true),'cancel');
  assert.equal(i.exitArmed(),false);
  now+=500;
  assert.equal(i.ctrlC(true),'force-exit');
  now+=100;
  assert.equal(i.ctrlC(true),'cancel');
  i.reset();/* app.ts resets on run.completed/failed/cancelled */
  now+=100;
  assert.equal(i.ctrlC(false),'arm-exit','the cancel press must not count as the first of the two idle presses');
});

test('R1 X a press during a run disarms a pending idle exit',()=>{
  let now=1000;const i=createInterruptController({now:()=>now});
  assert.equal(i.ctrlC(false),'arm-exit');
  now+=100;
  assert.equal(i.ctrlC(true),'cancel');
  now+=100;
  assert.equal(i.ctrlC(false),'arm-exit');
});
