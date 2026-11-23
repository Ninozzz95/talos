/*
 * INC 503 (owner 30/09: «503 dentro G02», the CLI text in health.ts). The unified kernel no longer benches a key for one 5xx
 * (desktop RETRY01–09, runtime-owner-adapter.mjs), but a turn that fails after repeated provider errors on the same key still
 * benches it, with the cause `guasto-fornitore` (and `timeout-fornitore`, `rete`, `flusso-interrotto` for the provider's
 * side). OpenRouter's 503 means «no available model provider meets your routing requirements» — the model or the routing,
 * not the key (openrouter.ai/docs/api-reference/errors). So for a provider-side cause the remedy is to wait or change model;
 * «add another key» stays only where another key can help: a rate limit, a refused key, no credit.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {benchedKeyRefusal,providerCooldownFromRow} from '../../src/provider/health.ts';

const row=(causa:string,until:number|null=null)=>({pool:[{stato:'in-panchina',causa,...(until===null?{}:{inPanchinaFino:until})}]});

test('INC503: a key benched for a provider-side cause is not «add another key»: wait, or change model',()=>{
  for(const causa of ['guasto-fornitore','timeout-fornitore','rete','flusso-interrotto']){
    const bench=providerCooldownFromRow(row(causa));
    const text=benchedKeyRefusal('OpenRouter',bench);
    assert.doesNotMatch(text,/another key/u,`${causa}: ${text}`);
    assert.match(text,/choose another model with \/model/u,`${causa}: ${text}`);
  }
  const timed=benchedKeyRefusal('OpenRouter',providerCooldownFromRow(row('guasto-fornitore',Date.now()+60_000)));
  assert.match(timed,/Wait until then, or choose another model with \/model/u);
});

test('INC503 AL CONTRARIO: where another key helps, it is still said',()=>{
  for(const causa of ['traffico','credenziale','credito']){
    const text=benchedKeyRefusal('OpenRouter',providerCooldownFromRow(row(causa)));
    assert.match(text,/add another key with \/provider/u,`${causa}: ${text}`);
  }
  const unknown=benchedKeyRefusal('OpenRouter',providerCooldownFromRow(row('qualcosa-di-nuovo')));
  assert.match(unknown,/add another key with \/provider/u,'a cause the CLI does not know keeps today\'s words');
});
