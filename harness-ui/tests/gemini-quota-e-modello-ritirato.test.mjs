import assert from 'node:assert/strict';
import test from 'node:test';
import { leggiAttesaResetDalCorpo } from '../src/provider-retry.mjs';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { chiamaConRitenta } from '../src/kernel/talosHarness.mjs';
import { REGISTRO_FORNITORI } from '../src/provider-registry.mjs';

/*
 * 18/10/2026 — tre difetti di Gemini trovati misurando il ponte (banco C5, quarta corsa). I corpi qui sono quelli VERI del servizio,
 * presi lo stesso giorno con una chiave gratuita (solo la chiave e gli id di progetto tolti).
 */
const CORPO_429 = JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED',
  message: 'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 15, model: gemini-3.5-flash-lite\nPlease retry in 34.928045328s.',
  details: [
    { '@type': 'type.googleapis.com/google.rpc.Help', links: [{ description: 'Learn more about Gemini API quotas', url: 'https://ai.google.dev/gemini-api/docs/rate-limits' }] },
    { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests', quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier', quotaDimensions: { location: 'global', model: 'gemini-3.5-flash-lite' }, quotaValue: '15' }] },
    { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '34s' },
  ] } }, null, 2);
const CORPO_404 = JSON.stringify({ error: { code: 404, status: 'NOT_FOUND',
  message: 'This model models/gemini-2.5-flash-lite is no longer available to new users. Please update your code to use models/gemini-3.5-flash-lite for the latest features and improvements. We recommend you to use the Interactions API (https://ai.google.dev/gemini-api/docs/get-started).' } }, null, 2);

test('GEM-01 — l’attesa che Google dichiara nel corpo del 429 si legge: prima RetryInfo (34 s), poi la frase «retry in»', () => {
  assert.equal(leggiAttesaResetDalCorpo(CORPO_429), 34_000);
  assert.equal(leggiAttesaResetDalCorpo('Please retry in 34.928045328s.'), 34_928);
  // AL CONTRARIO: un testo senza attesa non ne inventa una
  assert.equal(leggiAttesaResetDalCorpo('You exceeded your current quota, please check your plan and billing details.'), null);
});

test('GEM-02 — il modello di riserva e l’ausiliario di Gemini non sono più il 2.5 Flash-Lite, chiuso agli account nuovi', () => {
  const g = REGISTRO_FORNITORI.gemini;
  assert.equal(g.modelloAusiliario, 'gemini-3.5-flash-lite');
  assert.equal(g.modelliDiRiserva.some((m) => m.id === 'gemini-2.5-flash-lite'), false);
  assert.equal(g.modelliDiRiserva.some((m) => m.id === 'gemini-3.5-flash-lite'), true);
});

/* Il motore VERO (multi-fornitore + kernel) con una rete finta che risponde coi corpi di Google. */
function banco(rispondi) {
  const richieste = [];
  const rete = async (url) => { richieste.push(String(url)); return rispondi(richieste.length); };
  const custodia = new Map([['talos-harness-providers:gemini', JSON.stringify({ key: 'AIza-FINTA' })]]);
  const store = createProviderCredentialStore({ env: { GEMINI_API_KEY: 'AIza-FINTA' },
    keyring: { get: (s, k) => custodia.get(`${s}:${k}`) ?? null, set: (s, k, v) => { custodia.set(`${s}:${k}`, v); return true; }, remove: () => true } });
  const dipendenze = { leggiChiave: (p) => { try { return store.getKey(p); } catch { return null; } }, leggiRuntime: (p) => { try { return store.getRuntime(p); } catch { return {}; } } };
  const trasporto = creaFetchMultiProvider(rete, { providerStore: store, dipendenze });
  const attese = [];
  const run = () => chiamaConRitenta({ modello: 'gemini:gemini-3.5-flash-lite', chiave: 'unused', messaggi: [{ role: 'user', content: 'hi' }], attrezzi: [],
    maxOutputTokens: 5, fetchDiRete: trasporto, dormi: async (ms) => { attese.push(ms); }, caso: () => 0 });
  return { richieste, attese, run };
}
const json = (corpo, stato) => new Response(corpo, { status: stato, headers: { 'content-type': 'application/json' } });
const ok = () => json(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'Ciao.' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } }), 200);

test('GEM-03 — la quota gratuita al minuto è TRAFFICO: il giro aspetta i 34 s che Google dice e poi riesce; mai «credito finito»', async () => {
  const b = banco((n) => (n === 1 ? json(CORPO_429, 429) : ok()));
  const esito = await b.run();
  assert.match(JSON.stringify(esito), /Ciao\./u);
  assert.equal(b.richieste.length, 2, 'the same request is sent again after the wait');
  assert.ok(b.attese.some((ms) => ms >= 34_000 && ms < 40_000), `waited what Google said: ${JSON.stringify(b.attese)}`);
});

test('GEM-04 — un modello ritirato ha il suo codice (PROVIDER_MODEL_UNAVAILABLE), non si ritenta, e non è la frase generica', async () => {
  const b = banco(() => json(CORPO_404, 404));
  await assert.rejects(b.run(), (e) => {
    const code = e.code ?? e.cause?.code;
    assert.equal(code, 'PROVIDER_MODEL_UNAVAILABLE', `${code}: ${e.message}`);
    assert.doesNotMatch(String(e.message), /did not accept the request/u);
    return true;
  });
  assert.equal(b.richieste.length, 1, 'a retired model is not asked again');
});

test('GEM-05 AL CONTRARIO — un 404 qualunque resta il rifiuto generico, e un 429 senza i segni di Google non cambia classe da qui', async () => {
  const b = banco(() => json(JSON.stringify({ error: { code: 404, message: 'Requested entity was not found.', status: 'NOT_FOUND' } }), 404));
  await assert.rejects(b.run(), (e) => (e.code ?? e.cause?.code) === 'PROVIDER_REQUEST_ERROR');
});

test('GEM-06 — se la quota non torna in tempo il giro si ferma come TRAFFICO, mai come «Credit not available» (la frase vista dal banco)', async () => {
  const b = banco(() => json(CORPO_429, 429));
  await assert.rejects(b.run(), (e) => {
    const classe = e.classe ?? e.cause?.classe;
    assert.equal(classe, 'traffico', `${classe}: ${e.message}`);
    assert.doesNotMatch(String(e.message), /Credit not available/u);
    return true;
  });
});
