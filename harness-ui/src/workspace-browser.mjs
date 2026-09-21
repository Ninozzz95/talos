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
import { lstat, mkdir, readdir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

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
  throw new WorkspaceBrowserError('Scegli una cartella compresa nel disco mostrato.', 'QUERY_INVALID');
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
    throw new WorkspaceBrowserError('Questa cartella non è disponibile. Scegline un’altra oppure controlla Doctor.');
  }
}

/**
 * @param {object} deps
 * @param {string} deps.rootDir
 * @param {Array<{id:string,nome?:string,percorso:string}>} [deps.projectDirectories]
 * @param {()=>Array<{etichetta:string,percorso:string,tipo?:string}>} [deps.recommendedDirectoriesFn]
 * @param {typeof lstat} [deps.lstatFn]
 * @param {typeof mkdir} [deps.mkdirFn]
 * @param {typeof readdir} [deps.readdirFn]
 * @param {typeof realpath} [deps.realpathFn]
 */
export function createWorkspaceBrowser({
  rootDir,
  projectDirectories = [],
  recommendedDirectoriesFn = () => [],
  lstatFn = lstat,
  mkdirFn = mkdir,
  readdirFn = readdir,
  realpathFn = realpath,
} = {}) {
  if (typeof rootDir !== 'string' || !isAbsolute(rootDir) || rootDir.includes('\0') || rootDir.length > MAX_PATH_LENGTH) failQuery();
  const lexicalRoot = resolve(rootDir);
  const projects = projectMap(projectDirectories);

  function recommendations(root) {
    const result = [];
    const seen = new Set();
    const add = ({ label, path, kind, projectId = null }) => {
      if (typeof path !== 'string' || !isAbsolute(path) || path.length > MAX_PATH_LENGTH || !inside(root, resolve(path))) return;
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
      const input = requestedPath === undefined ? lexicalRoot : requestedPath;
      if (typeof input !== 'string'
        || input.length === 0
        || input.length > MAX_PATH_LENGTH
        || input.includes('\0')
        || !isAbsolute(input)
        || containsTraversal(input)) failQuery();
      const candidate = resolve(input);
      if (!inside(lexicalRoot, candidate)) failQuery();
      await assertNoSymbolicLinkSegments(lexicalRoot, candidate, lstatFn);

      let canonicalRoot;
      let canonicalCandidate;
      try {
        [canonicalRoot, canonicalCandidate] = await Promise.all([realpathFn(lexicalRoot), realpathFn(candidate)]);
      } catch {
        throw new WorkspaceBrowserError('Questa cartella non è disponibile. Scegline un’altra oppure controlla Doctor.');
      }
      if (!inside(canonicalRoot, canonicalCandidate)) failQuery();

      let entries;
      try {
        entries = await readdirFn(canonicalCandidate, { withFileTypes: true });
      } catch {
        throw new WorkspaceBrowserError('Questa cartella non è disponibile. Scegline un’altra oppure controlla Doctor.');
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
        recommended: recommendations(canonicalRoot),
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
      if (!inside(lexicalRoot, lexicalParent)) failQuery();
      await assertNoSymbolicLinkSegments(lexicalRoot, lexicalParent, lstatFn);

      let canonicalRoot;
      let canonicalParent;
      try {
        [canonicalRoot, canonicalParent] = await Promise.all([realpathFn(lexicalRoot), realpathFn(lexicalParent)]);
      } catch {
        throw new WorkspaceBrowserError('Questa cartella non è disponibile. Scegline un’altra oppure controlla Doctor.');
      }
      if (!inside(canonicalRoot, canonicalParent)) failQuery();
      const candidate = join(canonicalParent, name);
      if (!inside(canonicalRoot, candidate) || candidate.length > MAX_PATH_LENGTH) failQuery();
      try {
        await mkdirFn(candidate, { recursive: false });
      } catch (error) {
        if (error?.code === 'EEXIST') {
          throw new WorkspaceBrowserError('Esiste già un file o una cartella con questo nome.', 'WORKSPACE_ALREADY_EXISTS');
        }
        throw new WorkspaceBrowserError('Non riesco a creare la cartella qui. Controlla i permessi e riprova.');
      }
      return { name, path: candidate };
    },
  };
}
