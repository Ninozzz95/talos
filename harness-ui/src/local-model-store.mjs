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

export function createLocalModelStore({ rootDir, fsImpl = {}, now = () => new Date() } = {}) {
  if (typeof rootDir !== 'string' || !isAbsolute(rootDir)) throw new LocalModelStoreError('rootDir must be absolute', 'MODEL_STORE_MISCONFIGURED');
  const fs = { mkdir, readFile, readdir, rename, rm, stat, writeFile, ...fsImpl };
  const manifestDir = join(rootDir, 'manifests');
  const locks = new Set();
  const manifestPath = (id) => join(manifestDir, `${id}.json`);
  const namePath = (id) => join(manifestDir, `${id}.name.json`);

  async function persist(manifest) {
    await fs.mkdir(manifestDir, { recursive: true });
    const target = manifestPath(manifest.id);
    const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
    try {
      await fs.writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      await fs.rename(temporary, target);
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

  async function list() {
    let entries;
    try { entries = await fs.readdir(manifestDir, { withFileTypes: true }); }
    catch (error) { if (error?.code === 'ENOENT') return []; throw new LocalModelStoreError(`cannot list models: ${error.message}`, 'MODEL_READ_FAILED'); }
    const models = [];
    for (const entry of entries) {
      const name = typeof entry === 'string' ? entry : entry.name;
      if (!name.endsWith('.json') || name.endsWith('.name.json')) continue;
      const model = await inspect(name.slice(0, -5));
      if (model) models.push(model);
    }
    return models.sort((a, b) => a.id.localeCompare(b.id));
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
    } catch (error) {
      await fs.rm(temporary, { force: true }).catch(() => {});
      throw new LocalModelStoreError(`cannot rename model ${id}: ${error.message}`, 'MODEL_WRITE_FAILED');
    }
    return { ...current, name: name.trim() };
  }

  return Object.freeze({ inspect, list, register, setState, lock, unlock, remove, rename: renameModel });
}
