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
    throw new ProcessPolicyError('Invalid executable', 'EXECUTABLE_INVALID');
  }
  return command.trim().toLowerCase();
}

function validateArgs(args) {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string' || arg.includes('\0'))) {
    throw new ProcessPolicyError('Invalid command arguments', 'ARGS_INVALID');
  }
}

/**
 * Tokenizza una dichiarazione di comando senza passare da una shell. Le
 * virgolette servono solo a conservare un argomento (ad esempio il codice di
 * `node -e`); metacaratteri di shell fuori dalle virgolette sono rifiutati.
 */
export function parseProcessCommand(command) {
  if (typeof command !== 'string' || command.trim() === '' || command.includes('\0')) {
    throw new ProcessPolicyError('Invalid command', 'COMMAND_INVALID');
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
      throw new ProcessPolicyError('The command cannot contain shell operators', 'SHELL_SYNTAX_NOT_ALLOWED');
    }
    if (!quoted && /\s/u.test(char)) {
      if (token) { tokens.push(token); token = ''; }
      continue;
    }
    token += char;
  }
  if (escaping) token += '\\';
  if (quoted) throw new ProcessPolicyError('Unbalanced quotes', 'COMMAND_INVALID');
  if (token) tokens.push(token);
  if (tokens.length === 0) throw new ProcessPolicyError('Invalid command', 'COMMAND_INVALID');
  return tokens;
}

function validateTimeout(timeout) {
  if (timeout === undefined) return;
  if (!Number.isInteger(timeout) || timeout <= 0) {
    throw new ProcessPolicyError('Invalid maximum command duration', 'TIMEOUT_INVALID');
  }
}

function buildEnvironment(env, allowlist) {
  if (env !== undefined && (env === null || typeof env !== 'object' || Array.isArray(env))) {
    throw new ProcessPolicyError('Invalid command environment', 'ENV_INVALID');
  }
  const allowed = new Set(allowlist);
  const source = { ...process.env, ...(env ?? {}) };
  return Object.fromEntries(Object.entries(source).filter(([key]) => allowed.has(key)));
}

function validateCwd(cwd, cwdRoot) {
  if (typeof cwd !== 'string' || cwd.length === 0 || cwd.includes('\0') || !isAbsolute(cwd)) {
    throw new ProcessPolicyError('An explicit working folder is required', 'CWD_REQUIRED');
  }
  const resolved = resolve(cwd);
  if (cwdRoot && !isInside(cwdRoot, resolved)) {
    throw new ProcessPolicyError('Working folder outside the authorized area', 'CWD_NOT_ALLOWED');
  }
  return resolved;
}

function validateCaptureLimit(value) {
  if (value === undefined) return DEFAULT_CAPTURE_LIMIT_BYTES;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ProcessPolicyError('Invalid output limit', 'CAPTURE_LIMIT_INVALID');
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
    throw new ProcessPolicyError('Invalid executable path', 'EXECUTABLE_PATH_INVALID');
  }
  if (expectedSha256 !== undefined && !/^[a-f0-9]{64}$/iu.test(expectedSha256)) {
    throw new ProcessPolicyError('Invalid executable digest', 'EXECUTABLE_DIGEST_INVALID');
  }
  const statFn = deps.statFn ?? stat;
  const readFileFn = deps.readFileFn ?? readFile;
  const path = resolve(configuredPath);
  let info;
  try { info = await statFn(path); } catch { throw new ProcessPolicyError('Configured executable not found', 'EXECUTABLE_NOT_FOUND'); }
  if (!info?.isFile?.()) throw new ProcessPolicyError('The configured path is not a file', 'EXECUTABLE_NOT_FILE');
  let sha256 = null;
  if (expectedSha256 !== undefined) {
    const contents = await readFileFn(path);
    sha256 = createHash('sha256').update(contents).digest('hex');
    if (sha256.toLowerCase() !== expectedSha256.toLowerCase()) {
      throw new ProcessPolicyError('The executable digest does not match', 'EXECUTABLE_DIGEST_MISMATCH');
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
  /*
   * ⛔ BC-64 (17/09/2026) — `windowsHide: true` NON nasconde solo la console: libuv lo traduce in
   *   STARTF_USESHOWWINDOW + SW_HIDE, e un programma con finestra che onora quell'avvio nasce INVISIBILE.
   *   Misurato su questa macchina nei due versi con `explorer.exe /select,<file>`: con `true` la finestra di
   *   Esplora esiste ma `Visible=False` (l'owner: «non apre nessuna finestra»), con `false` `Visible=True`.
   *   È lo stesso motivo per cui Node ha revocato il default a `true` (nodejs/node PR #24034, letta il 17/09/2026).
   * ⇒ Il default resta `true` — un processo di servizio non deve far lampeggiare una console — e chi lancia
   *   apposta un programma CHE LA PERSONA DEVE VEDERE lo dichiara qui, per nome, alla nascita della politica.
   */
  finestreVisibili = false,
} = {}) {
  if (typeof finestreVisibili !== 'boolean') throw new ProcessPolicyError('finestreVisibili must be a boolean', 'POLICY_INVALID');
  const approved = new Set(allowedExecutables.map((value) => executableKey(value)));
  if (cwdRoot !== null && (typeof cwdRoot !== 'string' || !isAbsolute(cwdRoot))) {
    throw new ProcessPolicyError('Invalid working folders root', 'CWD_ROOT_INVALID');
  }
  const environmentKeys = [...new Set(envAllowlist)];
  if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
    throw new ProcessPolicyError('Invalid process capabilities', 'CAPABILITIES_INVALID');
  }
  const capabilityRoots = new Map(Object.entries(capabilities).map(([name, root]) => {
    if (typeof name !== 'string' || !name || typeof root !== 'string' || !isAbsolute(root)) {
      throw new ProcessPolicyError('Invalid process capability', 'CAPABILITIES_INVALID');
    }
    return [name, resolve(root)];
  }));

  function prepare(command, args, options = {}, effectiveEnvKeys = environmentKeys) {
    const key = executableKey(command);
    if (!approved.has(key)) throw new ProcessPolicyError('Executable not authorized', 'EXECUTABLE_NOT_ALLOWED');
    validateArgs(args);
    if (options.shell === true) throw new ProcessPolicyError('Commands through a shell are not allowed', 'SHELL_NOT_ALLOWED');
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
        windowsHide: !finestreVisibili,
      },
    };
  }

  function prepareApprovedProcess({ executable, args = [], cwd, envKeys, timeoutMs, signal, capability, captureLimitBytes, env } = {}) {
    if (typeof capability !== 'string' || capability.trim() === '') {
      throw new ProcessPolicyError('An explicit capability is required', 'CAPABILITY_REQUIRED');
    }
    const capabilityRoot = capabilityRoots.get(capability);
    if (!capabilityRoot) throw new ProcessPolicyError('Capability not authorized', 'CAPABILITY_NOT_ALLOWED');
    const requestedCwd = validateCwd(cwd, capabilityRoot);
    if (!existsSync(requestedCwd)) {
      throw new ProcessPolicyError('Working folder not found', 'CWD_NOT_FOUND');
    }
    const keys = envKeys === undefined ? environmentKeys : envKeys;
    if (!Array.isArray(keys) || keys.some((key) => typeof key !== 'string')) {
      throw new ProcessPolicyError('Invalid environment list', 'ENV_KEYS_INVALID');
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
    // Costruire una sola volta: il default generale reintrodurrebbe chiavi
    // del padre che questa richiesta ha escluso (PR23, RIPRESA-SEC23).
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
      throw new ProcessPolicyError(`Cannot start the command: ${error?.message || 'unknown error'}`, 'PROCESS_START_FAILED');
    }
    if (!child || typeof child.once !== 'function') {
      throw new ProcessPolicyError('The process did not return a valid channel', 'PROCESS_START_FAILED');
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
          rejectResult(new ProcessPolicyError(`Process not available: ${spawnError?.message || 'unknown error'}`, 'PROCESS_FAILED'));
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
    throw new ProcessPolicyError('A process policy is required', 'POLICY_REQUIRED');
  }
  return policy.runApprovedProcess(request);
}
