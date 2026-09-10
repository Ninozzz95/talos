import { randomBytes } from 'node:crypto'; // 08/9, BH-06: il nonce CSP del documento, nuovo a ogni risposta
import { leggiArtefatto as leggiArtefattoReale } from './artifact-store.mjs';
import { nomiPerContentDisposition } from './workspace-files.mjs'; // PO-05: le due forme del nome per Content-Disposition (RFC 6266)
import { verificaIncorniciabile } from './browser-frame.mjs';
import { decidiVia } from './browser-proxy-universale.mjs'; // 07/9: la scelta della corsia sta in un posto solo // K-I 06/9: la cornice del Browser si decide dalle intestazioni della pagina
import { proxyPagina } from './browser-proxy.mjs';
import { leggiPaginaPerLaVista } from './agent-service.mjs';
import { ritrattoCartella } from './workspace-info.mjs'; // 06/9 F9/F10/F19-F21: cosa c'e' dentro la cartella, PRIMA di darla a un agente // 06/9: gli occhi del modello sulla pagina dove navighi TU // 06/9: il proxy locale per annotare gli elementi
import { modelloRichiestaValido, permessiPerAttrezzoRichiestaValido, permessiRichiestaValido, reasoningRichiestaValido } from './config.mjs';
import { cartelleFrequenti as cartelleFrequentiReale } from './frequent-dirs.mjs';
import { RUNTIME_BOOTSTRAP_SCHEMA, RUNTIME_RESOURCE_SCHEMA, parseBootstrapEnvelope } from './runtime-contract.mjs';
import { getDiagnosticProblem, toPublicProblem } from './public-problem.mjs';
import { createSseSession } from './http-lifecycle.mjs';
import { creaRegistroAttese, ritornoDaHost, scambiaCodicePerChiave } from './openrouter-oauth.mjs'; // PO-01 10/9: i conti dell'accesso a OpenRouter, puri e provabili senza rete

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
  /* ⛔ 07/9, trovato dalla prova C25 sul 4174: senza queste righe OGNI errore del browser vivo
     usciva come «Errore interno» — il motivo vero («questa sessione non ha una pagina aperta»,
     «non trovo un Chromium») restava nel server e a schermo arrivava un muro. `normalizeError`
     conosce SOLO i codici di questa lista: uno che non c'è diventa INTERNAL_ERROR. */
  'BROWSER_VIVO_NON_CONFIGURATO',
  'BROWSER_VIVO_ASSENTE',
  'BROWSER_VIVO_SCHEDA_ASSENTE',
  'BROWSER_VIVO_TROPPE_SCHEDE',
  'BROWSER_VIVO_GESTO_IGNOTO',
  'BROWSER_VIVO_SENZA_SESSIONE',
  'BROWSER_VIVO_CONNESSIONE_FALLITA',
  'BROWSER_VIVO_SENZA_CONNESSIONE',
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
  /* ⭐ 10/9 — il CRUD di una voce di Libreria per la persona. Sono gli STESSI nomi che usa
     `library-store.mjs`: tradurli qui in altri codici vorrebbe dire tenere due vocabolari per
     gli stessi stati, e prima o poi farne divergere uno. */
  'LIBRARY_NOT_FOUND',
  'LIBRARY_NAME_EMPTY',
  'LIBRARY_TOO_LARGE',
  'LIBRARY_MALFORMED',
  'LIBRARY_READ_FAILED',
  'LIBRARY_INVALID',
  /* ⭐ 28/8 — FASE A (hook): .harness-ui-hooks.json malformato, o un hookId che non combacia nessuna voce del file. */
  'HOOK_INVALID',
  /* ⭐ 29/8 — FASE E: .harness-ui-mcp.json malformato, o un serverId che non combacia nessuna voce del file. */
  'MCP_INVALID',
  /* ⭐ 29/8 — FASE G: un plugin.json malformato, o un pluginId che non combacia nessuna cartella di .harness-ui-plugins/. */
  'PLUGIN_INVALID',
  /* ⭐ 30/8, QA visiva (Task 14) — DELETE su una sessione ancora viva (né conclusa né interrotta): un controller attivo potrebbe star lavorando davvero. */
  'SESSION_STILL_RUNNING',
  /* ⭐ 07/9, O-49 — la risposta a una richiesta di consenso che nel frattempo non è più in attesa. */
  'APPROVAL_NOT_PENDING',
  'WORKSPACE_LAUNCH_UNAUTHORIZED',
  'WORKSPACE_LAUNCH_NOT_AVAILABLE',
  'WORKSPACE_NOT_AVAILABLE',
  'WORKSPACE_ALREADY_EXISTS',
  'PROVIDER_INVALID', 'PROVIDER_KEY_REQUIRED', 'PROVIDER_KEY_INVALID', 'PROVIDER_STORE_UNAVAILABLE', 'PROVIDER_RUNTIME_INVALID', 'PROVIDER_RUNTIME_UNAVAILABLE',
  // ⭐ 04/9, R-03 — fonte della ricerca web (search-source-store.mjs, duckduckgo-search.mjs).
  'SEARCH_SOURCE_INVALID', 'SEARCH_KEY_REQUIRED', 'SEARCH_KEY_INVALID', 'SEARCH_ENDPOINT_INVALID', 'SEARCH_STORE_UNAVAILABLE', 'SEARCH_NOT_READY', 'SEARCH_BLOCKED', 'SEARCH_UNREACHABLE', 'SEARCH_FAILED',
  // ⭐ 04/9, W1-10 — token di loopback della shell Electron: /api/* senza il cookie talos_token.
  'AUTH_REQUIRED',
  /* ⭐⭐⭐ 05/9, W1-01 — schede terminale per sessione (src/terminal-registry.mjs). Il tetto NON è burocrazia: su Windows ogni PTY porta con sé un processo conhost (node-pty#471). */
  'TERMINAL_LIMIT_REACHED', 'TERMINAL_STORE_UNAVAILABLE',
  'BROWSER_PROXY_SOLO_LOCALE', 'BROWSER_PROXY_NON_HTML', 'BROWSER_PROXY_TROPPO_GRANDE', 'BROWSER_PROXY_IRRAGGIUNGIBILE', // Browser con annotazione 06/9
  /*
   * ⭐⭐⭐ 05/9, W1-05 — lo stato Git di una sessione (src/git-service.mjs),
   * la sorgente «Non committato» della Review a due sorgenti (W1-06).
   * ⛔ Non c'è un codice per il push, perché non c'è un push: si chiede
   * all'owner, ogni volta.
   */
  'GIT_NOT_A_REPOSITORY', 'GIT_PATH_INVALID', 'GIT_PATHS_REQUIRED', 'GIT_MESSAGE_REQUIRED',
  'GIT_NOTHING_TO_COMMIT', 'GIT_WORKTREE_DIFFERS', 'GIT_COMMAND_FAILED', 'GIT_STORE_UNAVAILABLE',
  'GIT_TIMEOUT', 'GIT_OUTPUT_TOO_LARGE',
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
  /*
   * ⭐⭐⭐ PO-01 (10/9) — l'accesso a OpenRouter senza incollare una chiave
   * (`src/openrouter-oauth.mjs`). ⛔ Sette codici e non uno solo: chi legge «non ha funzionato»
   * non sa se deve riprovare adesso, ricominciare l'accesso da capo o smettere — e sono tre
   * azioni diverse. ⛔ Ognuno ha la sua riga anche in `STATUS_BY_CODE` qui sotto: la voragine
   * dell'08/9 (un codice noto senza stato faceva CADERE la risposta) non si rifà oggi.
   * ⛔ `OAUTH_ATTESA_IGNOTA` è UNO per tre casi — stato mai visto, già usato, scaduto — di
   *   proposito: distinguerli direbbe a chi bussa se uno stato è mai esistito.
   */
  'OAUTH_NON_CONFIGURATO', 'OAUTH_ATTESA_IGNOTA', 'OAUTH_CODICE_MANCANTE',
  'OAUTH_SCAMBIO_RIFIUTATO', 'OAUTH_RETE', 'OAUTH_RISPOSTA_INATTESA', 'OAUTH_CUSTODIA_FALLITA',
]);

const STATUS_BY_CODE = Object.freeze({
  BROWSER_VIVO_NON_CONFIGURATO: 503,
  BROWSER_VIVO_ASSENTE: 503,
  BROWSER_VIVO_SCHEDA_ASSENTE: 409,
  BROWSER_VIVO_TROPPE_SCHEDE: 429,
  BROWSER_VIVO_GESTO_IGNOTO: 400,
  BROWSER_VIVO_SENZA_SESSIONE: 400,
  BROWSER_VIVO_CONNESSIONE_FALLITA: 502,
  BROWSER_VIVO_SENZA_CONNESSIONE: 500,
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
  /** ⭐ 05/9, W1-01 — stessa famiglia: la richiesta è legittima, è lo STATO attuale (otto schede già aperte) a impedirla. Chiudine una e riprova. */
  TERMINAL_LIMIT_REACHED: 409,
  BROWSER_PROXY_SOLO_LOCALE: 403, // 06/9: il proxy con annotazione solo per un dev server locale
  BROWSER_PROXY_NON_HTML: 415,
  BROWSER_PROXY_TROPPO_GRANDE: 413,
  BROWSER_PROXY_IRRAGGIUNGIBILE: 502,
  TERMINAL_STORE_UNAVAILABLE: 503,
  /*
   * ⭐⭐⭐ 05/9, W1-05. La famiglia dei 409 è la stessa di SESSION_NOT_READY:
   * la richiesta è legittima, è lo STATO attuale a impedirla, e si risolve.
   * ⛔ GIT_WORKTREE_DIFFERS in particolare NON è un errore del client: è git
   * che, con un percorso esplicito, committerebbe l'albero di lavoro invece
   * di ciò che è in stage (misurato il 05/09) — si rifiuta invece di
   * committare in silenzio la cosa sbagliata.
   */
  GIT_NOT_A_REPOSITORY: 409,
  GIT_NOTHING_TO_COMMIT: 409,
  GIT_WORKTREE_DIFFERS: 409,
  GIT_PATH_INVALID: 422,
  GIT_PATHS_REQUIRED: 422,
  GIT_MESSAGE_REQUIRED: 422,
  GIT_STORE_UNAVAILABLE: 503,
  /** ⛔ 504: git non ha risposto in tempo. Non è colpa di chi ha chiesto, e non è un guasto del server: è un'attesa scaduta a monte. */
  GIT_TIMEOUT: 504,
  GIT_OUTPUT_TOO_LARGE: 413,
  GIT_COMMAND_FAILED: 500,
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
  /** ⭐ 10/9 — 404 come FILE_NOT_FOUND, ma DISTINTO da NOT_FOUND: «la sessione non c'è» e «la voce non c'è» sono due assenze diverse, e una risposta che non le distingue manda a cercare nel posto sbagliato. */
  LIBRARY_NOT_FOUND: 404,
  /** ⭐ 10/9 — 400: il nome l'ha mandato il chiamante e, tolti i caratteri di percorso, non resta niente. */
  LIBRARY_NAME_EMPTY: 400,
  /** ⭐ 10/9 — 413 come FILE_TOO_LARGE, stessa famiglia: «contenuto oltre il limite». */
  LIBRARY_TOO_LARGE: 413,
  /** ⭐ 10/9 — 500, e non 4xx: una scheda `meta.json` illeggibile o un file sparito sotto la sua scheda non sono colpa di chi chiede, sono uno stato ROTTO da riparare qui. */
  LIBRARY_MALFORMED: 500,
  LIBRARY_READ_FAILED: 500,
  /** ⭐ 10/9 — 400: il codice generico del magazzino, che nasce da un argomento mancante o assurdo. */
  LIBRARY_INVALID: 400,
  /** ⭐ 28/8 — stesso status di ROW_INVALID/QUERY_INVALID: il contenuto della richiesta (hookId, o il file hooks.json stesso) non è valido. */
  HOOK_INVALID: 422,
  /** ⭐ 29/8 — stesso status di HOOK_INVALID, stesso motivo: il contenuto della richiesta (serverId, o il file .harness-ui-mcp.json stesso) non è valido. */
  MCP_INVALID: 422,
  /** ⭐ 29/8 — FASE G: stesso status di MCP_INVALID, stesso motivo (pluginId, o il file plugin.json stesso) non valido. */
  PLUGIN_INVALID: 422,
  /** ⭐ 30/8 — stesso status di SESSION_NOT_READY: la richiesta è legittima ma lo stato attuale (ancora in corso) la blocca. */
  SESSION_STILL_RUNNING: 409,
  /**
   * ⛔⛔⛔ 07/9, O-49 — era QUERY_INVALID (400), e l’owner leggeva a schermo
   * «Risposta non riuscita · Query non valida» premendo Approva su una scheda del permesso.
   * La query non c’entrava niente: la richiesta era formata benissimo, solo che quella
   * approvazione non era più in attesa (stop, reindirizzamento, o la scheda ridisegnata
   * dopo un riavvio del server, che perde `approvazionePendente` perché vive in memoria).
   * ⭐ Ricerca 07/09/2026 fatta PRIMA di scrivere (MDN «409 Conflict»: «a request conflict
   * with the current state of the target resource»; openai/codex #29627, dove la lezione è
   * che una richiesta di consenso decaduta va DETTA come decaduta e mai fatta passare per un
   * rifiuto o per un errore del chiamante): stesso 409 già scelto qui sopra per
   * SESSION_STILL_RUNNING e RUNTIME_ALREADY_RUNNING — non è colpa di chi chiama, è lo stato
   * che è cambiato sotto.
   */
  APPROVAL_NOT_PENDING: 409,
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
  SEARCH_SOURCE_INVALID: 422,
  SEARCH_KEY_REQUIRED: 422,
  SEARCH_KEY_INVALID: 422,
  SEARCH_ENDPOINT_INVALID: 422,
  SEARCH_STORE_UNAVAILABLE: 503,
  SEARCH_NOT_READY: 409,
  SEARCH_BLOCKED: 502,
  SEARCH_UNREACHABLE: 502,
  SEARCH_FAILED: 502,
  AUTH_REQUIRED: 401,
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
  /*
   * ⛔ 08/9, BH-07 — mancava, e la mancanza NON si vedeva come una riga assente: usciva come
   * 500 «Errore interno» da `normalizeError` (vedi la doc lì). Un manifest di download
   * malformato è la richiesta a essere sbagliata, non il server: 422, come già
   * LOCAL_IMPORT_INVALID qui sotto, che è lo stesso guasto sull'import dal disco.
   */
  HF_TRANSFER_INVALID: 422,
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
  /** ⭐ PO-01 10/9 — senza una funzione di custodia collegata l'accesso non può nemmeno cominciare: è un servizio non configurato, come ogni altro store di questo file. */
  OAUTH_NON_CONFIGURATO: 503,
  /** Lo `stato` non è (più) valido: la richiesta è malformata dal punto di vista del server, non un guasto suo. */
  /* ⛔ 10/09 — il nome dell'azione è UNO SOLO in tutto il giro: a schermo il pulsante dice
     «Accedi con OpenRouter», e qui si diceva «ricomincia da «Collega account»». Due nomi per la
     stessa cosa mandano a cercare un pulsante che non esiste. */
  OAUTH_ATTESA_IGNOTA: 400,
  OAUTH_CODICE_MANCANTE: 400,
  /** 502: il guasto è a monte, in OpenRouter o nella strada che ci porta. Non è colpa di chi ha chiesto. */
  OAUTH_SCAMBIO_RIFIUTATO: 502,
  OAUTH_RETE: 502,
  OAUTH_RISPOSTA_INATTESA: 502,
  /** 500: qui la colpa è nostra davvero — l'accesso è riuscito e non siamo riusciti a metterlo al sicuro. */
  OAUTH_CUSTODIA_FALLITA: 500,
});

const MESSAGE_BY_CODE = Object.freeze({
  CONFIG_INVALID: 'Configurazione non valida',
  QUERY_INVALID: 'Query non valida',
  REPORT_UNAVAILABLE: 'Rapporto non ancora prodotto',
  SEARCH_SOURCE_INVALID: 'Fonte di ricerca non valida',
  SEARCH_KEY_REQUIRED: 'Serve una chiave per questa fonte',
  SEARCH_KEY_INVALID: 'Chiave di ricerca non valida',
  SEARCH_ENDPOINT_INVALID: 'Indirizzo della fonte non valido',
  SEARCH_STORE_UNAVAILABLE: 'Portachiavi della ricerca non disponibile',
  SEARCH_NOT_READY: 'La fonte di ricerca non è pronta',
  SEARCH_BLOCKED: 'La fonte di ricerca ha rifiutato la richiesta',
  SEARCH_UNREACHABLE: 'La fonte di ricerca non è raggiungibile',
  SEARCH_FAILED: 'La ricerca non è riuscita',
  AUTH_REQUIRED: 'Questo server accetta solo la finestra TALOS che lo ha avviato',
  TERMINAL_LIMIT_REACHED: 'Hai già il massimo di terminali aperti per questa sessione: chiudine uno e riprova',
  TERMINAL_STORE_UNAVAILABLE: 'I terminali non sono disponibili su questo server',
  BROWSER_PROXY_SOLO_LOCALE: 'Il proxy con annotazione vale solo per un dev server sul tuo computer',
  BROWSER_PROXY_NON_HTML: 'Non è una pagina HTML',
  BROWSER_PROXY_TROPPO_GRANDE: 'La pagina supera i 5 MB',
  BROWSER_PROXY_IRRAGGIUNGIBILE: 'La pagina non risponde',
  GIT_NOT_A_REPOSITORY: 'Questa cartella non è un repository git',
  GIT_PATH_INVALID: 'Percorso non valido per questa sessione',
  GIT_PATHS_REQUIRED: 'Serve almeno un percorso esplicito',
  GIT_MESSAGE_REQUIRED: 'Il commit vuole un messaggio',
  GIT_NOTHING_TO_COMMIT: 'Non c’è niente da committare su questi percorsi',
  GIT_WORKTREE_DIFFERS: 'Alcuni file sono cambiati dopo essere stati messi in stage',
  GIT_COMMAND_FAILED: 'git non è riuscito a completare l’operazione',
  GIT_STORE_UNAVAILABLE: 'Le funzioni git non sono disponibili su questo server',
  GIT_TIMEOUT: 'git non ha risposto entro il tempo massimo',
  GIT_OUTPUT_TOO_LARGE: 'L’uscita di git supera il limite consentito',
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
  LIBRARY_NOT_FOUND: 'Questo file della Libreria non esiste più',
  LIBRARY_NAME_EMPTY: 'Serve un nome con almeno una lettera o un numero',
  LIBRARY_TOO_LARGE: 'File troppo grande da scaricare',
  LIBRARY_MALFORMED: 'La scheda di questo file della Libreria è illeggibile',
  LIBRARY_READ_FAILED: 'Non riesco a leggere questo file della Libreria',
  LIBRARY_INVALID: 'Richiesta non valida per la Libreria',
  HOOK_INVALID: 'Configurazione hook non valida',
  MCP_INVALID: 'Configurazione server MCP non valida',
  PLUGIN_INVALID: 'Configurazione plugin non valida',
  SESSION_STILL_RUNNING: 'Sessione ancora in corso — fermala prima di eliminarla',
  BROWSER_VIVO_NON_CONFIGURATO: 'Il browser pilotato non è configurato su questo TALOS',
  BROWSER_VIVO_ASSENTE: 'Non trovo un browser Chromium su questo computer: TALOS ne usa uno già installato, Chrome o Edge',
  BROWSER_VIVO_SCHEDA_ASSENTE: 'Questa sessione non ha una pagina aperta nel browser pilotato',
  BROWSER_VIVO_TROPPE_SCHEDE: 'Troppe pagine aperte insieme nel browser pilotato',
  BROWSER_VIVO_GESTO_IGNOTO: 'Questo gesto non è riconosciuto',
  BROWSER_VIVO_SENZA_SESSIONE: 'Serve la sessione a cui appartiene la pagina',
  BROWSER_VIVO_CONNESSIONE_FALLITA: 'Il browser è partito ma non risponde al protocollo di controllo',
  BROWSER_VIVO_SENZA_CONNESSIONE: 'Manca il modo di collegarsi al browser pilotato',
  /* ⛔ 07/9, O-49: questo testo finisce dentro il fumetto rosso in basso a destra — deve dire cos’è successo, non «Query non valida». */
  APPROVAL_NOT_PENDING: 'Questa richiesta di permesso non è più in attesa: la sessione è andata avanti',
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
  /*
   * ⭐⭐⭐ PO-01 (10/9) — le sette frasi dell'accesso a OpenRouter. ⛔ Le legge una PERSONA:
   * niente nomi tecnici, nessun `code_verifier`, nessuno `state`, nessun numero di stato HTTP.
   * Ognuna dice COSA FARE, perché il codice più utile è quello che indica la porta aperta.
   */
  OAUTH_NON_CONFIGURATO: 'Su questo server non è possibile collegare un account: incolla una chiave nelle Impostazioni',
  OAUTH_ATTESA_IGNOTA: 'Questa richiesta di collegamento non vale più: ricomincia da «Accedi con OpenRouter»',
  OAUTH_CODICE_MANCANTE: 'Manca il codice di conferma: ricomincia da «Accedi con OpenRouter»',
  OAUTH_SCAMBIO_RIFIUTATO: 'OpenRouter non ha accettato questa conferma: ricomincia da «Accedi con OpenRouter»',
  OAUTH_RETE: 'Non sono riuscito a raggiungere OpenRouter: controlla la connessione e riprova',
  OAUTH_RISPOSTA_INATTESA: 'OpenRouter ha risposto in un modo che non riconosco: riprova più tardi',
  OAUTH_CUSTODIA_FALLITA: 'Il collegamento è riuscito ma non sono riuscito a metterlo al sicuro: apri Doctor',
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
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self' http://localhost:* http://127.0.0.1:* https:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'", // K-I 06/9: `frame-src` è ciò che NOI incorniciamo (un dev server locale, una pagina https); `frame-ancestors 'none'` resta: nessuno incornicia TALOS
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
});

/*
 * ⛔⛔⛔ 08/9, BH-06 — LA CSP SPEGNEVA IL TERMINALE. `style-src 'self'`, senza nonce né hash,
 * faceva cadere OGNI `<style>` che xterm.js crea a runtime: ~12 violazioni rosse in console a
 * ogni apertura del Terminale, e i colori ANSI del renderer DOM persi — è esattamente il muro
 * che `public/vendor/xterm/README.md` racconta di aver aggirato ripiegando su WebGL, mai
 * rimosso. ⛔ La via vietata era `'unsafe-inline'`: aprirebbe a QUALUNQUE stile iniettato.
 *
 * Ricerca fatta PRIMA di scrivere, 08/09/2026:
 *  · MDN «CSP: style-src» — un hash è confrontato col TESTO ESATTO del foglio, spazi e
 *    maiuscole comprese; e uno stile impostato per proprietà (`el.style.width = ...`) NON è
 *    bloccato dalla CSP, quindi il rumore in console viene solo dagli elementi `<style>`.
 *  · xtermjs/xterm.js#4445 «Latest version requires unsafe-inline due to inline styles»,
 *    tuttora APERTO: xterm non offre nessuna opzione `nonce`. Verificato anche qui, sul
 *    bundle vendorizzato: ZERO occorrenze della parola `nonce` nei 477 KB di
 *    `public/vendor/xterm/xterm.js` (@xterm/xterm 6.0.0).
 *  · MDN «HTMLElement.nonce» — per via del *nonce hiding* il valore va scritto e letto dalla
 *    PROPRIETÀ IDL (`el.nonce`), non dall'attributo, che i browser recenti svuotano.
 *  · Invicti «Static Nonce Identified in CSP» e la guida CSP di Next.js — un nonce deve essere
 *    nuovo a OGNI risposta, e la pagina che lo porta non può essere messa in cache.
 *
 * ⇒ Delle due strade regge SOLO il nonce. L'hash non basta: leggendo il bundle, i quattro
 *   `<style>` di xterm hanno un testo che CAMBIA a runtime — i colori del tema
 *   (`onChangeColors`), l'altezza di cella e il selettore del terminale
 *   (`_dimensionsStyleElement`), font e colori del renderer (`_injectCss`). Un hash fissato
 *   oggi smetterebbe di valere al primo ridimensionamento o cambio di tema.
 * ⇒ E poiché xterm il nonce non se lo mette da solo, non basta metterlo nell'intestazione: il
 *   documento riceve anche la riga che lo timbra sui `<style>` appena creati. Senza quella, il
 *   nonce non toccherebbe mai gli elementi che stiamo cercando di far passare — sarebbe una
 *   cura che si legge bene e non cura niente.
 * ⛔ Il `Cache-Control: no-store` qui sopra è la condizione che rende lecito il nonce: un
 *   documento con nonce finito in cache lo regalerebbe a chiunque lo rilegga.
 */
const BYTE_NONCE_CSP = 16; // 128 bit, la lunghezza minima raccomandata per un nonce CSP

function creaNonceCsp() {
  return randomBytes(BYTE_NONCE_CSP).toString('base64');
}

/*
 * ⛔ Le sostituzioni passano da una FUNZIONE e non da una stringa: in `String.replace` una
 * stringa di rimpiazzo interpreta `$` (già pagato altrove in questo repo), e un nonce base64
 * arriva da bytes casuali.
 */
function intestazioniDocumentoConNonce(nonce) {
  const csp = SECURITY_HEADERS['Content-Security-Policy']
    .replace("script-src 'self'", () => `script-src 'self' 'nonce-${nonce}'`)
    .replace("style-src 'self'", () => `style-src 'self' 'nonce-${nonce}'`);
  return { 'Content-Security-Policy': csp };
}

/*
 * ⛔ Il timbro deve essere installato PRIMA di xterm (che sta in fondo al body) e prima di
 * qualunque altro codice che crei fogli di stile, quindi entra in fondo al `<head>`. Se il
 * documento non avesse un `</head>` non si inventa un posto: si lascia l'HTML com'è e il
 * nonce resta solo nell'intestazione — meglio una cura che non scatta di una pagina rotta.
 */
function iniettaNonceNelDocumento(html, nonce) {
  const chiusuraHead = html.search(/<\/head>/iu);
  if (chiusuraHead < 0) return html;
  const timbro = `<script nonce="${nonce}">(function(){var n=${JSON.stringify(nonce)};var c=Document.prototype.createElement;`
    + 'Document.prototype.createElement=function(t){var e=c.apply(this,arguments);'
    + 'try{if(typeof t==="string"&&t.toLowerCase()==="style")e.nonce=n;}catch(_){}return e;};})();</script>';
  return `${html.slice(0, chiusuraHead)}${timbro}${html.slice(chiusuraHead)}`;
}

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

/*
 * Il documento PROXATO di un dev server locale (06/9). ⛔ Niente CSP di
 * TALOS qui (bloccherebbe script, stili e immagini del dev server, che restano sulla loro origine
 * via <base>): resta `frame-ancestors 'self'` — solo TALOS può incorniciarlo — e `no-store`.
 */
function sendHtmlProxato(res, html, method) {
  if (res.destroyed || res.writableEnded) return;
  const payload = Buffer.from(html, 'utf8');
  res.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "frame-ancestors 'self'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': payload.length,
  });
  res.end(method === 'HEAD' ? undefined : payload);
}

function successEnvelope(data, clock) {
  const meta = { schema: API_SCHEMA, generatedAt: generatedAt(clock) };
  if (data && typeof data.sourceHash === 'string') meta.sourceHash = data.sourceHash;
  return { ok: true, data, meta };
}

/*
 * ⛔⛔⛔ 07/9 — IL MOTIVO VERO NON ARRIVAVA MAI AL REGISTRO. Qui si costruiva
 * `toPublicProblem({ code })`: un oggetto col SOLO codice, senza `message`. Il registro
 * diagnostico salvava quindi un dettaglio VUOTO, e la scheda Doctor — che la risposta invita ad
 * aprire («Apri Doctor, copia il riferimento e riprova») — non poteva dire nulla piu di quello che
 * si leggeva gia a schermo. Un riferimento che non porta a niente manda la persona a cercare una
 * risposta che non esiste: e cosi che «Query non valida» e diventato un muro.
 * ⇒ L'errore VERO viaggia in `context.errore` e il suo messaggio viene registrato — ripulito da
 *   `safeDiagnosticDetail` (chiavi, percorsi, nomi di variabili d'ambiente) prima di essere scritto.
 *   Fuori, nella risposta HTTP, non cambia niente: la persona continua a vedere il testo pubblico.
 */
function errorEnvelope(code, clock, context = {}) {
const { errore = null, ...restoContesto } = context;
const problem = toPublicProblem(errore && (errore.code === code || !errore.code) ? errore : { code }, restoContesto);
return {
ok: false,
error: { code, message: MESSAGE_BY_CODE[code] ?? problem.title, ...problem },
meta: { schema: API_SCHEMA, generatedAt: generatedAt(clock) },
};
}

/*
 * ⭐⭐⭐ PO-01 (10/9) — LA PAGINA CHE VEDE UNA PERSONA quando il browser rientra da OpenRouter.
 *
 * ⛔ Non è una risposta d'API e non deve esserlo: qui non arriva del codice nostro, arriva un
 *   essere umano che ha appena premuto «Autorizza» su un altro sito e sta guardando una scheda
 *   del browser. Un JSON a schermo, in quel momento, è un vicolo cieco.
 * ⛔ Nella pagina NON c'è e non può esserci la chiave: qui dentro non entra mai, per costruzione
 *   — questa funzione riceve un esito, non un segreto.
 * ⛔ CSP tutta chiusa (`default-src 'none'`) e lo stile legato a un nonce nuovo a ogni risposta:
 *   nessuno script, nessuna immagine, nessuna connessione in uscita. La pagina è un cartello.
 * ⛔ `Referrer-Policy: no-referrer` sta già in SECURITY_HEADERS ed è dirimente proprio qui:
 *   l'indirizzo di questa pagina contiene il codice di autorizzazione, e senza quell'intestazione
 *   finirebbe nel campo Referer di qualunque cosa la pagina caricasse.
 */
function paginaRitornoOpenRouter(res, method, problema) {
  const nonce = randomBytes(16).toString('base64');
  const titolo = problema ? 'Non sono riuscito a collegare l’account' : 'Account collegato';
  const frase = problema
    /* ⛔ Le frasi di MESSAGE_BY_CODE non finiscono con un punto (sono etichette): aggiungerlo qui
       evita la riga sgrammaticata che si legge a schermo, «ricomincia da «Accedi con OpenRouter» Puoi…». */
    ? `${/[.!?]$/u.test(problema) ? problema : `${problema}.`} Puoi chiudere questa scheda e riprovare da TALOS.`
    : 'Il tuo account OpenRouter è collegato a TALOS. Puoi chiudere questa scheda e tornare all’app.';
  const html = '<!doctype html><html lang="it"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + `<title>${titolo}</title>`
    + `<style nonce="${nonce}">`
    + ':root{color-scheme:light dark}'
    + 'body{margin:0;min-height:100vh;display:grid;place-items:center;'
    + 'font:16px/1.55 system-ui,-apple-system,sans-serif;background:#0f1115;color:#e8eaed}'
    + '@media (prefers-color-scheme: light){body{background:#f6f7f9;color:#1b1d21}}'
    + 'main{max-width:34rem;padding:2.5rem 1.5rem;text-align:center}'
    + 'h1{font-size:1.4rem;margin:0 0 .75rem;font-weight:650}'
    + 'p{margin:0;opacity:.82}'
    + '</style></head><body><main>'
    + `<h1>${titolo}</h1><p>${frase}</p>`
    + '</main></body></html>';
  send(res, problema ? 400 : 200, 'text/html; charset=utf-8', html, method, {
    'Content-Security-Policy': `default-src 'none'; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  });
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

/*
 * ⛔⛔⛔ 08/9, trovato scavando BH-07 — UN CODICE SENZA STATO FACEVA SCHIANTARE LA RISPOSTA.
 * `API_ERROR_CODES` e `STATUS_BY_CODE` sono due elenchi separati, e QUINDICI codici stanno nel
 * primo e non nel secondo: tutta la famiglia HF_HUB_, HF_REDIRECT_, HF_RESOLVE_INVALID,
 * HF_REPOSITORY_GATED, HF_RATE_LIMITED, HF_TRANSFER_INVALID, HF_DOWNLOAD_FAILED,
 * HF_PATH_REJECTED, CHECKSUM_MISMATCH, MODEL_FILE_UNREADABLE, CANCELLED_BY_OWNER,
 * PAUSED_BY_OWNER.
 * Per loro questa funzione restituiva `statusCode: undefined`, `res.writeHead(undefined)`
 * lanciava, e chi rispondeva era la rete di sicurezza in fondo a `httpApp`: 500 INTERNAL_ERROR,
 * col codice VERO perso per strada. Cioè l'unico caso in cui il motivo dell'errore serviva
 * davvero era anche l'unico in cui spariva.
 * ⛔ Il ripiego a 500 NON è la cura completa: i quindici codici vogliono ognuno il suo stato
 * (HF_TRANSFER_INVALID è un 422, HF_RATE_LIMITED un 429, HF_REPOSITORY_GATED un 403...). Qui si
 * chiude solo la voragine — un codice noto non deve mai poter far cadere la risposta — e si
 * mappa HF_TRANSFER_INVALID, che è la strada di BH-07. Gli altri quattordici restano
 * REGISTRATI e non curati: toccano rotte che non ho provato, e cambiarne lo stato senza una
 * prova per ciascuna sarebbe una modifica al buio.
 */
function normalizeError(error) {
  const code = API_ERROR_CODES.has(error?.code) ? error.code : 'INTERNAL_ERROR';
  return { code, statusCode: STATUS_BY_CODE[code] ?? 500 };
}

/*
 * ⛔⛔⛔ 07/9 — L'INVENTARIO DELLE ROTTE API. Serve a UNA cosa sola: distinguere
 * «questo indirizzo non esiste» (404) da «esiste, ma non con questo metodo» (405).
 * NON dirige il traffico — la catena di if/else qui sotto resta l'unica che sceglie chi
 * risponde: una tabella che dirigesse sarebbe una seconda verità, e due verità divergono.
 *
 * Il difetto da cui nasce, misurato il 07/09/2026 sul server vivo con una curl:
 * `POST /api/v1/artifacts` e `POST /api/v1/questa-non-esiste` rispondevano ENTRAMBE 405,
 * perché il blanket-405 qui sotto scattava prima che qualcuno avesse guardato se
 * l'indirizzo esistesse. Dall'esterno una rotta vera e una inventata erano
 * indistinguibili, e un controllo automatico sulle rotte esposte è rimasto impossibile
 * da scrivere proprio per questo.
 *
 * Ricerca 07/09/2026, fatta PRIMA di scrivere (RFC 9110 §15.5.6 letta via http.dev/405 e
 * MDN «405 Method Not Allowed»; expressjs/express #2055 e #1499): «404 means the door
 * isn't there; 405 means the door is there but locked to that knock». E il vincolo che
 * dal nostro codice non si vedeva: sul 405 «the origin server MUST generate an Allow
 * header field containing a list of the target resource's currently supported methods».
 * Il nostro mandava sempre `Allow: GET, HEAD` — falso su `/api/v1/sessions`, che accetta
 * POST. Da qui l'elenco PER ROTTA e non una stringa fissa. Express, per confronto, su un
 * metodo non gestito cade su 404 e non manda mai `Allow`: il pareggio-e-supera è
 * rispondere 405 con l'elenco vero.
 *
 * ⛔ Le espressioni sono copiate ALLA LETTERA da chi risponde qui sotto, e un test
 * (`tests/http-inventario-rotte.test.mjs`) rilegge questo file e pretende che ogni rotta
 * nominata nella catena sia anche qui: una rotta nuova senza la sua riga fa diventare
 * rosso quel test, invece di tornare a mentire in silenzio mesi dopo.
 * ⛔ HEAD non compare mai in `metodi`: lo aggiunge `metodiAmmessiPerRotta` a ogni rotta
 * che accetta GET, perché a servirlo è `send()`, non una riga della catena.
 */
const ROTTE_API = Object.freeze([
  { schema: '/api/v1/chat-images', metodi: ['POST'] },
  { schema: /^\/api\/v1\/chat-images\/[a-f0-9]{64}$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/providers\/(openai|anthropic|gemini)\/models$/, metodi: ['GET'] },
  { schema: '/api/v1/health', metodi: ['GET'] },
  { schema: '/api/v1/tasks', metodi: ['GET'] },
  { schema: '/api/v1/projects', metodi: ['GET'] },
  { schema: '/api/v1/workspace-browser', metodi: ['GET'] },
  { schema: '/api/v1/frequent-dirs', metodi: ['GET'] },
  { schema: '/api/v1/runtime', metodi: ['GET'] },
  { schema: '/api/v1/runtime/bootstrap', metodi: ['GET'] },
  { schema: '/api/v1/local-models', metodi: ['GET'] },
  { schema: '/api/v1/local-models/fit-estimate', metodi: ['GET'] },
  { schema: '/api/v1/huggingface/search', metodi: ['GET'] },
  { schema: '/api/v1/huggingface/repo', metodi: ['GET'] },
  { schema: '/api/v1/huggingface/image', metodi: ['GET'] },
  { schema: '/api/v1/huggingface/downloads', metodi: ['GET'] },
  { schema: '/api/v1/providers', metodi: ['GET'] },
  { schema: '/api/v1/models', metodi: ['GET'] },
  { schema: '/api/v1/model-lab/capacity', metodi: ['GET'] },
  { schema: '/api/v1/tools', metodi: ['GET'] },
  { schema: '/api/v1/setup/stato', metodi: ['GET'] },
  { schema: '/api/v1/doctor', metodi: ['GET'] },
  { schema: '/api/v1/workspace-info', metodi: ['GET'] },
  { schema: '/api/v1/browser/incorniciabile', metodi: ['GET'] },
  { schema: '/api/v1/browser/proxy', metodi: ['GET'] },
  { schema: '/api/v1/browser/leggi', metodi: ['GET'] },
  /* ⭐ 07/9 — il browser vivo: apri/gesto/descrivi cambiano qualcosa (POST), schermo e stato leggono
     (GET), e la chiusura è una DELETE sulla radice della famiglia. */
  /* ⛔ chiudere è una POST, non una DELETE: in questo server DELETE non esiste — `metodiAmmessiPerRotta`
     conosce GET/HEAD/POST e basta, e introdurre un metodo nuovo per una rotta sola avrebbe voluto dire
     toccare il cancello che protegge TUTTE le altre. Misurato chiedendolo al codice, non dedotto. */
  { schema: '/api/v1/browser/vivo/chiudi', metodi: ['POST'] },
  { schema: '/api/v1/browser/vivo/apri', metodi: ['POST'] },
  { schema: '/api/v1/browser/vivo/gesto', metodi: ['POST'] },
  { schema: '/api/v1/browser/vivo/descrivi', metodi: ['POST'] },
  { schema: '/api/v1/browser/vivo/misura', metodi: ['POST'] },
  { schema: '/api/v1/browser/vivo/schermo', metodi: ['GET'] },
  { schema: '/api/v1/browser/vivo/stato', metodi: ['GET'] },
  { schema: '/api/v1/search-source', metodi: ['GET'] },
  { schema: '/api/v1/sessions', metodi: ['GET', 'POST'] },
  { schema: '/api/v1/automations', metodi: ['GET', 'POST'] },
  { schema: '/api/v1/workspace-launches', metodi: ['POST'] },
  { schema: '/api/v1/workspace-browser/folders', metodi: ['POST'] },
  { schema: '/api/v1/runtime/load', metodi: ['POST'] },
  { schema: '/api/v1/runtime/unload', metodi: ['POST'] },
  { schema: '/api/v1/local-models/import', metodi: ['POST'] },
  { schema: '/api/v1/huggingface/download', metodi: ['POST'] },
  { schema: '/api/v1/sessions/custom', metodi: ['POST'] },
  { schema: /^\/api\/v1\/workspace-launches\/([^/]+)$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/local-models\/([^/]+)\/fit$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/doctor\/doctor-[a-f0-9]{12}$/u, metodi: ['GET'] },
  { schema: /^\/api\/v1\/projects\/([^/]+)\/tree$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/artifacts\/([^/]+)$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/providers\/([^/]+)\/runtime$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/events$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/export$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/tree$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/tree\/file$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/file$/, metodi: ['GET'] }, // PO-05: lo scarico di un file, in byte
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/hooks$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/tools$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/mcp$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/processes$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/metrics$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/git\/status$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/git\/branch$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/skills$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/library$/, metodi: ['GET'] },
  /*
   * ⭐⭐⭐⭐ 10/9 — il CRUD di UNA voce di Libreria, per la PERSONA. Fino a ieri qui c'era la sola
   * riga sopra, l'elenco: il modello aveva sei attrezzi sulla Libreria e chi guarda lo schermo
   * non poteva né scaricare, né rinominare, né eliminare, né aprire la cartella.
   * ⛔ Tre righe e non due: `/library/:voceId` accetta PATCH e DELETE, `/library/:voceId/file` solo
   *   GET e `/library/:voceId/rivela` solo POST — così l'Allow del 405 dice il vero su ognuna,
   *   invece di dichiarare su tutte l'unione dei metodi di tutte.
   */
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/library\/([^/]+)\/file$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/library\/([^/]+)\/rivela$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/library\/([^/]+)\/apri$/, metodi: ['POST'] }, // 10/09: l'azione Windows «Apri», gemella di «rivela»
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/library\/([^/]+)$/, metodi: ['PATCH', 'DELETE'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/plugins$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/notes$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/tasks$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/memory$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/research$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/tool-forge$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/children$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/terminals$/, metodi: ['GET', 'POST'] },
  { schema: /^\/api\/v1\/search-source(?:\/(key|key\/remove|test))?$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/providers\/([^/]+)\/test$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/providers\/([^/]+)\/key(?:\/(remove))?$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/providers\/([^/]+)\/runtime(?:\/(reset))?$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/automations\/([^/]+)\/toggle$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/automations\/([^/]+)\/elimina$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/local-models\/([^/]+)\/(rename|copy-path|delete)$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/local-models\/([^/]+)\/qualify$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/huggingface\/downloads\/([^/]+)\/(pause|resume|cancel)$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/cancel$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/terminals\/([^/]+)\/close$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/git\/(stage|unstage|commit)$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/rename$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/delete$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/tree\/rename$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/tree\/delete$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/tree\/reveal$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/tree\/move$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/tree\/copy$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/tree\/create$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/stop$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/redirect$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/fork$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/resume$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/settings$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/compact$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/context\/?$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/context\/settings$/, metodi: ['PATCH'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/context\/jobs$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/context\/jobs\/([^/]+)$/, metodi: ['GET', 'DELETE'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/context\/jobs\/([^/]+)\/resume$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/context\/versions$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/context\/versions\/([^/]+)\/restore$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/context\/facts$/, metodi: ['GET', 'POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/context\/facts\/([^/]+)$/, metodi: ['PATCH', 'DELETE'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/context\/facts\/([^/]+)\/resolve$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/context\/sources\/([^/]+)$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/context\/export$/, metodi: ['GET'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/shell$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/approve$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/queue$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/queue\/annulla$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/hooks\/([^/]+)\/trust$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/tool-forge\/([^/]+)\/enable$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/mcp\/([^/]+)\/trust$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/sessions\/([^/]+)\/plugins\/([^/]+)\/trust$/, metodi: ['POST'] },
  /*
   * ⭐⭐⭐ PO-01 (10/9) — le tre porte dell'accesso a OpenRouter.
   * ⛔ `ritorno` è dichiarato in DUE forme perché ne serve una sola, ma quale dipende da
   *   OpenRouter: lo `stato` viaggia nel PERCORSO (`/ritorno/<stato>`) perché la documentazione
   *   di OpenRouter, riletta il 10/09/2026 cercandolo apposta, NON nomina mai un parametro
   *   `state` — lo promette solo un annuncio su X del 28/04/2025, che non è un contratto. La
   *   forma corta con `?state=` resta aperta come ripiego: se un giorno la documentassero non
   *   ci sarebbe niente da cambiare, e intanto è la forma che una persona incolla a mano.
   */
  { schema: '/api/v1/auth/openrouter/inizia', metodi: ['POST'] },
  { schema: '/api/v1/auth/openrouter/codice', metodi: ['POST'] },
  { schema: '/api/v1/auth/openrouter/ritorno', metodi: ['GET'] },
  { schema: /^\/api\/v1\/auth\/openrouter\/ritorno\/([^/]+)$/u, metodi: ['GET'] },
]);

/**
 * `null` = a questo indirizzo non risponde NESSUNA rotta ⇒ chi bussa merita un 404, non un
 * 405. Altrimenti l'elenco dei metodi ammessi, nell'ordine in cui va scritto in `Allow`.
 *
 * ⛔ Una rotta il cui servizio non è stato collegato (per esempio `sessionRegistry` assente
 * nei test) resta dichiarata qui: la catena non la serve e la richiesta cade sul 405 come
 * prima. È il comportamento che i test del 30/8 presidiano — «senza registro, /fork torna
 * al blanket-405» — e cambiarlo di straforo qui sarebbe un secondo difetto travestito da
 * cura.
 */
export function metodiAmmessiPerRotta(pathname) {
  const metodi = new Set();
  for (const rotta of ROTTE_API) {
    const combacia = typeof rotta.schema === 'string' ? pathname === rotta.schema : rotta.schema.test(pathname);
    if (combacia) for (const metodo of rotta.metodi) metodi.add(metodo);
  }
  if (metodi.size === 0) return null;
  const ordinati = [];
  if (metodi.has('GET')) ordinati.push('GET', 'HEAD');
  if (metodi.has('POST')) ordinati.push('POST');
  /*
   * ⛔ 10/9 — fino a oggi questa funzione conosceva due soli verbi, perché due soli ne
   *   esistevano nella catena: un `metodi: ['PATCH']` dichiarato lì sopra sarebbe uscito da qui
   *   come un elenco VUOTO, cioè un `Allow:` senza niente dentro su una rotta che invece la
   *   PATCH la serve — il difetto del 07/9 («Allow che dice il falso») rifatto al contrario.
   *   Il CRUD della Libreria è il primo a usarli davvero.
   */
  if (metodi.has('PATCH')) ordinati.push('PATCH');
  if (metodi.has('DELETE')) ordinati.push('DELETE');
  return ordinati;
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
/*
 * ⛔⛔⛔ 08/9, BH-07 — UN CORPO VUOTO USCIVA 500 «Errore interno». `POST
 * /api/v1/huggingface/download` passava il corpo al servizio senza guardarlo: con `{}` il
 * manifest veniva rifiutato dentro `hf-direct-transfer.validateManifest` con il codice
 * `HF_TRANSFER_INVALID`, che però non ha mai avuto una riga in `STATUS_BY_CODE` — quindi
 * `normalizeError` restituiva `statusCode: undefined`, `res.writeHead(undefined)` lanciava, e
 * la rete di sicurezza in fondo a `httpApp` rispondeva 500 INTERNAL_ERROR. Il chiamante
 * riceveva «il server ha un problema» per una richiesta che era SUA, e il motivo vero
 * (quale campo manca) non usciva da nessuna parte. Due difetti in fila, curati entrambi: qui
 * la forma del corpo, e in `normalizeError` il codice senza stato.
 *
 * ⛔ Qui si controlla SOLO LA FORMA, come fanno le altre nove POST di questo file: la
 * validazione fine (i byte dei file sommano al totale, il percorso non esce dalla radice,
 * il repository esiste) resta in `hf-direct-transfer.mjs`, unica verità sul manifest — due
 * copie della stessa regola divergono, e questa non deve essere più severa dell'altra o
 * rifiuterebbe richieste legittime senza che nessuno capisca perché.
 */
const REVISIONE_HF = /^[a-f0-9]{40,64}$/iu;
const IMPRONTA_SHA256 = /^[a-f0-9]{64}$/iu;
function requireHuggingFaceDownloadBody(body) {
  const nonVuota = (valore) => typeof valore === 'string' && valore.trim() !== '';
  const interoPositivo = (valore) => Number.isSafeInteger(valore) && valore > 0;
  const fileValido = (file) => file !== null && typeof file === 'object' && !Array.isArray(file)
    && nonVuota(file.path) && interoPositivo(file.bytes)
    && typeof file.sha256 === 'string' && IMPRONTA_SHA256.test(file.sha256);
  const valido = body !== null && typeof body === 'object' && !Array.isArray(body)
    && nonVuota(body.id) && nonVuota(body.repo)
    && typeof body.revision === 'string' && REVISIONE_HF.test(body.revision)
    && Array.isArray(body.files) && body.files.length > 0 && body.files.every(fileValido)
    && interoPositivo(body.bytes)
    && nonVuota(body.path);
  if (!valido) {
    const errore = new Error('Corpo non valido: atteso {id, repo, revision (hash 40-64 esa), files: [{path, bytes, sha256}], bytes, path}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
}

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

/*
 * ⛔ Un'allowlist di UNA chiave sola, come requireTaskIdBody — la validazione FINE del nome resta
 *   a valle, qui si controlla solo la FORMA del corpo: per la sessione è `session-registry.rinomina()`
 *   (trim, 1-80), per una voce di Libreria è `sanificaNomeLibreria` nel magazzino, che toglie i
 *   caratteri di percorso e rifiuta ciò che dopo resta vuoto.
 * ⛔ 10/9 — lo usa anche `PATCH .../library/:voceId`: stesso corpo `{nome}`, stessa forma. Una
 *   seconda copia scritta apposta per la Libreria è durata cinque minuti (il controllo di sintassi
 *   l'ha vista subito): due lettori identici dello stesso corpo sono due posti dove cambiare idea.
 */
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
/** ⭐ 04/9, W1-10 — legge un cookie dall'intestazione grezza; nessuna dipendenza, nessun parsing oltre il nome cercato. */
export function leggiCookie(req, nome) {
  const grezzo = req?.headers?.cookie;
  if (typeof grezzo !== 'string' || grezzo === '') return null;
  for (const parte of grezzo.split(';')) {
    const i = parte.indexOf('=');
    if (i === -1) continue;
    if (parte.slice(0, i).trim() === nome) return parte.slice(i + 1).trim();
  }
  return null;
}

export function createHttpApp({
  staticHandler, sessionRegistry = null, contextService = null, listaTaskDisponibili = () => [],
  elencaCartelleProgetto = () => [], automationStore = null, diagnosiFn = null,
  // ⭐ 04/9, R-02 — stato del primo avvio (src/setup-stato.mjs): quali passi dell'intro sono già fatti, letti dalla realtà, mai un segreto.
  setupStatoFn = null,
  // ⭐ 04/9, R-03 — fonte della ricerca web scelta dalle Impostazioni (parità mobile) + prova reale.
  searchSourceStore = null, provaRicercaWebFn = null,
  // ⭐ 04/9, W1-10 — token di loopback (config.token): quando c'è, /api/* vuole il cookie talos_token; `GET /?token=<t>` lo imposta e rimanda a `/`.
  token = null,
  workspaceLaunchStore = null,
  chatImageStore = null,
  workspaceBrowser = null,
  /*
   * ⭐⭐⭐ 05/9, W1-01 — il registro delle SCHEDE terminale
   * (src/terminal-registry.mjs). Facoltativo come ogni altro store: senza,
   * le tre rotte rispondono TERMINAL_STORE_UNAVAILABLE invece di fingere.
   * ⛔ È l'unica porta da cui nasce un `terminalId`: la WebSocket
   * (`terminal-ws.mjs`) può solo CHIEDERE al registro, mai crearci dentro
   * una voce partendo da una stringa arrivata dal client.
   */
  terminalRegistry = null,
  /*
   * ⭐⭐⭐ 07/9 — il BROWSER VIVO (`src/browser-sessione-viva.mjs`): un Chromium di sistema pilotato
   * dal server, per le pagine che l'iframe non può mostrare. Facoltativo come ogni altro store:
   * senza, le rotte rispondono BROWSER_VIVO_NON_CONFIGURATO invece di fingere una vista che non c'è.
   * ⛔ Il primo giro dal vivo si fa su una porta di prova, mai sul 4174 dell'owner.
   */
  browserVivo = null,
  /** K-I 06/9 — il fetch in uscita per la verifica della cornice del Browser (iniettabile nei test). */
  fetchFn = globalThis.fetch,
  /*
   * ⭐⭐⭐ 05/9, W1-05 — lo stato Git di una sessione (src/git-service.mjs).
   * Facoltativo come ogni altro store: senza, le cinque rotte rispondono
   * GIT_STORE_UNAVAILABLE invece di fingere un repository pulito.
   * ⛔⛔ Non espone il push, e non può: quella porta non esiste nel servizio.
   */
  gitService = null,
  // ⭐⭐⭐ 28/8 — owner, coda: "directory più usate (tipo desktop downloads)". Zero config esterna (solo os.homedir()) — il default reale basta, nessun cablaggio in server.mjs come serve invece per elencaCartelleProgetto (quella dipende da TALOS_HARNESS_UI_PROJECT_DIRS).
  cartelleFrequentiFn = cartelleFrequentiReale,
  catalogoModelliFn = null, clock = () => new Date(), leggiArtefattoFn = leggiArtefattoReale,
  leggiPaginaFn = leggiPaginaPerLaVista, // 06/9: iniettabile, cosi' le prove non escono in rete
  ritrattoCartellaFn = ritrattoCartella, // 06/9: iniettabile, cosi' le prove non camminano il disco vero
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
  /*
   * ⭐⭐⭐ PO-01 (10/9) — ACCESSO A OPENROUTER, le tre dipendenze.
   *
   * ⛔ `custodisciChiaveOpenRouter(chiave)` è l'UNICO posto in cui la chiave ottenuta va a
   *   finire. Questo file non la scrive su disco, non la mette in un log, non la rimanda
   *   indietro in una risposta e non la nomina in nessun errore: la passa e la dimentica. Se non
   *   è collegata, le rotte rispondono OAUTH_NON_CONFIGURATO invece di cominciare un accesso che
   *   non avrebbe dove finire — stesso principio di ogni altro store facoltativo di questo file.
   * ⛔ `registroOAuthOpenRouter` tiene i verificatori in attesa SOLO in memoria e SOLO in questo
   *   processo (vedi `src/openrouter-oauth.mjs`): un verificatore su disco sarebbe un segreto
   *   scritto per dieci minuti e lasciato lì per sempre.
   * ⛔ `fetchOpenRouterFn` è separato da `fetchFn` (che serve la cornice del Browser) apposta:
   *   una prova che finge OpenRouter non deve poter cambiare, per sbaglio, il comportamento di
   *   una rotta che non c'entra niente.
   */
  custodisciChiaveOpenRouter = null,
  registroOAuthOpenRouter = creaRegistroAttese(),
  fetchOpenRouterFn = globalThis.fetch,
}) {
  async function imageInput(body) {
    if (!body || !Object.hasOwn(body, 'immagini')) return { body, immagini: [] };
    if (!chatImageStore) throw Object.assign(new Error('Gli allegati immagine non sono configurati.'), { code: 'QUERY_INVALID' });
    const immagini = await chatImageStore.validateReferences(body.immagini);
    const rest = { ...body };
    delete rest.immagini;
    return { body: rest, immagini };
  }
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
      const contextPreflight = /^\/api\/v1\/sessions\/[^/]+\/context(?:\/|$)/u.test(req.url ?? '');
      res.writeHead(204, {
        'Access-Control-Allow-Methods': contextPreflight ? 'GET, HEAD, POST, PATCH, DELETE' : 'GET, HEAD, POST',
        'Access-Control-Allow-Headers': contextPreflight ? 'Content-Type, Idempotency-Key' : 'Content-Type',
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

    /*
     * ⭐⭐⭐ 04/9 — W1-10, il cancello a token. Solo se il server è stato
     * avviato con un token (shell Electron): la finestra apre `/?token=<t>`,
     * riceve il cookie e viene rimandata a `/` pulita (il token non resta
     * nella barra né nella cronologia); da lì ogni `/api/*` porta il cookie.
     * Chi arriva senza (un altro processo sulla stessa macchina, un browser
     * aperto a mano) riceve 401 AUTH_REQUIRED sull'API — la pagina statica
     * resta servibile, ma senza API non fa niente. Cookie HttpOnly +
     * SameSite=Strict: non leggibile da script, mai inviato cross-site.
     */
    if (token) {
      if (url.pathname === '/' && url.searchParams.has('token')) {
        if (url.searchParams.get('token') === token) {
          res.writeHead(302, {
            'Set-Cookie': `talos_token=${token}; HttpOnly; SameSite=Strict; Path=/`,
            Location: '/',
            'Cache-Control': 'no-store',
          });
          res.end();
        } else {
          sendJson(res, 401, errorEnvelope('AUTH_REQUIRED', clock), method);
        }
        return;
      }
      /*
       * ⛔⛔⛔ PO-01 (10/9) — L'UNICA ROTTA ESENTE DAL COOKIE, E NON È UNA SCORCIATOIA.
       *
       * Il cookie `talos_token` è impostato `SameSite=Strict`. MDN «Set-Cookie», letta il
       * 10/09/2026 PRIMA di scrivere questa riga: «Strict — send the cookie only for requests
       * originating from the same site that set the cookie», senza nessuna eccezione per le
       * navigazioni di primo livello. Il rientro da `openrouter.ai` È una navigazione di primo
       * livello cross-site ⇒ il browser NON manda il cookie, e senza questa esenzione ogni
       * accesso finirebbe su un 401 — cioè la funzione non potrebbe funzionare mai, sulla
       * macchina dell'owner, che il token ce l'ha sempre.
       *
       * ⛔ La via che NON si prende: abbassare il cookie a `SameSite=Lax` (che sulle navigazioni
       *   GET di primo livello viaggia, stessa fonte). Sarebbe indebolire OGNI rotta dell'API per
       *   farne funzionare una.
       * ⛔ L'altra via che NON si prende: mettere il token dentro il `callback_url`. Quel valore
       *   viene consegnato a OpenRouter, che lo conserva e lo rimanda: il segreto di casa
       *   finirebbe nei registri di qualcun altro.
       * ⇒ Qui la difesa non è il cookie ed è più stretta: la rotta non fa NIENTE senza uno
       *   `stato` opaco da 32 byte di caso, a uso singolo, vivo dieci minuti, che questo processo
       *   ha generato un istante prima. Chi non ce l'ha ottiene un rifiuto che non dice nemmeno
       *   se quello stato sia mai esistito.
       */
      const rientroOAuth = method === 'GET' && url.pathname.startsWith('/api/v1/auth/openrouter/ritorno');
      if (!rientroOAuth && url.pathname.startsWith('/api/') && leggiCookie(req, 'talos_token') !== token) {
        sendJson(res, 401, errorEnvelope('AUTH_REQUIRED', clock), method);
        return;
      }
    }

    /*
     * ⭐⭐⭐ PO-01 (10/9) — ACCEDERE A OPENROUTER SENZA INCOLLARE UNA CHIAVE.
     *
     * Owner: «nella fase oauth aggiungi anche oauth openrouter, è già stato fatto nel mobile».
     * Fino a oggi la chiave OpenRouter aveva UNA sola porta d'ingresso su questo desktop:
     * `env.OPENROUTER_API_KEY` (`src/config.mjs:537`). I conti stanno tutti in
     * `src/openrouter-oauth.mjs`, con le fonti e le date; qui c'è solo il traffico.
     *
     * Tre porte, e la terza non è un lusso:
     *  · `POST .../inizia`  — genera la coppia PKCE, la lega a uno `stato` opaco, restituisce
     *                        l'indirizzo da aprire nel browser DI SISTEMA (la password di
     *                        OpenRouter non attraversa mai il nostro processo);
     *  · `GET  .../ritorno` — il browser rientra qui, si scambia, si custodisce, e si risponde
     *                        una PAGINA a una persona;
     *  · `POST .../codice`  — la modalità senza rientro: OpenRouter mostra il codice a schermo e
     *                        la persona lo incolla. ⛔ Serve davvero: TALOS gira su un server, e
     *                        chi lo usa via SSH o da un'altra macchina non ha nessun `127.0.0.1`
     *                        raggiungibile — senza questa strada non potrebbe accedere MAI.
     *
     * ⛔ Il verificatore non esce da questo processo, in nessuna delle tre. Non compare in una
     *   risposta, in un errore o in un log: l'unica cosa che la persona vede è lo `stato`, che
     *   è 32 byte di caso e non significa niente.
     */
    if (url.pathname.startsWith('/api/v1/auth/openrouter/')) {
      const ritornoOAuth = method === 'GET' && /^\/api\/v1\/auth\/openrouter\/ritorno(?:\/([^/]+))?$/u.exec(url.pathname);
      const iniziaOAuth = method === 'POST' && url.pathname === '/api/v1/auth/openrouter/inizia';
      const codiceOAuth = method === 'POST' && url.pathname === '/api/v1/auth/openrouter/codice';
      if (ritornoOAuth || iniziaOAuth || codiceOAuth) {
        /*
         * ⛔ La chiave attraversa QUESTA funzione e nient'altro. Non torna a chi ha chiamato,
         *   non entra in `errorEnvelope`, non entra nel registro diagnostico: va alla custodia e
         *   sparisce. Anche il guasto della custodia viene RISCRITTO da capo, perché il messaggio
         *   di un portachiavi che fallisce è esattamente il posto in cui un segreto può finire
         *   per sbaglio.
         */
        const concludiAccessoOpenRouter = async (stato, codice) => {
          if (typeof codice !== 'string' || codice.trim() === '') {
            const errore = new Error('Manca il codice di conferma'); errore.code = 'OAUTH_CODICE_MANCANTE'; throw errore;
          }
          /* ⛔ Il codice si controlla PRIMA di consumare lo stato: una richiesta a metà non deve
             bruciare un accesso che la persona può ancora concludere. */
          const { verifier } = registroOAuthOpenRouter.consuma(stato);
          const { chiave } = await scambiaCodicePerChiave({ codice, verifier, fetchDiRete: fetchOpenRouterFn });
          try {
            await custodisciChiaveOpenRouter(chiave);
          } catch {
            const errore = new Error('Chiave non messa al sicuro'); errore.code = 'OAUTH_CUSTODIA_FALLITA'; throw errore;
          }
        };
        try {
          if (typeof custodisciChiaveOpenRouter !== 'function') {
            const errore = new Error('Custodia delle chiavi non collegata'); errore.code = 'OAUTH_NON_CONFIGURATO'; throw errore;
          }
          if (iniziaOAuth) {
            requireNoQuery(url);
            const corpo = await leggiCorpoJson(req, 1024);
            /*
             * `senzaRitorno: true` forza la modalità «codice a schermo» anche da locale (è la via
             * per chi apre TALOS da un'altra macchina). Senza il flag si prova il rientro
             * automatico, che però esiste solo se l'`Host` con cui la richiesta è arrivata è di
             * loopback: `ritornoDaHost` restituisce `null` per tutto il resto, e allora si ricade
             * sulla modalità a schermo invece di promettere un rientro impossibile.
             */
            const senzaRitorno = corpo && typeof corpo === 'object' && corpo.senzaRitorno === true;
            const apertura = registroOAuthOpenRouter.apri({
              costruisciRitorno: senzaRitorno ? null : (stato) => ritornoDaHost(req.headers.host, stato),
            });
            sendJson(res, 200, successEnvelope(apertura, clock), method);
            return;
          }
          if (codiceOAuth) {
            requireNoQuery(url);
            const corpo = await leggiCorpoJson(req, 4096);
            const stato = corpo && typeof corpo.stato === 'string' ? corpo.stato : '';
            const codice = corpo && typeof corpo.codice === 'string' ? corpo.codice : '';
            await concludiAccessoOpenRouter(stato, codice);
            /* ⛔ `custodita: true` e nient'altro: chi ha chiamato non ha bisogno di rivedere la chiave. */
            sendJson(res, 200, successEnvelope({ custodita: true }, clock), method);
            return;
          }
          /*
           * Il rientro dal browser. Lo `stato` sta nel PERCORSO (è la forma che `inizia`
           * costruisce, e nessuna implementazione può perdere un pezzo del proprio indirizzo);
           * `?state=` e `?stato=` restano accettati come ripiego — vedi la nota nell'inventario
           * delle rotte. Gli altri parametri della query si ignorano: la lunghezza totale è già
           * limitata da MAX_REQUEST_TARGET_BYTES, e rifiutare un parametro in più aggiunto un
           * domani da OpenRouter romperebbe l'accesso di tutti per una regola che non protegge
           * niente — la difesa è lo `stato`, non l'assenza di rumore.
           */
          const statoDelRientro = ritornoOAuth[1]
            ? decodeURIComponent(ritornoOAuth[1])
            : (url.searchParams.get('state') ?? url.searchParams.get('stato') ?? '');
          await concludiAccessoOpenRouter(statoDelRientro, url.searchParams.get('code') ?? '');
          paginaRitornoOpenRouter(res, method, null);
          return;
        } catch (error) {
          const normalized = normalizeError(error);
          /* ⛔ Al rientro dal browser risponde una PAGINA anche il guasto: chi sta guardando è una
             persona, e un JSON di errore la lascerebbe davanti a un muro senza uscita. */
          if (ritornoOAuth) { paginaRitornoOpenRouter(res, method, MESSAGE_BY_CODE[normalized.code] ?? null); return; }
          sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
          return;
        }
      }
    }

    const contextMatch = /^\/api\/v1\/sessions\/([^/]+)\/context(\/.*)?$/u.exec(url.pathname);
    if (contextMatch) {
      const allowed = metodiAmmessiPerRotta(url.pathname);
      if (!allowed) { sendJson(res, 404, { error: { code: 'CTX_ROUTE_NOT_FOUND', message: 'Operazione del contesto non trovata.' } }, method); return; }
      if (!allowed.includes(method)) { sendJson(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Metodo non consentito.' } }, method, { Allow: allowed.join(', ') }); return; }
      if (!contextService) { sendJson(res, 503, { error: { code: 'CTX_NOT_ENABLED', message: 'Il motore del contesto non è attivo in questa istanza.' } }, method); return; }
      try {
        requireNoQuery(url);
        const sessionId = decodeURIComponent(contextMatch[1]);
        const segments = (contextMatch[2] ?? '/').split('/').map(segment => decodeURIComponent(segment));
        if (segments.slice(1).some(segment => segment.includes('/') || segment.includes('\\') || segment === '..' || segment === '.')) throw Object.assign(new Error('Percorso del contesto non valido.'), { code: 'CTX_INVALID_INPUT' });
        const path = segments.join('/');
        const body = ['GET', 'HEAD'].includes(method) ? undefined : await leggiCorpoJson(req);
        const headerKey = req.headers['idempotency-key'];
        if (headerKey && body) {
          if (body.idempotencyKey && body.idempotencyKey !== headerKey) throw Object.assign(new Error('Identità della richiesta discordante.'), { code: 'CTX_INVALID_INPUT' });
          body.idempotencyKey = headerKey;
        }
        const result = await contextService.request({ sessionId, method: method === 'HEAD' ? 'GET' : method, path, body });
        if (!res.destroyed) sendJson(res, 200, result, method);
      } catch (error) {
        if (error?.code?.startsWith('CTX_')) {
          const status = /NOT_FOUND$/u.test(error.code) ? 404 : /INVALID/u.test(error.code) ? 400 : /NOT_ENABLED|CLOSED|FAILED$/u.test(error.code) ? 503 : 409;
          sendJson(res, status, { error: { code: error.code, message: error.message } }, method);
        } else {
          const normalized = normalizeError(error);
          sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
        }
      }
      return;
    }

    const nativeModelsMatch = url.pathname.match(/^\/api\/v1\/providers\/(openai|anthropic|gemini)\/models$/);
    if (method === 'GET' && nativeModelsMatch && providerProbe) {
      try { requireNoQuery(url); sendJson(res, 200, successEnvelope(await providerProbe.elencaModelli(nativeModelsMatch[1]), clock), method); }
      catch (error) { const normalized = normalizeError(error); sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method); }
      return;
    }
    /*
     * ⛔⛔ PO-05, owner: «ogni file generato deve avere un collegamento diretto per scaricarlo con un
     * clic». Prima di oggi un documento generato finiva nel workspace e in Libreria, e in chat si
     * leggeva `[binary docx file, 7714 bytes]`: vero, e inservibile.
     *
     * ⛔ Non passa da `sendJson` come le sue vicine, e non può: un `.docx` è uno zip, e dentro un
     *   JSON dovrebbe essere ricodificato — il che significa spedire i byte due volte, o corromperli.
     *   Qui i byte escono così come sono, con la stessa forma di risposta binaria già usata per le
     *   immagini di chat (`nosniff`, `no-store`, CSP che vieta tutto): un allegato non deve poter
     *   essere interpretato come pagina.
     * ⛔ `Content-Disposition` porta ENTRAMBE le forme del nome (RFC 6266, letto il 10/09/2026):
     *   `filename` è il ripiego ASCII, `filename*` la versione UTF-8, e quando ci sono tutti e due
     *   è `filename*` a vincere — senza, un nome con gli accenti arriva storto o percent-encoded
     *   a schermo. È sempre `attachment`: un file del workspace non si apre DENTRO la nostra pagina.
     * ⛔ La difesa sul percorso non è qui: è in `workspace-files.mjs`, la stessa delle altre rotte
     *   dell'albero (realpath + confine della cartella di sessione).
     */
    const scaricoMatch = method === 'GET' && sessionRegistry
      ? /^\/api\/v1\/sessions\/([^/]+)\/file$/.exec(url.pathname)
      : null;
    if (scaricoMatch) {
      try {
        const sessionId = decodeURIComponent(scaricoMatch[1]);
        const percorso = parseTreeQuery(url);
        const esito = await sessionRegistry.scaricaFile(sessionId, percorso);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        const nomi = nomiPerContentDisposition(esito.nome);
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': esito.bytes.length,
          'Content-Disposition': `attachment; filename="${nomi.ascii}"; filename*=UTF-8''${nomi.utf8}`,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, no-store',
          'Content-Security-Policy': "default-src 'none'; sandbox",
        });
        res.end(esito.bytes);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
      }
      return;
    }
    /*
     * ⭐⭐⭐⭐ 10/09/2026, owner: «ogni artefatto va salvato in libreria, con CRUD COMPLETO e azioni
     * Windows». Misurato prima di scrivere, non presunto: gli artefatti in Libreria ci finiscono
     * davvero (byte veri più `meta.json`) e il MODELLO ha il giro completo — elenca, leggi,
     * rinomina, elimina, esporta, cerca. La PERSONA aveva UNA rotta sola, `GET .../library`, cioè
     * l'elenco: niente scarico, niente rinomina, niente eliminazione, nessuna azione di Windows.
     * Queste quattro rotte sono quella metà mancante, e sono modellate riga per riga sullo scarico
     * di un file del workspace qui sopra (PO-05).
     *
     * ⛔ Il pareggio, misurato il 10/09/2026: Hermes Agent — il concorrente da battere — espone un
     *   solo endpoint HTTP, compatibile OpenAI, e nella sua documentazione («API Server», letta
     *   oggi) non esiste nessuna gestione degli artefatti via API: scarico, rinomina ed
     *   eliminazione di un artefatto non ci sono. Qui sono quattro rotte dichiarate.
     * ⛔ Verbi diversi per cose diverse, non un POST per tutto come sull'albero dei file: RFC 5789
     *   (rfc-editor.org, letta 10/09/2026) dice che PATCH porta «un insieme di istruzioni per
     *   modificare la risorsa» e che le modifiche si applicano TUTTE o NESSUNA — che è esattamente
     *   una rinomina, un campo solo dentro `meta.json`. E RFC 9110 §9.3.5 (via http.dev/delete,
     *   10/09/2026): dopo una DELETE riuscita il server manda 204 se non ha niente da dire, 200 se
     *   la risposta porta una rappresentazione. Qui è 200 con la busta standard, e non per pigrizia:
     *   ogni risposta di questa API è `{ok, data, meta}`, e un 204 sarebbe l'unica muta di tutte —
     *   la busta dice QUALE voce è sparita, che è ciò che il pannello mostra dopo.
     */
    const libreriaScaricoMatch = method === 'GET' && sessionRegistry
      ? /^\/api\/v1\/sessions\/([^/]+)\/library\/([^/]+)\/file$/.exec(url.pathname)
      : null;
    if (libreriaScaricoMatch) {
      let sessionId;
      let voceId;
      try {
        [sessionId, voceId] = [decodeURIComponent(libreriaScaricoMatch[1]), decodeURIComponent(libreriaScaricoMatch[2])];
      } catch {
        // un indirizzo con una sequenza percent non valida non nomina nessuna voce: è un 404, non un errore del server
        sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
        return;
      }
      try {
        requireNoQuery(url);
        const esito = await sessionRegistry.scaricaVoceLibreria(sessionId, voceId);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        /*
         * ⛔ Intestazioni identiche a quelle dello scarico di un file del workspace, e per gli
         *   stessi motivi: `attachment` con ENTRAMBE le forme del nome (RFC 6266 — `filename` è il
         *   ripiego ASCII, `filename*` la forma UTF-8, e dove ci sono tutte e due vince la seconda),
         *   `nosniff`, `no-store`, CSP che vieta tutto.
         * ⛔ `application/octet-stream` e non il `mediaType` della voce, di proposito: quel tipo lo
         *   ha scritto chi ha salvato la voce (spesso il modello) e non è mai stato verificato sui
         *   byte — spedirlo come tipo dichiarato significherebbe far decidere a un'etichetta non
         *   controllata come il browser tratta il file. Il contenuto esce così com'è, da salvare.
         */
        const nomi = nomiPerContentDisposition(esito.nome);
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': esito.bytes.length,
          'Content-Disposition': `attachment; filename="${nomi.ascii}"; filename*=UTF-8''${nomi.utf8}`,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, no-store',
          'Content-Security-Policy': "default-src 'none'; sandbox",
        });
        res.end(esito.bytes);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
      }
      return;
    }

    const libreriaRinominaMatch = method === 'PATCH' && sessionRegistry
      ? /^\/api\/v1\/sessions\/([^/]+)\/library\/([^/]+)$/.exec(url.pathname)
      : null;
    if (libreriaRinominaMatch) {
      let sessionId;
      let voceId;
      try {
        [sessionId, voceId] = [decodeURIComponent(libreriaRinominaMatch[1]), decodeURIComponent(libreriaRinominaMatch[2])];
      } catch {
        sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
        return;
      }
      try {
        requireNoQuery(url);
        const nome = requireNomeBody(await leggiCorpoJson(req));
        const esito = await sessionRegistry.rinominaVoceLibreria(sessionId, voceId, nome);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ id: esito.id, nomePrima: esito.nomePrima, nomeDopo: esito.nomeDopo }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
      }
      return;
    }

    const libreriaEliminaMatch = method === 'DELETE' && sessionRegistry
      ? /^\/api\/v1\/sessions\/([^/]+)\/library\/([^/]+)$/.exec(url.pathname)
      : null;
    if (libreriaEliminaMatch) {
      let sessionId;
      let voceId;
      try {
        [sessionId, voceId] = [decodeURIComponent(libreriaEliminaMatch[1]), decodeURIComponent(libreriaEliminaMatch[2])];
      } catch {
        sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
        return;
      }
      try {
        requireNoQuery(url);
        /* ⛔ Nessun corpo da leggere: la DELETE nomina la voce nell'indirizzo, e un corpo qui
           sarebbe una seconda verità sul CHE COSA cancellare. La conferma davanti alla persona
           vive nel pannello (ricerca 10/09/2026, saasui.design «SaaS Destructive Actions &
           Confirmation UX Patterns» e Pajamas/GitLab «Destructive actions»: la frizione si mette
           dove c'è qualcuno da fermare, e si misura sul raggio del danno). Il server non ha
           nessuno a cui chiedere «sei sicuro?»: esegue, e dice esattamente che cosa ha tolto. */
        const esito = await sessionRegistry.eliminaVoceLibreria(sessionId, voceId);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ eliminato: true, id: esito.id, nome: esito.nome }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
      }
      return;
    }

    /*
     * ⛔ 10/09 — «Apri», gemella di «rivela» qui sotto e con lo stesso verbo, per la stessa ragione:
     *   non scrive niente, ma apre una finestra sul computer che ospita il server — un effetto fuori
     *   da questa API, e una GET non deve averne (RFC 9110 §9.2.1).
     * ⛔ Non passa dalla rotta dei byte: quella manda `attachment`, cioè è uno SCARICO. «Apri» su
     *   Windows vuol dire un'altra cosa — lo apre il programma associato all'estensione.
     */
    const libreriaApriMatch = method === 'POST' && sessionRegistry
      ? /^\/api\/v1\/sessions\/([^/]+)\/library\/([^/]+)\/apri$/.exec(url.pathname)
      : null;
    if (libreriaApriMatch) {
      let sessionId;
      let voceId;
      try {
        [sessionId, voceId] = [decodeURIComponent(libreriaApriMatch[1]), decodeURIComponent(libreriaApriMatch[2])];
      } catch {
        sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
        return;
      }
      try {
        requireNoQuery(url);
        const esito = await sessionRegistry.apriVoceLibreria(sessionId, voceId);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ aperto: true }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
      }
      return;
    }
    const libreriaRivelaMatch = method === 'POST' && sessionRegistry
      ? /^\/api\/v1\/sessions\/([^/]+)\/library\/([^/]+)\/rivela$/.exec(url.pathname)
      : null;
    if (libreriaRivelaMatch) {
      let sessionId;
      let voceId;
      try {
        [sessionId, voceId] = [decodeURIComponent(libreriaRivelaMatch[1]), decodeURIComponent(libreriaRivelaMatch[2])];
      } catch {
        sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
        return;
      }
      try {
        requireNoQuery(url);
        /* ⛔ POST e non GET benché non si scriva niente sul disco: apre una finestra sul computer
           di chi ospita il server, cioè ha un effetto fuori da questa API — e una GET non deve
           avere effetti (RFC 9110 §9.2.1, «metodi sicuri»). È lo stesso verbo di `.../tree/reveal`. */
        const esito = await sessionRegistry.rivelaVoceLibreria(sessionId, voceId);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ rivelato: true }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
      }
      return;
    }

    const isImageUpload = method === 'POST' && url.pathname === '/api/v1/chat-images';
    const isImageRead = method === 'GET' && /^\/api\/v1\/chat-images\/[a-f0-9]{64}$/.test(url.pathname);
    if (chatImageStore && (isImageUpload || isImageRead)) {
      try {
        requireNoQuery(url);
        if (method === 'POST') {
          const image = await chatImageStore.upload(await leggiCorpoJson(req, 7 * 1024 * 1024));
          sendJson(res, 201, successEnvelope(image, clock), method);
        } else {
          const image = await chatImageStore.read(url.pathname.split('/').at(-1));
          res.writeHead(200, { 'Content-Type': image.mimeType, 'Content-Length': image.bytes.length, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; sandbox" });
          res.end(image.bytes);
        }
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
      }
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
    /*
     * ⭐⭐⭐ 04/9 — R-03, fonte della ricerca web. Stessa disciplina delle rotte
     * provider: corpo con SOLO i campi attesi, chiave mai in risposta, errori
     * con codice dichiarato. `/test` esegue una ricerca VERA con la fonte
     * corrente e torna quanti risultati e i primi titoli — mai la chiave.
     */
    const searchSourceMatch = /^\/api\/v1\/search-source(?:\/(key|key\/remove|test))?$/.exec(url.pathname);
    if (method === 'POST' && searchSourceMatch) {
      try {
        requireNoQuery(url);
        if (!searchSourceStore) { const error = new Error('Fonte di ricerca non configurata'); error.code = 'SEARCH_STORE_UNAVAILABLE'; throw error; }
        const azione = searchSourceMatch[1] ?? 'source';
        const body = await leggiCorpoJson(req, 16 * 1024);
        const keys = Object.keys(body || {});
        let data;
        if (azione === 'source') {
          if (keys.some((k) => !['source', 'endpoint'].includes(k)) || typeof body.source !== 'string' || (Object.hasOwn(body, 'endpoint') && typeof body.endpoint !== 'string')) {
            const error = new Error('Corpo non valido'); error.code = 'QUERY_INVALID'; throw error;
          }
          data = searchSourceStore.setSource({ source: body.source, endpoint: body.endpoint });
        } else if (azione === 'key') {
          if (keys.length !== 2 || typeof body.source !== 'string' || typeof body.key !== 'string') { const error = new Error('Corpo non valido'); error.code = 'QUERY_INVALID'; throw error; }
          data = searchSourceStore.setKey(body.source, body.key);
        } else if (azione === 'key/remove') {
          if (keys.length !== 1 || typeof body.source !== 'string') { const error = new Error('Corpo non valido'); error.code = 'QUERY_INVALID'; throw error; }
          data = searchSourceStore.clearKey(body.source);
        } else {
          if (keys.some((k) => k !== 'query') || (Object.hasOwn(body, 'query') && typeof body.query !== 'string')) { const error = new Error('Corpo non valido'); error.code = 'QUERY_INVALID'; throw error; }
          if (typeof provaRicercaWebFn !== 'function') { const error = new Error('Prova della ricerca non configurata'); error.code = 'SEARCH_STORE_UNAVAILABLE'; throw error; }
          if (searchSourceStore.prontezza() !== 'pronta') { const error = new Error('La fonte non è pronta'); error.code = 'SEARCH_NOT_READY'; throw error; }
          data = await provaRicercaWebFn(body.query || 'TALOS local-first coding agent');
        }
        sendJson(res, 200, successEnvelope(data, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
      }
      return;
    }

    const providerTestMatch = /^\/api\/v1\/providers\/([^/]+)\/test$/.exec(url.pathname);
    if (method === 'POST' && providerTestMatch) {
      try {
        requireNoQuery(url);
        if (!providerProbe || typeof providerProbe.prova !== 'function') { const error = new Error('Prova provider non configurata'); error.code = 'PROVIDER_STORE_UNAVAILABLE'; throw error; }
        const data = await providerProbe.prova(decodeURIComponent(providerTestMatch[1]));
        sendJson(res, 200, successEnvelope(data, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
      }
      return;
    }

    /*
     * ⭐⭐⭐ 05/9, W1-01 — LE SCHEDE TERMINALE di una sessione. Stessa forma
     * esatta di `/sessions/:id/cancel` qui sopra (POST nominata prima del
     * blanket-405, `requireNoQuery`, id da `split('/')[4]`, NOT_FOUND per un id
     * ignoto), e stesso cancello a token di W1-10: queste rotte stanno sotto
     * `/api/`, quindi senza il cookie `talos_token` sono già 401 molto prima di
     * arrivare qui — ⛔ verificato, nessuna scorciatoia aggiunta.
     *
     * ⛔⛔⛔ Questa POST è l'UNICA porta da cui nasce un `terminalId` nuovo, ed
     * è il server a sceglierlo. Il client non può proporne uno: è la cura
     * diretta di CVE-2026-59224 (Open WebUI, 2026), dove un `session_id`
     * ricevuto dal client e concatenato senza validazione permetteva di
     * agganciarsi alla PTY di un'altra persona.
     */
    if (method === 'POST' && /^\/api\/v1\/sessions\/([^/]+)\/terminals$/.test(url.pathname)) {
      try {
        requireNoQuery(url);
        if (!terminalRegistry) { const error = new Error('Terminali non disponibili'); error.code = 'TERMINAL_STORE_UNAVAILABLE'; throw error; }
        const body = await leggiCorpoJson(req);
        /* ⛔ AL CONTRARIO — un corpo con QUALUNQUE chiave è rifiutato: la sessione la dice il percorso, mai il corpo (altrimenti tornerebbe un id scelto dal client da un'altra porta). */
        const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [];
        if (keys.length !== 0) { const error = new Error('Corpo non valido'); error.code = 'QUERY_INVALID'; throw error; }
        const sessionId = decodeURIComponent(url.pathname.split('/')[4]);
        const esito = terminalRegistry.crea({ sessionId });
        if ('erroreAvvio' in esito) { const error = new Error(esito.erroreAvvio); error.code = esito.code; throw error; }
        sendJson(res, 200, successEnvelope(esito, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
      }
      return;
    }

    /*
     * ⭐⭐⭐ 05/9, W1-01 — chiusura ESPLICITA di una scheda: chiude anche la PTY
     * vera (il registro delle schede ha `chiudiPtyFn` iniettato in server.mjs).
     * ⛔⛔ La proprietà si VERIFICA: chiudere un terminale di un'altra sessione
     * risponde NOT_FOUND, lo stesso codice di uno inesistente — distinguere i
     * due casi regalerebbe a chi prova id a caso una sonda per scoprire quali
     * esistono (OWASP API1:2023 BOLA, ricerca 05/09/2026).
     */
    if (method === 'POST' && /^\/api\/v1\/sessions\/([^/]+)\/terminals\/([^/]+)\/close$/.test(url.pathname)) {
      try {
        requireNoQuery(url);
        if (!terminalRegistry) { const error = new Error('Terminali non disponibili'); error.code = 'TERMINAL_STORE_UNAVAILABLE'; throw error; }
        const body = await leggiCorpoJson(req);
        const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [];
        if (keys.length !== 0) { const error = new Error('Corpo non valido'); error.code = 'QUERY_INVALID'; throw error; }
        const parti = url.pathname.split('/');
        const sessionId = decodeURIComponent(parti[4]);
        const terminalId = decodeURIComponent(parti[6]);
        const esito = terminalRegistry.chiudi({ sessionId, terminalId });
        if ('erroreAvvio' in esito) { const error = new Error(esito.erroreAvvio); error.code = esito.code; throw error; }
        sendJson(res, 200, successEnvelope(esito, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
      }
      return;
    }

    /*
     * ⭐⭐⭐ 05/9, W1-05 — LE TRE SCRITTURE GIT di una sessione: stage,
     * unstage, commit. Stessa forma esatta delle POST terminale qui sopra
     * (nominate prima del blanket-405, `requireNoQuery`, sessionId da
     * `split('/')[4]`, NOT_FOUND per un id ignoto) e stesso cancello a token
     * di W1-10: stanno sotto `/api/`, quindi senza il cookie `talos_token`
     * sono già 401 molto prima di arrivare qui.
     *
     * ⛔⛔⛔ NON ESISTE una POST di push, e non è una dimenticanza: il push si
     * chiede all'owner ogni volta. `src/git-service.mjs` non ha quella porta,
     * e `tests/git-service.test.mjs` la pinna leggendo il sorgente — se
     * qualcuno la aggiungesse, quel test diventa rosso.
     *
     * ⛔⛔ I percorsi arrivano dal client e sono SEMPRE espliciti: non esiste
     * una forma "tutto". L'indice git è CONDIVISO con l'owner e con le altre
     * sessioni, e `git commit` fotografa l'intero indice, non solo ciò che
     * uno ha appena aggiunto — un `-A` o un `.` da qui raccoglierebbe lavoro
     * non nostro, ed è un difetto già pagato una volta in questo progetto.
     * La convalida dei percorsi (assoluti, `..`, magia di pathspec, `-`
     * iniziale) sta nel servizio, in un posto solo: GIT_PATH_INVALID.
     */
    if (method === 'POST' && /^\/api\/v1\/sessions\/([^/]+)\/git\/(stage|unstage|commit)$/.test(url.pathname)) {
      try {
        requireNoQuery(url);
        if (!gitService) { const error = new Error('Git non disponibile'); error.code = 'GIT_STORE_UNAVAILABLE'; throw error; }
        const body = await leggiCorpoJson(req);
        const parti = url.pathname.split('/');
        const sessionId = decodeURIComponent(parti[4]);
        const azione = parti[6];
        /* ⛔ AL CONTRARIO — solo le chiavi previste da QUESTA azione: un corpo che ne porta altre è rifiutato, mai ignorato in silenzio (un `messaggio` su uno stage vorrebbe dire che chi chiama ha capito un'altra cosa). */
        const ammesse = azione === 'commit' ? ['percorsi', 'messaggio'] : ['percorsi'];
        const chiavi = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : null;
        if (chiavi === null || chiavi.some((k) => !ammesse.includes(k))) {
          const error = new Error('Corpo non valido'); error.code = 'QUERY_INVALID'; throw error;
        }
        const esito = azione === 'commit'
          ? await gitService.commit({ sessionId, percorsi: body.percorsi, messaggio: body.messaggio })
          : await gitService[azione]({ sessionId, percorsi: body.percorsi });
        if ('erroreAvvio' in esito) { const error = new Error(esito.erroreAvvio); error.code = esito.code; throw error; }
        sendJson(res, 200, successEnvelope(esito, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
      }
      return;
    }

    if (method === 'POST' && url.pathname === '/api/v1/huggingface/download') {
      try {
        requireNoQuery(url);
        const body = await leggiCorpoJson(req, 1_000_000);
        // 08/9, BH-07 — prima l'input di chi chiama, poi il servizio: stesso ordine di /huggingface/repo e /huggingface/image, e un corpo malformato non torna valido aspettando (vedi la doc su requireHuggingFaceDownloadBody)
        requireHuggingFaceDownloadBody(body);
        if (!localModelTransfer || typeof localModelTransfer.start !== 'function') { const error = new Error('Download Hugging Face non configurato'); error.code = 'RUNTIME_NOT_AVAILABLE'; throw error; }
        const data = await localModelTransfer.start(body);
        sendJson(res, 200, successEnvelope(data, clock), method);
      } catch (error) { const normalized = normalizeError(error); sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method); }
      return;
    }
    if (method === 'POST' && /^\/api\/v1\/huggingface\/downloads\/([^/]+)\/(pause|resume|cancel)$/.test(url.pathname)) {
      try {
        requireNoQuery(url); const match = /^\/api\/v1\/huggingface\/downloads\/([^/]+)\/(pause|resume|cancel)$/.exec(url.pathname); const id = decodeURIComponent(match[1]);
        if (!localModelTransfer || typeof localModelTransfer[match[2]] !== 'function') { const error = new Error('Download Hugging Face non configurato'); error.code = 'RUNTIME_NOT_AVAILABLE'; throw error; }
        const changed = await localModelTransfer[match[2]](id); if (!changed) { const error = new Error('Download non trovato o non modificabile'); error.code = 'NOT_FOUND'; throw error; }
        sendJson(res, 200, successEnvelope(localModelTransfer.status(id), clock), method);
      } catch (error) { const normalized = normalizeError(error); sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method); }
      return;
    }

    /*
     * ⭐⭐⭐ 27/8 — un compito LIBERO su una cartella dell'allowlist, owner:
     * "per adesso un allowlist per testare... come se fosse un vero coding agent".
     * Stesso stile dell'endpoint sopra, corpo diverso: {cartellaId,
     * consegna, comandoProva?, modello?} invece di {taskId, modello?}.
     */
    if (method === 'POST' && sessionRegistry && url.pathname === '/api/v1/sessions/custom') {
      try {
        requireNoQuery(url);
        const corpo = await leggiCorpoJson(req);
        const { body: senzaImmagini, immagini } = await imageInput(corpo);
        const richiesta = requireCustomTaskBody(senzaImmagini);
        if (immagini.length) richiesta.immagini = immagini;
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        const { body, immagini } = await imageInput(await leggiCorpoJson(req));
        const { messaggio, redirectId } = requireRedirectBody(body);
        const esito = sessionRegistry.reindirizza(sessionId, messaggio, { ...(redirectId ? { redirectId } : {}), ...(immagini.length ? { immagini } : {}) });
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ ok: true, redirectId: esito.redirectId }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        const { body, immagini } = await imageInput(await leggiCorpoJson(req));
        const nuovoMessaggioUtente = requireResumeBody(body);
        if (!nuovoMessaggioUtente && immagini.length) throw Object.assign(new Error('Scrivi un messaggio per inviare le immagini.'), { code: 'QUERY_INVALID' });
        const esito = sessionRegistry.resume(sessionId, nuovoMessaggioUtente, immagini);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ sessionId: esito.sessionId }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
      }
      return;
    }

    /*
     * ⭐⭐⭐ 28/8 — FASE A (hook), piano `elegant-spinning-dongarra.md`.
     * L'UNICA strada che rende un hook eseguibile — stesso principio
     * "fail-closed" già visto altrove (un flag esplicito esiste solo
     * per bypassarlo esplicitamente): senza una chiamata
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        const { body, immagini } = await imageInput(corpo);
        const messaggio = requireQueueBody(body);
        const esito = sessionRegistry.accodaMessaggio(sessionId, messaggio, immagini);
        if ('erroreAvvio' in esito) {
          const errore = new Error(esito.erroreAvvio);
          errore.code = esito.code;
          throw errore;
        }
        if (req.aborted || res.destroyed) return;
        sendJson(res, 200, successEnvelope({ ok: true, posizione: esito.posizione }, clock), method);
      } catch (error) {
        const normalized = normalizeError(error);
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
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
        sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
      }
      return;
    }

      /*
       * ⭐⭐⭐ 07/9 — LE ROTTE DEL BROWSER VIVO. Owner: «visualizzare ogni fottuta pagina web».
       * La cornice non basta: chi vieta l'iframe resta un rettangolo grigio, e Chrome ci carica
       * dentro la propria pagina d'errore sparando un `load` regolare — così nemmeno il ripiego
       * scatta. Qui la pagina la apre un Chromium di sistema pilotato dal SERVER, e alla pagina di
       * TALOS ne arriva lo schermo; i gesti fanno la strada opposta.
       * ⛔ Ogni rotta è NOMINATA per esteso, non riconosciuta da una regex con un segmento libero:
       *   il guardiano dell'inventario (tests/http-inventario-rotte.test.mjs) sa leggere gli schemi
       *   nominati, e una regex con `([a-z]+)` gli avrebbe nascosto quante e quali rotte esistono.
       *   Verboso qui, ma nessuna porta resta fuori dall'elenco che decide 404 contro 405.
       */
      const VIVE = ['/api/v1/browser/vivo/apri', '/api/v1/browser/vivo/gesto', '/api/v1/browser/vivo/descrivi',
        '/api/v1/browser/vivo/chiudi', '/api/v1/browser/vivo/schermo', '/api/v1/browser/vivo/stato',
        '/api/v1/browser/vivo/misura'];
      if (VIVE.includes(url.pathname)) {
        /* Fuori dal ramo GET non c'è né `data` né il try che normalizza gli errori: qui ce li mette
           questo blocco, così una rotta nuova non eredita per sbaglio il comportamento di un'altra. */
        let data;
        try {
          if (!browserVivo) { const error = new Error('Browser vivo non configurato'); error.code = 'BROWSER_VIVO_NON_CONFIGURATO'; throw error; }
          const sessionId = url.searchParams.get('sessione') || '';
          if (!sessionId) { const error = new Error('Serve la sessione'); error.code = 'QUERY_INVALID'; throw error; }

          if (method === 'GET' && url.pathname === '/api/v1/browser/vivo/stato') {
            data = browserVivo.stato();
          } else if (method === 'GET' && url.pathname === '/api/v1/browser/vivo/schermo') {
            /*
             * Lo schermo trasmesso, un fotogramma per evento SSE. ⛔ Da qui in poi gli header sono
             * già partiti: un problema chiude il flusso, mai un secondo sendJson.
             */
            const flusso = createSseSession({
              response: res, headers: SECURITY_HEADERS, heartbeatMs: INTERVALLO_BATTITO_SSE_MS,
              setIntervalFn: impostaIntervalloFn, clearIntervalFn: cancellaIntervalloFn,
            });
            flusso.start();
            let ferma = null;
            try {
              ferma = await browserVivo.segui(sessionId, (frame) => {
                if (flusso.closed) return;
                flusso.send({ dati: frame.dati, metadati: frame.metadati, numero: frame.numeroFrame, url: frame.url });
              });
            } catch (errore) {
              flusso.send({ errore: errore?.message || 'Non riesco a trasmettere questa pagina', codice: errore?.code || 'BROWSER_VIVO_ERRORE' });
              flusso.close();
              return;
            }
            // chi chiude la pagina ferma anche la trasmissione: un Chromium che dipinge per nessuno è RAM buttata
            res.once('close', () => { void ferma?.(); });
            return;
          } else if (method === 'POST' && url.pathname === '/api/v1/browser/vivo/apri') {
            const corpo = await leggiCorpoJson(req);
            const indirizzo = typeof corpo?.url === 'string' ? corpo.url : '';
            if (!indirizzo || indirizzo.length > 2048) { const error = new Error('Indirizzo mancante'); error.code = 'QUERY_INVALID'; throw error; }
            data = await browserVivo.apri(sessionId, indirizzo, { larghezza: Number(corpo?.larghezza) || 1280, altezza: Number(corpo?.altezza) || 800 });
          } else if (method === 'POST' && url.pathname === '/api/v1/browser/vivo/gesto') {
            data = await browserVivo.gesto(sessionId, await leggiCorpoJson(req) || {});
          } else if (method === 'POST' && url.pathname === '/api/v1/browser/vivo/descrivi') {
            const corpo = await leggiCorpoJson(req);
            data = await browserVivo.descrivi(sessionId, { x: Number(corpo?.x) || 0, y: Number(corpo?.y) || 0 });
          } else if (method === 'POST' && url.pathname === '/api/v1/browser/vivo/misura') {
            /* ⛔ 08/9, owner: «non si estende a tutto schermo». La pagina pilotata prende la forma
               del riquadro che la persona ha davanti, all'apertura e a ogni ridimensionamento.
               Niente ricaricamento: cambia il viewport, non la pagina. */
            const corpo = await leggiCorpoJson(req);
            data = await browserVivo.misura(sessionId, {
              larghezza: Number(corpo?.larghezza) || 0,
              altezza: Number(corpo?.altezza) || 0,
            });
          } else if (method === 'POST' && url.pathname === '/api/v1/browser/vivo/chiudi') {
            data = await browserVivo.chiudi(sessionId);
          } else { const error = new Error('Metodo non consentito'); error.code = 'METHOD_NOT_ALLOWED'; throw error; }
          sendJson(res, 200, successEnvelope(data, clock), method);
        } catch (error) {
          const normalized = normalizeError(error);
          sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
        }
        return;
      }

    /*
     * ⛔⛔⛔ 07/9 — QUI STAVA IL DIFETTO: un metodo diverso da GET/HEAD tornava 405 su
     * QUALUNQUE indirizzo, esistente o inventato. Misurato sul server vivo il 07/09/2026:
     * `POST /api/v1/artifacts` (che non esiste: esiste solo `/api/v1/artifacts/:id`) e
     * `POST /api/v1/questa-non-esiste` rispondevano tutt'e due 405 — dall'esterno una rotta
     * vera e una inventata erano la stessa cosa.
     * Ora la domanda si fa nell'ordine giusto: prima «c'è una porta a questo indirizzo?»
     * (ROTTE_API, in cima al file), poi «è aperta a questo metodo?». E il 405 porta l'Allow
     * VERO della rotta, come RFC 9110 §15.5.6 pretende — non più `GET, HEAD` anche dove si
     * accetta POST.
     * ⛔ Fuori da `/api/` non cambia niente: i file statici restano leggibili e basta, che è
     * il contratto scritto sopra la prima rotta POST di questo file.
     */
    if (!['GET', 'HEAD'].includes(method)) {
      const ammessi = url.pathname.startsWith('/api/') ? metodiAmmessiPerRotta(url.pathname) : ['GET', 'HEAD'];
      if (ammessi === null) {
        sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
        return;
      }
      sendJson(res, 405, errorEnvelope('METHOD_NOT_ALLOWED', clock), method, { Allow: ammessi.join(', ') });
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
        /*
         * ⛔⛔ 08/9, BH-19 — DUE GUASTI DIVERSI SOTTO LO STESSO CODICE. «manca il parametro
         * `repo`» e «l'hub non è collegato» stavano nella stessa guardia, e la risposta era per
         * entrambi 503 RUNTIME_NOT_AVAILABLE: una richiesta scritta male accusava il server di
         * essere giù, e chi la leggeva andava a cercare un servizio spento che non c'entrava.
         * ⇒ Prima l'input di chi chiama (400), poi la disponibilità del servizio (503) —
         *   la stessa forma che `/api/v1/huggingface/image` usa già trenta righe più sotto.
         */
        if (!repo) { const error = new Error('Parametro repo mancante'); error.code = 'QUERY_INVALID'; throw error; }
        if (!hfHubClient?.describeModel || !hfHubClient?.listGgufFiles) { const error = new Error('Hub Hugging Face non configurato'); error.code = 'RUNTIME_NOT_AVAILABLE'; throw error; }
        const detail = await hfHubClient.describeModel(repo, revision || 'main');
        /*
         * ⛔⛔⛔ 03/9 — BUG REALE trovato riproducendo la chiamata a mano:
         * `listGgufFiles`/`pathsInfo` (hf-hub-client.mjs) validano la
         * revision con `ensureRevision` — un commit hash vero (40-64 esa),
         * MAI un nome di branch come 'main', per disciplina di sicurezza
         * (pin sempre a un commit esatto, mai un ref mutabile). Questo
         * endpoint passava però `revision` GREZZA (il parametro della query,
         * non ancora risolta) a entrambe le chiamate: qualunque chiamante
         * che passasse 'main' — o qualunque valore non ancora risolto —
         * riceveva un 500 (INTERNAL_ERROR) invece di una risposta onesta.
         * ⛔ Non raggiungibile dalla UI di oggi (app.js passa sempre
         * `item.revision` già risolto dalla ricerca, mai la stringa letterale
         * 'main') — ma un endpoint HTTP resta raggiungibile da chiunque tocchi
         * il loopback, stesso principio già in uso altrove in questo file:
         * non deve fidarsi ciecamente dell'input. `detail.revision` (quello
         * che `describeModel` ha GIÀ risolto un attimo fa) è la fonte
         * corretta, sempre un hash valido quando describeModel riesce — la
         * guardia sul revision GREZZO resta solo per decidere SE elencare i
         * file (fase 2 della UI), mai per il VALORE passato.
         */
        const listed = revision ? await hfHubClient.listGgufFiles(repo, detail.revision) : [];
        const files = revision && hfHubClient.pathsInfo ? await hfHubClient.pathsInfo(repo, detail.revision, listed.map((item) => item.path)) : listed;
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
      } else if (url.pathname === '/api/v1/tools') {
        /*
         * ⭐⭐⭐ O-01 (04/9) — gli attrezzi offerti PRIMA che una sessione
         * esista. ⛔ Non un doppione di `/sessions/:id/tools`: l'owner apre il
         * foglio del «+» spesso senza aver ancora avviato niente, e senza
         * questa rotta l'unica risposta onesta sarebbe «nessuna sessione
         * attiva» — vera, e completamente inutile. Qui i permessi
         * per-attrezzo sono `null`: nessuna sessione li ha ancora scelti.
         */
        requireNoQuery(url);
        if (!sessionRegistry?.elencaAttrezziPredefiniti) { const errore = new Error('Elenco attrezzi non configurato'); errore.code = 'REPORT_UNAVAILABLE'; throw errore; }
        const esito = await sessionRegistry.elencaAttrezziPredefiniti();
        data = { attrezzi: esito.attrezzi, errore: esito.errore };
      } else if (url.pathname === '/api/v1/search-source') {
        requireNoQuery(url);
        if (!searchSourceStore) { const error = new Error('Fonte di ricerca non configurata'); error.code = 'SEARCH_STORE_UNAVAILABLE'; throw error; }
        data = searchSourceStore.listPublic();
      } else if (url.pathname === '/api/v1/setup/stato') {
        requireNoQuery(url);
        if (!setupStatoFn) {
          const errore = new Error('Stato del primo avvio non configurato'); errore.code = 'REPORT_UNAVAILABLE'; throw errore;
        }
        data = await setupStatoFn();
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
        /*
         * ⛔⛔ 07/9 — la scheda prometteva «Apri Doctor, copia il riferimento» e poi non diceva
         * NIENTE piu di quello che gia si leggeva a schermo: solo il codice. Il motivo vero era
         * registrato (`safeDiagnosticDetail` lo tiene, gia ripulito da chiavi, percorsi e nomi di
         * variabili d'ambiente) e nessuno lo restituiva. Un riferimento che non porta a niente e
         * peggio di nessun riferimento: manda la persona a cercare una risposta che non c'e.
         */
        data = { reference, code: detail.code, operation: detail.operation, requestId: detail.requestId, detail: detail.detail || '' };
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
        // ⭐⭐⭐ O-01 (04/9): il Capability hub elenca gli attrezzi VERI offerti al modello (43, letti dal kernel) invece dei sette scritti a mano nel template — stesso principio esatto di mcpMatch qui sotto.
        const toolsMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/tools$/.exec(url.pathname);
        const mcpMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/mcp$/.exec(url.pathname);
        // ⭐⭐⭐ W1-02 (04/9) — il PROCESS LEDGER di una sessione: i processi che ha
        // lanciato (attrezzo `shell`/`prova` e comandi diretti dell'owner), con
        // comando, origine, inizio, durata ed esito, più la GUARDIA DI STALLO
        // (silenzio · giro a vuoto) sulla stessa storia. Stesso principio esatto di
        // mcpMatch qui sopra: sola lettura, ricostruito dagli eventi già persistiti,
        // ⛔ nessuna azione — la guardia SEGNALA, fermare è `POST .../stop`.
        const processesMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/processes$/.exec(url.pathname);
        // ⭐⭐⭐ W1-03 (04/9) — LE TRE METRICHE di una sessione per la Board
        // ridisegnata (G3-G4): tasso di cache, tempo al primo token, motivo di
        // chiusura del giro. Stesso principio esatto di processesMatch qui sopra:
        // sola lettura, DERIVATE dagli eventi già persistiti, ⛔ nessuna scrittura
        // nuova sul disco e nessun collettore esterno da montare.
        const metricsMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/metrics$/.exec(url.pathname);
        // ⭐⭐⭐ W1-01 (05/9) — le SCHEDE TERMINALE di una sessione. Stesso principio
        // esatto di processesMatch qui sopra (sola lettura, per-sessione), con una
        // differenza che conta: ⛔ elenca SOLO le schede di QUESTA sessione, mai
        // tutte quelle vive sul server — un terminale di un'altra sessione non si
        // vede nemmeno per nome, altrimenti l'elenco stesso diventerebbe la sonda
        // che permette di indovinare un terminalId da usare sulla WebSocket.
        const terminalsMatch = terminalRegistry && /^\/api\/v1\/sessions\/([^/]+)\/terminals$/.exec(url.pathname);
        /*
         * ⭐⭐⭐ W1-05 (05/9) — le due LETTURE git di una sessione. Stesso
         * principio esatto di processesMatch/metricsMatch qui sopra: sola
         * lettura, per-sessione, derivata da ciò che esiste già.
         * ⛔ E davvero sola lettura anche dal punto di vista di git: ogni
         * comando porta `--no-optional-locks`, così un pannello Review che si
         * aggiorna non si prende `index.lock` sotto le mani di chi sta
         * lavorando nella stessa cartella — l'indice qui è CONDIVISO con
         * l'owner e con le altre sessioni (git(1), ricerca 05/09/2026).
         */
        const gitStatusMatch = gitService && /^\/api\/v1\/sessions\/([^/]+)\/git\/status$/.exec(url.pathname);
        const gitBranchMatch = gitService && /^\/api\/v1\/sessions\/([^/]+)\/git\/branch$/.exec(url.pathname);
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
        // K-I 06/9 — la cornice del Browser: `?url=` e si risponde con le intestazioni lette, mai con la pagina
        const browserFrameMatch = url.pathname === '/api/v1/browser/incorniciabile';
        // 06/9 — la pagina di un dev server LOCALE resa della nostra origine, con l'overlay iniettato
        const browserProxyMatch = url.pathname === '/api/v1/browser/proxy';

        if (browserProxyMatch) {
          const indirizzo = url.searchParams.get('url');
          if (typeof indirizzo !== 'string' || indirizzo.length === 0 || indirizzo.length > 2048) { const error = new Error('Indirizzo mancante'); error.code = 'QUERY_INVALID'; throw error; }
          const esito = await proxyPagina(indirizzo, { fetchFn, origineNostra: `http://${req.headers.host || '127.0.0.1'}` });
          if (!esito.ok) { const error = new Error(esito.motivo); error.code = esito.codice; throw error; }
          sendHtmlProxato(res, esito.html, method);
          return;
        }
        /*
         * ⛔⛔⛔ 06/9, owner, due volte e in maiuscolo: «IL MODELLO DEVE LEGGERE LA PAGINA DOVE VADO
         * IO, DEVE AVERE GLI OCCHI SULLA SEZIONE BROWSER ANCHE SE SONO IO A NAVIGARCI DENTRO».
         * Dal browser non si può: una pagina di un'altra origine dentro una cornice non si legge dal
         * JavaScript che la ospita, ed è il confine di origine, non un limite nostro (ricerca
         * 06/09/2026: browser-use «Leaving Playwright for CDP», microsoft/playwright #21780).
         * Quindi la legge il server, con la STESSA funzione dell'attrezzo `naviga` — stessa
         * validazione degli indirizzi, già scritta e già provata, invece di una seconda che diverge.
         * ⛔ Il server non ha i cookie della persona: di un sito dietro login vede la versione
         * pubblica, e la vista lo dichiara a schermo.
         * ⛔ Sta DENTRO questa catena, non prima: fuori impostava `data` e poi cadeva nel ramo
         * finale che risponde NOT_FOUND — misurato con una curl, non dedotto.
         */
        /*
         * ⭐⭐⭐ 06/9 — decisioni F9, F10, F19, F20, F21, tutte ❌ nell'audit: la modale «Nuova
         * sessione» non diceva niente della cartella che stai per dare a un agente. Quanti file ha,
         * se è una radice, il ramo, le modifiche non salvate, i repo annidati: si scoprivano
         * avviando la sessione e guardandola annaspare. Il conto vive in workspace-info.mjs, con il
         * tetto di scansione dichiarato — contare una cartella enorme è esso stesso il problema.
         */
        if (url.pathname === '/api/v1/workspace-info') {
          const percorso = url.searchParams.get('path');
          if (typeof percorso !== 'string' || percorso.length === 0 || percorso.length > 4096) {
            const error = new Error('Percorso mancante'); error.code = 'QUERY_INVALID'; throw error;
          }
          data = await ritrattoCartellaFn(percorso);
        } else if (url.pathname === '/api/v1/browser/leggi') {
          const indirizzo = url.searchParams.get('url');
          if (typeof indirizzo !== 'string' || indirizzo.length === 0 || indirizzo.length > 2048) {
            const error = new Error('Indirizzo mancante'); error.code = 'QUERY_INVALID'; throw error;
          }
          const pagina = await leggiPaginaFn(indirizzo);
          data = { url: pagina.url, stato: pagina.stato, corpo: pagina.corpo };
        } else if (browserFrameMatch) {
          const indirizzo = url.searchParams.get('url');
          if (typeof indirizzo !== 'string' || indirizzo.length === 0 || indirizzo.length > 2048) { const error = new Error('Indirizzo mancante'); error.code = 'QUERY_INVALID'; throw error; }
          const origineNostra = `http://${req.headers.host || '127.0.0.1'}`;
          const esitoCornice = await verificaIncorniciabile(indirizzo, { fetchFn, origineNostra });
          /*
           * ⭐ 07/9 — la risposta non dice solo SE la pagina si lascia incorniciare: dice anche PER
           * QUALE VIA va mostrata, e perché. La scelta la fa `decidiVia` (provata nel suo modulo, con
           * la metà al contrario), non una catena di `if` scritta due volte — una qui e una nella
           * pagina, che è il modo in cui due comportamenti divergono senza che nessuno se ne accorga.
           * ⛔ `proxyDisponibile: false`: il proxy universale su origine separata NON è ancora acceso
           *   (serve un secondo listener e la riscrittura dei link interni, non fatta). Dichiararlo
           *   disponibile qui sarebbe una promessa che la pagina non può mantenere.
           */
          const scelta = decidiVia({
            incorniciabile: esitoCornice.incorniciabile,
            motivo: esitoCornice.motivo,
            url: esitoCornice.url,
            proxyDisponibile: false,
            vivoDisponibile: Boolean(browserVivo),
          });
          data = { ...esitoCornice, via: scelta.via, percheVia: scelta.perche };
        } else if (gitStatusMatch || gitBranchMatch) {
          requireNoQuery(url);
          const trovato = gitStatusMatch ?? gitBranchMatch;
          let sessionId;
          try {
            sessionId = decodeURIComponent(trovato[1]);
          } catch {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          const esito = gitStatusMatch
            ? await gitService.stato({ sessionId })
            : await gitService.ramo({ sessionId });
          if ('erroreAvvio' in esito) {
            const errore = new Error(esito.erroreAvvio);
            errore.code = esito.code;
            throw errore;
          }
          data = esito;
        } else if (terminalsMatch) {
          requireNoQuery(url);
          let sessionId;
          try {
            sessionId = decodeURIComponent(terminalsMatch[1]);
          } catch {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          const esito = terminalRegistry.elenca(sessionId);
          if ('erroreAvvio' in esito) {
            const errore = new Error(esito.erroreAvvio);
            errore.code = esito.code;
            throw errore;
          }
          data = { items: esito.items };
        } else if (projectTreeMatch) {
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
        } else if (toolsMatch) {
          requireNoQuery(url);
          let sessionId;
          try {
            sessionId = decodeURIComponent(toolsMatch[1]);
          } catch {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          const esito = await sessionRegistry.elencaAttrezzi(sessionId);
          if ('erroreAvvio' in esito) {
            const errore = new Error(esito.erroreAvvio);
            errore.code = esito.code;
            throw errore;
          }
          data = { attrezzi: esito.attrezzi, errore: esito.errore };
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
        } else if (processesMatch) {
          requireNoQuery(url);
          let sessionId;
          try {
            sessionId = decodeURIComponent(processesMatch[1]);
          } catch {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          const esito = await sessionRegistry.elencaProcessi(sessionId);
          if ('erroreAvvio' in esito) {
            const errore = new Error(esito.erroreAvvio);
            errore.code = esito.code;
            throw errore;
          }
          /*
           * ⛔ `registrato` viaggia accanto a `processi`: una sessione che non ha
           * ancora un solo evento torna `processi:null` + `motivo:'non-registrato'`,
           * MAI `[]` — «non registrato» e «nessun processo» sono due fatti diversi
           * e chi legge questa rotta deve poterli distinguere (stesso principio
           * "gli stati sono tre" di hooksMatch/mcpMatch qui sopra).
           */
          /*
           * ⛔⛔ 07/9 — il registro sapeva se la sessione era stata INTERROTTA da un riavvio e
           * questa rotta lo buttava via scegliendo i campi a mano: dal filo usciva una
           * sessione indistinguibile da una viva. Un difetto dello stesso tipo era già stato
           * trovato e curato in `elencaFigli` (06/9). Il campo si dichiara, non si deduce.
           */
          data = { registrato: esito.registrato, processi: esito.processi, motivo: esito.motivo, guardia: esito.guardia, interrotta: esito.interrotta === true };
        } else if (metricsMatch) {
          requireNoQuery(url);
          let sessionId;
          try {
            sessionId = decodeURIComponent(metricsMatch[1]);
          } catch {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          const esito = sessionRegistry.elencaMetriche(sessionId);
          if ('erroreAvvio' in esito) {
            const errore = new Error(esito.erroreAvvio);
            errore.code = esito.code;
            throw errore;
          }
          /*
           * ⛔ `registrato` viaggia accanto alle tre metriche per la stessa ragione
           * di processesMatch qui sopra: una sessione senza un solo evento torna
           * `cache:null` + `motivo:'non-registrato'`, MAI uno 0% — «non misurato» e
           * «zero» sono due fatti diversi, e i dati veri li contengono ENTRAMBI (5
           * sessioni su 73 hanno una cache a zero VERA, 2 non hanno consumo affatto).
           * ⛔ Ogni valore assente porta il proprio `motivoAssente` DETTO a parole:
           * chi legge questa rotta non deve mai indovinare perché manca.
           */
          /*
           * ⛔⛔ 07/9 — il registro sapeva se la sessione era stata INTERROTTA da un riavvio e
           * questa rotta lo buttava via scegliendo i campi a mano: dal filo usciva una
           * sessione indistinguibile da una viva. Un difetto dello stesso tipo era già stato
           * trovato e curato in `elencaFigli` (06/9). Il campo si dichiara, non si deduce.
           */
          data = { registrato: esito.registrato, motivo: esito.motivo, giri: esito.giri, cache: esito.cache, primoToken: esito.primoToken, chiusura: esito.chiusura, interrotta: esito.interrotta === true };
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
          /*
           * ⛔⛔⛔ 06/9, caccia ai bug (CB-01), provato non ipotizzato: il pulsante «Apri» della
           * carta apriva questo indirizzo in una scheda nuova, cioè l'HTML SCRITTO DAL MODELLO
           * finiva sull'origine della app. Da lì uno script leggeva il `localStorage` di TALOS
           * (misurate le chiavi delle impostazioni) e portava fuori il valore con una navigazione
           * top-level: la CSP fermava `fetch`, non `location.href`.
           * L'iframe in chat era già protetto (`sandbox="allow-scripts"` senza `allow-same-origin`);
           * il pulsante «Apri» usciva da quella protezione e non ne metteva un'altra.
           * ⇒ La protezione si sposta dove non si può aggirare: sulla RISPOSTA. La direttiva
           * `sandbox` della CSP applica a un documento di primo livello le stesse regole dell'iframe
           * (MDN, «CSP: sandbox», letto 06/09/2026): senza `allow-same-origin` l'origine è opaca —
           * niente localStorage, niente cookie della app — e senza `allow-top-navigation` la
           * navigazione che portava fuori i dati non parte. `allow-scripts` resta, perché un
           * artefatto che non può muoversi non serve a niente.
           * ⛔ `sandbox` in CSP funziona SOLO come intestazione HTTP, mai come <meta>: per questo
           * sta qui e non dentro l'HTML.
           */
          send(res, 200, 'text/html; charset=utf-8', html, method, {
            'Content-Security-Policy': "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; frame-ancestors 'self'",
            'X-Frame-Options': 'SAMEORIGIN',
          });
          return;
        } else if (url.pathname.startsWith('/api/')) {
          /*
           * ⛔⛔ 07/9 — la stessa domanda del blanket qui sopra, dalla parte della GET: se a
           * questo indirizzo una rotta c'è ma vuole un altro metodo (tutte le POST: /stop,
           * /rename, /qualify...), la risposta giusta è 405 con l'Allow vero, non 404.
           * Misurato prima della cura: GET /api/v1/local-models/x/rename e GET su un nome
           * inventato rispondevano identici, e la prima esiste.
           * ⛔ Solo se GET NON è fra i metodi ammessi: una rotta GET che è arrivata fin qui
           * (id inesistente, o servizio non collegato) deve continuare a dire 404 — è il caso
           * che il test dei terminali presidia, «la GET senza registro non combacia la rotta».
           */
          const ammessi = metodiAmmessiPerRotta(url.pathname);
          if (ammessi !== null && !ammessi.includes('GET')) {
            sendJson(res, 405, errorEnvelope('METHOD_NOT_ALLOWED', clock), method, { Allow: ammessi.join(', ') });
            return;
          }
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        } else {
          requireValidStaticQuery(url);
          const asset = await staticHandler(url.pathname);
          if (!asset) {
            sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
            return;
          }
          /*
           * ⛔ 08/9, BH-06 — solo il DOCUMENTO porta il nonce, e uno diverso a ogni risposta:
           * un foglio di stile o uno script serviti a parte non hanno un `<style>` da timbrare,
           * e ripetere lo stesso valore su più risposte trasformerebbe il nonce in una costante
           * pubblica. Il file su disco non viene toccato: la riga entra qui, mentre si serve.
           */
          if (typeof asset.contentType === 'string' && asset.contentType.startsWith('text/html')) {
            const nonce = creaNonceCsp();
            const documento = iniettaNonceNelDocumento(asset.body.toString('utf8'), nonce);
            send(res, asset.statusCode, asset.contentType, documento, method, intestazioniDocumentoConNonce(nonce));
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
      sendJson(res, normalized.statusCode, errorEnvelope(normalized.code, clock, { errore: error }), method);
    }
  }

  return function httpApp(req, res) {
    handle(req, res).catch(() => {
      sendJson(res, 500, errorEnvelope('INTERNAL_ERROR', clock), req.method || 'GET');
    });
  };
}
