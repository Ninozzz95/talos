/**
 * Browser di directory pre-sessione. La navigazione resta in sola lettura;
 * l'unica mutazione esposta è `createFolder`, azione esplicita del picker e
 * confinata dagli stessi gate di root/reparse usati da `browse`.
 *
 * È separato dal file tree operativo perché prima di avviare una sessione non
 * devono esistere CRUD, drag/drop, allegati o letture di contenuto. Il browser
 * legge un livello per richiesta e il vero gate di sicurezza resta
 * `custom-task.mjs`: questo adapter non concede permessi.
 */
import { lstat, mkdir, readdir, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';

const MAX_PATH_LENGTH = 1024;
const MAX_NAME_LENGTH = 255;
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

export class WorkspaceBrowserError extends Error {
  constructor(message, code = 'WORKSPACE_NOT_AVAILABLE') {
    super(message);
    this.name = 'WorkspaceBrowserError';
    this.code = code;
  }
}

function failQuery() {
  throw new WorkspaceBrowserError('Choose a folder within the shown disk.', 'QUERY_INVALID');
}

function containsTraversal(path) {
  return path.split(/[\\/]+/).includes('..');
}

function validateFolderName(name) {
  if (typeof name !== 'string'
    || name.length === 0
    || name.length > MAX_NAME_LENGTH
    || name !== name.trim()
    || name === '.'
    || name === '..'
    || /[\\/:*?"<>|\0]/u.test(name)
    || /[. ]$/u.test(name)
    || WINDOWS_RESERVED_NAME.test(name)) failQuery();
  return name;
}

function inside(root, candidate) {
  const difference = relative(root, candidate);
  return difference === ''
    || (difference !== '..' && !difference.startsWith(`..${sep}`) && !isAbsolute(difference));
}

function pathKey(path) {
  return resolve(path).replace(/[\\/]+$/, '').toLocaleLowerCase('en-US');
}

function projectMap(projectDirectories) {
  const result = new Map();
  for (const project of projectDirectories ?? []) {
    if (!project || typeof project.id !== 'string' || typeof project.percorso !== 'string' || !isAbsolute(project.percorso)) continue;
    result.set(pathKey(project.percorso), { id: project.id, name: project.nome || project.id, path: resolve(project.percorso) });
  }
  return result;
}

async function assertNoSymbolicLinkSegments(root, candidate, lstatFn) {
  const difference = relative(root, candidate);
  const segments = difference === '' ? [] : difference.split(sep).filter(Boolean);
  let current = root;
  const paths = [root];
  for (const segment of segments) {
    current = join(current, segment);
    paths.push(current);
  }
  try {
    for (const path of paths) {
      const stats = await lstatFn(path);
      if (stats?.isSymbolicLink?.()) failQuery();
    }
  } catch (error) {
    if (error instanceof WorkspaceBrowserError) throw error;
    throw new WorkspaceBrowserError('This folder is not available. Choose another or check Doctor.');
  }
}

/*
 * ⭐ 29/10/2026 — TUTTI I DISCHI, NON SOLO C: (owner: «prevedi anche computer con più dischi non solo il C»). Prima il browser aveva una
 *   radice sola, il disco del server (`parse(process.cwd()).root`): una cartella su D: non si poteva scegliere.
 * ⇒ Su Windows si provano le lettere A-Z con `stat` in parallelo, ognuna con un tetto di tempo (un'unità di rete lenta non ferma le
 *   altre). La finestra «Nessun disco nell'unità» di un lettore vuoto non compare: libuv imposta `SEM_FAILCRITICALERRORS` all'avvio
 *   (`src/win/core.c`, `uv__init`, letto il 29/10/2026). Il disco di sistema viene per primo. Fuori da Windows la radice è «/».
 */
const TETTO_DISCO_MS = 1500;
export async function elencaDischi({ piattaforma = process.platform, statFn = stat, sistema = parse(process.env.SystemRoot || process.cwd()).root, tettoMs = TETTO_DISCO_MS } = {}) {
  if (piattaforma !== 'win32') return ['/'];
  const lettere = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const prova = (lettera) => new Promise((ok) => {
    const radice = `${lettera}:\\`;
    const timer = setTimeout(() => ok(null), tettoMs);
    Promise.resolve().then(() => statFn(radice)).then((st) => { clearTimeout(timer); ok(st?.isDirectory?.() ? radice : null); }, () => { clearTimeout(timer); ok(null); });
  });
  const trovati = (await Promise.all(lettere.map(prova))).filter(Boolean);
  const chiave = (r) => r.toUpperCase();
  const primo = trovati.find((r) => chiave(r) === chiave(sistema));
  return primo ? [primo, ...trovati.filter((r) => r !== primo)] : trovati;
}

/**
 * @param {object} deps
 * @param {string} [deps.rootDir] una radice sola (com'era prima del 29/10); `rootsFn` la sostituisce
 * @param {() => Promise<string[]>} [deps.rootsFn] le radici sfogliabili, la prima è quella che si apre di serie
 * @param {Array<{id:string,nome?:string,percorso:string}>} [deps.projectDirectories]
 * @param {()=>Array<{etichetta:string,percorso:string,tipo?:string}>} [deps.recommendedDirectoriesFn]
 * @param {typeof lstat} [deps.lstatFn]
 * @param {typeof mkdir} [deps.mkdirFn]
 * @param {typeof readdir} [deps.readdirFn]
 * @param {typeof realpath} [deps.realpathFn]
 */
export function createWorkspaceBrowser({
  rootDir,
  rootsFn = null,
  projectDirectories = [],
  recommendedDirectoriesFn = () => [],
  lstatFn = lstat,
  mkdirFn = mkdir,
  readdirFn = readdir,
  realpathFn = realpath,
} = {}) {
  const radiceValida = (r) => typeof r === 'string' && isAbsolute(r) && !r.includes('\0') && r.length <= MAX_PATH_LENGTH;
  if (typeof rootsFn !== 'function' && !radiceValida(rootDir)) failQuery();
  const projects = projectMap(projectDirectories);
  /* Le radici si rileggono a ogni apertura del browser (un disco USB collegato dopo compare), mai più di una volta ogni 5 s. */
  let radiciInCache = null;
  let radiciLette = 0;
  async function radici() {
    if (typeof rootsFn !== 'function') return [resolve(rootDir)];
    if (radiciInCache && Date.now() - radiciLette < 5000) return radiciInCache;
    let elenco = [];
    try { elenco = (await rootsFn()) ?? []; } catch { elenco = []; }
    elenco = elenco.filter(radiceValida).map((r) => resolve(r));
    if (!elenco.length && radiceValida(rootDir)) elenco = [resolve(rootDir)];
    if (!elenco.length) throw new WorkspaceBrowserError('No disk is available. Check Doctor.');
    radiciInCache = elenco; radiciLette = Date.now();
    return elenco;
  }
  /** La radice che contiene il percorso: la più lunga, se una sta dentro l'altra. */
  const radiceDi = (elenco, percorso) => elenco.filter((r) => inside(r, percorso)).sort((a, b) => b.length - a.length)[0] ?? null;

  function recommendations(root) {
    const result = [];
    const seen = new Set();
    const add = ({ label, path, kind, projectId = null }) => {
      // un consigliato su un altro disco resta: le radici sono tutte sfogliabili
      if (typeof path !== 'string' || !isAbsolute(path) || path.length > MAX_PATH_LENGTH || !root.some((r) => inside(r, resolve(path)))) return;
      const key = pathKey(path);
      if (seen.has(key)) return;
      seen.add(key);
      result.push({ label, path: resolve(path), kind, projectId });
    };
    for (const project of projects.values()) add({ label: project.name, path: project.path, kind: 'project', projectId: project.id });
    let suggested = [];
    try { suggested = recommendedDirectoriesFn() ?? []; } catch { suggested = []; }
    for (const item of suggested) {
      if (!item || typeof item.etichetta !== 'string') continue;
      const project = projects.get(typeof item.percorso === 'string' ? pathKey(item.percorso) : '');
      add({
        label: item.etichetta,
        path: item.percorso,
        kind: project ? 'project' : (item.tipo === 'recent' ? 'recent' : 'known'),
        projectId: project?.id ?? null,
      });
    }
    return result;
  }

  return {
    async browse(requestedPath) {
      const elenco = await radici();
      const input = requestedPath === undefined ? elenco[0] : requestedPath;
      if (typeof input !== 'string'
        || input.length === 0
        || input.length > MAX_PATH_LENGTH
        || input.includes('\0')
        || !isAbsolute(input)
        || containsTraversal(input)) failQuery();
      const candidate = resolve(input);
      const lexicalRoot = radiceDi(elenco, candidate);
      if (!lexicalRoot) failQuery();
      await assertNoSymbolicLinkSegments(lexicalRoot, candidate, lstatFn);

      let canonicalRoot;
      let canonicalCandidate;
      try {
        [canonicalRoot, canonicalCandidate] = await Promise.all([realpathFn(lexicalRoot), realpathFn(candidate)]);
      } catch {
        throw new WorkspaceBrowserError('This folder is not available. Choose another or check Doctor.');
      }
      if (!inside(canonicalRoot, canonicalCandidate)) failQuery();

      let entries;
      try {
        entries = await readdirFn(canonicalCandidate, { withFileTypes: true });
      } catch {
        throw new WorkspaceBrowserError('This folder is not available. Choose another or check Doctor.');
      }
      const items = entries
        .filter((entry) => entry?.isDirectory?.() && !entry?.isSymbolicLink?.())
        .map((entry) => {
          const path = join(canonicalCandidate, entry.name);
          return { name: entry.name, path, projectId: projects.get(pathKey(path))?.id ?? null };
        })
        .sort((left, right) => left.name.localeCompare(right.name, 'it', { sensitivity: 'base' }));

      return {
        root: canonicalRoot,
        path: canonicalCandidate,
        parent: pathKey(canonicalCandidate) === pathKey(canonicalRoot) ? null : dirname(canonicalCandidate),
        items,
        recommended: recommendations(elenco),
        roots: elenco.map((radice) => ({ path: radice, label: radice.replace(/[\\/]+$/u, '') || radice })),
      };
    },

    async createFolder(parentPath, name) {
      validateFolderName(name);
      if (typeof parentPath !== 'string'
        || parentPath.length === 0
        || parentPath.length > MAX_PATH_LENGTH
        || parentPath.includes('\0')
        || !isAbsolute(parentPath)
        || containsTraversal(parentPath)) failQuery();
      const lexicalParent = resolve(parentPath);
      const lexicalRoot = radiceDi(await radici(), lexicalParent);
      if (!lexicalRoot) failQuery();
      await assertNoSymbolicLinkSegments(lexicalRoot, lexicalParent, lstatFn);

      let canonicalRoot;
      let canonicalParent;
      try {
        [canonicalRoot, canonicalParent] = await Promise.all([realpathFn(lexicalRoot), realpathFn(lexicalParent)]);
      } catch {
        throw new WorkspaceBrowserError('This folder is not available. Choose another or check Doctor.');
      }
      if (!inside(canonicalRoot, canonicalParent)) failQuery();
      const candidate = join(canonicalParent, name);
      if (!inside(canonicalRoot, candidate) || candidate.length > MAX_PATH_LENGTH) failQuery();
      try {
        await mkdirFn(candidate, { recursive: false });
      } catch (error) {
        if (error?.code === 'EEXIST') {
          throw new WorkspaceBrowserError('A file or folder with this name already exists.', 'WORKSPACE_ALREADY_EXISTS');
        }
        throw new WorkspaceBrowserError('Cannot create folder here. Check permissions and try again.');
      }
      return { name, path: candidate };
    },
  };
}
