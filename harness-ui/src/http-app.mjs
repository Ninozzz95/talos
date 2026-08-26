export const API_SCHEMA = 'talos.harness-ui.api.v1';

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

/** ⛔ Un'allowlist di UNA chiave sola: {taskId}, niente altro — mai modello/chiave dal client, vedi createHttpApp. */
function requireTaskIdBody(body) {
  const chiavi = Object.keys(body ?? {});
  if (chiavi.length !== 1 || chiavi[0] !== 'taskId' || typeof body.taskId !== 'string' || body.taskId.length === 0) {
    const errore = new Error('Corpo non valido: atteso {taskId}');
    errore.code = 'QUERY_INVALID';
    throw errore;
  }
  return body.taskId;
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

/** Scrive un evento AG-UI come frame SSE. Torna false (e non scrive) se la risposta è già chiusa. */
function scriviEventoSse(res, evento) {
  if (res.writableEnded || res.destroyed) return false;
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
  campaignService, staticHandler, sessionRegistry = null, listaTaskDisponibili = () => [], clock = () => new Date(),
}) {
  async function handle(req, res) {
    if (req.aborted || res.destroyed) return;
    const method = req.method || 'GET';

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
        const taskId = requireTaskIdBody(corpo);
        const esito = sessionRegistry.avvia(taskId);
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
        const esito = sessionRegistry.resume(sessionId);
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
      } else if (url.pathname === '/api/v1/sessions') {
        requireNoQuery(url);
        /* ⛔ Elenco vuoto, non un errore, se sessionRegistry non è configurato — stesso principio già seguito per le altre rotte di sessione. */
        data = { items: sessionRegistry ? sessionRegistry.elenca() : [] };
      } else {
        const campaignMatch = /^\/api\/v1\/campaigns\/([^/]+)\/(snapshot|runs|report)$/.exec(url.pathname);
        const eventsMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/events$/.exec(url.pathname);
        const exportMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/export$/.exec(url.pathname);
        const treeMatch = sessionRegistry && /^\/api\/v1\/sessions\/([^/]+)\/tree$/.exec(url.pathname);

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

          res.writeHead(200, {
            ...SECURITY_HEADERS,
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-store',
            Connection: 'keep-alive',
          });
          /*
           * ⛔ Da qui in poi gli header sono GIÀ partiti: un problema deve
           * chiudere lo stream, mai tentare un secondo sendJson — Node
           * lancerebbe "Cannot set headers after they are sent", e il catch
           * esterno lo ributterebbe addosso a una risposta già avviata.
           */
          try {
            if (method === 'HEAD') { res.end(); return; }
            res.write(':ok\n\n');
            const disiscrivi = sessionRegistry.iscriviti(sessionId, (evento) => {
              const scritto = scriviEventoSse(res, evento);
              if (scritto && (evento.type === 'RunFinished' || evento.type === 'RunError')) res.end();
            });
            res.on('close', disiscrivi);
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
