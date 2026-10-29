/*
 * Router mode (27/10/2026): the switch (decision 3) and the line in the chat (decision 2).
 *   RTI-01 OFF by default: only `TALOS_LOCAL_ROUTER=1` turns it on.
 *   RTI-02 the line in the chat when today's engine took a model the router could not load; never with today's supervisor.
 *   RTI-03 the notice keeps the dictionary contract (English text = the `en` template, Italian present).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConfig } from '../src/config.mjs';
import { avvisoRipiegoRouter, creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import server from '../frontend/src/i18n/testi/server.js';

test('RTI-01 the switch is OFF by default: only TALOS_LOCAL_ROUTER=1 turns router mode on', () => {
  assert.equal(loadConfig({}, import.meta.url).motoreLocaleRouter, false);
  assert.equal(loadConfig({ TALOS_LOCAL_ROUTER: '1' }, import.meta.url).motoreLocaleRouter, true);
  for (const valore of ['0', 'true', 'yes', '', ' 1']) assert.equal(loadConfig({ TALOS_LOCAL_ROUTER: valore }, import.meta.url).motoreLocaleRouter, false, valore);
});

async function giroConAvvio(esitoDellAvvio) {
  const avvisi = [];
  let pronto = false;
  const risolvi = () => {
    if (!pronto) throw Object.assign(new Error('not running'), { code: 'LOCAL_RUNTIME_NOT_READY' });
    return { fonte: 'local', modelloRemoto: 'mod-a', locale: true, percorso: '/v1/chat/completions' };
  };
  const dipendenze = {
    avviaLocale: async () => { pronto = true; return esitoDellAvvio; },
    chiamaLocale: async () => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  };
  const fetchMulti = creaFetchMultiProvider(fetch, { risolvi, dipendenze, onAvviso: async (messaggio, opzioni) => { avvisi.push({ messaggio, opzioni }); } });
  const risposta = await fetchMulti('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'local:mod-a', messages: [{ role: 'user', content: 'ciao' }] }) });
  return { avvisi, risposta };
}

test('RTI-02 the chat line comes from the start\'s `ripiegoRouter`, once; today\'s supervisor never says it (switch OFF ⇒ nothing)', async () => {
  const conRipiego = await giroConAvvio({ state: 'ready', modelId: 'mod-a', ripiegoRouter: { modelId: 'mod-a', motivo: 'the router could not load the model (exit code 1)', codice: 'ROUTER_LOAD_FAILED' } });
  assert.equal(conRipiego.risposta.status, 200, 'the answer goes on');
  assert.deepEqual(conRipiego.avvisi.map((a) => a.messaggio), [avvisoRipiegoRouter({ modelId: 'mod-a' })]);
  const oggi = await giroConAvvio({ state: 'ready', modelId: 'mod-a', runtimeId: 'llama.cpp' });
  assert.deepEqual(oggi.avvisi, []);
});

test('RTI-03 the notice keeps the dictionary contract, in English first and in Italian', () => {
  const avviso = avvisoRipiegoRouter({ modelId: 'mod-a' });
  assert.equal(avviso.testoChiave, 'server.runtime.notice.routerFallback');
  const chiave = 'runtime.notice.routerFallback';
  assert.equal(avviso.testo, server.en[chiave].replace(/\{(\w+)\}/gu, (m, n) => (n in avviso.testoParams ? String(avviso.testoParams[n]) : m)));
  assert.equal(typeof server.it[chiave], 'string');
  assert.match(server.it[chiave], /\{model\}/u);
});
