/*
 * Riverifica di 7b8a31176 (copiato da contesto-pieno-attraverso-adattatore). F1 della CLI (prima revisione della 0.6.8, 16/10/2026, S2): dietro l'adattatore dei fornitori (`creaFetchMultiProvider`) un
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
    eseguiCon: (chiama) => trasporto.eseguiConFallback(() => chiama(), { modello: opzioni.modello }),
    esegui: () => trasporto.eseguiConFallback(({ fetchDiRete }) => chiamaConRitenta({ ...opzioni, fetchDiRete }), { modello: opzioni.modello }) };
}

/* La strada del `catch` di `eseguiConFallback`: un SDK nativo LANCIA sugli HTTP non riusciti (commento dell'adattatore, «Gli SDK nativi
   lanciano sugli HTTP non riusciti») con `stato` e messaggio. Lì la classificazione è `classificaGuasto(error, stato)`, senza
   `limiteNonContesto`. Un 429 «Too many tokens» diventa `contesto`, non transitorio, con la frase della finestra di contesto. */
for (const forma of [{ stato: 429 }, { statusCode: 429 }]) {
  test(`CP-REV-02 (${Object.keys(forma)[0]}) — un 429 «Too many tokens» LANCIATO (SDK nativo) è traffico come quello dalla risposta HTTP`, async (t) => {
    const b = await banco(t, (res) => { res.writeHead(200); res.end('{}'); });
    const lancia = async () => { throw Object.assign(new Error('Too many tokens, please wait before trying again.'), forma); };
    const trasportoErrore = await b.eseguiCon(lancia).then(() => null, (e) => e);
    assert.ok(trasportoErrore, 'premessa: rifiutato');
    assert.equal(trasportoErrore.classe, 'traffico', `classe ${trasportoErrore.classe} · ${trasportoErrore.message}`);
    assert.doesNotMatch(String(trasportoErrore.message), /context window|context_length_exceeded/u, 'la frase non parla di contesto');
  });
}
