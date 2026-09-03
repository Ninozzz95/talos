import assert from 'node:assert/strict';
import test from 'node:test';

import { risolviDestinazioneModello, separaFonteModello, ModelDestinationError } from '../src/model-destination.mjs';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';

/*
 * ⭐⭐⭐ 03/9 — «far girare davvero i modelli di diversi provider».
 *
 * Owner: «non è un limite quello che mi hai detto tu, è un finto limite… se
 * non riesco ad aggiungere più provider oltre a OpenRouter e soprattutto usare
 * i modelli locali, l'applicazione è spacciata».
 *
 * Misurato prima di scrivere: UNA sola chiamata cablata per kernel (riga 406
 * nella copia che il desktop carica, 392 in quella mobile), e cinque
 * credenziali già funzionanti sulla macchina dell'owner.
 */

const DEPS = {
  leggiChiave: (fonte) => ({ openai: 'k-openai', deepseek: 'k-deepseek', openrouter: 'k-or' })[fonte] ?? null,
  leggiRuntime: (fonte) => ({
    openai: { endpoint: 'https://api.openai.com/v1' },
    deepseek: { endpoint: 'https://api.deepseek.com' },
    ollama: { endpoint: 'http://127.0.0.1:11434' },
    openrouter: { endpoint: 'https://openrouter.ai/api/v1' },
  })[fonte] ?? {},
  localePronto: () => true,
  /*
   * ⛔ Il ponte del supervisore, non un URL: llama-server parte con
   * `--api-key randomBytes(32)` e quella chiave vive solo nel supervisore.
   * Misurato costruendo l'URL a mano: HTTP 401 «Invalid API Key» in 4 ms.
   */
  chiamaLocale: async (percorso, opzioni) => ({ ok: true, status: 200, __locale: { percorso, opzioni } }),
};

test('MODEL-DEST-01 — senza prefisso resta OpenRouter, e nessun id esistente cambia', async () => {
  /*
   * ⛔ È la garanzia che rende questa modifica sicura: ogni sessione salvata
   * usa id come `deepseek/deepseek-v4-flash`, senza prefisso. Se cambiassero
   * destinazione, l'intero storico smetterebbe di funzionare.
   */
  assert.deepEqual(separaFonteModello('deepseek/deepseek-v4-flash'), { fonte: 'openrouter', modelloRemoto: 'deepseek/deepseek-v4-flash' });
  assert.deepEqual(separaFonteModello('anthropic/claude-sonnet-5'), { fonte: 'openrouter', modelloRemoto: 'anthropic/claude-sonnet-5' });
});

test('MODEL-DEST-02 — il prefisso di fonte instrada, e il provider non vede la nostra convenzione', async () => {
  const locale = risolviDestinazioneModello('local:qwen3-0.6b-q2-k', DEPS);
  assert.equal(locale.locale, true);
  assert.equal(locale.percorso, '/v1/chat/completions');
  assert.equal(locale.modelloRemoto, 'qwen3-0.6b-q2-k', 'il prefisso non deve uscire verso il provider');

  const openai = risolviDestinazioneModello('openai:gpt-5.6', DEPS);
  assert.equal(openai.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(openai.headers.Authorization, 'Bearer k-openai');

  // ⛔ Ollama espone il protocollo OpenAI sotto /v1; il suo indirizzo base no.
  const ollama = risolviDestinazioneModello('ollama:llama3.2', DEPS);
  assert.equal(ollama.url, 'http://127.0.0.1:11434/v1/chat/completions');
});

test('MODEL-DEST-03 — il risolutore NON tocca la chiave del motore locale', async () => {
  /*
   * ⛔⛔ Misurato, non dedotto: la prima stesura costruiva l'URL a mano senza
   * credenziali («127.0.0.1 non ha autenticazione») e il runtime vero ha
   * risposto HTTP 401 «Invalid API Key» in 4 ms. La chiave è generata
   * dal supervisore a ogni avvio e non esce da lì — `status()` non la espone,
   * perché quella risposta arriva al browser.
   * ⇒ Il risolutore non deve nemmeno vederla: dice solo «è locale».
   */
  const locale = risolviDestinazioneModello('local:x', DEPS);
  assert.equal(locale.url, undefined, 'nessun URL costruito a mano');
  assert.equal(locale.headers, undefined, 'nessuna intestazione, quindi nessun segreto copiato');
});

test('MODEL-DEST-04 — AL CONTRARIO: motore locale spento ⇒ si dice, non si tira a indovinare la porta', async () => {
  /*
   * ⛔ llama-server nasce su una porta scelta all'avvio (53600 nell'ultima
   * corsa vera). Un `localhost:8080` sperato darebbe un errore di rete che
   * sembra un guasto, invece di dire la cosa vera: il motore non è acceso.
   */
  assert.throws(
    () => risolviDestinazioneModello('local:x', { ...DEPS, localePronto: () => false }),
    (e) => e instanceof ModelDestinationError && e.code === 'LOCAL_RUNTIME_NOT_READY' && /Laboratorio modelli/u.test(e.message),
  );
});

test('MODEL-DEST-05 — AL CONTRARIO: chiave mancante si dichiara PRIMA di chiamare', async () => {
  // Partire e prendersi un 401 farebbe sembrare rotta una chiave che non c'è.
  assert.throws(
    () => risolviDestinazioneModello('openai:gpt-5.6', { ...DEPS, leggiChiave: () => null }),
    (e) => e.code === 'PROVIDER_KEY_MISSING' && /Provider/u.test(e.message),
  );
});

test('MODEL-DEST-06 — Anthropic e Gemini vengono RIFIUTATI con il motivo vero', async () => {
  /*
   * ⛔ Non parlano il protocollo OpenAI. Instradarli lì darebbe un 404 che
   * sembra una credenziale sbagliata, e manderebbe a rigenerare una chiave
   * buona — misurata funzionante il 03/9 (Anthropic 11 modelli, Gemini 50).
   */
  for (const fonte of ['anthropic', 'gemini']) {
    assert.throws(
      () => risolviDestinazioneModello(`${fonte}:un-modello`, DEPS),
      (e) => e.code === 'MODEL_PROVIDER_NOT_SUPPORTED_YET' && /non è ancora scritta/u.test(e.message),
      `${fonte} dovrebbe essere rifiutato dichiarando che manca la traduzione`,
    );
  }
});

test('MODEL-DEST-07 — un `:` che non è una fonte nota non dirotta niente', async () => {
  assert.deepEqual(separaFonteModello('qualcosa:altro'), { fonte: 'openrouter', modelloRemoto: 'qualcosa:altro' });
});

/* ═════════════ l'involucro sul trasporto ═════════════ */

function fetchSpia() {
  const chiamate = [];
  const fn = async (url, opzioni) => { chiamate.push({ url, opzioni }); return { ok: true, status: 200 }; };
  return { fn, chiamate };
}

test('FETCH-MULTIPROVIDER-01 — senza dipendenze non tocca NIENTE (byte per byte)', async () => {
  // ⛔ Chi non passa le dipendenze deve avere il comportamento di sempre: è la
  // garanzia che questa aggiunta non possa rompere installazioni esistenti.
  const spia = fetchSpia();
  const avvolta = creaFetchMultiProvider(spia.fn, { dipendenze: null });
  assert.equal(avvolta, spia.fn);
});

test('FETCH-MULTIPROVIDER-02 — un modello OpenRouter passa senza essere toccato', async () => {
  const spia = fetchSpia();
  const avvolta = creaFetchMultiProvider(spia.fn, { dipendenze: DEPS });
  const corpo = JSON.stringify({ model: 'deepseek/deepseek-v4-flash', messages: [] });
  await avvolta('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: corpo, headers: { Authorization: 'Bearer k-or' } });
  assert.equal(spia.chiamate[0].url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(spia.chiamate[0].opzioni.body, corpo, 'il corpo non deve essere nemmeno riserializzato');
});

test('FETCH-MULTIPROVIDER-03 — un modello locale viene dirottato, col nome pulito', async () => {
  const spia = fetchSpia();
  const avvolta = creaFetchMultiProvider(spia.fn, { dipendenze: DEPS });
  const esito = await avvolta('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({ model: 'local:qwen3-0.6b', messages: [{ role: 'user', content: 'ciao' }], tools: [] }),
    headers: { Authorization: 'Bearer k-or' },
  });
  assert.equal(spia.chiamate.length, 0, 'il locale NON passa dalla fetch di rete: passa dal supervisore');
  assert.equal(esito.__locale.percorso, '/v1/chat/completions');
  const corpo = JSON.parse(esito.__locale.opzioni.body);
  assert.equal(corpo.model, 'qwen3-0.6b');
  assert.deepEqual(corpo.messages, [{ role: 'user', content: 'ciao' }], 'il resto del corpo resta intatto');
  assert.equal(esito.__locale.opzioni.headers.Authorization, undefined, 'la chiave OpenRouter non deve seguire il modello locale');
});

test('FETCH-MULTIPROVIDER-04 — AL CONTRARIO: non dirotta ciò che non è un completamento', async () => {
  /*
   * ⛔ Il kernel usa la STESSA fetch per la ricerca web e per gli attrezzi.
   * Dirottare quelle sarebbe un guasto silenzioso, e il più difficile da
   * ricondurre a questa modifica.
   */
  const spia = fetchSpia();
  const avvolta = creaFetchMultiProvider(spia.fn, { dipendenze: DEPS });
  await avvolta('https://api.tavily.com/search', { method: 'POST', body: JSON.stringify({ model: 'local:x', query: 'q' }) });
  assert.equal(spia.chiamate[0].url, 'https://api.tavily.com/search');
  await avvolta('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: 'non-json' });
  assert.equal(spia.chiamate[1].url, 'https://openrouter.ai/api/v1/chat/completions');
});

test('FETCH-MULTIPROVIDER-05 — AL CONTRARIO: una fonte impossibile ferma la richiesta, non la spedisce', async () => {
  const spia = fetchSpia();
  const avvolta = creaFetchMultiProvider(spia.fn, { dipendenze: { ...DEPS, localePronto: () => false } });
  await assert.rejects(
    () => avvolta('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'local:x', messages: [] }) }),
    (e) => e.code === 'LOCAL_RUNTIME_NOT_READY',
  );
  assert.equal(spia.chiamate.length, 0, 'nessuna richiesta deve partire verso una destinazione non servibile');
});

test('MODEL-DEST-08 — il VALIDATORE degli id accetta il prefisso di fonte, e continua a respingere il resto', async () => {
  /*
   * ⛔⛔ IL SECONDO CANCELLO, trovato provando e non leggendo: la convenzione
   * `local:…` veniva respinta con 400 su /api/v1/sessions PRIMA di arrivare
   * al kernel o all'instradamento — `FORMATO_MODELLO_RICHIESTA` pretende
   * `autore/nome` perché nasce dagli id OpenRouter, e un modello locale non
   * ha un autore. Una cura senza questa riga sarebbe stata invisibile.
   */
  const { modelloRichiestaValido } = await import('../src/config.mjs');
  for (const id of ['deepseek/deepseek-v4-flash', '~anthropic/claude-sonnet-latest', 'anthropic/claude-sonnet-5:beta', 'local:qwen3-0.6b-q2-k-16d75108d73a', 'ollama:llama3.2', 'openai:gpt-5.6']) {
    assert.equal(modelloRichiestaValido(id), true, `avrebbe dovuto accettare ${id}`);
  }
  // ⛔ AL CONTRARIO: il cancello serve ancora a qualcosa.
  // ⛔ 'qwen3-0.6b' nudo resta INVALIDO: senza prefisso il contratto e' quello di prima.
  for (const id of ['', 'qwen3-0.6b', 'ha spazi/dentro', '../../etc/passwd', 'a/b/c']) {
    assert.equal(modelloRichiestaValido(id), false, `avrebbe dovuto respingere ${JSON.stringify(id)}`);
  }
});
