/*
 * 0.6.13 (the compaction release): v1 `-p --output-format stream-json` says a compaction that did not happen as v2 does — one
 * `warning` event with the same `{code, reason, message, errorCode?}` (compactionFailureWarning, protocol/v2/events.ts). The v1
 * contract (docs/design/talos-cli-v1.md, «Event bridge») has `warning` with a free `data` record and is append-only: the fields
 * are new, the schema tag and the other events do not change. The v1 run result collects the message in `warnings` as for any
 * other warning (headless/result.ts). A compaction that happened, the start and nothing to compact stay silent here too.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createEventBridge} from '../../src/events/bridge.ts';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {reduceRunResult} from '../../src/headless/result.ts';

const clock=()=>'2026-10-21T00:00:00.000Z';
const row=(value:Record<string,unknown>)=>({type:'CUSTOM',name:'talos.compattazione',_sequenza:9,value});

test('v1: a Context Engine fallback is one warning with the same code, reason and message as v2',()=>{
  const raw=row({fase:'fine',giro:3,compattato:false,motivo:'ripiego',codice:'CTX_HISTORY_DIVERGED'});
  const v1=createEventBridge('s1',clock).translate(raw as any) as any;
  const v2=createV2EventBridge('s1',clock).translate(raw as any) as any;
  assert.equal(v1?.schema,'talos.cli.event.v1');
  assert.equal(v1.type,'warning');
  assert.deepEqual(v1.data,v2.data,'one wording, two protocols');
  assert.equal(v1.data.code,'COMPACTION_FALLBACK');
  assert.equal(v1.data.errorCode,'CTX_HISTORY_DIVERGED');
  assert.equal(typeof v1.seq,'number');
});

test('v1: a summary that did not come is a warning, and the run result keeps it',()=>{
  const bridge=createEventBridge('s1',clock);
  const warning=bridge.translate(row({fase:'fine',giro:2,compattato:false,motivo:'vuoto'}) as any) as any;
  assert.equal(warning?.data.code,'COMPACTION_FAILED');
  assert.equal(warning.data.reason,'empty');
  const result=reduceRunResult([warning]);
  assert.ok(result.warnings.some(w=>/did not compact the conversation/u.test(w)),'the v1 result names it in warnings');
});

test('v1: a compaction that happened, the start and nothing to compact are no event',()=>{
  const bridge=createEventBridge('s1',clock);
  assert.equal(bridge.translate(row({fase:'fine',giro:2,compattato:true,tokenPrima:9000,tokenDopo:2000}) as any),null);
  assert.equal(bridge.translate(row({fase:'inizio',giro:2,tokenPrima:9000,soglia:8000}) as any),null);
  assert.equal(bridge.translate(row({fase:'fine',compattato:false,motivo:'niente-da-compattare'}) as any),null);
});
