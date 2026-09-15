/**
 * tasks-store.mjs — FASE N, quinto sistema (30/8), piano
 * `elegant-spinning-dongarra.md`. Owner: "TUTTI i 5 sistemi rimasti, uno
 * dopo l'altro".
 *
 * ⛔⛔⛔ GLOBALE, non per-progetto — stesso principio di notes-store.mjs
 * (letto alla fonte: `mobile/src/lib/tools/tasksWriteTools.ts`+
 * `readTools.ts`, `mobile/src/persistence/chatDatabaseSchema.ts`).
 * "Ricordami di chiamare l'idraulico" non riguarda nessun progetto di
 * codice — un desktop che rendesse le attività per-progetto le
 * renderebbe invisibili da qualunque altra sessione. Storage accanto a
 * `server.mjs`, stesso pattern REALE di `.automations/`/`.notes-store/`.
 *
 * ⛔ `schedule_json`/`instruction`/`last_run_at` (schema mobile
 * `talos_tasks`) NON portati: colonne presenti nello schema mobile ma
 * NON esposte da NESSUN tool mobile oggi ("pianificare aggiungerà un
 * campo, non un'altra entità" — mai arrivato, verificato leggendo
 * `TalosTasksWriteSources` per intero, zero riferimento a schedule).
 * Harness Desktop ha già un proprio sistema di scheduling (Automazioni,
 * `automation-store.mjs`, chiuso 27/8) — quando/se un task deve
 * ripartire da solo, quella è la casa giusta, non una seconda qui.
 *
 * ⛔ Stessa CONVENZIONE DI CHIAMATA di `notes-store.mjs`/`library-store.mjs`
 * (`funzione({cartella, ...}, deps={})`), per lo stesso motivo: va
 * agganciato negli stessi punti di contatto I/O iniettabili di
 * `agent-service.mjs`.
 *
 * ⛔ Un file JSON per attività (non un unico array) — stessa classe di
 * bug (riscrittura invece di accodamento) già evitata altrove in
 * questo progetto (session-store.mjs).
 */
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { idArchivioValido } from './id-archivio.mjs';

const TITOLO_MASSIMO = 200;
const DESCRIZIONE_MASSIMA = 2_000;
const PRIORITA = Object.freeze(['low', 'normal', 'high']);
const STATI = Object.freeze(['todo', 'doing', 'done']);

/** ⭐ Stesso pattern REALE di `.automations/`/`.notes-store/`: il nome che `server.mjs` userà per il percorso di default, esportato per non duplicarlo lì. */
export const CARTELLA_ATTIVITA = '.tasks-store';

export class TaskStoreError extends Error {
  constructor(message, code = 'TASK_INVALID') {
    super(message);
    this.name = 'TaskStoreError';
    this.code = code;
  }
}

function percorsoDi(cartella, id) {
  // ⛔ 14/09: l'id arriva da fuori (indirizzo HTTP, attrezzo del modello) — un id fuori grammatica non nomina nessun file e
  //   torna `null`, mai un `join` che con `..` uscirebbe dalla cartella. Vedi id-archivio.mjs.
  if (!idArchivioValido(id)) return null;
  return join(cartella, `${id}.json`);
}

function validaTitolo(title) {
  if (typeof title !== 'string' || title.trim().length === 0 || title.length > TITOLO_MASSIMO) {
    throw new TaskStoreError(`title deve avere 1-${TITOLO_MASSIMO} caratteri`, 'TASK_INVALID');
  }
  return title.trim();
}

/** `null`/assente sono la stessa cosa (nessun dettaglio) — una descrizione fatta di soli spazi diventa `null`, stesso principio del tool mobile. */
function validaDescrizione(description) {
  if (description === undefined || description === null) return null;
  if (typeof description !== 'string' || description.length > DESCRIZIONE_MASSIMA) {
    throw new TaskStoreError(`description deve avere al massimo ${DESCRIZIONE_MASSIMA} caratteri`, 'TASK_INVALID');
  }
  return description.trim() || null;
}

function validaPriorita(priority) {
  if (!PRIORITA.includes(priority)) {
    throw new TaskStoreError(`priority deve essere una fra ${PRIORITA.join('/')}`, 'TASK_INVALID');
  }
  return priority;
}

function validaStato(status) {
  if (!STATI.includes(status)) {
    throw new TaskStoreError(`status deve essere uno fra ${STATI.join('/')}`, 'TASK_INVALID');
  }
  return status;
}

/*
 * ⛔ 11/09 — CHI ha scritto questa attività, stesso identico principio (e stesso default) di
 *   `ORIGINI` in notes-store.mjs: due porte sole — gli attrezzi `tasks_*` del modello e le
 *   rotte HTTP della persona — e ciò che è già sul disco viene tutto dal modello, perché fino
 *   a oggi la persona non aveva una porta per scrivere.
 */
const ORIGINI = Object.freeze(['persona', 'modello']);

function validaOrigine(origine) {
  if (!ORIGINI.includes(origine)) {
    throw new TaskStoreError(`origine deve essere una fra ${ORIGINI.join('/')}`, 'TASK_INVALID');
  }
  return origine;
}

/**
 * La forma PUBBLICA di un'attività — l'unica che esce da questo prodotto.
 * ⛔ `fatta` è CALCOLATA da `stato`, mai scritta sul disco: due campi che dicono la stessa cosa
 *   e possono divergere sono un difetto, non una comodità. Esce dalla porta perché un pannello
 *   ha bisogno di una casella da spuntare, ma la verità resta una sola (`stato`).
 * ⛔ Nessuna `scadenza`: non esiste in questo magazzino e non esiste in nessun attrezzo del
 *   modello (vedi l'intestazione di questo file sulle colonne mobile NON portate). Inventarla
 *   qui vorrebbe dire un campo che solo la persona può scrivere e che il modello non vedrà mai
 *   — la asimmetria che questo porto esiste per evitare.
 */
export function formaPubblicaAttivita(voce) {
  return {
    id: voce.id,
    titolo: voce.titolo,
    descrizione: voce.descrizione ?? null,
    stato: voce.stato,
    fatta: voce.stato === 'done',
    priorita: voce.priorita,
    creataAlle: voce.creataAlle ?? null,
    aggiornataAlle: voce.aggiornataAlle ?? null,
    origine: ORIGINI.includes(voce.origine) ? voce.origine : 'modello',
  };
}

/** Più recentemente aggiornate per prime — stesso ordine di `tasks_list` mobile. Cartella assente ⇒ `[]`, mai un errore. */
export async function elencaAttivita({ cartella }, deps = {}) {
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

/** Un id assente torna `null`, mai un'eccezione. */
export async function leggiAttivita({ cartella, id }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const percorso = percorsoDi(cartella, id);
  if (!percorso) return null; // ⛔ 14/09: id fuori grammatica = «non c'è», mai una lettura fuori dalla cartella
  try {
    return JSON.parse(await readFileFn(percorso, 'utf8'));
  } catch {
    return null;
  }
}

/** @returns l'attività creata: `{id, titolo, descrizione, priorita, stato:'todo', creataAlle, aggiornataAlle}`. @throws {TaskStoreError} TASK_INVALID PRIMA di ogni I/O. */
export async function creaAttivita({ cartella, title, description, priority = 'normal', origine = 'modello' }, deps = {}) {
  const titolo = validaTitolo(title);
  const descrizione = validaDescrizione(description);
  const priorita = validaPriorita(priority);
  const daChi = validaOrigine(origine);
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  const clockFn = deps.clockFn ?? (() => new Date());
  const ora = clockFn().toISOString();
  const voce = { id: randomUUID(), titolo, descrizione, priorita, stato: 'todo', origine: daChi, creataAlle: ora, aggiornataAlle: ora };
  await mkdirFn(cartella, { recursive: true });
  await writeFileFn(percorsoDi(cartella, voce.id), JSON.stringify(voce, null, 2), 'utf8');
  return voce;
}

/**
 * Solo title/description/priority — MAI lo stato (quello è
 * `completaAttivita`, stesso confine del tool mobile: "Do NOT use this
 * to mark something done"). Solo i campi passati cambiano.
 * @throws {TaskStoreError} TASK_NOT_FOUND se l'id non esiste.
 */
export async function aggiornaAttivita({ cartella, id, title, description, priority }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  const clockFn = deps.clockFn ?? (() => new Date());
  const voce = await leggiAttivita({ cartella, id }, { readFileFn });
  if (!voce) throw new TaskStoreError(`nessuna attività con id ${id}`, 'TASK_NOT_FOUND');
  if (title !== undefined) voce.titolo = validaTitolo(title);
  if (description !== undefined) voce.descrizione = validaDescrizione(description);
  if (priority !== undefined) voce.priorita = validaPriorita(priority);
  voce.aggiornataAlle = clockFn().toISOString();
  await mkdirFn(cartella, { recursive: true });
  await writeFileFn(percorsoDi(cartella, id), JSON.stringify(voce, null, 2), 'utf8');
  return voce;
}

/** Cambia SOLO lo stato — tool a parte sul mobile perché "è la cosa che si fa più spesso, e di gran lunga". @throws {TaskStoreError} TASK_NOT_FOUND se l'id non esiste. */
export async function completaAttivita({ cartella, id, status = 'done' }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  const clockFn = deps.clockFn ?? (() => new Date());
  const voce = await leggiAttivita({ cartella, id }, { readFileFn });
  if (!voce) throw new TaskStoreError(`nessuna attività con id ${id}`, 'TASK_NOT_FOUND');
  voce.stato = validaStato(status);
  voce.aggiornataAlle = clockFn().toISOString();
  await mkdirFn(cartella, { recursive: true });
  await writeFileFn(percorsoDi(cartella, id), JSON.stringify(voce, null, 2), 'utf8');
  return voce;
}

/** Idempotente — un id già assente non è un errore, è l'esito voluto ottenuto da qualcun altro. */
export async function eliminaAttivita({ cartella, id }, deps = {}) {
  const rmFn = deps.rmFn ?? fsp.rm;
  const percorso = percorsoDi(cartella, id);
  if (!percorso) return; // ⛔ 14/09: un id che non può nominare un file è già «assente» — no-op idempotente
  await rmFn(percorso, { force: true });
}
