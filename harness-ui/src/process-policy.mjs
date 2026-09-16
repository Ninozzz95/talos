/**
 * Policy boundary for every host process started by the desktop harness.
 *
 * The adapter deliberately keeps the Node child_process API behind a small,
 * typed surface: callers must name an allowed executable and an explicit
 * working directory; shell execution is never accepted; environment values
 * are allowlisted. The underlying spawn/exec implementation remains
 * injectable so tests never need to start a real process.
 */
import { createHash } from 'node:crypto';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const DEFAULT_ENV_ALLOWLIST = Object.freeze([
  'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'COMSPEC',
  'HOME', 'USERPROFILE', 'TMP', 'TEMP', 'LANG', 'LC_ALL',
]);
const DEFAULT_CAPTURE_LIMIT_BYTES = 64 * 1024;

export class ProcessPolicyError extends Error {
  constructor(message, code = 'PROCESS_POLICY_REJECTED') {
    super(message);
    this.name = 'ProcessPolicyError';
    this.code = code;
  }
}

function isInside(root, candidate) {
  const difference = relative(resolve(root), resolve(candidate));
  return difference === ''
    || (difference !== '..' && !difference.startsWith(`..${sep}`) && !isAbsolute(difference));
}

function executableKey(command) {
  if (typeof command !== 'string' || command.trim().length === 0 || command.includes('\0')) {
    throw new ProcessPolicyError('Eseguibile non valido', 'EXECUTABLE_INVALID');
  }
  return command.trim().toLowerCase();
}

function validateArgs(args) {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string' || arg.includes('\0'))) {
    throw new ProcessPolicyError('Argomenti del comando non validi', 'ARGS_INVALID');
  }
}

/**
 * Tokenizza una dichiarazione di comando senza passare da una shell. Le
 * virgolette servono solo a conservare un argomento (ad esempio il codice di
 * `node -e`); metacaratteri di shell fuori dalle virgolette sono rifiutati.
 */
export function parseProcessCommand(command) {
  if (typeof command !== 'string' || command.trim() === '' || command.includes('\0')) {
    throw new ProcessPolicyError('Comando non valido', 'COMMAND_INVALID');
  }
  const tokens = [];
  let token = '';
  let quoted = false;
  let escaping = false;
  for (const char of command.trim()) {
    if (escaping) { token += char; escaping = false; continue; }
    if (char === '\\' && quoted) { escaping = true; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (!quoted && /[&|;<>()]/u.test(char)) {
      throw new ProcessPolicyError('Il comando non può contenere operatori di shell', 'SHELL_SYNTAX_NOT_ALLOWED');
    }
    if (!quoted && /\s/u.test(char)) {
      if (token) { tokens.push(token); token = ''; }
      continue;
    }
    token += char;
  }
  if (escaping) token += '\\';
  if (quoted) throw new ProcessPolicyError('Virgolette non bilanciate', 'COMMAND_INVALID');
  if (token) tokens.push(token);
  if (tokens.length === 0) throw new ProcessPolicyError('Comando non valido', 'COMMAND_INVALID');
  return tokens;
}

function validateTimeout(timeout) {
  if (timeout === undefined) return;
  if (!Number.isInteger(timeout) || timeout <= 0) {
    throw new ProcessPolicyError('Durata massima del comando non valida', 'TIMEOUT_INVALID');
  }
}

function buildEnvironment(env, allowlist) {
  if (env !== undefined && (env === null || typeof env !== 'object' || Array.isArray(env))) {
    throw new ProcessPolicyError('Ambiente del comando non valido', 'ENV_INVALID');
  }
  const allowed = new Set(allowlist);
  const source = { ...process.env, ...(env ?? {}) };
  return Object.fromEntries(Object.entries(source).filter(([key]) => allowed.has(key)));
}

function validateCwd(cwd, cwdRoot) {
  if (typeof cwd !== 'string' || cwd.length === 0 || cwd.includes('\0') || !isAbsolute(cwd)) {
    throw new ProcessPolicyError('Cartella di lavoro esplicita richiesta', 'CWD_REQUIRED');
  }
  const resolved = resolve(cwd);
  if (cwdRoot && !isInside(cwdRoot, resolved)) {
    throw new ProcessPolicyError('Cartella di lavoro fuori dall’area autorizzata', 'CWD_NOT_ALLOWED');
  }
  return resolved;
}

function validateCaptureLimit(value) {
  if (value === undefined) return DEFAULT_CAPTURE_LIMIT_BYTES;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ProcessPolicyError('Limite output non valida', 'CAPTURE_LIMIT_INVALID');
  }
  return value;
}

function appendBounded(current, chunk, limit) {
  const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
  const remaining = limit - Buffer.byteLength(current, 'utf8');
  if (remaining <= 0) return { value: current, truncated: true };
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.byteLength <= remaining) return { value: current + text, truncated: false };
  return { value: current + bytes.subarray(0, remaining).toString('utf8'), truncated: true };
}

function terminateChild(child) {
  if (!child || typeof child.kill !== 'function') return;
  try { child.kill('SIGTERM'); } catch { /* il processo può essersi chiuso tra controllo e kill */ }
}

/**
 * Risolve un binario configurato soltanto se è un file assoluto realmente
 * presente. Il digest opzionale rende il pin verificabile senza esporre il
 * contenuto del file al chiamante.
 */
export async function resolveApprovedExecutable({ id, configuredPath, expectedSha256 } = {}, deps = {}) {
  if (typeof id !== 'string' || id.trim() === '' || typeof configuredPath !== 'string'
    || !configuredPath.trim() || !isAbsolute(configuredPath) || configuredPath.includes('\0')) {
    throw new ProcessPolicyError('Percorso dell’eseguibile non valido', 'EXECUTABLE_PATH_INVALID');
  }
  if (expectedSha256 !== undefined && !/^[a-f0-9]{64}$/iu.test(expectedSha256)) {
    throw new ProcessPolicyError('Digest dell’eseguibile non valido', 'EXECUTABLE_DIGEST_INVALID');
  }
  const statFn = deps.statFn ?? stat;
  const readFileFn = deps.readFileFn ?? readFile;
  const path = resolve(configuredPath);
  let info;
  try { info = await statFn(path); } catch { throw new ProcessPolicyError('Eseguibile configurato non trovato', 'EXECUTABLE_NOT_FOUND'); }
  if (!info?.isFile?.()) throw new ProcessPolicyError('Il percorso configurato non è un file', 'EXECUTABLE_NOT_FILE');
  let sha256 = null;
  if (expectedSha256 !== undefined) {
    const contents = await readFileFn(path);
    sha256 = createHash('sha256').update(contents).digest('hex');
    if (sha256.toLowerCase() !== expectedSha256.toLowerCase()) {
      throw new ProcessPolicyError('Digest dell’eseguibile non corrisponde', 'EXECUTABLE_DIGEST_MISMATCH');
    }
  }
  return Object.freeze({ id: id.trim(), path, sha256 });
}

/**
 * @param {{allowedExecutables?:string[], cwdRoot?:string|null, capabilities?:Record<string,string>, envAllowlist?:string[], spawnFn?:typeof spawn, execFileFn?:typeof execFile, execFileSyncFn?:typeof execFileSync}} [options]
 */
export function createProcessPolicy({
  allowedExecutables = [],
  cwdRoot = null,
  capabilities = {},
  envAllowlist = DEFAULT_ENV_ALLOWLIST,
  spawnFn = spawn,
  execFileFn = execFile,
  execFileSyncFn = execFileSync,
} = {}) {
  const approved = new Set(allowedExecutables.map((value) => executableKey(value)));
  if (cwdRoot !== null && (typeof cwdRoot !== 'string' || !isAbsolute(cwdRoot))) {
    throw new ProcessPolicyError('Radice delle cartelle di lavoro non valida', 'CWD_ROOT_INVALID');
  }
  const environmentKeys = [...new Set(envAllowlist)];
  if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
    throw new ProcessPolicyError('Capability di processo non valide', 'CAPABILITIES_INVALID');
  }
  const capabilityRoots = new Map(Object.entries(capabilities).map(([name, root]) => {
    if (typeof name !== 'string' || !name || typeof root !== 'string' || !isAbsolute(root)) {
      throw new ProcessPolicyError('Capability di processo non valida', 'CAPABILITIES_INVALID');
    }
    return [name, resolve(root)];
  }));

  function prepare(command, args, options = {}, effectiveEnvKeys = environmentKeys) {
    const key = executableKey(command);
    if (!approved.has(key)) throw new ProcessPolicyError('Eseguibile non autorizzato', 'EXECUTABLE_NOT_ALLOWED');
    validateArgs(args);
    if (options.shell === true) throw new ProcessPolicyError('I comandi tramite shell non sono consentiti', 'SHELL_NOT_ALLOWED');
    const cwd = validateCwd(options.cwd, cwdRoot);
    validateTimeout(options.timeout);
    return {
      command,
      args,
      options: {
        ...options,
        cwd,
        shell: false,
        env: buildEnvironment(options.env, effectiveEnvKeys),
        windowsHide: true,
      },
    };
  }

  function prepareApprovedProcess({ executable, args = [], cwd, envKeys, timeoutMs, signal, capability, captureLimitBytes, env } = {}) {
    if (typeof capability !== 'string' || capability.trim() === '') {
      throw new ProcessPolicyError('Capability esplicita richiesta', 'CAPABILITY_REQUIRED');
    }
    const capabilityRoot = capabilityRoots.get(capability);
    if (!capabilityRoot) throw new ProcessPolicyError('Capability non autorizzata', 'CAPABILITY_NOT_ALLOWED');
    const requestedCwd = validateCwd(cwd, capabilityRoot);
    if (!existsSync(requestedCwd)) {
      throw new ProcessPolicyError('Cartella di lavoro non trovata', 'CWD_NOT_FOUND');
    }
    const keys = envKeys === undefined ? environmentKeys : envKeys;
    if (!Array.isArray(keys) || keys.some((key) => typeof key !== 'string')) {
      throw new ProcessPolicyError('Elenco ambiente non valido', 'ENV_KEYS_INVALID');
    }
    const allowedKeys = keys.filter((key) => environmentKeys.includes(key));
    const options = {
      cwd: requestedCwd,
      env,
      timeout: timeoutMs,
      signal,
      captureLimitBytes: validateCaptureLimit(captureLimitBytes),
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    };
    // Filter once with the request/policy intersection. Rebuilding from process.env
    // with the policy-wide keys would restore variables this request excluded.
    const prepared = prepare(executable, args, options, allowedKeys);
    return { ...prepared, capability };
  }

  async function runApprovedProcess(request = {}) {
    const prepared = prepareApprovedProcess(request);
    const limit = prepared.options.captureLimitBytes;
    let child;
    try {
      child = spawnFn(prepared.command, prepared.args, prepared.options);
    } catch (error) {
      throw new ProcessPolicyError(`Impossibile avviare il comando: ${error?.message || 'errore sconosciuto'}`, 'PROCESS_START_FAILED');
    }
    if (!child || typeof child.once !== 'function') {
      throw new ProcessPolicyError('Il processo non ha restituito un canale valido', 'PROCESS_START_FAILED');
    }
    return new Promise((resolveResult, rejectResult) => {
      let stdout = '';
      let stderr = '';
      let outputTruncated = false;
      let timedOut = false;
      let aborted = false;
      let settled = false;
      let spawnError = null;
      let timer;
      let onAbort;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (prepared.options.signal && onAbort) prepared.options.signal.removeEventListener('abort', onAbort);
        child.stdout?.destroy?.();
        child.stderr?.destroy?.();
      };
      const finish = (code = null, signalValue = null) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolveResult({ code, signal: signalValue, stdout, stderr, outputTruncated, timedOut, aborted });
      };
      const capture = (stream, chunk) => {
        const next = appendBounded(stream === 'stdout' ? stdout : stderr, chunk, limit);
        if (stream === 'stdout') stdout = next.value; else stderr = next.value;
        if (next.truncated) {
          outputTruncated = true;
          terminateChild(child);
        }
      };
      child.stdout?.on('data', (chunk) => capture('stdout', chunk));
      child.stderr?.on('data', (chunk) => capture('stderr', chunk));
      child.once('close', (code, signalValue) => {
        if (spawnError && spawnError.code !== 'ENOENT') {
          if (settled) return;
          settled = true;
          cleanup();
          rejectResult(new ProcessPolicyError(`Processo non disponibile: ${spawnError?.message || 'errore sconosciuto'}`, 'PROCESS_FAILED'));
          return;
        }
        finish(spawnError?.code === 'ENOENT' ? -1 : code, spawnError?.code === 'ENOENT' ? 'ENOENT' : signalValue);
      });
      child.once('error', (error) => {
        if (settled) return;
        spawnError = error;
        // Su Windows un avvio fallito può lasciare un handle del job anche
        // dopo l'evento error; il processo non deve restare orfano mentre
        // attendiamo il close definitivo.
        child.unref?.();
      });
      if (Number.isInteger(prepared.options.timeout) && prepared.options.timeout > 0) {
        timer = setTimeout(() => { timedOut = true; terminateChild(child); }, prepared.options.timeout);
        timer.unref?.();
      }
      if (prepared.options.signal) {
        onAbort = () => { aborted = true; terminateChild(child); };
        if (prepared.options.signal.aborted) onAbort();
        else prepared.options.signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  return Object.freeze({
    spawn(command, args = [], options = {}) {
      const prepared = prepare(command, args, options);
      return spawnFn(prepared.command, prepared.args, prepared.options);
    },
    execFile(command, args = [], options = {}, callback) {
      const prepared = prepare(command, args, options);
      return execFileFn(prepared.command, prepared.args, prepared.options, callback);
    },
    execFileSync(command, args = [], options = {}) {
      const prepared = prepare(command, args, options);
      return execFileSyncFn(prepared.command, prepared.args, prepared.options);
    },
    runApprovedProcess,
  });
}

/** Convenience entry point for callers that already own a configured policy. */
export function runApprovedProcess(request, { policy } = {}) {
  if (!policy || typeof policy.runApprovedProcess !== 'function') {
    throw new ProcessPolicyError('Policy di processo richiesta', 'POLICY_REQUIRED');
  }
  return policy.runApprovedProcess(request);
}
