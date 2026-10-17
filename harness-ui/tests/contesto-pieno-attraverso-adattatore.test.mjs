/*
 * F1 della CLI (prima revisione della 0.6.8, 16/10/2026, S2): dietro l'adattatore dei fornitori (`creaFetchMultiProvider`) un
 * «contesto pieno» usciva come «The provider did not accept the request.» — il corpo del fornitore non passa mai (può contenere la
 * chiave) — e nessuno lo riprovava: né K8 del legacy, né il ritentativo di «Non aspettare se entra» nel guscio e nel servizio,
 * che riconoscono il contesto pieno con `classificaErroreFornitore`. La prova di prima lanciava il messaggio grezzo, che nella
 * composizione vera non arriva mai: per questo passava. Qui il fornitore è finto ma VERO (127.0.0.1), e si passa dalle due strade
 * dell'adattatore: `chiamaConRitenta` col trasporto, e `eseguiConFallback`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { chiamaConRitenta } from '../src/kernel/talosHarness.mjs';
import { classificaErroreFornitore } from '../src/kernel/compattazione-desktop.mjs';

const SEGRETO = 'dettaglio-del-fornitore-che-non-deve-uscire';

async function banco(t, rispondi, { chiavi = ['cp-zai'] } = {}) {
  let richieste = 0;
  const server = createServer(async (req, res) => { for await (const _ of req) { /* consumato */ } richieste += 1; rispondi(res); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(risolvi => { server.closeAllConnections(); server.close(risolvi); }));
  const custodia = new Map();
  const store = createProviderCredentialStore({
    env: { ZAI_API_KEY: chiavi[0] },
    keyring: { get: (s, k) => custodia.get(`${s}:${k}`) ?? null, set: (s, k, v) => { custodia.set(`${s}:${k}`, v); return true; }, remove: (s, k) => { custodia.delete(`${s}:${k}`); return true; } },
  });
  for (const [i, k] of chiavi.entries()) if (i > 0) store.aggiungiChiave('zai', k, { priorita: i });
  store.setRuntime('zai', { endpoint: `http://127.0.0.1:${server.address().port}/zai` });
  const trasporto = creaFetchMultiProvider(fetch, { providerStore: store, dipendenze: { leggiChiave: p => store.getKey(p), leggiRuntime: p => store.getRuntime(p) } });
  const opzioni = { modello: 'zai:glm-4.7-flash', chiave: 'unused-local-only', messaggi: [{ role: 'user', content: 'Continua.' }],
    attrezzi: [], maxOutputTokens: 77, fetchDiRete: trasporto, dormi: async () => {}, caso: () => 0 };
  return { store, get richieste() { return richieste; },
    run: () => chiamaConRitenta(opzioni),
    esegui: () => trasporto.eseguiConFallback(({ fetchDiRete }) => chiamaConRitenta({ ...opzioni, fetchDiRete }), { modello: opzioni.modello }) };
}
const rifiuta = (stato, messaggio) => (res) => {
  res.writeHead(stato, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { code: 'context_length_exceeded', message: `${messaggio} ${SEGRETO}` } }));
};
const chiaveSana = (store) => assert.ok(store.elencaPool('zai').every(k => k.stato === 'disponibile' && k.inPanchinaFino === null), 'la chiave è sana: niente panchina, niente rotazione');

for (const strada of ['run', 'esegui']) {
  test(`CP-ADATTATORE-01 (${strada}) — un 400 «maximum context length» arriva come contesto pieno riconoscibile, senza il corpo del fornitore`, async (t) => {
    const b = await banco(t, rifiuta(400, "This endpoint's maximum context length is 60000 tokens. However, you requested about 61234 tokens."));
    const errore = await b[strada]().then(() => null, (e) => e);
    assert.ok(errore, 'premessa: il fornitore rifiuta');
    assert.equal(classificaErroreFornitore(errore), 'contesto-pieno', `${errore?.code} ${errore?.message}`);
    assert.doesNotMatch(String(errore.message), new RegExp(SEGRETO, 'u'), 'il corpo del fornitore non esce');
    chiaveSana(b.store);
  });
  test(`CP-ADATTATORE-02 (${strada}) — anche un 413 senza parole è contesto pieno`, async (t) => {
    const b = await banco(t, (res) => { res.writeHead(413, { 'Content-Type': 'text/plain' }); res.end('Payload Too Large'); });
    assert.equal(classificaErroreFornitore(await b[strada]().then(() => null, (e) => e)), 'contesto-pieno');
    chiaveSana(b.store);
  });
  test(`CP-ADATTATORE-05 (${strada}) — una forma che la tabella BC-44 chiama «richiesta non valida» («Input is too long…») è contesto pieno`, async (t) => {
    // senza `code`: solo la frase, come la manda un fornitore vero (con il codice basterebbe la tabella BC-44)
    const b = await banco(t, (res) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Input is too long for requested model.' } })); });
    assert.equal(classificaErroreFornitore(await b[strada]().then(() => null, (e) => e)), 'contesto-pieno');
    chiaveSana(b.store);
  });
  test(`CP-ADATTATORE-03 (${strada}) — AL CONTRARIO: un 400 per un argomento malformato NON è contesto pieno`, async (t) => {
    const b = await banco(t, (res) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Invalid tool schema: missing type' } })); });
    assert.equal(classificaErroreFornitore(await b[strada]().then(() => null, (e) => e)), null);
  });
}

test('CP-ADATTATORE-04 — con DUE chiavi il contesto pieno non panchina né ruota: la chiave è sana, è la richiesta a essere troppo grande', async (t) => {
  const b = await banco(t, rifiuta(400, "This endpoint's maximum context length is 60000 tokens."), { chiavi: ['cp-zai-1', 'cp-zai-2'] });
  const errore = await b.esegui().then(() => null, (e) => e);
  assert.equal(classificaErroreFornitore(errore), 'contesto-pieno');
  chiaveSana(b.store);
  assert.equal(b.richieste, 1, 'nessun nuovo invio su un altra chiave: non servirebbe');
});

test('CP-ADATTATORE-06 — un 429 «Too many tokens, please wait» è un limite di traffico: classe «traffico», e il kernel ritenta invece di arrendersi', async (t) => {
  const b = await banco(t, (res) => { res.writeHead(429, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Too many tokens, please wait before trying again.' } })); });
  const errore = await b.run().then(() => null, (e) => e);
  assert.equal(errore?.classe, 'traffico', `${errore?.classe} · ${errore?.message}`);
  assert.equal(classificaErroreFornitore(errore), null);
  assert.ok(b.richieste > 1, `ritentato: ${b.richieste} richieste`);
});
