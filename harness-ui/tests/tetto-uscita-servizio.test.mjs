/*
 * CONTRATTO-R30-R31 (owner 30/10/2026 notte), il lato del servizio: il max_tokens davvero inviato nel conto dei consumi (Performance),
 * l'evento del tetto verso lo schermo con i campi STRUTTURATI e senza stato HTTP né attesa (CLI), il limite del modello passato al
 * nucleo, e la riserva di 32.000 del profilo di serie.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { chiamaConRitenta } from '../src/kernel/talosHarness.mjs';
import { avviaSessione } from '../src/agent-service.mjs';

async function banco(t) {
  const consumi = []; const valori = new Map();
  const server = createServer(async (req, res) => {
    for await (const _ of req) { /* il corpo non serve */ }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }], usage: { prompt_tokens: 10, completion_tokens: 2 } }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const store = createProviderCredentialStore({ env: { DEEPSEEK_API_KEY: 'finta', ZAI_API_KEY: 'finta' }, keyring: {
    get: (s, p) => valori.get(s + p) ?? null, set: (s, p, v) => valori.set(s + p, v), remove: (s, p) => valori.delete(s + p) } });
  for (const p of ['deepseek', 'zai']) store.setRuntime(p, { endpoint: `http://127.0.0.1:${server.address().port}/${p}` });
  const opzioni = { providerStore: store, dipendenze: { leggiChiave: (p) => store.getKey(p), leggiRuntime: (p) => store.getRuntime(p) },
    fallbackProviders: [{ provider: 'zai', model: 'glm-4.7-flash' }], onCambioFornitore: () => {}, onConsumoFornitore: (e) => consumi.push(e), onAvviso: () => {} };
  return { consumi, f: creaFetchMultiProvider(fetch, opzioni) };
}
const chiamata = { modello: 'deepseek:deepseek-chat', chiave: 'x', messaggi: [{ role: 'user', content: 'ciao' }], attrezzi: [], dormi: async () => {}, caso: () => 0 };

test('TUS-01 (Performance) il conto dei consumi porta il max_tokens davvero inviato; AL CONTRARIO senza tetto il campo non c\'è', async (t) => {
  const b = await banco(t);
  await b.f.eseguiConFallback((aggiunte) => chiamaConRitenta({ ...chiamata, maxOutputTokens: 25_000, ...aggiunte }), chiamata);
  assert.equal(b.consumi.at(-1).maxTokensInviato, 25_000);
  await b.f.eseguiConFallback((aggiunte) => chiamaConRitenta({ ...chiamata, ...aggiunte }), chiamata);
  assert.equal(Object.hasOwn(b.consumi.at(-1), 'maxTokensInviato'), false);
});

test('TUS-02 (CLI) il servizio passa l\'evento del tetto coi campi strutturati, senza httpStatus né attesaMs; il limite del modello arriva al nucleo', async () => {
  const eventi = []; let ricevuto;
  const talosLavoraFn = async (input) => {
    ricevuto = input.limiteUscitaDelModello;
    input.onGiro?.({ giro: 3, tipo: 'provider-retry', fase: 'invio', canale: 'tetto-uscita', requestId: 'req-1', modello: 'm', tentativo: 1, tentativiMassimi: 2,
      tettoNuovo: 32_000, ragionamento: { da: 'high', a: 'medium' }, costoDiNuovo: true, motivo: 'solo-ragionamento' });
    input.onGiro?.({ giro: 3, tipo: 'provider-retry', fase: 'invio', canale: 'tetto-uscita', requestId: 'req-2', modello: 'm', tentativo: 2, tentativiMassimi: 2,
      tettoNuovo: 64_000, costoDiNuovo: false, motivo: 'inventato' });
    return { comeFinita: 'concluso', messaggiFinali: [], detto: 'ok' };
  };
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'p' }, modello: 'm', chiave: 'k', limiteUscitaToken: 64_000,
    onEvento: (e) => { if (e?.name === 'talos.provider-retry') eventi.push(e.value); }, talosLavoraFn });
  assert.equal(ricevuto, 64_000);
  assert.equal(eventi.length, 2);
  const [primo, secondo] = eventi;
  assert.deepEqual({ canale: primo.canale, motivo: primo.motivo, tettoNuovo: primo.tettoNuovo, ragionamento: primo.ragionamento, costoDiNuovo: primo.costoDiNuovo, giro: primo.giro },
    { canale: 'tetto-uscita', motivo: 'solo-ragionamento', tettoNuovo: 32_000, ragionamento: { da: 'high', a: 'medium' }, costoDiNuovo: true, giro: 3 });
  assert.equal(JSON.parse(JSON.stringify(primo)).httpStatus, undefined);
  assert.equal(JSON.parse(JSON.stringify(primo)).attesaMs, undefined);
  assert.equal(Object.hasOwn(secondo, 'motivo'), false, 'un motivo sconosciuto non passa');
  assert.equal(secondo.costoDiNuovo, false);
});

test('TUS-03 il profilo di serie: riserva 32.000 sopra le finestre grandi, un ottavo sotto', async () => {
  const { resolveDesktopDefaultProfile } = await import('../src/context-runtime.mjs');
  const finestre = { 'a/grande': 400_000, 'a/media': 200_000, 'a/piccola': 100_000 };
  const p = (model) => resolveDesktopDefaultProfile({ provider: 'openrouter', model, finestraFn: (m) => finestre[m] ?? null, env: {} });
  assert.equal((await p('a/grande')).responseReserve, 32_000);
  assert.equal((await p('a/media')).responseReserve, 25_000);
  assert.equal((await p('a/piccola')).responseReserve, 12_500);
});
