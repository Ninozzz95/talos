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
/* R2.1 (contratto, Parte 1, «Revision 2», 24/10/2026): lo stream della finestra — la carta del consenso sull'evento, non al giro dopo.
   Lo serve http-app.mjs (è uno stream SSE, non una risposta `{ stato, dati }`), con la guardia d'origine anche in lettura. */
export const ROTTA_EVENTI_REMOTO = '/api/v1/remote/events';

/** L'inventario delle rotte, per `ROTTE_API` di http-app.mjs (il guardiano delle rotte rilegge quello). */
export const ROTTE_REMOTO = Object.freeze([
  { schema: '/api/v1/remote', metodi: ['GET'] },
  { schema: ROTTA_EVENTI_REMOTO, metodi: ['GET'] },
  { schema: '/api/v1/remote/settings', metodi: ['POST'] },
  { schema: '/api/v1/remote/pair', metodi: ['POST'] },
  { schema: '/api/v1/remote/pair/close', metodi: ['POST'] },
  { schema: /^\/api\/v1\/remote\/pair\/([^/]+)\/(confirm|reject)$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/remote\/phones\/([^/]+)\/(rename|revoke)$/, metodi: ['POST'] },
  /* R5.12 (owner 23/10/2026 sera): la carta «Consenti a … di lavorare in …?» e le cartelle consentite di un dispositivo */
  { schema: /^\/api\/v1\/remote\/consents\/([^/]+)\/(allow|deny)$/, metodi: ['POST'] },
  { schema: /^\/api\/v1\/remote\/phones\/([^/]+)\/folders$/, metodi: ['GET', 'POST'] },
  { schema: /^\/api\/v1\/remote\/phones\/([^/]+)\/folders\/([^/]+)\/revoke$/, metodi: ['POST'] },
  /* R5.13 corsa 2 (24/10/2026): le offerte di file di una conversazione — lo stato sotto la scheda, e «Invia a …» dal menu del file */
  { schema: /^\/api\/v1\/remote\/sessions\/([^/]+)\/offers$/, metodi: ['GET', 'POST'] },
]);

export const STATO_PER_CODICE_REMOTO = Object.freeze({
  REMOTE_UNAVAILABLE: 503, REMOTE_RELAY_NOT_CHOSEN: 409, REMOTE_RELAY_INVALID: 400, REMOTE_KEYRING_MISSING: 503, REMOTE_KEY_INVALID: 409,
  REMOTE_OFF: 409, REMOTE_TOO_MANY_PHONES: 409, REMOTE_DEVICE_UNKNOWN: 404, REMOTE_DEVICE_BAD: 400, REMOTE_DEVICES_UNREADABLE: 500,
  PAIR_LOCKED: 429, PAIR_NOT_PENDING: 409, QUERY_INVALID: 400,
  CONSENT_NOT_PENDING: 409, FOLDER_INVALID: 400, FOLDER_NOT_ALLOWED: 403, REMOTE_CONSENTS_UNREADABLE: 500, NOT_FOUND: 404, // R5.12
  FILE_GONE: 410, FILE_TOO_LARGE: 413, BAD_MESSAGE: 400, // R5.13 corsa 2: le offerte dalla finestra
});

const ID = /^[A-Za-z0-9_-]{8,64}$/;
const ID_SESSIONE = /^[A-Za-z0-9_-]{8,128}$/u; // R5.13 corsa 2

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
      /* R5.12: la risposta del PC alla carta del consenso, e le cartelle consentite di un dispositivo (aggiunte in anticipo, revocate) */
      const consenso = /^\/api\/v1\/remote\/consents\/([^/]+)\/(allow|deny)$/.exec(percorso);
      if (consenso) {
        if (!remoto.cartelle) return rifiuta('REMOTE_UNAVAILABLE', 'Device folders are not available on this computer.');
        if (!ID.test(consenso[1]) || Object.keys(c).length) return rifiuta('QUERY_INVALID', 'Invalid consent request.');
        return { stato: 200, dati: await remoto.cartelle.rispondi(consenso[1], consenso[2] === 'allow' ? 'consentita' : 'negata') };
      }
      const cartelle = /^\/api\/v1\/remote\/phones\/([^/]+)\/folders(?:\/([^/]+)\/revoke)?$/.exec(percorso);
      if (cartelle) {
        if (!remoto.cartelle) return rifiuta('REMOTE_UNAVAILABLE', 'Device folders are not available on this computer.');
        if (!ID.test(cartelle[1])) return rifiuta('QUERY_INVALID', 'Invalid device id.');
        if (cartelle[2] !== undefined) {
          if (!/^[A-Za-z0-9_-]{16,64}$/u.test(cartelle[2]) || Object.keys(c).length) return rifiuta('QUERY_INVALID', 'Invalid folder id.');
          return { stato: 200, dati: await remoto.cartelle.revoca(cartelle[1], cartelle[2]) };
        }
        if (method === 'GET') return { stato: 200, dati: { cartelle: await remoto.cartelle.consensiDi(cartelle[1]) } };
        if (!soloChiavi(['percorso']) || typeof c.percorso !== 'string' || !c.percorso) return rifiuta('QUERY_INVALID', 'The body accepts only the folder path.');
        return { stato: 200, dati: await remoto.cartelle.consentiInAnticipo(cartelle[1], c.percorso) };
      }
      /*
       * R5.13 corsa 2 (24/10/2026) — le offerte di file di una conversazione, per la FINESTRA: GET lo stato (riguardando i file: un file
       *   cambiato dopo l'invio è «cambiato», D6/D8), POST «Invia a …» dal menu del file (D1). La POST registra la STESSA offerta
       *   dell'attrezzo del modello (`registraOfferta`); il clic della persona è già il consenso, come «Consenti» sulla carta.
       *   Il dispositivo dev'essere uno accoppiato e non revocato.
       */
      const offerteSessione = /^\/api\/v1\/remote\/sessions\/([^/]+)\/offers$/.exec(percorso);
      if (offerteSessione) {
        if (!remoto.file) return rifiuta('REMOTE_UNAVAILABLE', 'Sending files to devices is not available on this computer.');
        const sessionId = offerteSessione[1];
        if (!ID_SESSIONE.test(sessionId)) return rifiuta('QUERY_INVALID', 'Invalid session id.');
        if (method === 'GET') return { stato: 200, dati: { offerte: await remoto.file.offerteAggiornate(sessionId) } };
        if (!soloChiavi(['percorso', 'dispositivo']) || typeof c.percorso !== 'string' || !c.percorso || c.percorso.length > 4096
          || typeof c.dispositivo !== 'string' || !ID.test(c.dispositivo)) return rifiuta('QUERY_INVALID', 'The body accepts only the file path and the device id.');
        const vivo = ((await remoto.stato())?.telefoni ?? []).some((v) => v?.id === c.dispositivo && !v.revocatoAlle);
        if (!vivo) return rifiuta('REMOTE_DEVICE_UNKNOWN', 'No paired device has this id.');
        return { stato: 200, dati: await remoto.file.registraOfferta({ sessionId, dispositivoId: c.dispositivo, percorso: c.percorso }) };
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
