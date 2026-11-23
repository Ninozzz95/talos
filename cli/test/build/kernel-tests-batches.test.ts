/*
 * 0.6.13 gate (25/10/2026). `npm run test:kernel` passed 846 files and 27 `--test-skip-pattern` flags to ONE `node --test`:
 * about 35,455 characters, over the 32,767 Windows allows for a command line (CreateProcess; libuv answers UV_ENAMETOOLONG).
 * spawnSync failed with ENAMETOOLONG, the script ignored `result.error`, and the gate saw only «KERNEL exit=1» with nothing after
 * the exclusion list: the kernel suite never ran. The script now runs the files in batches whose command line stays under a
 * limit, the same skip patterns in every batch, and prints one total over all batches as the last `ℹ` lines (the gate greps the
 * last `ℹ fail`). Pure helpers: nothing is spawned here.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {COMMAND_LINE_LIMIT,commandLineLength,batchFiles,parseTotals,sumTotals,formatTotals} from '../../scripts/kernel-tests-batches.mjs';

const EXEC='C:\\Program Files\\nodejs\\node.exe';
const FIXED=['--test','--test-concurrency=4',...Array.from({length:27},(_,i)=>`--test-skip-pattern=SKIP-${i}`)];
const FILES=Array.from({length:846},(_,i)=>`tests\\a-kernel-test-file-with-a-long-italian-name-${String(i).padStart(4,'0')}.test.mjs`);

test('0.6.13 gate: the limit stays well under the 32,767 characters Windows allows',()=>{
  assert.ok(COMMAND_LINE_LIMIT<=24_000,`limit ${COMMAND_LINE_LIMIT}`);
  /* each argument counts its quotes and the space before it: an over-estimate is the safe side */
  assert.equal(commandLineLength('node',['a','bc']),'node'.length+2+(1+3)+(2+3));
});

test('0.6.13 gate: the whole suite on one command line is over the limit (the measured failure), and every batch is under it',()=>{
  assert.ok(commandLineLength(EXEC,[...FIXED,...FILES])>32_767,'the fixture must reproduce the ENAMETOOLONG command line');
  const batches=batchFiles({execPath:EXEC,fixedArgs:FIXED,files:FILES});
  assert.ok(batches.length>1,'one batch is the command line that failed');
  for(const batch of batches){
    assert.ok(batch.length>0);
    assert.ok(commandLineLength(EXEC,[...FIXED,...batch])<=COMMAND_LINE_LIMIT,`a batch of ${batch.length} files is over the limit`);
  }
  /* every file runs once, in order: nothing lost, nothing doubled */
  assert.deepEqual(batches.flat(),FILES);
});

test('0.6.13 gate: a short suite is one batch, and an empty suite is no batch at all',()=>{
  assert.deepEqual(batchFiles({execPath:EXEC,fixedArgs:FIXED,files:FILES.slice(0,3)}),[FILES.slice(0,3)]);
  assert.deepEqual(batchFiles({execPath:EXEC,fixedArgs:FIXED,files:[]}),[]);
});

test('0.6.13 gate: a file that cannot fit even alone is an error, never a silent skip',()=>{
  assert.throws(()=>batchFiles({execPath:EXEC,fixedArgs:FIXED,files:['x'.repeat(30_000)],limit:24_000}),/cannot fit/u);
});

test('0.6.13 gate: the totals add up the last summary of every batch, and are printed in the form the gate greps',()=>{
  const one='ℹ tests 10\nℹ suites 2\nℹ pass 9\nℹ fail 1\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 1200.5\n';
  /* a batch whose output carries an inner child's summary first: the LAST value of each line is the batch's own */
  const two='ℹ tests 1\nℹ pass 1\nℹ fail 0\n... more output ...\nℹ tests 5\nℹ suites 0\nℹ pass 5\nℹ fail 0\nℹ cancelled 0\nℹ skipped 2\nℹ todo 0\nℹ duration_ms 800\n';
  assert.deepEqual(parseTotals(two),{tests:5,suites:0,pass:5,fail:0,cancelled:0,skipped:2,todo:0});
  const total=sumTotals([parseTotals(one),parseTotals(two)]);
  assert.deepEqual(total,{tests:15,suites:2,pass:14,fail:1,cancelled:0,skipped:2,todo:0});
  const printed=formatTotals(total);
  assert.match(printed,/^ℹ tests 15$/mu);
  assert.match(printed,/^ℹ pass 14$/mu);
  /* the gate takes the last `ℹ fail` line of the log: the total's is the last line printed */
  assert.match(printed,/ℹ fail 1\n?$/u);
  /* a batch that printed no summary (it crashed before) leaves no number to add: it is reported, not counted as zero */
  assert.equal(parseTotals('no summary here'),null);
});
