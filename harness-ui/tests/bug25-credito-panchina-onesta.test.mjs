import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { chiamaConRitenta, attesaDelTentativo } from '../src/kernel/talosHarness.mjs';
import { marcaRifiutoProvider, leggiRifiutoProvider, leggiAttesaResetDalCorpo } from '../src/provider-retry.mjs';

/*
 * BUG-25 (06/10/2026, owner): «quando raggiungo i limiti di credito la chiave non è più valida» —
 * e invece una chiave con il credito esaurito NON è invalidata: si ritenta sulla STESSA chiave
 * quando il fornitore dichiara quando il credito torna, si dice l'errore onesto quando non lo
 * dichiara, e la panchina è SOLO rotazione fra più chiavi (parity Hermes `credential_pool.py:366-399`,
 * Claude Code: mai 401 finto, mai panchina a metà giro). Banco stile RETRY09: fornitore finto
 * 127.0.0.1, contatore richieste con la chiave VISTA, attese registrate. Il provider è `zai`
 * (keyEnv ZAI_API_KEY) perché Z.AI fattura il credito come 429 + codice business (tabella ufficiale
 * docs.z.ai/api-reference/api-code, 06/10). Nel banco si usa il modello dichiarato nel registro
 * (`glm-4.7-flash`); il modello reale dell'owner (`glm-5.3-flash`) non cambia la classificazione.
 */
const CREDITO = 'Insufficient credit: your balance is empty';
const PRIMA = 'b25-zai-prima', SECONDA = 'b25-zai-seconda';

function rifiutoCredito(res, { stato = 429, headers = {}, corpo } = {}) {
  res.writeHead(stato, { 'Content-Type': 'application/json', ...headers });
  res.end(corpo ?? JSON.stringify({ error: { message: CREDITO } }));
}
function successo(res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Verifica conclusa.' }, finish_reason: 'stop' }] }));
}

async function banco(t, rispondi, { chiavi = [PRIMA] } = {}) {
  const richieste = [];
  const server = createServer(async (req, res) => {
    const pezzi = [];
    for await (const c of req) pezzi.push(c);
    richieste.push({ chiave: String(req.headers.authorization ?? '').replace('Bearer ', ''), corpo: JSON.parse(Buffer.concat(pezzi)) });
    rispondi(res, richieste.length);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(risolvi => { server.closeAllConnections(); server.close(risolvi); }));
  assert.notEqual(server.address().port, 4174);
  const custodia = new Map();
  const store = createProviderCredentialStore({
    env: { ZAI_API_KEY: chiavi[0] },
    keyring: { get: (s, k) => custodia.get(`${s}:${k}`) ?? null,
      set: (s, k, v) => { custodia.set(`${s}:${k}`, v); return true; },
      remove: (s, k) => { custodia.delete(`${s}:${k}`); return true; } },
  });
  for (const [i, k] of chiavi.entries()) if (i > 0) store.aggiungiChiave('zai', k, { priorita: i });
  store.setRuntime('zai', { endpoint: `http://127.0.0.1:${server.address().port}/zai` });
  const trasporto = creaFetchMultiProvider(fetch, { providerStore: store,
    dipendenze: { leggiChiave: p => store.getKey(p), leggiRuntime: p => store.getRuntime(p) } });
  const opzioni = { modello: 'zai:glm-4.7-flash', chiave: 'unused-local-only',
    messaggi: [{ role: 'user', content: 'Continua la verifica, senza scrivere.' }],
    attrezzi: [], maxOutputTokens: 77, fetchDiRete: trasporto, dormi: async () => {}, caso: () => 0 };
  return { richieste, store, trasporto, opzioni,
    run: extra => chiamaConRitenta({ ...opzioni, ...extra }),
    esegui: extra => trasporto.eseguiConFallback(
      ({ fetchDiRete }) => chiamaConRitenta({ ...opzioni, fetchDiRete, ...extra }), { modello: opzioni.modello }) };
}
function disponibile(store) {
  assert.ok(store.elencaPool('zai').every(k => k.stato === 'disponibile' && k.inPanchinaFino === null),
    JSON.stringify(store.elencaPool('zai')));
}

test('B25-01 CREDIT-DECLARED-RETRY: reset dichiarato ⇒ retry sulla STESSA chiave con l\'attesa dichiarata, chiave mai panchinata', async t => {
  const b = await banco(t, (r, n) => n === 1 ? rifiutoCredito(r, { stato: 402, headers: { 'Retry-After': '30' } }) : successo(r));
  const attese = [], eventi = [];
  const esito = await b.run({ dormi: async ms => { disponibile(b.store); attese.push(ms); }, onRitenta: e => eventi.push(e) });
  assert.equal(esito.tentativi, 2);
  assert.deepEqual(attese, [30_000], 'l\'attesa DICHIARATA dal fornitore vince sul backoff');
  assert.equal(b.richieste.length, 2);
  assert.equal(b.richieste[1].chiave, b.richieste[0].chiave, 'il credito NON ruota di chiave');
  assert.deepEqual(eventi.map(e => [e.fase, e.httpStatus, e.motivo]),
    ['attesa', 'invio', 'fine'].map(f => [f, 402, 'credito']), 'l\'attesa è visibile col motivo giusto');
  disponibile(b.store);
});

test('B25-02 CREDIT-UNDECLARED-NO-BURN: senza reset dichiarato una richiesta sola, errore onesto, NESSUNA panchina', async t => {
  const b = await banco(t, r => rifiutoCredito(r, { stato: 402 }));
  await assert.rejects(b.esegui(), e => {
    assert.equal(e.code, 'PROVIDER_REQUEST_ERROR');
    assert.equal(e.classe, 'credito'); assert.equal(e.stato, 402); assert.equal(e.transitorio, false);
    assert.match(e.message, /Credit not available at the provider\./u);
    return true;
  });
  assert.equal(b.richieste.length, 1, 'senza una scadenza nota non si bruciano richieste a vuoto');
  disponibile(b.store);
});

test('B25-03 SOLE-KEY-NO-LOCKOUT: 429+credito a chiave unica ⇒ 1 richiesta REALE, errore onesto, nessuna panchina, mai il 401 sintetico', async t => {
  const b = await banco(t, r => rifiutoCredito(r, { stato: 429 }));
  await assert.rejects(b.run(), e => e.classe === 'credito' && e.stato === 429 && e.transitorio === false);
  assert.equal(b.richieste.length, 1, 'senza scadenza dichiarata non si bruciano richieste a vuoto (parity Hermes)');
  assert.equal(b.richieste[0].chiave, PRIMA, 'contro il fornitore vero: nessuna risposta inventata in locale');
  disponibile(b.store);
});

test('B25-04 SOLE-KEY-TRANSIENT: 503 a chiave unica ⇒ panchina post-giro di 60 s (né 1 h, né zero)', async t => {
  const b = await banco(t, r => { r.writeHead(503, { 'Content-Type': 'application/json' }); r.end(JSON.stringify({ error: { message: 'upstream error' } })); });
  await assert.rejects(b.esegui(), e => e.transitorio === true);
  const voce = b.store.elencaPool('zai')[0];
  assert.equal(voce.causa, 'guasto-fornitore');
  const attesa = voce.inPanchinaFino - Date.now();
  assert.ok(attesa > 55_000 && attesa <= 60_000, `attesa=${attesa}`);
});

test('B25-05 MULTI-KEY-ROTATION: a due chiavi il credito panchina la prima ~1 h e il giro successivo usa la seconda, mai risposte inventate', async t => {
  const b = await banco(t, r => rifiutoCredito(r, { stato: 429 }), { chiavi: [PRIMA, SECONDA] });
  await assert.rejects(b.run(), e => e.classe === 'credito' && e.stato === 429);
  assert.equal(b.richieste.length, 1, 'un rifiuto, una richiesta reale: la panchina È la rotazione');
  assert.equal(b.richieste[0].chiave, PRIMA);
  const voce = b.store.elencaPool('zai')[0];
  assert.equal(voce.causa, 'credito');
  assert.ok(voce.inPanchinaFino - Date.now() > 55 * 60_000, `panchina ~1h: ${voce.inPanchinaFino - Date.now()}`);
  assert.equal(b.store.elencaPool('zai')[1].stato, 'disponibile', 'la seconda resta pronta per il giro dopo');
  await assert.rejects(b.run(), e => e.classe === 'credito');
  assert.equal(b.richieste.length, 2);
  assert.equal(b.richieste[1].chiave, SECONDA, 'il giro dopo ruota sulla seconda chiave: zero risposte locali inventate');
});

test('B25-06 FASTFAIL-HONEST: la panchina-credito (con scadenza dichiarata) risponde 402 onesto, mai il 401 «chiave non valida»', async t => {
  const b = await banco(t, (r, n) => n === 1 ? rifiutoCredito(r, { stato: 402, headers: { 'Retry-After': '3600' } }) : successo(r));
  await assert.rejects(b.esegui(), e => e.classe === 'credito' && e.retryAfterMs === 3_600_000);
  const voce = b.store.elencaPool('zai')[0];
  assert.equal(voce.causa, 'credito');
  assert.ok(voce.inPanchinaFino - Date.now() > 55 * 60_000, 'panchina ESATTAMENTE fino alla scadenza DICHIARATA');
  const risposta = await b.trasporto('https://openrouter.ai/api/v1/chat/completions',
    { method: 'POST', body: JSON.stringify({ model: 'zai:glm-4.7-flash', messages: [] }) });
  assert.equal(risposta.status, 402, 'stato ONESTO per causa: credito ⇒ 402');
  const testo = await risposta.text();
  assert.match(testo, /Credit not available at the provider\./u);
  assert.doesNotMatch(testo, /credential|not valid/iu, 'mai più «la chiave non è valida» per il credito');
  assert.equal(b.richieste.length, 1, 'nessuna chiamata di rete durante la panchina dichiarata');
});

test('B25-07 RESET-GRAMMAR-BODY: «quotaResetDelay: 30s» nel corpo e nessun header ⇒ stessa strada del Retry-After', async t => {
  const b = await banco(t, (r, n) => n === 1
    ? rifiutoCredito(r, { stato: 429, corpo: JSON.stringify({ error: { message: `${CREDITO} quotaResetDelay: 30s` } }) })
    : successo(r));
  const attese = [];
  const esito = await b.run({ dormi: async ms => attese.push(ms) });
  assert.equal(esito.tentativi, 2);
  assert.deepEqual(attese, [30_000]);
  assert.equal(b.richieste.length, 2);
  disponibile(b.store);
});

test('B25-08 RESET-CEILING: Retry-After 1 h su credito ⇒ nessuna attesa in-giro (tetto 60 s), errore onesto con la scadenza e panchina dichiarata', async t => {
  const b = await banco(t, r => rifiutoCredito(r, { stato: 402, headers: { 'Retry-After': '3600' } }));
  await assert.rejects(b.run(), e => e.classe === 'credito' && e.retryAfterMs === 3_600_000,
    'la scadenza dichiarata viaggia con l\'errore onesto');
  assert.equal(b.richieste.length, 1, 'il giro non dorme un\'ora né martella: oltre il tetto si ferma onesto');
  const voce = b.store.elencaPool('zai')[0];
  assert.equal(voce.causa, 'credito');
  assert.ok(voce.inPanchinaFino - Date.now() > 55 * 60_000, 'panchina ESATTAMENTE fino alla scadenza dichiarata (post-giro)');
});

test('B25-GRAMMATICA: le forme di reset dichiarate nel corpo (stessa tabella di Hermes retry_utils.py:64-76)', () => {
  assert.equal(leggiAttesaResetDalCorpo(`${CREDITO} quotaResetDelay: 30s`), 30_000);
  assert.equal(leggiAttesaResetDalCorpo('quotaResetDelay: 500ms'), 500);
  assert.equal(leggiAttesaResetDalCorpo('resets_in_seconds: 90'), 90_000);
  assert.equal(leggiAttesaResetDalCorpo('Your weekly limit resets in 4hr 5min'), (4 * 3_600 + 5 * 60) * 1000);
  assert.equal(leggiAttesaResetDalCorpo('please retry after 12 s'), 12_000);
  assert.equal(leggiAttesaResetDalCorpo('Resets at 2026-10-07T00:00:00Z'), null, 'i tempi assoluti restano fuori dalla tranche 1');
  assert.equal(leggiAttesaResetDalCorpo('nessuna grammatica qui'), null);
  assert.equal(leggiAttesaResetDalCorpo(null), null);
  assert.equal(leggiAttesaResetDalCorpo('x'.repeat(16_385)), null, 'corpo oltre il limite letto dall\'adapter: non si inventa nulla');
});

test('B25-MARCATORE: il marker credito viaggia sul canale interno esistente ed è leggibile dai moduli gemelli', async () => {
  const prima = await import('../src/provider-retry.mjs');
  const seconda = await import('../src/provider-retry.mjs?b25-seconda-copia');
  assert.equal(seconda.leggiRifiutoProvider(prima.marcaRifiutoProvider(new Response('', { status: 429 }), 'credito'))?.motivo, 'credito',
    'Z.AI fattura il credito come 429: il marker non può legarsi al solo 402');
  assert.equal(seconda.leggiRifiutoProvider(prima.marcaRifiutoProvider(new Response('', { status: 402 }), 'credito'))?.motivo, 'credito');
  assert.equal(seconda.leggiRifiutoProvider(prima.marcaRifiutoProvider(new Response('', { status: 402 }), 'budget-occupato'))?.motivo, 'budget-occupato');
  assert.equal(seconda.leggiRifiutoProvider(new Response('', { status: 402 })), null, 'senza marker interno: nessun rifiuto');
  assert.equal(seconda.leggiRifiutoProvider(new Response('', { status: 402, headers: { 'X-Talos-Provider-Rejection': 'credito' } })), null,
    'il canale resta il Symbol: nessun header fidato dalla rete');
});

/* ⛔ BUG-25 — chiusura delle due LACUNA di copertura (review avversariale gen.1, 06/10/2026, righe 132-133 e 198-199 del
 * rapporto: mutanti (d) e (e) scritti MAI applicati; nessun test cadeva). Solo casi NUOVI: nessuna asserzione esistente toccata. */
test('B25-09 HEADER-SOPRA-CORPO: Retry-After-Ms E grammatica del corpo SULLO STESSO rifiuto ⇒ vince l\'header (LACUNA 2, mutante (e))', async t => {
  const b = await banco(t, (r, n) => n === 1
    ? rifiutoCredito(r, { stato: 402, headers: { 'Retry-After-Ms': '45000' },
        corpo: JSON.stringify({ error: { message: `${CREDITO} quotaResetDelay: 30s` } }) })
    : successo(r));
  const attese = [];
  const esito = await b.run({ dormi: async ms => attese.push(ms) });
  assert.equal(esito.tentativi, 2);
  assert.deepEqual(attese, [45_000],
    'l\'attesa DICHIARATA dall\'header vince sulla grammatica del corpo (leggiAttesaRichiestaDalFornitore(headers) ?? attesaCorpo, runtime-owner-adapter.mjs): con header e corpo invertiti questo test DIVENTA ROSSO (30_000 ≠ 45_000)');
  assert.equal(b.richieste.length, 2, 'credito con scadenza dichiarata: retry sulla STESSA chiave');
  disponibile(b.store);
});

test('B25-10 CAP-32000: il backoff di in-giro pesta al tetto verbatim 32.000 ms (LACUNA 1, mutante (d) cap 2.000)', () => {
  /* base = min(500·2^tentativo, 32_000): dal tentativo 6 in poi il tetto è TANGIBILE.
   * Col mutante cap 2.000 OGNI asserzione qui diventa 2.000 ⇒ rosso (prima nessun test lo osservava:
   * B25-01 asseriva [30_000] ma max(2.000, 30.000) restava 30.000). */
  assert.equal(attesaDelTentativo(5, () => 0), 16_000, 'sotto il tetto la crescita ×2 resta intatta (500·2^5)');
  assert.equal(attesaDelTentativo(6, () => 0), 32_000, 'primo tentativo al tetto (500·2^6 = 32.000)');
  assert.equal(attesaDelTentativo(9, () => 0), 32_000);
  assert.equal(attesaDelTentativo(10, () => 0), 32_000,
    'attesaDelTentativo(10, ()=>0) DEVE valere ESATTAMENTE 32.000, non ≤32.000: con cap 2.000 questo test cade');
  assert.equal(attesaDelTentativo(10, () => 1), 32_000, 'nemmeno il jitter massimo supera il cap');
});
