/*
 * ⛔⛔⛔ LA REGOLA CONDIVISA: «quali file del progetto esegue questa riga di comando» (17/10/2026, owner «Curare come gli hook,
 *   insieme alla CLI», e poi «Stessa regola, una nuova fiducia»).
 *
 * Una sola regola per due prodotti. La fiducia di un hook e quella di un server MCP del progetto valgono per il CONTENUTO di ciò che
 * eseguono, non per il nome: se lo script cambia (un `git pull`, il modello che lo riscrive) la fiducia cade. Prima il desktop
 * contava solo i file nominati negli argomenti degli hook (`hook-registry.mjs`, 17/09) e niente per gli MCP, la CLI contava molto di
 * più (0.6.8–0.6.9): sui 22 casi misurati dal bugfixer il 17/10 gli elenchi erano diversi in 11.
 *
 * ⇒ Questo modulo È la regola della CLI 0.6.9 (`cli/src/security/project-resource-inventory.ts`, commit `2ff8eb343`:
 *   `hookCommandTokens`, `referencedScripts`, `hookSemanticContent`, `mcpSemanticContent`), portata riga per riga in JavaScript
 *   perché la CLI la importi da qui e i due prodotti non possano più divergere. Le impronte della CLI non cambiano, TRANNE in un caso
 *   scelto dall'owner (sotto).
 *
 * Che cosa conta, in breve (i commenti della CLI, riassunti):
 *   - la riga si legge come la legge il kernel (`process-policy.mjs` `parseProcessCommand`): con un operatore della shell non nomina
 *     niente, perché non girerebbe;
 *   - un nome si risolve come fanno Node e Python: estensioni, l'ingresso di una cartella (`package.json` main, `index.*`,
 *     `__main__.py`), `node .`, `python -m pkg.mod`, `npm run x` coi suoi pre e post (e `npm start` → `server.js`), i valori dei flag
 *     (`--require=./x`, `-r./x`);
 *   - uno script in una cartella sua fissa TUTTA quella cartella; gli import relativi di ogni script fissato si seguono a catena;
 *   - una cartella data come argomento semplice (dati, non un programma) non si percorre; le librerie installate si saltano
 *     (`node_modules`, ambienti Python, cache); un collegamento dentro una cartella si fissa per destinazione e non si segue;
 *   - oltre i tetti (10.000 file per cartella, 2.000 script seguiti) lo si DICE con una riga, mai un taglio muto; un file oltre 64 MB
 *     si fissa per dimensione e data.
 *
 * ⭐ LE DUE SCELTE DI OGGI (owner 17/10/2026, «Vince il desktop, si fissa anche quello»):
 *   1. Un file raggiunto attraverso una GIUNZIONE (o un collegamento) che porta FUORI dal progetto ENTRA nell'impronta, col nome con cui
 *      la riga lo raggiunge dentro il progetto (`giunzione/y.mjs`). Prima la CLI lo scartava perché il suo percorso vero sta fuori, e
 *      così un file eseguito davvero restava fuori dalla fiducia. Si fissa da solo: niente cartella intera e niente import seguiti,
 *      perché fuori dal progetto non si cammina. È l'unico caso in cui un'impronta della CLI cambia.
 *   2. Un file raggiunto attraverso una giunzione che resta DENTRO il progetto ha UN nome solo: quello del suo PERCORSO VERO. Perché:
 *      lo stesso file raggiunto da due nomi deve contare una volta; la cartella intera e gli import si percorrono già sui percorsi veri
 *      (un nome della giunzione accanto a uno vero darebbe lo stesso file due volte, coi due nomi); ed è il nome che la CLI usa da
 *      sempre, quindi le sue impronte non cambiano.
 */
import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

/** Quanti file di UNA cartella di script entrano al massimo; oltre, una riga lo dice. */
export const MAX_SCRIPT_FOLDER_FILES = 10_000;
/** Quanti script si seguono al massimo negli import, per una riga di comando. */
const MAX_FOLLOWED_SCRIPTS = 2_000;
const MAX_HASHED_BYTES = 64 * 1024 * 1024;
const FINGERPRINT_CONCURRENCY = 32;
/* `.exe` e `.com`: Windows esegue `bin/srv` come `bin/srv.exe` (PATHEXT) */
const SCRIPT_EXTENSIONS = ['.js', '.cjs', '.mjs', '.ts', '.cts', '.mts', '.jsx', '.tsx', '.py', '.ps1', '.cmd', '.bat', '.sh', '.exe', '.com'];
const FOLLOWED_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts', '.cts', '.mts', '.jsx', '.tsx', '.py']);
const SKIPPED_FOLDERS = new Set(['node_modules', '.git', '.venv', 'venv', '__pycache__', '.tox', '.nox', '.mypy_cache', '.pytest_cache', '.ruff_cache', 'site-packages', '.next', '.turbo', '.cache']);

/* ------------------------------------------------------------------------------------------- il progetto */

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
function canonicalWorkspaceCandidate(workspace, candidate) {
  const resolved = path.resolve(candidate);
  if (!inside(workspace.requestedRoot, resolved)) return resolved;
  return path.resolve(workspace.canonicalRoot, path.relative(workspace.requestedRoot, resolved));
}
/** Come `isPathInsideWorkspace` della CLI: dentro la radice vera, anche se il percorso è scritto con la radice chiesta. */
export function isPathInsideWorkspace(workspace, candidate) {
  return inside(workspace.canonicalRoot, canonicalWorkspaceCandidate(workspace, candidate));
}
/** Il progetto come lo vuole questa regola: la radice chiesta e quella vera. La CLI passa la sua `WorkspaceIdentity`, che le ha già. */
export async function areaDelProgetto(cartella, { realpath = fsp.realpath } = {}) {
  const requestedRoot = path.resolve(cartella);
  return { requestedRoot, canonicalRoot: await realpath(requestedRoot) };
}

/* ---------------------------------------------------------------------------------------- la riga di comando */

/** `process-policy.mjs` `parseProcessCommand`, come il kernel legge il comando di un hook (un comando che rifiuterebbe non nomina niente). */
export function hookCommandTokens(command) {
  if (typeof command !== 'string' || !command.trim() || command.includes('\0')) return [];
  const tokens = []; let token = '', quoted = false, escaping = false;
  for (const char of command.trim()) {
    if (escaping) { token += char; escaping = false; continue; }
    if (char === '\\' && quoted) { escaping = true; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (!quoted && /[&|;<>()]/u.test(char)) return [];
    if (!quoted && /\s/u.test(char)) { if (token) { tokens.push(token); token = ''; } continue; }
    token += char;
  }
  if (escaping) token += '\\'; if (quoted) return []; if (token) tokens.push(token);
  return tokens;
}
/** la riga di uno script di package.json, spezzata sugli operatori della shell (ogni pezzo è un comando suo) */
function scriptLineTokens(line) { return line.split(/&&|\|\||[;&|]/u).flatMap((part) => hookCommandTokens(part)); }
/** i pezzi di una riga che possono nominare un file del progetto: i valori dei flag scartati del flag, gli script di npm seguiti */
async function nameCandidates(root, tokens) {
  const names = [];
  for (const [index, raw] of tokens.entries()) {
    const token = raw.replace(/^--?[A-Za-z][\w-]*=/u, '').replace(/^-(?:r|i)(?=[.\\/])/u, '');
    if (!token || token.length > 4096 || /^[A-Za-z][\w+.-]*:\/\//u.test(token)) continue;
    names.push(token);
    if (index === 0 && /^(?:npm|pnpm|yarn|bun)(?:\.cmd)?$/iu.test(path.basename(token))) {
      names.push('package.json');
      const script = tokens[1] === 'run' || tokens[1] === 'run-script' ? tokens[2] : tokens[1];
      try {
        const pkg = JSON.parse(await fsp.readFile(path.join(root, 'package.json'), 'utf8')); const scripts = pkg?.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
        if (typeof script === 'string') for (const name of ['pre' + script, script, 'post' + script]) { const line = scripts[name]; if (typeof line === 'string') names.push(...scriptLineTokens(line)); }
        if (script === 'start' && typeof scripts.start !== 'string') names.push('server.js');
      } catch { /* niente package.json: niente altro da seguire */ }
    }
  }
  return names;
}

/* ------------------------------------------------------------------------------------------- i nomi e i file */

async function entryKind(pathname) {
  try { const value = await fsp.lstat(pathname); if (value.isSymbolicLink()) return 'symlink'; if (value.isFile()) return 'file'; if (value.isDirectory()) return 'directory'; return null; }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}
/** `lexical` è il percorso come la riga lo scrive, `canonical` quello vero (dopo giunzioni e collegamenti). */
async function existing(pathname, realpath) {
  let canonical; try { canonical = await realpath(pathname); } catch { return null; }
  const kind = await entryKind(canonical); return kind === 'file' || kind === 'directory' ? { canonical, kind, lexical: path.resolve(pathname) } : null;
}
async function resolveName(root, name, realpath) {
  const base = path.resolve(root, name);
  const direct = await existing(base, realpath); if (direct) return direct;
  for (const extension of SCRIPT_EXTENSIONS) { const found = await existing(base + extension, realpath); if (found) return found; }
  const dotted = name.includes('.') && !/[\\/]/u.test(name) ? await existing(path.resolve(root, ...name.split('.')), realpath) : null; /* python -m a.b */
  return dotted ?? (await existing(path.resolve(root, ...name.split('.')) + '.py', realpath));
}
/** il file che esegue `node <cartella>`: package.json main, poi index.*, poi `__main__.py` o `__init__.py` di un pacchetto Python */
async function folderEntry(folder, realpath) {
  try { const main = JSON.parse(await fsp.readFile(path.join(folder, 'package.json'), 'utf8'))?.main; if (typeof main === 'string') { const found = await resolveName(folder, main, realpath); if (found?.kind === 'file') return found.canonical; } } catch { /* niente package.json */ }
  for (const name of [...SCRIPT_EXTENSIONS.map((extension) => 'index' + extension), '__main__.py', '__init__.py']) { const found = await existing(path.join(folder, name), realpath); if (found?.kind === 'file') return found.canonical; }
  return null;
}
/*
 * ⛔⛔ 17/10/2026 — LA MEMORIA DEGLI HASH, PER DIMENSIONE E DATA, COME GIT (owner: «Memoria per dimensione e data, come git»).
 *
 * Misurato dal coordinatore e da me sul repo r4: `node harness-ui/server.mjs` fissa 10.075 file (la cartella `harness-ui` intera) e
 * leggeva 9.999 file a OGNI calcolo, 1,7–3,7 s; il desktop ricalcola la fiducia dei connettori a ogni giro. ⇒ Una memoria
 * percorso → { dimensione, mtimeMs, ctimeMs, ino, sha256, imports }: un file con dimensione, date e ino uguali a quelli memorizzati
 * non si rilegge, e si riusa il suo hash (e i suoi import). È la regola dell'indice di git (`stat` prima del contenuto; anche git
 * guarda la ctime).
 * ⛔ L'elenco dei file NON si memorizza: cartelle e nomi si rileggono a ogni calcolo, così un file nuovo o tolto si vede subito.
 * ⛔ IL LIMITE, detto: chi cambia un file rimettendo APPOSTA la stessa dimensione, la stessa data di modifica E la stessa data di
 *   cambiamento (la ctime, che un programma normale non può scegliere: la sposta il sistema a ogni scrittura e a ogni `utimes`) non
 *   viene visto finché il processo non riparte, o finché la voce non esce dalla memoria. Le stesse condizioni in cui git non vede una
 *   modifica («racily clean»).
 * ⛔⛔ 18/10/2026 — I TIMESTAMP «RACY», come git (trovato da Nino3 sul Pad: la ctime avanza a SCATTI, due scritture di fila con un
 *   `utimes` in mezzo danno la stessa `ctimeNs` 199 volte su 200, misurato col Node dell'app). Se un file viene riscritto nello stesso
 *   scatto in cui il suo hash è stato memorizzato, con la stessa dimensione e la stessa mtime rimessa, dimensione e date sono uguali e
 *   l'hash vecchio si riusava. Cura di git (`Documentation/technical/racy-git.adoc`): una voce le cui date NON sono più vecchie di uno
 *   scatto rispetto al momento della lettura è «racily clean» e non si crede alle date: si rilegge il contenuto. Qui ogni voce ricorda
 *   `lettoAlleMs`, e conta solo se la più recente fra mtime e ctime sta almeno `granaMs` (2 s: la grana più grossa diffusa, i 2 s di
 *   FAT, e ben sopra lo scatto misurato sul Pad) prima di quel momento. Una voce racy si rilegge al calcolo dopo, e la si rimemorizza
 *   col momento nuovo: appena le sue date sono abbastanza vecchie, torna a valere.
 * ⛔ Un tetto al numero di voci (`massimoVoci`): esce la meno usata di recente, così la memoria non cresce senza fine.
 * È un'OPZIONE di `referencedScripts` (`memoria`): di serie una memoria del processo; `null` la spegne. Con o senza, l'impronta è la
 * stessa: la memoria cambia solo quanto si legge.
 */
export const MEMORIA_HASH_VOCI_PREDEFINITE = 50_000;
export const GRANA_RACY_MS = 2_000;
/** `granaMs` 0 spegne la regola racy (la memoria di UN calcolo: lì il file si legge comunque una volta sola); `ora` per le prove */
export function creaMemoriaDegliHash({ massimoVoci = MEMORIA_HASH_VOCI_PREDEFINITE, granaMs = GRANA_RACY_MS, ora = Date.now } = {}) {
  const voci = new Map();
  const stessa = (v, s) => v.dimensione === s.size && v.mtimeMs === s.mtimeMs && v.ctimeMs === s.ctimeMs && v.ino === s.ino;
  const racy = (v) => granaMs > 0 && !(Math.max(v.mtimeMs, v.ctimeMs) <= v.lettoAlleMs - granaMs);
  return {
    get voci() { return voci.size; },
    /** la voce del file se dimensione, date e ino non sono cambiati; altrimenti null (e la voce vecchia si toglie) */
    cerca(percorso, stato) {
      const v = voci.get(percorso); if (!v) return null;
      voci.delete(percorso);
      if (!stessa(v, stato) || racy(v)) return null;
      voci.set(percorso, v); return v;
    },
    metti(percorso, stato, dati) {
      voci.delete(percorso);
      voci.set(percorso, { dimensione: stato.size, mtimeMs: stato.mtimeMs, ctimeMs: stato.ctimeMs, ino: stato.ino, lettoAlleMs: ora(), ...dati });
      while (voci.size > massimoVoci) voci.delete(voci.keys().next().value);
    },
  };
}
/** la memoria del processo, di serie: una per processo, condivisa da hook e connettori */
const MEMORIA_DI_PROCESSO = creaMemoriaDegliHash();

/** hash e import di un file, letto al massimo UNA volta: dalla memoria se dimensione e date non sono cambiate */
async function contenutoDelFile(pathname, memoria) {
  const stato = await fsp.lstat(pathname); // come la CLI (lstat): per un file vero è lo stesso numero
  const noto = memoria?.cerca(pathname, stato);
  if (noto) return noto;
  let dati;
  if (stato.size > MAX_HASHED_BYTES) dati = { sha256: 'size:' + stato.size + ':mtime:' + Math.trunc(stato.mtimeMs), imports: [] };
  else {
    const byte = await fsp.readFile(pathname);
    dati = { sha256: createHash('sha256').update(byte).digest('hex'),
      imports: FOLLOWED_EXTENSIONS.has(path.extname(pathname).toLowerCase()) ? nomiImportati(pathname, byte.toString('utf8')) : [] };
  }
  memoria?.metti(pathname, stato, dati);
  return dati;
}
async function fileDigest(pathname, memoria) { return (await contenutoDelFile(pathname, memoria)).sha256; }
/** i nomi relativi che uno script importa (require/import/export-from di JavaScript e TypeScript, gli import di Python) */
async function importNames(file, memoria) {
  if (!FOLLOWED_EXTENSIONS.has(path.extname(file).toLowerCase())) return [];
  try { return (await contenutoDelFile(file, memoria)).imports; } catch { return []; }
}
function nomiImportati(file, text) {
  const names = new Set();
  for (const match of text.matchAll(/(?:require\s*\(\s*|import\s*\(\s*|\bfrom\s+|\bimport\s+)["'](\.{1,2}(?:\/[^"'\n]*)?)["']/gu)) names.add(match[1]);
  if (/\.py$/iu.test(file)) for (const match of text.matchAll(/^[ \t]*(?:from[ \t]+(\.*[\w.]*)[ \t]+import|import[ \t]+([\w.]+))/gmu)) { const module = (match[1] ?? match[2] ?? '').replace(/^\.+/u, ''); if (module) names.add(module.split('.').join('/')); }
  return [...names].slice(0, 256);
}
function isInsideStrict(root, canonical) { const relative = path.relative(root, canonical); return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative); }
/** un ambiente virtuale di Python è una cartella con pyvenv.cfg, qualunque nome abbia */
async function isVirtualEnvironment(folder) { return (await entryKind(path.join(folder, 'pyvenv.cfg'))) === 'file'; }
async function walkScriptFolder(folder, limit) {
  const walked = { files: [], links: [], truncated: false };
  async function walk(directory) {
    if (walked.truncated) return;
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      if (walked.truncated) return;
      const pathname = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) { let target = ''; try { target = await fsp.readlink(pathname); } catch { /* illeggibile: conta il nome */ } walked.links.push({ path: pathname, target }); continue; }
      if (entry.isDirectory()) { if (!SKIPPED_FOLDERS.has(entry.name) && !await isVirtualEnvironment(pathname)) await walk(pathname); continue; }
      if (entry.isFile()) { if (walked.files.length >= limit) { walked.truncated = true; return; } walked.files.push(pathname); }
    }
  }
  await walk(folder); walked.files.sort(); return walked;
}
async function mapBounded(items, limit, handler) {
  const results = new Array(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { for (;;) { const index = cursor++; if (index >= items.length) return; results[index] = await handler(items[index]); } }));
  return results;
}
function relativeId(root, pathname) { return path.relative(root, pathname).split(path.sep).join('/'); }

/**
 * Ogni file del progetto che una riga di comando esegue, col suo sha256 (o, per un collegamento in una cartella e per un tetto
 * superato, la riga che sta al suo posto). Ordinati per percorso.
 * @param {{canonicalRoot:string, requestedRoot?:string}} workspace
 * @param {readonly string[]} tokens
 * Opzioni: `maxFolderFiles`; `realpath` (la CLI passa la sua `realpathTolerant`); `memoria` (una `creaMemoriaDegliHash()`, di serie
 * quella del processo; `null` la spegne).
 * @returns {Promise<{path:string, sha256:string}[]>}
 */
export async function referencedScripts(workspace, tokens, { maxFolderFiles = MAX_SCRIPT_FOLDER_FILES, realpath = fsp.realpath, memoria = MEMORIA_DI_PROCESSO } = {}) {
  /* `memoria: null` spegne la memoria del processo; dentro UN calcolo un file si legge comunque una volta sola (import e hash), anche se
     le sue date sono «racy» (18/10/2026): la memoria del calcolo non ha la regola, quella del processo sì. */
  const delCalcolo = creaMemoriaDegliHash({ massimoVoci: Number.MAX_SAFE_INTEGER, granaMs: 0 });
  const memoriaDelCalcolo = {
    cerca: (p, s) => delCalcolo.cerca(p, s) ?? memoria?.cerca(p, s) ?? null,
    metti: (p, s, d) => { delCalcolo.metti(p, s, d); memoria?.metti(p, s, d); },
  };
  const area = { requestedRoot: workspace.requestedRoot ?? workspace.canonicalRoot, canonicalRoot: workspace.canonicalRoot };
  const root = area.canonicalRoot;
  const pinned = new Map(); const walkedFolders = new Set(); const queue = []; const followed = new Set();
  const isIn = (canonical) => isInsideStrict(root, canonical) && isPathInsideWorkspace(area, canonical);
  const pinScript = (file) => { if (!pinned.has(file)) pinned.set(file, null); if (!followed.has(file)) { followed.add(file); queue.push(file); } };
  const pinFolder = async (folder) => {
    if (walkedFolders.has(folder) || folder === root) return; walkedFolders.add(folder);
    const walk = await walkScriptFolder(folder, maxFolderFiles);
    for (const file of walk.files) pinScript(file);
    for (const link of walk.links) pinned.set(link.path, 'link:' + link.target);
    if (walk.truncated) pinned.set(path.join(folder, '…'), 'not-checked:more-than-' + maxFolderFiles + '-files');
  };
  const pinEntry = async (file) => { if (path.dirname(file) !== root && path.basename(file) !== 'package.json') await pinFolder(path.dirname(file)); pinScript(file); };
  /* scelta 1 dell'owner (17/10): fuori dal progetto per il percorso vero, dentro per il nome scritto ⇒ il file entra col nome scritto, da solo */
  const pinThroughLink = (lexical) => { if (!pinned.has(lexical)) pinned.set(lexical, null); };
  const lexicallyIn = (lexical) => isInsideStrict(root, lexical);
  const names = await nameCandidates(root, tokens);
  for (const name of names) {
    const found = await resolveName(root, name, realpath); if (!found) continue;
    if (!isIn(found.canonical)) {
      if (!lexicallyIn(found.lexical)) continue;
      if (found.kind === 'file') { pinThroughLink(found.lexical); continue; }
      const entry = await folderEntry(found.lexical, realpath);
      if (entry) pinThroughLink(path.join(found.lexical, path.relative(found.canonical, entry)));
      continue;
    }
    if (found.kind === 'file') { await pinEntry(found.canonical); continue; }
    /* una cartella si esegue solo se ha un ingresso (`node tools/srv`, `python -m pkg`); altrimenti è un dato e non si percorre */
    const entry = await folderEntry(found.canonical, realpath); if (entry && isIn(entry)) await pinEntry(entry);
  }
  /* `node .` nomina la radice stessa */
  if (tokens.some((name) => name === '.' || name === './')) { const entry = await folderEntry(root, realpath); if (entry && isIn(entry)) await pinEntry(entry); }
  /* gli import relativi di ogni script fissato, a catena: un file entra (con la sua cartella solo se è un ingresso suo, mai qui), una
     cartella o un pacchetto entrano interi */
  while (queue.length && followed.size <= MAX_FOLLOWED_SCRIPTS) {
    const file = queue.shift();
    for (const name of await importNames(file, memoriaDelCalcolo)) {
      const resolved = await resolveName(path.dirname(file), name, realpath); if (!resolved || !isIn(resolved.canonical)) continue;
      if (resolved.kind === 'file') pinScript(resolved.canonical); else await pinFolder(resolved.canonical);
    }
  }
  /* il tetto si dice, come una cartella troncata: mai un taglio muto */
  if (queue.length) pinned.set(path.join(root, '…imports'), 'not-checked:imports-past-' + MAX_FOLLOWED_SCRIPTS + '-scripts');
  const rows = await mapBounded([...pinned], FINGERPRINT_CONCURRENCY, async ([file, stands]) => ({ path: relativeId(root, file), sha256: stands ?? await fileDigest(file, memoriaDelCalcolo) }));
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}

/* ------------------------------------------------------------------------------------- il contenuto che si fissa */

/**
 * Il contenuto fissato di un hook e di un server MCP, come la CLI 0.6.9 (`hookSemanticContent` / `mcpSemanticContent`). Senza
 * script il contenuto è quello di prima della regola; con gli script, `beforeScriptsContent` è quello di prima (serve a dire PERCHÉ
 * la fiducia è caduta, mai a tenerla valida).
 */
export async function hookSemanticContent(workspace, row, opzioni) {
  const scripts = await referencedScripts(workspace, hookCommandTokens(row.comando), opzioni); const before = JSON.stringify({ eventi: row.eventi, comando: row.comando });
  return scripts.length ? { content: JSON.stringify({ eventi: row.eventi, comando: row.comando, scripts }), beforeScriptsContent: before } : { content: before };
}
export async function mcpSemanticContent(workspace, row, opzioni) {
  const args = row.argomenti ?? []; const scripts = await referencedScripts(workspace, [row.comando, ...args], opzioni); const before = JSON.stringify({ comando: row.comando, argomenti: args, allowlist: row.allowlist });
  return scripts.length ? { content: JSON.stringify({ comando: row.comando, argomenti: args, allowlist: row.allowlist, scripts }), beforeScriptsContent: before } : { content: before };
}
