/**
 * ⭐ CATALOGO-MODELLI (owner 25/09/2026, «Portare la rotta dal desktop») — il catalogo vero di OpenRouter per il
 * selettore del modello del Codice. Prima il server del telefono non aveva `GET /api/v1/models` (404 misurato sul Pad)
 * e il selettore non poteva elencare niente.
 *
 * Portato da `AVM-harness-desktop/harness-ui/src/model-catalog.mjs` (letto il 25/09/2026, sola lettura), con due
 * differenze volute:
 * - niente catalogo di riserva: `provider-registry.mjs` sul telefono non c'è. Senza rete e senza copia salvata si
 *   risponde `CATALOG_UNREACHABLE` (503) e il selettore lo scrive («Catalogo non disponibile: …»), non un elenco finto;
 * - la lettura aspetta al massimo 10 s: il Codice (`apiGet` in `app.js`) rinuncia dopo 12 s, e il server deve
 *   rispondere col suo errore prima che la pagina dica soltanto «nessuna risposta».
 *
 * `GET https://openrouter.ai/api/v1/models` è pubblico: misurato il 25/09/2026 senza chiave, HTTP 200, 460 modelli,
 * 18 id con la tilde (alias «sempre l'ultima versione»). Nessuna chiave nella richiesta, come `reasoning-policy.mjs`.
 */

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const TTL_PREDEFINITO_MS = 10 * 60 * 1000; // non richiamare OpenRouter a ogni apertura del selettore
const TIMEOUT_PREDEFINITO_MS = 10_000;

export class ModelCatalogError extends Error {
  constructor(message, code = 'CATALOG_UNREACHABLE') {
    super(message);
    this.name = 'ModelCatalogError';
    this.code = code;
  }
}

function normalizza(modelloGrezzo) {
  const id = typeof modelloGrezzo?.id === 'string' ? modelloGrezzo.id : '';
  // La tilde (alias) resta nell'id, che è quello che viaggia nella chiamata; il fornitore si calcola senza, altrimenti
  // «deepseek» e «~deepseek» sarebbero due gruppi nel selettore.
  const alias = id.startsWith('~');
  const idSenzaAlias = alias ? id.slice(1) : id;
  const provider = idSenzaAlias.includes('/') ? idSenzaAlias.split('/')[0] : 'altro';
  const listaStringhe = (value) => Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.length <= 128).slice(0, 32)
    : [];
  const architecture = modelloGrezzo?.architecture && typeof modelloGrezzo.architecture === 'object'
    ? modelloGrezzo.architecture : {};
  const reasoningGrezzo = modelloGrezzo?.reasoning && typeof modelloGrezzo.reasoning === 'object'
    ? modelloGrezzo.reasoning : null;
  const reasoning = reasoningGrezzo ? {
    supportedEfforts: listaStringhe(reasoningGrezzo.supported_efforts),
    defaultEffort: typeof reasoningGrezzo.default_effort === 'string' && reasoningGrezzo.default_effort.length <= 128
      ? reasoningGrezzo.default_effort : null,
    defaultEnabled: typeof reasoningGrezzo.default_enabled === 'boolean' ? reasoningGrezzo.default_enabled : null,
    mandatory: reasoningGrezzo.mandatory === true,
  } : null;
  return {
    id,
    provider,
    alias,
    nome: typeof modelloGrezzo?.name === 'string' && modelloGrezzo.name ? modelloGrezzo.name : id,
    contextLength: Number.isFinite(modelloGrezzo?.context_length) ? modelloGrezzo.context_length : null,
    prezzoPrompt: modelloGrezzo?.pricing?.prompt ?? null,
    prezzoCompletion: modelloGrezzo?.pricing?.completion ?? null,
    inputModalities: listaStringhe(architecture.input_modalities),
    outputModalities: listaStringhe(architecture.output_modalities),
    supportedParameters: listaStringhe(modelloGrezzo?.supported_parameters),
    reasoning,
    description: typeof modelloGrezzo?.description === 'string' ? modelloGrezzo.description.slice(0, 2000) : '',
    createdAt: Number.isFinite(modelloGrezzo?.created) ? modelloGrezzo.created : null,
  };
}

/**
 * @param {{fetchFn?: typeof fetch, clock?: () => Date, ttlMs?: number, timeoutMs?: number, url?: string}} [opts]
 */
export function createModelCatalog({
  fetchFn = fetch, clock = () => new Date(), ttlMs = TTL_PREDEFINITO_MS, timeoutMs = TIMEOUT_PREDEFINITO_MS,
  url = OPENROUTER_MODELS_URL,
} = {}) {
  let cache = null; // { creatoAlle: number, modelli: Array }

  async function leggiDallaRete() {
    let risposta;
    try {
      risposta = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      // Un errore di rete non è «zero modelli»: il selettore deve poterli distinguere.
      throw new ModelCatalogError('Catalogo OpenRouter non raggiungibile.', 'CATALOG_UNREACHABLE');
    }
    if (!risposta.ok) {
      throw new ModelCatalogError(`Catalogo OpenRouter ha risposto ${risposta.status}`, 'CATALOG_UPSTREAM_ERROR');
    }
    let corpo;
    try {
      corpo = await risposta.json();
    } catch {
      throw new ModelCatalogError('Catalogo OpenRouter: risposta non valida', 'CATALOG_UPSTREAM_ERROR');
    }
    if (!Array.isArray(corpo?.data)) {
      throw new ModelCatalogError('Catalogo OpenRouter: formato inatteso', 'CATALOG_UPSTREAM_ERROR');
    }
    return corpo.data
      .map(normalizza)
      .filter((modello) => modello.id !== '')
      .sort((a, b) => a.provider.localeCompare(b.provider) || a.nome.localeCompare(b.nome));
  }

  /**
   * @param {{forzaAggiornamento?: boolean}} [opts]
   * @returns {Promise<{modelli: Array, daCache: boolean, aggiornatoAlle: string|null, fallbackRete?: boolean}>}
   */
  async function ottieni({ forzaAggiornamento = false } = {}) {
    const ora = clock().getTime();
    if (!forzaAggiornamento && cache && (ora - cache.creatoAlle) < ttlMs) {
      return { modelli: cache.modelli, daCache: true, aggiornatoAlle: new Date(cache.creatoAlle).toISOString() };
    }
    try {
      const modelli = await leggiDallaRete();
      cache = { creatoAlle: ora, modelli };
      return { modelli, daCache: false, aggiornatoAlle: new Date(ora).toISOString() };
    } catch (errore) {
      // La copia vera già letta vale più di un errore; senza copia, l'errore arriva al selettore così com'è.
      if (!cache) throw errore;
      return {
        modelli: structuredClone(cache.modelli), daCache: true, fallbackRete: true,
        aggiornatoAlle: new Date(cache.creatoAlle).toISOString(),
        motivo: 'Catalogo non raggiungibile: viene usata la copia salvata.',
      };
    }
  }

  return Object.freeze({ ottieni });
}
