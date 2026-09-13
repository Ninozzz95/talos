/**
 * tool-forge-store.mjs — FASE N, nono e ultimo sistema (30/8): Tool
 * Forge, "fetta onesta" (owner, AskUserQuestion: "Fetta onesta
 * (consigliato)"). Letto alla fonte PRIMA di disegnare: `mobile/src/
 * lib/tools/dynamic/forgeRegistryRepository.ts` (269 righe, SQLite
 * device-wide con versioning) — questo store è la traduzione onesta
 * su file, come ogni altro store di questa fase: un file per tool
 * installato, mai un database.
 *
 * ⭐⭐⭐ Tool Forge è GLOBALE, come Notes/Tasks/Memory — non PER-PROGETTO
 * come Libreria/Deep Research. Verificato non presunto: le 8 capability
 * che un tool forgiato può chiamare (tasks, notes, memory — vedi
 * CAPACITA_FORGE nel kernel) operano TUTTE su store GLOBALI
 * (.tasks-store, .notes-store, .memory-store) — un tool forgiato creato
 * mentre si lavora sul progetto A deve restare disponibile e utile
 * anche lavorando sul progetto B, esattamente come una nota o
 * un'attività. Storage: `.tool-forge-store/<id>.json`, accanto a
 * `.notes-store/`/`.tasks-store/`/`.memory-store/`.
 *
 * ⛔⛔⛔ `cartella` qui è SEMPRE la cartella FINALE, mai un genitore da
 * suffissare — stesso contratto ESATTO di notes-store.mjs/
 * tasks-store.mjs/memory-store.mjs (verificato leggendo notes-store.mjs
 * riga per riga, non presunto: `elencaNote` fa `join(cartella, nome)`,
 * MAI `join(cartella, CARTELLA_NOTE, nome)`). Il default REALE vive in
 * session-registry.mjs (`cartellaForge = .../.tool-forge-store/`,
 * GIÀ col suffisso) — un secondo `join(cartella, CARTELLA_FORGE)` qui
 * dentro avrebbe prodotto un doppio annidamento
 * (`.tool-forge-store/.tool-forge-store/`).
 *
 * ⛔⛔⛔ Bug reale trovato E corretto dal vivo (30/8), non da lettura: la
 * prima versione di questo file FACEVA quel doppio join — un
 * `tool_create` chiamato da un modello vero tornava "Created..." (il
 * messaggio di successo, corretto) ma il file non appariva MAI in
 * `.tool-forge-store/` (la cartella vera, controllata sul disco): la
 * scrittura andava un livello più in profondità
 * (`.tool-forge-store/.tool-forge-store/<id>.json`), mai controllata da
 * nessun test perché ogni test di QUESTO file passava una `cartella`
 * generica ("/tmp/x") che non rivelava la duplicazione — solo
 * confrontando il contratto con notes-store.mjs (il precedente diretto)
 * il difetto è emerso.
 *
 * ⛔⛔⛔ Ogni tool installato nasce SEMPRE `abilitato:false` — porto
 * diretto del vincolo mobile ("installed but stays DISABLED until the
 * user turns it on"). Abilitare/disabilitare NON è mai un tool del
 * modello (verificato in toolControlCatalog.ts: tool_create è l'UNICO
 * tool_* chat-facing su ENTRAMBE le piattaforme) — solo un'azione
 * owner-facing dal pannello Capability hub, `abilitaToolForgiato` sotto.
 *
 * Stile DI: stesso pattern di notes-store.mjs — funzioni async con
 * `deps` opzionali per i test, mai un vero filesystem mockato altrove.
 */
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';

export class ToolForgeStoreError extends Error {
  constructor(message, code = 'FORGE_INVALID') {
    super(message);
    this.name = 'ToolForgeStoreError';
    this.code = code;
  }
}

/** Nome canonico della cartella globale — MAI usato per un join interno qui (vedi la doc di testa): solo documentazione/riferimento esterno, come CARTELLA_NOTE in notes-store.mjs. */
export const CARTELLA_FORGE = '.tool-forge-store';
/** Censito da forgeRegistryRepository.ts mobile (MAX_INSTALLED_TOOLS = 64) — non inventato. */
export const MAX_TOOL_INSTALLATI = 64;

function percorsoVoce(cartella, id) {
  return join(cartella, `${id}.json`);
}

/**
 * @returns {Promise<Array<object>>} — [] se la cartella non esiste
 * ancora (mai un errore: nessun tool forgiato è uno stato onesto).
 * Più recenti prime.
 */
export async function elencaToolForgiati({ cartella }, deps = {}) {
  const readdirFn = deps.readdirFn ?? fsp.readdir;
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  let file;
  try {
    file = await readdirFn(cartella);
  } catch {
    return [];
  }
  const strumenti = [];
  for (const nomeFile of file) {
    if (!nomeFile.endsWith('.json')) continue;
    try {
      strumenti.push(JSON.parse(await readFileFn(join(cartella, nomeFile), 'utf8')));
    } catch {
      // ⛔ una voce corrotta non impedisce di vedere le altre — stesso principio di leggiRegistro (session-store.mjs).
    }
  }
  strumenti.sort((a, b) => String(b.installatoAlle || '').localeCompare(String(a.installatoAlle || '')));
  return strumenti;
}

/** @returns {Promise<object|null>} — null se l'id non esiste. */
export async function leggiToolForgiato({ cartella, id }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  try {
    return JSON.parse(await readFileFn(percorsoVoce(cartella, id), 'utf8'));
  } catch (errore) {
    if (errore?.code === 'ENOENT') return null;
    throw new ToolForgeStoreError(`${id}: metadata presente ma illeggibile: ${errore.message}`, 'FORGE_READ_FAILED');
  }
}

/**
 * Installa un manifest GIÀ VALIDATO (dal chiamante, via
 * validaManifestForge del kernel — questo store non rivalida, si
 * fida del chiamante come library-store.mjs si fida di
 * sanificaNomeLibreria). Rifiuta un id già esistente (porto diretto
 * del messaggio mobile — v1 non ha un tool_update, un secondo
 * tool_create sullo stesso id è sempre un conflitto, mai un
 * aggiornamento silenzioso) e un registro pieno (porto diretto del
 * messaggio mobile, MAX_TOOL_INSTALLATI censito non inventato).
 */
export async function installaToolForgiato({ cartella, manifest, capacita, azioni, rischio }, deps = {}) {
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  const readdirFn = deps.readdirFn ?? fsp.readdir;
  if (!manifest || typeof manifest.id !== 'string' || manifest.id.length === 0) {
    throw new ToolForgeStoreError('a tool manifest needs an id', 'FORGE_INVALID');
  }
  let esistenti;
  try {
    esistenti = await readdirFn(cartella);
  } catch {
    esistenti = [];
  }
  if (esistenti.includes(`${manifest.id}.json`)) {
    throw new ToolForgeStoreError(`a tool with id "${manifest.id}" already exists — pick a different id`, 'FORGE_VERSION_NOT_NEWER');
  }
  if (esistenti.filter((nome) => nome.endsWith('.json')).length >= MAX_TOOL_INSTALLATI) {
    throw new ToolForgeStoreError('the tool registry on this device is full — remove an unused tool first', 'FORGE_REGISTRY_FULL');
  }
  await mkdirFn(cartella, { recursive: true });
  const voce = {
    id: manifest.id, manifest, capacita, azioni, rischio,
    abilitato: false, installatoAlle: new Date().toISOString(),
  };
  await writeFileFn(percorsoVoce(cartella, manifest.id), JSON.stringify(voce, null, 2), 'utf8');
  return voce;
}

/**
 * L'UNICA mutazione owner-facing di questa fase (vedi la doc di testa
 * sul perché) — mai chiamata da un tool del modello. `null` se l'id
 * non esiste.
 */
export async function abilitaToolForgiato({ cartella, id, abilitato }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  let voce;
  try {
    voce = JSON.parse(await readFileFn(percorsoVoce(cartella, id), 'utf8'));
  } catch (errore) {
    if (errore?.code === 'ENOENT') return null;
    throw new ToolForgeStoreError(`${id}: metadata presente ma illeggibile: ${errore.message}`, 'FORGE_READ_FAILED');
  }
  const aggiornata = { ...voce, abilitato: Boolean(abilitato) };
  await writeFileFn(percorsoVoce(cartella, id), JSON.stringify(aggiornata, null, 2), 'utf8');
  return aggiornata;
}

/** `null` se l'id non esiste già (idempotente, mai un'eccezione — stesso principio di eliminaVoce/eliminaRicerca). */
export async function eliminaToolForgiato({ cartella, id }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const rmFn = deps.rmFn ?? fsp.rm;
  try {
    await readFileFn(percorsoVoce(cartella, id), 'utf8');
  } catch (errore) {
    if (errore?.code === 'ENOENT') return null;
    throw new ToolForgeStoreError(`${id}: metadata presente ma illeggibile: ${errore.message}`, 'FORGE_READ_FAILED');
  }
  await rmFn(percorsoVoce(cartella, id), { force: true });
  return { id };
}
