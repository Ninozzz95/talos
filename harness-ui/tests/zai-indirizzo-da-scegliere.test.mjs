import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { createProviderProbe } from '../src/provider-probe.mjs';
import { risolviDestinazioneModello } from '../src/model-destination.mjs';
import { chiamaConRitenta } from '../src/kernel/talosHarness.mjs';

/*
 * Owner 14/10/2026 (desktop; mockup approvato, variante B e carta «Sì, così»): la chiave Z.AI va SOLO all'indirizzo che la
 * persona ha scelto. Il portachiavi del desktop nasce con `indirizzoDaScegliere: ['zai']`: finché la persona non sceglie,
 * niente parte — né la chat, né la prova d'accesso, né la riscrittura del prompt — e lo si dice PRIMA della rete, col codice
 * `PROVIDER_ENDPOINT_NOT_CHOSEN`. Chi non passa l'opzione (la CLI) non cambia di una virgola.
 */
const PIANO = 'https://api.z.ai/api/coding/paas/v4';
const SALDO = 'https://api.z.ai/api/paas/v4';
const CHIAVE = 'zai-scelta-chiave';
const ok = () => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });

function custodia() {
  const m = new Map();
  return { get: (s, k) => m.get(`${s}:${k}`) ?? null, set: (s, k, v) => { m.set(`${s}:${k}`, v); return true; }, remove: () => true };
}
function banco({ daScegliere = ['zai'], chiave = CHIAVE } = {}) {
  const richieste = [];
  const rete = async (url) => { richieste.push(String(url)); return ok(); };
  const store = createProviderCredentialStore({ env: chiave ? { ZAI_API_KEY: chiave } : {}, keyring: custodia(), ...(daScegliere ? { indirizzoDaScegliere: daScegliere } : {}) });
  const avvisi = [];
  const trasporto = creaFetchMultiProvider(rete, { providerStore: store, zaiSoloIndirizzo: true, onAvviso: async (a) => { avvisi.push(a); },
    dipendenze: { leggiChiave: (p) => store.getKey(p), leggiRuntime: (p) => store.getRuntime(p) } });
  const opzioni = { modello: 'zai:glm-5.3-flash', chiave: 'unused', messaggi: [{ role: 'user', content: 'ciao' }], attrezzi: [],
    maxOutputTokens: 50, fetchDiRete: trasporto, dormi: async () => {}, caso: () => 0 };
  return { richieste, store, avvisi, chiama: () => chiamaConRitenta(opzioni) };
}

test('ZAI-S1 senza indirizzo scelto la chat non parte: PROVIDER_ENDPOINT_NOT_CHOSEN, zero richieste, nessun avviso', async () => {
  const b = banco();
  assert.equal(b.store.getRuntime('zai').endpointDaScegliere, true, 'la premessa: il portachiavi lo dice');
  await assert.rejects(b.chiama(), (e) => { assert.equal(e.code, 'PROVIDER_ENDPOINT_NOT_CHOSEN'); assert.match(e.message, /Choose where your Z\.AI key goes/u); return true; });
  assert.deepEqual(b.richieste, [], 'la chiave non è andata da nessuna parte');
  assert.deepEqual(b.avvisi, []);
});

test('ZAI-S2 AL CONTRARIO: scelto il saldo (lo stesso indirizzo di serie) la richiesta va lì, e solo lì', async () => {
  const b = banco();
  b.store.setRuntime('zai', { endpoint: SALDO });
  assert.equal(b.store.getRuntime('zai').endpointDaScegliere, undefined, 'scelto ⇒ niente più blocco');
  await b.chiama();
  assert.deepEqual(b.richieste.map((u) => u.replace(/\/chat\/completions.*$/u, '')), [SALDO]);
});

test('ZAI-S3 scelto il piano GLM: la richiesta va al piano, nessuna sonda degli altri indirizzi', async () => {
  const b = banco();
  b.store.setRuntime('zai', { endpoint: PIANO });
  await b.chiama();
  assert.deepEqual(b.richieste.map((u) => u.replace(/\/chat\/completions.*$/u, '')), [PIANO]);
});

test('ZAI-S4 la chiave che manca vince sull\'indirizzo: senza chiave il rimedio è la chiave', async () => {
  const b = banco({ chiave: null });
  await assert.rejects(b.chiama(), (e) => e.code === 'PROVIDER_KEY_MISSING');
  assert.deepEqual(b.richieste, []);
});

test('ZAI-S5 chi non passa `indirizzoDaScegliere` (la CLI) non cambia: niente blocco, la richiesta parte', async () => {
  const b = banco({ daScegliere: null });
  assert.equal(b.store.getRuntime('zai').endpointDaScegliere, undefined);
  await b.chiama();
  assert.equal(b.richieste.length, 1);
});

test('ZAI-S6 tornare all\'indirizzo di serie («Ripristina») rimette il blocco', () => {
  const b = banco();
  b.store.setRuntime('zai', { endpoint: PIANO });
  b.store.resetEndpoint('zai');
  assert.equal(b.store.getRuntime('zai').endpointDaScegliere, true);
  assert.equal(b.store.listPublic().find((r) => r.id === 'zai').endpointDaScegliere, true, 'anche la riga della lista lo porta, per la modale');
});

test('ZAI-S7 la prova d\'accesso non manda la chiave senza indirizzo scelto: non provabile, col codice e la frase tradotta', async () => {
  const b = banco();
  const probe = createProviderProbe({ leggiChiave: b.store.getKey, leggiRuntime: b.store.getRuntime, fetchImpl: () => assert.fail('nessuna rete') });
  const esito = await probe.prova('zai');
  assert.equal(esito.esito, 'non-provabile');
  assert.equal(esito.codice, 'PROVIDER_ENDPOINT_NOT_CHOSEN');
  assert.equal(esito.motivoChiave, 'server.probe.endpointNotChosen');
  await assert.rejects(probe.elencaModelli('zai'), (e) => e.code === 'PROVIDER_ENDPOINT_NOT_CHOSEN');
});

test('ZAI-S8 la destinazione: dopo la chiave, prima della rete; senza il segnale nessun blocco', () => {
  const runtime = { endpoint: SALDO, endpointConfigured: false, endpointDaScegliere: true };
  assert.throws(() => risolviDestinazioneModello('zai:glm-5.3-flash', { leggiChiave: () => 'k', leggiRuntime: () => runtime }), (e) => e.code === 'PROVIDER_ENDPOINT_NOT_CHOSEN');
  assert.throws(() => risolviDestinazioneModello('zai:glm-5.3-flash', { leggiChiave: () => '', leggiRuntime: () => runtime }), (e) => e.code === 'PROVIDER_KEY_MISSING');
  const libero = risolviDestinazioneModello('zai:glm-5.3-flash', { leggiChiave: () => 'k', leggiRuntime: () => ({ endpoint: SALDO }) });
  assert.ok(libero.url?.startsWith(SALDO) || libero.baseURL?.startsWith(SALDO));
});

test('ZAI-S9 il desktop accende tutte e due le regole, una riga ciascuna, in server.mjs', () => {
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.match(server, /\n\s*indirizzoDaScegliere: \['zai'\],/u);
  assert.match(server, /\n\s*zaiSoloIndirizzo: true,/u);
  assert.equal((server.match(/indirizzoDaScegliere/gu) ?? []).length, 1);
});

test('ZAI-S10 l’avviso «niente credito» nomina il piano nella lingua della persona (prima, in italiano: «su the GLM Coding Plan»)', async () => {
  const { impostaLingua } = await import('../frontend/src/components/lingua.js');
  const { testoDelServer } = await import('../frontend/src/components/testo-server.js');
  const richieste = [];
  const credito = () => new Response(JSON.stringify({ error: { code: '1113', message: 'Insufficient balance or no resource package. Please recharge.' } }), { status: 429, headers: { 'Content-Type': 'application/json' } });
  const store = createProviderCredentialStore({ env: { ZAI_API_KEY: CHIAVE }, keyring: custodia(), indirizzoDaScegliere: ['zai'] });
  store.setRuntime('zai', { endpoint: PIANO });
  const avvisi = [];
  const trasporto = creaFetchMultiProvider(async (url) => { richieste.push(String(url)); return credito(); }, { providerStore: store, zaiSoloIndirizzo: true,
    onAvviso: async (a) => { avvisi.push(a); }, dipendenze: { leggiChiave: (p) => store.getKey(p), leggiRuntime: (p) => store.getRuntime(p) } });
  await chiamaConRitenta({ modello: 'zai:glm-5.3-flash', chiave: 'unused', messaggi: [{ role: 'user', content: 'ciao' }], attrezzi: [], maxOutputTokens: 50,
    fetchDiRete: trasporto, dormi: async () => {}, caso: () => 0 }).catch(() => {});
  const avviso = avvisi.find((a) => a.testoChiave === 'server.runtime.notice.zaiNoCredit');
  assert.ok(avviso, `premise: the no-credit notice is told (${JSON.stringify(avvisi)})`);
  assert.equal(avviso.testoParams.onChiave, 'server.zai.address.coding');
  impostaLingua('it');
  try {
    assert.match(testoDelServer(avviso.testoChiave, avviso.testoParams, avviso.testo), /su il piano GLM Coding\. TALOS non ha provato/u);
    impostaLingua('en');
    assert.equal(testoDelServer(avviso.testoChiave, avviso.testoParams, avviso.testo), avviso.testo, 'in English the sentence is the server one');
  } finally { impostaLingua('it'); }
});
