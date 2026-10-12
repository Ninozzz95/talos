import assert from 'node:assert/strict';
import test from 'node:test';

import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { risolviDestinazioneModello } from '../src/model-destination.mjs';
import { chiamaConRitenta } from '../src/kernel/talosHarness.mjs';
import { CAMPI_VIETATI_DAL_PIANO } from '../src/chatgpt-richiesta.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * «Continue with ChatGPT» (11/10/2026) — un modello del piano attraverso il motore VERO delle richieste (multi-fornitore,
 * kernel, SDK), con una rete finta al posto di OpenAI. La regola che conta: paga il piano, mai la chiave API, e mai un cambio
 * di strada fatto da soli.
 */
const sse = (...eventi) => eventi.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
const risposta = (testo) => ({ id: 'resp_1', object: 'response', created_at: 1791700000, status: 'completed', model: 'gpt-6-sol',
  output: [{ id: 'msg_1', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: testo, annotations: [] }] }],
  usage: { input_tokens: 3, input_tokens_details: { cached_tokens: 0 }, output_tokens: 2, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 5 } });
const flusso = (testo) => () => new Response(sse({ type: 'response.created', response: { id: 'resp_1', created_at: 1791700000, model: 'gpt-6-sol' } },
  { type: 'response.output_item.added', output_index: 0, item: { id: 'msg_1', type: 'message', role: 'assistant', content: [] } },
  { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta: testo },
  { type: 'response.output_item.done', output_index: 0, item: risposta(testo).output[0] },
  { type: 'response.completed', response: risposta(testo) }), { status: 200, headers: { 'content-type': 'text/event-stream' } });

function banco({ rispondi = flusso('Fatto.'), leggiTokenDelPiano = async () => 'TOKEN-DEL-PIANO', conCanale = true, env = {} } = {}) {
  const richieste = [];
  const usi = [];
  const rete = async (url, opzioni = {}) => {
    richieste.push({ url: String(url), aut: new Headers(opzioni.headers).get('authorization'), corpo: typeof opzioni.body === 'string' ? JSON.parse(opzioni.body) : null });
    return rispondi(richieste.length);
  };
  const custodia = new Map();
  const store = createProviderCredentialStore({ env: { OPENAI_API_KEY: 'sk-CHIAVE-API-CHE-NON-DEVE-PAGARE', ...env },
    keyring: { get: (s, k) => custodia.get(`${s}:${k}`) ?? null, set: (s, k, v) => { custodia.set(`${s}:${k}`, v); return true; }, remove: (s, k) => { custodia.delete(`${s}:${k}`); return true; } } });
  const dipendenze = { leggiChiave: (p) => { try { return store.getKey(p); } catch { return null; } }, leggiRuntime: (p) => { try { return store.getRuntime(p); } catch { return {}; } },
    ...(conCanale ? { leggiTokenDelPiano } : {}), registraUsoDelPiano: async (voce) => { usi.push(voce); } };
  const trasporto = creaFetchMultiProvider(rete, { providerStore: store, dipendenze });
  const opzioni = { modello: 'chatgpt:gpt-6-sol', chiave: 'unused-local-only', messaggi: [{ role: 'system', content: 'Sei TALOS.' }, { role: 'user', content: 'Fai la verifica.' }],
    attrezzi: [], maxOutputTokens: 77, fetchDiRete: trasporto, dormi: async () => {}, caso: () => 0 };
  return { richieste, usi, store, trasporto, opzioni, run: (extra) => chiamaConRitenta({ ...opzioni, ...extra }) };
}

test('INSTRADA-01 — the destination of a plan model: OpenAI’s address, no key, and the token asked at send time', () => {
  const d = risolviDestinazioneModello('chatgpt:gpt-6-sol', { leggiChiave: () => 'sk-NON-QUESTA', leggiRuntime: () => { throw Object.assign(new Error('x'), { code: 'PROVIDER_INVALID' }); } });
  assert.deepEqual(d, { fonte: 'chatgpt', modelloRemoto: 'gpt-6-sol', native: true, baseURL: 'https://api.openai.com/v1', apiKey: null, tokenDelPiano: true });
  // the key provider is untouched
  const o = risolviDestinazioneModello('openai:gpt-5-mini', { leggiChiave: () => 'sk-x', leggiRuntime: () => ({ endpoint: 'https://api.openai.com/v1' }) });
  assert.equal(o.apiKey, 'sk-x');
  assert.equal('tokenDelPiano' in o, false);
});

test('INSTRADA-02 — through the real engine the plan pays: the plan token as Bearer, a conformant body, never the API key', async () => {
  const b = banco();
  const esito = await b.run();
  assert.equal(b.richieste.length, 1);
  const r = b.richieste[0];
  assert.equal(r.url, 'https://api.openai.com/v1/responses');
  assert.equal(r.aut, 'Bearer TOKEN-DEL-PIANO');
  assert.equal(JSON.stringify(b.richieste).includes('sk-CHIAVE-API-CHE-NON-DEVE-PAGARE'), false, 'the API key never travels on the plan path');
  assert.equal(r.corpo.model, 'gpt-6-sol');
  assert.equal(r.corpo.store, false);
  assert.equal(r.corpo.stream, true);
  for (const campo of CAMPI_VIETATI_DAL_PIANO) assert.equal(campo in r.corpo, false, campo);
  assert.equal(r.corpo.input.some((v) => v.role === 'system'), false);
  assert.match(JSON.stringify(esito), /Fatto\./u);
});

test('INSTRADA-03 — no token channel, an expired sign-in, or the plan not enabled: nothing is sent, and the key is not tried instead', async () => {
  const casi = [
    [{ conCanale: false }, 'CHATGPT_NON_COLLEGATO'],
    [{ leggiTokenDelPiano: async () => { throw Object.assign(new Error('The ChatGPT session could not be renewed.'), { code: 'CHATGPT_ACCESSO_SCADUTO' }); } }, 'CHATGPT_ACCESSO_SCADUTO'],
    [{ leggiTokenDelPiano: async () => { throw Object.assign(new Error('Using the ChatGPT plan is not enabled for this sign-in.'), { code: 'CHATGPT_PIANO_NON_ABILITATO' }); } }, 'CHATGPT_PIANO_NON_ABILITATO'],
  ];
  for (const [opzioni, codice] of casi) {
    const b = banco(opzioni);
    await assert.rejects(b.run(), (e) => { assert.equal(e.code ?? e.cause?.code, codice, `${codice}: ${e.message} @ ${String(e.stack).split(String.fromCharCode(10)).slice(1, 6).join(' // ')}`); return true; });
    assert.equal(b.richieste.length, 0, `${codice}: nothing leaves`);
  }
});

const limite = (extra = {}) => () => new Response(JSON.stringify({ error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'Usage limit reached.' } }),
  { status: 429, headers: { 'content-type': 'application/json', 'x-oai-request-id': 'req_limite', ...extra } });

test('INSTRADA-04 — the usage limit, like Claude Code: the turn waits 30 minutes, says when, and resends the SAME request; then continues', async () => {
  const attese = []; const eventi = [];
  const b = banco({ rispondi: (n) => (n <= 2 ? limite()() : flusso('Fatto dopo il limite.')()) });
  const esito = await b.run({ dormi: async (ms) => { attese.push(ms); }, onRitenta: (e) => eventi.push(e) });
  assert.match(JSON.stringify(esito), /Fatto dopo il limite\./u);
  assert.deepEqual(attese, [1_800_000, 1_800_000], 'thirty minutes before each new attempt (OpenAI does not say when the limit resets)');
  assert.equal(b.richieste.length, 3);
  assert.deepEqual(b.richieste[2].corpo, b.richieste[0].corpo, 'the same request is sent again, not a new message');
  const inAttesa = eventi.filter((e) => e.fase === 'attesa');
  assert.equal(inAttesa.length, 2);
  for (const e of inAttesa) {
    assert.equal(e.httpStatus, 429);
    assert.equal(e.motivo, 'limite-del-piano');
    assert.ok(e.retryAt > Date.now() + 1_700_000, 'the banner can say the time');
  }
  assert.ok(b.richieste.every((r) => r.url === 'https://api.openai.com/v1/responses' && r.aut === 'Bearer TOKEN-DEL-PIANO'), 'every attempt stays on the plan path');
});

test('INSTRADA-05 — the usage limit that never lifts: after the attempts the turn stops with the plan code; no other provider or key is tried', async () => {
  const attese = [];
  const b = banco({ rispondi: limite() });
  await assert.rejects(b.run({ dormi: async (ms) => { attese.push(ms); } }), (e) => {
    assert.deepEqual({ code: e.code, stato: e.stato, transitorio: e.transitorio }, { code: 'CHATGPT_LIMITE_DEL_PIANO', stato: 429, transitorio: false }, e.message);
    assert.match(e.message, /usage limit/iu);
    return true;
  });
  assert.equal(b.richieste.length, attese.length + 1);
  assert.ok(attese.length >= 1 && attese.every((ms) => ms === 1_800_000), JSON.stringify(attese));
  assert.equal(JSON.stringify(b.richieste).includes('sk-CHIAVE-API-CHE-NON-DEVE-PAGARE'), false);
});

test('INSTRADA-06 — a declared reset is used as it is; one more than 24 hours away stops the turn at once (Claude Code: «resets more than 24 hours out»)', async () => {
  const attese = [];
  const vicino = banco({ rispondi: (n) => (n === 1 ? limite({ 'retry-after': '120' })() : flusso('Ok.')()) });
  await vicino.run({ dormi: async (ms) => { attese.push(ms); } });
  assert.deepEqual(attese, [120_000]);
  const lontano = banco({ rispondi: limite({ 'retry-after': String(25 * 3600) }) });
  const altre = [];
  await assert.rejects(lontano.run({ dormi: async (ms) => { altre.push(ms); } }), (e) => e.code === 'CHATGPT_LIMITE_DEL_PIANO');
  assert.deepEqual(altre, [], 'no waiting a whole day inside a turn');
  assert.equal(lontano.richieste.length, 1);
});

test('INSTRADA-07 — through a whole session the waiting banner carries the plan reason and the turn continues on its own', async (t) => {
  const b = banco({ rispondi: (n) => (n === 1 ? limite({ 'retry-after': '1' })() : flusso('Ripreso.')()) });
  const cartella = mkdtempSync(join(tmpdir(), 'talos-chatgpt-limite-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const eventi = [];
  await avviaSessione({ cartella, task: { consegna: 'Rispondi senza strumenti.' }, modello: b.opzioni.modello, chiave: 'unused-local-only', onEvento: (e) => eventi.push(e),
    talosLavoraFn: (opts) => talosLavora({ ...opts, giriMassimi: 1, fetchDiRete: b.trasporto }) });
  const inizio = eventi.find((e) => e.type === 'RunStarted');
  const attese = eventi.filter((e) => e.name === 'talos.provider-retry' && e.value.fase === 'attesa');
  assert.equal(attese.length, 1, JSON.stringify({ richieste: b.richieste.length, tipi: eventi.map((e) => e.name ?? e.type), errore: eventi.find((e) => e.type === 'RunError') }).slice(0, 900));
  assert.deepEqual({ motivo: attese[0].value.motivo, stato: attese[0].value.httpStatus, run: attese[0].value.runId }, { motivo: 'limite-del-piano', stato: 429, run: inizio.runId });
  assert.ok(eventi.some((e) => e.type === 'RunFinished'), 'the turn ends normally after the limit lifted');
  assert.equal(b.richieste.length, 2);
});

test('INSTRADA-08 — every completed plan request is counted once with its tokens; a request paid by the API key, or one that never completes, is not', async () => {
  const b = banco();
  await b.run();
  assert.equal(b.usi.length, 1);
  assert.equal(b.usi[0].esito, 'completato');
  assert.equal(b.usi[0].usage.total_tokens, 5);
  assert.equal(JSON.stringify(b.usi).includes('TOKEN-DEL-PIANO'), false, 'the count never carries the plan token');
  // AL CONTRARIO: un fornitore a chiave (OpenRouter), risposta completata con i suoi token — non è consumo del piano
  const completions = () => new Response(JSON.stringify({ id: 'c1', choices: [{ index: 0, message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  const conLaChiave = banco({ rispondi: completions, env: { OPENROUTER_API_KEY: 'sk-or-v1-CHIAVE-DI-PROVA' } });
  await conLaChiave.run({ modello: 'z-ai/glm-5.3-flash' });
  assert.equal(conLaChiave.richieste.length, 1);
  assert.equal(conLaChiave.richieste[0].aut, 'Bearer sk-or-v1-CHIAVE-DI-PROVA');
  assert.deepEqual(conLaChiave.usi, [], 'a key-paid request is not plan usage');
  const fermo = banco({ rispondi: () => limite()() });
  await assert.rejects(fermo.run(), { code: 'CHATGPT_LIMITE_DEL_PIANO' });
  assert.deepEqual(fermo.usi, [], 'a refused request is not usage');
});

test('INSTRADA-09 — the reasoning level on the plan wire, measured through the real engine: low to max travel as asked; off, minimal and ultra are not sent', async () => {
  const { LIVELLI_INOLTRATI_DAL_PIANO } = await import('../src/chatgpt-rotte.mjs');
  const sulFilo = {};
  for (const chiesto of ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']) {
    const b = banco();
    await b.run({ reasoning: { effort: chiesto } });
    sulFilo[chiesto] = b.richieste[0].corpo.reasoning?.effort ?? null;
  }
  assert.deepEqual(sulFilo, { none: null, minimal: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max', ultra: null });
  assert.deepEqual(Object.entries(sulFilo).filter(([, v]) => v !== null).map(([k]) => k), [...LIVELLI_INOLTRATI_DAL_PIANO], 'the list the pill uses is the measured one');
});
