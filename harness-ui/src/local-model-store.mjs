import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const LOCAL_MODEL_STATES = ['incomplete', 'ready', 'failed'];

export class LocalModelStoreError extends Error {
  constructor(message, code = 'MODEL_STORE_FAILED') {
    super(message);
    this.name = 'LocalModelStoreError';
    this.code = code;
  }
}

const MANIFEST_KEYS = ['id', 'repo', 'revision', 'files', 'bytes', 'sha256', 'license', 'path', 'state', 'updatedAt'];
const FILE_KEYS = ['path', 'bytes', 'sha256'];
const SHA256 = /^[a-f0-9]{64}$/i;
const REVISION = /^[a-f0-9]{40,64}$/i;
const ID = /^[a-z0-9][a-z0-9._-]{0,127}$/i;

function invalid(message) {
  return new LocalModelStoreError(message, 'MODEL_INVALID');
}

function exactKeys(value, keys) {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function validateRelativePath(value, label) {
  if (typeof value !== 'string' || value.trim() === '' || isAbsolute(value)) throw invalid(`${label} must be relative`);
  const segments = value.replaceAll('\\', '/').split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) throw invalid(`${label} contains traversal`);
}

function validateManifest(value, rootDir) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !exactKeys(value, MANIFEST_KEYS)) throw invalid('manifest shape is invalid');
  if (typeof value.id !== 'string' || !ID.test(value.id)) throw invalid('id is invalid');
  if (typeof value.repo !== 'string' || value.repo.trim() === '') throw invalid('repo is required');
  if (typeof value.revision !== 'string' || !REVISION.test(value.revision)) throw invalid('revision must be a full commit hash');
  if (!Array.isArray(value.files) || value.files.length === 0) throw invalid('files are required');
  let sum = 0;
  for (const [index, file] of value.files.entries()) {
    if (!file || typeof file !== 'object' || Array.isArray(file) || !exactKeys(file, FILE_KEYS)) throw invalid(`files[${index}] is invalid`);
    validateRelativePath(file.path, `files[${index}].path`);
    if (!Number.isSafeInteger(file.bytes) || file.bytes <= 0) throw invalid(`files[${index}].bytes is invalid`);
    if (typeof file.sha256 !== 'string' || !SHA256.test(file.sha256)) throw invalid(`files[${index}].sha256 is invalid`);
    sum += file.bytes;
  }
  if (!Number.isSafeInteger(value.bytes) || value.bytes <= 0 || value.bytes !== sum) throw invalid('bytes do not match file sizes');
  if (typeof value.sha256 !== 'string' || !SHA256.test(value.sha256)) throw invalid('sha256 is invalid');
  if (typeof value.license !== 'string' || value.license.trim() === '') throw invalid('license is required');
  validateRelativePath(value.path, 'path');
  const absoluteModelPath = resolve(rootDir, value.path);
  const difference = relative(resolve(rootDir), absoluteModelPath);
  if (difference === '..' || difference.startsWith(`..${'\\'}`) || isAbsolute(difference)) throw invalid('path escapes model root');
  if (!LOCAL_MODEL_STATES.includes(value.state)) throw invalid('state is invalid');
  if (typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) throw invalid('updatedAt is invalid');
  return structuredClone(value);
}

/**
 * ⭐⭐⭐ BC-13 (11/09/2026) — quante letture in volo insieme quando l'elenco è FREDDO.
 *
 * MISURATO su questa macchina (scratchpad/misura-concorrenza.mjs, 10 giri per riga,
 * mediane), leggendo manifest + eventuale `.name.json`:
 *
 *   200 manifest → 1: 119,02 ms · 8: 24,20 · 16: 22,72 · **32: 22,38** · 64: 22,78 · ∞: 25,04
 *  1000 manifest → 1: 626,73 ms · 8: 134,52 · 16: 129,29 · **32: 126,65** · 64: 122,62 · ∞: 126,67
 *
 * ⇒ L'altopiano arriva già a 16: oltre non si guadagna più niente, e `Infinity` è
 *   perfino PEGGIO di 32 (25,04 contro 22,38 su 200) perché il disco non va più
 *   veloce e la coda interna di libuv si allunga soltanto.
 * ⛔ E `Promise.all` senza limite su una cartella grande è il modo classico di
 *   arrivare a `EMFILE: too many open files` — il consiglio unanime è una coda a
 *   concorrenza limitata invece di alzare il tetto dei descrittori
 *   (oneuptime.com «How to Fix Error: EMFILE: too many open files in Node.js»,
 *   22/01/2026, e latchkey.dev «Node.js EMFILE — Fix the File-Descriptor Limit»,
 *   letti l'11/09/2026). Qui i file sono due per modello: 32 in volo = 32
 *   descrittori, un tetto che nessuna libreria esterna deve garantire.
 */
const LETTURE_IN_PARALLELO = 32;

/**
 * Una pozza di `limite` operai che si passano la lista: nessuna dipendenza
 * esterna (`p-limit` farebbe esattamente questo), ordine del risultato
 * conservato perché ogni operaio scrive nella SUA casella, non in coda.
 * ⛔ Un `catch` qui non ci va: `list()` deve continuare a fallire come prima se
 * un manifest è corrotto — la concorrenza cambia il COME si legge, mai il COSA
 * si risponde.
 */
async function mappaConLimite(elementi, limite, fn) {
  const esiti = new Array(elementi.length);
  let prossimo = 0;
  const operai = Array.from({ length: Math.min(limite, elementi.length) }, async () => {
    while (prossimo < elementi.length) {
      const indice = prossimo;
      prossimo += 1;
      esiti[indice] = await fn(elementi[indice]);
    }
  });
  await Promise.all(operai);
  return esiti;
}

export function createLocalModelStore({ rootDir, fsImpl = {}, now = () => new Date() } = {}) {
  if (typeof rootDir !== 'string' || !isAbsolute(rootDir)) throw new LocalModelStoreError('rootDir must be absolute', 'MODEL_STORE_MISCONFIGURED');
  const fs = { mkdir, readFile, readdir, rename, rm, stat, writeFile, ...fsImpl };
  const manifestDir = join(rootDir, 'manifests');
  const locks = new Set();
  const manifestPath = (id) => join(manifestDir, `${id}.json`);
  const namePath = (id) => join(manifestDir, `${id}.name.json`);

  /*
   * ⭐⭐⭐ BC-13 — «i modelli locali devono comparire ISTANTANEI», owner 11/09/2026.
   *
   * ## Da dove viene questa forma: il mobile, che ci ha lavorato oggi
   *
   * `AVM/mobile/src/lib/models/localCatalogueSignal.ts:1-89` dice la regola per
   * esteso: «un elenco che non si aggiorna da solo è un elenco che mente finché
   * qualcuno non lo interroga», e «il disco è l'unica fonte che non può essere in
   * ritardo». ⇒ Là chi CAMBIA il disco lo annuncia (`transfer-finished`,
   * `imported`, `deleted`) e chi mostra l'elenco rilegge — senza pulsante.
   *
   * Qui il desktop non ha bisogno di un bus: chi cambia il disco e chi lo legge
   * sono lo STESSO oggetto. Quindi l'annuncio è un contatore interno — `revisione`
   * — che ogni scrittura di questo store alza. È la stessa idea, con una riga
   * invece di un modulo, perché il confine fra i due lati qui non esiste.
   *
   * ## Perché serve ANCHE il mtime della cartella, e non basta il contatore
   *
   * Il contatore vede solo ciò che passa da qui. I manifest possono cambiare da
   * fuori (un'altra istanza, l'owner che cancella una cartella a mano). Il mtime
   * della cartella copre quel caso.
   *
   * ⛔ MISURATO l'11/09/2026 su questo NTFS (scratchpad/misura-varianti.mjs), non
   *   dedotto dalla documentazione — Microsoft Learn «File Times» descrive i tempi
   *   del FILE, non quelli della cartella che lo contiene:
   *     · aggiunta di una voce      → il mtime della cartella CAMBIA ✔
   *     · rename di una voce dentro → CAMBIA ✔
   *     · riscrittura IN LOCO       → NON cambia ✘
   *   Il terzo caso non ci riguarda: `persist()` e `renameModel()` scrivono SEMPRE
   *   un temporaneo e poi `rename` (è la scrittura atomica che questo file già
   *   faceva), quindi ogni scrittura vera passa dal caso che si vede. E se un
   *   giorno qualcuno riscrivesse in loco da dentro, il contatore lo prende
   *   comunque: le due guardie coprono buchi diversi, per questo ci sono entrambe.
   *
   * ## Cosa costa la guardia, e cosa risparmia (misurato, mediane)
   *
   *   `stat` della sola cartella .............. 0,03 ms
   *   `list()` in serie, come prima ........... 2 modelli 1,50 ms · 50: 32,04 · 200: 129,30
   *   `list()` in parallelo (32) .............. 2 modelli 1,10 ms · 50: 6,75 · 200: 22,38
   *   `structuredClone` dell'elenco in cache .. 50: 0,077 ms · 200: 0,297 · 1000: 1,678
   *   ⇒ a caldo su 200 modelli: 0,03 + 0,30 ≈ 0,33 ms contro 129,30 → ~390×.
   *
   * ⛔ Si restituisce un `structuredClone`, non l'array in cache: prima di oggi
   *   ogni `list()` consegnava oggetti freschi, e chi chiama ha il diritto di
   *   maneggiarli. Congelarli sarebbe costato meno (0,3 ms su 200 non sono
   *   niente) ma avrebbe cambiato un contratto in silenzio, che è esattamente il
   *   genere di cura che poi rompe qualcun altro.
   */
  let revisione = 0;
  /** @type {{revisione: number, firma: number, modelli: Array}|null} */
  let elencoInCache = null;

  /**
   * La firma della cartella, o `null` se non si può leggere. `null` NON è una
   * firma: non si confronta mai con niente, quindi una cartella che non esiste
   * (o un `fsImpl` di prova senza `stat`) fa semplicemente decadere la cache
   * invece di congelare una risposta sbagliata.
   */
  async function firmaDellaCartella() {
    try {
      const informazioni = await fs.stat(manifestDir);
      const valore = Number(informazioni?.mtimeMs);
      return Number.isFinite(valore) ? valore : null;
    } catch {
      return null;
    }
  }

  async function persist(manifest) {
    await fs.mkdir(manifestDir, { recursive: true });
    const target = manifestPath(manifest.id);
    const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
    try {
      await fs.writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      await fs.rename(temporary, target);
      revisione += 1; // BC-13: l'annuncio del mobile, ridotto a un contatore perché qui chi scrive e chi legge sono lo stesso oggetto
    } catch (error) {
      await fs.rm(temporary, { force: true }).catch(() => {});
      if (error?.code === 'EEXIST') throw new LocalModelStoreError(`model ${manifest.id} already exists`, 'MODEL_EXISTS');
      throw new LocalModelStoreError(`cannot persist model ${manifest.id}: ${error.message}`, 'MODEL_WRITE_FAILED');
    }
  }

  async function inspect(id) {
    if (typeof id !== 'string' || !ID.test(id)) throw invalid('id is invalid');
    let contents;
    try {
      contents = await fs.readFile(manifestPath(id), 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw new LocalModelStoreError(`cannot read model ${id}: ${error.message}`, 'MODEL_READ_FAILED');
    }
    try {
      const manifest = validateManifest(JSON.parse(contents), rootDir);
      try {
        const name = await fs.readFile(namePath(id), 'utf8');
        if (typeof name === 'string' && name.trim()) manifest.name = name.trim();
      } catch (error) { if (error?.code !== 'ENOENT') throw new LocalModelStoreError(`cannot read model ${id} name: ${error.message}`, 'MODEL_READ_FAILED'); }
      return manifest;
    } catch (error) {
      if (error instanceof LocalModelStoreError) throw new LocalModelStoreError(`manifest ${id} is corrupt: ${error.message}`, 'MODEL_CORRUPT');
      throw new LocalModelStoreError(`manifest ${id} is not JSON`, 'MODEL_CORRUPT');
    }
  }

  async function register(value) {
    const manifest = validateManifest({ ...value, updatedAt: value?.updatedAt ?? now().toISOString() }, rootDir);
    if (await inspect(manifest.id)) throw new LocalModelStoreError(`model ${manifest.id} already exists`, 'MODEL_EXISTS');
    await persist(manifest);
    return manifest;
  }

  async function setState(id, state) {
    if (!LOCAL_MODEL_STATES.includes(state)) throw invalid('state is invalid');
    const current = await inspect(id);
    if (!current) throw new LocalModelStoreError(`model ${id} not found`, 'MODEL_NOT_FOUND');
    const manifest = validateManifest({ ...current, state, updatedAt: now().toISOString() }, rootDir);
    await persist(manifest);
    return manifest;
  }

  /**
   * BC-13 — `{ fresco: true }` salta la cache e rilegge il disco.
   *
   * ⛔ Non è un ripiego «in caso non funzioni»: è la porta per chi ha una ragione
   * di sospettare il disco che questo store non può conoscere (una verifica
   * dell'owner, una diagnosi). Chi non ne ha una, non la usa — altrimenti la
   * cura vale zero.
   */
  async function list({ fresco = false } = {}) {
    const firma = await firmaDellaCartella();
    if (!fresco && elencoInCache && firma !== null
      && elencoInCache.firma === firma && elencoInCache.revisione === revisione) {
      return structuredClone(elencoInCache.modelli);
    }

    let entries;
    try { entries = await fs.readdir(manifestDir, { withFileTypes: true }); }
    catch (error) { if (error?.code === 'ENOENT') return []; throw new LocalModelStoreError(`cannot list models: ${error.message}`, 'MODEL_READ_FAILED'); }
    const identificativi = [];
    for (const entry of entries) {
      const name = typeof entry === 'string' ? entry : entry.name;
      if (!name.endsWith('.json') || name.endsWith('.name.json')) continue;
      identificativi.push(name.slice(0, -5));
    }
    /*
     * La revisione si legge PRIMA delle letture: se una scrittura arriva mentre
     * stiamo leggendo, il confronto qui sotto fallisce e l'elenco non finisce in
     * cache. Meglio una cache che non si popola che una cache che congela una
     * fotografia scattata a metà di una scrittura.
     */
    const revisionePrimaDiLeggere = revisione;
    const letti = await mappaConLimite(identificativi, LETTURE_IN_PARALLELO, (id) => inspect(id));
    const models = letti.filter((model) => model).sort((a, b) => a.id.localeCompare(b.id));

    const firmaDopo = await firmaDellaCartella();
    if (firmaDopo !== null && firmaDopo === firma && revisione === revisionePrimaDiLeggere) {
      elencoInCache = { revisione, firma: firmaDopo, modelli: structuredClone(models) };
    } else {
      elencoInCache = null;
    }
    return models;
  }

  async function lock(id) {
    if (!await inspect(id)) throw new LocalModelStoreError(`model ${id} not found`, 'MODEL_NOT_FOUND');
    if (locks.has(id)) throw new LocalModelStoreError(`model ${id} is already locked`, 'MODEL_LOCKED');
    locks.add(id);
    return true;
  }

  async function unlock(id) {
    return locks.delete(id);
  }

  /**
   * 06/09 (richiesta INST-DELETE-FILE): «Elimina» toglieva solo i manifest e
   * lasciava i pesi sul disco. Ora cancella anche la cartella del modello, ma SOLO se sta dentro
   * `rootDir` (il manifest lo garantisce già; qui si riverifica prima di un `rm` ricorsivo:
   * risolvi, poi `relative()` che non inizi con `..` e non sia assoluto — openreplay «Preventing
   * Path Traversal in Node.js», googleapis/nodejs-storage #2654, letti il 06/09/2026). Mai la
   * radice stessa, mai un percorso fuori: in quei casi restano i manifest via e i pesi intatti.
   */
  async function remove(id) {
    if (locks.has(id)) throw new LocalModelStoreError(`model ${id} is locked`, 'MODEL_LOCKED');
    const current = await inspect(id).catch(() => null);
    if (current?.path) {
      // `path` è la CARTELLA del modello (download HF: `org-model/`) o il FILE principale
      // (import locale: `<id>/<peso>.gguf`): si guarda sul disco, non si indovina.
      try {
        const radice = resolve(rootDir);
        const dentro = (assoluto) => { const d = relative(radice, assoluto); return d !== '' && d !== '..' && !d.startsWith(`..${sep}`) && !d.startsWith('../') && !isAbsolute(d); };
        const bersaglio = resolve(radice, current.path);
        const eCartella = await fs.stat(bersaglio).then((s) => s.isDirectory()).catch(() => false);
        const cartella = eCartella ? bersaglio : dirname(bersaglio);
        if (!eCartella) for (const b of [bersaglio, ...(current.files || []).map((f) => resolve(cartella, f.path))]) if (dentro(b)) await fs.rm(b, { force: true });
        // la cartella del modello è sua per costruzione: via anche quella, mai la radice
        if (cartella !== radice && dentro(cartella)) await fs.rm(cartella, { recursive: true, force: true });
      } catch {
        // i pesi non si sono lasciati cancellare: i manifest vanno via lo stesso (comportamento di prima)
      }
    }
    await fs.rm(manifestPath(id), { force: true });
    await fs.rm(namePath(id), { force: true });
    revisione += 1; // BC-13: un modello in meno è una notizia per l'elenco, esattamente come uno in più
    return true;
  }

  async function renameModel(id, name) {
    if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 160) throw invalid('name is invalid');
    const current = await inspect(id);
    if (!current) throw new LocalModelStoreError(`model ${id} not found`, 'MODEL_NOT_FOUND');
    const temporary = `${namePath(id)}.tmp-${process.pid}-${randomUUID()}`;
    try {
      await fs.mkdir(manifestDir, { recursive: true });
      await fs.writeFile(temporary, `${name.trim()}\n`, { encoding: 'utf8', flag: 'wx' });
      await fs.rename(temporary, namePath(id));
      revisione += 1; // BC-13: `list()` porta anche il `name`, quindi un nome nuovo è un elenco nuovo
    } catch (error) {
      await fs.rm(temporary, { force: true }).catch(() => {});
      throw new LocalModelStoreError(`cannot rename model ${id}: ${error.message}`, 'MODEL_WRITE_FAILED');
    }
    return { ...current, name: name.trim() };
  }

  return Object.freeze({ inspect, list, register, setState, lock, unlock, remove, rename: renameModel });
}
