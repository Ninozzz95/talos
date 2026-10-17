/*
 * Le prove di `revisione-zai-indirizzo-bugfixer.test.mjs` che confrontano il server col Desktop (frontend/, desktop/, scripts/), separate il 15/10/2026 su
 * richiesta della CLI: il file originale prova solo src/ e gira anche nel ramo CLI, che non ha quelle cartelle. Stessa testa,
 * stesse prove, nessuna riga cambiata.
 */
/*
 * ⛔ REVISIONE AVVERSARIA di 608cfbd07 «la chiave Z.AI va solo all'indirizzo scelto» (bugfixer, 14/10/2026).
 *
 * Prove ROSSE apposta sul codice di `feat/zai-indirizzo-e-domanda-scaduta` (testa `608cfbd07`): ognuna mostra un difetto; la cura
 * non è qui. Le prove «AL CONTRARIO» sono verdi e restano verdi dopo la cura: dicono che cosa la cura non deve rompere.
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-ZAI-E-CURE-GOAL-2026-10-14.md`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { createContextTokenCounter, credenzialeDelContatore } from '../src/context-token-counters.mjs';
import server from '../frontend/src/i18n/testi/server.js';

const CHIAVE = 'zai-chiave-della-persona';
const PIANO = 'https://api.z.ai/api/coding/paas/v4';
const MODELLO = { provider: 'zai', model: 'glm-5.3-flash', windowTokens: 200_000, responseReserve: 16_384 };

function custodia() {
  const m = new Map();
  return { get: (s, k) => m.get(`${s}:${k}`) ?? null, set: (s, k, v) => { m.set(`${s}:${k}`, v); return true; }, remove: () => true };
}
/** Il portachiavi come lo crea il DESKTOP (`server.mjs`: `indirizzoDaScegliere: ['zai']`), con una chiave Z.AI e nessun indirizzo scelto. */
const portachiaviDelDesktop = () => createProviderCredentialStore({ env: { ZAI_API_KEY: CHIAVE }, keyring: custodia(), indirizzoDaScegliere: ['zai'] });
/** Il contatore dei token del motore del contesto, cablato COME in `server.mjs` (`resolveProfile` → `credenzialeDelContatore`). */
function contatoreDelDesktop(store) {
  const chiamate = [];
  const contatore = createContextTokenCounter({
    fetchFn: async (url, init) => { chiamate.push({ url: String(url), authorization: init?.headers?.authorization ?? null }); return new Response('{}', { status: 404 }); },
    resolveProfile: async (model) => credenzialeDelContatore(model.provider, { leggiRuntime: (p) => store.getRuntime(p), leggiChiave: (p) => store.getKey(p), baseLocale: 'http://locale.invalid/v1' }),
  });
  return { contatore, chiamate };
}

test('REV-ZAI-00 premessa: il desktop cabla il contatore del motore del contesto col portachiavi, e il motore è di serie per le conversazioni nuove', () => {
  const sorgente = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.match(sorgente, /credenzialeDelContatore\(model\.provider, \{ leggiRuntime: \(p\) => providerStore\.getRuntime\(p\), leggiChiave: \(p\) => providerStore\.getKey\(p\)/u);
  assert.match(sorgente, /indirizzoDaScegliere: \['zai'\]/u);
  // il kernel chiama `contextHooks.prepare` (che misura col contatore) PRIMA di `invoke` (dove la destinazione rifiuta)
  const kernel = readFileSync(new URL('../src/kernel/talosHarness.mjs', import.meta.url), 'utf8');
  const prepara = kernel.indexOf('await contextHooks.prepare({ messages: messaggiDelGiro');
  const invoca = kernel.indexOf('const invoke = (signal = segnaleStop) => chiamaIlModelloConRitenta(');
  assert.ok(prepara > 0 && invoca > prepara, 'prepare comes before the model call');
});

test('REV-ZAI-01 (S2) — senza indirizzo scelto il CONTATORE DEI TOKEN manda la chiave Z.AI all’indirizzo a consumo, prima che la destinazione rifiuti', async () => {
  /* `credenzialeDelContatore` legge `getRuntime('zai').endpoint` (di serie `api/paas/v4`, il saldo a consumo) e `getKey('zai')`, e
     non guarda `endpointDaScegliere`. Il motore del contesto («Motore col metodo», di serie per le conversazioni nuove dal 09/10)
     misura il contesto in `contextHooks.prepare`, PRIMA della chiamata al modello: la chiave parte verso
     `api/paas/v4/chat/completions/input_tokens` col Bearer della persona, e solo dopo la chat si ferma con la carta gialla
     «Nothing was sent». Cura attesa: nessuna richiesta; se il contatore si ferma, col codice della carta gialla. */
  const store = portachiaviDelDesktop();
  assert.equal(store.getRuntime('zai').endpointDaScegliere, true, 'premise: the address is still to choose');
  const { contatore, chiamate } = contatoreDelDesktop(store);
  let errore = null;
  try { await contatore.countPreparedContext({ messages: [{ role: 'user', content: 'ciao' }], tools: [], model: MODELLO }); }
  catch (e) { errore = e; }
  assert.deepEqual(chiamate, [], `the key left for: ${JSON.stringify(chiamate)}`);
  if (errore) assert.equal(errore.code, 'PROVIDER_ENDPOINT_NOT_CHOSEN', 'if the counter stops, it stops with the yellow card code');
});

test('REV-ZAI-01b AL CONTRARIO — scelto il piano, il contatore chiede SOLO all’indirizzo scelto, con la chiave', async () => {
  const store = portachiaviDelDesktop();
  store.setRuntime('zai', { endpoint: PIANO });
  const { contatore, chiamate } = contatoreDelDesktop(store);
  await contatore.countPreparedContext({ messages: [{ role: 'user', content: 'ciao' }], tools: [], model: MODELLO });
  assert.deepEqual(chiamate, [{ url: `${PIANO}/chat/completions/input_tokens`, authorization: `Bearer ${CHIAVE}` }]);
});

test('REV-ZAI-02 (S5) — l’avviso «niente credito» ora ACCESO sul desktop nomina una chiave che il dizionario non ha (nelle due lingue)', () => {
  /* 608cfbd07 accende `zaiSoloIndirizzo: true` sul desktop: a un «niente credito» sull'indirizzo scelto `zai-indirizzo.mjs` manda
     `testoChiave: 'server.runtime.notice.zaiNoCredit'`. Il cancello K4A-S02 non legge `zai-indirizzo.mjs` (non è nel suo elenco), e
     la chiave non c'è in `frontend/src/i18n/testi/server.js` — come `zaiEndpointSwitched` dal 09/10. */
  const sorgente = readFileSync(new URL('../src/zai-indirizzo.mjs', import.meta.url), 'utf8');
  const nominate = [...sorgente.matchAll(/'(server\.[A-Za-z][A-Za-z0-9.]*)'/gu)].map((m) => m[1].slice('server.'.length));
  assert.ok(nominate.includes('runtime.notice.zaiNoCredit'), 'premise: the notice key is named');
  const mancano = nominate.filter((k) => server.en[k] === undefined || server.it[k] === undefined);
  assert.deepEqual(mancano, [], 'every key the Z.AI address module sends exists in English and Italian');
});
