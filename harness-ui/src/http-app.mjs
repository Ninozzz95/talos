import { leggiArtefatto as leggiArtefattoReale } from './artifact-store.mjs';
import { modelloRichiestaValido, permessiPerAttrezzoRichiestaValido, permessiRichiestaValido, reasoningRichiestaValido } from './config.mjs';
import { cartelleFrequenti as cartelleFrequentiReale } from './frequent-dirs.mjs';
import { RUNTIME_BOOTSTRAP_SCHEMA, RUNTIME_RESOURCE_SCHEMA, parseBootstrapEnvelope } from './runtime-contract.mjs';
import { getDiagnosticProblem, toPublicProblem } from './public-problem.mjs';
import { createSseSession } from './http-lifecycle.mjs';

export const API_SCHEMA = 'talos.harness-ui.api.v1';

const MAX_REQUEST_TARGET_BYTES = 4096;
/** ⛔ Un corpo POST qui è solo `{taskId}` — poche decine di byte. 4096 è già generoso, stesso ordine di grandezza di MAX_REQUEST_TARGET_BYTES. */
const MAX_REQUEST_BODY_BYTES = 4096;
/** ⭐ 28/8 — vedi la doc sopra `res.on('close', ...)` nella rotta /events: abbastanza frequente da tenere il canale vivo, abbastanza raro da non essere rumore nei log/nel traffico. */
const INTERVALLO_BATTITO_SSE_MS = 15_000;
const QA_STATES = new Set([
  'desktop',
  'laptop',
  'tablet',
  'mobile',
  'mobile-narrow',
  'capabilities',
]);
const API_ERROR_CODES = new Set([
  'CONFIG_INVALID',
  'QUERY_INVALID',
  'REPORT_UNAVAILABLE',
  'PAYLOAD_LIMIT',
  'METHOD_NOT_ALLOWED',
  'NOT_FOUND',
  'TASK_NOT_ALLOWED',
  'TASK_CATALOG_UNAVAILABLE',
  'SESSION_NOT_READY',
  'SESSION_STORE_WRITE_FAILED',
  'AUTOMATION_INVALID',
  'CATALOG_UNREACHABLE',
  'CATALOG_UPSTREAM_ERROR',
  'INTERNAL_ERROR',
  /* ⭐ 27/8 — le quattro azioni sul file dell'albero (owner: rinomina, apri, rivela in Esplora File, elimina), vedi workspace-files.mjs. */
  'FILE_NOT_FOUND',
  'FILE_TOO_LARGE',
  'FILE_EXISTS',
  'PLATFORM_UNSUPPORTED',
  /* ⭐ 28/8 — FASE A (hook): .harness-ui-hooks.json malformato, o un hookId che non combacia nessuna voce del file. */
  'HOOK_INVALID',
  /* ⭐ 29/8 — FASE E: .harness-ui-mcp.json malformato, o un serverId che non combacia nessuna voce del file. */
  'MCP_INVALID',
  /* ⭐ 29/8 — FASE G: un plugin.json malformato, o un pluginId che non combacia nessuna cartella di .harness-ui-plugins/. */
  'PLUGIN_INVALID',
  /* ⭐ 30/8, QA visiva (Task 14) — DELETE su una sessione ancora viva (né conclusa né interrotta): un controller attivo potrebbe star lavorando davvero. */
  'SESSION_STILL_RUNNING',
  'WORKSPACE_LAUNCH_UNAUTHORIZED',
  'WORKSPACE_LAUNCH_NOT_AVAILABLE',
  'WORKSPACE_NOT_AVAILABLE',
  'WORKSPACE_ALREADY_EXISTS',
  'PROVIDER_INVALID', 'PROVIDER_KEY_REQUIRED', 'PROVIDER_KEY_INVALID', 'PROVIDER_STORE_UNAVAILABLE', 'PROVIDER_RUNTIME_INVALID', 'PROVIDER_RUNTIME_UNAVAILABLE',
  'RUNTIME_NOT_AVAILABLE',
  'RUNTIME_UNREACHABLE',
  'RUNTIME_OPERATION_UNSUPPORTED',
  'MODEL_NOT_FOUND',
  'MODEL_LOAD_UNCONFIRMED',
  'MODEL_UNLOAD_UNCONFIRMED',
  'LOCAL_RUNTIME_FAILED',
  'HF_HUB_INVALID', 'HF_HUB_UPSTREAM', 'HF_HUB_RESPONSE_INVALID', 'HF_REPOSITORY_GATED', 'HF_RATE_LIMITED',
  'HF_REDIRECT_INVALID', 'HF_REDIRECT_HOST_REJECTED', 'HF_RESOLVE_INVALID', 'HF_TRANSFER_INVALID', 'HF_TRANSFER_COLLISION',
  /* ⭐ 02/9 — il supervisor llama.cpp lancia gia' un codice preciso quando
     il runtime e' occupato; non essendo registrato qui veniva degradato a
     INTERNAL_ERROR (500), cioe' 'e' colpa nostra, riprova' su una
     situazione perfettamente normale e spiegabile. */
  'RUNTIME_ALREADY_RUNNING',
  'HF_DOWNLOAD_FAILED', 'HF_PATH_REJECTED', 'CHECKSUM_MISMATCH', 'MODEL_FILE_UNREADABLE', 'CANCELLED_BY_OWNER', 'PAUSED_BY_OWNER',
  'HF_IMAGE_URL_INVALID', 'HF_IMAGE_HOST_REJECTED', 'HF_IMAGE_REDIRECT_REJECTED', 'HF_IMAGE_PRIVATE_ADDRESS', 'HF_IMAGE_DNS_FAILED', 'HF_IMAGE_ABORTED', 'HF_IMAGE_UPSTREAM', 'HF_IMAGE_MIME_REJECTED', 'HF_IMAGE_TOO_LARGE', 'HF_IMAGE_CONFIG_INVALID',
  'LOCAL_IMPORT_INVALID', 'LOCAL_IMPORT_TOO_LARGE', 'LOCAL_IMPORT_SIZE_MISMATCH', 'LOCAL_IMPORT_EMPTY', 'LOCAL_IMPORT_NOT_GGUF',
  /* ⭐ 02/9 — Fase 5 punto 4: probe locale "prima di load" (local-runtime-probe.mjs + gguf-header.mjs). */
  'MODEL_NOT_READY', 'MODEL_HEADER_INVALID', 'MODEL_HEADER_UNREADABLE', 'RUNTIME_PROBE_FAILED', 'FIT_INVALID', 'LOCAL_RUNTIME_PROBE_MISCONFIGURED',
  /* ⭐ 02/9 — stesso probe, qualify(): un giro di generazione reale, consenso esplicito obbligatorio. */
  'PROBE_CONSENT_REQUIRED', 'PROBE_GENERATION_FAILED', 'PROBE_GENERATION_INCOMPLETE', 'MODEL_NOT_COMPATIBLE',
]);

const STATUS_BY_CODE = Object.freeze({
  CONFIG_INVALID: 500,
  QUERY_INVALID: 400,
  REPORT_UNAVAILABLE: 404,
  PAYLOAD_LIMIT: 413,
  METHOD_NOT_ALLOWED: 405,
  NOT_FOUND: 404,
  TASK_NOT_ALLOWED: 404,
  TASK_CATALOG_UNAVAILABLE: 503,
  /** ⭐ 409 Conflict: la sessione origine esiste ma non è nello stato giusto per un fork (ancora in corso, o senza storia). */
  SESSION_NOT_READY: 409,
  /*
   * ⭐⭐ 02/9 — due COLLISIONI, non due guasti: un runtime già acceso e un
   * modello già presente. Entrambe rispondevano 500 INTERNAL_ERROR — «si è
   * verificato un problema imprevisto», che è falso: è previstissimo, ed è
   * la stessa cosa che l'utente ha appena chiesto due volte.
   * ⭐ Ricerca 02/9 (http.dev/409, RFC 9110): 409 è lo status per «the
   * request could not be completed due to a conflict with the current state
   * of the target resource» — dice al chiamante il perché e che è
   * risolvibile, invece di accusare il server.
   */
  RUNTIME_ALREADY_RUNNING: 409,
  HF_TRANSFER_COLLISION: 409,
  SESSION_STORE_WRITE_FAILED: 503,
  /** ⭐ 27/8 — un tetto duro dell'automazione violato (intervallo/limite fuori range) è un errore di CONTENUTO, non di forma: stesso status di ROW_INVALID. */
  AUTOMATION_INVALID: 422,
  /** ⭐ 27/8 — il catalogo modelli dipende da OpenRouter: quando è irraggiungibile o risponde male non è colpa del client. */
  CATALOG_UNREACHABLE: 503,
  CATALOG_UPSTREAM_ERROR: 503,
  INTERNAL_ERROR: 500,
  FILE_NOT_FOUND: 404,
  /** ⭐ 27/8 — stesso status di PAYLOAD_LIMIT: un'anteprima troppo grande è la stessa famiglia di "contenuto oltre il limite". */
  FILE_TOO_LARGE: 413,
  /** ⭐ 27/8 — stesso status di SESSION_NOT_READY: la richiesta è legittima ma lo stato attuale (un file già lì) la blocca. */
  FILE_EXISTS: 409,
  PLATFORM_UNSUPPORTED: 501,
  /** ⭐ 28/8 — stesso status di ROW_INVALID/QUERY_INVALID: il contenuto della richiesta (hookId, o il file hooks.json stesso) non è valido. */
  HOOK_INVALID: 422,
  /** ⭐ 29/8 — stesso status di HOOK_INVALID, stesso motivo: il contenuto della richiesta (serverId, o il file .harness-ui-mcp.json stesso) non è valido. */
  MCP_INVALID: 422,
  /** ⭐ 29/8 — FASE G: stesso status di MCP_INVALID, stesso motivo (pluginId, o il file plugin.json stesso) non valido. */
  PLUGIN_INVALID: 422,
  /** ⭐ 30/8 — stesso status di SESSION_NOT_READY: la richiesta è legittima ma lo stato attuale (ancora in corso) la blocca. */
  SESSION_STILL_RUNNING: 409,
  WORKSPACE_LAUNCH_UNAUTHORIZED: 403,
  WORKSPACE_LAUNCH_NOT_AVAILABLE: 410,
  WORKSPACE_NOT_AVAILABLE: 422,
  WORKSPACE_ALREADY_EXISTS: 409,
  PROVIDER_INVALID: 422,
  PROVIDER_KEY_REQUIRED: 422,
  PROVIDER_KEY_INVALID: 422,
  PROVIDER_STORE_UNAVAILABLE: 503,
  PROVIDER_RUNTIME_INVALID: 422,
  PROVIDER_RUNTIME_UNAVAILABLE: 503,
  RUNTIME_NOT_AVAILABLE: 503,
  RUNTIME_UNREACHABLE: 503,
  RUNTIME_OPERATION_UNSUPPORTED: 409,
  MODEL_NOT_FOUND: 404,
  MODEL_LOAD_UNCONFIRMED: 502,
  MODEL_UNLOAD_UNCONFIRMED: 502,
  LOCAL_RUNTIME_FAILED: 502,
  HF_IMAGE_URL_INVALID: 422,
  HF_IMAGE_HOST_REJECTED: 422,
  HF_IMAGE_REDIRECT_REJECTED: 422,
  HF_IMAGE_PRIVATE_ADDRESS: 422,
  HF_IMAGE_DNS_FAILED: 502,
  HF_IMAGE_ABORTED: 499,
  HF_IMAGE_UPSTREAM: 502,
  HF_IMAGE_MIME_REJECTED: 422,
  HF_IMAGE_TOO_LARGE: 413,
  HF_IMAGE_CONFIG_INVALID: 500,
  LOCAL_IMPORT_INVALID: 422,
  LOCAL_IMPORT_TOO_LARGE: 413,
  LOCAL_IMPORT_SIZE_MISMATCH: 422,
  LOCAL_IMPORT_EMPTY: 422,
  LOCAL_IMPORT_NOT_GGUF: 422,
  /** ⭐ 02/9 — stesso status di SESSION_NOT_READY: il modello esiste ma non è nello stato giusto per un probe (download/verifica in corso). */
  MODEL_NOT_READY: 409,
  /** ⭐ 02/9 — il file GGUF esiste ma il suo contenuto non è quello atteso (magic/version/metadata mancante) — è il FILE ad essere invalido, non la richiesta. */
  MODEL_HEADER_INVALID: 422,
  MODEL_HEADER_UNREADABLE: 422,
  /** ⭐ 02/9 — stesso status di RUNTIME_UNREACHABLE: il runtime llama.cpp non ha risposto al probe. */
  RUNTIME_PROBE_FAILED: 503,
  FIT_INVALID: 400,
  LOCAL_RUNTIME_PROBE_MISCONFIGURED: 500,
  /** ⭐ 02/9 — richiesta legittima, ma manca il consenso esplicito per un giro di generazione reale: stesso status di FIT_INVALID (contenuto della richiesta incompleto). */
  PROBE_CONSENT_REQUIRED: 400,
  PROBE_GENERATION_FAILED: 502,
  PROBE_GENERATION_INCOMPLETE: 502,
  /** ⭐ 02/9 — stesso status di MODEL_NOT_READY/SESSION_NOT_READY: il modello esiste ma il suo stato attuale (non compatibile) blocca l'azione. */
  MODEL_NOT_COMPATIBLE: 409,
});

const MESSAGE_BY_CODE = Object.freeze({
  CONFIG_INVALID: 'Configurazione non valida',
  QUERY_INVALID: 'Query non valida',
  REPORT_UNAVAILABLE: 'Rapporto non ancora prodotto',
  PAYLOAD_LIMIT: 'Contenuto oltre il limite consentito',
  METHOD_NOT_ALLOWED: 'Metodo non consentito',
  NOT_FOUND: 'Risorsa non trovata',
  TASK_NOT_ALLOWED: 'Task non ammesso',
  SESSION_NOT_READY: 'Sessione non pronta per questa azione',
  AUTOMATION_INVALID: 'Parametri automazione non validi',
  CATALOG_UNREACHABLE: 'Catalogo modelli non raggiungibile',
  CATALOG_UPSTREAM_ERROR: 'Catalogo modelli non disponibile',
  INTERNAL_ERROR: 'Errore interno',
  FILE_NOT_FOUND: 'File non trovato',
  FILE_TOO_LARGE: 'File troppo grande per l\'anteprima',
  FILE_EXISTS: 'Esiste già un file con questo nome',
  PLATFORM_UNSUPPORTED: 'Non disponibile su questa piattaforma',
  HOOK_INVALID: 'Configurazione hook non valida',
  MCP_INVALID: 'Configurazione server MCP non valida',
  PLUGIN_INVALID: 'Configurazione plugin non valida',
  SESSION_STILL_RUNNING: 'Sessione ancora in corso — fermala prima di eliminarla',
  WORKSPACE_LAUNCH_UNAUTHORIZED: 'Il comando locale non è autorizzato. Riavvia TALOS e riprova.',
  WORKSPACE_LAUNCH_NOT_AVAILABLE: 'Questo collegamento non è più disponibile. Usa di nuovo “Apri cartella con TALOS”.',
  WORKSPACE_NOT_AVAILABLE: 'La cartella non è disponibile. Controlla che esista e che TALOS possa lavorarci, poi riprova.',
  WORKSPACE_ALREADY_EXISTS: 'Esiste già un file o una cartella con questo nome.',
  PROVIDER_INVALID: 'Provider non riconosciuto',
  PROVIDER_KEY_REQUIRED: 'Inserisci una chiave prima di salvarla',
  PROVIDER_KEY_INVALID: 'La chiave inserita non è valida',
  PROVIDER_STORE_UNAVAILABLE: 'Il portachiavi del computer non è disponibile: controlla Doctor',
  PROVIDER_RUNTIME_INVALID: 'Controlla indirizzo e tempo massimo del provider',
  PROVIDER_RUNTIME_UNAVAILABLE: 'Non è stato possibile salvare le preferenze del provider: controlla Doctor',
  RUNTIME_NOT_AVAILABLE: 'Runtime locale non disponibile',
  RUNTIME_UNREACHABLE: 'Runtime locale non raggiungibile',
  RUNTIME_OPERATION_UNSUPPORTED: 'Operazione runtime non supportata',
  MODEL_NOT_FOUND: 'Modello locale non trovato',
  MODEL_NOT_READY: 'Il modello non è ancora pronto (download o verifica in corso)',
  MODEL_HEADER_INVALID: 'Il file GGUF del modello non è valido',
  MODEL_HEADER_UNREADABLE: 'Il file GGUF del modello non è leggibile',
  RUNTIME_PROBE_FAILED: 'Il runtime locale non ha risposto al controllo',
  FIT_INVALID: 'Parametri di verifica non validi',
  PROBE_CONSENT_REQUIRED: 'Serve un consenso esplicito per far girare il modello',
  PROBE_GENERATION_FAILED: 'La prova di generazione è fallita',
  PROBE_GENERATION_INCOMPLETE: 'La prova di generazione non si è conclusa',
  MODEL_NOT_COMPATIBLE: 'Il modello non è compatibile con questo profilo',
  MODEL_LOAD_UNCONFIRMED: 'Caricamento modello non confermato',
  MODEL_UNLOAD_UNCONFIRMED: 'Scaricamento modello non confermato',
  LOCAL_RUNTIME_FAILED: 'Runtime locale fallito',
  HF_HUB_INVALID: 'Richiesta Hugging Face non valida', HF_HUB_UPSTREAM: 'Hugging Face non raggiungibile', HF_HUB_RESPONSE_INVALID: 'Risposta Hugging Face non valida',
  HF_REPOSITORY_GATED: 'Repository Hugging Face gated o non autorizzato', HF_RATE_LIMITED: 'Limite richieste Hugging Face raggiunto', HF_REDIRECT_INVALID: 'Redirect Hugging Face non valido',
  HF_REDIRECT_HOST_REJECTED: 'Host di download Hugging Face non autorizzato', HF_RESOLVE_INVALID: 'URL di download Hugging Face non valido', HF_TRANSFER_INVALID: 'Trasferimento modello non valido',
  HF_TRANSFER_COLLISION: 'Questo modello è già presente: scaricalo di nuovo solo dopo averlo rimosso',
  RUNTIME_ALREADY_RUNNING: 'Il runtime locale ha già un modello caricato: liberalo prima di caricarne un altro', HF_DOWNLOAD_FAILED: 'Download Hugging Face fallito', HF_PATH_REJECTED: 'Percorso modello non autorizzato',
  CHECKSUM_MISMATCH: 'Verifica checksum modello fallita', MODEL_FILE_UNREADABLE: 'File modello non leggibile', CANCELLED_BY_OWNER: 'Download annullato', PAUSED_BY_OWNER: 'Download in pausa',
  HF_IMAGE_URL_INVALID: 'URL immagine non valido', HF_IMAGE_HOST_REJECTED: 'Origine immagine non autorizzata', HF_IMAGE_REDIRECT_REJECTED: 'Reindirizzamento immagine non autorizzato', HF_IMAGE_PRIVATE_ADDRESS: 'Immagine non raggiungibile da un indirizzo privato', HF_IMAGE_DNS_FAILED: 'Origine immagine non raggiungibile', HF_IMAGE_ABORTED: 'Richiesta immagine annullata', HF_IMAGE_UPSTREAM: 'Servizio immagini non disponibile', HF_IMAGE_MIME_REJECTED: 'Formato immagine non supportato', HF_IMAGE_TOO_LARGE: 'Immagine troppo grande', HF_IMAGE_CONFIG_INVALID: 'Proxy immagini non configurato',
  LOCAL_IMPORT_INVALID: 'Controlla il file GGUF scelto e riprova', LOCAL_IMPORT_TOO_LARGE: 'Il modello scelto supera lo spazio consentito', LOCAL_IMPORT_SIZE_MISMATCH: 'La dimensione del file non coincide con quella dichiarata', LOCAL_IMPORT_EMPTY: 'Il file scelto è vuoto', LOCAL_IMPORT_NOT_GGUF: 'Il file scelto non è un modello GGUF',
});

const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
});

function generatedAt(clock) {
  const value = clock();
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function send(res, statusCode, contentType, body, method, extraHeaders = {}) {
  if (res.destroyed || res.writableEnded) return;
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  res.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    ...extraHeaders,
    'Content-Type': contentType,
    'Content-Length': payload.length,
  });
  res.end(method === 'HEAD' ? undefined : payload);
}

function successEnvelope(data, clock) {
  const meta = { schema: API_SCHEMA, generatedAt: generatedAt(clock) };
  if (data && typeof data.sourceHash === 'string') meta.sourceHash = data.sourceHash;
  return { ok: true, data, meta };
}

function errorEnvelope(code, clock, context = {}) {
const problem = toPublicProblem({ code }, context);
return {
ok: false,
error: { code, message: MESSAGE_BY_CODE[code] ?? problem.title, ...problem },
meta: { schema: API_SCHEMA, generatedAt: generatedAt(clock) },
};
}

function sendJson(res, statusCode, value, method, extraHeaders) {
  send(res, statusCode, 'application/json; charset=utf-8', JSON.stringify(value), method, extraHeaders);
}

function requireNoQuery(url) {
  if ([...url.searchParams.keys()].length > 0) {
    const error = new Error('Query non valida');
    error.code = 'QUERY_INVALID';
    throw error;
  }
}

function requireValidStaticQuery(url) {
  const entries = [...url.searchParams.entries()];
  if (entries.length === 0) return;
  const allowsQa = (url.pathname === '/' || url.pathname === '/index.html')
    && entries.length === 1
    && entries[0][0] === 'qa'
    && QA_STATES.has(entries[0][1]);
  if (!allowsQa) {
    const error = new Error('Query non valida');
    error.code = 'QUERY_INVALID';
    throw error;
  }
}

/** ⛔ Allowlist di UNA chiave — "forza" rifà davvero la fetch a OpenRouter (il pulsante Refresh del picker), ignorando la cache dentro il TTL. */
function parseModelsQuery(url) {
  const allowed = new Set(['forza']);
  const query = {};
  for (const [key, value] of url.searchParams) {
    if (!allowed.has(key) || Object.hasOwn(query, key) || value.length > 1024) {
      const error = new Error('Query non valida');
      error.code = value.length > 1024 ? 'PAYLOAD_LIMIT' : 'QUERY_INVALID';
      throw error;
    }
    query[key] = value;
  }
  return query.forza === '1';
}

/** ⛔ Un'allowlist di UNA chiave sola, come le altre query di questo file — la validazione FINE (niente "..", niente assoluto) resta in workspace-tree.leggiAlberoWorkspace(), qui si controlla solo la FORMA. */
function parseTreeQuery(url) {
  const allowed = new Set(['percorso']);
  const query = {};
  for (const [key, value] of url.searchParams) {
    if (!allowed.has(key) || Object.hasOwn(query, key) || value.length > 1024) {
      const error = new Error('Query non valida');
      error.code = value.length > 1024 ? 'PAYLOAD_LIMIT' : 'QUERY_INVALID';
      throw error;
    }
    query[key] = value;
  }
  return query.percorso ?? '';
}

function normalizeError(error) {
  const code = API_ERROR_CODES.has(error?.code) ? error.code : 'INTERNAL_ERROR';
  return { code, statusCode: STATUS_BY_CODE[code] };
}

/**
 * Legge il corpo di una richiesta POST come JSON, con un tetto di byte — le
 * rotte GET esistenti non avevano mai avuto bisogno di leggere un corpo.
 */
function leggiCorpoJson(req, limiteByte = MAX_REQUEST_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let totale = 0;
    const pezzi = [];
    req.on('data', (pezzo) => {
      totale += pezzo.length;
      if (totale > limiteByte) {
        const errore = new Error('Corpo oltre il limite consentito');
        errore.code = 'PAYLOAD_LIMIT';
        reject(errore);
        req.destroy();
        return;
      }
      pezzi.push(pezzo);
    });
    req.on('end', () => {
      try {
        const testo = Buffer.concat(pezzi).toString('utf8');
        resolve(testo.length ? JSON.parse(testo) : {});
      } catch {
        const errore = new Error('Corpo JSON non valido');
        errore.code = 'QUERY_INVALID';
        reject(errore);
      }
    });
    req.on('error', () => {
      const errore = new Error('Richiesta interrotta');
      errore.code = 'QUERY_INVALID';
      reject(errore);
    });
  });
}

/**
 * ⭐ 27/8 — `modello`/`reasoning` opzionali: `{taskId}` da solo resta valido
 * come sempre (usa il default del server), `{taskId, modello}` sceglie un
 * modello per QUESTA sessione, `{taskId, reasoning}` accende lo streaming
 * del ragionamento.
 *
 * ⛔ Un'allowlist di quattro chiavi al massimo: `taskId` (sempre), `modello`,
 * `reasoning`, `client` — mai la chiave API dal client, vedi createHttpApp.
 *
 * Piano `procedi-col-generare-un-snoopy-neumann.md`, Fase 3 (§3.2 del
 * prompt): `client` distingue una sessione avviata dal telefono da una
 * avviata sul PC. Un parametro esplicito nella richiesta, non un'euristica
 * sullo User-Agent (più onesto, come richiesto dal prompt originale) —
 * assente o `'desktop'` è il comportamento di SEMPRE, `'mobile'` è l'unico
 * valore che cambia qualcosa (vedi session-registry.avvia).
 */
function requireTaskIdBody(body) {
  const chiavi = Object.keys(body ?? {});
  // ⭐⭐⭐ 29/8 — FASE K: modelloPlanner riusa la STESSA validazione di modello (modelloRichiestaValido) — è lo stesso formato OpenRouter, mai un secondo validatore.
  const chiaviAmmesse = ['taskId', 'modello', 'modelloPlanner', 'reasoning', 'client', 'permessi', 'permessiPerAttrezzo', 'provider', 'runtimeId', 'modelId', 'fallbackConsent'];
  const soloAmmesse = chiavi.length > 0 && chiavi.length <= chiaviAmmesse.length && chiavi.every((k) => chiaviAmmesse.includes(k)) && chiavi.includes('taskId');
  if (
    !soloAmmesse || typeof body.taskId !== 'string' || body.taskId.length === 0
    || ('client' in body && body.client !== 'desktop' && body.client !== 'mobile')
    || ('provider' in body && body.provider !== 'cloud' && body.provider !== 'local')
    || (body.provider === 'local' && (typeof body.runtimeId !== 'string' || body.runtimeId.trim() === '' || typeof body.modelId !== 'string' || body.modelId.trim() === '' || ('fallbackConsent' in body && typeof body.fallbackConsent !== 'boolean')))
  ) {
    const errore = new Error('Corpo non valido: atteso {taskId, modello?, modelloPlanner?, reasoning?, client?, permessi?, permessiPerAttrezzo?, provider?, runtimeId?, modelId?, fallbackConsent?}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  if ('modello' in body && body.modello !== undefined && !modelloRichiestaValido(body.modello)) {
    const errore = new Error('modello deve avere la forma "vendor/nome-modello" (formato OpenRouter)');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  if ('modelloPlanner' in body && body.modelloPlanner !== undefined && !modelloRichiestaValido(body.modelloPlanner)) {
    const errore = new Error('modelloPlanner deve avere la forma "vendor/nome-modello" (formato OpenRouter)');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  if ('reasoning' in body && !reasoningRichiestaValido(body.reasoning)) {
    const errore = new Error('reasoning deve essere {effort?, summary?} coi valori ammessi da OpenRouter');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  if ('permessi' in body && !permessiRichiestaValido(body.permessi)) {
    const errore = new Error('permessi deve essere uno fra "Read only", "Workspace write", "On request", "Full access"');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  if ('permessiPerAttrezzo' in body && !permessiPerAttrezzoRichiestaValido(body.permessiPerAttrezzo)) {
    const errore = new Error('permessiPerAttrezzo deve mappare scrivi/prova/shell/document_create a "sempre"/"chiedi"/"nega"');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return {
    taskId: body.taskId,
    modello: 'modello' in body && body.modello !== undefined ? body.modello : null,
    modelloPlanner: 'modelloPlanner' in body && body.modelloPlanner !== undefined ? body.modelloPlanner : null,
    reasoning: 'reasoning' in body ? body.reasoning : null,
    mobile: body.client === 'mobile',
    permessi: 'permessi' in body && body.permessi !== undefined ? body.permessi : null,
    permessiPerAttrezzo: 'permessiPerAttrezzo' in body && body.permessiPerAttrezzo !== undefined ? body.permessiPerAttrezzo : null,
    provider: body.provider ?? 'cloud', runtimeId: body.runtimeId ?? null, modelId: body.modelId ?? null,
    fallbackConsent: body.fallbackConsent === true,
  };
}

/**
 * ⭐ 27/8 — {cartellaId, consegna} obbligatori, {comandoProva, modello}
 * opzionali: la validazione FINE (cartellaId nell'allowlist, consegna non
 * vuota) resta in `custom-task.mjs`/`session-registry.avviaLibero` — qui
 * solo la FORMA del corpo, stesso principio di `requireTaskIdBody`.
 *
 * ⛔ Riconciliazione Fase 1 (branch merge, 27/8) — trovato dal vivo: un
 * "compito libero" avviato dal tunnel mobile mandava `!comando` sulla PC
 * invece che sul telefono, perché QUESTO corpo non portava mai `client`
 * (aggiunto in origine solo a `requireTaskIdBody`, mai qui, prima della
 * riconciliazione `avviaLibero` non era raggiungibile dal mobile).
 */
/*
 * ⭐⭐⭐ 28/8 — `cartellaId`/`cartellaLibera` MUTUAMENTE ESCLUSIVI (permesso
 * "Full access", vedi custom-task.mjs/session-registry.avviaLibero per il
 * perché): qui SOLO la forma cambia — `cartellaId` non è più sempre
 * obbligatoria, esattamente uno fra i due lo è. La validazione FINE
 * (il permesso è davvero "Full access"? il percorso esiste davvero?)
 * resta nel registro/custom-task.mjs, stesso principio di sempre.
 */
function requireCustomTaskBody(body) {
  // ⭐⭐⭐ 29/8 — FASE K: stesso principio di requireTaskIdBody, modelloPlanner riusa modelloRichiestaValido.
  const AMMESSE = ['cartellaId', 'cartellaLibera', 'workspaceLaunchId', 'consegna', 'comandoProva', 'modello', 'modelloPlanner', 'reasoning', 'client', 'permessi', 'permessiPerAttrezzo'];
  const chiavi = Object.keys(body ?? {});
  const haCartellaId = 'cartellaId' in body && body.cartellaId !== undefined;
  const haCartellaLibera = 'cartellaLibera' in body && body.cartellaLibera !== undefined;
  const haWorkspaceLaunchId = 'workspaceLaunchId' in body && body.workspaceLaunchId !== undefined;
  const soloAmmesse = chiavi.length > 0 && chiavi.every((k) => AMMESSE.includes(k))
    && [haCartellaId, haCartellaLibera, haWorkspaceLaunchId].filter(Boolean).length === 1 && chiavi.includes('consegna');
  if (
    !soloAmmesse || typeof body.consegna !== 'string'
    || (haCartellaId && typeof body.cartellaId !== 'string')
    || (haCartellaLibera && typeof body.cartellaLibera !== 'string')
    || (haWorkspaceLaunchId && (typeof body.workspaceLaunchId !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(body.workspaceLaunchId)))
    || ('client' in body && body.client !== 'desktop' && body.client !== 'mobile')
  ) {
    const errore = new Error('Corpo non valido: atteso {cartellaId XOR cartellaLibera XOR workspaceLaunchId, consegna, comandoProva?, modello?, modelloPlanner?, reasoning?, client?, permessi?, permessiPerAttrezzo?}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  if ('modello' in body && body.modello !== undefined && !modelloRichiestaValido(body.modello)) {
    const errore = new Error('modello deve avere la forma "vendor/nome-modello" (formato OpenRouter)');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  if ('modelloPlanner' in body && body.modelloPlanner !== undefined && !modelloRichiestaValido(body.modelloPlanner)) {
    const errore = new Error('modelloPlanner deve avere la forma "vendor/nome-modello" (formato OpenRouter)');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  if ('reasoning' in body && !reasoningRichiestaValido(body.reasoning)) {
    const errore = new Error('reasoning deve essere {effort?, summary?} coi valori ammessi da OpenRouter');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  if ('permessi' in body && !permessiRichiestaValido(body.permessi)) {
    const errore = new Error('permessi deve essere uno fra "Read only", "Workspace write", "On request", "Full access"');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  if ('permessiPerAttrezzo' in body && !permessiPerAttrezzoRichiestaValido(body.permessiPerAttrezzo)) {
    const errore = new Error('permessiPerAttrezzo deve mappare scrivi/prova/shell/document_create a "sempre"/"chiedi"/"nega"');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return {
    ...(haCartellaId ? { cartellaId: body.cartellaId } : {}),
    ...(haCartellaLibera ? { cartellaLibera: body.cartellaLibera } : {}),
    ...(haWorkspaceLaunchId ? { workspaceLaunchId: body.workspaceLaunchId } : {}),
    consegna: body.consegna,
    comandoProva: 'comandoProva' in body ? body.comandoProva : undefined,
    modello: 'modello' in body ? body.modello : null,
    modelloPlanner: 'modelloPlanner' in body && body.modelloPlanner !== undefined ? body.modelloPlanner : null,
    reasoning: 'reasoning' in body ? body.reasoning : null,
    mobile: body.client === 'mobile',
    permessi: 'permessi' in body && body.permessi !== undefined ? body.permessi : null,
    permessiPerAttrezzo: 'permessiPerAttrezzo' in body && body.permessiPerAttrezzo !== undefined ? body.permessiPerAttrezzo : null,
  };
}

/**
 * ⭐ 27/8 — corpo di POST /api/v1/automations: {taskId, nome?,
 * intervalloMinuti, limiteAlGiorno?}. Solo la FORMA (tipi, chiavi
 * ammesse) — i tetti duri (intervallo minimo, limite massimo) restano
 * validati in automation-store.crea(), l'unico posto che li dichiara.
 */
function requireAutomationCreateBody(body) {
  const AMMESSE = ['taskId', 'nome', 'intervalloMinuti', 'limiteAlGiorno'];
  const chiavi = Object.keys(body ?? {});
  const soloAmmesse = chiavi.length > 0 && chiavi.every((k) => AMMESSE.includes(k))
    && chiavi.includes('taskId') && chiavi.includes('intervalloMinuti');
  if (!soloAmmesse || typeof body.taskId !== 'string' || typeof body.intervalloMinuti !== 'number') {
    const errore = new Error('Corpo non valido: atteso {taskId, intervalloMinuti, nome?, limiteAlGiorno?}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return {
    taskId: body.taskId,
    nome: typeof body.nome === 'string' ? body.nome : undefined,
    intervalloMinuti: body.intervalloMinuti,
    limiteAlGiorno: typeof body.limiteAlGiorno === 'number' ? body.limiteAlGiorno : undefined,
  };
}

/** ⛔ Un'allowlist di UNA chiave sola: {attiva}, un booleano — niente altro. */
function requireAutomationToggleBody(body) {
  const chiavi = Object.keys(body ?? {});
  if (chiavi.length !== 1 || chiavi[0] !== 'attiva' || typeof body.attiva !== 'boolean') {
    const errore = new Error('Corpo non valido: atteso {attiva: boolean}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return body.attiva;
}

/** ⛔ Un'allowlist di UNA chiave sola, come requireTaskIdBody — la validazione FINE del nome (trim, 1-80) resta in session-registry.rinomina(), qui si controlla solo la FORMA del corpo. */
function requireNomeBody(body) {
  const chiavi = Object.keys(body ?? {});
  if (chiavi.length !== 1 || chiavi[0] !== 'nome' || typeof body.nome !== 'string') {
    const errore = new Error('Corpo non valido: atteso {nome}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return body.nome;
}

/** Allowlist stretta per le preferenze che appartengono alla sessione. */
function requireSessionSettingsBody(body) {
  const ammesse = ['modello', 'modelloPlanner', 'reasoning', 'permessi', 'permessiPerAttrezzo'];
  const chiavi = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [];
  if (chiavi.length === 0 || chiavi.some((chiave) => !ammesse.includes(chiave))) {
    const errore = new Error('Corpo non valido: attesa almeno una preferenza di sessione riconosciuta');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  if ('modello' in body && !modelloRichiestaValido(body.modello)) {
    const errore = new Error('modello deve avere la forma "vendor/nome-modello"');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  if ('modelloPlanner' in body && body.modelloPlanner !== null && !modelloRichiestaValido(body.modelloPlanner)) {
    const errore = new Error('modelloPlanner deve essere null o avere la forma "vendor/nome-modello"');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  if ('reasoning' in body && !reasoningRichiestaValido(body.reasoning)) {
    const errore = new Error('reasoning deve usare effort e summary ammessi');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  if ('permessi' in body && (body.permessi === null || !permessiRichiestaValido(body.permessi))) {
    const errore = new Error('permessi non riconosciuto');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  if ('permessiPerAttrezzo' in body && !permessiPerAttrezzoRichiestaValido(body.permessiPerAttrezzo)) {
    const errore = new Error('permessiPerAttrezzo non riconosciuto');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return Object.fromEntries(chiavi.map((chiave) => [chiave, body[chiave]]));
}

/** ⭐ 27/8 — {percorso}, per elimina/rivela: la validazione FINE del percorso resta in workspace-files.mjs, qui solo la forma. */
function requirePercorsoBody(body) {
  const chiavi = Object.keys(body ?? {});
  if (chiavi.length !== 1 || chiavi[0] !== 'percorso' || typeof body.percorso !== 'string') {
    const errore = new Error('Corpo non valido: atteso {percorso}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return body.percorso;
}

/** ⭐ 28/8 — {percorso, cartellaDestinazione}, per il drag&drop (sposta). cartellaDestinazione può essere '' (radice), mai assente. */
function requireSpostaBody(body) {
  const chiavi = Object.keys(body ?? {});
  const attese = ['percorso', 'cartellaDestinazione'];
  if (chiavi.length !== 2 || !attese.every((k) => chiavi.includes(k)) || typeof body.percorso !== 'string' || typeof body.cartellaDestinazione !== 'string') {
    const errore = new Error('Corpo non valido: atteso {percorso, cartellaDestinazione}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return { percorso: body.percorso, cartellaDestinazione: body.cartellaDestinazione };
}

/** ⭐ 28/8 — {percorsoBase, nome, tipo}, per "Nuovo file"/"Nuova cartella". */
function requireCreaVoceBody(body) {
  const chiavi = Object.keys(body ?? {});
  const attese = ['percorsoBase', 'nome', 'tipo'];
  if (
    chiavi.length !== 3 || !attese.every((k) => chiavi.includes(k))
    || typeof body.percorsoBase !== 'string' || typeof body.nome !== 'string' || typeof body.tipo !== 'string'
  ) {
    const errore = new Error('Corpo non valido: atteso {percorsoBase, nome, tipo}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return { percorsoBase: body.percorsoBase, nome: body.nome, tipo: body.tipo };
}

/** ⭐ 27/8 — {percorso, nuovoNome}, per rinomina. */
function requireRinominaBody(body) {
  const chiavi = Object.keys(body ?? {});
  const attese = ['percorso', 'nuovoNome'];
  if (chiavi.length !== 2 || !attese.every((k) => chiavi.includes(k)) || typeof body.percorso !== 'string' || typeof body.nuovoNome !== 'string') {
    const errore = new Error('Corpo non valido: atteso {percorso, nuovoNome}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return { percorso: body.percorso, nuovoNome: body.nuovoNome };
}

/** ⛔ Un'allowlist di UNA chiave sola, come requireTaskIdBody — solo la FORMA, mai vuoto (un comando vuoto non esegue niente di utile ed è un segno di un chiamante rotto). */
function requireComandoBody(body) {
  const chiavi = Object.keys(body ?? {});
  if (chiavi.length !== 1 || chiavi[0] !== 'comando' || typeof body.comando !== 'string' || body.comando.trim().length === 0) {
    const errore = new Error('Corpo non valido: atteso {comando}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return body.comando;
}

/**
 * ⭐⭐⭐ 28/8 — la risposta dell'owner a un'ApprovalRequested (permesso "On
 * request"). `requestId` obbligatorio — mai un endpoint che risponde
 * "all'ultima richiesta pendente", vedi la doc di
 * session-registry.rispondiApprovazione sul perché.
 */
function requireApprovaBody(body) {
  const chiavi = Object.keys(body ?? {});
  const AMMESSE = ['requestId', 'approvato'];
  if (
    chiavi.length !== 2 || !chiavi.every((k) => AMMESSE.includes(k))
    || typeof body.requestId !== 'string' || body.requestId.length === 0
    || typeof body.approvato !== 'boolean'
  ) {
    const errore = new Error('Corpo non valido: atteso {requestId, approvato}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return { requestId: body.requestId, approvato: body.approvato };
}

/**
 * ⭐⭐⭐⭐ FASE N, nono e ultimo sistema (30/8) — Tool Forge. L'UNICA
 * mutazione owner-facing di tutta FASE N (vedi la doc in
 * tool-forge-store.mjs) — stesso stile di requireApprovaBody appena
 * sopra.
 */
function requireAbilitaForgeBody(body) {
  const chiavi = Object.keys(body ?? {});
  if (chiavi.length !== 1 || chiavi[0] !== 'abilitato' || typeof body.abilitato !== 'boolean') {
    const errore = new Error('Corpo non valido: atteso {abilitato}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return { abilitato: body.abilitato };
}

/**
 * ⭐⭐⭐ FASE D (28/8) — un messaggio da accodare su una sessione ancora in
 * corso. Stesso stile di requireComandoBody: valida solo la FORMA (una
 * stringa non vuota) — il rifiuto SEMANTICO (sessione conclusa, coda su un
 * id inesistente) resta a sessionRegistry.accodaMessaggio, mai duplicato qui.
 */
function requireQueueBody(body) {
  const chiavi = Object.keys(body ?? {});
  if (chiavi.length !== 1 || chiavi[0] !== 'messaggio' || typeof body.messaggio !== 'string' || body.messaggio.trim().length === 0) {
    const errore = new Error('Corpo non valido: atteso {messaggio}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return body.messaggio;
}

/** Resume legacy senza body oppure nuovo turno con una sola stringa non vuota. */
function requireResumeBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    const errore = new Error('Corpo non valido: atteso {messaggio?}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  const chiavi = Object.keys(body);
  if (chiavi.length === 0) return null;
  if (chiavi.length !== 1 || chiavi[0] !== 'messaggio' || typeof body.messaggio !== 'string' || body.messaggio.trim().length === 0) {
    const errore = new Error('Corpo non valido: atteso {messaggio?}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return body.messaggio.trim();
}

const REDIRECT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function requireRedirectId(value) {
  if (typeof value !== 'string' || !REDIRECT_ID_PATTERN.test(value)) {
    const errore = new Error('Identificatore del reindirizzamento non valido');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return value.toLowerCase();
}

/** Forma stretta, con id opzionale per la compatibilità dei client precedenti. */
function requireRedirectBody(body) {
  const chiavi = Object.keys(body ?? {});
  const ammesse = new Set(['messaggio', 'redirectId']);
  if (chiavi.length < 1 || chiavi.length > 2 || !chiavi.every((chiave) => ammesse.has(chiave)) || !chiavi.includes('messaggio') || typeof body.messaggio !== 'string' || body.messaggio.trim().length === 0) {
    const errore = new Error('Corpo non valido: atteso {messaggio, redirectId?}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return {
    messaggio: body.messaggio.trim(),
    redirectId: body.redirectId === undefined ? null : requireRedirectId(body.redirectId),
  };
}

/** Stop resta compatibile con il corpo vuoto e può tombstonare un redirect in volo. */
function requireStopBody(body) {
  const chiavi = Object.keys(body ?? {});
  if (chiavi.length === 0) return null;
  if (chiavi.length !== 1 || chiavi[0] !== 'redirectId') {
    const errore = new Error('Corpo non valido: atteso {redirectId?}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return requireRedirectId(body.redirectId);
}

/*
 * Scrive un evento AG-UI come frame SSE. Torna false (e non scrive) se la
 * risposta è già chiusa.
 *
 * ⛔⛔ 27/8, ricerca web (SSE reconnection): una riga `id:` PRIMA di `data:`
 * è ciò che fa scattare `Last-Event-ID` sulla riconnessione NATIVA del
 * browser — senza, EventSource non ha nulla da mandare indietro e ogni
 * riconnessione ripete l'intero buffer via rete (vedi iscriviti()).
 */
function scriviEventoSse(res, evento) {
  if (res.writableEnded || res.destroyed) return false;
  if (typeof evento._sequenza === 'number') res.write(`id: ${evento._sequenza}\n`);
  res.write(`data: ${JSON.stringify(evento)}\n\n`);
  return true;
}

/**
 * @param {object} deps
 * @param {(pathname:string)=>Promise<object|null>} deps.staticHandler
 * @param {object} deps.sessionRegistry — vedi session-registry.mjs. Se
 *   assente, le rotte POST/sessioni tornano NOT_FOUND invece di lanciare:
 *   Harness UI resta utilizzabile in sola lettura anche senza configurare
 *   l'esecuzione — stesso principio del `chiaveApi` opzionale in config.mjs.
 * @param {()=>Array<object>} [deps.listaTaskDisponibili]
 */
export function createHttpApp({
  staticHandler, sessionRegistry = null, listaTaskDisponibili = () => [],
  elencaCartelleProgetto = () => [], automationStore = null, diagnosiFn = null,
  workspaceLaunchStore = null,
  workspaceBrowser = null,
  // ⭐⭐⭐ 28/8 — owner, coda: "directory più usate (tipo desktop downloads)". Zero config esterna (solo os.homedir()) — il default reale basta, nessun cablaggio in server.mjs come serve invece per elencaCartelleProgetto (quella dipende da TALOS_HARNESS_UI_PROJECT_DIRS).
  cartelleFrequentiFn = cartelleFrequentiReale,
  catalogoModelliFn = null, clock = () => new Date(), leggiArtefattoFn = leggiArtefattoReale,
  capacitaMacchinaFn = null,
  localRuntimes = null, localModelStore = null, localModelTransfer = null, hfHubClient = null,
  localRuntimeProbe = null,
  hfImageProxyFn = null,
  runtimeBootstrapFn = null,
  providerStore = null,
  /** ⭐ 03/9 — la sonda che chiede al provider se accetta la credenziale. Facoltativa: senza, la rotta di prova risponde «non configurata» invece di fingere un esito. */
  providerProbe = null,
  // ⛔⛔⛔ 28/8 — iniettabili SOLO per il test del battito SSE sotto: mai un setInterval reale nei test unitari, stesso principio di ogni altra dipendenza di questo file.
  impostaIntervalloFn = setInterval, cancellaIntervalloFn = clearInterval,
}) {
  async function handle(req, res) {
    if (req.aborted || res.destroyed) return;
    const method = req.method || 'GET';

    /*
     * ⛔ CORS — piano `procedi-col-generare-un-snoopy-neumann.md`, Fase 3.
     * Desktop (Chrome che carica la pagina DA questo stesso server) non ne
     * ha bisogno: stessa origine, `Origin` assente o già coincidente,
     * questa intestazione non cambia nulla. Mobile (`app.js` montato dentro
     * il documento TALOS, origine Capacitor — `http://localhost` su
     * Android) è cross-origin per davvero: senza questa intestazione il
     * browser bloccherebbe la LETTURA della risposta anche col tunnel
     * `adb reverse` attivo, per `fetch` e per `EventSource` allo stesso
     * modo. Riflette `Origin` invece di un `*` fisso o di indovinare lo
     * schema Capacitor: il perimetro di sicurezza resta "raggiungibile solo
     * via loopback/tunnel già posseduto dall'owner" (`README.md`), riflettere
     * l'origine non lo allarga — chi non può già raggiungere `127.0.0.1:4174`
     * non può nemmeno mandare la richiesta che leggerebbe questa intestazione.
     */
    const requestOrigin = req.headers.origin;
    if (requestOrigin) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      res.setHeader('Vary', 'Origin');
    }
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, HEAD, POST',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
      });
      res.end();
      return;
    }

    const requestTarget = req.url || '/';
    if (Buffer.byteLength(requestTarget, 'utf8') > MAX_REQUEST_TARGET_BYTES) {
      sendJson(res, 413, errorEnvelope('PAYLOAD_LIMIT', clock), method);
      return;
    }

    let url;
    try {
      url = new URL(requestTarget, 'http://127.0.0.1');
    } catch {
      sendJson(res, 400, errorEnvelope('QUERY_INVALID', clock), method);
      return;
    }

    if (method === 'POST' && workspaceLaunchStore && url.pathname === '/api/v1/workspace-launches') {
      try {
        requireNoQuery(url);
        const body = await leggiCorpoJson(req);
        const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [];
        if (keys.length !== 1 || keys[0] !== 'percorso' || typeof body.percorso !== 'string') {
          const error = new Error('Scegli una cartella valida');
          error.code = 'QUERY_INVALID';
          throw error;
        }
        const data = workspaceLaunchStore.create({
          percorso: body.percorso,
          credential: req.headers['x-talos-launcher-token'],
        });
        sendJson(res, 200, successEnvelope(data, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    if (method === 'POST' && url.pathname === '/api/v1/workspace-browser/folders') {
      try {
        requireNoQuery(url);
        const body = await leggiCorpoJson(req);
        const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [];
        if (keys.length !== 2
          || !keys.includes('parentPath')
          || !keys.includes('name')
          || typeof body.parentPath !== 'string'
          || typeof body.name !== 'string') {
          const error = new Error('Scegli una cartella e un nome validi');
          error.code = 'QUERY_INVALID';
          throw error;
        }
        if (!workspaceBrowser || typeof workspaceBrowser.createFolder !== 'function') {
          const error = new Error('Creazione cartella non disponibile');
          error.code = 'WORKSPACE_NOT_AVAILABLE';
          throw error;
        }
        const data = await workspaceBrowser.createFolder(body.parentPath, body.name);
        sendJson(res, 200, successEnvelope(data, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    /*
     * ⛔⛔ LE ROTTE POST SONO UN'ECCEZIONE NOMINATA, qui in cima, PRIMA del
     * blanket-405 che segue — non "tutto ciò che non è GET viene rifiutato
     * altrove". Prima di questo file Harness UI era read-only per
     * costruzione (ogni metodo diverso da GET/HEAD tornava 405 su
     * QUALUNQUE path, statico o API); quel contratto resta vero alla
     * lettera per ogni path che non sia una di queste due — sono provate
     * dal test esistente ("api rejects POST... con 405"), che si aspetta
     * 405 su `/api/v1/health`, non 404.
     */
    if (method === 'POST' && sessionRegistry && url.pathname === '/api/v1/sessions') {
      try {
        requireNoQuery(url);
        const corpo = await leggiCorpoJson(req);
        const { taskId, modello, modelloPlanner, reasoning, mobile, permessi, permessiPerAttrezzo, provider, runtimeId, modelId, fallbackConsent } = requireTaskIdBody(corpo);
        const opzioniSessione = {
          modelloScelto: modello, modelloPlannerScelto: modelloPlanner, reasoningScelto: reasoning, mobile,
          permessiScelto: permessi, permessiPerAttrezzoScelto: permessiPerAttrezzo,
        };
        if (provider !== 'cloud' || runtimeId !== null || modelId !== null || fallbackConsent === true) {
          Object.assign(opzioniSessione, { provider, runtimeId, modelId, fallbackConsent });
        }
        const esito = sessionRegistry.avvia(taskId, opzioniSessione);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ sessionId: esito.sessionId }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    /* Provider accessi: il corpo contiene la chiave solo nel tragitto locale
     * verso il server; nessuna risposta o sessione la riflette. */
    /*
     * ⭐⭐⭐ 03/9 — «questa chiave funziona davvero?».
     *
     * Fino a oggi il pannello sapeva dire solo che una stringa era stata
     * salvata, che è una cosa diversa dall'essere accettata dal provider. La
     * prova chiama il provider per davvero (elenco modelli, la chiamata più
     * economica che dimostri l'autenticazione) e riporta il suo esito.
     *
     * ⛔ POST e non GET benché non cambi niente sul server: esce una richiesta
     * verso un servizio esterno con la credenziale dell'owner, e una cosa che
     * esce non deve poter partire da un link, da un prefetch del browser o da
     * una barra degli indirizzi.
     */
    const providerTestMatch = /^\/api\/v1\/providers\/([^/]+)\/test$/.exec(url.pathname);
    if (method === 'POST' && providerTestMatch) {
      try {
        requireNoQuery(url);
        if (!providerProbe || typeof providerProbe.prova !== 'function') { const error = new Error('Prova provider non configurata'); error.code = 'PROVIDER_STORE_UNAVAILABLE'; throw error; }
        const data = await providerProbe.prova(decodeURIComponent(providerTestMatch[1]));
        sendJson(res, 200, successEnvelope(data, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    const providerKeyMatch = /^\/api\/v1\/providers\/([^/]+)\/key(?:\/(remove))?$/.exec(url.pathname);
    const providerRuntimeMatch = /^\/api\/v1\/providers\/([^/]+)\/runtime(?:\/(reset))?$/.exec(url.pathname);
    if (method === 'POST' && (providerKeyMatch || providerRuntimeMatch)) {
      try {
        requireNoQuery(url);
        if (!providerStore) { const error = new Error('Portachiavi provider non configurato'); error.code = 'PROVIDER_STORE_UNAVAILABLE'; throw error; }
        const provider = decodeURIComponent((providerKeyMatch || providerRuntimeMatch)[1]);
        const body = await leggiCorpoJson(req, 16 * 1024);
        let data;
        if (providerKeyMatch) {
          const remove = providerKeyMatch[2] === 'remove';
          const keys = Object.keys(body || {});
          if (remove) {
            if (keys.length !== 0) { const error = new Error('Corpo non valido'); error.code = 'QUERY_INVALID'; throw error; }
            data = providerStore.clearKey(provider);
          } else {
            if (keys.length !== 1 || keys[0] !== 'key') { const error = new Error('Corpo non valido'); error.code = 'QUERY_INVALID'; throw error; }
            data = providerStore.setKey(provider, body.key);
          }
        } else {
          const reset = providerRuntimeMatch[2] === 'reset';
          const keys = Object.keys(body || {});
          if (reset) {
            if (keys.length !== 0) { const error = new Error('Corpo non valido'); error.code = 'QUERY_INVALID'; throw error; }
            data = providerStore.resetEndpoint(provider);
          } else {
            if (keys.some((key) => !['endpoint', 'timeoutSeconds'].includes(key)) || typeof body.endpoint !== 'string' || !Object.hasOwn(body, 'timeoutSeconds')) {
              const error = new Error('Corpo runtime non valido'); error.code = 'QUERY_INVALID'; throw error;
            }
            data = providerStore.setRuntime(provider, { endpoint: body.endpoint, timeoutSeconds: body.timeoutSeconds });
          }
        }
        sendJson(res, 200, successEnvelope(data, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    if (method === 'POST' && sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/cancel$/.test(url.pathname)) {
      try {
        requireNoQuery(url);
        const sessionId = decodeURIComponent(url.pathname.split('/')[4]);
        const stopped = sessionRegistry.ferma(sessionId);
        if (!stopped) { const error = new Error('Sessione non trovata'); error.code = 'NOT_FOUND'; throw error; }
        sendJson(res, 200, successEnvelope({ ok: true, sessionId }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    if (method === 'POST' && url.pathname === '/api/v1/runtime/load') {
      try {
        requireNoQuery(url);
        const body = await leggiCorpoJson(req);
        if (!localRuntimes || typeof body?.runtimeId !== 'string' || typeof body?.modelId !== 'string') { const error = new Error('Corpo runtime non valido'); error.code = 'QUERY_INVALID'; throw error; }
        const runtime = localRuntimes[body.runtimeId];
        if (!runtime || typeof runtime.load !== 'function') { const error = new Error('Runtime locale non disponibile'); error.code = 'RUNTIME_NOT_AVAILABLE'; throw error; }
        const data = await runtime.load(body.modelId, { contextLength: body.contextLength });
        sendJson(res, 200, successEnvelope(data, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    if (method === 'POST' && url.pathname === '/api/v1/runtime/unload') {
      try {
        requireNoQuery(url);
        const body = await leggiCorpoJson(req);
        /*
         * ⛔⛔⛔ 02/9 (notte) — `modelId` era OBBLIGATORIO qui, ma
         * l'implementazione lo IGNORA: `unload()` in
         * `local-runtime-llama-server.mjs` non prende argomenti e fa
         * `supervisor.stop()` — scaricare significa fermare il runtime, non
         * togliere il modello X. E il server non espone da nessuna parte
         * QUALE modello sia caricato (`status()` dà stato, porta e baseUrl,
         * mai il modello), quindi un chiamante onesto non poteva nemmeno
         * procurarselo: la rotta chiedeva un dato che non esiste.
         * ⇒ Reso opzionale. `runtimeId` resta obbligatorio: quello sceglie
         * davvero su chi agire.
         * ⛔ Trovato provando il pulsante «Libera la memoria» dal vivo con un
         * modello VERAMENTE caricato — nessun test copriva questa rotta.
         */
        if (!localRuntimes || typeof body?.runtimeId !== 'string' || (body?.modelId !== undefined && typeof body.modelId !== 'string')) { const error = new Error('Corpo runtime non valido'); error.code = 'QUERY_INVALID'; throw error; }
        const runtime = localRuntimes[body.runtimeId];
        if (!runtime || typeof runtime.unload !== 'function') { const error = new Error('Runtime locale non disponibile'); error.code = 'RUNTIME_NOT_AVAILABLE'; throw error; }
        const data = await runtime.unload(body.modelId);
        sendJson(res, 200, successEnvelope(data, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    if (method === 'POST' && url.pathname === '/api/v1/local-models/import') {
      try {
        requireNoQuery(url);
        const contentType = String(req.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
        const id = String(req.headers['x-talos-model-id'] || '').trim();
        const filename = String(req.headers['x-talos-model-filename'] || '').trim();
        const nameHeader = req.headers['x-talos-model-name'];
        const expectedBytes = Number(req.headers['x-talos-model-bytes']);
        if (contentType !== 'application/octet-stream' || !id || !filename || !Number.isSafeInteger(expectedBytes) || expectedBytes <= 0) { const error = new Error('Scegli un file GGUF valido'); error.code = 'LOCAL_IMPORT_INVALID'; throw error; }
        if (!localModelTransfer || typeof localModelTransfer.importStream !== 'function') { const error = new Error('Import locale non disponibile'); error.code = 'RUNTIME_NOT_AVAILABLE'; throw error; }
        const data = await localModelTransfer.importStream(req, { id, filename, expectedBytes, ...(typeof nameHeader === 'string' ? { name: nameHeader } : {}) });
        sendJson(res, 200, successEnvelope(data, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    if (method === 'POST' && /^\/api\/v1\/local-models\/([^/]+)\/(rename|copy-path|delete)$/.test(url.pathname)) {
      try {
        requireNoQuery(url);
        const match = /^\/api\/v1\/local-models\/([^/]+)\/(rename|copy-path|delete)$/.exec(url.pathname);
        const id = decodeURIComponent(match[1]);
        if (!localModelStore) { const error = new Error('Modelli locali non configurati'); error.code = 'RUNTIME_NOT_AVAILABLE'; throw error; }
        const action = match[2];
        if (action === 'rename') {
          const body = await leggiCorpoJson(req);
          if (typeof localModelStore.rename !== 'function' || typeof body?.name !== 'string') { const error = new Error('Nome modello non valido'); error.code = 'QUERY_INVALID'; throw error; }
          sendJson(res, 200, successEnvelope(await localModelStore.rename(id, body.name), clock), method);
        } else if (action === 'copy-path') {
          const model = typeof localModelStore.inspect === 'function' ? await localModelStore.inspect(id) : null;
          if (!model) { const error = new Error('Modello non trovato'); error.code = 'NOT_FOUND'; throw error; }
          sendJson(res, 200, successEnvelope({ id, path: model.path }, clock), method);
        } else {
          if (typeof localModelStore.remove !== 'function') { const error = new Error('Eliminazione modello non configurata'); error.code = 'RUNTIME_NOT_AVAILABLE'; throw error; }
          await localModelStore.remove(id);
          sendJson(res, 200, successEnvelope({ id, deleted: true }, clock), method);
        }
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    /*
     * ⭐⭐⭐ 02/9 — Fase 5, punto 4 del piano ("prima di load"): header GGUF
     * reale + capacità macchina reale + un giro di probe sul runtime, MAI
     * un caricamento vero — sola lettura, sicura da chiamare prima che
     * l'owner decida di caricare il modello per davvero. `qualify()` (che
     * fa girare il modello per un giro reale) resta un incremento
     * successivo, dichiarato non implementato qui.
     */
    /*
     * ⭐⭐⭐ 03/9 — la stima PRIMA dello scaricamento, per una variante che
     * sul disco non c'è ancora (una quantizzazione su Hugging Face).
     *
     * ⛔ Sta PRIMA della rotta `/:id/fit` per una ragione meccanica, non
     * estetica: `([^/]+)` combacia anche con la parola `fit-estimate`, e
     * messa dopo questa rotta non verrebbe mai raggiunta — cercherebbe un
     * modello che si chiama «fit-estimate» e risponderebbe MODEL_NOT_FOUND.
     */
    if (method === 'GET' && url.pathname === '/api/v1/local-models/fit-estimate') {
      try {
        if (!localRuntimeProbe) { const error = new Error('Probe runtime locale non configurato'); error.code = 'RUNTIME_NOT_AVAILABLE'; throw error; }
        for (const key of url.searchParams.keys()) { if (key !== 'bytes' && key !== 'contextTokens') { const error = new Error('Query non valida'); error.code = 'QUERY_INVALID'; throw error; } }
        const bytes = Number(url.searchParams.get('bytes'));
        const contextRaw = url.searchParams.get('contextTokens');
        const contextTokens = contextRaw === null ? null : Number(contextRaw);
        const data = await localRuntimeProbe.estimateFit({ bytes, contextTokens });
        sendJson(res, 200, successEnvelope(data, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    if (method === 'GET' && /^\/api\/v1\/local-models\/([^/]+)\/fit$/.test(url.pathname)) {
      try {
        const match = /^\/api\/v1\/local-models\/([^/]+)\/fit$/.exec(url.pathname);
        const id = decodeURIComponent(match[1]);
        if (!localRuntimeProbe) { const error = new Error('Probe runtime locale non configurato'); error.code = 'RUNTIME_NOT_AVAILABLE'; throw error; }
        const profileParam = url.searchParams.get('profile');
        const contextParam = url.searchParams.get('contextTokens');
        const options = {};
        if (profileParam !== null) options.profile = profileParam;
        if (contextParam !== null) {
          const parsed = Number(contextParam);
          if (!Number.isSafeInteger(parsed) || parsed <= 0) { const error = new Error('contextTokens non valido'); error.code = 'FIT_INVALID'; throw error; }
          options.contextTokens = parsed;
        }
        // Solo profile/contextTokens sono ammessi — qualunque altro parametro è un errore, non ignorato in silenzio.
        for (const key of url.searchParams.keys()) { if (key !== 'profile' && key !== 'contextTokens') { const error = new Error('Query non valida'); error.code = 'QUERY_INVALID'; throw error; } }
        const data = await localRuntimeProbe.fit(id, options);
        sendJson(res, 200, successEnvelope(data, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    /*
     * ⭐⭐⭐ 02/9 — Fase 5, punto 4, il secondo pezzo del probe: un giro di
     * generazione REALE ("Reply with OK.", già scritto in qualify()) per
     * confermare che il modello funziona davvero, non solo che "dovrebbe
     * stare in memoria". A differenza di /fit (sola lettura, sempre
     * sicura), questa chiama per davvero il runtime — richiede
     * `consent:true` esplicito nel corpo (già imposto da qualify() stesso,
     * non solo qui: due livelli della stessa guardia).
     */
    if (method === 'POST' && /^\/api\/v1\/local-models\/([^/]+)\/qualify$/.test(url.pathname)) {
      try {
        requireNoQuery(url);
        const match = /^\/api\/v1\/local-models\/([^/]+)\/qualify$/.exec(url.pathname);
        const id = decodeURIComponent(match[1]);
        if (!localRuntimeProbe) { const error = new Error('Probe runtime locale non configurato'); error.code = 'RUNTIME_NOT_AVAILABLE'; throw error; }
        const body = await leggiCorpoJson(req);
        const options = { modelId: id, consent: body?.consent === true };
        if (typeof body?.profile === 'string') options.profile = body.profile;
        if (body?.contextTokens !== undefined) {
          if (!Number.isSafeInteger(body.contextTokens) || body.contextTokens <= 0) { const error = new Error('contextTokens non valido'); error.code = 'FIT_INVALID'; throw error; }
          options.contextTokens = body.contextTokens;
        }
        const data = await localRuntimeProbe.qualify(options);
        sendJson(res, 200, successEnvelope(data, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    if (method === 'POST' && url.pathname === '/api/v1/huggingface/download') {
      try {
        requireNoQuery(url);
        const body = await leggiCorpoJson(req, 1_000_000);
        if (!localModelTransfer || typeof localModelTransfer.start !== 'function') { const error = new Error('Download Hugging Face non configurato'); error.code = 'RUNTIME_NOT_AVAILABLE'; throw error; }
        const data = await localModelTransfer.start(body);
        sendJson(res, 200, successEnvelope(data, clock), method);
      } catch (error) { const normalized = normalizeError(error); sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method); }
      return;
    }
    if (method === 'POST' && /^\/api\/v1\/huggingface\/downloads\/([^/]+)\/(pause|resume|cancel)$/.test(url.pathname)) {
      try {
        requireNoQuery(url); const match = /^\/api\/v1\/huggingface\/downloads\/([^/]+)\/(pause|resume|cancel)$/.exec(url.pathname); const id = decodeURIComponent(match[1]);
        if (!localModelTransfer || typeof localModelTransfer[match[2]] !== 'function') { const error = new Error('Download Hugging Face non configurato'); error.code = 'RUNTIME_NOT_AVAILABLE'; throw error; }
        const changed = await localModelTransfer[match[2]](id); if (!changed) { const error = new Error('Download non trovato o non modificabile'); error.code = 'NOT_FOUND'; throw error; }
        sendJson(res, 200, successEnvelope(localModelTransfer.status(id), clock), method);
      } catch (error) { const normalized = normalizeError(error); sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method); }
      return;
    }

    /*
     * ⭐⭐⭐ 27/8 — un compito LIBERO su una cartella dell'allowlist, owner:
     * "per adesso un allowlist per testare... come se fosse Claude Code".
     * Stesso stile dell'endpoint sopra, corpo diverso: {cartellaId,
     * consegna, comandoProva?, modello?} invece di {taskId, modello?}.
     */
    if (method === 'POST' && sessionRegistry && url.pathname === '/api/v1/sessions/custom') {
      try {
        requireNoQuery(url);
        const corpo = await leggiCorpoJson(req);
        const richiesta = requireCustomTaskBody(corpo);
        const esito = sessionRegistry.avviaLibero(richiesta);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ sessionId: esito.sessionId }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    /*
     * ⭐⭐⭐ 27/8 — blocco 7 (Automazioni), la vera schedulazione. Owner:
     * "hai il mio via libera". Tre rotte, stesso stile POST-per-azione già
     * in uso ovunque in questo file (mai un vero DELETE HTTP, coerenza
     * prima di purezza REST).
     */
    if (method === 'POST' && automationStore && url.pathname === '/api/v1/automations') {
      try {
        requireNoQuery(url);
        const corpo = await leggiCorpoJson(req);
        const richiesta = requireAutomationCreateBody(corpo);
        const voce = await automationStore.crea(richiesta);
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope(voce, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    const automationToggleMatch = method === 'POST' && automationStore
      && /^\/api\/v1\/automations\/([^/]+)\/toggle$/.exec(url.pathname);
    if (automationToggleMatch) {
      try {
        requireNoQuery(url);
        let automationId;
        try {
          automationId = decodeURIComponent(automationToggleMatch[1]);
        } catch {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        const corpo = await leggiCorpoJson(req);
        const attivaValore = requireAutomationToggleBody(corpo);
        const voce = await automationStore.imposta(automationId, attivaValore);
        if (!voce) { sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method); return; }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope(voce, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    const automationEliminaMatch = method === 'POST' && automationStore
      && /^\/api\/v1\/automations\/([^/]+)\/elimina$/.exec(url.pathname);
    if (automationEliminaMatch) {
      try {
        requireNoQuery(url);
        let automationId;
        try {
          automationId = decodeURIComponent(automationEliminaMatch[1]);
        } catch {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        const corpo = await leggiCorpoJson(req);
        if (Object.keys(corpo ?? {}).length !== 0) {
          const errore = new Error('Corpo non valido: atteso {}'); errore.code = 'QUERY_INVALID'; throw errore;
        }
        await automationStore.elimina(automationId);
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ ok: true }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    const renameMatch = method === 'POST' && sessionRegistry
      && /^\/api\/v1\/sessions\/([^/]+)\/rename$/.exec(url.pathname);
    if (renameMatch) {
      try {
        requireNoQuery(url);
        let sessionId;
        try {
          sessionId = decodeURIComponent(renameMatch[1]);
        } catch {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        const corpo = await leggiCorpoJson(req);
        const nome = requireNomeBody(corpo);
        const esito = await sessionRegistry.rinomina(sessionId, nome);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ ok: true }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    /*
     * ⭐⭐⭐ 30/8, QA visiva (Task 14) — trovato dal vivo: nessun modo di
     * eliminare una sessione, in nessun punto (client, server, disco) —
     * 144+ sessioni accumulate in un solo giro di QA senza pulizia
     * possibile. Stesso schema POST-per-azione di renameMatch appena
     * sopra (e di /tree/delete più sotto) — coerenza con la convenzione
     * già in uso in questo file, non il verbo HTTP DELETE puro.
     */
    const deleteSessionMatch = method === 'POST' && sessionRegistry
      && /^\/api\/v1\/sessions\/([^/]+)\/delete$/.exec(url.pathname);
    if (deleteSessionMatch) {
      try {
        requireNoQuery(url);
        let sessionId;
        try {
          sessionId = decodeURIComponent(deleteSessionMatch[1]);
        } catch {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        const esito = await sessionRegistry.elimina(sessionId);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ ok: true }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    /*
     * ⭐⭐⭐ 27/8, owner: "non ha opzioni per rinominare i file... per
     * eliminarlo... per aprirli nel visualizza file explorer di Windows"
     * — tre azioni sul FILE dell'albero (non sulla sessione, come
     * renameMatch sopra), stesso schema POST-per-azione già in uso
     * ovunque in questo file.
     */
    const renameFileMatch = method === 'POST' && sessionRegistry
      && /^\/api\/v1\/sessions\/([^/]+)\/tree\/rename$/.exec(url.pathname);
    if (renameFileMatch) {
      try {
        requireNoQuery(url);
        let sessionId;
        try {
          sessionId = decodeURIComponent(renameFileMatch[1]);
        } catch {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        const corpo = await leggiCorpoJson(req);
        const { percorso, nuovoNome } = requireRinominaBody(corpo);
        const esito = await sessionRegistry.rinominaFile(sessionId, percorso, nuovoNome);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ nuovoPercorso: esito.nuovoPercorso }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    const deleteFileMatch = method === 'POST' && sessionRegistry
      && /^\/api\/v1\/sessions\/([^/]+)\/tree\/delete$/.exec(url.pathname);
    if (deleteFileMatch) {
      try {
        requireNoQuery(url);
        let sessionId;
        try {
          sessionId = decodeURIComponent(deleteFileMatch[1]);
        } catch {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        const corpo = await leggiCorpoJson(req);
        const percorso = requirePercorsoBody(corpo);
        const esito = await sessionRegistry.eliminaFile(sessionId, percorso);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ eliminato: true }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    const revealFileMatch = method === 'POST' && sessionRegistry
      && /^\/api\/v1\/sessions\/([^/]+)\/tree\/reveal$/.exec(url.pathname);
    if (revealFileMatch) {
      try {
        requireNoQuery(url);
        let sessionId;
        try {
          sessionId = decodeURIComponent(revealFileMatch[1]);
        } catch {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        const corpo = await leggiCorpoJson(req);
        const percorso = requirePercorsoBody(corpo);
        const esito = await sessionRegistry.rivelaFile(sessionId, percorso);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ rivelato: true }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    /*
     * ⭐⭐⭐ 28/8, owner: "nella lista files devo poter draggare i file...
     * non esiste il comando copia... e comandi crud in generale" — stesso
     * schema POST-per-azione delle tre rotte sopra.
     */
    const moveFileMatch = method === 'POST' && sessionRegistry
      && /^\/api\/v1\/sessions\/([^/]+)\/tree\/move$/.exec(url.pathname);
    if (moveFileMatch) {
      try {
        requireNoQuery(url);
        let sessionId;
        try {
          sessionId = decodeURIComponent(moveFileMatch[1]);
        } catch {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        const corpo = await leggiCorpoJson(req);
        const { percorso, cartellaDestinazione } = requireSpostaBody(corpo);
        const esito = await sessionRegistry.spostaFile(sessionId, percorso, cartellaDestinazione);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ nuovoPercorso: esito.nuovoPercorso }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    const copyFileMatch = method === 'POST' && sessionRegistry
      && /^\/api\/v1\/sessions\/([^/]+)\/tree\/copy$/.exec(url.pathname);
    if (copyFileMatch) {
      try {
        requireNoQuery(url);
        let sessionId;
        try {
          sessionId = decodeURIComponent(copyFileMatch[1]);
        } catch {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        const corpo = await leggiCorpoJson(req);
        const percorso = requirePercorsoBody(corpo);
        const esito = await sessionRegistry.copiaFile(sessionId, percorso);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ nuovoPercorso: esito.nuovoPercorso }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    const createFileMatch = method === 'POST' && sessionRegistry
      && /^\/api\/v1\/sessions\/([^/]+)\/tree\/create$/.exec(url.pathname);
    if (createFileMatch) {
      try {
        requireNoQuery(url);
        let sessionId;
        try {
          sessionId = decodeURIComponent(createFileMatch[1]);
        } catch {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        const corpo = await leggiCorpoJson(req);
        const { percorsoBase, nome, tipo } = requireCreaVoceBody(corpo);
        const esito = await sessionRegistry.creaVoceWorkspace(sessionId, percorsoBase, nome, tipo);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ percorso: esito.percorso }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    const stopMatch = method === 'POST' && sessionRegistry
      && /^\/api\/v1\/sessions\/([^/]+)\/stop$/.exec(url.pathname);
    if (stopMatch) {
      try {
        requireNoQuery(url);
        let sessionId;
        try {
          sessionId = decodeURIComponent(stopMatch[1]);
        } catch {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        const redirectId = requireStopBody(await leggiCorpoJson(req));
        const fermata = sessionRegistry.ferma(sessionId, redirectId ? { redirectId } : {});
        if (!fermata) {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ stopped: true }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    const redirectMatch = method === 'POST' && sessionRegistry
      && /^\/api\/v1\/sessions\/([^/]+)\/redirect$/.exec(url.pathname);
    if (redirectMatch) {
      try {
        requireNoQuery(url);
        let sessionId;
        try {
          sessionId = decodeURIComponent(redirectMatch[1]);
        } catch {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        const { messaggio, redirectId } = requireRedirectBody(await leggiCorpoJson(req));
        const esito = sessionRegistry.reindirizza(sessionId, messaggio, redirectId ? { redirectId } : {});
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ ok: true, redirectId: esito.redirectId }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    const forkMatch = method === 'POST' && sessionRegistry
      && /^\/api\/v1\/sessions\/([^/]+)\/fork$/.exec(url.pathname);
    if (forkMatch) {
      try {
        requireNoQuery(url);
        let sessionIdOrigine;
        try {
          sessionIdOrigine = decodeURIComponent(forkMatch[1]);
        } catch {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        const esito = sessionRegistry.forka(sessionIdOrigine);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ sessionId: esito.sessionId }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    const resumeMatch = method === 'POST' && sessionRegistry
      && /^\/api\/v1\/sessions\/([^/]+)\/resume$/.exec(url.pathname);
    if (resumeMatch) {
      try {
        requireNoQuery(url);
        let sessionId;
        try {
          sessionId = decodeURIComponent(resumeMatch[1]);
        } catch {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        /*
         * ⛔⛔⛔ 27/8 — `messaggio` OPZIONALE: senza, resta il resume di
         * sempre (riprende un giro interrotto, nessuna domanda nuova). Con
         * un `messaggio` stringa non vuota, è un secondo turno di chat
         * reale — vedi la doc su session-registry.mjs resume(). Mai un
         * campo diverso da stringa: un body malformato resta silenziosamente
         * "nessun messaggio nuovo" invece di rompere il resume classico.
         */
        const nuovoMessaggioUtente = requireResumeBody(await leggiCorpoJson(req));
        const esito = sessionRegistry.resume(sessionId, nuovoMessaggioUtente);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ sessionId: esito.sessionId }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    const settingsMatch = method === 'POST' && sessionRegistry
      && /^\/api\/v1\/sessions\/([^/]+)\/settings$/.exec(url.pathname);
    if (settingsMatch) {
      try {
        requireNoQuery(url);
        let sessionId;
        try {
          sessionId = decodeURIComponent(settingsMatch[1]);
        } catch {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        const patch = requireSessionSettingsBody(await leggiCorpoJson(req));
        const esito = await sessionRegistry.aggiornaImpostazioni(sessionId, patch);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ updated: true }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    const compactMatch = method === 'POST' && sessionRegistry
      && /^\/api\/v1\/sessions\/([^/]+)\/compact$/.exec(url.pathname);
    if (compactMatch) {
      try {
        requireNoQuery(url);
        let sessionId;
        try {
          sessionId = decodeURIComponent(compactMatch[1]);
        } catch {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        const esito = await sessionRegistry.compatta(sessionId);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ compattato: esito.compattato }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    const shellMatch = method === 'POST' && sessionRegistry
      && /^\/api\/v1\/sessions\/([^/]+)\/shell$/.exec(url.pathname);
    if (shellMatch) {
      try {
        requireNoQuery(url);
        let sessionId;
        try {
          sessionId = decodeURIComponent(shellMatch[1]);
        } catch {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        const corpo = await leggiCorpoJson(req);
        const comando = requireComandoBody(corpo);
        const esito = sessionRegistry.shell(sessionId, comando);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ ok: true }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    /*
     * ⭐⭐⭐ 28/8 — la pillola permessi, livello "On request": l'owner
     * risponde a un'ApprovalRequested vista sulla connessione SSE.
     * Stesso stile di /shell sopra — synchronous sessionRegistry call,
     * mai un `await` lungo (rispondiApprovazione risolve una Promise
     * già in sospeso, non ne avvia una nuova).
     */
    const approveMatch = method === 'POST' && sessionRegistry
      && /^\/api\/v1\/sessions\/([^/]+)\/approve$/.exec(url.pathname);
    if (approveMatch) {
      try {
        requireNoQuery(url);
        let sessionId;
        try {
          sessionId = decodeURIComponent(approveMatch[1]);
        } catch {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        const corpo = await leggiCorpoJson(req);
        const { requestId, approvato } = requireApprovaBody(corpo);
        const esito = sessionRegistry.rispondiApprovazione(sessionId, requestId, approvato);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ ok: true }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    /*
     * ⭐⭐⭐ 28/8 — FASE A (hook), piano `elegant-spinning-dongarra.md`.
     * L'UNICA strada che rende un hook eseguibile — stesso principio
     * "fail-closed" di Codex CLI (`--dangerously-bypass-hook-trust`
     * esiste solo per bypassarlo esplicitamente): senza una chiamata
     * qui, `verificaTrust` in hook-registry.mjs torna sempre `false`.
     * Nessun corpo richiesto: l'owner fida ESATTAMENTE l'hook che la UI
     * gli ha mostrato per `hookId`, l'hash vero si rilegge da disco qui
     * (sessionRegistry.fidaHook), mai passato dal client.
     */
    const trustMatch = method === 'POST' && sessionRegistry
      && /^\/api\/v1\/sessions\/([^/]+)\/hooks\/([^/]+)\/trust$/.exec(url.pathname);
    if (trustMatch) {
      try {
        requireNoQuery(url);
        let sessionId;
        let hookId;
        try {
          sessionId = decodeURIComponent(trustMatch[1]);
          hookId = decodeURIComponent(trustMatch[2]);
        } catch {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        const esito = await sessionRegistry.fidaHook(sessionId, hookId);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ ok: true }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    /*
     * ⭐⭐⭐ 29/8 — FASE E, stesso ruolo esatto della rotta hooks/trust
     * appena sopra, per i server MCP: l'UNICA strada che rende un
     * server MCP connettibile davvero (serverMcpFidati in
     * mcp-registry.mjs lo salta finché non è stato fidato qui). Nessun
     * corpo richiesto, hash riletto DA DISCO in sessionRegistry.fidaServerMcp,
     * mai passato dal client.
     */
    /*
     * ⭐⭐⭐⭐ FASE N, nono e ultimo sistema (30/8) — Tool Forge, l'UNICA
     * mutazione owner-facing di tutta FASE N (vedi la doc in
     * tool-forge-store.mjs). Stesso ruolo esatto delle rotte trust
     * qui sotto, MA con un corpo — abilitare/disabilitare è
     * bidirezionale (mai "solo fidare"), il corpo dice quale verso.
     */
    const forgeAbilitaMatch = method === 'POST' && sessionRegistry
      && /^\/api\/v1\/sessions\/([^/]+)\/tool-forge\/([^/]+)\/enable$/.exec(url.pathname);
    if (forgeAbilitaMatch) {
      try {
        requireNoQuery(url);
        let sessionId;
        let toolId;
        try {
          sessionId = decodeURIComponent(forgeAbilitaMatch[1]);
          toolId = decodeURIComponent(forgeAbilitaMatch[2]);
        } catch {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        const corpo = await leggiCorpoJson(req);
        const { abilitato } = requireAbilitaForgeBody(corpo);
        const esito = await sessionRegistry.abilitaToolForgiato(sessionId, toolId, abilitato);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ ok: true }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    const mcpTrustMatch = method === 'POST' && sessionRegistry
      && /^\/api\/v1\/sessions\/([^/]+)\/mcp\/([^/]+)\/trust$/.exec(url.pathname);
    if (mcpTrustMatch) {
      try {
        requireNoQuery(url);
        let sessionId;
        let serverId;
        try {
          sessionId = decodeURIComponent(mcpTrustMatch[1]);
          serverId = decodeURIComponent(mcpTrustMatch[2]);
        } catch {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        const esito = await sessionRegistry.fidaServerMcp(sessionId, serverId);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ ok: true }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    /*
     * ⭐⭐⭐ FASE G (29/8) — stesso ruolo esatto della rotta mcp/trust
     * appena sopra, per i plugin: l'UNICA strada che rende un plugin
     * (tool+hook) attivo davvero. Nessun corpo richiesto, hash riletto
     * DA DISCO in sessionRegistry.fidaPlugin, mai passato dal client.
     */
    const pluginTrustMatch = method === 'POST' && sessionRegistry
      && /^\/api\/v1\/sessions\/([^/]+)\/plugins\/([^/]+)\/trust$/.exec(url.pathname);
    if (pluginTrustMatch) {
      try {
        requireNoQuery(url);
        let sessionId;
        let pluginId;
        try {
          sessionId = decodeURIComponent(pluginTrustMatch[1]);
          pluginId = decodeURIComponent(pluginTrustMatch[2]);
        } catch {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        const esito = await sessionRegistry.fidaPlugin(sessionId, pluginId);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ ok: true }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    /*
     * ⭐⭐⭐ FASE D (28/8) — coda messaggi, piano `elegant-spinning-dongarra.md`.
     * ⛔ Il ledger (LEDGER-FASE-D-CODA.md) prevedeva un DELETE HTTP per
     * "annulla" — corretto qui: NESSUNA rotta di questo file usa mai il
     * verbo DELETE (anche eliminare un file dell'albero è
     * `POST .../tree/delete`, verificato leggendo il file prima di
     * scrivere) — niente motivo di essere la prima eccezione, e CORS
     * dichiara solo 'GET, HEAD, POST' più sotto. Stesso schema POST +
     * verbo-nel-path di trustMatch/approveMatch appena sopra.
     */
    const queueMatch = method === 'POST' && sessionRegistry
      && /^\/api\/v1\/sessions\/([^/]+)\/queue$/.exec(url.pathname);
    if (queueMatch) {
      try {
        requireNoQuery(url);
        let sessionId;
        try {
          sessionId = decodeURIComponent(queueMatch[1]);
        } catch {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        const corpo = await leggiCorpoJson(req);
        const messaggio = requireQueueBody(corpo);
        const esito = sessionRegistry.accodaMessaggio(sessionId, messaggio);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ ok: true, posizione: esito.posizione }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    const queueAnnullaMatch = method === 'POST' && sessionRegistry
      && /^\/api\/v1\/sessions\/([^/]+)\/queue\/annulla$/.exec(url.pathname);
    if (queueAnnullaMatch) {
      try {
        requireNoQuery(url);
        let sessionId;
        try {
          sessionId = decodeURIComponent(queueAnnullaMatch[1]);
        } catch {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        const esito = sessionRegistry.svuotaCoda(sessionId);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ ok: true, rimosso: esito.rimosso }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
      }
      return;
    }

    if (!['GET', 'HEAD'].includes(method)) {
      sendJson(res, 405, errorEnvelope('METHOD_NOT_ALLOWED', clock), method, { Allow: 'GET, HEAD' });
      return;
    }

    try {
      let data;
      if (url.pathname === '/api/v1/health') {
        requireNoQuery(url);
        data = { status: 'ok' };
      } else if (workspaceLaunchStore && /^\/api\/v1\/workspace-launches\/([^/]+)$/.test(url.pathname)) {
        requireNoQuery(url);
        let id;
        try { id = decodeURIComponent(url.pathname.split('/')[4]); } catch { id = ''; }
        data = workspaceLaunchStore.inspect(id);
      } else if (url.pathname === '/api/v1/tasks') {
        requireNoQuery(url);
        data = { items: listaTaskDisponibili() };
      } else if (url.pathname === '/api/v1/projects') {
        requireNoQuery(url);
        /* ⭐ 27/8 — le cartelle libere ammesse (TALOS_HARNESS_UI_PROJECT_DIRS): mai il percorso assoluto, solo id/nome — vedi custom-task.mjs. */
        data = { items: elencaCartelleProgetto() };
      } else if (url.pathname === '/api/v1/workspace-browser') {
        const keys = [...url.searchParams.keys()];
        const paths = url.searchParams.getAll('path');
        if (keys.some((key) => key !== 'path') || paths.length > 1) {
          const error = new Error('Query workspace non valida');
          error.code = 'QUERY_INVALID';
          throw error;
        }
        if (!workspaceBrowser || typeof workspaceBrowser.browse !== 'function') {
          const error = new Error('Browser workspace non disponibile');
          error.code = 'WORKSPACE_NOT_AVAILABLE';
          throw error;
        }
        data = await workspaceBrowser.browse(paths.length === 1 ? paths[0] : undefined);
      } else if (url.pathname === '/api/v1/frequent-dirs') {
        requireNoQuery(url);
        /*
         * ⭐⭐⭐ 28/8 — QUI, a differenza di /projects, il percorso ASSOLUTO
         * viene mandato per davvero: sono solo SUGGERIMENTI per il campo
         * "Full access" (cartellaLibera), che già accetta un percorso a
         * piacere — non una seconda allowlist, quindi nasconderlo non
         * proteggerebbe niente che avviaLibero non protegga già.
         * ⭐⭐⭐ 30/8 — `sessionRegistry` passato per davvero: è la fonte
         * PRIMARIA (cronologia reale), non solo un dettaglio interno di
         * cartelleFrequentiFn — vedi la doc di frequent-dirs.mjs sul perché.
         */
        data = { items: cartelleFrequentiFn({ sessionRegistry }) };
      } else if (url.pathname === '/api/v1/automations') {
        requireNoQuery(url);
        data = { items: automationStore ? await automationStore.elenca() : [] };
      } else if (url.pathname === '/api/v1/runtime') {
        requireNoQuery(url);
        const items = [];
        for (const [runtimeId, runtime] of Object.entries(localRuntimes ?? {})) {
          if (typeof runtime?.detect !== 'function') { items.push({ runtimeId, state: 'unavailable', models: [] }); continue; }
          const item = { runtimeId, ...(await runtime.detect(runtimeId)), models: [] };
          if (item.state === 'observed' && typeof runtime.listModels === 'function') {
            try { item.models = await runtime.listModels(); }
            catch (error) { item.modelsError = error?.code || 'RUNTIME_FAILED'; }
          }
          items.push(item);
        }
        data = { items };
      } else if (url.pathname === '/api/v1/runtime/bootstrap') {
        requireNoQuery(url);
        const observedAt = clock().toISOString();
        const candidate = runtimeBootstrapFn
          ? await runtimeBootstrapFn()
          : {
              schema: RUNTIME_BOOTSTRAP_SCHEMA,
              authoritative: 'backend',
              runtime: {
                schema: RUNTIME_RESOURCE_SCHEMA,
                status: 'unavailable',
                items: null,
                consulted: false,
                observedAt,
                reason: 'runtime_not_configured',
              },
              observedAt,
            };
        data = parseBootstrapEnvelope(candidate);
      } else if (url.pathname === '/api/v1/local-models') {
        requireNoQuery(url);
        data = { items: typeof localModelStore?.list === 'function' ? await localModelStore.list() : [] };
      } else if (url.pathname === '/api/v1/huggingface/search') {
        const query = url.searchParams.get('query') || ''; const limit = Number(url.searchParams.get('limit') || 20); const cursor = url.searchParams.get('cursor') || null;
        const sort = url.searchParams.get('sort') || 'downloads'; const direction = url.searchParams.get('direction') || '-1'; const author = url.searchParams.get('author') || null; const filters = url.searchParams.getAll('filter').filter((value) => value !== 'gguf');
        if (!hfHubClient?.searchModels) { const error = new Error('Hub Hugging Face non configurato'); error.code = 'RUNTIME_NOT_AVAILABLE'; throw error; }
        data = await hfHubClient.searchModels({ query, limit, cursor, sort, direction, author, filters });
      } else if (url.pathname === '/api/v1/huggingface/repo') {
        const repo = url.searchParams.get('repo'); const revision = url.searchParams.get('revision');
        if (!repo || !hfHubClient?.describeModel || !hfHubClient?.listGgufFiles) { const error = new Error('Hub Hugging Face non configurato'); error.code = 'RUNTIME_NOT_AVAILABLE'; throw error; }
        const detail = await hfHubClient.describeModel(repo, revision || 'main');
        const listed = revision ? await hfHubClient.listGgufFiles(repo, revision) : [];
        const files = revision && hfHubClient.pathsInfo ? await hfHubClient.pathsInfo(repo, revision, listed.map((item) => item.path)) : listed;
        data = { ...detail, files };
      } else if (url.pathname === '/api/v1/huggingface/image') {
        const source = url.searchParams.get('url');
        if (!source) { const error = new Error('URL immagine mancante'); error.code = 'QUERY_INVALID'; throw error; }
        if (typeof hfImageProxyFn !== 'function') { const error = new Error('Proxy immagini Hugging Face non configurato'); error.code = 'RUNTIME_NOT_AVAILABLE'; throw error; }
        const image = await hfImageProxyFn(source);
        send(res, 200, image.mimeType, image.bytes, method, { 'Cache-Control': 'no-store' });
        return;
      } else if (url.pathname === '/api/v1/huggingface/downloads') {
        requireNoQuery(url); data = { items: typeof localModelTransfer?.listStatuses === 'function' ? await localModelTransfer.listStatuses() : [] };
      } else if (url.pathname === '/api/v1/providers') {
        requireNoQuery(url);
        if (!providerStore || typeof providerStore.listPublic !== 'function') { const error = new Error('Portachiavi provider non configurato'); error.code = 'PROVIDER_STORE_UNAVAILABLE'; throw error; }
        data = { items: providerStore.listPublic() };
      } else if (/^\/api\/v1\/providers\/([^/]+)\/runtime$/.test(url.pathname)) {
        requireNoQuery(url);
        if (!providerStore || typeof providerStore.getRuntime !== 'function') { const error = new Error('Portachiavi provider non configurato'); error.code = 'PROVIDER_STORE_UNAVAILABLE'; throw error; }
        data = providerStore.getRuntime(decodeURIComponent(url.pathname.split('/')[4]));
      } else if (url.pathname === '/api/v1/models') {
        const forzaAggiornamento = parseModelsQuery(url);
        if (!catalogoModelliFn) {
          const errore = new Error('Catalogo modelli non configurato'); errore.code = 'REPORT_UNAVAILABLE'; throw errore;
        }
        data = await catalogoModelliFn({ forzaAggiornamento });
      } else if (url.pathname === '/api/v1/model-lab/capacity') {
        requireNoQuery(url);
        if (!capacitaMacchinaFn) {
          const errore = new Error('Capacità macchina non configurata'); errore.code = 'REPORT_UNAVAILABLE'; throw errore;
        }
        data = await capacitaMacchinaFn();
      } else if (url.pathname === '/api/v1/doctor') {
        requireNoQuery(url);
        if (!diagnosiFn) {
          const errore = new Error('Doctor non configurato'); errore.code = 'REPORT_UNAVAILABLE'; throw errore;
        }
        data = await diagnosiFn();
      } else if (/^\/api\/v1\/doctor\/doctor-[a-f0-9]{12}$/u.test(url.pathname)) {
        requireNoQuery(url);
        const reference = url.pathname.split('/').at(-1);
        const detail = getDiagnosticProblem(reference);
        if (!detail) { const error = new Error('Riferimento Doctor non trovato'); error.code = 'NOT_FOUND'; throw error; }
        data = { reference, code: detail.code, operation: detail.operation, requestId: detail.requestId };
      } else if (url.pathname === '/api/v1/sessions') {
        requireNoQuery(url);
        /* ⛔ Elenco vuoto, non un errore, se sessionRegistry non è configurato — stesso principio già seguito per le altre rotte di sessione. */
        data = { items: sessionRegistry ? sessionRegistry.elenca() : [] };
      } else {
        const projectTreeMatch = sessionRegistry && /^\/api\/v1\/projects\/([^/]+)\/tree$/.exec(url.pathname);
        const eventsMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/events$/.exec(url.pathname);
        const exportMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/export$/.exec(url.pathname);
        const treeMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/tree$/.exec(url.pathname);
        const treeFileMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/tree\/file$/.exec(url.pathname);
        // ⭐⭐⭐ 28/8 — FASE A (hook): il pannello Control-plane elenca gli hook dichiarati e il loro stato di fiducia vero — stesso principio di exportMatch sotto.
        const hooksMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/hooks$/.exec(url.pathname);
        // ⭐⭐⭐ 29/8 — FASE E: il Capability hub elenca i server MCP dichiarati e il loro stato di fiducia vero, stesso principio esatto di hooksMatch appena sopra.
        const mcpMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/mcp$/.exec(url.pathname);
        // ⭐⭐⭐ 29/8 — FASE F: il Capability hub elenca le skill dichiarate — stesso principio, senza il concetto di fiducia (le skill non ce l'hanno).
        const skillsMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/skills$/.exec(url.pathname);
        // ⭐⭐⭐ 29/8 — FASE N: il Capability hub elenca le voci di Libreria del progetto — stesso principio esatto di skillsMatch appena sopra (nessun concetto di fiducia).
        const libraryMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/library$/.exec(url.pathname);
        // ⭐⭐⭐ 29/8 — FASE G: il Capability hub elenca i plugin dichiarati e il loro stato di fiducia vero — stesso principio esatto di mcpMatch sopra (un plugin ESEGUE, a differenza delle skill).
        const pluginsMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/plugins$/.exec(url.pathname);
        // ⭐⭐⭐ FASE N, quarto sistema (30/8) — il Capability hub elenca le note dell'owner (GLOBALI, non del progetto di questa sessione) — stesso principio esatto di skillsMatch sopra.
        const notesMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/notes$/.exec(url.pathname);
        // ⭐⭐⭐ FASE N, quinto sistema (30/8) — il Capability hub elenca le attività dell'owner (GLOBALI, come le note) — stesso principio esatto di notesMatch appena sopra.
        const tasksMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/tasks$/.exec(url.pathname);
        // ⭐⭐⭐ FASE N, sesto sistema (30/8) — il Capability hub elenca le memorie dell'owner (GLOBALI, come note/attività) — stesso principio esatto di tasksMatch appena sopra.
        const memoryMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/memory$/.exec(url.pathname);
        // ⭐⭐⭐ FASE N, ottavo sistema (30/8) — il Capability hub elenca le ricerche approfondite DEL PROGETTO di questa sessione (PER-PROGETTO, come Libreria — mai globale come notesMatch/tasksMatch/memoryMatch sopra).
        const researchMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/research$/.exec(url.pathname);
        // ⭐⭐⭐⭐ FASE N, nono e ultimo sistema (30/8) — il Capability hub elenca i tool forgiati installati (GLOBALI, come notesMatch/tasksMatch/memoryMatch sopra) — stesso principio esatto.
        const forgeListMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/tool-forge$/.exec(url.pathname);
        // ⭐⭐⭐ FASE C (28/8) — sub-agenti: il foglio "Albero sessione" elenca i figli VERI di una sessione, stesso principio di hooksMatch sopra.
        const childrenMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/children$/.exec(url.pathname);
        // ⭐⭐⭐ 28/8 — non SESSION-scoped: un artefatto ha un id UUID già globalmente unico (agent-service.mjs), stesso principio di /api/v1/models.
        const artifactMatch = /^\/api\/v1\/artifacts\/([^/]+)$/.exec(url.pathname);

        if (projectTreeMatch) {
          let projectId;
          try {
            projectId = decodeURIComponent(projectTreeMatch[1]);
          } catch {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          const percorso = parseTreeQuery(url);
          const esito = await sessionRegistry.anteprimaAlbero(projectId, percorso);
          if ('erroreAvvio' in esito) {
            const errore = new Error(esito.erroreAvvio);
            errore.code = esito.code;
            throw errore;
          }
          data = { voci: esito.voci };
        } else if (treeMatch) {
          let sessionId;
          try {
            sessionId = decodeURIComponent(treeMatch[1]);
          } catch {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          const percorso = parseTreeQuery(url);
          const esito = await sessionRegistry.albero(sessionId, percorso);
          if ('erroreAvvio' in esito) {
            const errore = new Error(esito.erroreAvvio);
            errore.code = esito.code;
            throw errore;
          }
          data = { voci: esito.voci };
        } else if (treeFileMatch) {
          /* ⭐ 27/8 — "Apri" un file dell'albero: stessa forma di treeMatch, endpoint separato perché la risposta porta contenuto, non un elenco. */
          let sessionId;
          try {
            sessionId = decodeURIComponent(treeFileMatch[1]);
          } catch {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          const percorso = parseTreeQuery(url);
          const esito = await sessionRegistry.apriFile(sessionId, percorso);
          if ('erroreAvvio' in esito) {
            const errore = new Error(esito.erroreAvvio);
            errore.code = esito.code;
            throw errore;
          }
          data = { percorso, contenuto: esito.contenuto, dimensione: esito.dimensione };
        } else if (exportMatch) {
          requireNoQuery(url);
          let sessionId;
          try {
            sessionId = decodeURIComponent(exportMatch[1]);
          } catch {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          const esportato = sessionRegistry.esporta(sessionId);
          if (!esportato) {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          data = esportato;
        } else if (hooksMatch) {
          requireNoQuery(url);
          let sessionId;
          try {
            sessionId = decodeURIComponent(hooksMatch[1]);
          } catch {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          const esito = await sessionRegistry.elencaHooks(sessionId);
          if ('erroreAvvio' in esito) {
            const errore = new Error(esito.erroreAvvio);
            errore.code = esito.code;
            throw errore;
          }
          data = { hooks: esito.hooks, errore: esito.errore };
        } else if (mcpMatch) {
          requireNoQuery(url);
          let sessionId;
          try {
            sessionId = decodeURIComponent(mcpMatch[1]);
          } catch {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          const esito = await sessionRegistry.elencaServerMcp(sessionId);
          if ('erroreAvvio' in esito) {
            const errore = new Error(esito.erroreAvvio);
            errore.code = esito.code;
            throw errore;
          }
          data = { server: esito.server, errore: esito.errore };
        } else if (skillsMatch) {
          requireNoQuery(url);
          let sessionId;
          try {
            sessionId = decodeURIComponent(skillsMatch[1]);
          } catch {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          const esito = await sessionRegistry.elencaSkill(sessionId);
          if ('erroreAvvio' in esito) {
            const errore = new Error(esito.erroreAvvio);
            errore.code = esito.code;
            throw errore;
          }
          data = { skills: esito.skills, errore: esito.errore };
        } else if (libraryMatch) {
          requireNoQuery(url);
          let sessionId;
          try {
            sessionId = decodeURIComponent(libraryMatch[1]);
          } catch {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          const esito = await sessionRegistry.elencaLibreria(sessionId);
          if ('erroreAvvio' in esito) {
            const errore = new Error(esito.erroreAvvio);
            errore.code = esito.code;
            throw errore;
          }
          data = { voci: esito.voci, errore: esito.errore };
        } else if (notesMatch) {
          requireNoQuery(url);
          let sessionId;
          try {
            sessionId = decodeURIComponent(notesMatch[1]);
          } catch {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          const esito = await sessionRegistry.elencaNote(sessionId);
          if ('erroreAvvio' in esito) {
            const errore = new Error(esito.erroreAvvio);
            errore.code = esito.code;
            throw errore;
          }
          data = { note: esito.note, errore: esito.errore };
        } else if (tasksMatch) {
          requireNoQuery(url);
          let sessionId;
          try {
            sessionId = decodeURIComponent(tasksMatch[1]);
          } catch {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          const esito = await sessionRegistry.elencaAttivita(sessionId);
          if ('erroreAvvio' in esito) {
            const errore = new Error(esito.erroreAvvio);
            errore.code = esito.code;
            throw errore;
          }
          data = { attivita: esito.attivita, errore: esito.errore };
        } else if (memoryMatch) {
          requireNoQuery(url);
          let sessionId;
          try {
            sessionId = decodeURIComponent(memoryMatch[1]);
          } catch {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          const esito = await sessionRegistry.elencaMemorie(sessionId);
          if ('erroreAvvio' in esito) {
            const errore = new Error(esito.erroreAvvio);
            errore.code = esito.code;
            throw errore;
          }
          data = { memorie: esito.memorie, errore: esito.errore };
        } else if (researchMatch) {
          requireNoQuery(url);
          let sessionId;
          try {
            sessionId = decodeURIComponent(researchMatch[1]);
          } catch {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          const esito = await sessionRegistry.elencaRicerche(sessionId);
          if ('erroreAvvio' in esito) {
            const errore = new Error(esito.erroreAvvio);
            errore.code = esito.code;
            throw errore;
          }
          data = { ricerche: esito.ricerche, errore: esito.errore };
        } else if (forgeListMatch) {
          requireNoQuery(url);
          let sessionId;
          try {
            sessionId = decodeURIComponent(forgeListMatch[1]);
          } catch {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          const esito = await sessionRegistry.elencaToolForgiati(sessionId);
          if ('erroreAvvio' in esito) {
            const errore = new Error(esito.erroreAvvio);
            errore.code = esito.code;
            throw errore;
          }
          data = { strumenti: esito.strumenti, errore: esito.errore };
        } else if (pluginsMatch) {
          requireNoQuery(url);
          let sessionId;
          try {
            sessionId = decodeURIComponent(pluginsMatch[1]);
          } catch {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          const esito = await sessionRegistry.elencaPlugin(sessionId);
          if ('erroreAvvio' in esito) {
            const errore = new Error(esito.erroreAvvio);
            errore.code = esito.code;
            throw errore;
          }
          data = { plugin: esito.plugin, errore: esito.errore };
        } else if (childrenMatch) {
          requireNoQuery(url);
          let sessionId;
          try {
            sessionId = decodeURIComponent(childrenMatch[1]);
          } catch {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          const esito = await sessionRegistry.elencaFigli(sessionId);
          if ('erroreAvvio' in esito) {
            const errore = new Error(esito.erroreAvvio);
            errore.code = esito.code;
            throw errore;
          }
          data = { figli: esito.figli };
        } else if (eventsMatch) {
          requireNoQuery(url);
          let sessionId;
          try {
            sessionId = decodeURIComponent(eventsMatch[1]);
          } catch {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          if (!sessionRegistry.esiste(sessionId)) {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          if (req.aborted || res.destroyed) return;

          /*
           * ⛔⛔⛔ 28/8, trovato dal vivo dopo aver eliminato ogni altra
           * causa (verificato: il buffer del registro ha SEMPRE l'evento
           * giusto — confermato con curl, con un secondo client
           * Last-Event-ID, e con l'export della sessione stessa; verificato
           * che NON è specifico di EventSource — un fetch() grezzo con
           * reader manuale dalla pagina mostra lo STESSO sintomo). Ricerca
           * web: un `res.write()` piccolo su una connessione altrimenti
           * inattiva può restare bloccato dall'algoritmo di Nagle (attende
           * un ACK o abbastanza dati per un segmento pieno prima di
           * spedire) — la cura standard per SSE è disabilitarlo sul socket
           * di QUESTA risposta. `res.socket` esiste solo dopo che gli
           * header sono partiti, quindi qui, non prima.
           */
          const ultimoVistoDalClient = Number.parseInt(req.headers['last-event-id'], 10);
          const daSequenza = Number.isFinite(ultimoVistoDalClient) ? ultimoVistoDalClient : 0;
          const sseSession = createSseSession({
            response: res,
            headers: SECURITY_HEADERS,
            heartbeatMs: INTERVALLO_BATTITO_SSE_MS,
            lastEventId: daSequenza,
            setIntervalFn: impostaIntervalloFn,
            clearIntervalFn: cancellaIntervalloFn,
          });
          /*
           * ⛔ Da qui in poi gli header sono GIÀ partiti: un problema deve
           * chiudere lo stream, mai tentare un secondo sendJson — Node
           * lancerebbe "Cannot set headers after they are sent", e il catch
           * esterno lo ributterebbe addosso a una risposta già avviata.
           */
          try {
            if (method === 'HEAD') { sseSession.start(); sseSession.close(); res.end(); return; }
            sseSession.start();
            /*
             * ⛔⛔⛔ 27/8, trovato verificando il comando diretto (shell()),
             * STORICO — il meccanismo che questa nota descriveva (un
             * `inReplay` che distingueva replay-sincrono da eventi dal vivo,
             * per decidere QUANDO un RunFinished poteva chiudere lo stream)
             * non esiste più: il 28/8 lo stream ha smesso di chiudersi da
             * solo del tutto (vedi la nota subito sotto `iscriviti()`). Il
             * BUG originale resta vero da ricordare, per non reintrodurlo
             * per altra via: una sessione con PIÙ giri conclusi nel buffer
             * (il task originale, poi un resume o un comando diretto)
             * troncava il replay al PRIMO RunFinished incontrato — un
             * RunFinished vecchio, ancora nel buffer, chiudeva lo stream
             * prima che il resto del replay potesse scriversi. La cura di
             * allora (distinguere replay da dal-vivo) è ora superflua perché
             * NESSUN evento chiude più lo stream da questo lato — ma se in
             * futuro tornasse un motivo per chiudere selettivamente, questo
             * stesso bug è la prima cosa da riverificare.
             */
            /*
             * ⛔⛔ 27/8, ricerca web (SSE reconnection, Last-Event-ID): Node
             * abbassa sempre il nome header a minuscolo — 'last-event-id',
             * mai il case originale del client. Un valore non numerico (o
             * assente, prima connessione) ricade su 0 — replay completo,
             * comportamento identico a prima di questa ottimizzazione.
             */
            /*
             * ⛔⛔⛔ 28/8, trovato dal vivo (non da un test — vedi
             * workspace-watcher.mjs): questo stream chiudeva SEMPRE dopo un
             * RunFinished/RunError dal vivo (sopra) o subito se non c'era un
             * giro in corso (sotto) — corretto quando l'unica cosa che
             * poteva ancora arrivare era la fine di UN giro. Da quando
             * WorkspaceChanged esiste, questo non è più vero: il watcher del
             * workspace resta vivo per la sessione anche a run concluso (un
             * file cambiato fuori dall'app due minuti dopo che l'agente ha
             * finito è un caso reale, non raro), e chiudere qui lo perdeva
             * SEMPRE — misurato: l'evento arrivava nel buffer del registro
             * (confermato con un secondo client, Last-Event-ID) ma mai al
             * client già connesso, perché quel client era già stato chiuso
             * dal server subito dopo RunFinished.
             *
             * ⇒ Lo stream non si chiude più da solo qui. Si chiude quando il
             * CLIENT lo chiude (navigazione, cambio sessione — `res.on('close', ...)`
             * sotto lo intercetta comunque) o quando la connessione cade
             * davvero. Il costo è una manciata di connessioni HTTP idle per
             * sessioni concluse ma ancora guardate — trascurabile per uno
             * strumento locale a un solo proprietario, lo stesso compromesso
             * già scelto altrove in questo registro (vedi la doc in testa a
             * session-registry.mjs sulle sessioni mai ripulite).
             */
            const disiscrivi = sessionRegistry.iscriviti(sessionId, (evento) => {
              sseSession.send(evento);
            }, daSequenza);
            /*
             * ⛔⛔⛔ 28/8 — SECONDA metà della stessa cura (setNoDelay sopra
             * è la prima): senza scritture nuove, una connessione può
             * restare "aperta" per il client (readyState/fetch non lo
             * segnalano MAI come caduta) ma smettere di consegnare i
             * prossimi byte — misurato dal vivo, non solo letto: un evento
             * arrivato minuti dopo l'ultimo (RunFinished, poi silenzio, poi
             * un WorkspaceChanged) non raggiungeva MAI un client altrimenti
             * sano. Un commento periodico (`:battito\n\n`, innocuo per lo
             * standard SSE — un commento inizia con `:` e viene ignorato)
             * tiene il canale attivo ogni pochi secondi, indipendentemente
             * da eventi applicativi veri.
             */
            res.once('close', disiscrivi);
          } catch {
            sseSession.close();
            if (!res.writableEnded) res.end();
          }
          return;
        } else if (artifactMatch) {
          /*
           * ⭐⭐⭐ 28/8 — risposta HTTP VERA con la SUA propria CSP,
           * permissiva SOLO qui (mai `srcdoc`: vedi artifact-store.mjs per
           * il perché, misurato dal vivo). `frame-ancestors 'self'`
           * autorizza SOLO il nostro stesso iframe a incorporarla — non un
           * link diretto da aprire in scheda, un artefatto isolato.
           */
          requireNoQuery(url);
          let id;
          try {
            id = decodeURIComponent(artifactMatch[1]);
          } catch {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          const html = leggiArtefattoFn(id);
          if (html === null) {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          send(res, 200, 'text/html; charset=utf-8', html, method, {
            'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-ancestors 'self'",
            'X-Frame-Options': 'SAMEORIGIN',
          });
          return;
        } else if (url.pathname.startsWith('/api/')) {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        } else {
          requireValidStaticQuery(url);
          const asset = await staticHandler(url.pathname);
          if (!asset) {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          send(res, asset.statusCode, asset.contentType, asset.body, method);
          return;
        }
      }

      if (req.aborted || res.destroyed) return;
      sendJson(res, 200, successEnvelope(data, clock), method);
    } catch (error) {
      const normalized = normalizeError(error);
      sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock), method);
    }
  }

  return function httpApp(req, res) {
    handle(req, res).catch(() => {
      sendJson(res, 500, errorEnvelope('INTERNAL_ERROR', clock), req.method || 'GET');
    });
  };
}
