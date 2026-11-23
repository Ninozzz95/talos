/*
 * Stress test 0.5.4, F-L-002 (S3): `-p --output-format stream-json` against a provider that answers 401 printed
 * `"classe":"credenziale"` in run.failed, and the same value in the JSON result's error details. The KEY stays (F-L-001, the
 * Italian key names, was deferred by the owner); the VALUE is the kernel's class, which has English words already
 * (i18n/kernel-map.ts KERNEL_CLASSES, the same table the screen and protocol v2 use).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createEventBridge} from '../../src/events/bridge.ts';

const failed=(classe:string)=>createEventBridge('s1',()=>'2026-10-11T00:00:00.000Z').translate({type:'RunError',_sequenza:8,code:'PROVIDER_REQUEST_ERROR',message:'The key was refused by the provider.',classe});

test('the class of a failed run is English in the v1 event',()=>{
  assert.equal(failed('credenziale')?.data.classe,'credential');
  assert.equal(failed('traffico')?.data.classe,'rate-limited');
  assert.equal(failed('timeout-fornitore')?.data.classe,'timeout');
});

test('F-L-003: the secret class of an approval is English in the v1 event (the key stays)',()=>{
  const approval=(classe:string)=>createEventBridge('s1',()=>'2026-10-12T00:00:00.000Z').translate({type:'ApprovalRequested',_sequenza:2,requestId:'r1',azione:{tipo:'shell',comando:'type .env',segreto:{classe,percorso:'.env',frase:'…'}}}) as any;
  assert.equal(approval('segreto').data.azione.segreto.classe,'secret');
  assert.equal(approval('fuori-workspace').data.azione.segreto.classe,'outside');
  assert.equal(approval('portachiavi').data.azione.segreto.classe,'keychain');
  assert.equal(approval('segreto').data.azione.segreto.percorso,'.env');
});

test('an English or unknown class is left as it is, and nothing else changes',()=>{
  assert.equal(failed('credential')?.data.classe,'credential');
  const event=failed('credenziale');
  assert.equal(event?.data.code,'PROVIDER_REQUEST_ERROR');
  assert.equal(event?.data.message,'The key was refused by the provider.');
});
