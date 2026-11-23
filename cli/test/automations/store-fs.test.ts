/*
 * 0.6.6 (found by s76 on 15/10/2026) — the automation store's files on Windows (automations/store-fs.ts): a rename, read or append
 * that meets another process's open handle (EPERM, EACCES, EBUSY) is tried again for a while, as graceful-fs does; anything else,
 * and anything off Windows, fails at once. And the wait for a run's end does not take one unreadable read for a deleted entry.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {automationStoreFs,retryWhileBusy} from '../../src/automations/store-fs.ts';
import {kernelStoreOptions} from '../../src/services/automation-facade.ts';
import {RUN_GONE_READS,runEnded} from '../../src/automations/cli-scheduler.ts';

const busy=(code:string)=>Object.assign(new Error(code),{code});
function clock(){let t=0;return{now:()=>t,sleep:async(ms:number)=>{t+=ms;}};}

test('Windows: a busy file is tried again until it is free',async()=>{
  let calls=0;const c=clock();
  const value=await retryWhileBusy(async()=>{calls++;if(calls<4)throw busy(calls%2?'EPERM':'EBUSY');return 'saved';},{platform:'win32',...c});
  assert.equal(value,'saved');assert.equal(calls,4);
});

test('Windows: still busy after the limit, the error passes; another error passes at once; off Windows nothing is retried',async()=>{
  let calls=0;const c=clock();
  await assert.rejects(retryWhileBusy(async()=>{calls++;throw busy('EACCES');},{platform:'win32',limitMs:1_000,...c}),{code:'EACCES'});
  assert.ok(calls>3&&c.now()>=1_000,`${calls} tries over ${c.now()} ms`);
  calls=0;await assert.rejects(retryWhileBusy(async()=>{calls++;throw busy('ENOENT');},{platform:'win32',...clock()}),{code:'ENOENT'});assert.equal(calls,1);
  calls=0;await assert.rejects(retryWhileBusy(async()=>{calls++;throw busy('EPERM');},{platform:'linux',...clock()}),{code:'EPERM'});assert.equal(calls,1);
});

test('the wait for a run\'s end: one unreadable read is not a deleted entry; RUN_GONE_READS in a row are',async()=>{
  const reads=[null,{giroInCorso:{runId:'r'}},null,null,{giroInCorso:null}];let i=0;
  await runEnded({leggi:async()=>reads[i++]??null},'a','r');
  assert.equal(i,5,'it read on past the single null and the two in a row, to the end');
  let n=0;await runEnded({leggi:async()=>{n++;return null;}},'a','r');assert.equal(n,RUN_GONE_READS);
});

test('the kernel store the CLI opens gets these files',()=>{
  const options=kernelStoreOptions('C:/data');
  assert.equal(options.fsAdapter,automationStoreFs);assert.match(options.cartella.replace(/\\/gu,'/'),/^C:\/data\/automations$/u);
});

test('the wait for a run\'s end: a read that throws (the kernel store\'s AUTOMATION_STORE_READ_FAILED) is tried again',async()=>{
  const fail=()=>{throw Object.assign(new Error('read failed'),{code:'AUTOMATION_STORE_READ_FAILED'});};
  const reads:Array<()=>unknown>=[fail,fail,fail,fail,()=>({giroInCorso:{runId:'r'}}),()=>({giroInCorso:null})];let i=0;
  await runEnded({leggi:async()=>reads[i++]!()},'a','r');
  assert.equal(i,6,'four throws in a row did not end the wait; the end did');
});
