/*
 * Le rotte delle notifiche del PC — contratto «notifiche» (31/10/2026, bozza 2, OK di CLI, Performance e Mobile), «Rotte e cursore».
 * Stessa forma delle rotte del remoto (`remoto/rotte.mjs`): `{ stato, dati }` o `{ stato, errore: { code, message } }`, e le serve
 * `http-app.mjs` con la guardia d'origine. Il ponte (`notifications.list/seen/seen-all`) chiama le stesse funzioni del registro.
 *
 * - GET  /api/v1/notifications?dopo=<seq>     → { voci (≤ 100), altre, ultimoSeq, totaleDaFare, ripartito? }
 * - POST /api/v1/notifications/seen           { ids: string[] }
 * - POST /api/v1/notifications/seen-all       { finoA: <seq> } — MAI «tutto» senza confine
 */
export const ROTTE_NOTIFICHE = Object.freeze([
  { schema: '/api/v1/notifications', metodi: ['GET'] },
  { schema: '/api/v1/notifications/seen', metodi: ['POST'] },
  { schema: '/api/v1/notifications/seen-all', metodi: ['POST'] },
]);

export const STATO_PER_CODICE_NOTIFICHE = Object.freeze({ NOTIFICATIONS_UNAVAILABLE: 503, QUERY_INVALID: 400 });
const MASSIMO_IDS = 500;

function rifiuta(code, message) {
  return { stato: STATO_PER_CODICE_NOTIFICHE[code] ?? 500, errore: { code, message } };
}

/** @param {{ registro: ReturnType<import('./notifiche-registro.mjs').creaRegistroNotifiche> | null }} p */
export function creaRotteNotifiche({ registro }) {
  return async function rottaNotifiche({ method, percorso, query = null, corpo = null }) {
    const voce = ROTTE_NOTIFICHE.find((r) => r.schema === percorso);
    if (!voce) return { stato: 404, errore: { code: 'NOT_FOUND', message: 'Not found.' } };
    if (!voce.metodi.includes(method)) return { stato: 405, errore: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' }, allow: voce.metodi.join(', ') };
    if (!registro) return rifiuta('NOTIFICATIONS_UNAVAILABLE', 'Notifications are not available on this computer.');
    const c = corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : {};
    const soloChiavi = (ammesse) => Object.keys(c).every((k) => ammesse.includes(k));

    if (percorso === '/api/v1/notifications') {
      const grezzo = query?.get?.('dopo');
      let dopo = 0;
      if (grezzo !== null && grezzo !== undefined && grezzo !== '') {
        if (!/^\d{1,15}$/u.test(grezzo)) return rifiuta('QUERY_INVALID', 'dopo must be a whole number (the last seq you read).');
        dopo = Number(grezzo);
      }
      return { stato: 200, dati: await registro.elenco({ dopo }) };
    }
    if (percorso === '/api/v1/notifications/seen') {
      const ids = c.ids;
      if (!soloChiavi(['ids']) || !Array.isArray(ids) || !ids.length || ids.length > MASSIMO_IDS || !ids.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 512)) {
        return rifiuta('QUERY_INVALID', `The body accepts only ids: 1 to ${MASSIMO_IDS} entry ids.`);
      }
      const cambiate = await registro.segnaViste(ids);
      return { stato: 200, dati: { cambiate: cambiate.length, ultimoSeq: await registro.ultimoSeq() } };
    }
    // seen-all: il confine è obbligatorio (non si segna visto ciò che arriva mentre lo tocchi)
    if (!soloChiavi(['finoA']) || !Number.isSafeInteger(c.finoA) || c.finoA < 0) return rifiuta('QUERY_INVALID', 'The body accepts only finoA: the last seq the person saw.');
    const cambiate = await registro.segnaVisteFinoA(c.finoA);
    return { stato: 200, dati: { cambiate: cambiate.length, ultimoSeq: await registro.ultimoSeq() } };
  };
}
