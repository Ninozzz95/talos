import { risolviDestinazioneModello } from './model-destination.mjs';
import { nativeProviderResponse } from './native-provider-adapter.mjs';
import { creaFetchDelPiano, erroreDelPiano } from './chatgpt-richiesta.mjs';

function erroreApi(message, code) {
  return Object.assign(new Error(message), { code });
}

function mappaErroreDestinazione(errore) {
  if (errore?.code === 'PROVIDER_KEY_MISSING') {
    return erroreApi('The credential for the provider used by this chat is missing. Connect it in Settings → Providers, then try again.', 'PROVIDER_KEY_REQUIRED');
  }
  if (errore?.code === 'PROVIDER_ENDPOINT_NOT_CHOSEN') { // owner 14/10/2026
    return erroreApi('Choose where the key of this chat\'s provider goes, in Settings → Providers → Configure, then try again.', 'PROVIDER_ENDPOINT_NOT_CHOSEN');
  }
  if (errore?.code === 'MODEL_DESTINATION_INVALID' || errore?.code === 'MODEL_DESTINATION_MISCONFIGURED') {
    return erroreApi('This chat\'s model has no valid destination.', 'PROVIDER_RUNTIME_UNAVAILABLE');
  }
  if (typeof errore?.code === 'string' && errore.code.startsWith('PROVIDER_')) {
    return erroreApi('This chat\'s provider is not available for rewriting.', 'PROVIDER_RUNTIME_UNAVAILABLE');
  }
  return errore;
}

/**
 * Invia Prompt Enhance allo stesso provider scelto dalla sessione.
 *
 * La rotta HTTP possiede sessione e contratto API; questo modulo possiede solo
 * l'instradamento del trasporto, riusando la stessa fonte di verità della chat.
 */
/*
 * /goal G2c (14/10/2026) — `maxTokens` e `reasoning` per chi non è «migliora il prompt» (la proposta dei criteri): di serie
 * restano 2048 e nessun ragionamento, cioè la richiesta di sempre. `reasoning` va SOLO a OpenRouter, già adattato al catalogo
 * dal chiamante (`normalizzaReasoningPerModello`): un fornitore diretto o il piano ChatGPT non conoscono quel campo.
 */
export async function chiediMiglioramentoAlProvider({ modello, messaggi, providerStore, fetchFn = globalThis.fetch, leggiTokenDelPiano = null, registraUsoDelPiano = null, maxTokens = 2048, reasoning = null } = {}) {
  if (typeof modello !== 'string' || modello.trim() === '') {
    throw erroreApi('This session does not declare a model.', 'SESSION_NOT_READY');
  }
  if (!providerStore || typeof providerStore.getKey !== 'function' || typeof providerStore.getRuntime !== 'function') {
    throw erroreApi('The provider keychain is not configured.', 'PROVIDER_STORE_UNAVAILABLE');
  }
  if (typeof fetchFn !== 'function') {
    throw erroreApi('The provider transport is not configured.', 'PROVIDER_RUNTIME_UNAVAILABLE');
  }

  let destinazione;
  try {
    destinazione = risolviDestinazioneModello(modello, {
      leggiChiave: (provider) => providerStore.getKey(provider),
      leggiRuntime: (provider) => providerStore.getRuntime(provider),
      localePronto: () => false,
    });
  } catch (errore) {
    throw mappaErroreDestinazione(errore);
  }

  if (destinazione.locale || destinazione.esterno) {
    throw erroreApi('This chat\'s provider is not available for rewriting.', 'PROVIDER_RUNTIME_UNAVAILABLE');
  }

  const body = {
    model: destinazione.modelloRemoto,
    messages: messaggi,
    stream: false,
    max_tokens: maxTokens,
    ...(reasoning && destinazione.fonte === 'openrouter' ? { reasoning } : {}), // il piano ChatGPT ha fonte `chatgpt`: non lo riceve
  };

  /*
   * 11/10/2026 — una sessione col piano ChatGPT (owner: «tutto quello che è già disponibile deve funzionare quando collegato con il
   *   piano»). Stessa regola del trasporto dei giri (`runtime-owner-adapter.mjs`): il token del piano si prende ADESSO, la richiesta
   *   passa dal filtro che la rende conforme (`creaFetchDelPiano`: niente `max_output_tokens`, `store:false`, `stream:true`,
   *   istruzioni al posto dei messaggi di sistema), e senza il canale del token non parte niente — mai la chiave API al suo posto.
   *   Gli errori del piano escono col LORO codice (`CHATGPT_…`), non come un «non ha risposto» generico.
   */
  let apiKeyNativa = destinazione.apiKey;
  let fetchNativa = fetchFn;
  if (destinazione.tokenDelPiano) {
    if (typeof leggiTokenDelPiano !== 'function') throw erroreApi('No ChatGPT account is connected.', 'CHATGPT_NON_COLLEGATO');
    apiKeyNativa = await leggiTokenDelPiano(destinazione.fonte);
    fetchNativa = creaFetchDelPiano(fetchFn);
  }

  let risposta;
  try {
    if (destinazione.native) {
      risposta = await nativeProviderResponse({
        provider: destinazione.fonte,
        model: destinazione.modelloRemoto,
        apiKey: apiKeyNativa,
        baseURL: destinazione.baseURL,
        body,
        fetchFn: fetchNativa,
      });
    } else {
      risposta = await fetchFn(destinazione.url, {
        method: 'POST',
        headers: { Accept: 'application/json', ...destinazione.headers },
        body: JSON.stringify(body),
      });
    }
  } catch (guasto) {
    if (destinazione.tokenDelPiano) throw erroreDelPiano(guasto);
    throw erroreApi('This chat\'s provider did not answer.', 'PROVIDER_RUNTIME_UNAVAILABLE');
  }

  if (!risposta?.ok) {
    throw erroreApi(`This chat's provider answered ${risposta?.status ?? '?'}.`, 'PROVIDER_RUNTIME_UNAVAILABLE');
  }

  let letto;
  try { letto = await risposta.json(); } catch { letto = null; }
  const contenuto = typeof letto?.choices?.[0]?.message?.content === 'string' ? letto.choices[0].message.content : '';
  // anche questa è una richiesta fatta col piano: entra nel conteggio nostro (un guasto del registro non tocca il risultato)
  if (destinazione.tokenDelPiano && typeof registraUsoDelPiano === 'function') { try { await registraUsoDelPiano({ esito: 'completato', usage: letto?.usage ?? null }); } catch { /* è un di più */ } }
  return {
    contenuto,
    modelloUsato: modello,
    fornitoreUsato: destinazione.fonte,
  };
}
