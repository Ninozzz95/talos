/**
 * error-surface.mjs — ogni errore del Codice diventa un descrittore che la UI sa disegnare (ERRCOD, 30/09/2026).
 *
 * Owner, 30/09/2026: «fai in modo che gli errori vengano formattati allo stato dell'arte […] e che indovini tutti gli
 * errori possibili e immaginabili». Decisioni: il classificatore sta QUI, nel server; la UI disegna e basta; un solo
 * pulsante per errore. Ledger `.claude/ragionamento/LEDGER-ERRORI-CODICE-2026-09-30.md`, dossier
 * `.claude/ricerche/2026-09-30-errori-codice-10x4.md`.
 *
 * Adattato, non importato:
 * - la tassonomia dei fornitori è quella TIPIZZATA di OpenRouter (`error.metadata.error_type`, 28 tipi;
 *   https://openrouter.ai/docs/api-reference/errors, letta il 30/09/2026), con lo stato HTTP come ripiego;
 * - i raggruppamenti e la regola «il livello decide la via d'uscita» vengono da Hermes Agent
 *   (`agent/error_classifier.py` `FailoverReason`, `agent/error_surface.py`, commit 65ad5296);
 * - i livelli e il record sono quelli della chat di TALOS (`mobile/src/stores/chat.ts` `providerFault`,
 *   `TalosMobileStatusMessage.vue`), così il Codice parla come la chat.
 *
 * ⛔ Si riconosce dalla STRUTTURA (stato, `error_type`, `cause.code`, `name`, codice del server), mai con una regex sul
 * messaggio libero — la stessa regola della consegna 65. ⛔ Mai un throw: descrivere un errore non deve romperne il
 * percorso (Hermes, error_surface: «NEVER raises»).
 */

export const SCHEMA_ERRORE = 'talos.codice-errore.v1';

const LUNGHEZZA_DETTAGLIO = 500;

/**
 * Ogni codice con il suo livello, se si può riprovare, e l'UNICA azione che lo rimedia. La frase per la persona NON
 * sta qui: sta nella UI, nella lingua dell'app.
 */
const CODICI = Object.freeze({
  PROVIDER_AUTH: { layer: 'provider', retryable: false, action: 'provider-keys' },
  PROVIDER_KEY_MISSING: { layer: 'provider', retryable: false, action: 'provider-keys' },
  PROVIDER_BILLING: { layer: 'provider', retryable: false, action: 'none' },
  PROVIDER_FORBIDDEN: { layer: 'policy', retryable: false, action: 'pick-model' },
  PROVIDER_CONTENT_POLICY: { layer: 'policy', retryable: false, action: 'none' },
  PROVIDER_MODEL_NOT_FOUND: { layer: 'provider', retryable: false, action: 'pick-model' },
  PROVIDER_CONTEXT_TOO_LONG: { layer: 'provider', retryable: false, action: 'new-session' },
  PROVIDER_OUTPUT_LIMIT: { layer: 'provider', retryable: true, action: 'continue' },
  PROVIDER_PAYLOAD_TOO_LARGE: { layer: 'provider', retryable: false, action: 'new-session' },
  PROVIDER_IMAGE: { layer: 'validator', retryable: false, action: 'none' },
  PROVIDER_BAD_REQUEST: { layer: 'validator', retryable: false, action: 'pick-model' },
  PROVIDER_RATE_LIMIT: { layer: 'provider', retryable: true, action: 'retry' },
  PROVIDER_OVERLOADED: { layer: 'provider', retryable: true, action: 'retry' },
  PROVIDER_UNAVAILABLE: { layer: 'provider', retryable: true, action: 'pick-model' },
  PROVIDER_TIMEOUT: { layer: 'network', retryable: true, action: 'retry' },
  PROVIDER_SERVER: { layer: 'provider', retryable: true, action: 'retry' },
  PROVIDER_EMPTY: { layer: 'provider', retryable: true, action: 'retry' },
  NETWORK_OFFLINE: { layer: 'network', retryable: true, action: 'retry' },
  NETWORK_TLS: { layer: 'network', retryable: false, action: 'none' },
  NETWORK_REFUSED: { layer: 'network', retryable: true, action: 'retry' },
  NETWORK_TIMEOUT: { layer: 'network', retryable: true, action: 'retry' },
  RUN_STEP_LIMIT: { layer: 'worker', retryable: true, action: 'continue' },
  RUN_STOPPED: { layer: 'none', retryable: null, action: 'none' },
  RUN_NO_ANSWER: { layer: 'worker', retryable: true, action: 'retry' },
  SESSION_NOT_READY: { layer: 'system', retryable: false, action: 'new-session' },
  SESSION_NOT_FOUND: { layer: 'system', retryable: false, action: 'new-session' },
  REQUEST_INVALID: { layer: 'validator', retryable: false, action: 'none' },
  // ⛔ 70-A (30/09/2026): il server non ha riconosciuto il segreto nemmeno dopo che l'app l'ha riletto.
  SERVER_AUTH_FAILED: { layer: 'system', retryable: false, action: 'none' },
  UNKNOWN: { layer: 'system', retryable: null, action: 'new-session' },
});

/** I tipi di OpenRouter (`error.metadata.error_type`) → il nostro codice. Un tipo nuovo che non c'è ripiega sullo stato. */
const PER_TIPO = Object.freeze({
  authentication: 'PROVIDER_AUTH',
  payment_required: 'PROVIDER_BILLING',
  permission_denied: 'PROVIDER_FORBIDDEN',
  content_policy_violation: 'PROVIDER_CONTENT_POLICY',
  refusal: 'PROVIDER_CONTENT_POLICY',
  not_found: 'PROVIDER_MODEL_NOT_FOUND',
  context_length_exceeded: 'PROVIDER_CONTEXT_TOO_LONG',
  token_limit_exceeded: 'PROVIDER_CONTEXT_TOO_LONG',
  string_too_long: 'PROVIDER_CONTEXT_TOO_LONG',
  max_tokens_exceeded: 'PROVIDER_OUTPUT_LIMIT',
  payload_too_large: 'PROVIDER_PAYLOAD_TOO_LARGE',
  invalid_image: 'PROVIDER_IMAGE',
  image_too_large: 'PROVIDER_IMAGE',
  image_too_small: 'PROVIDER_IMAGE',
  unsupported_image_format: 'PROVIDER_IMAGE',
  image_not_found: 'PROVIDER_IMAGE',
  image_download_failed: 'PROVIDER_IMAGE',
  invalid_request: 'PROVIDER_BAD_REQUEST',
  invalid_prompt: 'PROVIDER_BAD_REQUEST',
  precondition_failed: 'PROVIDER_BAD_REQUEST',
  unprocessable: 'PROVIDER_BAD_REQUEST',
  rate_limit_exceeded: 'PROVIDER_RATE_LIMIT',
  provider_overloaded: 'PROVIDER_OVERLOADED',
  provider_unavailable: 'PROVIDER_UNAVAILABLE',
  timeout: 'PROVIDER_TIMEOUT',
  server: 'PROVIDER_SERVER',
  unmapped: 'PROVIDER_SERVER',
});

/** Codici di Node/undici sulla causa di un `fetch` fallito → il nostro codice. */
const PER_CAUSA = Object.freeze({
  ENOTFOUND: 'NETWORK_OFFLINE',
  EAI_AGAIN: 'NETWORK_OFFLINE',
  ENETUNREACH: 'NETWORK_OFFLINE',
  ENETDOWN: 'NETWORK_OFFLINE',
  EHOSTUNREACH: 'NETWORK_OFFLINE',
  ECONNREFUSED: 'NETWORK_REFUSED',
  ECONNRESET: 'NETWORK_REFUSED',
  EPIPE: 'NETWORK_REFUSED',
  ECONNABORTED: 'NETWORK_REFUSED',
  UND_ERR_SOCKET: 'NETWORK_REFUSED',
  UND_ERR_CLOSED: 'NETWORK_REFUSED',
  ETIMEDOUT: 'NETWORK_TIMEOUT',
  UND_ERR_CONNECT_TIMEOUT: 'NETWORK_TIMEOUT',
  UND_ERR_HEADERS_TIMEOUT: 'NETWORK_TIMEOUT',
  UND_ERR_BODY_TIMEOUT: 'NETWORK_TIMEOUT',
});

/** I codici d'errore del server del Codice (envelope di http-app.mjs, `erroreAvvio.code`) → il nostro codice. */
const PER_SERVER = Object.freeze({
  CONFIG_INVALID: 'PROVIDER_KEY_MISSING',
  SESSION_NOT_READY: 'SESSION_NOT_READY',
  NOT_FOUND: 'SESSION_NOT_FOUND',
  QUERY_INVALID: 'REQUEST_INVALID',
  PAYLOAD_LIMIT: 'REQUEST_INVALID',
  METHOD_NOT_ALLOWED: 'REQUEST_INVALID',
  // ⛔ 70-A (30/09/2026): il cancello d'ingresso di http-app.mjs.
  AUTH_REQUIRED: 'SERVER_AUTH_FAILED',
  ORIGIN_FORBIDDEN: 'REQUEST_INVALID',
  HOST_FORBIDDEN: 'REQUEST_INVALID',
  CONTENT_TYPE_UNSUPPORTED: 'REQUEST_INVALID',
});

/** Le chiavi e i gettoni noti si coprono: il dettaglio finisce a schermo e nei file di sessione. */
export function mascheraSegreti(testo) {
  return String(testo)
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, 'sk-…')
    .replace(/\bBearer\s+\S+/gi, 'Bearer …');
}

function leggi(oggetto, chiave) {
  try {
    return oggetto != null && (typeof oggetto === 'object' || typeof oggetto === 'function') ? oggetto[chiave] : undefined;
  } catch {
    return undefined;
  }
}

function perStato(stato) {
  if (stato === 401) return 'PROVIDER_AUTH';
  if (stato === 402) return 'PROVIDER_BILLING';
  if (stato === 403) return 'PROVIDER_FORBIDDEN';
  if (stato === 404) return 'PROVIDER_MODEL_NOT_FOUND';
  if (stato === 408 || stato === 504 || stato === 524) return 'PROVIDER_TIMEOUT';
  if (stato === 413) return 'PROVIDER_PAYLOAD_TOO_LARGE';
  if (stato === 429) return 'PROVIDER_RATE_LIMIT';
  if (stato === 502) return 'PROVIDER_UNAVAILABLE';
  if (stato === 503 || stato === 529) return 'PROVIDER_OVERLOADED';
  if (Number.isInteger(stato) && stato >= 500) return 'PROVIDER_SERVER';
  if (Number.isInteger(stato) && stato >= 400) return 'PROVIDER_BAD_REQUEST';
  return null;
}

function codiceDelFornitore(stato, erroreFornitore) {
  const metadata = leggi(erroreFornitore, 'metadata');
  const tipo = leggi(metadata, 'error_type');
  if (typeof tipo === 'string' && Object.hasOwn(PER_TIPO, tipo)) return PER_TIPO[tipo];
  // Moderazione senza tipo: OpenRouter mette `reasons`/`flagged_input` nel metadata di un 403.
  if (stato === 403 && (Array.isArray(leggi(metadata, 'reasons')) || leggi(metadata, 'flagged_input') !== undefined)) {
    return 'PROVIDER_CONTENT_POLICY';
  }
  return perStato(stato);
}

function testoGrezzo(errore) {
  if (typeof errore === 'string') return errore;
  const corpo = leggi(errore, 'corpo');
  if (typeof corpo === 'string' && corpo) return corpo;
  const messaggio = leggi(errore, 'message');
  if (typeof messaggio === 'string' && messaggio) return messaggio;
  if (errore == null) return '';
  try {
    return String(errore);
  } catch {
    return '';
  }
}

function costruisci(code, errore, contesto, extra = {}) {
  const voce = CODICI[code] ?? CODICI.UNKNOWN;
  const descrittore = { schema: SCHEMA_ERRORE, layer: voce.layer, code, retryable: voce.retryable, action: voce.action };
  const stato = leggi(errore, 'stato');
  if (Number.isInteger(stato)) descrittore.status = stato;
  if (typeof contesto?.provider === 'string' && contesto.provider) descrittore.provider = contesto.provider;
  if (typeof contesto?.model === 'string' && contesto.model) descrittore.model = contesto.model;
  Object.assign(descrittore, extra);
  descrittore.detail = mascheraSegreti(testoGrezzo(errore)).slice(0, LUNGHEZZA_DETTAGLIO);
  return descrittore;
}

/**
 * Da qualunque cosa sia stata lanciata (un Error del kernel con `fase`, un'eccezione di `fetch`, un `{code}` del server,
 * perfino `undefined`) al descrittore. Mai un throw.
 *
 * @param {unknown} errore
 * @param {{provider?: string, model?: string}} [contesto]
 */
export function descriviErrore(errore, contesto = {}) {
  try {
    const fase = leggi(errore, 'fase');
    if (fase === 'http' || fase === 'flusso') {
      const stato = leggi(errore, 'stato');
      const code = codiceDelFornitore(Number.isInteger(stato) ? stato : null, leggi(errore, 'erroreFornitore'))
        ?? (fase === 'flusso' ? 'PROVIDER_SERVER' : 'UNKNOWN');
      return costruisci(code, errore, contesto, fase === 'flusso' ? { midStream: true } : {});
    }
    if (fase === 'vuoto') return costruisci('PROVIDER_EMPTY', errore, contesto);
    const causa = leggi(leggi(errore, 'cause'), 'code');
    if (typeof causa === 'string') {
      if (Object.hasOwn(PER_CAUSA, causa)) return costruisci(PER_CAUSA[causa], errore, contesto);
      if (causa.startsWith('CERT_') || causa.startsWith('ERR_TLS_') || causa.startsWith('UNABLE_TO_') || causa.includes('SELF_SIGNED')) {
        return costruisci('NETWORK_TLS', errore, contesto);
      }
    }
    if (leggi(errore, 'name') === 'TimeoutError') return costruisci('NETWORK_TIMEOUT', errore, contesto);
    const codiceServer = leggi(errore, 'code');
    if (typeof codiceServer === 'string' && Object.hasOwn(PER_SERVER, codiceServer)) {
      return costruisci(PER_SERVER[codiceServer], errore, contesto);
    }
    if (fase === 'rete') return costruisci('NETWORK_REFUSED', errore, contesto);
    return costruisci('UNKNOWN', errore, contesto);
  } catch {
    return { schema: SCHEMA_ERRORE, ...CODICI.UNKNOWN, code: 'UNKNOWN', detail: '' };
  }
}

/**
 * Come è finito un giro, quando non è finito bene. `null` per un giro concluso. ⛔ Lo Stop della persona non è un
 * errore: `layer:'none'` dice alla UI di scrivere una nota neutra, non una scheda rossa.
 */
export function descrittorePerFineGiro({ comeFinita, fermatoDallaPersona = false } = {}) {
  if (comeFinita === 'giri-esauriti') return costruisci('RUN_STEP_LIMIT', null, {});
  if (comeFinita === 'fermato') return costruisci(fermatoDallaPersona ? 'RUN_STOPPED' : 'RUN_NO_ANSWER', null, {});
  return null;
}
