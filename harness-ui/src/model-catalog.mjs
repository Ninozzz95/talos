/**
 * model-catalog.mjs — il catalogo VERO di OpenRouter, non 7 scorciatoie
 * scritte a mano. Owner, 27/8: "introdurre nella modale un picker per il
 * modello, dropdown stilizzato (l'abbiamo già fatto nel mobile)" — il
 * componente mobile (TalosMobileComposerModelPicker.vue) raggruppa i
 * modelli per provider e dice onestamente quando la scoperta È FALLITA
 * (non solo "zero risultati"). Stesso principio qui.
 *
 * ⛔ `GET https://openrouter.ai/api/v1/models` è pubblico — verificato
 * dal vivo il 27/8: 417 modelli, nessuna chiave richiesta per leggerlo
 * (l'autenticazione serve solo per CHIAMARE un modello, non per elencarli).
 * Formato risposta confermato: `{data: [{id, name, context_length,
 * pricing:{prompt, completion}, ...}]}` — `id` è già nel formato
 * `vendor/nome-modello` che talosHarness.mjs instrada.
 */

import { catalogoDiRiservaPer } from './provider-registry.mjs';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const TTL_PREDEFINITO_MS = 10 * 60 * 1000; // 10 minuti — non richiamare OpenRouter a ogni apertura del foglio.

export class ModelCatalogError extends Error {
  constructor(message, code = 'CATALOG_UNAVAILABLE') {
    super(message);
    this.name = 'ModelCatalogError';
    this.code = code;
  }
}

function normalizza(modelloGrezzo) {
  const id = typeof modelloGrezzo?.id === 'string' ? modelloGrezzo.id : '';
  // ⛔ 27/8, trovato dalla pipeline QA visiva: 12 dei 417 id reali hanno il
  // prefisso `~` (alias "sempre l'ultima versione", es.
  // `~deepseek/deepseek-v4-flash-latest`). Il PROVIDER va calcolato dopo
  // averlo tolto, altrimenti "deepseek" e "~deepseek" diventano due gruppi
  // diversi nel picker per lo stesso vendor. `id` resta INTATTO (con la
  // tilde) — è quello che viaggia nella chiamata vera.
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
 * @param {{fetchFn?: typeof fetch, clock?: () => Date, ttlMs?: number, url?: string}} [opts]
 */
export function createModelCatalog({
  fetchFn = fetch, clock = () => new Date(), ttlMs = TTL_PREDEFINITO_MS, url = OPENROUTER_MODELS_URL,
} = {}) {
  let cache = null; // { creatoAlle: number, modelli: Array }

  /**
   * @param {{forzaAggiornamento?: boolean}} [opts]
   * @returns {Promise<{modelli: Array, daCache: boolean, aggiornatoAlle: string|null}>}
   */
  async function ottieni({ forzaAggiornamento = false } = {}) {
    const ora = clock().getTime();
    if (!forzaAggiornamento && cache && (ora - cache.creatoAlle) < ttlMs) {
      return { modelli: cache.modelli, daCache: true, aggiornatoAlle: new Date(cache.creatoAlle).toISOString() };
    }

    try {
      let risposta;
      try {
        risposta = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
      } catch {
        // ⛔ un errore di rete non è "zero modelli": la UI deve poterli distinguere (stesso principio di discoveryProblems nel mobile).
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

      const modelli = corpo.data
        .map(normalizza)
        .filter((modello) => modello.id !== '')
        .sort((a, b) => a.provider.localeCompare(b.provider) || a.nome.localeCompare(b.nome));

      cache = { creatoAlle: ora, modelli };
      return { modelli, daCache: false, aggiornatoAlle: new Date(ora).toISOString() };
    } catch {
      // P-F: la copia reale ha precedenza; la riserva non entra mai nella cache del catalogo.
      if (cache) return { modelli: structuredClone(cache.modelli), daCache: true, fonte: 'openrouter',
        aggiornatoAlle: new Date(cache.creatoAlle).toISOString(),
        etaCacheMs: Math.max(0, clock().getTime() - cache.creatoAlle), fallbackRete: true,
        motivo: 'Catalogo non raggiungibile: viene usata la copia salvata.' };
      return catalogoDiRiservaPer('openrouter');
    }
  }

  return Object.freeze({ ottieni });
}
