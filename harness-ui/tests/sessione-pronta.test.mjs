import test from 'node:test';
import assert from 'node:assert/strict';
import { creaProntoFn } from '../src/sessione-pronta.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';

/*
 * CLI-REQ-05, punto 1 — «pronto» vuol dire UNA CHIAVE UTILIZZABILE ADESSO.
 * Difetto trovato dalla corsia della CLI dopo la fusione (`ba420a95`) e riprodotto il 17/09/2026 con lo store vero:
 * una chiave in PANCHINA dava `hasKey → true` e `getKey → null`, e la regola (che per i fornitori diversi da
 * OpenRouter usava `hasKey`) rispondeva «pronto». Tutte le prove qui usano lo STORE VERO con chiavi finte: una finta
 * dello store deciderebbe da sé l'esito, ed è l'errore che ha fatto bocciare D3 lo stesso giorno.
 */
const CHIAVE = 'chiave-finta-0123456789abcdef';
const ADESSO = 1_789_000_000_000;

function storeCon(env) { return createProviderCredentialStore({ env }); }
function inPanchina(store, provider, classe) {
  const scelta = store.scegliChiave(provider);
  store.mettiInPanchina(provider, scelta.impronta, { classe });
}

test('PRONTA-01 — una chiave utilizzabile: pronto, col nome umano e SENZA codice d\'errore', () => {
  const pronto = creaProntoFn({ providerStore: storeCon({ DEEPSEEK_API_KEY: CHIAVE }) });
  assert.deepEqual(pronto('deepseek:deepseek-chat'), { pronto: true, fornitore: 'DeepSeek' });
});

test('⛔ PRONTA-02 — l\'UNICA chiave è in panchina: NON è pronto, e non dice «manca la chiave»', () => {
  const store = storeCon({ DEEPSEEK_API_KEY: CHIAVE });
  inPanchina(store, 'deepseek', 'credenziale');
  assert.equal(store.hasKey('deepseek'), true, 'premessa: lo store la CONTA ancora — è questo che ingannava la regola');
  assert.equal(store.getKey('deepseek'), null, 'premessa: ma non la dà a chi deve usarla');
  const esito = creaProntoFn({ providerStore: store })('deepseek:deepseek-chat');
  assert.equal(esito.pronto, false);
  assert.equal(esito.codice, 'CONFIG_INVALID');
  assert.equal(esito.fornitore, 'DeepSeek');
  assert.match(esito.messaggio, /is paused/u, 'la chiave C\'È: dire «manca» manderebbe la persona a incollarne una che ha già');
  assert.match(esito.messaggio, /provider rejected it/u, 'la causa, in parole umane');
  assert.match(esito.messaggio, /in about \d+ (min|hours)/u, 'e fino a quando');
  assert.doesNotMatch(esito.messaggio, /credenziale|inPanchina|CONFIG|impronta/u, 'mai la classe tecnica a schermo');
  assert.doesNotMatch(esito.messaggio, new RegExp(CHIAVE, 'u'), 'mai il segreto');
});

test('PRONTA-03 — la causa cambia la frase: il traffico si dice col suo nome; ⛔ BUG-25: il credito a chiave unica NON panchina più (errore onesto, chiave utilizzabile)', () => {
  const store = storeCon({ DEEPSEEK_API_KEY: CHIAVE });
  inPanchina(store, 'deepseek', 'traffico');
  const esito = creaProntoFn({ providerStore: store })('deepseek:deepseek-chat');
  assert.equal(esito.pronto, false);
  assert.match(esito.messaggio, /heavy traffic/u, 'K4b: la frase del server è inglese (la chiave la traduce)');
});

test('PRONTA-03-bis — ⛔ BUG-25: senza scadenza dichiarata il credito NON panchina la chiave unica: la sessione è PRONTA', () => {
  const store = storeCon({ DEEPSEEK_API_KEY: CHIAVE });
  inPanchina(store, 'deepseek', 'credito');
  assert.equal(store.elencaPool('deepseek')[0].stato, 'disponibile',
    'il credito esaurito non invalida una chiave: l\'errore si ripete onesto a ogni richiesta');
  assert.equal(creaProntoFn({ providerStore: store })('deepseek:deepseek-chat').pronto, true);
});

test('PRONTA-04 — al contrario: nessuna chiave affatto dice «Manca la chiave», e nomina il fornitore', () => {
  const esito = creaProntoFn({ providerStore: storeCon({}) })('openai:gpt-5');
  assert.equal(esito.pronto, false);
  assert.match(esito.messaggio, /^The OpenAI key is missing/u);
  assert.doesNotMatch(esito.messaggio, /OPENROUTER_API_KEY/u, 'mai una variabile d\'ambiente a schermo');
});

test('PRONTA-05 — OpenRouter: la stessa regola, più la chiave d\'avvio; in panchina NON è pronto nemmeno lui', () => {
  assert.equal(creaProntoFn({ providerStore: storeCon({}), chiaveApi: CHIAVE })('z-ai/glm-5.3-flash').pronto, true, 'la chiave d\'avvio vale per OpenRouter');
  assert.equal(creaProntoFn({ providerStore: storeCon({}), chiaveApi: CHIAVE })('deepseek:deepseek-chat').pronto, false, 'e SOLO per OpenRouter');
  const store = storeCon({ OPENROUTER_API_KEY: CHIAVE });
  inPanchina(store, 'openrouter', 'traffico');
  const esito = creaProntoFn({ providerStore: store })('z-ai/glm-5.3-flash');
  assert.equal(esito.pronto, false);
  assert.match(esito.messaggio, /OpenRouter.*is paused/u);
});

test('PRONTA-06 — modello vuoto o illeggibile: mai «pronto» (falliva aperto il 17/09)', () => {
  const pronto = creaProntoFn({ providerStore: storeCon({ DEEPSEEK_API_KEY: CHIAVE }) });
  for (const storto of ['', '   ', null, undefined, 0, {}]) {
    const esito = pronto(storto);
    assert.equal(esito.pronto, false, String(storto));
    assert.match(esito.messaggio, /Choose a model/u);
  }
});

test('PRONTA-07 — un fornitore che non vuole chiave è pronto per costruzione', () => {
  assert.equal(creaProntoFn({ providerStore: storeCon({}) })('local:qualcosa.gguf').pronto, true);
});

test('PRONTA-08 — il tempo alla ripresa viene dall\'orologio iniettato, non da quello di sistema', () => {
  const finto = { getKey: () => null, elencaPool: () => [{ causa: 'traffico', inPanchinaFino: ADESSO + 5 * 60_000 }, { causa: 'credenziale', inPanchinaFino: ADESSO + 3 * 3_600_000 }] };
  const esito = creaProntoFn({ providerStore: finto, adessoFn: () => ADESSO })('deepseek:deepseek-chat');
  assert.match(esito.messaggio, /^The 2 DeepSeek keys are paused: the provider asked to wait because of heavy traffic\. It will retry automatically in about 5 min/u, 'si annuncia la PRIMA che torna');
  const scaduta = { getKey: () => null, elencaPool: () => [{ causa: 'traffico', inPanchinaFino: ADESSO - 1 }] };
  assert.match(creaProntoFn({ providerStore: scaduta, adessoFn: () => ADESSO })('deepseek:deepseek-chat').messaggio, /^The DeepSeek key is missing/u, 'una panchina già scaduta non è una panchina');
});
