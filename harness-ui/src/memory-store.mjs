/**
 * memory-store.mjs — FASE N, sesto sistema (30/8), piano
 * `elegant-spinning-dongarra.md`. Owner: "TUTTI i 5 sistemi rimasti, uno
 * dopo l'altro".
 *
 * ⛔⛔⛔ GLOBALE, non per-progetto — stesso principio di notes-store.mjs/
 * tasks-store.mjs. Letto alla fonte: `mobile/src/lib/tools/memoryWriteTools.ts`
 * + `readTools.ts` + `chatDatabaseSchema.ts` (`talos_memories`) +
 * `stationFacades.ts`/`chatController.ts` (l'implementazione VERA dietro
 * l'interfaccia del tool, non presunta). Lo schema mobile ha uno
 * `scope_type` a tre livelli (global/project/session), ma il CHIAMANTE
 * del tool lo fissa a `'global'` SEMPRE, verificato in
 * `chatController.ts`: "«ricordati che preferisco le risposte brevi»
 * non vale solo in questa conversazione" — questo porto riflette solo
 * ciò che il tool espone davvero, non l'intero schema del deposito.
 *
 * ⛔ `status` (active/disabled/quarantined/rejected nello schema mobile)
 * NON portato: quella macchina a stati è per la STAZIONE mobile
 * (moderazione manuale) — verificato in `stationFacades.ts`,
 * `TalosMemoryWriteSources` non ha un `setStatus`. `memory_delete`
 * desktop fa una cancellazione VERA (mobile stesso chiama
 * `deleteMemory`, un hard delete — confermato alla fonte, non un
 * cambio di stato), stesso schema di notes_delete/tasks_delete.
 *
 * ⭐⭐⭐ L'UNICA logica genuinamente nuova rispetto a Notes/Tasks: la
 * DEDUPLICAZIONE per titolo. Owner mobile, 2026-08-07: "«no, ricordati
 * invece che...» produceva una seconda memoria accanto alla prima" — la
 * memoria è l'unica superficie in cui un duplicato non è disordine, è
 * una contraddizione che si autoalimenta a ogni conversazione futura.
 * `creaMemoria` cerca PRIMA per titolo (case-insensitive, spazi
 * ignorati) e torna la voce ESISTENTE con `duplicato:true` invece di
 * scriverne una seconda.
 *
 * ⛔ Diverso da mobile in UN dettaglio, dichiarato: mobile `create()`
 * NON torna un id ("l'ha detto il typecheck, non io" — un vincolo
 * accidentale della sua implementazione, non una scelta di design,
 * verificato leggendo il commento originale). Questo store non ha
 * quel vincolo: `creaMemoria` torna sempre l'id, per coerenza con
 * notes-store.mjs/tasks-store.mjs (il messaggio di successo desktop
 * include l'id, come "Saved the note «X» (id Y)." — mobile non lo fa
 * per un accidente della sua repository, non per principio).
 *
 * ⛔ Stessa CONVENZIONE DI CHIAMATA di notes-store.mjs/tasks-store.mjs
 * (`funzione({cartella, ...}, deps={})`). Un file JSON per memoria
 * (stessa classe di bug — riscrittura invece di accodamento — già
 * evitata altrove, session-store.mjs, bug Hermes #8029).
 */
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';

const TITOLO_MASSIMO = 80;
const CONTENUTO_MASSIMO = 600;
const GENERI = Object.freeze(['preference', 'project_fact', 'procedure', 'policy_note']);

/** ⭐ Stesso pattern REALE di `.automations/`/`.notes-store/`/`.tasks-store/`: il nome che `server.mjs` userà per il percorso di default. */
export const CARTELLA_MEMORIA = '.memory-store';

export class MemoryStoreError extends Error {
  constructor(message, code = 'MEMORY_INVALID') {
    super(message);
    this.name = 'MemoryStoreError';
    this.code = code;
  }
}

function percorsoDi(cartella, id) {
  return join(cartella, `${id}.json`);
}

function normalizzaTitoloPerConfronto(titolo) {
  return titolo.trim().toLowerCase();
}

function validaTitolo(title) {
  if (typeof title !== 'string' || title.trim().length === 0 || title.length > TITOLO_MASSIMO) {
    throw new MemoryStoreError(`title deve avere 1-${TITOLO_MASSIMO} caratteri`, 'MEMORY_INVALID');
  }
  return title.trim();
}

function validaContenuto(content) {
  if (typeof content !== 'string' || content.trim().length === 0 || content.length > CONTENUTO_MASSIMO) {
    throw new MemoryStoreError(`content deve avere 1-${CONTENUTO_MASSIMO} caratteri`, 'MEMORY_INVALID');
  }
  return content.trim();
}

function validaGenere(kind) {
  if (!GENERI.includes(kind)) {
    throw new MemoryStoreError(`kind deve essere uno fra ${GENERI.join('/')}`, 'MEMORY_INVALID');
  }
  return kind;
}

/** Più recentemente aggiornate per prime. Cartella assente ⇒ `[]`, mai un errore. */
export async function elencaMemorie({ cartella }, deps = {}) {
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
export async function leggiMemoria({ cartella, id }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  try {
    return JSON.parse(await readFileFn(percorsoDi(cartella, id), 'utf8'));
  } catch {
    return null;
  }
}

/** Cerca per titolo esatto (case/spazi-insensitive) — usata dalla deduplicazione, mai per il modello direttamente. */
export async function trovaMemoriaPerTitolo({ cartella, title }, deps = {}) {
  const cercato = normalizzaTitoloPerConfronto(title);
  const tutte = await elencaMemorie({ cartella }, deps);
  return tutte.find((m) => normalizzaTitoloPerConfronto(m.titolo) === cercato) ?? null;
}

/**
 * PURA — stesso confine di `cercaVoci` in library-store.mjs: chi
 * chiama carica l'elenco (I/O), questa funzione filtra (nessun I/O,
 * un test la esercita con un array letterale). Sottostringa
 * case-insensitive su titolo O contenuto — `memory_search` mobile non
 * documenta un algoritmo più sofisticato di questo (nessuna fonte
 * trovata per un ranking/fuzzy match), quindi non se ne inventa uno.
 */
export function cercaMemorie(memorie, { query, limit = 5 } = {}) {
  const cercato = String(query ?? '').trim().toLowerCase();
  const trovate = cercato === ''
    ? []
    : memorie.filter((m) => m.titolo.toLowerCase().includes(cercato) || m.contenuto.toLowerCase().includes(cercato));
  return { memorie: trovate.slice(0, limit), totale: trovate.length };
}

/**
 * @returns `{voce, duplicato}` — `duplicato:true` quando esiste già una
 * memoria con lo STESSO titolo: torna quella esistente, MAI ne scrive
 * una seconda (la dedup è la ragion d'essere di questa funzione, non
 * un dettaglio).
 * @throws {MemoryStoreError} MEMORY_INVALID PRIMA di ogni I/O.
 */
export async function creaMemoria({ cartella, title, content, kind = 'preference' }, deps = {}) {
  const titolo = validaTitolo(title);
  const contenuto = validaContenuto(content);
  const genere = validaGenere(kind);
  const readdirFn = deps.readdirFn ?? fsp.readdir;
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const gemello = await trovaMemoriaPerTitolo({ cartella, title: titolo }, { readdirFn, readFileFn });
  if (gemello) return { voce: gemello, duplicato: true };
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  const clockFn = deps.clockFn ?? (() => new Date());
  const ora = clockFn().toISOString();
  const voce = { id: randomUUID(), titolo, contenuto, genere, creataAlle: ora, aggiornataAlle: ora };
  await mkdirFn(cartella, { recursive: true });
  await writeFileFn(percorsoDi(cartella, voce.id), JSON.stringify(voce, null, 2), 'utf8');
  return { voce, duplicato: false };
}

/** Solo i campi passati cambiano. @throws {MemoryStoreError} MEMORY_NOT_FOUND se l'id non esiste. */
export async function aggiornaMemoria({ cartella, id, title, content, kind }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  const clockFn = deps.clockFn ?? (() => new Date());
  const voce = await leggiMemoria({ cartella, id }, { readFileFn });
  if (!voce) throw new MemoryStoreError(`nessuna memoria con id ${id}`, 'MEMORY_NOT_FOUND');
  if (title !== undefined) voce.titolo = validaTitolo(title);
  if (content !== undefined) voce.contenuto = validaContenuto(content);
  if (kind !== undefined) voce.genere = validaGenere(kind);
  voce.aggiornataAlle = clockFn().toISOString();
  await mkdirFn(cartella, { recursive: true });
  await writeFileFn(percorsoDi(cartella, id), JSON.stringify(voce, null, 2), 'utf8');
  return voce;
}

/** Cancellazione VERA (mobile stesso: `deleteMemory`, un hard delete) — idempotente, un id già assente non è un errore. */
export async function eliminaMemoria({ cartella, id }, deps = {}) {
  const rmFn = deps.rmFn ?? fsp.rm;
  await rmFn(percorsoDi(cartella, id), { force: true });
}
