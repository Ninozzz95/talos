/*
 * ⛔ OWN-01 (stress test della 0.5.1, 09/10/2026, sessione 5a48141b, `zai:glm-5.3-flash` sul piano GLM). Ogni giro fallito moriva
 * ESATTAMENTE 60 s dopo l'invio, senza un byte: `scadenzaPrimaRisposta` (runtime-owner-adapter.mjs) col predefinito di 60 s
 * (provider-credential-store.mjs), poi PROVIDER_OUTCOME_UNKNOWN e nessun reinvio, perché il ramo BUG-16 esigeva un `parziale` che
 * c'è solo se lo stream era partito. Misurato nel registro di sviluppo: 12:16:55.8 → 12:17:55.5 e 12:18:06.8 → 12:19:07.4.
 * Decisioni owner 09/10: «10 minuti (Consigliata)» e «Riprova fino a 3 volte e lo dice (Consigliata)».
 * Fonti lette il 09/10/2026: openai-node `DEFAULT_TIMEOUT` 10 min + 2 ritenti sui timeout; anthropic-sdk-typescript idem;
 * OpenCode `provider.ts` `headerTimeout` 300_000; Hermes `run_agent.py` `HERMES_API_TIMEOUT` 1800 s e attesa scalata sul contesto
 * (240 s oltre 100k token); Codex `model-provider-info` `request_max_retries` 4, `stream_max_retries` 5.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { erroreEsitoProviderIncerto } from '../src/provider-retry.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const enc = new TextEncoder();
function flussoIntero(fotogrammi) {
  return new Response(new ReadableStream({
    start(c) {
      for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`));
      c.enqueue(enc.encode('data: [DONE]\n\n'));
      c.close();
    },
  }), { headers: { 'Content-Type': 'text/event-stream' } });
}
const testo = (t) => ({ choices: [{ delta: { content: t } }] });
const fine = { choices: [{ delta: {}, finish_reason: 'stop' }] };
/* L'errore ESATTO che l'adattatore lancia quando scade l'attesa della prima risposta (classificaGuasto → erroreEsitoProviderIncerto). */
const nessunaPrimaRisposta = () => erroreEsitoProviderIncerto({ classe: 'timeout-fornitore', transitorio: true, causaDiTrasporto: 'PROVIDER_FIRST_RESPONSE_TIMEOUT' });
/* Il socket caduto prima degli header: il POST può essere già stato lavorato (PROVIDER-UNKNOWN-ACCEPTED-DISCONNECT) — invariato. */
const socketCaduto = () => erroreEsitoProviderIncerto({ classe: 'rete', transitorio: true });

function rete(...risposte) {
  const corpi = [];
  return {
    corpi,
    fetch: async (_url, opzioni) => {
      corpi.push(JSON.parse(opzioni.body));
      const r = risposte[Math.min(corpi.length, risposte.length) - 1];
      const v = typeof r === 'function' ? r() : r;
      if (v instanceof Error) throw v;
      return v;
    },
  };
}
const base = (extra) => ({
  cartella: cartellaDiProva('talos-prima-risposta-'), task: { consegna: 'riepiloga' }, modello: 'x', chiave: 'y',
  onDelta: () => {}, ...extra,
});
const raccogliRetry = (registro) => (e) => { if (e.tipo === 'provider-retry') registro.push(e); };

test('PRIMA-RISPOSTA-01: nessun byte entro il tempo ⇒ reinvio visibile, il giro chiude al 3° tentativo', async () => {
  const r = rete(nessunaPrimaRisposta, nessunaPrimaRisposta, () => flussoIntero([testo('Arrivata.'), fine]));
  const retry = [];
  const esito = await talosLavora(base({ fetchDiRete: r.fetch, attesaRitentaMassimaMs: 1, onGiro: raccogliRetry(retry) }));
  assert.equal(esito.comeFinita, 'concluso');
  assert.equal(r.corpi.length, 3, 'la richiesta rimasta senza risposta e due reinvii');
  assert.deepEqual(retry.map((e) => [e.fase, e.tentativo, e.tentativiMassimi]), [['attesa', 1, 3], ['attesa', 2, 3]]);
  assert.deepEqual(r.corpi[0].messages, r.corpi[2].messages, 'il reinvio non aggiunge nulla alla storia');
});

test('PRIMA-RISPOSTA-02: tre reinvii vani ⇒ si ferma, dice quanti e perché', async () => {
  const r = rete(nessunaPrimaRisposta);
  const retry = [];
  await assert.rejects(talosLavora(base({ fetchDiRete: r.fetch, attesaRitentaMassimaMs: 1, onGiro: raccogliRetry(retry) })), (e) => {
    assert.equal(e.code, 'PROVIDER_OUTCOME_UNKNOWN_ESAURITO');
    assert.equal(e.esitiIncertiRitentati, 3);
    assert.equal(e.causaDiTrasporto, 'PROVIDER_FIRST_RESPONSE_TIMEOUT');
    assert.match(e.message, /did not start answering/u);
    assert.match(e.message, /3 automatic resends/u);
    assert.equal(e.chiave, 'server.providerOutcome.noFirstResponse', 'Y1 (desktop): the translated key must not say «interrupted»');
    assert.deepEqual(e.params, { n: 3 });
    return true;
  });
  assert.equal(r.corpi.length, 4, 'una richiesta più tre reinvii, poi basta');
  assert.deepEqual(retry.map((e) => e.tentativo), [1, 2, 3]);
  assert.ok(retry.every((e) => e.causa === 'nessuna-prima-risposta'), 'Y2 (desktop): the banner can say the real cause');
});

test('PRIMA-RISPOSTA-03: un socket caduto prima degli header NON si reinvia (il POST può essere stato lavorato)', async () => {
  const r = rete(socketCaduto, () => flussoIntero([testo('mai'), fine]));
  const retry = [];
  await assert.rejects(talosLavora(base({ fetchDiRete: r.fetch, attesaRitentaMassimaMs: 1, onGiro: raccogliRetry(retry) })), (e) => {
    assert.equal(e.code, 'PROVIDER_OUTCOME_UNKNOWN');
    return true;
  });
  assert.equal(r.corpi.length, 1);
  assert.equal(retry.length, 0);
});

test('PRIMA-RISPOSTA-04: lo stop durante l\'attesa del reinvio vince, nessuna seconda richiesta', async () => {
  const stop = new AbortController();
  const r = rete(() => { setTimeout(() => stop.abort(), 100); return nessunaPrimaRisposta(); });
  const esito = await talosLavora(base({ fetchDiRete: r.fetch, segnaleStop: stop.signal }));
  assert.equal(esito.comeFinita, 'fermato');
  assert.equal(r.corpi.length, 1);
});

test('PRIMA-RISPOSTA-07: una risposta consegnata ricomincia il conto dei reinvii', async () => {
  const cartella = cartellaDiProva('talos-prima-risposta-progresso-');
  writeFileSync(join(cartella, 'nota.txt'), 'contenuto', 'utf8');
  const giroBuono = () => flussoIntero([
    { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'leggi', arguments: '{"percorso":"nota.txt"}' } }] } }] },
    { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
  ]);
  const r = rete(nessunaPrimaRisposta, giroBuono, nessunaPrimaRisposta, nessunaPrimaRisposta, nessunaPrimaRisposta,
    () => flussoIntero([testo('Fine.'), fine]));
  const retry = [];
  const esito = await talosLavora(base({ cartella, fetchDiRete: r.fetch, attesaRitentaMassimaMs: 1, onGiro: raccogliRetry(retry) }));
  assert.equal(esito.comeFinita, 'concluso');
  assert.deepEqual(retry.map((e) => e.tentativo), [1, 1, 2, 3], 'dopo il giro buono il conto riparte da 1, e il terzo reinvio è ancora concesso');
});

test('PRIMA-RISPOSTA-05: il tempo della prima risposta è di 10 minuti, fino a 30 su scelta; i 60 s scritti da soli diventano 10 minuti', (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-prima-risposta-store-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const runtimeFile = join(cartella, 'provider-runtime.json');
  const store = createProviderCredentialStore({ env: {}, runtimeFile });
  assert.equal(store.getRuntime('zai').timeoutSeconds, 600, 'predefinito: 10 minuti');
  assert.equal(store.setRuntime('ollama', { endpoint: 'http://127.0.0.1:11434' }).timeoutSeconds, 600, 'senza scelta: il predefinito');
  assert.equal(store.setRuntime('openai', { endpoint: 'https://esempio.test/v1', timeoutSeconds: 1800 }).timeoutSeconds, 1800);
  assert.throws(() => store.setRuntime('openai', { timeoutSeconds: 1801 }), (e) => e.code === 'PROVIDER_RUNTIME_INVALID');

  /* Il file vero dell'owner: `timeoutSeconds: 60` scritto dal predefinito di allora, senza che nessuno l'abbia scelto. */
  writeFileSync(runtimeFile, JSON.stringify({ version: 1, providers: {
    zai: { endpoint: null, endpointConfigured: false, timeoutSeconds: 60 },
    deepseek: { endpoint: null, endpointConfigured: false, timeoutSeconds: 125 },
  } }));
  const vecchio = createProviderCredentialStore({ env: {}, runtimeFile });
  assert.equal(vecchio.getRuntime('zai').timeoutSeconds, 600, 'il 60 del vecchio predefinito non è una scelta');
  assert.equal(vecchio.getRuntime('deepseek').timeoutSeconds, 125, 'un valore diverso dal vecchio predefinito era una scelta: resta');

  /* Una scelta ESPLICITA di 60 s sopravvive al riavvio. */
  vecchio.setRuntime('zai', { endpoint: 'https://api.z.ai/api/coding/paas/v4', timeoutSeconds: 60 });
  assert.equal(createProviderCredentialStore({ env: {}, runtimeFile }).getRuntime('zai').timeoutSeconds, 60);
  assert.equal(JSON.parse(readFileSync(runtimeFile, 'utf8')).providers.zai.timeoutScelto, true);
  /* Cambiare solo l'indirizzo (senza tempo) tiene la scelta di prima (PRIMA-RISPOSTA-08). */
  vecchio.setRuntime('zai', { endpoint: 'https://api.z.ai/api/paas/v4' });
  assert.equal(createProviderCredentialStore({ env: {}, runtimeFile }).getRuntime('zai').timeoutSeconds, 60);
});

test('PRIMA-RISPOSTA-06: dal vivo — header oltre il tempo, poi il fornitore risponde: un reinvio e il giro chiude', async (t) => {
  let richieste = 0;
  const server = createServer(async (req, res) => {
    for await (const _ of req) { /* consuma il corpo */ }
    richieste += 1;
    if (richieste === 1) { setTimeout(() => res.destroy(), 7_000).unref(); return; } // nessun header entro 5 s
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(`data: ${JSON.stringify(testo('Dal vivo.'))}\n\ndata: ${JSON.stringify(fine)}\n\ndata: [DONE]\n\n`);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((ok) => { server.closeAllConnections(); server.close(ok); }));
  assert.notEqual(server.address().port, 4174);
  const store = createProviderCredentialStore({ env: { DEEPSEEK_API_KEY: 'local-fixture' } });
  store.setRuntime('deepseek', { endpoint: `http://127.0.0.1:${server.address().port}/deepseek`, timeoutSeconds: 5 });
  const transport = creaFetchMultiProvider(fetch, { providerStore: store, dipendenze: { leggiChiave: (p) => store.getKey(p), leggiRuntime: (p) => store.getRuntime(p) } });
  const retry = [];
  const esito = await talosLavora(base({ modello: 'deepseek:deepseek-chat', chiave: 'unused', fetchDiRete: transport, attesaRitentaMassimaMs: 1, onGiro: raccogliRetry(retry) }));
  assert.equal(esito.comeFinita, 'concluso');
  assert.equal(richieste, 2);
  assert.equal(retry.length, 1);
});

/*
 * OWN-01, seguito della review del desktop (09/10/2026): chi cambia SOLO l'indirizzo non manda il tempo; il tempo e la sua marca
 * restano quelli di prima per ogni fornitore (prima: i non-cloud tornavano al predefinito e perdevano una scelta vera, per es. 120 s).
 * Senza un «prima» vale il predefinito, non marcato. La rotta del desktop accetta un corpo senza `timeoutSeconds`.
 */
test('PRIMA-RISPOSTA-08: un indirizzo cambiato da solo tiene il tempo e la marca di prima', (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-prima-risposta-tieni-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const runtimeFile = join(cartella, 'provider-runtime.json');
  const store = createProviderCredentialStore({ env: {}, runtimeFile });
  store.setRuntime('ollama', { endpoint: 'http://127.0.0.1:11434', timeoutSeconds: 120 });
  assert.equal(store.setRuntime('ollama', { endpoint: 'http://127.0.0.1:11500' }).timeoutSeconds, 120, 'la scelta resta');
  assert.equal(JSON.parse(readFileSync(runtimeFile, 'utf8')).providers.ollama.timeoutScelto, true, 'e resta una scelta');
  assert.equal(store.setRuntime('lmstudio', { endpoint: 'http://127.0.0.1:1234/v1' }).timeoutSeconds, 600, 'senza un prima: il predefinito');
  assert.equal(JSON.parse(readFileSync(runtimeFile, 'utf8')).providers.lmstudio.timeoutScelto, undefined, 'non marcato');
});
