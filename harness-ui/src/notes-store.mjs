/**
 * notes-store.mjs — FASE N, quarto sistema (30/8), piano
 * `elegant-spinning-dongarra.md`. Owner: "TUTTI i 5 sistemi rimasti, uno
 * dopo l'altro".
 *
 * ⛔⛔⛔ GLOBALE, non per-progetto — a differenza di Library/hook/MCP/skill/
 * plugin (tutti dentro `.harness-ui-<cosa>/` nel workspace di UN progetto).
 * Letto alla fonte (`mobile/src/lib/tools/notesWriteTools.ts`+`readTools.ts`,
 * `mobile/src/persistence/chatDatabaseSchema.ts`): su mobile le note sono
 * per-DISPOSITIVO, non per-conversazione — "prendi nota che il codice del
 * cancello è 4471" non riguarda NESSUN progetto di codice, è un promemoria
 * personale. Un desktop che le rendesse per-progetto le renderebbe invisibili
 * da qualunque altra sessione — un comportamento diverso da quello mobile
 * che questo porto deve preservare, non inventare. Storage accanto a
 * `server.mjs`, stesso pattern REALE di `.automations/` (dati locali
 * generati a runtime, non tracciati) — non `.hooks-trust/`/`.mcp-trust/`
 * (quelli sono fiducia, non dati).
 *
 * ⛔ Stessa CONVENZIONE DI CHIAMATA di `library-store.mjs`
 * (`funzione({cartella, ...}, deps={})`, non una factory con stato
 * chiuso come `automation-store.mjs`) — deliberato: questo modulo va
 * agganciato negli stessi punti di contatto I/O iniettabili di
 * `agent-service.mjs` (`elencaVociFn`/`rinominaVoceFn`/...), che si
 * aspettano funzioni STANDALONE, non un oggetto costruito una volta.
 * `automation-store.mjs` ha una convenzione diversa perché è agganciato
 * altrove (rotte HTTP dirette), mai dentro il ciclo tool di `talosLavora`.
 *
 * ⛔ Un file JSON per nota (non un unico array): una nota corrotta a metà
 * scrittura non trascina giù le altre, e una cancellazione è un `rm`
 * diretto invece di riscrivere un array intero — la stessa classe di bug
 * (riscrittura invece di accodamento) già evitata altrove in questo
 * progetto (vedi session-store.mjs).
 */
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { idArchivioValido } from './id-archivio.mjs';

const TITOLO_MASSIMO = 120;
const CONTENUTO_MASSIMO = 8_000;

/** ⭐ Stesso pattern REALE di `.automations/`/`.sessions-store/`: il nome che `server.mjs` userà per il percorso di default, esportato per non duplicarlo lì. */
export const CARTELLA_NOTE = '.notes-store';

export class NoteStoreError extends Error {
  constructor(message, code = 'NOTE_INVALID') {
    super(message);
    this.name = 'NoteStoreError';
    this.code = code;
  }
}

function percorsoDi(cartella, id) {
  // ⛔ 14/09: l'id arriva da fuori (indirizzo HTTP, attrezzo del modello), non solo da un randomUUID nostro — un id fuori
  //   grammatica non nomina nessun file e torna `null`, mai un `join` che con `..` uscirebbe dalla cartella. Vedi id-archivio.mjs.
  if (!idArchivioValido(id)) return null;
  return join(cartella, `${id}.json`);
}

function validaTitolo(title) {
  if (typeof title !== 'string' || title.trim().length === 0 || title.length > TITOLO_MASSIMO) {
    throw new NoteStoreError(`title deve avere 1-${TITOLO_MASSIMO} caratteri`, 'NOTE_INVALID');
  }
  return title.trim();
}

function validaContenuto(content) {
  if (typeof content !== 'string' || content.trim().length === 0 || content.length > CONTENUTO_MASSIMO) {
    throw new NoteStoreError(`content deve avere 1-${CONTENUTO_MASSIMO} caratteri`, 'NOTE_INVALID');
  }
  return content.trim();
}

/*
 * ⭐⭐⭐⭐ 11/09/2026, owner: «le note, se sono markdown, devono essere renderizzate in markdown».
 *
 * ⛔ Chi decide non è il frontend, è questo modulo: una nota nasce qui, e se ogni superficie che
 *   la mostra ricavasse il formato da sé avremmo tante risposte quante le superfici (la stessa
 *   classe di difetto di «due lettori dello stesso corpo» già scritta in http-app.mjs).
 * ⛔ `formato` è DICHIARATO oppure RILEVATO, mai indovinato due volte: se chi scrive lo dichiara
 *   (la persona, da un interruttore nel pannello) il valore resta sul disco e vince per sempre;
 *   se non lo dichiara (il modello, che nei suoi attrezzi non ha quel campo) lo rileva questa
 *   funzione a ogni lettura — così una nota scritta ieri in testo semplice e modificata oggi con
 *   un titolo `#` si vede subito come markdown, senza una migrazione.
 *
 * I marcatori sono quelli della specifica CommonMark 0.31.2 (spec.commonmark.org, letta
 * l'11/09/2026), non una lista a memoria: titoli ATX (1-6 `#` seguiti da spazio, fino a 3 spazi
 * di rientro), recinti di codice (3+ backtick o tilde), citazioni (`>`), elenchi puntati
 * (`-`/`+`/`*` PIÙ uno spazio — senza lo spazio non è un elenco) ed elenchi numerati (1-9 cifre
 * più `.` o `)`), righe orizzontali, link `[testo](url)` e enfasi `**`/`__`.
 *
 * ⛔ Enfasi ed elenchi puntati sono i due marcatori che un testo normale può contenere per caso
 *   («3 * 4 * 5», un trattino a inizio riga): per questo richiedono la forma STRETTA — `**` o
 *   `__` attorno a qualcosa, e il trattino solo a inizio riga seguito da spazio. Un asterisco
 *   solitario non basta a chiamare markdown un promemoria della spesa.
 */
const MARCATORI_MARKDOWN = Object.freeze([
  /^ {0,3}#{1,6}(?:[ \t]|$)/m,          // titolo ATX
  /^ {0,3}(?:```|~~~)/m,                 // recinto di codice
  /^ {0,3}>(?:[ \t]|$)/m,                // citazione
  /^ {0,3}[-+*][ \t]+\S/m,               // elenco puntato (il marcatore VUOLE uno spazio)
  /^ {0,3}\d{1,9}[.)][ \t]+\S/m,         // elenco numerato
  /^ {0,3}(?:(?:[-*_][ \t]*){3,})$/m,    // riga orizzontale
  /\[[^\]\n]+\]\([^)\s]+\)/,             // link in linea
  /(\*\*|__)(?!\s)[^\n]+?\1/,            // enfasi forte
  /^ {0,3}\|.*\|[ \t]*$/m,               // riga di tabella (estensione GFM, non CommonMark: dichiarata)
]);

/** `'markdown'` se il testo porta almeno un marcatore CommonMark, `'testo'` altrimenti. PURA: nessun I/O, si prova con una stringa letterale. */
export function rilevaFormatoNota(contenuto) {
  const testo = typeof contenuto === 'string' ? contenuto : '';
  return MARCATORI_MARKDOWN.some((marcatore) => marcatore.test(testo)) ? 'markdown' : 'testo';
}

const FORMATI = Object.freeze(['markdown', 'testo']);
/*
 * ⛔ 11/09 — CHI ha scritto questa nota. Due soli valori possibili perché due sole porte
 *   esistono: gli attrezzi `notes_*` del modello (agent-service.mjs) e le rotte HTTP della
 *   persona (http-app.mjs). Il default è `'modello'` e non `'ignoto'` di proposito: fino a
 *   oggi la persona NON aveva una porta per scrivere — ogni nota già sul disco viene di lì, e
 *   un terzo valore inventerebbe un'incertezza che non c'è.
 */
const ORIGINI = Object.freeze(['persona', 'modello']);

function validaFormato(formato) {
  if (!FORMATI.includes(formato)) {
    throw new NoteStoreError(`formato deve essere uno fra ${FORMATI.join('/')}`, 'NOTE_INVALID');
  }
  return formato;
}

function validaOrigine(origine) {
  if (!ORIGINI.includes(origine)) {
    throw new NoteStoreError(`origine deve essere una fra ${ORIGINI.join('/')}`, 'NOTE_INVALID');
  }
  return origine;
}

/**
 * La forma PUBBLICA di una nota — l'unica che esce da questo prodotto, uguale per la rotta
 * HTTP della persona e per chiunque altro la mostri. `formato` dichiarato vince, altrimenti
 * si rileva dal contenuto; `origine` assente su disco vuol dire `'modello'` (vedi ORIGINI).
 */
export function formaPubblicaNota(voce) {
  return {
    id: voce.id,
    titolo: voce.titolo,
    contenuto: voce.contenuto,
    formato: FORMATI.includes(voce.formato) ? voce.formato : rilevaFormatoNota(voce.contenuto),
    creataAlle: voce.creataAlle ?? null,
    aggiornataAlle: voce.aggiornataAlle ?? null,
    origine: ORIGINI.includes(voce.origine) ? voce.origine : 'modello',
  };
}

/** Più recentemente aggiornate per prime — stesso ordine di `notes_list` mobile (`chatDatabaseSchema.ts`: `ON talos_notes(updated_at DESC, id)`). Cartella assente ⇒ `[]`, mai un errore (primo avvio, nessuna nota ancora). */
export async function elencaNote({ cartella }, deps = {}) {
  const readdirFn = deps.readdirFn ?? fsp.readdir;
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  let nomi;
  try {
    nomi = await readdirFn(cartella);
  } catch {
    return [];
  }
  const voci = [];
  for (const nome of nomi) {
    if (!nome.endsWith('.json')) continue;
    try {
      voci.push(JSON.parse(await readFileFn(join(cartella, nome), 'utf8')));
    } catch { /* una voce corrotta non deve nascondere le altre */ }
  }
  return voci.sort((a, b) => b.aggiornataAlle.localeCompare(a.aggiornataAlle) || a.id.localeCompare(b.id));
}

/** Un id assente torna `null`, mai un'eccezione — stesso principio di `library-store.mjs#leggiVoce`. */
export async function leggiNota({ cartella, id }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const percorso = percorsoDi(cartella, id);
  if (!percorso) return null; // ⛔ 14/09: id fuori grammatica = «non c'è», mai una lettura fuori dalla cartella
  try {
    return JSON.parse(await readFileFn(percorso, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * @returns la nota creata: `{id, titolo, contenuto, formato?, origine, creataAlle, aggiornataAlle}`.
 * @throws {NoteStoreError} NOTE_INVALID su title/content/formato/origine fuori dai tetti — PRIMA di ogni I/O, mai una scrittura parziale.
 * ⛔ 11/09 — `formato` si scrive sul disco SOLO se dichiarato: assente vuol dire «rilevalo a ogni
 *   lettura» (vedi formaPubblicaNota), e scriverci dentro il risultato del rilevamento
 *   congelerebbe per sempre una risposta che deve poter cambiare col contenuto.
 */
export async function creaNota({ cartella, title, content, formato, origine = 'modello' }, deps = {}) {
  const titolo = validaTitolo(title);
  const contenuto = validaContenuto(content);
  const formatoDichiarato = formato === undefined ? undefined : validaFormato(formato);
  const daChi = validaOrigine(origine);
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  const clockFn = deps.clockFn ?? (() => new Date());
  const ora = clockFn().toISOString();
  const voce = {
    id: randomUUID(),
    titolo,
    contenuto,
    ...(formatoDichiarato ? { formato: formatoDichiarato } : {}),
    origine: daChi,
    creataAlle: ora,
    aggiornataAlle: ora,
  };
  await mkdirFn(cartella, { recursive: true });
  await writeFileFn(percorsoDi(cartella, voce.id), JSON.stringify(voce, null, 2), 'utf8');
  return voce;
}

/**
 * Solo i campi passati cambiano — `undefined` lascia il campo intatto (mai
 * una cancellazione implicita), stesso contratto ESATTO del tool mobile
 * ("Send ONLY the fields you are changing").
 * @throws {NoteStoreError} NOTE_NOT_FOUND se l'id non esiste, NOTE_INVALID su un campo passato ma fuori dai tetti.
 */
export async function aggiornaNota({ cartella, id, title, content, formato }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  const clockFn = deps.clockFn ?? (() => new Date());
  const voce = await leggiNota({ cartella, id }, { readFileFn });
  if (!voce) throw new NoteStoreError(`nessuna nota con id ${id}`, 'NOTE_NOT_FOUND');
  if (title !== undefined) voce.titolo = validaTitolo(title);
  if (content !== undefined) voce.contenuto = validaContenuto(content);
  /* ⛔ `formato: null` NON è «lascia stare» come `undefined`: è «torna a rilevarlo dal contenuto»,
     cioè l'unico modo di disfare una dichiarazione sbagliata. Senza questa riga un interruttore
     acceso una volta non si sarebbe più potuto spegnere. */
  if (formato === null) delete voce.formato;
  else if (formato !== undefined) voce.formato = validaFormato(formato);
  voce.aggiornataAlle = clockFn().toISOString();
  await mkdirFn(cartella, { recursive: true });
  await writeFileFn(percorsoDi(cartella, id), JSON.stringify(voce, null, 2), 'utf8');
  return voce;
}

/** Idempotente — un id già assente non è un errore, è l'esito voluto ottenuto da qualcun altro (stesso principio del tool mobile: "It may already be gone"). */
export async function eliminaNota({ cartella, id }, deps = {}) {
  const rmFn = deps.rmFn ?? fsp.rm;
  const percorso = percorsoDi(cartella, id);
  if (!percorso) return; // ⛔ 14/09: un id che non può nominare un file è già «assente» — no-op idempotente, mai un rm fuori dalla cartella
  await rmFn(percorso, { force: true });
}
