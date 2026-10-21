/*
 * L1-b del motore locale (owner 20/10/2026): il riassunto di una conversazione col nostro llama.cpp usciva troncato perché il
 * ragionamento si mangiava tutto `max_tokens` (sessione e00ae242, `completion_tokens: 2000`), e «none» non spegneva niente.
 * Misurato su b10517 + LFM2.5: solo `thinking_budget_tokens: 0` lo spegne. Le prove vanno nei due versi: il campo compare SOLO
 * sulla fonte `local` col ragionamento chiesto spento; mai con un livello, mai su un altro server (vincolo della CLI, 20/10).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creaFetchMultiProvider, chiedeRagionamentoSpento } from '../src/runtime-owner-adapter.mjs';
import { reasoningPerRiassunto } from '../src/kernel/compattazione-desktop.mjs';
import { reasoningDelRiassuntoDiSfondo, modelloDiSessionePerRete } from '../src/session-registry.mjs';

function banco() {
  const corpi = [];
  const risposta = () => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  const rete = async (_url, opzioni) => { corpi.push({ via: 'rete', corpo: JSON.parse(opzioni.body) }); return risposta(); };
  const trasporto = creaFetchMultiProvider(rete, {
    dipendenze: {
      leggiChiave: () => null,
      leggiRuntime: (fonte) => ({ endpoint: fonte === 'ollama' ? 'http://127.0.0.1:11434/v1' : fonte === 'lmstudio' ? 'http://127.0.0.1:1234/v1' : null }),
      localePronto: () => true,
      chiamaLocale: async (_percorso, opzioni) => { corpi.push({ via: 'locale', corpo: JSON.parse(opzioni.body) }); return risposta(); },
      avviaLocale: async () => {},
    },
  });
  const manda = async (corpo) => {
    const prima = corpi.length;
    await trasporto('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'riassumi' }], ...corpo }) });
    assert.equal(corpi.length, prima + 1, 'una richiesta partita');
    return corpi.at(-1);
  };
  return { manda };
}

test('L1B-01 fonte `local` + ragionamento spento (tre forme) ⇒ `thinking_budget_tokens: 0` arriva al motore', async () => {
  const b = banco();
  for (const spento of [{ reasoning_effort: 'none' }, { reasoning: { effort: 'none' } }, { reasoning: { enabled: false } }]) {
    const { via, corpo } = await b.manda({ model: 'local:LFM2.5-24B', ...spento });
    assert.equal(via, 'locale');
    assert.equal(corpo.thinking_budget_tokens, 0, JSON.stringify(spento));
  }
});

test('L1B-02 al contrario: fonte `local` con un LIVELLO (low, medium, max) o senza niente ⇒ il campo NON compare (il giro normale resta intatto)', async () => {
  const b = banco();
  for (const livello of [{ reasoning_effort: 'low' }, { reasoning: { effort: 'medium' } }, { reasoning: { effort: 'max' } }, {}]) {
    const { via, corpo } = await b.manda({ model: 'local:LFM2.5-24B', ...livello });
    assert.equal(via, 'locale');
    assert.equal(Object.hasOwn(corpo, 'thinking_budget_tokens'), false, JSON.stringify(livello));
  }
});

test('L1B-03 al contrario: un ALTRO server compatibile (Ollama, LM Studio) con «none» non riceve il campo, anche con lo stesso modello', async () => {
  const b = banco();
  for (const model of ['ollama:LFM2.5-24B', 'lmstudio:LFM2.5-24B']) {
    const { via, corpo } = await b.manda({ model, reasoning_effort: 'none' });
    assert.equal(via, 'rete');
    assert.equal(Object.hasOwn(corpo, 'thinking_budget_tokens'), false, model);
  }
});

test('L1B-04 un valore già scelto dal chiamante non si sovrascrive', async () => {
  const { corpo } = await banco().manda({ model: 'local:x', reasoning_effort: 'none', thinking_budget_tokens: 64 });
  assert.equal(corpo.thinking_budget_tokens, 64);
});

test('L1B-05 il riassunto sul motore locale chiede il ragionamento SPENTO; altrove resta la regola di prima, e senza modello niente cambia', () => {
  assert.deepEqual(reasoningPerRiassunto({ effort: 'max' }, { modello: 'local:LFM2.5' }), { effort: 'none' });
  assert.deepEqual(reasoningPerRiassunto(null, { modello: 'local:LFM2.5' }), { effort: 'none' });
  assert.deepEqual(reasoningPerRiassunto({ effort: 'max' }, { modello: 'ollama:LFM2.5' }), { effort: 'low' });
  assert.deepEqual(reasoningPerRiassunto({ effort: 'max' }, { modello: 'openrouter:liquid/local:x' }), { effort: 'low' }, 'il prefisso, non una parola nel nome');
  assert.deepEqual(reasoningPerRiassunto({ effort: 'max' }), { effort: 'low' });
  assert.equal(reasoningPerRiassunto(null), undefined);
  assert.equal(chiedeRagionamentoSpento({ reasoning_effort: ' NONE ' }), true);
  assert.equal(chiedeRagionamentoSpento({ reasoning: { effort: 'minimal' } }), false);
});

test('L1B-06 il riassunto in sottofondo: il nostro motore chiede «none» anche con provider «cloud» e id `local:`; Ollama e LM Studio restano senza campo (revisione S5)', () => {
  const sessioneOwner = { provider: 'cloud', modello: 'local:LFM2.5', reasoning: { effort: 'max' } };
  assert.deepEqual(reasoningDelRiassuntoDiSfondo(sessioneOwner, modelloDiSessionePerRete(sessioneOwner)), { effort: 'none' });
  const nostroLocale = { provider: 'local', runtimeId: 'llama.cpp', modelId: 'LFM2.5', reasoning: { effort: 'high' } };
  assert.equal(modelloDiSessionePerRete(nostroLocale), 'local:LFM2.5');
  assert.deepEqual(reasoningDelRiassuntoDiSfondo(nostroLocale, modelloDiSessionePerRete(nostroLocale)), { effort: 'none' });
  // al contrario: un altro motore locale non riceve niente (come prima), il cloud abbassa come prima
  const ollama = { provider: 'local', runtimeId: 'ollama', modelId: 'LFM2.5', reasoning: { effort: 'high' } };
  assert.equal(reasoningDelRiassuntoDiSfondo(ollama, modelloDiSessionePerRete(ollama)), undefined);
  const cloud = { provider: 'cloud', modello: 'openrouter:vendor/m', reasoning: { effort: 'high' } };
  assert.deepEqual(reasoningDelRiassuntoDiSfondo(cloud, modelloDiSessionePerRete(cloud)), { effort: 'low' });
});
