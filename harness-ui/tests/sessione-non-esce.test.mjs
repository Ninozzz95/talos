/*
 * «Fila vera» (owner 01/11/2026): il motore locale sa di chi è una richiesta. Condizioni del Desktop:
 *   l'id della sessione non esce verso nessun fornitore, e si prova su ciò che parte davvero, compresa la strada del piano ChatGPT;
 *   `localePronto` senza `sessione` dà la risposta di oggi.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { chiamaConRitenta } from '../src/kernel/talosHarness.mjs';

const SESSIONE = 'sessione-segreta-7f3a';
const RISPOSTA = () => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'x' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const voce = (x) => JSON.stringify(x, (_k, v) => (v instanceof Headers ? Object.fromEntries(v.entries()) : v));
const corpoDi = (model) => JSON.stringify({ model, stream: false, messages: [{ role: 'user', content: 'x' }] });

function deps(partite) {
  return {
    leggiChiave: () => 'chiave', localePronto: () => true,
    leggiRuntime: (fonte) => ({ openai: { endpoint: 'https://api.openai.com/v1' }, deepseek: { endpoint: 'https://api.deepseek.com' }, openrouter: { endpoint: 'https://openrouter.ai/api/v1' } })[fonte] ?? {},
    chiamaLocale: async (percorso, opzioni) => { partite.push({ percorso, opzioni }); return RISPOSTA(); },
  };
}

for (const model of ['openai:gpt-x', 'deepseek:deepseek-x', 'moonshot/kimi', 'local:mod-a']) {
  test(`SNE-01 ${model}: the id of the session is not in what leaves`, async () => {
    const partite = [];
    const rete = async (url, opzioni) => { partite.push({ url: String(url), opzioni }); return RISPOSTA(); };
    const f = creaFetchMultiProvider(rete, { dipendenze: deps(partite), sessioneDelGiro: SESSIONE });
    await f('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpoDi(model) }).catch(() => {});
    assert.ok(partite.length > 0, 'something left: the test looks at a real request');
    assert.ok(!voce(partite).includes(SESSIONE), voce(partite).slice(0, 400));
  });
}

test('SNE-02 the road of the ChatGPT plan: neither over HTTP nor on the open connection', async () => {
  const eventi = [{ type: 'response.created', response: { id: 'r', created_at: 1, model: 'gpt-6-luna' } }, { type: 'response.completed', response: { id: 'r', created_at: 1, model: 'gpt-6-luna', status: 'completed', output: [], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } }];
  const flusso = () => new Response(eventi.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  const gira = async (collegamentiDelPiano) => {
    const partite = [];
    const rete = async (url, opzioni) => { partite.push({ url: String(url), opzioni }); return flusso(); };
    const dipendenze = { leggiChiave: () => null, leggiRuntime: () => ({}), leggiTokenDelPiano: async () => 'TOKEN', registraUsoDelPiano: async () => {}, registraLimitiDelPiano: () => {},
      ...(collegamentiDelPiano ? { collegamentiDelPiano: collegamentiDelPiano(partite) } : {}) };
    const fetchDiRete = creaFetchMultiProvider(rete, { dipendenze, sessioneDelGiro: SESSIONE });
    await chiamaConRitenta({ modello: 'chatgpt:gpt-6-luna', chiave: 'x', messaggi: [{ role: 'user', content: 'ciao' }], attrezzi: [], maxOutputTokens: 77, fetchDiRete, onDelta: () => {}, dormi: async () => {}, caso: () => 0 }).catch(() => {});
    return partite;
  };
  const http = await gira(null);
  assert.ok(http.length > 0, 'over HTTP');
  assert.ok(!voce(http).includes(SESSIONE));
  const aperto = await gira((partite) => ({ invia: async (...argomenti) => { partite.push(argomenti); return flusso(); } }));
  assert.ok(aperto.length > 0, 'on the connection');
  assert.ok(!voce(aperto).includes(SESSIONE));
});

test('SNE-03 the session reaches the local engine, and only it: ready and opening both hear it', async () => {
  const pronti = [];
  const aperture = [];
  let aperto = false;
  const dipendenze = { ...deps([]), localePronto: (...argomenti) => { pronti.push(argomenti); return aperto; }, avviaLocale: async (...argomenti) => { aperture.push(argomenti); aperto = true; return { state: 'ready' }; } };
  const f = creaFetchMultiProvider(async () => RISPOSTA(), { dipendenze, sessioneDelGiro: SESSIONE });
  await f('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: {}, body: corpoDi('local:mod-a') });
  assert.deepEqual(pronti, [['mod-a', { sessione: SESSIONE }], ['mod-a', { sessione: SESSIONE }]]);
  assert.equal(aperture[0][0], 'mod-a');
  assert.equal(aperture[0][1].sessione, SESSIONE);
});

test('SNE-04 without a session the question is the one of today: one argument (the telephone, the CLI, the old tests)', async () => {
  const pronti = [];
  const dipendenze = { ...deps([]), localePronto: (...argomenti) => { pronti.push(argomenti); return true; } };
  const f = creaFetchMultiProvider(async () => RISPOSTA(), { dipendenze });
  await f('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: {}, body: corpoDi('local:mod-a') });
  assert.deepEqual(pronti, [['mod-a']]);
});
