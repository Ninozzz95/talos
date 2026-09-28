/*
 * ⭐ 27/09/2026, decisione owner (memoria `decisioni-owner-capacita-sezioni-27-09`, punto 2: «stesso trio ovunque») — CIÒ CHE
 *   IL MODELLO LEGGE DELLE SEZIONI: elenca · cerca per parole · leggi intero. La Libreria l'aveva già (`library_list`,
 *   `library_search`, `library_read`); qui i pezzi che mancavano:
 *   - Memoria: l'ELENCO (`memory_list`) — «che memorie ho?» non aveva nessuna strada (sessione 56066b64);
 *   - Note: la RICERCA (`notes_search`) e la LETTURA INTERA (`notes_read`) — `notes_list` mostra 200 caratteri per nota;
 *   - Attività e Ricerca approfondita: la RICERCA (`tasks_search`, `research_search`).
 * Ogni ricerca passa da `ricerca-per-parole.mjs` (vuota o «*» = tutto) e, senza risultati, dice quante voci ci sono e con
 *   quale attrezzo vederle — come Hermes quando una ricerca non trova niente (`session_search_tool.py:379-383`).
 * PURO: niente I/O. Il testo è per il modello, in inglese come gli altri esiti del kernel.
 */
import { cercaPerParole } from './ricerca-per-parole.mjs';

export const LIMITI_SEZIONI = Object.freeze({
  elencoPredefinito: 20, elencoMassimo: 50,
  ricercaPredefinita: 5, ricercaMassima: 20,
  caratteriVoce: 500, caratteriEstratto: 200, caratteriPagina: 12_000,
});

const intero = (valore, predefinito, minimo, massimo) => {
  const n = Math.trunc(Number(valore));
  return Number.isFinite(n) ? Math.min(Math.max(n, minimo), massimo) : predefinito;
};
const unaRiga = (testo) => String(testo ?? '').replace(/\s+/g, ' ').trim();
const taglia = (testo, max) => (testo.length > max ? `${testo.slice(0, max)}…` : testo);
const cita = (parole) => parole.map((p) => `«${p}»`).join(', ');

/** L'esito di una ricerca, uguale per ogni sezione. */
function esitoRicerca({ nome, nomeUno, voci, query, limit, testiDi, riga, elenco, vuota }) {
  if (voci.length === 0) return vuota;
  const { trovate, tutte, parole } = cercaPerParole(voci, query, testiDi);
  const limite = intero(limit, LIMITI_SEZIONI.ricercaPredefinita, 1, LIMITI_SEZIONI.ricercaMassima);
  if (trovate.length === 0) {
    const uno = voci.length === 1;
    return `No ${nomeUno} contains ${cita(parole)}. There ${uno ? 'is' : 'are'} ${voci.length} ${uno ? nomeUno : nome} in all: `
      + `${elenco} shows ${uno ? 'it' : 'them'}, or search with other words.`;
  }
  const testa = tutte
    ? `${nome[0].toUpperCase()}${nome.slice(1)}: showing ${Math.min(limite, trovate.length)} of ${trovate.length}, most recently updated first.`
    : `${nome[0].toUpperCase()}${nome.slice(1)}: ${trovate.length} of ${voci.length} match ${cita(parole)}, showing ${Math.min(limite, trovate.length)}, best first.`;
  return [testa, ...trovate.slice(0, limite).map(riga)].join('\n');
}

/* ------------------------------------------------------------------ Memoria */

/** `memory_list`: tutte, dalla più aggiornata, col testo intero fino a 500 caratteri. */
export function elencoMemorie(memorie, { limit } = {}) {
  if (memorie.length === 0) return 'Nothing is remembered yet. memory_write saves something when the person asks you to remember it.';
  const limite = intero(limit, LIMITI_SEZIONI.elencoPredefinito, 1, LIMITI_SEZIONI.elencoMassimo);
  const righe = memorie.slice(0, limite).map((m) => `- ${unaRiga(m.titolo)}: ${taglia(unaRiga(m.contenuto), LIMITI_SEZIONI.caratteriVoce)} — id ${m.id}`);
  const coda = memorie.length > limite ? [`${memorie.length - limite} more: raise limit (up to ${LIMITI_SEZIONI.elencoMassimo}) or use memory_search.`] : [];
  return [`Memory: showing ${Math.min(limite, memorie.length)} of ${memorie.length}, most recently updated first.`, ...righe, ...coda].join('\n');
}

/* ------------------------------------------------------------------ Note */

export function cercaNote(note, { query, limit } = {}) {
  return esitoRicerca({
    nome: 'notes', nomeUno: 'note', voci: note, query, limit,
    testiDi: (n) => ({ titolo: n.titolo, corpo: n.contenuto }),
    riga: (n) => `- ${unaRiga(n.titolo)}: ${taglia(unaRiga(n.contenuto), LIMITI_SEZIONI.caratteriEstratto)} — id ${n.id}`,
    elenco: 'notes_list', vuota: 'There are no notes.',
  });
}

/** `notes_read`: la nota intera; oltre 12.000 caratteri, a pezzi con `from`. */
export function leggiNotaIntera(nota, { id, from } = {}) {
  if (!nota) return `notes_read: no note with id «${id}». notes_list and notes_search give the ids.`;
  const testo = String(nota.contenuto ?? '');
  const inizio = intero(from, 1, 1, Math.max(1, testo.length));
  const fine = Math.min(testo.length, inizio - 1 + LIMITI_SEZIONI.caratteriPagina);
  const testa = `Note «${unaRiga(nota.titolo)}» — id ${nota.id}${nota.aggiornataAlle ? ` · updated ${String(nota.aggiornataAlle).slice(0, 16).replace('T', ' ')}` : ''}`
    + ` · ${testo.length} characters${nota.formato ? ` · ${nota.formato}` : ''}.`;
  if (testo.length === 0) return `${testa}\nThe note is empty.`;
  const coda = fine < testo.length
    ? `[Characters ${inizio}-${fine} of ${testo.length}. Continue with from=${fine + 1}.]`
    : (inizio > 1 ? `[Characters ${inizio}-${fine} of ${testo.length}: the end of the note.]` : null);
  return [testa, testo.slice(inizio - 1, fine), ...(coda ? [coda] : [])].join('\n');
}

/* ------------------------------------------------------------------ Attività */

export function cercaAttivita(attivita, { query, limit, status } = {}) {
  const filtrate = status === 'open' ? attivita.filter((a) => a.stato !== 'done')
    : status === 'done' ? attivita.filter((a) => a.stato === 'done') : attivita;
  return esitoRicerca({
    nome: 'tasks', nomeUno: 'task', voci: filtrate, query, limit,
    testiDi: (a) => ({ titolo: a.titolo, corpo: a.descrizione ?? '' }),
    riga: (a) => `- [${a.stato === 'done' ? 'x' : ' '}] ${unaRiga(a.titolo)}${a.priorita && a.priorita !== 'normal' ? ` (${a.priorita})` : ''}`
      + `${a.descrizione ? `: ${taglia(unaRiga(a.descrizione), LIMITI_SEZIONI.caratteriEstratto)}` : ''} — id ${a.id}`,
    elenco: 'tasks_list', vuota: status && status !== 'all' ? `There are no ${status} tasks.` : 'There are no tasks.',
  });
}

/* ------------------------------------------------------------------ Ricerca approfondita */

export function cercaRicerche(ricerche, { query, limit } = {}) {
  return esitoRicerca({
    nome: 'deep research runs', nomeUno: 'deep research run', voci: ricerche, query, limit,
    testiDi: (r) => ({ titolo: r.titolo ?? r.nome ?? '', corpo: [r.domanda, r.ultimoMessaggio].filter(Boolean).join('\n') }),
    riga: (r) => `- ${unaRiga(r.titolo || r.nome || r.domanda || 'Untitled')} — ${r.stato} — ${String(r.avviataAlle ?? '').slice(0, 10)} — id ${r.id}`,
    elenco: 'research_list', vuota: 'No deep research has been run on this project yet.',
  });
}
