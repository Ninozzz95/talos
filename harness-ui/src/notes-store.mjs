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
  // ⛔ id è sempre un randomUUID() generato da questo stesso modulo (mai testo esterno) — nessuna sanificazione di percorso richiesta, a differenza di un nome scelto dal modello (vedi library-store.mjs#sanificaNomeLibreria).
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
  try {
    return JSON.parse(await readFileFn(percorsoDi(cartella, id), 'utf8'));
  } catch {
    return null;
  }
}

/** @returns la nota creata: `{id, titolo, contenuto, creataAlle, aggiornataAlle}`. @throws {NoteStoreError} NOTE_INVALID su title/content fuori dai tetti — PRIMA di ogni I/O, mai una scrittura parziale. */
export async function creaNota({ cartella, title, content }, deps = {}) {
  const titolo = validaTitolo(title);
  const contenuto = validaContenuto(content);
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  const clockFn = deps.clockFn ?? (() => new Date());
  const ora = clockFn().toISOString();
  const voce = { id: randomUUID(), titolo, contenuto, creataAlle: ora, aggiornataAlle: ora };
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
export async function aggiornaNota({ cartella, id, title, content }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  const clockFn = deps.clockFn ?? (() => new Date());
  const voce = await leggiNota({ cartella, id }, { readFileFn });
  if (!voce) throw new NoteStoreError(`nessuna nota con id ${id}`, 'NOTE_NOT_FOUND');
  if (title !== undefined) voce.titolo = validaTitolo(title);
  if (content !== undefined) voce.contenuto = validaContenuto(content);
  voce.aggiornataAlle = clockFn().toISOString();
  await mkdirFn(cartella, { recursive: true });
  await writeFileFn(percorsoDi(cartella, id), JSON.stringify(voce, null, 2), 'utf8');
  return voce;
}

/** Idempotente — un id già assente non è un errore, è l'esito voluto ottenuto da qualcun altro (stesso principio del tool mobile: "It may already be gone"). */
export async function eliminaNota({ cartella, id }, deps = {}) {
  const rmFn = deps.rmFn ?? fsp.rm;
  await rmFn(percorsoDi(cartella, id), { force: true });
}
