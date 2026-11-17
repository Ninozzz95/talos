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
/* Il tetto ai tentativi (giudice v1559, 11/11/2026): dopo un fallimento una ripetizione a 30 s, poi al più una ogni 10 minuti.
   PRIVACY.md, le novità e la riga delle Impostazioni dicono questi due numeri (prova C11). */
export const RIPETIZIONE_DOPO_FALLIMENTO_MS = 30 * 1000;
export const ATTESA_DOPO_FALLIMENTI_MS = 10 * 60 * 1000;

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
 * @param {{fetchFn?: typeof fetch, clock?: () => Date, ttlMs?: number, url?: string, consentitoFn?: () => boolean}} [opts]
 *   `consentitoFn` (0.2.2, `catalogo-pubblico.mjs`): letto a OGNI richiesta; `false` ⇒ nessuna richiesta a openrouter.ai, si serve
 *   la copia già letta o il catalogo incorporato, con `catalogoPubblicoSpento: true`.
 */
export function createModelCatalog({
  fetchFn = fetch, clock = () => new Date(), ttlMs = TTL_PREDEFINITO_MS, url = OPENROUTER_MODELS_URL, consentitoFn = () => true,
  ripetizioneMs = RIPETIZIONE_DOPO_FALLIMENTO_MS, attesaDopoFallimentiMs = ATTESA_DOPO_FALLIMENTI_MS,
} = {}) {
  let cache = null; // { creatoAlle: number, modelli: Array }
  let inVolo = null; // la lettura in corso, condivisa da chi chiede insieme
  let prossimoTentativoAlle = 0; // dopo un fallimento, prima di quest'ora niente rete
  let ripetizioneUsata = false; // la ripetizione a 30 s vale una volta per serie di fallimenti

  /**
   * @param {{forzaAggiornamento?: boolean}} [opts]
   * @returns {Promise<{modelli: Array, daCache: boolean, aggiornatoAlle: string|null}>}
   */
  async function ottieni({ forzaAggiornamento = false } = {}) {
    const ora = clock().getTime();
    /* 0.2.2 (SignPath): spento ⇒ la rete non si tocca, nemmeno con «aggiorna»; prima la copia vera se c'è, poi l'incorporato */
    let consentito = true;
    try { consentito = consentitoFn() !== false; } catch { consentito = false; } // un dubbio non apre la rete
    if (!consentito) {
      if (cache) return { modelli: structuredClone(cache.modelli), daCache: true, fonte: 'openrouter', aggiornatoAlle: new Date(cache.creatoAlle).toISOString(),
        etaCacheMs: Math.max(0, ora - cache.creatoAlle), catalogoPubblicoSpento: true };
      const riserva = catalogoDiRiservaPer('openrouter');
      if (!riserva) return riserva;
      /* ogni voce lo dice anche lei: il selettore scrive «catalogo pubblico spento», non «non raggiungibile» (`fonti-modelli.js`) */
      const segna = (m) => ({ ...m, catalogo: { ...m.catalogo, catalogoPubblicoSpento: true } });
      return { ...riserva, modelli: riserva.modelli.map(segna), modelliDiRiserva: riserva.modelliDiRiserva.map(segna), catalogoPubblicoSpento: true };
    }
    if (!forzaAggiornamento && cache && (ora - cache.creatoAlle) < ttlMs) {
      return { modelli: cache.modelli, daCache: true, aggiornatoAlle: new Date(cache.creatoAlle).toISOString() };
    }
    /* ⛔ IL TETTO AI TENTATIVI (revisore unico, ripasso 11/11/2026 22:01; giudice v1559). Prima una lettura fallita non lasciava
       traccia e ogni schermata che chiedeva l'elenco ne faceva partire un'altra (20 in 10 minuti col server vero e la rete che
       rifiuta). Ora: le richieste che arrivano insieme aspettano la stessa lettura in volo; dopo un fallimento, prima della prossima
       ora buona (30 s la prima volta, poi 10 minuti) si serve la copia o l'elenco incorporato senza toccare la rete, «aggiorna»
       compreso. Come `compaction-window-source.mjs:49` (attesa dopo un fallimento) e `model-catalog-models-dev.mjs:16` (`RINVIO_MS`). */
    if (inVolo) return inVolo;
    if (ora < prossimoTentativoAlle) return ripiego();
    inVolo = leggi(ora).finally(() => { inVolo = null; });
    return inVolo;
  }

  /** Dopo un fallimento: la copia vera se c'è (P-F: ha precedenza), altrimenti l'elenco incorporato; la riserva non entra in cache. */
  function ripiego() {
    if (cache) return { modelli: structuredClone(cache.modelli), daCache: true, fonte: 'openrouter',
      aggiornatoAlle: new Date(cache.creatoAlle).toISOString(),
      etaCacheMs: Math.max(0, clock().getTime() - cache.creatoAlle), fallbackRete: true,
      motivo: 'Catalog unreachable: the saved copy is used.' };
    return catalogoDiRiservaPer('openrouter');
  }

  async function leggi(ora) {
    try {
      let risposta;
      try {
        risposta = await fetchFn(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
      } catch {
        // ⛔ un errore di rete non è "zero modelli": la UI deve poterli distinguere (stesso principio di discoveryProblems nel mobile).
        throw new ModelCatalogError('OpenRouter catalog unreachable.', 'CATALOG_UNREACHABLE');
      }
      if (!risposta.ok) {
        throw new ModelCatalogError(`Catalogo OpenRouter ha risposto ${risposta.status}`, 'CATALOG_UPSTREAM_ERROR');
      }
      let corpo;
      try {
        corpo = await risposta.json();
      } catch {
        throw new ModelCatalogError('OpenRouter catalog: invalid response', 'CATALOG_UPSTREAM_ERROR');
      }
      if (!Array.isArray(corpo?.data)) {
        throw new ModelCatalogError('Catalogo OpenRouter: formato inatteso', 'CATALOG_UPSTREAM_ERROR');
      }

      const modelli = corpo.data
        .map(normalizza)
        .filter((modello) => modello.id !== '')
        .sort((a, b) => a.provider.localeCompare(b.provider) || a.nome.localeCompare(b.nome));

      cache = { creatoAlle: ora, modelli };
      prossimoTentativoAlle = 0; ripetizioneUsata = false; // un successo azzera la serie
      return { modelli, daCache: false, aggiornatoAlle: new Date(ora).toISOString() };
    } catch {
      /* un fallimento conta come una lettura: una sola ripetizione dopo 30 s, poi al più una ogni 10 minuti */
      const adesso = clock().getTime();
      prossimoTentativoAlle = adesso + (ripetizioneUsata ? attesaDopoFallimentiMs : ripetizioneMs);
      ripetizioneUsata = true;
      return ripiego();
    }
  }

  return Object.freeze({ ottieni });
}
