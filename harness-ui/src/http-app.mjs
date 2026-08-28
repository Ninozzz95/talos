import { leggiArtefatto as leggiArtefattoReale } from './artifact-store.mjs';
import { modelloRichiestaValido, permessiRichiestaValido, reasoningRichiestaValido } from './config.mjs';

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
  'CAMPAIGN_NOT_ALLOWED',
  'CAMPAIGN_UNREADABLE',
  'ROW_INVALID',
  'QUERY_INVALID',
  'REPORT_UNAVAILABLE',
  'PAYLOAD_LIMIT',
  'METHOD_NOT_ALLOWED',
  'NOT_FOUND',
  'TASK_NOT_ALLOWED',
  'SESSION_NOT_READY',
  'AUTOMATION_INVALID',
  'CATALOG_UNREACHABLE',
  'CATALOG_UPSTREAM_ERROR',
  'INTERNAL_ERROR',
  /* ⭐ 27/8 — le quattro azioni sul file dell'albero (owner: rinomina, apri, rivela in Esplora File, elimina), vedi workspace-files.mjs. */
  'FILE_NOT_FOUND',
  'FILE_TOO_LARGE',
  'FILE_EXISTS',
  'PLATFORM_UNSUPPORTED',
]);

const STATUS_BY_CODE = Object.freeze({
  CONFIG_INVALID: 500,
  CAMPAIGN_NOT_ALLOWED: 404,
  CAMPAIGN_UNREADABLE: 503,
  ROW_INVALID: 422,
  QUERY_INVALID: 400,
  REPORT_UNAVAILABLE: 404,
  PAYLOAD_LIMIT: 413,
  METHOD_NOT_ALLOWED: 405,
  NOT_FOUND: 404,
  TASK_NOT_ALLOWED: 404,
  /** ⭐ 409 Conflict: la sessione origine esiste ma non è nello stato giusto per un fork (ancora in corso, o senza storia). */
  SESSION_NOT_READY: 409,
  /** ⭐ 27/8 — un tetto duro dell'automazione violato (intervallo/limite fuori range) è un errore di CONTENUTO, non di forma: stesso status di ROW_INVALID. */
  AUTOMATION_INVALID: 422,
  /** ⭐ 27/8 — il catalogo modelli dipende da OpenRouter: quando è irraggiungibile o risponde male non è colpa del client, stesso trattamento di CAMPAIGN_UNREADABLE. */
  CATALOG_UNREACHABLE: 503,
  CATALOG_UPSTREAM_ERROR: 503,
  INTERNAL_ERROR: 500,
  FILE_NOT_FOUND: 404,
  /** ⭐ 27/8 — stesso status di PAYLOAD_LIMIT: un'anteprima troppo grande è la stessa famiglia di "contenuto oltre il limite". */
  FILE_TOO_LARGE: 413,
  /** ⭐ 27/8 — stesso status di SESSION_NOT_READY: la richiesta è legittima ma lo stato attuale (un file già lì) la blocca. */
  FILE_EXISTS: 409,
  PLATFORM_UNSUPPORTED: 501,
});

const MESSAGE_BY_CODE = Object.freeze({
  CONFIG_INVALID: 'Configurazione non valida',
  CAMPAIGN_NOT_ALLOWED: 'Campagna non disponibile',
  CAMPAIGN_UNREADABLE: 'Campagna non leggibile',
  ROW_INVALID: 'Dati campagna non validi',
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

function errorEnvelope(code, clock) {
  return {
    ok: false,
    error: { code, message: MESSAGE_BY_CODE[code] },
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

function parseRunsQuery(url) {
  const allowed = new Set(['harness', 'esito', 'cursor', 'limit']);
  const query = {};
  for (const [key, value] of url.searchParams) {
    if (!allowed.has(key) || Object.hasOwn(query, key) || value.length > 1024) {
      const error = new Error('Query non valida');
      error.code = value.length > 1024 ? 'PAYLOAD_LIMIT' : 'QUERY_INVALID';
      throw error;
    }
    if (value !== '') query[key] = value;
  }
  return query;
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
  const chiaviAmmesse = ['taskId', 'modello', 'reasoning', 'client', 'permessi'];
  const soloAmmesse = chiavi.length > 0 && chiavi.length <= chiaviAmmesse.length && chiavi.every((k) => chiaviAmmesse.includes(k)) && chiavi.includes('taskId');
  if (
    !soloAmmesse || typeof body.taskId !== 'string' || body.taskId.length === 0
    || ('client' in body && body.client !== 'desktop' && body.client !== 'mobile')
  ) {
    const errore = new Error('Corpo non valido: atteso {taskId, modello?, reasoning?, client?, permessi?}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  if ('modello' in body && body.modello !== undefined && !modelloRichiestaValido(body.modello)) {
    const errore = new Error('modello deve avere la forma "vendor/nome-modello" (formato OpenRouter)');
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
  return {
    taskId: body.taskId,
    modello: 'modello' in body && body.modello !== undefined ? body.modello : null,
    reasoning: 'reasoning' in body ? body.reasoning : null,
    mobile: body.client === 'mobile',
    permessi: 'permessi' in body && body.permessi !== undefined ? body.permessi : null,
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
  const AMMESSE = ['cartellaId', 'cartellaLibera', 'consegna', 'comandoProva', 'modello', 'reasoning', 'client', 'permessi'];
  const chiavi = Object.keys(body ?? {});
  const haCartellaId = 'cartellaId' in body && body.cartellaId !== undefined;
  const haCartellaLibera = 'cartellaLibera' in body && body.cartellaLibera !== undefined;
  const soloAmmesse = chiavi.length > 0 && chiavi.every((k) => AMMESSE.includes(k))
    && (haCartellaId !== haCartellaLibera) && chiavi.includes('consegna');
  if (
    !soloAmmesse || typeof body.consegna !== 'string'
    || (haCartellaId && typeof body.cartellaId !== 'string')
    || (haCartellaLibera && typeof body.cartellaLibera !== 'string')
    || ('client' in body && body.client !== 'desktop' && body.client !== 'mobile')
  ) {
    const errore = new Error('Corpo non valido: atteso {cartellaId XOR cartellaLibera, consegna, comandoProva?, modello?, reasoning?, client?, permessi?}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  if ('modello' in body && body.modello !== undefined && !modelloRichiestaValido(body.modello)) {
    const errore = new Error('modello deve avere la forma "vendor/nome-modello" (formato OpenRouter)');
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
  return {
    cartellaId: haCartellaId ? body.cartellaId : undefined,
    cartellaLibera: haCartellaLibera ? body.cartellaLibera : undefined,
    consegna: body.consegna,
    comandoProva: 'comandoProva' in body ? body.comandoProva : undefined,
    modello: 'modello' in body ? body.modello : null,
    reasoning: 'reasoning' in body ? body.reasoning : null,
    mobile: body.client === 'mobile',
    permessi: 'permessi' in body && body.permessi !== undefined ? body.permessi : null,
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
 * @param {object} deps.campaignService
 * @param {(pathname:string)=>Promise<object|null>} deps.staticHandler
 * @param {object} deps.sessionRegistry — vedi session-registry.mjs. Se
 *   assente, le rotte POST/sessioni tornano NOT_FOUND invece di lanciare:
 *   Harness UI resta utilizzabile in sola lettura (campagne) anche senza
 *   configurare l'esecuzione — stesso principio del `chiaveApi` opzionale
 *   in config.mjs.
 * @param {()=>Array<object>} [deps.listaTaskDisponibili]
 */
export function createHttpApp({
  campaignService, staticHandler, sessionRegistry = null, listaTaskDisponibili = () => [],
  elencaCartelleProgetto = () => [], automationStore = null, diagnosiFn = null,
  catalogoModelliFn = null, clock = () => new Date(), leggiArtefattoFn = leggiArtefattoReale,
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
        const { taskId, modello, reasoning, mobile, permessi } = requireTaskIdBody(corpo);
        const esito = sessionRegistry.avvia(taskId, { modelloScelto: modello, reasoningScelto: reasoning, mobile, permessiScelto: permessi });
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
        const esito = sessionRegistry.rinomina(sessionId, nome);
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
        const fermata = sessionRegistry.ferma(sessionId);
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
        const corpoResume = await leggiCorpoJson(req);
        const nuovoMessaggioUtente = typeof corpoResume?.messaggio === 'string' && corpoResume.messaggio.trim()
          ? corpoResume.messaggio.trim()
          : null;
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

    if (!['GET', 'HEAD'].includes(method)) {
      sendJson(res, 405, errorEnvelope('METHOD_NOT_ALLOWED', clock), method, { Allow: 'GET, HEAD' });
      return;
    }

    try {
      let data;
      if (url.pathname === '/api/v1/health') {
        requireNoQuery(url);
        data = { status: 'ok' };
      } else if (url.pathname === '/api/v1/campaigns') {
        requireNoQuery(url);
        data = await campaignService.listCampaigns();
      } else if (url.pathname === '/api/v1/tasks') {
        requireNoQuery(url);
        data = { items: listaTaskDisponibili() };
      } else if (url.pathname === '/api/v1/projects') {
        requireNoQuery(url);
        /* ⭐ 27/8 — le cartelle libere ammesse (TALOS_HARNESS_UI_PROJECT_DIRS): mai il percorso assoluto, solo id/nome — vedi custom-task.mjs. */
        data = { items: elencaCartelleProgetto() };
      } else if (url.pathname === '/api/v1/automations') {
        requireNoQuery(url);
        data = { items: automationStore ? await automationStore.elenca() : [] };
      } else if (url.pathname === '/api/v1/models') {
        const forzaAggiornamento = parseModelsQuery(url);
        if (!catalogoModelliFn) {
          const errore = new Error('Catalogo modelli non configurato'); errore.code = 'REPORT_UNAVAILABLE'; throw errore;
        }
        data = await catalogoModelliFn({ forzaAggiornamento });
      } else if (url.pathname === '/api/v1/doctor') {
        requireNoQuery(url);
        if (!diagnosiFn) {
          const errore = new Error('Doctor non configurato'); errore.code = 'REPORT_UNAVAILABLE'; throw errore;
        }
        data = await diagnosiFn();
      } else if (url.pathname === '/api/v1/sessions') {
        requireNoQuery(url);
        /* ⛔ Elenco vuoto, non un errore, se sessionRegistry non è configurato — stesso principio già seguito per le altre rotte di sessione. */
        data = { items: sessionRegistry ? sessionRegistry.elenca() : [] };
      } else {
        const campaignMatch = /^\/api\/v1\/campaigns\/([^/]+)\/(snapshot|runs|report)$/.exec(url.pathname);
        const eventsMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/events$/.exec(url.pathname);
        const exportMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/export$/.exec(url.pathname);
        const treeMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/tree$/.exec(url.pathname);
        const treeFileMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/tree\/file$/.exec(url.pathname);
        // ⭐⭐⭐ 28/8 — non SESSION-scoped: un artefatto ha un id UUID già globalmente unico (agent-service.mjs), stesso principio di /api/v1/models.
        const artifactMatch = /^\/api\/v1\/artifacts\/([^/]+)$/.exec(url.pathname);

        if (treeMatch) {
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
        } else if (campaignMatch) {
          let campaign;
          try {
            campaign = decodeURIComponent(campaignMatch[1]);
          } catch {
            const error = new Error('Campagna non valida');
            error.code = 'CAMPAIGN_NOT_ALLOWED';
            throw error;
          }
          if (campaignMatch[2] === 'snapshot') {
            requireNoQuery(url);
            data = await campaignService.getSnapshot(campaign);
          } else if (campaignMatch[2] === 'runs') {
            data = await campaignService.listRuns(campaign, parseRunsQuery(url));
          } else {
            requireNoQuery(url);
            data = await campaignService.getReport(campaign);
          }
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
          res.writeHead(200, {
            ...SECURITY_HEADERS,
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-store',
            Connection: 'keep-alive',
          });
          res.socket?.setNoDelay(true);
          /*
           * ⛔ Da qui in poi gli header sono GIÀ partiti: un problema deve
           * chiudere lo stream, mai tentare un secondo sendJson — Node
           * lancerebbe "Cannot set headers after they are sent", e il catch
           * esterno lo ributterebbe addosso a una risposta già avviata.
           */
          try {
            if (method === 'HEAD') { res.end(); return; }
            res.write(':ok\n\n');
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
            const ultimoVistoDalClient = Number.parseInt(req.headers['last-event-id'], 10);
            const daSequenza = Number.isFinite(ultimoVistoDalClient) ? ultimoVistoDalClient : 0;
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
              scriviEventoSse(res, evento);
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
            const battito = impostaIntervalloFn(() => {
              if (res.writableEnded || res.destroyed) { cancellaIntervalloFn(battito); return; }
              res.write(':battito\n\n');
            }, INTERVALLO_BATTITO_SSE_MS);
            res.on('close', () => { cancellaIntervalloFn(battito); disiscrivi(); });
          } catch {
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
