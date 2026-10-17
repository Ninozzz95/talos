/*
 * L3-16 (bugfixer, 15/10/2026) — dal mobile (Nino3, 13/10): «un rifiuto del piano ChatGPT prima del primo byte faceva partire un
 * secondo invio su un'altra strada ⇒ due invii contro lo stesso limite». Sul desktop si accerta col motore VERO (multi-fornitore,
 * kernel in streaming come un giro, SDK) e una rete finta al posto di OpenAI che CONTA le richieste. ⛔ Mai una richiesta al piano vero.
 * Le forme del rifiuto «prima del primo byte»: uno stato HTTP (401, 403, 429) prima di qualunque byte del flusso, e un 200 il cui
 * PRIMO evento è già il rifiuto (`error` / `response.failed` del filo Responses).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { chiamaConRitenta } from '../src/kernel/talosHarness.mjs';

const sse = (...eventi) => eventi.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
const json = (stato, corpo, extra = {}) => () => new Response(JSON.stringify(corpo), { status: stato, headers: { 'content-type': 'application/json', ...extra } });
const flussoConPrimoEvento = (evento) => () => new Response(sse(evento), { status: 200, headers: { 'content-type': 'text/event-stream' } });

function banco(rispondi) {
  const richieste = [];
  const rete = async (url, opzioni = {}) => {
    richieste.push({ url: String(url), aut: new Headers(opzioni.headers).get('authorization') });
    return rispondi(richieste.length);
  };
  const custodia = new Map();
  /* una chiave API di OpenAI e una di OpenRouter ci SONO: se il rifiuto del piano ripiegasse su un'altra strada, si vedrebbe */
  const store = createProviderCredentialStore({ env: { OPENAI_API_KEY: 'sk-CHIAVE-API-CHE-NON-DEVE-PAGARE', OPENROUTER_API_KEY: 'sk-or-NON-DEVE-PAGARE' },
    keyring: { get: (s, k) => custodia.get(`${s}:${k}`) ?? null, set: (s, k, v) => { custodia.set(`${s}:${k}`, v); return true; }, remove: (s, k) => { custodia.delete(`${s}:${k}`); return true; } } });
  const dipendenze = { leggiChiave: (p) => { try { return store.getKey(p); } catch { return null; } }, leggiRuntime: (p) => { try { return store.getRuntime(p); } catch { return {}; } },
    leggiTokenDelPiano: async () => 'TOKEN-DEL-PIANO', registraUsoDelPiano: async () => {}, registraLimitiDelPiano: () => {} };
  const trasporto = creaFetchMultiProvider(rete, { providerStore: store, dipendenze });
  const attese = [];
  const run = () => chiamaConRitenta({ modello: 'chatgpt:gpt-6-sol', chiave: 'unused-local-only', messaggi: [{ role: 'system', content: 'Sei TALOS.' }, { role: 'user', content: 'Fai la verifica.' }],
    attrezzi: [], maxOutputTokens: 77, fetchDiRete: trasporto, dormi: async (ms) => { attese.push(ms); }, caso: () => 0, onDelta: () => {} });
  return { richieste, attese, run };
}
const strade = (b) => [...new Set(b.richieste.map((r) => `${r.url} ${r.aut}`))];
const SOLO_IL_PIANO = (b) => {
  assert.deepEqual(strade(b).length, 1, `una strada sola: ${JSON.stringify(strade(b))}`);
  assert.match(strade(b)[0], /Bearer TOKEN-DEL-PIANO$/u, 'paga il piano, mai una chiave');
  assert.equal(b.richieste.some((r) => /openrouter/iu.test(r.url)), false, 'mai OpenRouter');
};

test('L3-16-01 — un rifiuto DEFINITIVO del piano prima del primo byte (401, 403): UNA richiesta, nessun\'altra strada', async () => {
  for (const [stato, codice] of [[403, 'subscription_sharing_user_not_eligible'], [401, 'token_expired'], [403, 'unsupported_country_region_territory']]) {
    const b = banco(json(stato, { error: { code: codice, message: 'no' } }));
    await assert.rejects(b.run(), { code: /^CHATGPT_/u }, `${stato} ${codice}: si ferma col codice del piano`);
    assert.equal(b.richieste.length, 1, `${stato} ${codice}: chiedere di nuovo non cambia la risposta (${b.richieste.length} richieste)`);
    SOLO_IL_PIANO(b);
  }
});

test('L3-16-02 — il limite d’uso prima del primo byte (429): la STESSA richiesta sulla STESSA strada, dopo l’attesa — mai subito, mai altrove', async () => {
  const b = banco((n) => (n === 1 ? json(429, { error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'Usage limit reached.' } })()
    : new Response(sse({ type: 'response.created', response: { id: 'r', created_at: 1, model: 'gpt-6-sol' } },
      { type: 'response.completed', response: { id: 'r', object: 'response', created_at: 1, status: 'completed', model: 'gpt-6-sol', output: [],
        usage: { input_tokens: 1, input_tokens_details: { cached_tokens: 0 }, output_tokens: 0, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 1 } } }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } })));
  await b.run().catch(() => {});
  SOLO_IL_PIANO(b);
  assert.ok(b.attese.length >= 1 && b.attese[0] >= 60_000, `prima del secondo invio si aspetta il limite, non un ritento rapido: ${JSON.stringify(b.attese)}`);
});

test('L3-16-03 — il rifiuto dentro un 200, come PRIMO evento del flusso (`error`, `response.failed` col limite): nessun secondo invio contro lo stesso limite, nessun’altra strada', async () => {
  const forme = {
    error: { type: 'error', code: 'subscription_sharing_usage_limit_exceeded', message: 'Usage limit reached.', sequence_number: 0 },
    'response.failed': { type: 'response.failed', sequence_number: 0, response: { id: 'r', object: 'response', created_at: 1, status: 'failed', model: 'gpt-6-sol', output: [],
      error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'Usage limit reached.' } } },
  };
  const esiti = {};
  for (const [nome, evento] of Object.entries(forme)) {
    const b = banco(flussoConPrimoEvento(evento));
    let errore = null;
    await b.run().catch((e) => { errore = e; });
    SOLO_IL_PIANO(b);
    esiti[nome] = { richieste: b.richieste.length, attese: b.attese, codice: errore?.code ?? null };
  }
  console.log(`[L3-16-03] ${JSON.stringify(esiti)}`);
  for (const [nome, e] of Object.entries(esiti)) {
    assert.ok(e.richieste === 1 || e.attese.every((ms) => ms >= 60_000), `${nome}: ${e.richieste} richieste, attese ${JSON.stringify(e.attese)} — un limite si ripete solo dopo averlo aspettato`);
  }
});

test('L3-16-04 — un rifiuto DEFINITIVO dentro il flusso (account non ammesso): UNA richiesta, col codice del piano', async () => {
  for (const evento of [
    { type: 'error', code: 'subscription_sharing_user_not_eligible', message: 'no', sequence_number: 0 },
    { type: 'response.failed', sequence_number: 0, response: { id: 'r', object: 'response', created_at: 1, status: 'failed', model: 'gpt-6-sol', output: [],
      error: { code: 'subscription_sharing_user_not_eligible', message: 'no' } } },
  ]) {
    const b = banco(flussoConPrimoEvento(evento));
    await assert.rejects(b.run(), { code: 'CHATGPT_PIANO_NON_AMMESSO' });
    assert.equal(b.richieste.length, 1, `${evento.type}: ${b.richieste.length} richieste`);
    SOLO_IL_PIANO(b);
  }
});
