import { risolviDestinazioneModello } from './model-destination.mjs';
import { nativeProviderResponse } from './native-provider-adapter.mjs';

function erroreApi(message, code) {
  return Object.assign(new Error(message), { code });
}

function mappaErroreDestinazione(errore) {
  if (errore?.code === 'PROVIDER_KEY_MISSING') {
    return erroreApi('Manca la credenziale del provider usato da questa chat. Collegala in Impostazioni → Provider, poi riprova.', 'PROVIDER_KEY_REQUIRED');
  }
  if (errore?.code === 'MODEL_DESTINATION_INVALID' || errore?.code === 'MODEL_DESTINATION_MISCONFIGURED') {
    return erroreApi('Il modello di questa chat non ha una destinazione valida.', 'PROVIDER_RUNTIME_UNAVAILABLE');
  }
  if (typeof errore?.code === 'string' && errore.code.startsWith('PROVIDER_')) {
    return erroreApi('Il provider di questa chat non è disponibile per la riscrittura.', 'PROVIDER_RUNTIME_UNAVAILABLE');
  }
  return errore;
}

/**
 * Invia Prompt Enhance allo stesso provider scelto dalla sessione.
 *
 * La rotta HTTP possiede sessione e contratto API; questo modulo possiede solo
 * l'instradamento del trasporto, riusando la stessa fonte di verità della chat.
 */
export async function chiediMiglioramentoAlProvider({ modello, messaggi, providerStore, fetchFn = globalThis.fetch } = {}) {
  if (typeof modello !== 'string' || modello.trim() === '') {
    throw erroreApi('Questa sessione non dichiara un modello.', 'SESSION_NOT_READY');
  }
  if (!providerStore || typeof providerStore.getKey !== 'function' || typeof providerStore.getRuntime !== 'function') {
    throw erroreApi('Il portachiavi dei provider non è configurato.', 'PROVIDER_STORE_UNAVAILABLE');
  }
  if (typeof fetchFn !== 'function') {
    throw erroreApi('Il trasporto del provider non è configurato.', 'PROVIDER_RUNTIME_UNAVAILABLE');
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
    throw erroreApi('Il provider di questa chat non è disponibile per la riscrittura.', 'PROVIDER_RUNTIME_UNAVAILABLE');
  }

  const body = {
    model: destinazione.modelloRemoto,
    messages: messaggi,
    stream: false,
    max_tokens: 2048,
  };

  let risposta;
  try {
    if (destinazione.native) {
      risposta = await nativeProviderResponse({
        provider: destinazione.fonte,
        model: destinazione.modelloRemoto,
        apiKey: destinazione.apiKey,
        baseURL: destinazione.baseURL,
        body,
        fetchFn,
      });
    } else {
      risposta = await fetchFn(destinazione.url, {
        method: 'POST',
        headers: { Accept: 'application/json', ...destinazione.headers },
        body: JSON.stringify(body),
      });
    }
  } catch {
    throw erroreApi('Il provider di questa chat non ha risposto.', 'PROVIDER_RUNTIME_UNAVAILABLE');
  }

  if (!risposta?.ok) {
    throw erroreApi(`Il provider di questa chat ha risposto ${risposta?.status ?? '?'}.`, 'PROVIDER_RUNTIME_UNAVAILABLE');
  }

  let letto;
  try { letto = await risposta.json(); } catch { letto = null; }
  const contenuto = typeof letto?.choices?.[0]?.message?.content === 'string' ? letto.choices[0].message.content : '';
  return {
    contenuto,
    modelloUsato: modello,
    fornitoreUsato: destinazione.fonte,
  };
}
