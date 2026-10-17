/*
 * Revisione di 979396a14 (copiato da contesto-pieno-attraverso-adattatore). F1 della CLI (prima revisione della 0.6.8, 16/10/2026, S2): dietro l'adattatore dei fornitori (`creaFetchMultiProvider`) un
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

/* AWS Bedrock (anche dietro un proxy compatibile OpenAI) dice così il limite di token al MINUTO: è traffico, non contesto pieno.
   BC-44 (`classificaErroreDiCorsa`) guarda SEGNI_CONTESTO («too many tokens») PRIMA di SEGNI_TRAFFICO, quindi la classe è `contesto`;
   e dal 979396a14 la classe `contesto` porta la frase col marcatore `context_length_exceeded`, che fa partire un riassunto. */
const limitato = (res) => {
  res.writeHead(429, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { message: 'Too many tokens, please wait before trying again.' } }));
};

for (const strada of ['run', 'esegui']) {
  test(`CP-REV-01 (${strada}) — un 429 «Too many tokens, please wait» (limite al minuto) NON è contesto pieno: niente riassunto al posto dell attesa`, async (t) => {
    const b = await banco(t, limitato);
    const errore = await b[strada]().then(() => null, (e) => e);
    assert.ok(errore, 'premessa: il fornitore rifiuta');
    assert.notEqual(classificaErroreFornitore(errore), 'contesto-pieno', `un limite di traffico letto come contesto pieno: ${errore?.classe} · ${errore?.message}`);
  });
}
