/*
 * Shape closed on 31/10/2026 with Performance and Mobile (PROPOSTA-COMPATTA-NIENTE-DA-RIDURRE): a compaction the person asked for
 * that was paid and freed nothing is an outcome, not an error: no failure line, no pause, and the words the other apps use.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {compactResultView,runControllerSlashAction} from '../../src/tui/app.ts';

const paid={compattato:false,error:{code:'CTX_NO_REDUCTION',message:'La sintesi non libera spazio sufficiente.'}};

test('a /compact that freed nothing is no failure, and says so',async()=>{
  assert.deepEqual(compactResultView(paid),{kind:'already',noSpaceFreed:true});
  assert.equal(await runControllerSlashAction('compact',{compact:async()=>paid}),'This compaction freed no space. The conversation stays as it was.');
});

test('nothing to compact keeps its own words, and a real failure is still a failure',async()=>{
  assert.deepEqual(compactResultView({compattato:false,motivo:'niente-da-compattare'}),{kind:'already'});
  assert.equal(await runControllerSlashAction('compact',{compact:async()=>({compattato:false,motivo:'niente-da-compattare'})}),'Context is already compact.');
  assert.equal(compactResultView({compattato:false,error:{code:'CTX_SUMMARY_HTTP'}}).kind,'failed');
});
