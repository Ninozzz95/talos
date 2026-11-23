/*
 * Stress test 08/10/2026 (owner's tester): a turn that changed 34 files wrote all 34 paths on its checkpoint row, which the
 * screen then cut («…[truncated in TUI]»). The row names three and counts the rest; /undo and the checkpoint command keep
 * the whole list.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {CHECKPOINT_ROW_FILES,checkpointFilesText} from '../../src/tui/overlays/checkpoint-picker.ts';

const files=(n:number)=>Array.from({length:n},(_,i)=>({path:`runs/f${i}.txt`,change:'added'} as any));

test('checkpoint row: three files named, the rest counted',()=>{
  assert.equal(CHECKPOINT_ROW_FILES,3);
  assert.equal(checkpointFilesText(files(34),{max:CHECKPOINT_ROW_FILES}),'34 files: runs/f0.txt (added), runs/f1.txt (added), runs/f2.txt (added) +31 more');
  assert.equal(checkpointFilesText(files(3),{max:CHECKPOINT_ROW_FILES}),'3 files: runs/f0.txt (added), runs/f1.txt (added), runs/f2.txt (added)');
});

test('checkpoint list: without a limit every file is named, as before',()=>{
  assert.equal(checkpointFilesText(files(5)).split(', ').length,5);
  assert.equal(checkpointFilesText([]),'no files changed');
});
