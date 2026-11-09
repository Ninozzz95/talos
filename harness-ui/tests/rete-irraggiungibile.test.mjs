/*
 * Rete irraggiungibile (Performance, banco della compattazione, 04/11/2026): un fornitore che non si raggiunge proprio (connessione
 * rifiutata, nome che non si risolve, nessuna strada verso l'host) usciva come `PROVIDER_OUTCOME_UNKNOWN`, «esito incerto, una nuova
 * richiesta può costare di nuovo». Ma la richiesta non è mai partita: il confine è «la richiesta ha lasciato la macchina?». Un errore dopo
 * l'invio (socket chiuso dal server, ECONNRESET) resta incerto: quello è giusto.
 * Stessa regola di Hermes (`apps/desktop/electron/api-transport.ts:78`, NEVER_SENT_CODES) e di Codex (`http-client/src/transport.rs:124`,
 * `is_connect()` ⇒ `TransportError::Connection`, separato da `Network`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { creaFetchMultiProvider, creaFetchOpenRouterResiliente } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { chiamaConRitenta, talosLavora } from '../src/kernel/talosHarness.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { codiceDiRichiestaNonPartita } from '../src/provider-retry.mjs';
import { classeDelFallimento } from '../src/workflow/adapters/agent-session.mjs';
import { spiegaErrore } from '../frontend/src/components/errori.js';

async function portaChiusa() {
  const s = createServer(); s.listen(0, '127.0.0.1'); await once(s, 'listening');
  const { port } = s.address(); await new Promise(r => s.close(r));
  assert.notEqual(port, 4174);
  return port;
}

function trasporto(base, fetchDiRete = fetch, { riserva = false } = {}) {
  const changes = [], usage = [];
  const store = createProviderCredentialStore({ env: { DEEPSEEK_API_KEY: 'local-fixture', OPENAI_API_KEY: 'local-fixture', ZAI_API_KEY: 'local-fixture' } });
  for (const p of ['deepseek', 'openai', 'zai']) store.setRuntime(p, { endpoint: `${base}/${p}` });
  const transport = creaFetchMultiProvider(fetchDiRete, {
    providerStore: store,
    dipendenze: { leggiChiave: p => store.getKey(p), leggiRuntime: p => store.getRuntime(p) },
    fallbackProviders: riserva ? [{ provider: 'zai', model: 'glm-4.7-flash' }] : [],
    onCambioFornitore: e => changes.push(e), onConsumoFornitore: e => usage.push(e),
  });
  const run = extra => chiamaConRitenta({ modello: 'deepseek:deepseek-chat', chiave: 'unused',
    messaggi: [{ role: 'user', content: 'ciao' }], attrezzi: [], tentativiMassimi: 1,
    fetchDiRete: transport, dormi: async () => {}, ...extra });
  return { store, changes, usage, run };
}

function nonPartita(codice) {
  return e => {
    assert.notEqual(e.code, 'PROVIDER_OUTCOME_UNKNOWN', 'una richiesta mai partita non ha un esito incerto');
    /* il codice che c'era già per «fornitore irraggiungibile» (`inviaCloudProtetta`), con la sua frase già tradotta */
    assert.equal(e.code, 'PROVIDER_NETWORK_ERROR');
    assert.equal(e.classe, 'rete');
    assert.equal(e.transitorio, true);
    assert.equal(e.esitoIncerto, undefined);
    assert.equal(e.richiestaNonPartita, true);
    assert.equal(e.codiceDiRete, codice);
    assert.equal(e.message, 'The provider could not be reached.');
    assert.equal(e.chiave, undefined, 'nessuna chiave di «esito incerto»');
    assert.equal(classeDelFallimento({ classeErrore: e.classe, codiceErrore: e.code }).retryable, true, 'un flusso può rifare il passo: niente è partito');
    return true;
  };
}

const erroreUndici = (code, { aggregato = false } = {}) => {
  const causa = Object.assign(new Error(`connect ${code} 203.0.113.9:443`), { code });
  return new TypeError('fetch failed', { cause: aggregato ? Object.assign(new AggregateError([causa], ''), { code }) : causa });
};

test('RETE-IRRAGGIUNGIBILE-ECONNREFUSED: porta chiusa ⇒ rete irraggiungibile, mai esito incerto', async () => {
  const b = trasporto(`http://127.0.0.1:${await portaChiusa()}`);
  await assert.rejects(b.run(), nonPartita('ECONNREFUSED'));
  assert.deepEqual(b.changes, []);
  assert.equal(b.store.elencaPool('deepseek')[0].inPanchinaFino, null, 'una rete che non c’è non invalida la chiave');
});

test('RETE-IRRAGGIUNGIBILE-NATIVO: anche l’SDK nativo (openai) dice che la richiesta non è partita', async () => {
  const b = trasporto(`http://127.0.0.1:${await portaChiusa()}`);
  await assert.rejects(b.run({ modello: 'openai:gpt-5-nano' }), nonPartita('ECONNREFUSED'));
});

for (const codice of ['ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_CONNECT_TIMEOUT']) {
  test(`RETE-IRRAGGIUNGIBILE-${codice}: il codice di connessione nella causa di undici`, async () => {
    const b = trasporto('http://fornitore.invalid', async () => { throw erroreUndici(codice); });
    await assert.rejects(b.run(), nonPartita(codice));
  });
}

test('RETE-IRRAGGIUNGIBILE-AGGREGATO: happy eyeballs (AggregateError con errors[]) si legge lo stesso', async () => {
  const b = trasporto('http://fornitore.invalid', async () => { throw erroreUndici('ECONNREFUSED', { aggregato: true }); });
  await assert.rejects(b.run(), nonPartita('ECONNREFUSED'));
});

/* La prova al contrario: dopo l'invio il fornitore può aver già prodotto (e fatturato) la risposta. */
test('RETE-IRRAGGIUNGIBILE-CONTRARIO-SOCKET: POST ricevuto, socket chiuso prima degli header ⇒ resta incerto', async t => {
  let ricevute = 0;
  const server = createServer(async (req, res) => { for await (const _ of req) { /* corpo letto */ } ricevute += 1; res.destroy(); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(r => { server.closeAllConnections(); server.close(r); }));
  const b = trasporto(`http://127.0.0.1:${server.address().port}`);
  await assert.rejects(b.run(), e => { assert.equal(e.code, 'PROVIDER_OUTCOME_UNKNOWN'); assert.equal(e.esitoIncerto, true); assert.equal(e.richiestaNonPartita, undefined); return true; });
  assert.equal(ricevute, 1);
});

for (const codice of ['ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET', 'ETIMEDOUT']) {
  test(`RETE-IRRAGGIUNGIBILE-CONTRARIO-${codice}: un codice che può arrivare dopo l'invio resta incerto`, async () => {
    const b = trasporto('http://fornitore.invalid', async () => { throw erroreUndici(codice); });
    await assert.rejects(b.run(), e => { assert.equal(e.code, 'PROVIDER_OUTCOME_UNKNOWN'); assert.equal(e.richiestaNonPartita, undefined); return true; });
  });
}

test('RETE-IRRAGGIUNGIBILE-RISERVA: mai partita ⇒ il fornitore di riserva è sicuro, nessun doppio costo', async () => {
  const b = trasporto(`http://127.0.0.1:${await portaChiusa()}`, fetch, { riserva: true });
  /* la riserva punta allo stesso indirizzo chiuso: la catena finisce con l'errore onesto, non con «esito incerto» */
  await assert.rejects(b.run(), nonPartita('ECONNREFUSED'));
  assert.equal(b.changes.length, 1, 'un cambio verso la riserva: prima, da «esito incerto», nessun cambio era permesso');
  assert.equal(b.changes[0].classe, 'rete');
  assert.equal(b.changes[0].effettivo.provider, 'zai');
  assert.ok(b.usage.every(u => u.usage === null && u.costoDichiarato === null), 'nessun costo dichiarato per richieste mai partite');
});

/*
 * Condizione di Performance (04/11): il passaggio alla riserva aperto da questa cura lascia nel GIORNALE il fornitore e il modello usati
 * davvero, così banchi e resoconti di spesa attribuiscono il giro al modello giusto. Il filo è quello vero: `avviaSessione` passa al
 * motore `onCambioFornitore` e `onConsumoFornitore` (agent-service.mjs, eventi durevoli `cambio-fornitore` e `consumo-fornitore`), e il
 * trasporto si costruisce da quei due come fa il proprietario del motore (`runtime-owner-adapter.mjs`, `creaFetchMultiProvider(fetchResiliente, …)`).
 */
test('RETE-IRRAGGIUNGIBILE-GIORNALE: mai partita ⇒ riserva; il giornale dice fornitore e modello veri, e il costo solo alla riserva', async t => {
  const richieste = [];
  const server = createServer(async (req, res) => {
    const pezzi = []; for await (const p of req) pezzi.push(p);
    richieste.push({ url: req.url, corpo: JSON.parse(Buffer.concat(pezzi)) });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Risposta della riserva.' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 11, completion_tokens: 3, cost: 0.0002 } }));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(r => { server.closeAllConnections(); server.close(r); }));
  const chiusa = await portaChiusa();
  const store = createProviderCredentialStore({ env: { DEEPSEEK_API_KEY: 'local-fixture', ZAI_API_KEY: 'local-fixture' } });
  store.setRuntime('deepseek', { endpoint: `http://127.0.0.1:${chiusa}/deepseek` });
  store.setRuntime('zai', { endpoint: `http://127.0.0.1:${server.address().port}/zai` });
  const riserva = [{ provider: 'zai', model: 'glm-4.7-flash' }];
  const eventi = [], depositati = [];
  const result = await avviaSessione({
    cartella: cartellaDiProva('rete-irraggiungibile-'), task: { consegna: 'saluta' },
    modello: 'deepseek:deepseek-chat', chiave: 'unused', onEvento: e => eventi.push(e),
    fallbackProviders: riserva, onCambioFornitore: async e => { depositati.push(e); },
    talosLavoraFn: input => talosLavora({ ...input, fetchDiRete: creaFetchMultiProvider(fetch, {
      providerStore: store, dipendenze: { leggiChiave: p => store.getKey(p), leggiRuntime: p => store.getRuntime(p) },
      fallbackProviders: riserva, onAvviso: input.onAvviso, onCambioFornitore: input.onCambioFornitore, onConsumoFornitore: input.onConsumoFornitore,
    }) }),
  });
  assert.equal(result.ok, true, JSON.stringify(result.codiceErrore ?? null));
  assert.equal(richieste.length, 1, 'una sola richiesta è partita, ed è quella della riserva');
  assert.equal(richieste[0].url, '/zai/chat/completions');
  assert.equal(richieste[0].corpo.model, 'glm-4.7-flash');
  const giornale = JSON.parse(JSON.stringify(eventi)); // quello che si scrive e si rilegge
  const cambi = giornale.filter(e => e.type === 'CUSTOM' && e.name === 'cambio-fornitore');
  assert.equal(cambi.length, 1, 'un evento di cambio nel giornale');
  assert.deepEqual({ ...cambi[0].value.precedente }, { provider: 'deepseek', model: 'deepseek-chat' });
  assert.deepEqual({ ...cambi[0].value.effettivo }, { provider: 'zai', model: 'glm-4.7-flash' });
  assert.equal(cambi[0].value.classe, 'rete');
  assert.equal(depositati.length, 1, 'e la sessione lo riceve per cambiare il suo modello');
  const consumi = giornale.filter(e => e.type === 'CUSTOM' && e.name === 'consumo-fornitore').map(e => e.value);
  assert.deepEqual(consumi.map(c => [c.provider, c.model, c.esito]), [['deepseek', 'deepseek-chat', 'interrotto'], ['zai', 'glm-4.7-flash', 'completato']]);
  assert.equal(consumi[0].usage, null, 'nessun consumo per la richiesta mai partita');
  assert.equal(consumi[0].costoDichiarato, null);
  assert.equal(consumi[1].costoDichiarato, 0.0002, 'il costo va al modello che ha risposto');
  assert.ok(giornale.findIndex(e => e.name === 'cambio-fornitore') < giornale.findIndex(e => e.name === 'consumo-fornitore' && e.value.provider === 'zai'),
    'il cambio è scritto prima del consumo della riserva');
});

test('RETE-IRRAGGIUNGIBILE-OPENROUTER: il trasporto resiliente non traveste il guasto da HTTP 502', async () => {
  const errore = Object.assign(new Error('The provider could not be reached.'), { code: 'PROVIDER_NETWORK_ERROR', classe: 'rete', transitorio: true, richiestaNonPartita: true, codiceDiRete: 'ECONNREFUSED' });
  const f = creaFetchOpenRouterResiliente(async () => { throw errore; }, { timeoutMs: 5_000, inattivitaMs: 5_000 });
  await assert.rejects(f('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'x/y', messages: [] }) }), e => e === errore);
});

test('RETE-IRRAGGIUNGIBILE-CARTA: la carta dice «non raggiunto», mai «esito incerto, può costare di nuovo»', () => {
  const s = spiegaErrore('The provider could not be reached.', 'PROVIDER_NETWORK_ERROR');
  assert.notEqual(s.id, 'esito-fornitore-incerto');
  assert.equal(s.perche, 'Non è stato possibile raggiungere il fornitore.');
  assert.doesNotMatch(`${s.cosa} ${s.perche} ${s.rimedi.join(' ')}`, /costo|incert/iu);
});

test('RETE-IRRAGGIUNGIBILE-CODICE: la lettura della causa', () => {
  assert.equal(codiceDiRichiestaNonPartita(erroreUndici('ECONNREFUSED')), 'ECONNREFUSED');
  assert.equal(codiceDiRichiestaNonPartita(erroreUndici('ENOTFOUND', { aggregato: true })), 'ENOTFOUND');
  assert.equal(codiceDiRichiestaNonPartita(Object.assign(new Error('x'), { code: 'EHOSTUNREACH' })), 'EHOSTUNREACH');
  /* un AggregateError senza codice proprio: il codice sta solo dentro `errors[]` */
  assert.equal(codiceDiRichiestaNonPartita(new TypeError('fetch failed', { cause: new AggregateError([new Error('v6'), Object.assign(new Error('v4'), { code: 'ENETUNREACH' })]) })), 'ENETUNREACH');
  assert.equal(codiceDiRichiestaNonPartita(erroreUndici('ECONNRESET')), null);
  assert.equal(codiceDiRichiestaNonPartita(new Error('fetch failed')), null);
  assert.equal(codiceDiRichiestaNonPartita(null), null);
  /* un esito già incerto (il corpo era partito) non torna mai «non partita», anche se la sua causa nomina un codice di connessione */
  assert.equal(codiceDiRichiestaNonPartita(Object.assign(new Error('x'), { esitoIncerto: true, cause: { code: 'ECONNREFUSED' } })), null);
  /* una catena circolare non blocca la lettura */
  const a = new Error('a'); const c = new Error('c', { cause: a }); a.cause = c;
  assert.equal(codiceDiRichiestaNonPartita(a), null);
});
