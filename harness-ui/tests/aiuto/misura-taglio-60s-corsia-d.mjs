/*
 * ⛔ LA MISURA ALLA SCALA VERA — non entra nella suite perché dura 95 secondi.
 *
 * Riproduce esattamente lo scenario chiesto dall'owner per il punto 7: un fornitore NON-OpenRouter
 * che emette un token ogni 2 secondi per 90 secondi, col tempo del fornitore al suo DEFAULT (60 s).
 * Prima della cura veniva tagliato a 60 s mentre i token stavano ancora arrivando; dopo arriva
 * in fondo.
 *
 * Uso:  node tests/aiuto/misura-taglio-60s-corsia-d.mjs
 */
import { createServer } from 'node:http';
import { once } from 'node:events';

import { chiamaConRitenta } from '../../src/kernel/talosHarness.mjs';
import { creaFetchMultiProvider } from '../../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../../src/provider-credential-store.mjs';

const PASSO_MS = 2_000;
const QUANTI = 45; // 45 × 2 s = 90 s di generazione, oltre il default di 60 s

const server = createServer(async (req, res) => {
  for await (const c of req) void c;
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store' });
  let n = 0;
  const passo = () => {
    if (res.writableEnded || res.destroyed) return;
    if (n >= QUANTI) { res.write('data: [DONE]\n\n'); res.end(); return; }
    n += 1;
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `t${n} ` } }] })}\n\n`);
    setTimeout(passo, PASSO_MS).unref();
  };
  passo();
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;

const valori = new Map();
const store = createProviderCredentialStore({
  env: { DEEPSEEK_API_KEY: 'finta-deepseek' },
  keyring: { get: (s, p) => valori.get(s + p) ?? null, set: (s, p, v) => valori.set(s + p, v), remove: (s, p) => valori.delete(s + p) },
});
store.setRuntime('deepseek', { endpoint: `${base}/deepseek` }); // timeoutSeconds resta il DEFAULT: 60
console.log('timeoutSeconds del fornitore =', store.getRuntime('deepseek').timeoutSeconds);

const fetchBanco = creaFetchMultiProvider(fetch, {
  providerStore: store,
  dipendenze: { leggiChiave: p => store.getKey(p), leggiRuntime: p => store.getRuntime(p) },
});

let ultimoDelta = 0;
const t0 = Date.now();
try {
  const r = await chiamaConRitenta({
    modello: 'deepseek:deepseek-chat', chiave: 'finta',
    messaggi: [{ role: 'user', content: 'ragiona a lungo' }], attrezzi: [],
    tentativiMassimi: 1, dormi: async () => {}, caso: () => 0, fetchDiRete: fetchBanco,
    onDelta: () => { ultimoDelta = Date.now() - t0; },
  });
  const token = (r.scelta.content ?? '').trim().split(/\s+/).filter(Boolean).length;
  console.log(`ESITO  : COMPLETATA in ${Date.now() - t0} ms · ${token} token su ${QUANTI} · ultimo delta a ${ultimoDelta} ms`);
} catch (e) {
  console.log(`ESITO  : TAGLIATA a ${Date.now() - t0} ms · ultimo delta a ${ultimoDelta} ms · ${e.code ?? e.name} · ${e.message}`);
}
server.closeAllConnections();
server.close();
