import assert from 'node:assert/strict';
import test from 'node:test';
import { cacheSessioneDaEventi, tokenIngressoDaUsage } from '../src/usage-cache.mjs';

const evento = (usage, provider = 'openrouter', _sequenza) => ({ type: 'CUSTOM', name: 'consumo-fornitore', value: { tipo: 'consumo-fornitore', provider, model: 'prova', usage, esito: 'completato' }, ...(_sequenza === undefined ? {} : { _sequenza }) });
const uso = (prompt_tokens, cached_tokens) => ({ prompt_tokens, prompt_tokens_details: { cached_tokens } });

test('BC48-CACHE: due giri misurati e uno senza usage, rapporto pesato su 2 giri', () => {
  const misura = cacheSessioneDaEventi([evento(uso(1000, 900)), evento(uso(2000, 990)), evento(null)]);
  assert.deepEqual(misura, { percentuale: 63, tokenIngresso: 3000, tokenDaCache: 1890, giriMisurati: 2, giriNonMisurati: 1, fonte: 'consumo-fornitore' });
});

test('BC48-CACHE-ASSENTE: nessun evento, fornitore senza cache, campo assente e zero dichiarato', () => {
  for (const eventi of [null, [], [evento(null)], [evento({ prompt_tokens: 300 })], [evento(uso(300, 100), 'locale')]]) {
    const misura = cacheSessioneDaEventi(eventi);
    assert.equal(misura.percentuale, null);
    assert.equal(misura.tokenDaCache, null);
    assert.equal(misura.giriMisurati, 0);
  }
  assert.equal(cacheSessioneDaEventi([evento(uso(300, 0))]).percentuale, 0);
});

test('BC48-CACHE-FONTI: P-H soltanto, mai aggiungere il cumulativo /usage o la compattazione', () => {
  const a = evento(uso(1000, 900));
  const cumulativo = { type: 'StateDelta', delta: [{ path: '/usage', value: { prompt_tokens: 999999, cached_tokens: 500000 } }] };
  assert.deepEqual(cacheSessioneDaEventi([a, cumulativo, { type: 'CUSTOM', name: 'context-usage', value: uso(500, 0) }]), cacheSessioneDaEventi([a]));
  assert.equal(cacheSessioneDaEventi([cumulativo]).percentuale, null);
});

test('BC48-CACHE-REPLAY: rilegge il log durabile senza contare due volte la stessa sequenza', () => {
  const a = evento(uso(1000, 900), 'openrouter', 10); const b = evento(uso(2000, 990), 'openrouter', 11);
  const prima = JSON.stringify([a, b]);
  assert.deepEqual(cacheSessioneDaEventi([b, a, a]), cacheSessioneDaEventi(JSON.parse(prima)));
  assert.equal(JSON.stringify([a, b]), prima);
  assert.equal(cacheSessioneDaEventi([a, { ...a, _sequenza: 12 }]).giriMisurati, 2, 'Due chiamate uguali con sequenze diverse restano due');
});

test('BC48-CACHE-WIRE: i cinque fornitori, Responses e il totale nativo Anthropic', () => {
  for (const provider of ['openrouter', 'openai', 'zai']) assert.equal(cacheSessioneDaEventi([evento(uso(1000, 600), provider)]).percentuale, 60);
  assert.equal(cacheSessioneDaEventi([evento({ prompt_tokens: 1000, prompt_cache_hit_tokens: 600 }, 'deepseek')]).percentuale, 60);
  assert.equal(cacheSessioneDaEventi([evento({ prompt_tokens: 1000, prompt_cache_hit_tokens: 600, prompt_tokens_details: { cached_tokens: 42 } }, 'deepseek')]).percentuale, 4.2, 'Il registro DeepSeek dichiara prima il canonico: si legge il primo, mai la somma');
  const nativo = { input_tokens: 100, cache_read_input_tokens: 600, cache_creation_input_tokens: 300 };
  assert.equal(tokenIngressoDaUsage(nativo, 'anthropic'), 1000);
  assert.equal(cacheSessioneDaEventi([evento(nativo, 'anthropic')]).percentuale, 60);
  assert.equal(tokenIngressoDaUsage({ ...nativo, prompt_tokens: 1000 }, 'anthropic'), 1000, 'Il totale pubblico già completo non si somma di nuovo');
  assert.equal(tokenIngressoDaUsage({ input_tokens: 1000, input_tokens_details: { cached_tokens: 600 } }, 'openai-responses'), 1000);
});

test('BC48-CACHE-INCOERENTE: niente percentuali inventate con usage malformato o cache oltre il totale', () => {
  const eventi = [null, {}, { type: 'CUSTOM', name: 'consumo-fornitore', value: null }, evento([]), evento(uso(0, 0)), evento(uso(100, 101)), evento(uso(-1, 0)), evento(uso(NaN, 0)), evento(uso(100, null))];
  assert.equal(cacheSessioneDaEventi(eventi).percentuale, null);
  const mista = cacheSessioneDaEventi([...eventi, evento(uso(100, 50))]);
  assert.equal(mista.percentuale, 50);
  assert.equal(mista.giriMisurati, 1);
});
