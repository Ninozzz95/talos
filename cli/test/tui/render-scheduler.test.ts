import assert from 'node:assert/strict';
import test from 'node:test';
import {COALESCE_WINDOW_MS,MOTION_FRAME_MS,frameIndex} from '../../src/tui/render-scheduler.ts';

test('frame selection is deterministic',()=>{
  assert.equal(frameIndex(0,120,4),0);
  assert.equal(frameIndex(121,120,4),1);
  assert.equal(frameIndex(481,120,4),0);
});


test('M2-B render budgets expose the contract constants',()=>{
  assert.ok(COALESCE_WINDOW_MS>0&&COALESCE_WINDOW_MS<=16);
  assert.equal(MOTION_FRAME_MS,120);
});
