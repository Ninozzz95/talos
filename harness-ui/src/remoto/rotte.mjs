/*
 * Controllo remoto — le rotte LOCALI per la finestra del desktop (mockup v5): stato, «Solo la prima volta» e interruttore, QR,
 * conferma o rifiuto del codice, «Telefoni collegati» (rinomina, revoca). Stessa forma di `chatgpt-rotte.mjs`: il gestore HTTP le
 * delega qui e qui si risponde `{ stato, dati }` o `{ stato, errore }`.
 *
 * ⛔ Solo dalla FINESTRA di TALOS: la guardia d'origine sta in http-app.mjs, prima di arrivare qui (la stessa di Piano, Workflow e
 *   automazioni). Il telefono non arriva mai qui: le sue operazioni sono un elenco chiuso con percorsi fissi (`operazioni.mjs`), e
 *   nessuno sta sotto `/api/v1/remote` — c'è una prova che lo controlla.
 */

export const PREFISSO_ROTTE_REMOTO = '/api/v1/remote';

/** L'inventario delle rotte, per `ROTTE_API` di http-app.mjs (il guardiano delle rotte rilegge quello). */
export const ROTTE_REMOTO = Object.freeze([
  { schema: '/api/v1/remote', metodi: ['GET'] },
  { schema: '/api/v1/remote/settings', metodi: ['POST'] },
  { schema: '/api/v1/remote/pair', metodi: ['POST'] },
  { schema: '/api/v1/remote/pair/close', metodi: ['POST'] },
  { schema: /^\/api\/v1\/remote\/pair\/([^/]+)\/(confirm|reject)$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/remote\/phones\/([^/]+)\/(rename|revoke)$/, metodi: ['POST'] },
]);

export const STATO_PER_CODICE_REMOTO = Object.freeze({
  REMOTE_UNAVAILABLE: 503, REMOTE_RELAY_NOT_CHOSEN: 409, REMOTE_RELAY_INVALID: 400, REMOTE_KEYRING_MISSING: 503, REMOTE_KEY_INVALID: 409,
  REMOTE_OFF: 409, REMOTE_TOO_MANY_PHONES: 409, REMOTE_DEVICE_UNKNOWN: 404, REMOTE_DEVICE_BAD: 400, REMOTE_DEVICES_UNREADABLE: 500,
  PAIR_LOCKED: 429, PAIR_NOT_PENDING: 409, QUERY_INVALID: 400,
});

const ID = /^[A-Za-z0-9_-]{8,64}$/;

function rifiuta(code, message) {
  return { stato: STATO_PER_CODICE_REMOTO[code] ?? 500, errore: { code, message } };
}

/** `remoto`: `creaRemoto(...)`, o null se questo server non ha il remoto (risponde 503). */
export function creaRotteRemoto({ remoto }) {
  return async function rottaRemoto({ method, percorso, corpo = null }) {
    const voce = ROTTE_REMOTO.find((r) => (typeof r.schema === 'string' ? r.schema === percorso : r.schema.test(percorso)));
    if (!voce) return { stato: 404, errore: { code: 'NOT_FOUND', message: 'Not found.' } };
    if (!voce.metodi.includes(method)) return { stato: 405, errore: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' }, allow: voce.metodi.join(', ') };
    if (!remoto) return rifiuta('REMOTE_UNAVAILABLE', 'Remote control is not available on this computer.');
    const c = corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : {};
    const soloChiavi = (ammesse) => Object.keys(c).every((k) => ammesse.includes(k));
    try {
      if (percorso === '/api/v1/remote') return { stato: 200, dati: await remoto.stato() };
      if (percorso === '/api/v1/remote/settings') {
        if (!soloChiavi(['acceso', 'relay']) || (Object.hasOwn(c, 'acceso') && typeof c.acceso !== 'boolean')) return rifiuta('QUERY_INVALID', 'The body accepts only acceso and relay.');
        return { stato: 200, dati: await remoto.imposta({ ...(Object.hasOwn(c, 'acceso') ? { acceso: c.acceso } : {}), ...(Object.hasOwn(c, 'relay') ? { relay: c.relay } : {}) }) };
      }
      if (percorso === '/api/v1/remote/pair') {
        /* R5.12: `{ soloSeAcceso: true }` è il QR chiesto dalla chat — non accende il remoto */
        if (!soloChiavi(['soloSeAcceso']) || (Object.hasOwn(c, 'soloSeAcceso') && c.soloSeAcceso !== true)) return rifiuta('QUERY_INVALID', 'The body accepts only soloSeAcceso: true.');
        return { stato: 200, dati: await remoto.apriAccoppiamento({ soloSeAcceso: c.soloSeAcceso === true }) };
      }
      if (percorso === '/api/v1/remote/pair/close') {
        if (!soloChiavi(['gettone']) || typeof c.gettone !== 'string') return rifiuta('QUERY_INVALID', 'The body accepts only the pairing token.');
        remoto.chiudiAccoppiamento(c.gettone);
        return { stato: 200, dati: { chiuso: true } };
      }
      const pair = /^\/api\/v1\/remote\/pair\/([^/]+)\/(confirm|reject)$/.exec(percorso);
      if (pair) {
        if (!ID.test(pair[1]) || Object.keys(c).length) return rifiuta('QUERY_INVALID', 'Invalid pairing request.');
        if (pair[2] === 'confirm') return { stato: 200, dati: { telefono: await remoto.conferma(pair[1]) } };
        return { stato: 200, dati: { rifiutato: remoto.rifiuta(pair[1]) } };
      }
      const tel = /^\/api\/v1\/remote\/phones\/([^/]+)\/(rename|revoke)$/.exec(percorso);
      if (tel) {
        if (!ID.test(tel[1])) return rifiuta('QUERY_INVALID', 'Invalid device id.');
        if (tel[2] === 'rename') {
          if (!soloChiavi(['nome']) || typeof c.nome !== 'string') return rifiuta('QUERY_INVALID', 'The body accepts only the name.');
          return { stato: 200, dati: { telefono: await remoto.rinomina(tel[1], c.nome) } };
        }
        if (Object.keys(c).length) return rifiuta('QUERY_INVALID', 'The body must be empty.');
        return { stato: 200, dati: { telefono: await remoto.revoca(tel[1]) } };
      }
      return { stato: 404, errore: { code: 'NOT_FOUND', message: 'Not found.' } };
    } catch (e) {
      /* Solo i guasti che il remoto DICHIARA diventano una risposta; un guasto sconosciuto (un errore di programmazione) sale al
         gestore, che risponde 500: travestirlo da «non disponibile» lo nasconderebbe. */
      if (typeof e?.code !== 'string' || !Object.hasOwn(STATO_PER_CODICE_REMOTO, e.code)) throw e;
      return { stato: STATO_PER_CODICE_REMOTO[e.code], errore: { code: e.code, message: String(e?.message ?? '').slice(0, 300) }, ...(Number.isFinite(e?.retryAfterMs) ? { retryAfterMs: e.retryAfterMs } : {}) };
    }
  };
}
