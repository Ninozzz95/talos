/*
 * review 17 of 0.6.13 (25/10/2026), the kernel suite's batch launcher (scripts/kernel-tests.mjs, helpers in kernel-tests-batches.mjs):
 * - R17-3: Node's `spawn` emits 'error' only for EACCES, EAGAIN, EMFILE, ENFILE and ENOENT; for the others, ENAMETOOLONG among them
 *   (the very error the batches exist for), it THROWS synchronously. The throw rejected the batch's Promise, nothing caught it, the
 *   next batches never ran and no total was printed. Proved here with an injected `spawn`, not with a real 40,000-character command.
 * - R17-4(a): `output += chunk` decoded each Buffer on its own: an `ℹ` (3 bytes in UTF-8) split across two chunks was lost, and the
 *   batch's summary with it («printed no summary», a lower total).
 */
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import test from 'node:test';
import {formatTotals,parseTotals,runBatch,runBatches,sumTotals} from '../../scripts/kernel-tests-batches.mjs';

const SUMMARY='ℹ tests 5\nℹ suites 0\nℹ pass 4\nℹ fail 1\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 800\n';
const sink=()=>{const written:string[]=[];return{written,write:(chunk:unknown)=>{written.push(String(chunk));return true;}};};
const thrown=(code:string)=>()=>{throw Object.assign(new Error(`spawn ${code}`),{code});};
/* a child whose stdout gives these chunks, then closes with `status` */
function childGiving(chunks:Buffer[],status=0){
  return ()=>{
    const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough()});
    let ended=0;const end=()=>{if(++ended===2)child.emit('close',status);};
    child.stdout.on('end',end);child.stderr.on('end',end);
    setImmediate(()=>{for(const chunk of chunks)child.stdout.write(chunk);child.stdout.end();child.stderr.end();});
    return child;
  };
}
const batchOf=(spawn:unknown)=>runBatch({spawn,execPath:'node',args:['--test','a.test.mjs'],options:{},stdout:sink(),stderr:sink()});

test('review 17 R17-3 of 0.6.13: a spawn that throws (ENAMETOOLONG) is a batch that could not start, not a rejected run',async()=>{
  const result=await batchOf(thrown('ENAMETOOLONG'));
  assert.equal(result.status,null);
  assert.equal(result.error?.code,'ENAMETOOLONG');
});

test('review 17 R17-3 of 0.6.13: the next batches still run, the run fails, and the total is printed with fail last',async()=>{
  const spawns=[thrown('ENAMETOOLONG'),childGiving([Buffer.from(SUMMARY)])];
  const ran:string[][]=[],out:string[]=[],errors:string[]=[];
  const {status,totals}=await runBatches({batches:[['a.test.mjs'],['b.test.mjs']],run:(batch:string[])=>{ran.push(batch);return batchOf(spawns[ran.length-1]);},log:(line:string)=>out.push(line),logError:(line:string)=>errors.push(line)});
  assert.deepEqual(ran,[['a.test.mjs'],['b.test.mjs']]);
  assert.equal(status,1);
  assert.deepEqual(errors,['kernel tests: batch 1 could not start: ENAMETOOLONG']);
  assert.equal(totals.length,1);
  assert.match(formatTotals(sumTotals(totals)),/ℹ tests 5\n[\s\S]*ℹ fail 1\n$/u);
});

test('review 17 R17-3 of 0.6.13, the other way: batches that start and pass make a run that passes, every summary counted',async()=>{
  const {status,totals}=await runBatches({batches:[['a.test.mjs'],['b.test.mjs']],run:()=>batchOf(childGiving([Buffer.from(SUMMARY.replace('ℹ fail 1','ℹ fail 0'))])),log:()=>{},logError:()=>assert.fail('no error expected')});
  assert.equal(status,0);
  assert.equal(sumTotals(totals).tests,10);
});

test('review 17 R17-4(a) of 0.6.13: an ℹ split across two chunks is still one character, and the summary is read',async()=>{
  const bytes=Buffer.from(SUMMARY);
  /* the cut falls inside the second byte of the first `ℹ` (e2 84 b9) */
  const cut=bytes.indexOf(Buffer.from('ℹ'))+2;
  const screen=sink();
  const result=await runBatch({spawn:childGiving([bytes.subarray(0,cut),bytes.subarray(cut)]),execPath:'node',args:[],options:{},stdout:screen,stderr:sink()});
  assert.equal(result.output,SUMMARY);
  assert.deepEqual(parseTotals(result.output),{tests:5,suites:0,pass:4,fail:1,cancelled:0,skipped:0,todo:0});
  /* the screen gets the same characters */
  assert.equal(screen.written.join(''),SUMMARY);
});
