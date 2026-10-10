/*
 * ⭐ 27/09/2026, decisione owner (memoria `decisioni-owner-capacita-sezioni-27-09`, punto 2: «stesso trio ovunque») — CIÒ CHE
 *   IL MODELLO LEGGE DELLE SEZIONI: elenca · cerca per parole · leggi intero. La Libreria l'aveva già (`library_list`,
 *   `library_search`, `library_read`); qui i pezzi che mancavano:
 *   - Memoria: l'ELENCO (`memory_list`) — «che memorie ho?» non aveva nessuna strada (sessione 56066b64);
 *   - Note: la RICERCA (`notes_search`) e la LETTURA INTERA (`notes_read`) — `notes_list` mostra 200 caratteri per nota;
 *   - Attività e Ricerca approfondita: la RICERCA (`tasks_search`, `research_search`).
 *   C5 (10/10/2026): note e attività hanno ora UN attrezzo ciascuna, `notes_find` e `tasks_find` (elenco + ricerca).
 * Ogni ricerca passa da `ricerca-per-parole.mjs` (vuota o «*» = tutto) e, senza risultati, dice quante voci ci sono e con
 *   quale attrezzo vederle — come Hermes quando una ricerca non trova niente (`session_search_tool.py:379-383`).
 * PURO: niente I/O. Il testo è per il modello, in inglese come gli altri esiti del kernel.
 */
import { cercaPerParole, chiedeTutto, paroleDellaRicerca, punteggioPerParole, piega } from './ricerca-per-parole.mjs';
import { leggiParametriElenco, leggiValoreFiltro, paginaDa, testoElenco, confrontaChiavi, codificaCursore } from './elenco-paginato.mjs';

export const LIMITI_SEZIONI = Object.freeze({
  elencoPredefinito: 20, elencoMassimo: 50,
  ricercaPredefinita: 5, ricercaMassima: 20,
  caratteriVoce: 500, caratteriEstratto: 200, caratteriPagina: 12_000,
  caratteriRiga: 1_000, // C5 (review passo 8): il tetto di UNA riga di un elenco — una sola riga enorme non riempie la pagina
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

/**
 * ⭐ C5 (owner 10/10/2026; contratto §2): `memory_list` + `memory_search` → `memory_find`, come note e attività. La riga porta il
 *   testo fino a 500 caratteri, cioè di fatto intero (una memoria ne ha al più 600): era la ragione d'essere di `memory_list`.
 *   `kind` filtra prima; uno sconosciuto NON filtra e lo dice.
 */
export const GENERI_MEMORIA = Object.freeze(['preference', 'project_fact', 'procedure', 'policy_note']);

export function trovaMemorie(memorie, argomenti = {}) {
  const filtro = leggiValoreFiltro(argomenti?.kind, { nome: 'kind', validi: GENERI_MEMORIA,
    sinonimi: { preferences: 'preference', fact: 'project_fact', project: 'project_fact', how_to: 'procedure', rule: 'policy_note', policy: 'policy_note' } });
  const genere = filtro.valore;
  return trovaInSezione({
    attrezzo: 'memory_find', uno: 'memory', molti: 'memories', testa: 'Memory', voci: genere ? memorie.filter((m) => m.genere === genere) : memorie, argomenti,
    testiDi: (m) => ({ titolo: m.titolo, corpo: m.contenuto }),
    tempoDi: (m) => Date.parse(m.aggiornataAlle ?? m.creataAlle ?? '') || 0, titoloDi: (m) => m.titolo, idDi: (m) => m.id,
    riga: (m, dettagliato) => `${unaRiga(m.titolo)}: ${taglia(unaRiga(m.contenuto), LIMITI_SEZIONI.caratteriVoce)}`
      + (dettagliato ? ` · ${m.genere ?? 'kind unknown'} · updated ${quando(m.aggiornataAlle ?? m.creataAlle)}` : '')
      + ` — id ${m.id}`,
    vuota: genere ? `No ${genere} is remembered.` : 'Nothing is remembered yet. memory_write saves something when the person asks you to remember it.',
    filtri: { kind: genere }, etichettaFiltri: genere ? `kind=${genere}` : '',
    note: filtro.nota ? [filtro.nota] : [],
  });
}

/** `memory_list` (prima della C5): tutte, dalla più aggiornata, col testo intero fino a 500 caratteri. Resta per chi la importa. */
export function elencoMemorie(memorie, { limit } = {}) {
  if (memorie.length === 0) return 'Nothing is remembered yet. memory_write saves something when the person asks you to remember it.';
  const limite = intero(limit, LIMITI_SEZIONI.elencoPredefinito, 1, LIMITI_SEZIONI.elencoMassimo);
  const righe = memorie.slice(0, limite).map((m) => `- ${unaRiga(m.titolo)}: ${taglia(unaRiga(m.contenuto), LIMITI_SEZIONI.caratteriVoce)} — id ${m.id}`);
  const coda = memorie.length > limite ? [`${memorie.length - limite} more: raise limit (up to ${LIMITI_SEZIONI.elencoMassimo}) or use memory_search.`] : [];
  return [`Memory: showing ${Math.min(limite, memorie.length)} of ${memorie.length}, most recently updated first.`, ...righe, ...coda].join('\n');
}

/* ------------------------------------------------------------------ Note */

/*
 * ⭐ C5 (owner 10/10/2026, «parametrizzare E accorpare», «Testo a righe»; contratto §1-§2-§9) — `notes_find`: senza `query`
 *   ELENCA (le più recenti prima, o per titolo), con `query` CERCA per parole con la STESSA ricerca di prima (`ricerca-per-parole`,
 *   ogni parola conta, accenti e maiuscole no), le migliori prima. Limite, cursore opaco, formato concise/detailed come ogni
 *   elenco (`elenco-paginato.mjs`). La chiave del cursore è stabile anche in una ricerca: punteggio, poi data, poi id.
 */
/**
 * ⭐ C5 — la lettura COMUNE di una sezione accorpata (`*_find`): senza query elenca, con query cerca per parole; poi ordine,
 *   cursore e testo a righe. Ogni sezione dà solo ciò che è suo (nomi, testi, data, riga, filtri già applicati).
 * @param {{ attrezzo: string, uno: string, molti: string, testa: string, voci: object[], argomenti: object,
 *   testiDi: (v:object)=>{titolo:string,corpo:string}, tempoDi: (v:object)=>number, titoloDi: (v:object)=>string, idDi: (v:object)=>string,
 *   riga: (v:object, dettagliato:boolean)=>string, vuota: string, filtri?: object, etichettaFiltri?: string, note?: string[] }} p
 *   `voci` sono quelle già passate dai filtri della sezione (es. status), che `etichettaFiltri` nomina nella testata.
 */
function trovaInSezione({ attrezzo, uno, molti, testa: Testa, voci: base, argomenti, testiDi, tempoDi, titoloDi, idDi, riga, vuota, filtri: filtriSezione = {}, etichettaFiltri = '', note: noteSezione = [], recenti = 'most recently updated first' }) {
  const parametri = leggiParametriElenco(argomenti, { ordini: ['recent', 'title'], ordinePredefinito: 'recent' });
  const note = [...noteSezione, ...parametri.note];
  const query = typeof argomenti?.query === 'string' ? argomenti.query.trim() : '';
  const cerca = query !== '' && !chiedeTutto(query);
  if (base.length === 0) return note.length ? [vuota, ...note].join('\n') : vuota;
  const parole = cerca ? paroleDellaRicerca(query) : [];
  let voci = base.map((v) => ({ v, punti: cerca ? punteggioPerParole(testiDi(v), parole) : 0 }));
  if (cerca) voci = voci.filter((x) => x.punti > 0);
  if (cerca && voci.length === 0) {
    const unico = base.length === 1;
    return [`No ${uno} contains ${cita(parole)}. There ${unico ? 'is' : 'are'} ${base.length} ${unico ? uno : molti}${etichettaFiltri ? ` (${etichettaFiltri})` : ''} in all: `
      + `${attrezzo} without query lists ${unico ? 'it' : 'them'}, or search with other words.`, ...note].join('\n');
  }
  // la chiave del cursore è stabile anche in una ricerca: punteggio, poi data, poi id
  const chiaveDi = cerca
    ? (x) => [-x.punti, -tempoDi(x.v), idDi(x.v)]
    : parametri.ordine === 'title' ? (x) => [piega(unaRiga(titoloDi(x.v))), idDi(x.v)] : (x) => [-tempoDi(x.v), idDi(x.v)];
  voci.sort((a, b) => confrontaChiavi(chiaveDi(a), chiaveDi(b)));
  const filtri = { ...filtriSezione, query: cerca ? query : null, sort: cerca ? null : parametri.ordine };
  const pagina = paginaDa(voci, { attrezzo, filtri, chiaveDi, limite: parametri.limite, cursore: parametri.cursore });
  if (!pagina.ok) return pagina.nota;
  const dettagliato = parametri.formato === 'detailed';
  /*
   * ⛔ Review C5 passo 8 (bugfixer, RED, 10/10/2026) — IL BUDGET DELLA PAGINA. Con `limit` fino a 100 e righe lunghe (estratti,
   *   nomi senza tetto) una pagina passava i 16.000 caratteri, e il kernel la tagliava a metà PRIMA del confine dei dati: le righe
   *   dopo il taglio uscivano FUORI dal confine (la sonda: 40 righe col testo iniettato fuori), e quelle tolte dal mezzo non le
   *   raggiungeva più nessun cursore. ⇒ La pagina si ferma QUI, al budget (`caratteriPagina`), con almeno una riga; ciò che non
   *   entra resta «more» e il cursore riparte dall'ultima riga MOSTRATA. Ogni riga ha il suo tetto (`caratteriRiga`), così una
   *   sola riga enorme non riempie la pagina. Il taglio del kernel resta come rete, e su una pagina non scatta mai.
   */
  const righe = [];
  let usati = 0;
  for (const x of pagina.pagina) {
    /* Review C5 (bugfixer, Y1): il tetto taglia il TESTO della riga, mai la sua impugnatura in coda (« — id X»): una riga
       senza id è un file che non si legge, non si rinomina e non si elimina più. */
    const piena = riga(x.v, dettagliato);
    const impugnatura = ` — id ${idDi(x.v)}`;
    const testoRiga = piena.length <= LIMITI_SEZIONI.caratteriRiga ? piena
      : piena.endsWith(impugnatura) ? `${taglia(piena.slice(0, -impugnatura.length), LIMITI_SEZIONI.caratteriRiga - impugnatura.length)}${impugnatura}`
        : taglia(piena, LIMITI_SEZIONI.caratteriRiga);
    if (righe.length > 0 && usati + testoRiga.length + 3 > LIMITI_SEZIONI.caratteriPagina) break;
    righe.push(testoRiga);
    usati += testoRiga.length + 3;
  }
  const tolte = pagina.pagina.length - righe.length;
  const ultima = pagina.pagina[righe.length - 1];
  const prossimo = tolte > 0 && ultima ? codificaCursore({ attrezzo, chiave: chiaveDi(ultima), filtri }) : pagina.next_cursor;
  const conFiltri = etichettaFiltri ? ` (${etichettaFiltri})` : '';
  const testa = cerca
    ? `${Testa}: ${voci.length} of ${base.length}${conFiltri} match ${cita(parole)}, showing ${righe.length}, best first.`
    : `${Testa}: showing ${righe.length} of ${voci.length}${conFiltri}, ${parametri.ordine === 'title' ? 'by title' : recenti}.`;
  return testoElenco({ testa, righe, has_more: pagina.has_more || tolte > 0, next_cursor: prossimo,
    restanti: pagina.restanti + tolte, note, suggerimentoFiltro: cerca ? 'more words in query' : 'query=…' });
}

const quando = (iso) => String(iso ?? '—').slice(0, 16).replace('T', ' ');

export function trovaNote(note, argomenti = {}) {
  return trovaInSezione({
    attrezzo: 'notes_find', uno: 'note', molti: 'notes', testa: 'Notes', voci: note, argomenti,
    testiDi: (n) => ({ titolo: n.titolo, corpo: n.contenuto }),
    tempoDi: (n) => Date.parse(n.aggiornataAlle ?? n.creataAlle ?? '') || 0, titoloDi: (n) => n.titolo, idDi: (n) => n.id,
    riga: (n, dettagliato) => `${unaRiga(n.titolo)}: ${taglia(unaRiga(n.contenuto), LIMITI_SEZIONI.caratteriEstratto)}`
      + (dettagliato ? ` · updated ${quando(n.aggiornataAlle ?? n.creataAlle)} · ${String(n.contenuto ?? '').length} characters` : '')
      + ` — id ${n.id}`,
    vuota: 'There are no notes.',
  });
}

/** `notes_read`: la nota intera; oltre 12.000 caratteri, a pezzi con `from`. */
export function leggiNotaIntera(nota, { id, from } = {}) {
  if (!nota) return `notes_read: no note with id «${id}». notes_find gives the ids.`;
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

/**
 * ⭐ C5 (owner 10/10/2026, «parametrizzare E accorpare»; contratto §2): `tasks_list` + `tasks_search` → `tasks_find`. Come le
 *   note: senza `query` elenca, con `query` cerca per parole; `status` filtra prima (open = non finite, cioè todo e doing). Uno
 *   stato sconosciuto NON filtra: lo dice una nota coi valori validi (review C5 del bugfixer sui figli, 10/10).
 */
export const STATI_FILTRO_ATTIVITA = Object.freeze(['all', 'open', 'todo', 'doing', 'done']);

export function trovaAttivita(attivita, argomenti = {}) {
  const filtro = leggiValoreFiltro(argomenti?.status, { nome: 'status', validi: STATI_FILTRO_ATTIVITA,
    sinonimi: { completed: 'done', finished: 'done', closed: 'done', pending: 'open', not_done: 'open', in_progress: 'doing', started: 'doing' } });
  const stato = filtro.valore && filtro.valore !== 'all' ? filtro.valore : null;
  const filtrate = stato === 'open' ? attivita.filter((a) => a.stato !== 'done')
    : stato ? attivita.filter((a) => a.stato === stato) : attivita;
  return trovaInSezione({
    attrezzo: 'tasks_find', uno: 'task', molti: 'tasks', testa: 'Tasks', voci: filtrate, argomenti,
    testiDi: (a) => ({ titolo: a.titolo, corpo: a.descrizione ?? '' }),
    tempoDi: (a) => Date.parse(a.aggiornataAlle ?? a.creataAlle ?? '') || 0, titoloDi: (a) => a.titolo, idDi: (a) => a.id,
    riga: (a, dettagliato) => `[${a.stato}] ${unaRiga(a.titolo)}`
      + `${dettagliato || (a.priorita && a.priorita !== 'normal') ? ` (${a.priorita ?? 'normal'})` : ''}`
      + `${a.descrizione ? `: ${taglia(unaRiga(a.descrizione), LIMITI_SEZIONI.caratteriEstratto)}` : ''}`
      + (dettagliato ? ` · updated ${quando(a.aggiornataAlle ?? a.creataAlle)}` : '')
      + ` — id ${a.id}`,
    vuota: stato ? `There are no ${stato} tasks.` : 'There are no tasks.',
    filtri: { status: stato }, etichettaFiltri: stato ? `status=${stato}` : '',
    note: filtro.nota ? [filtro.nota] : [],
  });
}

/* ------------------------------------------------------------------ Libreria */

/**
 * ⭐ C5 (owner 10/10/2026; contratto §2 e §10): `library_list` + `library_search` → `library_find`, coi filtri di sempre
 *   (`origin`, `file_type`) e `query`. La ricerca pesa il nome più del testo estratto, come faceva `cercaVoci` (nome ×3, testo ×1):
 *   ora con la ricerca per parole comune (accenti e maiuscole non contano). Senza query bastano i metadati: il chiamante legge il
 *   testo estratto SOLO quando c'è una query. Il freno sulle pagine (BC-10) è del kernel.
 */
export const ORIGINI_LIBRERIA = Object.freeze(['all', 'uploaded', 'generated']);
export const TIPI_LIBRERIA = Object.freeze(['all', 'image', 'document', 'link']);

export function trovaLibreria(voci, argomenti = {}) {
  const origine = leggiValoreFiltro(argomenti?.origin, { nome: 'origin', validi: ORIGINI_LIBRERIA,
    sinonimi: { upload: 'uploaded', uploads: 'uploaded', user: 'uploaded', created: 'generated', made: 'generated', ai: 'generated' } });
  const tipo = leggiValoreFiltro(argomenti?.file_type, { nome: 'file_type', validi: TIPI_LIBRERIA,
    sinonimi: { images: 'image', picture: 'image', photo: 'image', documents: 'document', doc: 'document', docs: 'document', file: 'document',
      links: 'link', web: 'link', page: 'link' } });
  const o = origine.valore && origine.valore !== 'all' ? origine.valore : null;
  const t = tipo.valore && tipo.valore !== 'all' ? tipo.valore : null;
  const etichetta = [o && `origin=${o}`, t && `file_type=${t}`].filter(Boolean).join(', ');
  const conQuery = typeof argomenti?.query === 'string' && argomenti.query.trim() !== '' && !chiedeTutto(argomenti.query);
  return trovaInSezione({
    attrezzo: 'library_find', uno: 'Library file', molti: 'Library files', testa: 'Library',
    voci: voci.filter((v) => (!o || v.origine === o) && (!t || v.fileType === t)), argomenti,
    testiDi: (v) => ({ titolo: v.nome, corpo: v.testoEstratto ?? '' }),
    tempoDi: (v) => Date.parse(v.aggiornatoIl ?? v.creatoIl ?? '') || 0, titoloDi: (v) => v.nome, idDi: (v) => v.id,
    riga: (v, dettagliato) => `${unaRiga(v.nome)} — ${v.fileType} — ${v.origine}`
      + (conQuery && v.testoEstratto ? `: ${taglia(unaRiga(v.testoEstratto), LIMITI_SEZIONI.caratteriEstratto)}` : '')
      + (dettagliato ? ` · ${v.mediaType ?? 'unknown type'} · updated ${quando(v.aggiornatoIl ?? v.creatoIl)}` : '')
      + ` — id ${v.id}`,
    vuota: etichetta ? `No Library file matches ${etichetta}.` : 'There are no Library files yet.',
    filtri: { origin: o, file_type: t }, etichettaFiltri: etichetta,
    note: [origine.nota, tipo.nota].filter(Boolean),
  });
}

/* ------------------------------------------------------------------ Ricerca approfondita */

/**
 * ⭐ C5 (owner 10/10/2026; contratto §2 e §10): `research_list` + `research_search` → `research_find`, coi filtri del contratto —
 *   `status`, `since`/`until` (giorni dell'avvio), `query`. Lo stato «senza-rapporto» arriva al modello come `no_report`: il
 *   vecchio elenco non sapeva filtrarlo. Il freno sulle pagine NON sta qui: è del kernel (`decisioneDiSfogliamento`, §10).
 */
export const STATI_FILTRO_RICERCA = Object.freeze(['all', 'running', 'paused', 'done', 'no_report', 'cancelled', 'failed']);
const statoRicercaPerIlModello = (stato) => (stato === 'senza-rapporto' ? 'no_report' : stato);
const GIORNO = /^\d{4}-\d{2}-\d{2}$/u;

export function trovaRicerche(ricerche, argomenti = {}) {
  const filtro = leggiValoreFiltro(argomenti?.status, { nome: 'status', validi: STATI_FILTRO_RICERCA,
    sinonimi: { finished: 'done', completed: 'done', stopped: 'cancelled', canceled: 'cancelled', error: 'failed', errored: 'failed',
      without_report: 'no_report', senza_rapporto: 'no_report' } });
  const stato = filtro.valore && filtro.valore !== 'all' ? filtro.valore : null;
  const note = filtro.nota ? [filtro.nota] : [];
  const giorni = {};
  for (const campo of ['since', 'until']) {
    const grezzo = argomenti?.[campo];
    if (grezzo === undefined || grezzo === null || grezzo === '') continue;
    const giorno = String(grezzo).trim();
    if (GIORNO.test(giorno) && !Number.isNaN(Date.parse(giorno))) giorni[campo] = giorno;
    else note.push(`${campo} "${grezzo}" is not a day like 2026-10-10 and was ignored.`);
  }
  // review C5 passo 7 (bugfixer): i giorni sono UTC; un intervallo capovolto non svuota l'elenco in silenzio
  if (giorni.since && giorni.until && giorni.since > giorni.until) note.push(`since ${giorni.since} is after until ${giorni.until}: no day can match. Days are UTC.`);
  const giornoDi = (r) => String(r.avviataAlle ?? '').slice(0, 10);
  const filtrate = ricerche.filter((r) => (!stato || statoRicercaPerIlModello(r.stato) === stato)
    && (!giorni.since || giornoDi(r) >= giorni.since) && (!giorni.until || (giornoDi(r) !== '' && giornoDi(r) <= giorni.until)));
  const etichetta = [stato && `status=${stato}`, giorni.since && `since=${giorni.since}`, giorni.until && `until=${giorni.until}`].filter(Boolean).join(', ');
  const titolo = (r) => r.titolo || r.nome || r.domanda || 'Untitled';
  return trovaInSezione({
    attrezzo: 'research_find', uno: 'deep research run', molti: 'deep research runs', testa: 'Deep research', voci: filtrate, argomenti,
    testiDi: (r) => ({ titolo: titolo(r), corpo: [r.domanda, r.ultimoMessaggio].filter(Boolean).join('\n') }),
    tempoDi: (r) => Date.parse(r.avviataAlle ?? '') || 0, titoloDi: titolo, idDi: (r) => r.id,
    riga: (r, dettagliato) => `${unaRiga(titolo(r))} — ${statoRicercaPerIlModello(r.stato)} — ${giornoDi(r) || '—'}`
      + (dettagliato && r.domanda && r.domanda !== titolo(r) ? ` · question: ${taglia(unaRiga(r.domanda), LIMITI_SEZIONI.caratteriEstratto)}` : '')
      + (dettagliato && r.conclusaAlle ? ` · ended ${quando(r.conclusaAlle)}` : '')
      + (dettagliato && typeof r.motivo === 'string' && r.motivo ? ` · ${taglia(unaRiga(r.motivo), LIMITI_SEZIONI.caratteriEstratto)}` : '')
      + ` — id ${r.id}`,
    vuota: etichetta ? `No deep research run matches ${etichetta}.` : 'No deep research has been run on this project yet.',
    filtri: { status: stato, since: giorni.since ?? null, until: giorni.until ?? null }, etichettaFiltri: etichetta,
    note, recenti: 'most recently started first',
  });
}
