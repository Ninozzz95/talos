import {
  accessSync,
  constants,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { basename, dirname, isAbsolute } from 'node:path';

const DEFAULT_TTL_MS = 15 * 60_000;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const INTENT_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const MAX_PATH_BYTES = 4096;

export class WorkspaceLaunchError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'WorkspaceLaunchError';
    this.code = code;
  }
}

function nowMs(clock) {
  const value = clock();
  return value instanceof Date ? value.getTime() : Number(value);
}

function ensureCredential({ credentialFile, randomBytesFn }) {
  let value;
  try {
    value = readFileSync(credentialFile, 'utf8').trim();
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw new WorkspaceLaunchError('La credenziale del launcher non è leggibile', 'WORKSPACE_LAUNCH_CONFIG_INVALID');
    }
    mkdirSync(dirname(credentialFile), { recursive: true });
    const generated = randomBytesFn(32).toString('hex');
    try {
      writeFileSync(credentialFile, `${generated}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      value = generated;
    } catch (writeError) {
      if (writeError?.code !== 'EEXIST') {
        throw new WorkspaceLaunchError('La credenziale del launcher non può essere salvata', 'WORKSPACE_LAUNCH_CONFIG_INVALID');
      }
      try {
        value = readFileSync(credentialFile, 'utf8').trim();
      } catch {
        throw new WorkspaceLaunchError('La credenziale del launcher non è leggibile', 'WORKSPACE_LAUNCH_CONFIG_INVALID');
      }
    }
  }
  if (!TOKEN_PATTERN.test(value)) {
    throw new WorkspaceLaunchError('La credenziale del launcher è danneggiata', 'WORKSPACE_LAUNCH_CONFIG_INVALID');
  }
  return value;
}

function authenticated(expected, candidate) {
  if (typeof candidate !== 'string' || !TOKEN_PATTERN.test(candidate)) return false;
  const expectedBytes = Buffer.from(expected, 'hex');
  const candidateBytes = Buffer.from(candidate, 'hex');
  return expectedBytes.length === candidateBytes.length && timingSafeEqual(expectedBytes, candidateBytes);
}

function resolveWorkspace(percorso) {
  if (typeof percorso !== 'string' || percorso.trim() === '' || Buffer.byteLength(percorso, 'utf8') > MAX_PATH_BYTES || !isAbsolute(percorso)) {
    throw new WorkspaceLaunchError('Scegli una cartella valida e riprova', 'WORKSPACE_NOT_AVAILABLE');
  }
  let reale;
  try {
    reale = realpathSync(percorso);
    if (!statSync(reale).isDirectory()) throw new Error('not-directory');
    accessSync(reale, constants.R_OK | constants.W_OK);
  } catch {
    throw new WorkspaceLaunchError('La cartella non è disponibile o non consente di lavorarci', 'WORKSPACE_NOT_AVAILABLE');
  }
  return reale;
}

/**
 * Intenzioni brevi e opache fra il launcher Windows e la nuova sessione.
 * Il percorso assoluto non attraversa mai URL, localStorage o risposta HTTP.
 */
export function createWorkspaceLaunchStore({
  credentialFile,
  ttlMs = DEFAULT_TTL_MS,
  clock = Date.now,
  randomBytesFn = randomBytes,
} = {}) {
  if (typeof credentialFile !== 'string' || credentialFile.trim() === '' || !Number.isSafeInteger(ttlMs) || ttlMs < 1_000) {
    throw new WorkspaceLaunchError('Configurazione launcher non valida', 'WORKSPACE_LAUNCH_CONFIG_INVALID');
  }
  const credential = ensureCredential({ credentialFile, randomBytesFn });
  const intents = new Map();

  function publicView(intent) {
    return { id: intent.id, nome: intent.nome, scadeAlle: new Date(intent.expiresAt).toISOString() };
  }

  function cleanup() {
    const current = nowMs(clock);
    for (const [id, intent] of intents) {
      if (intent.expiresAt <= current) intents.delete(id);
    }
  }

  function get(id) {
    cleanup();
    if (typeof id !== 'string' || !INTENT_PATTERN.test(id) || !intents.has(id)) {
      throw new WorkspaceLaunchError('Il collegamento non è più disponibile. Usa di nuovo “Apri cartella con TALOS”.', 'WORKSPACE_LAUNCH_NOT_AVAILABLE');
    }
    return intents.get(id);
  }

  return Object.freeze({
    create({ percorso, credential: candidate } = {}) {
      if (!authenticated(credential, candidate)) {
        throw new WorkspaceLaunchError('Il comando locale non è autorizzato', 'WORKSPACE_LAUNCH_UNAUTHORIZED');
      }
      const reale = resolveWorkspace(percorso);
      cleanup();
      let id;
      do { id = randomBytesFn(24).toString('base64url'); } while (intents.has(id));
      const intent = Object.freeze({
        id,
        nome: basename(reale) || reale,
        percorso: reale,
        expiresAt: nowMs(clock) + ttlMs,
      });
      intents.set(id, intent);
      return publicView(intent);
    },
    inspect(id) {
      return publicView(get(id));
    },
    resolve(id) {
      const intent = get(id);
      return { ...publicView(intent), percorso: intent.percorso };
    },
    consume(id) {
      cleanup();
      if (typeof id !== 'string' || !INTENT_PATTERN.test(id)) return false;
      return intents.delete(id);
    },
  });
}

