/*
 * 14/10/2026, owner: «Tetto di serie, regolabile» — with a huge window (GLM, 1M) the 50 % rule summarised only past ~400k, so
 * requests of ~365k went out, slow and costly. The trigger is now the lower of «half the input limit» and a cap of 200,000
 * tokens (`context.compactAtTokens`, null = no cap). Codex: `auto_compact_token_limit` = min(90 % of the window, the configured
 * limit) (codex-rs/protocol/src/openai_models.rs:525); Hermes: per-model thresholds over the input budget
 * (agent/context_compressor.py:2864). The engine's own rule (target below trigger) is kept.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {compactionRatios,DEFAULT_COMPACT_AT_TOKENS,inputLimitOf} from '../../src/runtime/compaction-cap.ts';

test('a huge window: the trigger falls to the cap; a normal one keeps the 50 % rule',()=>{
  assert.equal(DEFAULT_COMPACT_AT_TOKENS,200_000);
  const huge=inputLimitOf({windowTokens:1_000_000,responseReserve:16_384,method:'heuristic'});
  assert.equal(huge,833_616);
  const capped=compactionRatios({inputLimit:huge,compactAtTokens:200_000,currentTarget:null});
  assert.ok(Math.floor(huge*capped.triggerRatio)<=200_000&&Math.floor(huge*capped.triggerRatio)>199_000,String(capped.triggerRatio));
  assert.ok(capped.targetRatio<capped.triggerRatio);
  const normal=compactionRatios({inputLimit:inputLimitOf({windowTokens:65_536,responseReserve:16_384,method:'heuristic'}),compactAtTokens:200_000,currentTarget:null});
  assert.deepEqual(normal,{triggerRatio:0.5,targetRatio:0.49},'below the cap: exactly the rule of before');
  assert.deepEqual(compactionRatios({inputLimit:huge,compactAtTokens:null,currentTarget:null}),{triggerRatio:0.5,targetRatio:0.49},'null: no cap');
  assert.deepEqual(compactionRatios({inputLimit:100_000,compactAtTokens:200_000,currentTarget:0.2351}),{triggerRatio:0.5,targetRatio:0.49},'review of 0.6.4 (S4): a target left by the cap does not outlive it');
  assert.ok(compactionRatios({inputLimit:huge,compactAtTokens:200_000,currentTarget:0.49}).targetRatio<compactionRatios({inputLimit:huge,compactAtTokens:200_000,currentTarget:0.49}).triggerRatio,'a target left from the 50 % rule is lowered under the capped trigger');
});

test('the margin is the engine\'s: 15 % for an estimate, 5 % for a count; a given margin wins',()=>{
  assert.equal(inputLimitOf({windowTokens:200_000,responseReserve:10_000,method:'provider'}),180_000);
  assert.equal(inputLimitOf({windowTokens:200_000,responseReserve:10_000,method:'heuristic',marginTokens:1_000}),189_000);
  assert.equal(inputLimitOf({windowTokens:0,responseReserve:0,method:'heuristic'}),null);
});

test('config: context.compactAtTokens takes a whole number of tokens or null, nothing else',async()=>{
  const {validateConfig}=await import('../../src/config/load.ts') as any;
  assert.equal(typeof validateConfig,'function');
  /* C6, C6-bis: who writes the summaries and the backup, one name each, never a control character */
  for(const ok of [{context:{summaryModel:'openrouter:vendor/m',summaryBackup:'conversation'}},{context:{summaryModel:null,summaryBackup:null}}])assert.doesNotThrow(()=>validateConfig(ok),JSON.stringify(ok));
  for(const bad of [{context:{summaryModel:5}},{context:{summaryBackup:'two words'}},{context:{summaryModel:''}},{context:{summaryBackup:'a\u001bb'}}])assert.throws(()=>validateConfig(bad),/CONFIG_INVALID_CONTEXT/u,JSON.stringify(bad));
  for(const ok of [{context:{compactAtTokens:300_000}},{context:{compactAtTokens:null}},{context:{}}])assert.doesNotThrow(()=>validateConfig(ok),JSON.stringify(ok));
  for(const bad of [{context:{compactAtTokens:'200k'}},{context:{compactAtTokens:100}},{context:{compactAtTokens:20_000_000}},{context:{compactAtTokens:1.5e5+0.5}},{context:{other:1}},{context:5}])assert.throws(()=>validateConfig(bad),/CONFIG_INVALID_CONTEXT/u,JSON.stringify(bad));
});
