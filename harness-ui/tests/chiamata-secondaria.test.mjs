import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { chiamaConRitenta } from '../src/kernel/talosHarness.mjs';

/*
 * 15/10/2026 notte — LA CHIAMATA SECONDARIA (`secondaria: true` in `eseguiConFallback`). Il giro vero della compattazione istantanea
 * sulla 4177 (glm-5.3-flash) è FALLITO due volte su due con `PROVIDER_FALLBACK_BUSY`: il riassunto preparato in sottofondo occupava
 * l'involucro dei fornitori, che ammette una chiamata per volta, e la richiesta del giro veniva respinta. Banco: fornitore finto su
 * 127.0.0.1 (lo stesso impianto di bug25-credito-panchina-onesta), la strada vera `chiamaConRitenta` del kernel.
 */
const CHIAVE = 'sec-zai-unica';
const attesa = (ms) => new Promise((r) => { setTimeout(r, ms); });

async function banco(t, rispondi) {
  const richieste = [];
  const server = createServer(async (req, res) => {
    const pezzi = [];
    for await (const c of req) pezzi.push(c);
    const corpo = JSON.parse(Buffer.concat(pezzi));
    richieste.push({ chiave: String(req.headers.authorization ?? '').replace('Bearer ', ''), corpo });
    await rispondi(res, corpo, richieste.length);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((risolvi) => { server.closeAllConnections(); server.close(risolvi); }));
  assert.notEqual(server.address().port, 4174);
  const custodia = new Map();
  const store = createProviderCredentialStore({
    env: { ZAI_API_KEY: CHIAVE },
    keyring: { get: (s, k) => custodia.get(`${s}:${k}`) ?? null, set: (s, k, v) => { custodia.set(`${s}:${k}`, v); return true; }, remove: (s, k) => { custodia.delete(`${s}:${k}`); return true; } },
  });
  store.setRuntime('zai', { endpoint: `http://127.0.0.1:${server.address().port}/zai` });
  const consumi = [];
  const trasporto = creaFetchMultiProvider(fetch, {
    providerStore: store, onConsumoFornitore: async (e) => { consumi.push(e); },
    dipendenze: { leggiChiave: (p) => store.getKey(p), leggiRuntime: (p) => store.getRuntime(p) },
  });
  const opzioni = { modello: 'zai:glm-4.7-flash', chiave: 'unused-local-only', messaggi: [{ role: 'user', content: 'Continua.' }],
    attrezzi: [], maxOutputTokens: 64, fetchDiRete: trasporto, dormi: async () => {}, caso: () => 0 };
  return { richieste, consumi, store, run: (extra = {}) => chiamaConRitenta({ ...opzioni, ...extra }) };
}
const ok = (res, testo) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: testo }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 2 } })); };

test('SECONDARIA-01 — un riassunto in sottofondo (`secondaria`) e la richiesta del giro in contemporanea riescono TUTTI E DUE, e il conto li registra tutti e due', async (t) => {
  const b = await banco(t, async (res, corpo) => { if (corpo.messages?.[0]?.content === 'Continua.') await attesa(300); ok(res, 'fatto'); });
  const giro = b.run();
  await attesa(50); // la richiesta del giro è partita e occupa l'involucro
  const riassunto = b.run({ secondaria: true, messaggi: [{ role: 'user', content: 'Riassumi.' }] });
  const [a, s] = await Promise.all([giro, riassunto]);
  assert.equal(a.testo ?? a.content ?? a.scelta?.message?.content ?? 'fatto', 'fatto');
  assert.ok(s, 'il riassunto risponde');
  assert.equal(b.richieste.length, 2);
  assert.deepEqual(b.consumi.map((c) => c.esito), ['completato', 'completato'], 'il costo del riassunto entra nel conto della sessione');
});

test('SECONDARIA-02 — AL CONTRARIO: due richieste NORMALI in contemporanea restano fermate dal guardiano (la catena dei fornitori è una sola)', async (t) => {
  const b = await banco(t, async (res) => { await attesa(300); ok(res, 'fatto'); });
  const prima = b.run();
  await attesa(50);
  await assert.rejects(b.run(), (e) => e?.code === 'PROVIDER_FALLBACK_BUSY');
  await prima;
});

test('SECONDARIA-03 — una secondaria che fallisce lancia, deposita «interrotto» e NON tocca la catena: la richiesta dopo va sulla stessa chiave', async (t) => {
  let falliscono = true;
  const b = await banco(t, async (res) => {
    if (falliscono) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'boom' } })); return; }
    ok(res, 'fatto');
  });
  await assert.rejects(b.run({ secondaria: true, messaggi: [{ role: 'user', content: 'Riassumi.' }] }), /HTTP 500/u);
  assert.ok(b.consumi.length >= 1 && b.consumi.every((c) => c.esito === 'interrotto'), JSON.stringify(b.consumi.map((c) => c.esito)));
  falliscono = false;
  await b.run();
  assert.equal(b.richieste.at(-1).chiave, CHIAVE, 'la chiave non è finita in panchina per un riassunto fallito');
});
