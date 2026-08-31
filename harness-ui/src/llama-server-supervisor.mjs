import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:net';
import { dirname, isAbsolute } from 'node:path';
import { createProcessPolicy } from './process-policy.mjs';

const LOOPBACK = '127.0.0.1';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_POLL_MS = 100;

export class LlamaServerSupervisorError extends Error {
  constructor(message, code = 'RUNTIME_FAILED') {
    super(message);
    this.name = 'LlamaServerSupervisorError';
    this.code = code;
  }
}

function invalid(message) {
  return new LlamaServerSupervisorError(message, 'RUNTIME_INVALID');
}

async function allocatePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, LOOPBACK, resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createLlamaServerSupervisor({
  binaryPath,
  modelStore = null,
  spawnImpl,
  fetchImpl = fetch,
  portAllocator = allocatePort,
  now = () => new Date(),
  healthTimeoutMs = DEFAULT_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_MS,
} = {}) {
  if (typeof binaryPath !== 'string' || binaryPath.trim() === '') throw new LlamaServerSupervisorError('binaryPath is required', 'RUNTIME_MISCONFIGURED');
  const processPolicy = createProcessPolicy({ allowedExecutables: [binaryPath], spawnFn: spawnImpl });
  let current = null;
  let state = 'unavailable';
  const listeners = new Set();

  function status() {
    if (!current) return { state, runtimeId: 'llama.cpp', observedAt: now().toISOString() };
    return {
      state: current.state,
      runtimeId: 'llama.cpp',
      port: current.port,
      baseUrl: current.baseUrl,
      observedAt: now().toISOString(),
    };
  }

  function emitLog(stream, chunk) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    for (const listener of listeners) {
      try { listener({ stream, text }); } catch { /* observer failure must not affect the process */ }
    }
  }

  function attachProcess(entry) {
    const onClose = () => {
      entry.closed = true;
      if (current === entry && entry.state !== 'stopping') {
        entry.state = 'failed';
        state = 'failed';
      }
    };
    const onError = (error) => {
      entry.failure = error;
      entry.state = 'failed';
      state = 'failed';
    };
    entry.child.once('close', onClose);
    entry.child.once('error', onError);
    entry.child.stdout?.on('data', (chunk) => emitLog('stdout', chunk));
    entry.child.stderr?.on('data', (chunk) => emitLog('stderr', chunk));
  }

  async function health() {
    if (!current) return { ok: false, status: 0, code: 'RUNTIME_UNREACHABLE' };
    try {
      const response = await fetchImpl(`${current.baseUrl}/health`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${current.apiKey}` },
      });
      return { ok: response.ok, status: response.status };
    } catch {
      return { ok: false, status: 0, code: 'RUNTIME_UNREACHABLE' };
    }
  }

  // Internal authenticated transport. The bearer token never leaves this
  // module through status() or logs; runtimes receive only this capability.
  async function request(path, options = {}) {
    if (typeof path !== 'string' || !path.startsWith('/') || path.includes('://')) {
      throw invalid('runtime request path must be relative');
    }
    if (!current || current.state !== 'ready') throw new LlamaServerSupervisorError('runtime is not ready', 'RUNTIME_NOT_READY');
    const headers = new Headers(options.headers ?? {});
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    headers.set('Authorization', `Bearer ${current.apiKey}`);
    return fetchImpl(`${current.baseUrl}${path}`, { ...options, headers });
  }

  async function start({ modelId, modelPath, port } = {}) {
    if (current && ['loading', 'ready', 'stopping'].includes(current.state)) throw new LlamaServerSupervisorError('runtime is already active', 'RUNTIME_ALREADY_RUNNING');
    if (typeof modelPath !== 'string' || !isAbsolute(modelPath)) throw invalid('modelPath must be absolute');
    const selectedPort = port ?? await portAllocator();
    if (!Number.isInteger(selectedPort) || selectedPort < 1024 || selectedPort > 65535) throw invalid('port is invalid');
    let locked = false;
    if (modelStore && modelId) {
      await modelStore.lock(modelId);
      locked = true;
    }
    const apiKey = randomBytes(32).toString('hex');
    const entry = {
      child: null,
      apiKey,
      modelId: modelId ?? null,
      modelPath,
      port: selectedPort,
      baseUrl: `http://${LOOPBACK}:${selectedPort}`,
      state: 'loading',
      startedAt: now().toISOString(),
      failure: null,
      closed: false,
    };
    current = entry;
    state = 'loading';
    try {
      entry.child = processPolicy.spawn(binaryPath, [
        '-m', modelPath,
        ...(modelId ? ['--alias', modelId] : []),
        '--host', LOOPBACK,
        '--port', String(selectedPort),
        '--api-key', apiKey,
        '--jinja',
        '--metrics',
        '--props',
      ], { cwd: isAbsolute(binaryPath) ? dirname(binaryPath) : process.cwd(), shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      if (!entry.child || typeof entry.child.once !== 'function') throw new LlamaServerSupervisorError('spawn did not return a child process', 'RUNTIME_PROCESS_FAILED');
      attachProcess(entry);
      const deadline = Date.now() + healthTimeoutMs;
      while (Date.now() < deadline) {
        if (entry.failure) throw new LlamaServerSupervisorError(`llama-server failed: ${entry.failure.message}`, 'RUNTIME_PROCESS_FAILED');
        const result = await health();
        if (result.ok) {
          entry.state = 'ready';
          state = 'ready';
          return status();
        }
        await wait(pollIntervalMs);
      }
      entry.state = 'failed';
      state = 'failed';
      throw new LlamaServerSupervisorError('llama-server health timeout', 'RUNTIME_HEALTH_TIMEOUT');
    } catch (error) {
      if (entry.child && !entry.closed) entry.child.kill('SIGTERM');
      if (current === entry) current = null;
      state = 'failed';
      if (locked) await modelStore.unlock(modelId).catch(() => {});
      throw error instanceof LlamaServerSupervisorError ? error : new LlamaServerSupervisorError(error.message, 'RUNTIME_PROCESS_FAILED');
    }
  }

  async function stop() {
    const entry = current;
    if (!entry) { state = 'unavailable'; return status(); }
    entry.state = 'stopping';
    state = 'stopping';
    if (entry.child && !entry.closed) entry.child.kill('SIGTERM');
    current = null;
    state = 'unavailable';
    if (modelStore && entry.modelId) await modelStore.unlock(entry.modelId).catch(() => {});
    return status();
  }

  function subscribeLogs(listener) {
    if (typeof listener !== 'function') throw invalid('log listener must be a function');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return Object.freeze({ start, health, request, stop, status, subscribeLogs });
}
