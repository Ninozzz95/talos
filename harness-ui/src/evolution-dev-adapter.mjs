// Trusted development bootstrap only. Not registered as a model tool or HTTP route.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { open, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { EvolutionDevError, runDevSession } from './evolution-dev/session.mjs';
export { EvolutionDevError } from './evolution-dev/session.mjs';
const keys = new Set(['enabled', 'supervisorPath', 'supervisorSha256', 'workerSha256']);
const hashPattern = /^[a-f0-9]{64}$/;
function required(ok, code) { if (!ok) throw new EvolutionDevError(code); }
async function checkBinary(filename, expected) {
  required(!(await lstat(filename)).isSymbolicLink(), 'BINARY_LINK_REJECTED');
  const resolved = await realpath(filename);
  const file = await open(resolved, 'r');
  try {
    const before = await file.stat();
    required(before.isFile() && before.size > 0 && before.size <= 512 * 1024 * 1024, 'BINARY_SIZE');
    const hash = createHash('sha256'), buffer = Buffer.alloc(64 * 1024);
    let offset = 0;
    while (offset < before.size) {
      const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, before.size - offset), offset);
      required(bytesRead > 0, 'BINARY_CHANGED'); offset += bytesRead; hash.update(buffer.subarray(0, bytesRead));
    }
    const after = await file.stat();
    required(before.size === after.size && before.mtimeMs === after.mtimeMs
      && before.ctimeMs === after.ctimeMs && hash.digest('hex') === expected, 'BINARY_HASH_MISMATCH');
    return resolved;
  } finally { await file.close(); }
}
function environment() {
  const result = {};
  for (const key of ['SystemRoot', 'LOCALAPPDATA', 'TEMP', 'TMP']) {
    const matching = Object.keys(process.env).filter(k => k.toLowerCase() === key.toLowerCase());
    required(matching.length === 1, 'BOOTSTRAP_ENV_MISSING_OR_AMBIGUOUS');
    const value = process.env[matching[0]];
    required(typeof value === 'string' && value.length > 0 && !value.includes('\0')
      && path.win32.isAbsolute(value), 'BOOTSTRAP_ENV_INVALID');
    result[key] = value;
  }
  return result;
}
/**
 * Creates a disabled-by-default fixed-fixture adapter. Hashes and paths belong
 * to reviewed developer bootstrap, never chat/tool payloads. No environment
 * variable enables it. Invoke has no guest bytes, host paths or authority input.
 */
export function createEvolutionDevAdapter(configuration = {}) {
  required(configuration && typeof configuration === 'object' && !Array.isArray(configuration)
    && Object.keys(configuration).every(k => keys.has(k)), 'INVALID_ADAPTER_CONFIG');
  required(configuration.enabled === undefined || typeof configuration.enabled === 'boolean', 'INVALID_ENABLE_FLAG');
  const config = Object.freeze({ ...configuration });
  let busy = false, disposed = false, current;
  return Object.freeze({
    get enabled() { return config.enabled === true && !disposed; },
    async invoke(options = {}) {
      required(!disposed, 'ADAPTER_DISPOSED');
      required(config.enabled === true, 'EVOLUTION_DEV_DISABLED');
      required(options && typeof options === 'object' && !Array.isArray(options)
        && Object.keys(options).every(k => ['signal', 'onReady'].includes(k)), 'INVALID_INVOCATION_OPTIONS');
      const { signal, onReady } = options;
      required(signal === undefined || signal instanceof AbortSignal, 'INVALID_ABORT_SIGNAL');
      required(onReady === undefined || typeof onReady === 'function', 'INVALID_READY_CALLBACK');
      if (signal?.aborted) throw new EvolutionDevError('CANCELLED_BEFORE_LAUNCH');
      required(!busy, 'ADAPTER_BUSY');
      required(process.platform === 'win32' && process.arch === 'x64', 'UNSUPPORTED_DEV_HOST');
      required(typeof config.supervisorPath === 'string' && path.win32.isAbsolute(config.supervisorPath)
        && !config.supervisorPath.includes('\0')
        && path.win32.basename(config.supervisorPath) === 'talos-supervisor-prototype.exe', 'INVALID_SUPERVISOR_PATH');
      required(typeof config.supervisorSha256 === 'string' && typeof config.workerSha256 === 'string'
        && hashPattern.test(config.supervisorSha256) && hashPattern.test(config.workerSha256), 'EXPECTED_HASH_REQUIRED');
      busy = true; current = new AbortController();
      const local = current, forward = () => local.abort();
      signal?.addEventListener('abort', forward, { once: true });
      try {
        if (signal?.aborted) local.abort();
        const executable = await checkBinary(config.supervisorPath, config.supervisorSha256);
        await checkBinary(path.join(path.dirname(executable), 'talos-extension-worker.exe'), config.workerSha256);
        if (local.signal.aborted) throw new EvolutionDevError('CANCELLED_BEFORE_LAUNCH');
        const env = environment();
        return await runDevSession({
          launch: () => spawn(executable, ['--dev-stdio', config.workerSha256], {
            cwd: path.dirname(executable), env, shell: false, windowsHide: true,
            detached: false, stdio: ['pipe', 'pipe', 'pipe'],
          }),
          workerDigest: Buffer.from(config.workerSha256, 'hex'), signal: local.signal, onReady,
        });
      } catch (error) {
        if (error instanceof EvolutionDevError) throw error;
        throw new EvolutionDevError('BOOTSTRAP_FAILED');
      } finally { signal?.removeEventListener('abort', forward); busy = false; current = undefined; }
    },
    dispose() { disposed = true; current?.abort(); },
  });
}
