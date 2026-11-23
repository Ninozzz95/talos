/*
 * Review of 0.6.4, fourth round (bugfixer, 14/10/2026) — written RED against 7e0d647ef, NOT RUN (a gate was running). NIT.
 * replay-buffer.ts `write()` now rewrites a record through `<record>.json.<uuid>.tmp` + rename. A TALOS killed between the
 * temporary's write and the rename (the very window s49 kills in) leaves that temporary behind. `names()` keeps only `*.json`,
 * so `releaseOwned`, `leftovers` and `prune` never see it: nothing ever removes it, in this process or in the next.
 * Here the kill is stood in for by the temporary a killed process leaves (same name shape as `write()` makes).
 */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createStartOperationJournal} from '../../src/runtime/replay-buffer.ts';

const DEAD_PID=2_147_483_000;

test('review of 0.6.4, 064d-3: the temporary a killed rewrite leaves is removed, by this process at close or by the next one',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-journal-tmp-'));
  try{
    /* a dead TALOS was killed between the temporary's write and its rename */
    const deadRecord=join(root,`dead-op.${DEAD_PID}.json`);
    await writeFile(deadRecord,`${JSON.stringify({schema:'talos.cli.runtime-start-operation.v1',operationId:'dead-op',fingerprint:'f'.repeat(64),pid:DEAD_PID,createdAt:new Date().toISOString()})}\n`);
    await writeFile(`${deadRecord}.${randomUUID()}.tmp`,'{"partial":');
    /* and so was this one, once */
    const journal=createStartOperationJournal({rootDir:root,isProcessAlive:pid=>pid===process.pid});
    const {operationId}=await journal.claim('e'.repeat(64));
    const own=join(root,`${encodeURIComponent(operationId)}.${process.pid}.json`);
    await writeFile(`${own}.${randomUUID()}.tmp`,'{"partial":');
    const left=await journal.leftovers();
    assert.equal(left.length,1,'the dead start is read');
    await journal.prune(left);
    await journal.releaseOwned();
    const remaining=(await readdir(root)).filter(name=>name.endsWith('.tmp'));
    assert.deepEqual(remaining,[],`temporaries never removed: ${remaining.join(', ')}`);
  }finally{await rm(root,{recursive:true,force:true,maxRetries:5});}
});
