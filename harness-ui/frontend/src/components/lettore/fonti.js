/**
 * F5 File reader (26/09/2026) — le FONTI del lettore: lo stesso contratto per un file della cartella (tab File) e per una
 * voce della Libreria, così le due porte mostrano lo STESSO file con gli STESSI byte (criterio della fetta F5-4).
 *
 *   leggiByte()   — i byte veri: `GET /sessions/:id/file?percorso=` o `/library/:voceId/file` (rotte di scarico già
 *                   esistenti: `attachment` riguarda la navigazione, non una `fetch`);
 *   creaPagina()  — per l'HTML: `POST /sessions/:id/pagine` {percorso} | {voceId}, il lasciapassare della resa;
 *   indirizzoPdf  — per il PDF: la rotta IN LINEA (`/file/anteprima` o `/library/:voceId/anteprima`), perché la CSP della
 *                   pagina di TALOS non ammette `blob:` in `frame-src` (misurato il 26/09).
 */
import { FORMATI_OSPITE, corniceOspite } from './office/cornice-ospite.js';

const API = '/api/v1';
const enc = encodeURIComponent;

async function erroreDa(risposta) {
  let corpo = null;
  try { corpo = await risposta.json(); } catch { /* il corpo non è JSON */ }
  const motivo = corpo?.error?.message || `il server ha risposto HTTP ${risposta.status}`;
  const errore = new Error(motivo);
  errore.code = corpo?.error?.code ?? null;
  errore.status = risposta.status;
  return errore;
}

async function byteDa(fetchFn, indirizzo) {
  const risposta = await fetchFn(indirizzo, { credentials: 'same-origin' });
  if (!risposta.ok) throw await erroreDa(risposta);
  return risposta.arrayBuffer();
}

async function paginaDa(fetchFn, sessionId, corpo) {
  const risposta = await fetchFn(`${API}/sessions/${enc(sessionId)}/pagine`, {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  });
  if (!risposta.ok) throw await erroreDa(risposta);
  const dati = await risposta.json();
  if (typeof dati?.data?.indirizzo !== 'string' || !dati.data.indirizzo.startsWith(`${API}/pagine/`)) throw new Error('il server non ha dato un indirizzo per la pagina');
  return dati.data.indirizzo;
}

/** Un file della cartella della sessione (percorso relativo, con `/`). */
export function fonteDaCartella({ sessionId, percorso, nome = null, dimensione, fetchFn = (...a) => globalThis.fetch(...a) }) {
  const nomeVero = nome ?? String(percorso ?? '').split('/').pop();
  return {
    origine: 'cartella',
    nome: nomeVero,
    percorso,
    dimensione: Number.isFinite(dimensione) ? dimensione : undefined,
    leggiByte: () => byteDa(fetchFn, `${API}/sessions/${enc(sessionId)}/file?percorso=${enc(percorso)}`),
    creaPagina: () => paginaDa(fetchFn, sessionId, { percorso }),
    indirizzoPdf: `${API}/sessions/${enc(sessionId)}/file/anteprima?percorso=${enc(percorso)}`,
  };
}

/** Una voce della Libreria (`{id, nome, ...}`). */
export function fonteDaLibreria({ sessionId, voce, nome = null, dimensione, fetchFn = (...a) => globalThis.fetch(...a) }) {
  const voceId = String(voce?.id ?? '');
  return {
    origine: 'libreria',
    nome: nome ?? String(voce?.nome ?? voce?.titolo ?? voceId),
    percorso: null,
    dimensione: Number.isFinite(dimensione) ? dimensione : undefined,
    leggiByte: () => byteDa(fetchFn, `${API}/sessions/${enc(sessionId)}/library/${enc(voceId)}/file`),
    creaPagina: () => paginaDa(fetchFn, sessionId, { voceId }),
    indirizzoPdf: `${API}/sessions/${enc(sessionId)}/library/${enc(voceId)}/anteprima`,
  };
}

/**
 * Il caricatore delle rese Office. Il FOGLIO è un modulo della pagina (una tabella nostra, costruita con classi e
 * `textContent`: zero avvisi della CSP, misurato il 26/09), chiesto per indirizzo solo quando serve. Word e PowerPoint
 * invece si rendono DENTRO la pagina ospite (`office/cornice-ospite.js`): qui non si importa niente, si crea la cornice.
 */
export const RESE_OFFICE = Object.freeze({ foglio: '/lettore-foglio.js' });
const RESA_IN_CORNICE = Object.freeze({
  rendi: ({ doc, finestra, byte, nome, tipo, onErrore }) => corniceOspite({ doc, finestra, formato: tipo, byte, nome, onErrore }),
});
export function caricatoreOffice(importa = (indirizzo) => import(indirizzo)) {
  const inVolo = new Map();
  return (tipo) => {
    if (FORMATI_OSPITE.includes(tipo)) return Promise.resolve(RESA_IN_CORNICE);
    const indirizzo = RESE_OFFICE[tipo];
    if (!indirizzo) return Promise.reject(new Error(`nessuna resa per «${tipo}»`));
    if (!inVolo.has(tipo)) inVolo.set(tipo, importa(indirizzo).catch((errore) => { inVolo.delete(tipo); throw errore; }));
    return inVolo.get(tipo);
  };
}
