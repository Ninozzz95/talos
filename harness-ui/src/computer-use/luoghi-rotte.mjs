/*
 * Le rotte dei luoghi di «Consenti sempre» — stessa forma di `notifiche-rotte.mjs`: `{ stato, dati }` o `{ stato, errore: { code, message } }`,
 * servite da `http-app.mjs` con la guardia d'origine.
 *
 * - GET  /api/v1/computer-use/remembered-places          → { voci: [{ tipo, nome, quando }] }
 * - POST /api/v1/computer-use/remembered-places/remove   { tipo: 'dominio' | 'app', nome }   → { tolti, voci }
 * - POST /api/v1/computer-use/remembered-places/clear    { conferma: true }                 → { tolti, voci } — mai senza conferma
 * Il ponte del telefono (`computer-use.places.*` in `remoto/operazioni.mjs`) chiama questa stessa funzione.
 * Nessuna rotta AGGIUNGE: un luogo si ricorda solo dalla carta di un compito.
 */
export const ROTTE_LUOGHI = Object.freeze([
  { schema: '/api/v1/computer-use/remembered-places', metodi: ['GET'] },
  { schema: '/api/v1/computer-use/remembered-places/remove', metodi: ['POST'] },
  { schema: '/api/v1/computer-use/remembered-places/clear', metodi: ['POST'] },
]);
export const PREFISSO_ROTTE_LUOGHI = '/api/v1/computer-use/remembered-places';
export const STATO_PER_CODICE_LUOGHI = Object.freeze({ COMPUTER_USE_UNAVAILABLE: 503, QUERY_INVALID: 400 });

const rifiuta = (code, message) => ({ stato: STATO_PER_CODICE_LUOGHI[code] ?? 500, errore: { code, message } });

/** @param {{ registro: ReturnType<import('./luoghi-ricordati.mjs').creaRegistroLuoghi> | null }} p */
export function creaRotteLuoghi({ registro }) {
  return async function rottaLuoghi({ method, percorso, corpo = null }) {
    const voce = ROTTE_LUOGHI.find((r) => r.schema === percorso);
    if (!voce) return { stato: 404, errore: { code: 'NOT_FOUND', message: 'Not found.' } };
    if (!voce.metodi.includes(method)) return { stato: 405, errore: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' }, allow: voce.metodi.join(', ') };
    if (!registro) return rifiuta('COMPUTER_USE_UNAVAILABLE', 'Computer use is not available on this computer.');
    if (percorso === PREFISSO_ROTTE_LUOGHI) return { stato: 200, dati: await registro.elenco() };
    const c = corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : {};
    const soloChiavi = (ammesse) => Object.keys(c).every((k) => ammesse.includes(k));
    if (percorso.endsWith('/remove')) {
      if (!soloChiavi(['tipo', 'nome']) || !['dominio', 'app'].includes(c.tipo) || typeof c.nome !== 'string' || !c.nome.trim() || c.nome.length > 253) {
        return rifiuta('QUERY_INVALID', 'The body accepts only tipo (dominio or app) and nome.');
      }
      const { tolti } = await registro.togli({ tipo: c.tipo, nome: c.nome });
      return { stato: 200, dati: { tolti, ...(await registro.elenco()) } };
    }
    if (!soloChiavi(['conferma']) || c.conferma !== true) return rifiuta('QUERY_INVALID', 'Clearing every remembered place needs conferma: true.');
    const { tolti } = await registro.svuota();
    // la risposta porta l'elenco nuovo (Mobile, 03/11): chi toglie non deve rileggerlo
    return { stato: 200, dati: { tolti, ...(await registro.elenco()) } };
  };
}
