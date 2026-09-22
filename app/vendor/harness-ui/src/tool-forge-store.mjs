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


/* M10-C — owner-managed revision history. The active <id>.json remains the only runtime source. */
const OWNER_HISTORY_DIR = '.owner-versions';
const OWNER_HISTORY_LIMIT = 10;
const OWNER_AUDIT_LIMIT = 256;
const OWNER_ID = /^[a-z0-9][a-z0-9_-]{2,63}$/;

function ownerDir(cartella, id) { return join(cartella, OWNER_HISTORY_DIR, id); }
function ownerVersionsDir(cartella, id) { return join(ownerDir(cartella, id), 'versions'); }
function ownerMetaPath(cartella, id) { return join(ownerDir(cartella, id), 'meta.json'); }
function ownerAuditPath(cartella, id) { return join(ownerDir(cartella, id), 'audit.jsonl'); }
function ownerVersionPath(cartella, id, revision) { return join(ownerVersionsDir(cartella, id), revision + '.json'); }
function validOwnerInput(id, revision) {
  if (typeof id !== 'string' || !OWNER_ID.test(id)) throw new ToolForgeStoreError('owner-managed tool id is invalid', 'FORGE_INVALID');
  if (!Number.isSafeInteger(revision) || revision < 1) throw new ToolForgeStoreError('owner revision must be a positive integer', 'FORGE_INVALID');
}
async function readOwnerMeta(cartella, id, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  try {
    const value = JSON.parse(await readFileFn(ownerMetaPath(cartella, id), 'utf8'));
    return { maxRevision: Number.isSafeInteger(value?.maxRevision) && value.maxRevision > 0 ? value.maxRevision : 0 };
  } catch (error) {
    if (error?.code === 'ENOENT') return { maxRevision: 0 };
    throw new ToolForgeStoreError(`${id}: owner version metadata unreadable: ${error.message}`, 'FORGE_READ_FAILED');
  }
}
async function appendOwnerAudit(cartella, id, event, deps = {}) {
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  await mkdirFn(ownerDir(cartella, id), { recursive: true });
  let rows = [];
  try { rows = (await readFileFn(ownerAuditPath(cartella, id), 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line)); }
  catch (error) { if (error?.code !== 'ENOENT') throw new ToolForgeStoreError(`${id}: owner audit unreadable: ${error.message}`, 'FORGE_READ_FAILED'); }
  rows.push(event);
  rows = rows.slice(-OWNER_AUDIT_LIMIT);
  await writeFileFn(ownerAuditPath(cartella, id), rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
}
async function pruneOwnerVersions(cartella, id, deps = {}) {
  const readdirFn = deps.readdirFn ?? fsp.readdir;
  const rmFn = deps.rmFn ?? fsp.rm;
  let names = [];
  try { names = await readdirFn(ownerVersionsDir(cartella, id)); } catch { return; }
  const revisions = names.map((name) => /^([1-9][0-9]*)\.json$/.exec(name)).filter(Boolean).map((match) => Number(match[1])).filter(Number.isSafeInteger).sort((a, b) => a - b);
  for (const revision of revisions.slice(0, Math.max(0, revisions.length - OWNER_HISTORY_LIMIT))) await rmFn(ownerVersionPath(cartella, id, revision), { force: true });
}

/**
 * Owner-only versioned install/update. This intentionally does NOT replace installaToolForgiato:
 * model tool_create remains create-only and same-id conflicts forever.
 */
export async function installaVersioneToolForgiatoOwner({ cartella, revision, manifest, capacita, azioni, rischio, evidence }, deps = {}) {
  validOwnerInput(manifest?.id, revision);
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  const readdirFn = deps.readdirFn ?? fsp.readdir;
  const active = await leggiToolForgiato({ cartella, id: manifest.id }, deps);
  if (active && active.ownerManaged !== true) throw new ToolForgeStoreError(`tool "${manifest.id}" exists with legacy/model provenance and cannot be silently adopted`, 'FORGE_OWNER_ADOPTION_REQUIRED');
  if (!active) {
    let existing = []; try { existing = await readdirFn(cartella); } catch {}
    if (existing.filter((name) => name.endsWith('.json')).length >= MAX_TOOL_INSTALLATI) throw new ToolForgeStoreError('the tool registry on this device is full — remove an unused tool first', 'FORGE_REGISTRY_FULL');
  }
  const meta = await readOwnerMeta(cartella, manifest.id, deps);
  const maxEver = Math.max(meta.maxRevision, Number.isSafeInteger(active?.ownerRevision) ? active.ownerRevision : 0);
  if (revision <= maxEver) throw new ToolForgeStoreError(`owner revision ${revision} is not newer than max-ever revision ${maxEver}`, 'FORGE_VERSION_NOT_NEWER');
  await mkdirFn(ownerVersionsDir(cartella, manifest.id), { recursive: true });
  const at = new Date().toISOString();
  const record = {
    id: manifest.id, manifest, capacita: Array.isArray(capacita) ? capacita : [], azioni: Array.isArray(azioni) ? azioni : [],
    rischio: typeof rischio === 'string' ? rischio : 'R1', abilitato: false, installatoAlle: at,
    ownerManaged: true, ownerRevision: revision, evidence: evidence ?? null,
  };
  try { await writeFileFn(ownerVersionPath(cartella, manifest.id, revision), JSON.stringify(record, null, 2), { encoding: 'utf8', flag: 'wx' }); }
  catch (error) { if (error?.code === 'EEXIST') throw new ToolForgeStoreError(`owner revision ${revision} already exists`, 'FORGE_VERSION_NOT_NEWER'); throw error; }
  await mkdirFn(cartella, { recursive: true });
  await writeFileFn(percorsoVoce(cartella, manifest.id), JSON.stringify(record, null, 2), 'utf8');
  await writeFileFn(ownerMetaPath(cartella, manifest.id), JSON.stringify({ maxRevision: revision }, null, 2), 'utf8');
  await appendOwnerAudit(cartella, manifest.id, { kind: active ? 'update' : 'install', revision, at }, deps);
  await pruneOwnerVersions(cartella, manifest.id, deps);
  return record;
}

export async function elencaVersioniToolForgiatoOwner({ cartella, id }, deps = {}) {
  if (typeof id !== 'string' || !OWNER_ID.test(id)) throw new ToolForgeStoreError('owner-managed tool id is invalid', 'FORGE_INVALID');
  const readdirFn = deps.readdirFn ?? fsp.readdir;
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  let names = []; try { names = await readdirFn(ownerVersionsDir(cartella, id)); } catch (error) { if (error?.code === 'ENOENT') return []; throw error; }
  const revisions = names.map((name) => /^([1-9][0-9]*)\.json$/.exec(name)).filter(Boolean).map((match) => Number(match[1])).filter(Number.isSafeInteger).sort((a, b) => a - b);
  const rows = [];
  for (const revision of revisions) {
    try { const value = JSON.parse(await readFileFn(ownerVersionPath(cartella, id, revision), 'utf8')); rows.push({ ...value, revision }); }
    catch (error) { throw new ToolForgeStoreError(`${id} revision ${revision} unreadable: ${error.message}`, 'FORGE_READ_FAILED'); }
  }
  return rows;
}

export async function leggiAuditToolForgiatoOwner({ cartella, id }, deps = {}) {
  if (typeof id !== 'string' || !OWNER_ID.test(id)) throw new ToolForgeStoreError('owner-managed tool id is invalid', 'FORGE_INVALID');
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  try { return (await readFileFn(ownerAuditPath(cartella, id), 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line)); }
  catch (error) { if (error?.code === 'ENOENT') return []; throw new ToolForgeStoreError(`${id}: owner audit unreadable: ${error.message}`, 'FORGE_READ_FAILED'); }
}

export async function ripristinaVersioneToolForgiatoOwner({ cartella, id, revision }, deps = {}) {
  validOwnerInput(id, revision);
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  const active = await leggiToolForgiato({ cartella, id }, deps);
  if (!active) throw new ToolForgeStoreError(`tool "${id}" does not exist`, 'FORGE_NOT_FOUND');
  if (active.ownerManaged !== true) throw new ToolForgeStoreError(`tool "${id}" is not owner-managed`, 'FORGE_OWNER_ADOPTION_REQUIRED');
  let snapshot;
  try { snapshot = JSON.parse(await readFileFn(ownerVersionPath(cartella, id, revision), 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') throw new ToolForgeStoreError(`owner revision ${revision} is not retained`, 'FORGE_VERSION_NOT_FOUND'); throw new ToolForgeStoreError(`${id} revision ${revision} unreadable: ${error.message}`, 'FORGE_READ_FAILED'); }
  const restored = { ...snapshot, abilitato: false };
  await writeFileFn(percorsoVoce(cartella, id), JSON.stringify(restored, null, 2), 'utf8');
  await appendOwnerAudit(cartella, id, { kind: 'rollback', revision, at: new Date().toISOString() }, deps);
  return restored;
}
