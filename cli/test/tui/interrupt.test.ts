import test from 'node:test';
import assert from 'node:assert/strict';
import {createInterruptController} from '../../src/tui/interrupt.ts';

test('first Ctrl+C cancels an active run and second within one second forces exit',()=>{
  let now=1000;const i=createInterruptController({now:()=>now,windowMs:1000});
  assert.equal(i.ctrlC(true),'cancel');
  now=1500;
  assert.equal(i.ctrlC(true),'force-exit');
});

test('Ctrl+C without active run arms the exit and expired second press cancels again',()=>{
  let now=1000;const i=createInterruptController({now:()=>now,windowMs:1000});
  // R1 E10 / review D-12 (owner, 2026-09-24): the keymap says `Ctrl+C Ctrl+C`, so the first idle press only arms the exit.
  assert.equal(i.ctrlC(false),'arm-exit');
  assert.equal(i.ctrlC(true),'cancel');
  now=2501;
  assert.equal(i.ctrlC(true),'cancel');
});
