/*
 * Banco di Performance sulla candidata (04/11/2026, caso B, deepseek/deepseek-v4.1-flash-1017): 4 /compact su 4 morti con
 * CTX_TRUNCATED_SUMMARY «The model spent 2000 tokens on reasoning and left no room for the summary».
 * Misurato sugli eventi veri (`consumo-di-servizio`, sessioni 2e9bb00d e 42f12115): la sintesi partiva GIÀ con `reasoning.effort:
 * 'low'` (`callContextModel`), e il modello ragionava lo stesso 1.231-2.000 token su `max_tokens: 2000`.
 * Il catalogo vero di OpenRouter (GET /api/v1/models, letto il 04/11): DeepSeek V4.1 Flash 1017 `mandatory: false`,
 * `supported_efforts: [max, high, low, none]`; GLM 5.3 Flash `mandatory: true`, `[max, high, low]`.
 * OpenRouter, «Reasoning tokens» (letta il 04/11): `effort: "none"` «Disables reasoning entirely»; `mandatory` «do not send
 * effort: "none" — the model rejects it»; «the request's max_output_tokens limit applies to reasoning and visible output combined».
 * ⇒ La sintesi chiede `none` dove il catalogo lo dichiara e il ragionamento non è obbligatorio; altrove resta `low` col clamp di sempre.
 *   Il corpo CONTATO porta lo stesso campo del corpo INVIATO.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerRuntimeAdapter } from '../src/runtime-owner-adapter.mjs';
import { buildPreparedDesktopContextRequest } from '../src/context-token-counters.mjs';
import { createContextModelAdapter } from '../src/context-provider-adapter.mjs';

/* le voci del catalogo vero, nella forma di `model-catalog.mjs` */
const DEEPSEEK = { reasoning: { supportedEfforts: ['max', 'high', 'low', 'none'], defaultEffort: 'high', defaultEnabled: true, mandatory: false } };
const GLM = { reasoning: { supportedEfforts: ['max', 'high', 'low'], defaultEffort: 'max', defaultEnabled: true, mandatory: true } };
const SENZA_ELENCO = { reasoning: { supportedEfforts: [], defaultEffort: null, defaultEnabled: null, mandatory: false } };
const messages = [{ role: 'system', content: 'Summarize.' }, { role: 'user', content: 'Data' }];

const inviato = async (capability, model = 'deepseek/deepseek-v4.1-flash-1017') => {
  let sent = null;
  const adapter = createOwnerRuntimeAdapter({
    destinazioneModelloDeps: { leggiChiave: () => 'k', leggiRuntime: () => ({ endpoint: 'https://openrouter.ai/api/v1' }), localePronto: () => false, chiamaLocale: async () => { throw new Error('no'); } },
    modelCapabilityFn: async () => capability,
  });
  await adapter.callContextModel({ provider: 'openrouter', model, messages, maxOutputTokens: 2000,
    fetchDiRete: async (_url, init) => { sent = JSON.parse(init.body); return Response.json({ choices: [{ message: { content: '{"text":"ok"}' }, finish_reason: 'stop' }], usage: {} }); } });
  return sent;
};

test('BANCO-PERF-RAG a summary on a model whose reasoning can be switched off asks for none (DeepSeek V4.1 Flash 1017)', async () => {
  assert.deepEqual((await inviato(DEEPSEEK)).reasoning, { effort: 'none' });
});

test('BANCO-PERF-RAG counter-proof: a mandatory reasoning model still gets low, never none (GLM 5.3 Flash)', async () => {
  assert.deepEqual((await inviato(GLM, 'z-ai/glm-5.3-flash')).reasoning, { effort: 'low' });
});

test('BANCO-PERF-RAG counter-proof: mandatory wins over a list that still names none (OpenRouter: «do not send effort: "none"»)', async () => {
  const OBBLIGATORIO_CON_NONE = { reasoning: { supportedEfforts: ['high', 'low', 'none'], defaultEffort: 'high', defaultEnabled: true, mandatory: true } };
  assert.deepEqual((await inviato(OBBLIGATORIO_CON_NONE, 'esempio/obbligatorio-con-none')).reasoning, { effort: 'low' });
});

test('BANCO-PERF-RAG counter-proof: no catalog entry, or no declared list, keeps what was sent before', async () => {
  assert.deepEqual((await inviato(null)).reasoning, { effort: 'low' });
  /* un elenco vuoto: il clamp di sempre toglie `low` (non dichiarato) e il modello decide da sé; questa cura non lo tocca */
  assert.deepEqual((await inviato(SENZA_ELENCO)).reasoning, {});
});

test('BANCO-PERF-RAG the counted summary body carries the same reasoning as the sent one', async () => {
  for (const capability of [DEEPSEEK, GLM, null]) {
    const sent = await inviato(capability);
    const model = { provider: 'openrouter', model: 'deepseek/deepseek-v4.1-flash-1017', windowTokens: 16384, responseReserve: 2000 };
    const compiled = await buildPreparedDesktopContextRequest({ messages, model }, { readModelCapabilities: async () => capability });
    assert.deepEqual(compiled.body.reasoning, sent.reasoning, JSON.stringify(capability));
  }
});

/* Condizioni di Performance (04/11, 15:03) */
const corpoDiPrima = (model, reasoning) => JSON.stringify({ model, messages, tools: [], max_tokens: 2000, stream: false, ...(reasoning ? { reasoning } : {}), transforms: [], plugins: [{ id: 'context-compression', enabled: false }] });
const corpoInviato = async (capability, model) => {
  let body = null;
  const adapter = createOwnerRuntimeAdapter({
    destinazioneModelloDeps: { leggiChiave: () => 'k', leggiRuntime: () => ({ endpoint: 'https://openrouter.ai/api/v1' }), localePronto: () => false, chiamaLocale: async () => { throw new Error('no'); } },
    modelCapabilityFn: async () => capability,
  });
  await adapter.callContextModel({ provider: 'openrouter', model, messages, maxOutputTokens: 2000,
    fetchDiRete: async (_url, init) => { body = init.body; return Response.json({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: {} }); } });
  return body;
};

test('BANCO-PERF-RAG byte-identical: GLM, a mandatory model, a model with no list and an unknown model send exactly the body of before', async () => {
  const OBBLIGATORIO_SOLO_ALTO = { reasoning: { supportedEfforts: ['high'], defaultEffort: 'high', defaultEnabled: true, mandatory: true } };
  for (const [capability, model, reasoning] of [[GLM, 'z-ai/glm-5.3-flash', { effort: 'low' }], [OBBLIGATORIO_SOLO_ALTO, 'x/solo-high', { effort: 'high' }], [SENZA_ELENCO, 'x/senza-elenco', {}], [null, 'x/ignoto', { effort: 'low' }]]) {
    assert.equal(await corpoInviato(capability, model), corpoDiPrima(model, reasoning), model);
  }
});

const conRisposte = (stati) => {
  const corpi = [];
  const fetchDiRete = async (_url, init) => {
    corpi.push(JSON.parse(init.body));
    const stato = stati[corpi.length - 1];
    return stato === 200 ? Response.json({ choices: [{ message: { content: '{"text":"ok"}' }, finish_reason: 'stop' }], usage: { completion_tokens: 9 } })
      : Response.json({ error: { code: stato, message: 'Reasoning effort none is not supported' } }, { status: stato });
  };
  return { corpi, fetchDiRete };
};
const adattatore = (capability) => createOwnerRuntimeAdapter({
  destinazioneModelloDeps: { leggiChiave: () => 'k', leggiRuntime: () => ({ endpoint: 'https://openrouter.ai/api/v1' }), localePronto: () => false, chiamaLocale: async () => { throw new Error('no'); } },
  modelCapabilityFn: async () => capability,
});

test('BANCO-PERF-RAG a 400 on none is retried ONCE with low, says so (tentativi: 2), and the counter then counts the low body', async () => {
  const model = 'deepseek/prova-quattrocento';
  const { corpi, fetchDiRete } = conRisposte([400, 200]);
  const result = await adattatore(DEEPSEEK).callContextModel({ provider: 'openrouter', model, messages, maxOutputTokens: 2000, fetchDiRete });
  assert.deepEqual(corpi.map(c => c.reasoning), [{ effort: 'none' }, { effort: 'low' }]);
  assert.equal(result.text, '{"text":"ok"}');
  assert.equal(result.tentativi, 2);
  const contato = await buildPreparedDesktopContextRequest({ messages, model: { provider: 'openrouter', model, windowTokens: 16384, responseReserve: 2000 } }, { readModelCapabilities: async () => DEEPSEEK });
  assert.deepEqual(contato.body.reasoning, corpi[1].reasoning, 'counted = sent, after the retry too');
  /* e la sintesi dopo parte già con low: una sola chiamata */
  const dopo = conRisposte([200]);
  await adattatore(DEEPSEEK).callContextModel({ provider: 'openrouter', model, messages, maxOutputTokens: 2000, fetchDiRete: dopo.fetchDiRete });
  assert.deepEqual(dopo.corpi.map(c => c.reasoning), [{ effort: 'low' }]);
});

test('BANCO-PERF-RAG counter-proof: never a second retry, no retry on low, no retry on other statuses', async () => {
  const due = conRisposte([400, 400]);
  await assert.rejects(adattatore(DEEPSEEK).callContextModel({ provider: 'openrouter', model: 'deepseek/prova-due-rifiuti', messages, maxOutputTokens: 2000, fetchDiRete: due.fetchDiRete }), { code: 'CTX_SUMMARY_HTTP', httpStatus: 400 });
  assert.equal(due.corpi.length, 2);
  const basso = conRisposte([400]);
  await assert.rejects(adattatore(GLM).callContextModel({ provider: 'openrouter', model: 'z-ai/glm-5.3-flash', messages, maxOutputTokens: 2000, fetchDiRete: basso.fetchDiRete }), { code: 'CTX_SUMMARY_HTTP', httpStatus: 400 });
  assert.equal(basso.corpi.length, 1);
  const altro = conRisposte([404]);
  await assert.rejects(adattatore(DEEPSEEK).callContextModel({ provider: 'openrouter', model: 'deepseek/prova-404', messages, maxOutputTokens: 2000, fetchDiRete: altro.fetchDiRete }), { code: 'CTX_SUMMARY_HTTP', httpStatus: 404 });
  assert.equal(altro.corpi.length, 1);
});

/* Desktop 15:05: l'evento che esiste già (`consumo-di-servizio`, campo `tentativi` solo se più di uno: kernel/consumo-di-servizio.mjs:91-92),
   dalla porta vera del motore (`createContextModelAdapter`, `pagata`) fino a `callContextModel` col fetch finto */
const rigaDiConsumo = async (model, stati) => {
  const righe = [];
  const { fetchDiRete } = conRisposte(stati);
  const owner = adattatore(DEEPSEEK);
  const motore = createContextModelAdapter({
    resolveModel: async ({ selected }) => ({ ...selected, windowTokens: 16384, responseReserve: 2000 }),
    callModel: (request) => owner.callContextModel({ ...request, fetchDiRete }),
    sceltaDellaPersona: () => ({ provider: 'openrouter', model }),
    onConsumoDiServizio: (input) => { righe.push(input); },
  });
  await motore.summarize({ model: { provider: 'openrouter', model, windowTokens: 16384, responseReserve: 2000 }, messages, maxOutputTokens: 2000, operationId: 'op', sessionId: 'chat', jobId: 'job-1' });
  return righe;
};

test('BANCO-PERF-RAG the retry is said by the consumo-di-servizio event: tentativi 2', async () => {
  const righe = await rigaDiConsumo('deepseek/prova-evento', [400, 200]);
  assert.equal(righe.length, 1, JSON.stringify(righe));
  assert.equal(righe[0].valore.tentativi, 2);
  assert.equal(righe[0].valore.esito, 'completato');
});

test('BANCO-PERF-RAG counter-proof: without a retry the event has no tentativi field', async () => {
  const righe = await rigaDiConsumo('deepseek/prova-evento-senza', [200]);
  assert.equal(righe.length, 1);
  assert.equal('tentativi' in righe[0].valore, false, JSON.stringify(righe[0].valore));
});
