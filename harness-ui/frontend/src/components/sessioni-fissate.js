/*
 * FE-001, decisione dell'owner del 02/11/2026: la stella per fissare una sessione nella barra di sinistra. Qui le regole pure e la
 * lettura; la riga e il menu stanno in `legacy/app.js`.
 * ⛔ Oggi la scelta vive in questo PC (`localStorage`, come i gruppi della barra). Il server non ha un campo per le sessioni fissate:
 *   il giorno che ce l'avrà cambia solo questo file, e il telefono potrà leggerle.
 */
export const CHIAVE_FISSATE = 'talos.harness.desktop.barra.fissate.v1';

/** @returns {Set<string>} */
export function leggiFissate(memoria) {
  try {
    const grezzo = JSON.parse(memoria?.getItem?.(CHIAVE_FISSATE) ?? 'null');
    return new Set(Array.isArray(grezzo) ? grezzo.filter((id) => typeof id === 'string' && id) : []);
  } catch {
    return new Set(); // un valore rotto o una memoria negata non devono rompere la barra
  }
}

export function scriviFissate(memoria, fissate) {
  try { memoria?.setItem?.(CHIAVE_FISSATE, JSON.stringify([...fissate])); } catch { /* memoria piena o negata: vale per questa pagina */ }
}

/** Un insieme nuovo con la sessione aggiunta o tolta. */
export function invertiFissata(fissate, sessionId) {
  const nuove = new Set(fissate);
  if (!nuove.delete(sessionId)) nuove.add(sessionId);
  return nuove;
}

/**
 * Divide le righe dell'elenco: prima le fissate, nell'ordine che hanno già, poi le altre.
 * @template {{ sessione: { sessionId: string } }} R
 * @param {R[]} righe
 * @param {Set<string>} fissate
 * @returns {{ fissate: R[], altre: R[] }}
 */
export function fissatePrima(righe, fissate) {
  const prime = [];
  const altre = [];
  for (const riga of righe) (fissate.has(riga.sessione.sessionId) ? prime : altre).push(riga);
  return { fissate: prime, altre };
}

/*
 * Decisione 69 dell'owner (03/11/2026): le fissate stanno sul server (`fissata` in ogni voce di GET /api/v1/sessions, POST …/pin).
 * Un server vecchio non manda il campo: allora vale ancora questo PC, come prima. Le fissate locali passano al server una volta sola.
 */
/** Le fissate dette dal server, o `null` se il server non conosce il campo (server vecchio: vale il `localStorage`). */
export function fissateDalServer(voci) {
  if (!Array.isArray(voci) || voci.length === 0 || !voci.every((v) => typeof v?.fissata === 'boolean')) return null;
  return new Set(voci.filter((v) => v.fissata === true).map((v) => v.sessionId).filter((id) => typeof id === 'string' && id));
}
/** Le fissate di questo PC che il server ancora non ha (solo sessioni che il server conosce). */
export function daPassareAlServer(locali, voci) {
  const sulServer = new Map((Array.isArray(voci) ? voci : []).map((v) => [v?.sessionId, v?.fissata === true]));
  return [...locali].filter((id) => sulServer.has(id) && sulServer.get(id) === false);
}
