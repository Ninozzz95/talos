/*
 * 04/11/2026 (Frontend, review M): a full refusal of the model (PROVIDER_EMPTY_RESPONSE, class `rifiuto-del-modello`) is a refusal, not
 * an error. The kernel's scheduler writes the error class as a failed run's reason (automation-scheduler.mjs, `r?.classeErrore`), so a
 * refused automation run reaches `talos automations history` with reason `rifiuto-del-modello`; before this the CLI said «an error».
 * Hermes keeps a refusal apart from text and from errors (agent/codex_responses_adapter.py:1133, the `refusal` part); OpenAI docs,
 * Structured Outputs «Refusals»: a refusal is its own field, to be shown as such.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runReasonWords} from '../../src/automations/run-words.ts';

const SCHEDULER=readFileSync(new URL('../../../harness-ui/src/automation-scheduler.mjs',import.meta.url),'utf8');
const KERNEL=readFileSync(new URL('../../../harness-ui/src/kernel/talosHarness.mjs',import.meta.url),'utf8');

test('the kernel still writes the error class as the run reason, and the refusal class still exists (pinned)',()=>{
  assert.match(SCHEDULER,/motivo = letto\.fallimento \? 'dichiarato' : \(r\?\.classeErrore \?\? r\?\.esito \?\? 'interrotta'\)/);
  assert.ok(KERNEL.includes("code: 'PROVIDER_EMPTY_RESPONSE', classe: 'rifiuto-del-modello'"));
});

test('a refused run says the model refused, never «an error»',()=>{
  assert.equal(runReasonWords('rifiuto-del-modello'),'the model refused the task');
  assert.notEqual(runReasonWords('rifiuto-del-modello'),runReasonWords('ignoto'));
  /* the other way: an unknown reason still falls back, and a real error class keeps its words */
  assert.equal(runReasonWords('qualcosa-di-nuovo'),'an error');
  assert.equal(runReasonWords('credito'),'no credit left with the provider');
});
