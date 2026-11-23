/*
 * P19 (owner 27/09, session cad61a7e on 0.3.0): a turn that failed after the archive had taken a whole tool exchange sent
 * the session back to its pre-turn history, and every later turn stopped with CTX_HISTORY_DIVERGED. The CLI's hooks say
 * what the archive holds (`archivedMessages`), so the session registry can resume from there
 * (harness-ui/src/session-registry.mjs `messaggiDopoUnGiroFallito`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {withArchivableCapture} from '../../src/runtime/context-archive.ts';

const user={role:'user',content:'read the screenshots'};
const call={role:'assistant',content:null,tool_calls:[{id:'c1',type:'function',function:{name:'leggi',arguments:'{}'}}]};
const result={role:'tool',tool_call_id:'c1',content:'a binary file'};

test('P19: archivedMessages is what the service last accepted, from capture or from prepare', async () => {
  let refuse=false;
  const hooks=withArchivableCapture({capture:async()=>{if(refuse)throw Object.assign(new Error('x'),{code:'CTX_X'});},prepare:async()=>({messages:[]})}) as any;
  assert.equal(hooks.archivedMessages(),null,'nothing archived yet');
  await hooks.capture({messages:[user,call],reason:'response'});
  assert.deepEqual(hooks.archivedMessages(),[user],'an unanswered call is not archived, so it is not reported either');
  await hooks.prepare({messages:[user,call,result]});
  assert.deepEqual(hooks.archivedMessages(),[user,call,result],'prepare archives the history it is given');
  refuse=true;
  await assert.rejects(hooks.capture({messages:[user,call,result,{role:'assistant',content:'done'}],reason:'finished'}),{code:'CTX_X'});
  assert.deepEqual(hooks.archivedMessages(),[user,call,result],'a refused capture archived nothing new');
});

test('P19: prepare with `originali` archives the originals, not the projection', async () => {
  const hooks=withArchivableCapture({capture:async()=>{},prepare:async()=>({messages:[]})}) as any;
  const projected={...result,content:'shortened'};
  await hooks.prepare({messages:[user,call,projected],originali:[user,call,result]});
  assert.deepEqual(hooks.archivedMessages(),[user,call,result]);
});

test('P19: the session cad61a7e case — prepare archives, then its compaction fails: the history counts as archived', async () => {
  let mode='';
  const hooks=withArchivableCapture({capture:async()=>{},prepare:async()=>{throw Object.assign(new Error('failed'),{code:mode});}},{stalePatienceMs:0}) as any;
  mode='CTX_INVALID_SUMMARY';
  await assert.rejects(hooks.prepare({messages:[user,call,result]}),{code:'CTX_INVALID_SUMMARY'});
  assert.deepEqual(hooks.archivedMessages(),[user,call,result],'the summary failed after the history was archived');
  const other=withArchivableCapture({capture:async()=>{},prepare:async()=>{throw Object.assign(new Error('diverged'),{code:'CTX_HISTORY_DIVERGED'});}},{stalePatienceMs:0}) as any;
  await assert.rejects(other.prepare({messages:[user,call,result]}),{code:'CTX_HISTORY_DIVERGED'});
  assert.equal(other.archivedMessages(),null,'an archiving error archived nothing');
});
