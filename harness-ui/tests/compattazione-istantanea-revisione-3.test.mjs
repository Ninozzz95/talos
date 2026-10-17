/*
 * 16/10/2026 (bugfixer) — verifica breve di e388be7e3: la chiamata secondaria con TENTATIVI_DELLA_SECONDARIA = 2.
 * Il caso chiesto: un 429 con un Retry-After LUNGO. Banco: fornitore finto su 127.0.0.1 e la strada vera chiamaConRitenta, con le attese
 * registrate invece che dormite.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { chiamaConRitenta } from '../src/kernel/talosHarness.mjs';

async function banco(t, rispondi) {
  const richieste = [];
  const server = createServer(async (req, res) => { for await (const _c of req) { /* consuma */ } richieste.push(Date.now()); await rispondi(res, richieste.length); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((risolvi) => { server.closeAllConnections(); server.close(risolvi); }));
  const custodia = new Map();
  const store = createProviderCredentialStore({ env: { ZAI_API_KEY: 'sec-zai-unica' },
    keyring: { get: (s, k) => custodia.get(`${s}:${k}`) ?? null, set: (s, k, v) => { custodia.set(`${s}:${k}`, v); return true; }, remove: (s, k) => { custodia.delete(`${s}:${k}`); return true; } } });
  store.setRuntime('zai', { endpoint: `http://127.0.0.1:${server.address().port}/zai` });
  const trasporto = creaFetchMultiProvider(fetch, { providerStore: store, onConsumoFornitore: async () => {},
    dipendenze: { leggiChiave: (p) => store.getKey(p), leggiRuntime: (p) => store.getRuntime(p) } });
  const attese = [];
  const run = (extra = {}) => chiamaConRitenta({ modello: 'zai:glm-4.7-flash', chiave: 'unused-local-only', messaggi: [{ role: 'user', content: 'Riassumi.' }],
    attrezzi: [], maxOutputTokens: 64, fetchDiRete: trasporto, dormi: async (ms) => { attese.push(ms); }, caso: () => 0, ...extra });
  return { richieste, attese, run };
}

test('IST3-REV-01 — [CURATO 16/10, era S4] la secondaria su un 429 con «Retry-After: 3600» fa il suo ritentativo DOPO UN\'ORA: il riassunto di sottofondo resta in volo, e all\'emergenza il giro aspetta lui', async (t) => {
  const b = await banco(t, async (res) => { res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '3600' }); res.end(JSON.stringify({ error: { message: 'rate limited' } })); });
  await assert.rejects(b.run({ secondaria: true }), /HTTP 429/u);
  assert.ok(b.richieste.length >= 1 && b.richieste.length <= 2, 'al massimo due tentativi (e388be7e3)');
  const massima = Math.max(0, ...b.attese);
  assert.ok(massima <= 30_000, `l'attesa prima del ritentativo è ${massima} ms: \`chiamaConRitenta\` rispetta il Retry-After del fornitore senza tetto (talosHarness.mjs ~2018: \`attesaRitentaMassimaMs\` c'è, ma la secondaria non lo passa). Il riassunto resta \`inVolo\` per un'ora, nessuno ne prepara un altro e l'emergenza fa \`await inVolo.promessa\``);
});

test('IST3-REV-02 — [VERDE] AL CONTRARIO: un 429 senza Retry-After fa due richieste e una sola attesa breve (il backoff del primo ritentativo)', async (t) => {
  const b = await banco(t, async (res) => { res.writeHead(429, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'rate limited' } })); });
  await assert.rejects(b.run({ secondaria: true }), /HTTP 429/u);
  assert.equal(b.richieste.length, 2);
  assert.ok(b.attese.length === 1 && b.attese[0] <= 2_000, JSON.stringify(b.attese));
});
