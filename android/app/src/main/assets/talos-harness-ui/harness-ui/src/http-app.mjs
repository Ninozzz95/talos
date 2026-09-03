export const API_SCHEMA = 'talos.harness-ui.api.v1';

/** ⭐ 30/8, porta canonico (432eec09) — vedi la doc sopra `res.on('close', ...)` nella rotta /events: abbastanza frequente da tenere il canale vivo, abbastanza raro da non essere rumore nei log/nel traffico. */
const INTERVALLO_BATTITO_SSE_MS = 15_000;
const MAX_REQUEST_TARGET_BYTES = 4096;
/** ⛔ Un corpo POST qui è solo `{taskId}` — poche decine di byte. 4096 è già generoso, stesso ordine di grandezza di MAX_REQUEST_TARGET_BYTES. */
const MAX_REQUEST_BODY_BYTES = 4096;
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
  'INTERNAL_ERROR',
  /* ⭐ 29/8 — CustomTaskError (custom-task.mjs) usa questo codice come default: mancava dall'allowlist (assente ANCHE nel canonico, verificato — vedi LEDGER-MOBILE-PAREGGIO-DESKTOP-CODICE.md §11.5), degradava sempre a INTERNAL_ERROR 500 per un semplice cartellaId sbagliato. */
  'PROJECT_NOT_ALLOWED',
  /* ⭐ 29/8 — fidaHook (session-registry.mjs) usa questo codice per un .harness-ui-hooks.json malformato o un hookId non trovato, ledger §13. */
  'HOOK_INVALID',
  /* ⭐ 29/8 — AutomationStoreError (automation-store.mjs) usa questo codice come default, ledger §14. */
  'AUTOMATION_INVALID',
  /* ⭐ 29/8 — le azioni sul file dell'albero (owner: rinomina, apri, rivela in Esplora File, elimina, sposta/copia/crea — ea623891+46940ae4), vedi workspace-files.mjs, ledger §27-bis. */
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
  INTERNAL_ERROR: 500,
  PROJECT_NOT_ALLOWED: 404,
  HOOK_INVALID: 422,
  AUTOMATION_INVALID: 422,
  FILE_NOT_FOUND: 404,
  /** ⭐ 29/8 — stesso status di PAYLOAD_LIMIT: un'anteprima troppo grande è la stessa famiglia di "contenuto oltre il limite". */
  FILE_TOO_LARGE: 413,
  /** ⭐ 29/8 — stesso status di SESSION_NOT_READY: la richiesta è legittima ma lo stato attuale (un file già lì) la blocca. */
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
  INTERNAL_ERROR: 'Errore interno',
  PROJECT_NOT_ALLOWED: 'Cartella non ammessa',
  HOOK_INVALID: 'Configurazione hook non valida',
  AUTOMATION_INVALID: 'Parametri automazione non validi',
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
 * ⛔ Un'allowlist di due chiavi al massimo: `taskId` (sempre) e `client`
 * (opzionale) — mai modello/chiave dal client, vedi createHttpApp.
 *
 * Piano `procedi-col-generare-un-snoopy-neumann.md`, Fase 3 (§3.2 del
 * prompt): `client` distingue una sessione avviata dal telefono da una
 * avviata sul PC. Un parametro esplicito nella richiesta, non un'euristica
 * sullo User-Agent (più onesto, come richiesto dal prompt originale) —
 * assente o `'desktop'` è il comportamento di SEMPRE, `'mobile'` è l'unico
 * valore che cambia qualcosa (vedi session-registry.avvia).
 *
 * ⭐ 30/8 — porta canonico (6c37f8d5): `permessi` opzionale, stesso
 * principio già in uso per `client` — solo la FORMA (stringa) qui, la
 * validazione di VALORE (una fra le quattro ammesse) vive in
 * session-registry.avviaESegui (stesso principio già scelto per
 * `modelloRichiestoValido`, che questo file non duplica).
 */
/*
 * ⭐⭐⭐ 2/9 — R2/R3 dalla review Fable: porta canonico (desktop
 * http-app.mjs, `requireSessionSettingsBody`), ADATTATA. Stesso
 * principio già dichiarato sopra per requireTaskIdBody: solo FORMA
 * qui, la validazione di VALORE vive in
 * sessionRegistry.aggiornaImpostazioni.
 * ⛔ Corretto 2/9: `modelloEsecutore` (picker Planner, FASE K) è ora
 * qui — la nota precedente ("niente modelloPlanner, non esiste su
 * questa voce") descriveva un buco appena chiuso da questo stesso
 * turno (session-registry.mjs, `avviaESegui`/`aggiornaImpostazioni`).
 */
function requireSessionSettingsBody(body) {
  const AMMESSE = ['modello', 'modelloEsecutore', 'reasoning', 'permessi', 'permessiPerAttrezzo'];
  const chiavi = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [];
  if (chiavi.length === 0 || chiavi.some((chiave) => !AMMESSE.includes(chiave))) {
    const errore = new Error('Corpo non valido: attesa almeno una preferenza di sessione riconosciuta');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return body;
}

function requireTaskIdBody(body) {
  const AMMESSE = ['taskId', 'client', 'permessi'];
  const chiavi = Object.keys(body ?? {});
  const soloAmmesse = chiavi.length > 0 && chiavi.every((k) => AMMESSE.includes(k)) && chiavi.includes('taskId');
  if (
    !soloAmmesse || typeof body.taskId !== 'string' || body.taskId.length === 0
    || (Object.hasOwn(body, 'client') && body.client !== 'desktop' && body.client !== 'mobile')
    || (Object.hasOwn(body, 'permessi') && body.permessi !== undefined && typeof body.permessi !== 'string')
  ) {
    const errore = new Error('Corpo non valido: atteso {taskId} o {taskId, client?, permessi?}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return { taskId: body.taskId, mobile: body.client === 'mobile', permessi: body.permessi ?? null };
}

/**
 * ⭐ 30/8 — porta canonico `requireCustomTaskBody` (LEDGER-MOBILE-PAREGGIO-DESKTOP-CODICE.md
 * §11.5 + 6c37f8d5), ADATTATA più stretta: il canonico valida anche
 * `reasoning`/`permessiPerAttrezzo` con helper che vivono in
 * session-registry.mjs canonico e non esistono ancora qui. `permessi`,
 * invece, ORA è applicato per davvero — la nota che stava qui (29/8,
 * "accettato ma NON applicato") descriveva un buco che
 * session-registry.avviaLibero (il cancello "Full access") e
 * avviaESegui (la traduzione verso il kernel) hanno appena chiuso.
 */
/*
 * ⭐⭐⭐ 2/9 — `sessionId` opzionale, owner dal vivo: "clicco su una
 * sessione appena creata e i messaggi non ci sono". Causa isolata
 * leggendo HarnessSessionScreen.vue: una sessione nuova nasce con un
 * id NATIVO (newTalosMobileId(), locale, mai visto dal server) PRIMA
 * che il primo messaggio parta — e startCustomSession (app.js) non
 * mandava mai quell'id al server, che ne generava uno TUTTO SUO
 * (randomUUID() dentro avviaESegui). Due id per la STESSA
 * conversazione, mai riconciliati: `data-harness-session-id` (quello
 * che un rimontaggio futuro rilegge) restava quello nativo, la vera
 * cronologia viveva sotto l'altro. Cura alla radice, non una
 * riconciliazione a posteriori nel router Vue: se il client manda GIÀ
 * l'id nativo, il server lo USA invece di generarne uno nuovo — un solo
 * id, mai due. Solo FORMA qui (stringa non vuota, tetto di lunghezza),
 * la collisione con una sessione esistente si controlla in
 * avviaLibero (dove vive la Map vera).
 */
function requireCustomTaskBody(body) {
  const AMMESSE = ['cartellaId', 'cartellaLibera', 'consegna', 'comandoProva', 'modello', 'modelloEsecutore', 'client', 'permessi', 'sessionId'];
  const chiavi = Object.keys(body ?? {});
  const haCartellaId = Object.hasOwn(body ?? {}, 'cartellaId') && body.cartellaId !== undefined;
  const haCartellaLibera = Object.hasOwn(body ?? {}, 'cartellaLibera') && body.cartellaLibera !== undefined;
  const soloAmmesse = chiavi.length > 0 && chiavi.every((k) => AMMESSE.includes(k))
    && (haCartellaId !== haCartellaLibera) && chiavi.includes('consegna');
  if (
    !soloAmmesse || typeof body.consegna !== 'string'
    || (haCartellaId && typeof body.cartellaId !== 'string')
    || (haCartellaLibera && typeof body.cartellaLibera !== 'string')
    || (Object.hasOwn(body, 'comandoProva') && body.comandoProva !== undefined && typeof body.comandoProva !== 'string')
    || (Object.hasOwn(body, 'modello') && body.modello !== undefined && typeof body.modello !== 'string')
    || (Object.hasOwn(body, 'modelloEsecutore') && body.modelloEsecutore !== undefined && typeof body.modelloEsecutore !== 'string')
    || (Object.hasOwn(body, 'client') && body.client !== 'desktop' && body.client !== 'mobile')
    || (Object.hasOwn(body, 'permessi') && body.permessi !== undefined && typeof body.permessi !== 'string')
    || (Object.hasOwn(body, 'sessionId') && body.sessionId !== undefined && (typeof body.sessionId !== 'string' || body.sessionId.length === 0 || body.sessionId.length > 128))
  ) {
    const errore = new Error('Corpo non valido: atteso {cartellaId XOR cartellaLibera, consegna, comandoProva?, modello?, modelloEsecutore?, client?, permessi?, sessionId?}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return {
    cartellaId: body.cartellaId, cartellaLibera: body.cartellaLibera, consegna: body.consegna,
    comandoProva: body.comandoProva, modello: body.modello, mobile: body.client === 'mobile',
    // ⭐ 30/8 — porta canonico (6c37f8d5): prima validato in FORMA sopra e poi scartato qui — mai passato ad avviaLibero. Ora torna davvero al chiamante.
    permessi: body.permessi ?? null,
    sessionId: body.sessionId ?? null,
    // ⭐⭐⭐ 2/9 — picker Planner (FASE K): stessa forma di modello sopra, opzionale.
    modelloEsecutore: body.modelloEsecutore ?? null,
  };
}

/**
 * ⭐ 29/8 — porta canonico verbatim (ledger §14). Solo la FORMA (tipi,
 * chiavi ammesse) — i tetti duri (intervallo minimo, limite massimo)
 * restano validati in automation-store.crea(), l'unico posto che li
 * dichiara.
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

/** ⭐ 29/8 — porta canonico verbatim. Un'allowlist di UNA chiave sola: {attiva}, un booleano — niente altro. */
function requireAutomationToggleBody(body) {
  const chiavi = Object.keys(body ?? {});
  if (chiavi.length !== 1 || chiavi[0] !== 'attiva' || typeof body.attiva !== 'boolean') {
    const errore = new Error('Corpo non valido: atteso {attiva: boolean}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return body.attiva;
}

/**
 * ⭐ 28/8, FASE 5 — corpo per una sessione REALE: `{messaggio}` o
 * `{messaggio, modello}`, mai `{taskId}` nello stesso corpo — le due
 * forme restano DISTINTE e mutuamente esclusive (stesso principio di
 * `requireTaskIdBody`, allowlist stretta: solo queste chiavi, nessuna
 * in più). Nessun `client`: una sessione reale nasce SEMPRE dove gira
 * questo stesso processo — non c'è un "avviata dal telefono" da
 * dichiarare, il processo O è sul telefono O non lo è (vedi avviaReale,
 * mobile:false sempre).
 *
 * ⭐⭐⭐ 28/8, "procedi in ordine" punto 4 — `modello` (opzionale): la
 * persona sceglie DAL VIVO nel composer di Codice, dal proprio catalogo
 * OpenRouter reale. La VALIDAZIONE di forma del valore (regex
 * `vendor/model`) resta in `session-registry.avviaReale`, vicino a dove
 * il valore esce verso OpenRouter — qui si controlla solo che la CHIAVE
 * sia ammessa e il TIPO sia una stringa, non la sua forma.
 */
function requireMessaggioBody(body) {
  const chiavi = Object.keys(body ?? {});
  const ammesse = new Set(['messaggio', 'modello']);
  const messaggioValido = typeof body?.messaggio === 'string' && body.messaggio.trim().length > 0;
  const modelloValido = !Object.hasOwn(body ?? {}, 'modello') || typeof body.modello === 'string';
  if (chiavi.length === 0 || chiavi.length > 2 || !chiavi.every((k) => ammesse.has(k))
    || !chiavi.includes('messaggio') || !messaggioValido || !modelloValido) {
    const errore = new Error('Corpo non valido: atteso {messaggio} o {messaggio, modello}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return { messaggio: body.messaggio, modello: body.modello };
}

/**
 * ⭐ 29/8 — porta canonico (ledger §18, FASE G): il corpo di
 * POST .../queue — un'allowlist di UNA chiave sola, come
 * requireTaskIdBody. Diverso da requireMessaggioBody sopra (che
 * ammette anche 'modello', per l'invio normale): un messaggio accodato
 * non sceglie un modello, eredita quello della sessione in corso.
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

/** ⭐ 29/8 — {percorso}, per elimina/rivela: la validazione FINE del percorso resta in workspace-files.mjs, qui solo la forma. */
function requirePercorsoBody(body) {
  const chiavi = Object.keys(body ?? {});
  if (chiavi.length !== 1 || chiavi[0] !== 'percorso' || typeof body.percorso !== 'string') {
    const errore = new Error('Corpo non valido: atteso {percorso}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return body.percorso;
}

/** ⭐ 29/8 — {percorso, cartellaDestinazione}, per il drag&drop (sposta). cartellaDestinazione può essere '' (radice), mai assente. */
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

/** ⭐ 29/8 — {percorsoBase, nome, tipo}, per "Nuovo file"/"Nuova cartella". */
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

/** ⭐ 29/8 — {percorso, nuovoNome}, per rinomina. */
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
 * ⭐ 30/8 — porta canonico (6c37f8d5): la risposta dell'owner a
 * un'ApprovalRequested (permesso "On request"). `requestId` obbligatorio
 * — mai un endpoint che risponde "all'ultima richiesta pendente", vedi
 * la doc di session-registry.rispondiApprovazione sul perché.
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
 * ⭐⭐⭐ 30/8 — la risposta del CLIENT REALE (app.js, via
 * window.__talosHarnessRichiediDato) a una DataRequested — il ponte
 * verso Note/Attività/Memoria/Libreria del telefono, stesso schema di
 * `requireApprovaBody`: `requestId` obbligatorio, mai "l'ultima
 * richiesta pendente". `dati` XOR `errore`: o è riuscito e porta il
 * dato vero, o è fallito e dice onestamente perché — mai un dato
 * vuoto che si legge come "non c'è niente" quando in realtà il ponte
 * non ha funzionato.
 */
function requireDatoBody(body) {
  const chiavi = Object.keys(body ?? {});
  const AMMESSE = ['requestId', 'dati', 'errore'];
  const haDati = Object.hasOwn(body ?? {}, 'dati') && body.dati !== undefined;
  const haErrore = Object.hasOwn(body ?? {}, 'errore') && body.errore !== undefined;
  if (
    chiavi.length < 2 || chiavi.length > 3 || !chiavi.every((k) => AMMESSE.includes(k))
    || typeof body.requestId !== 'string' || body.requestId.length === 0
    || (haDati === haErrore)
    || (haErrore && (typeof body.errore !== 'string' || body.errore.length === 0))
  ) {
    const errore = new Error('Corpo non valido: atteso {requestId, dati} oppure {requestId, errore}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return { requestId: body.requestId, dati: haDati ? body.dati : undefined, errore: haErrore ? body.errore : undefined };
}

/*
 * Scrive un evento AG-UI come frame SSE. Torna false (e non scrive) se la
 * risposta è già chiusa.
 *
 * ⛔⛔ 29/8, porta canonico (3626c9bd, ricerca web: SSE reconnection): una
 * riga `id:` PRIMA di `data:` è ciò che fa scattare `Last-Event-ID` sulla
 * riconnessione NATIVA del browser — senza, EventSource non ha nulla da
 * mandare indietro e ogni riconnessione ripete l'intero buffer via rete
 * (vedi iscriviti()).
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
 * @param {()=>Promise<Array<object>>} [deps.listaTaskDisponibili] — 28/8:
 *   asincrona (il corpus task, quando c'è, arriva da un `import()`
 *   dinamico — vedi task-catalog.mjs).
 */
export function createHttpApp({
  campaignService, staticHandler, sessionRegistry = null, listaTaskDisponibili = async () => [], clock = () => new Date(),
  diagnosiFn = null, elencaCartelleProgetto = () => [], automationStore = null, cartelleFrequentiFn = () => [],
  // ⛔⛔⛔ 30/8, porta canonico (432eec09) — iniettabili SOLO per il test del battito SSE sotto: mai un setInterval reale nei test unitari, stesso principio di ogni altra dipendenza di questo file.
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
        /*
         * ⭐ 28/8, FASE 5 — le due forme del corpo si distinguono dalla
         * PRESENZA della chiave (mai un campo `tipo` in più, mai
         * un'euristica): `{messaggio}` è una sessione reale, `{taskId}` (o
         * `{taskId, client}`) resta il percorso del banco di prova, invariato
         * alla lettera. `requireMessaggioBody`/`requireTaskIdBody` restano
         * ciascuna un'allowlist stretta sulla propria forma — nessuna delle
         * due accetta l'altra chiave.
         */
        let esito;
        if (Object.hasOwn(corpo ?? {}, 'messaggio')) {
          const { messaggio, modello } = requireMessaggioBody(corpo);
          esito = sessionRegistry.avviaReale(messaggio, modello !== undefined ? { modello } : undefined);
        } else {
          const { taskId, mobile, permessi } = requireTaskIdBody(corpo);
          esito = await sessionRegistry.avvia(taskId, { mobile, permessiScelto: permessi });
        }
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
     * ⭐ 30/8 — porta canonico, LEDGER-MOBILE-PAREGGIO-DESKTOP-CODICE.md
     * §11.5: un compito LIBERO su una cartella dell'allowlist
     * (TALOS_HARNESS_UI_PROJECT_DIRS) o, con permesso Full access (ORA
     * applicato per davvero, vedi requireCustomTaskBody/avviaLibero — il
     * cancello vive nel registro, verificato ANCHE lì, non solo qui), un
     * percorso a piacere. Stesso stile dell'endpoint sopra, corpo diverso.
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
     * ⭐ 29/8 — porta canonico (ledger §13). L'UNICA strada che rende
     * un hook eseguibile — fail-closed: senza una chiamata qui,
     * verificaTrust in hook-registry.mjs torna sempre false. Nessun
     * corpo richiesto: l'owner fida ESATTAMENTE l'hook che la UI gli
     * ha mostrato per hookId, l'hash vero si rilegge da disco qui
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
     * ⭐ 29/8 — porta canonico (ledger §18, FASE G): coda messaggi.
     * ⛔ NESSUNA rotta di questo file usa mai il verbo DELETE (anche
     * eliminare un file dell'albero è POST .../tree/delete) — niente
     * motivo di essere la prima eccezione, e CORS dichiara solo
     * 'GET, HEAD, POST' più sotto. Stesso schema POST + verbo-nel-path
     * di trustMatch appena sopra.
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

    /*
     * ⭐ 29/8 — porta canonico (ledger §14), blocco 7 (Automazioni), la
     * vera schedulazione. Tre rotte, stesso stile POST-per-azione già
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
     * ⭐⭐⭐ 29/8 — porta canonico (ea623891, ledger §27-bis), owner: "non
     * ha opzioni per rinominare i file... per eliminarlo... per aprirli
     * nel visualizza file explorer di Windows" — tre azioni sul FILE
     * dell'albero (non sulla sessione, come renameMatch sopra), stesso
     * schema POST-per-azione già in uso ovunque in questo file.
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
     * ⭐⭐⭐ 29/8 — porta canonico (46940ae4, ledger §27-bis), owner:
     * "nella lista files devo poter draggare i file... non esiste il
     * comando copia... e comandi crud in generale" — stesso schema
     * POST-per-azione delle tre rotte sopra.
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
         * ⛔⛔⛔ 29/8, porta canonico (3626c9bd) — `messaggio` OPZIONALE:
         * senza, resta il resume di sempre (riprende un giro interrotto,
         * nessuna domanda nuova). Con un `messaggio` stringa non vuota, è
         * un secondo turno di chat reale — vedi la doc su
         * session-registry.mjs resume(). Mai un campo diverso da stringa:
         * un body malformato resta silenziosamente "nessun messaggio
         * nuovo" invece di rompere il resume classico.
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

    /*
     * ⭐⭐⭐ 2/9 — R2/R3 dalla review Fable: porta canonico (desktop
     * http-app.mjs ~1519), stessa posizione (resume → settings →
     * compact). Prima d'oggi questa rotta non esisteva affatto su
     * mobile — il foglio Modello/Permessi non aveva NESSUN posto dove
     * mandare un cambio per una sessione già avviata.
     */
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
     * ⭐ 30/8 — porta canonico (6c37f8d5): la pillola permessi, livello
     * "On request" — l'owner risponde a un'ApprovalRequested vista sulla
     * connessione SSE. Stesso stile di /shell sopra — chiamata
     * sincrona a sessionRegistry, mai un `await` lungo
     * (rispondiApprovazione risolve una Promise già in sospeso, non ne
     * avvia una nuova).
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
     * ⭐⭐⭐ 30/8 — il ponte verso Note/Attività/Memoria/Libreria: il
     * client REALE (app.js, tramite window.__talosHarnessRichiediDato,
     * MAI la persona) risponde a una DataRequested vista sulla
     * connessione SSE. Stesso stile sincrono di /approve sopra —
     * rispondiDato risolve una Promise già in sospeso, non ne avvia
     * una nuova.
     */
    const datoMatch = method === 'POST' && sessionRegistry
      && /^\/api\/v1\/sessions\/([^/]+)\/data$/.exec(url.pathname);
    if (datoMatch) {
      try {
        requireNoQuery(url);
        let sessionId;
        try {
          sessionId = decodeURIComponent(datoMatch[1]);
        } catch {
          sendJson(res, 404, errorEnvelope('NOT_FOUND', clock), method);
          return;
        }
        const corpo = await leggiCorpoJson(req);
        const { requestId, dati, errore: erroreDato } = requireDatoBody(corpo);
        const esito = sessionRegistry.rispondiDato(sessionId, requestId, { dati, errore: erroreDato });
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
        data = { items: await listaTaskDisponibili() };
      } else if (url.pathname === '/api/v1/sessions') {
        requireNoQuery(url);
        /* ⛔ Elenco vuoto, non un errore, se sessionRegistry non è configurato — stesso principio già seguito per le altre rotte di sessione. */
        data = { items: sessionRegistry ? sessionRegistry.elenca() : [] };
      } else if (url.pathname === '/api/v1/doctor') {
        // ⭐ 29/8 — portata dal canonico, LEDGER-MOBILE-PAREGGIO-DESKTOP-CODICE.md §11.5.
        requireNoQuery(url);
        if (!diagnosiFn) {
          const errore = new Error('Doctor non configurato'); errore.code = 'REPORT_UNAVAILABLE'; throw errore;
        }
        data = await diagnosiFn();
      } else if (url.pathname === '/api/v1/projects') {
        // ⭐ 29/8 — portata dal canonico, LEDGER-MOBILE-PAREGGIO-DESKTOP-CODICE.md §11.5. Mai il percorso assoluto verso il browser: solo id/nome, vedi custom-task.mjs.
        requireNoQuery(url);
        data = { items: elencaCartelleProgetto() };
      } else if (url.pathname === '/api/v1/frequent-dirs') {
        /*
         * ⭐⭐⭐ 29/8 — porta canonico (b3df4e98, ledger §27/§28-bis): a
         * differenza di /projects, qui il percorso ASSOLUTO viene mandato
         * per davvero — sono solo SUGGERIMENTI per il campo "Full access"
         * (cartellaLibera), che già accetta un percorso a piacere, non
         * una seconda allowlist.
         */
        requireNoQuery(url);
        data = { items: cartelleFrequentiFn() };
      } else if (url.pathname === '/api/v1/automations') {
        // ⭐ 29/8 — porta canonico, ledger §14.
        requireNoQuery(url);
        data = { items: automationStore ? await automationStore.elenca() : [] };
      } else {
        const campaignMatch = /^\/api\/v1\/campaigns\/([^/]+)\/(snapshot|runs|report)$/.exec(url.pathname);
        const eventsMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/events$/.exec(url.pathname);
        const exportMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/export$/.exec(url.pathname);
        const treeMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/tree$/.exec(url.pathname);
        // ⭐ 29/8 — porta canonico (ledger §27-bis): "Apri" un file dell'albero, stessa forma di treeMatch, endpoint separato perché la risposta porta contenuto, non un elenco.
        const treeFileMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/tree\/file$/.exec(url.pathname);
        // ⭐ 29/8 — porta canonico (ledger §13): il pannello Control-plane elenca gli hook dichiarati e il loro stato di fiducia vero, stesso principio di exportMatch sopra.
        const hooksMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/hooks$/.exec(url.pathname);
        // ⭐ 29/8 — porta canonico (ledger §18, FASE G.4): sub-agenti, i figli VERI di una sessione, stesso principio di hooksMatch sopra.
        const childrenMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/children$/.exec(url.pathname);

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
           * ⛔⛔⛔ 30/8, porta canonico (432eec09) — trovato dal vivo sul
           * desktop dopo aver eliminato ogni altra causa (verificato: il
           * buffer del registro ha SEMPRE l'evento giusto; NON è specifico
           * di EventSource, un fetch() grezzo con reader manuale mostra lo
           * STESSO sintomo). Ricerca web: un res.write() piccolo su una
           * connessione altrimenti inattiva può restare bloccato
           * dall'algoritmo di Nagle — la cura standard per SSE è
           * disabilitarlo sul socket di QUESTA risposta. `res.socket`
           * esiste solo dopo che gli header sono partiti, quindi qui.
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
             * ⛔⛔⛔ 27/8, STORICO — il meccanismo che questa nota descriveva
             * (un `inReplay` che distingueva replay-sincrono da eventi dal
             * vivo, per decidere QUANDO un RunFinished poteva chiudere lo
             * stream) non esiste più: il 30/8 (432eec09, porta canonico)
             * lo stream ha smesso di chiudersi da solo del tutto (vedi la
             * nota subito sotto). Il BUG originale resta vero da ricordare,
             * per non reintrodurlo per altra via: una sessione con PIÙ giri
             * conclusi nel buffer (il task originale, poi un resume o un
             * comando diretto) troncava il replay al PRIMO RunFinished
             * incontrato — un RunFinished vecchio, ancora nel buffer,
             * chiudeva lo stream prima che il resto del replay potesse
             * scriversi. La cura di allora è ora superflua perché NESSUN
             * evento chiude più lo stream da questo lato — ma se in futuro
             * tornasse un motivo per chiudere selettivamente, questo stesso
             * bug è la prima cosa da riverificare.
             */
            /*
             * ⛔⛔ 29/8, porta canonico (3626c9bd, ricerca web: SSE
             * reconnection, Last-Event-ID): Node abbassa sempre il nome
             * header a minuscolo — 'last-event-id', mai il case originale
             * del client. Un valore non numerico (o assente, prima
             * connessione) ricade su 0 — replay completo, comportamento
             * identico a prima di questa ottimizzazione.
             */
            const ultimoVistoDalClient = Number.parseInt(req.headers['last-event-id'], 10);
            const daSequenza = Number.isFinite(ultimoVistoDalClient) ? ultimoVistoDalClient : 0;
            /*
             * ⛔⛔⛔ 30/8, porta canonico (432eec09) — trovato dal vivo: questo
             * stream chiudeva SEMPRE dopo un RunFinished/RunError dal vivo o
             * subito se non c'era un giro in corso — corretto quando
             * l'unica cosa che poteva ancora arrivare era la fine di UN
             * giro. Non è più vero: una coda accodata dopo la fine, un fork
             * successivo, o — su mobile — la stessa istanza di pagina che
             * riapre una sessione storica con `riprendiSessioneDalHost()`
             * restano casi reali dove qualcosa arriva DOPO. Lo stream non si
             * chiude più da solo qui: si chiude quando il CLIENT lo chiude
             * (`res.on('close', ...)` sotto lo intercetta comunque) o
             * quando la connessione cade davvero. Il costo è una manciata
             * di connessioni HTTP idle per sessioni concluse ma ancora
             * guardate — trascurabile per uno strumento locale a un solo
             * proprietario, lo stesso compromesso già scelto altrove in
             * questo registro (sessioni mai ripulite).
             */
            const disiscrivi = sessionRegistry.iscriviti(sessionId, (evento) => {
              scriviEventoSse(res, evento);
            }, daSequenza);
            /*
             * ⛔⛔⛔ 30/8, porta canonico (432eec09) — SECONDA metà della
             * stessa cura (setNoDelay sopra è la prima): senza scritture
             * nuove, una connessione può restare "aperta" per il client ma
             * smettere di consegnare i prossimi byte — un evento arrivato
             * minuti dopo l'ultimo non raggiungeva mai un client altrimenti
             * sano. Un commento periodico (`:battito\n\n`, innocuo per lo
             * standard SSE — un commento inizia con `:` e viene ignorato)
             * tiene il canale attivo indipendentemente da eventi applicativi
             * veri.
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
