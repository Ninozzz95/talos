import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, lstat, open, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { cpus, totalmem, platform, release } from 'node:os';
import { observeResponse } from './local-resume-observer.mjs';
import { compareRequestBodies } from './local-resume-prefix.mjs';

const MiB = 1024 * 1024;
export const RESUME_LIMITS = Object.freeze({ bodyBytes: 4 * MiB, previousBytes: 16 * MiB, previousEntries: 4, queuedBytes: 8 * MiB, diskBytes: 128 * MiB, requests: 256, milestones: 32 });
const NOOP = Object.freeze({
  enabled: false, registryOptions: x => x, wrapRegistry: x => x,
  supervisorOptions: x => x, wrapSupervisor: x => x, wrapRuntime: x => x,
  withRoute: (_route, fn) => fn(), flush: async () => {},
});
const scalar = x => typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null;
const safeState = x => ['unavailable', 'detected', 'loading', 'ready', 'stopping', 'failed'].includes(x) ? x : null;
const ROUTES = new Set(['owner-transport', 'llama-adapter', 'context-counter', 'supervisor-unattributed']);

/** All filesystem work is queued with byte reservations BEFORE retaining the payload. */
export function createBoundedResumeSink({ directory, maxQueuedBytes = RESUME_LIMITS.queuedBytes, maxDiskBytes = RESUME_LIMITS.diskBytes, write = writeFile } = {}) {
  let pending = Promise.resolve(), queuedBytes = 0, reservedBytes = 0, dropped = 0, errors = 0;
  function enqueue(name, text, append) {
    const size = Buffer.byteLength(text);
    if (queuedBytes + size > maxQueuedBytes || reservedBytes + size > maxDiskBytes || errors) { dropped++; return false; }
    queuedBytes += size; reservedBytes += size;
    pending = pending.then(() => write(join(directory, name), text, { encoding: 'utf8', flag: append ? 'a' : 'wx', mode: 0o600 }))
      .catch(() => { errors++; })
      .finally(() => { queuedBytes -= size; });
    return true;
  }
  return {
    record: value => enqueue('events.jsonl', `${JSON.stringify(value)}\n`, true),
    privateRequest: (id, text) => /^[a-z0-9-]+$/i.test(id) && enqueue(`private/${id}.request.json`, text, false),
    async flush() { await pending; return { queuedBytes, reservedBytes, dropped, errors }; },
    stats: () => ({ queuedBytes, reservedBytes, dropped, errors }),
  };
}

/** Dependency-injected core. This records evidence; it never sets an inference flag. */
export function createResumeRecorder({ sink, secret = randomBytes(32), sessionId = null, captureRaw = false, now = () => performance.now(), limits = RESUME_LIMITS } = {}) {
  if (!sink || typeof sink.record !== 'function') throw new TypeError('A diagnostic sink is required');
  const storage = new AsyncLocalStorage();
  const bootId = randomUUID();
  const key = value => typeof value === 'string' ? createHmac('sha256', secret).update(value).digest('hex') : null;
  const previous = new Map();
  let previousBytes = 0, requestCount = 0, processGeneration = 0, currentProcess = null, limitNoted = false;
  const context = () => {
    const s = storage.getStore();
    return { operationId: s?.operationId ?? null, sessionKey: key(s?.sessionId), entry: s?.entry ?? null, operationEntryMs: s?.entryMs ?? null };
  };
  const record = value => { try { sink.record({ schema: 'talos.local-resume.v1', bootId, atMs: now(), ...context(), ...value }); } catch { /* diagnostic failure is not an application error */ } };
  record({ type: 'recorder-start', rawEnabled: captureRaw && Boolean(sessionId), selectedSessionKey: key(sessionId), limits });
  const withRoute = (route, fn) => storage.run({ ...storage.getStore(), route: ROUTES.has(route) ? route : 'supervisor-unattributed' }, fn);
  const snapshotStatus = supervisor => {
    try {
      const s = supervisor.status();
      return { state: safeState(s?.state), modelKey: key(s?.modelId), generation: currentProcess?.generation ?? null, pid: currentProcess?.pid ?? null };
    } catch { return { state: null, modelKey: null, generation: null, pid: null }; }
  };
  function remember(identity, raw, id) {
    if (previous.has(identity)) { previousBytes -= previous.get(identity).bytes; previous.delete(identity); }
    const bytes = Buffer.byteLength(raw);
    while (previous.size && (previous.size >= limits.previousEntries || previousBytes + bytes > limits.previousBytes)) {
      const old = previous.keys().next().value;
      previousBytes -= previous.get(old).bytes; previous.delete(old);
    }
    if (bytes <= limits.previousBytes) { previous.set(identity, { raw, bytes, id }); previousBytes += bytes; }
  }
  function requestSnapshot(options, id, route) {
    const raw = options?.body;
    const info = { bodyBytes: typeof raw === 'string' ? Buffer.byteLength(raw) : null, bodyKey: null, requestModelKey: null, capture: 'not-requested', controls: {}, prefix: null, previousRequestId: null };
    if (typeof raw !== 'string' || info.bodyBytes > limits.bodyBytes) { info.capture = 'unsupported-or-over-limit'; return info; }
    let body;
    try { body = JSON.parse(raw); } catch { info.capture = 'invalid-json'; return info; }
    info.bodyKey = key(raw); info.requestModelKey = key(body?.model);
    for (const name of ['cache_prompt', 'n_cache_reuse', 'id_slot', 'max_tokens', 'n_predict', 'return_progress', 'stream']) {
      const v = body?.[name];
      info.controls[name] = typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) ? v : null;
    }
    // No contents are stored outside an explicitly identified session, even in memory.
    const currentSession = storage.getStore()?.sessionId;
    if (!sessionId || currentSession !== sessionId) { info.capture = 'outside-selected-session'; return info; }
    const identity = `${key(currentSession)}:${route}:${info.requestModelKey}`;
    const old = previous.get(identity);
    if (old) { info.prefix = compareRequestBodies(old.raw, raw); info.previousRequestId = old.id; }
    remember(identity, raw, id);
    if (captureRaw) {
      try { info.capture = sink.privateRequest(id, raw) ? 'queued-private' : 'dropped'; } catch { info.capture = 'write-error'; }
    }
    return info;
  }
  function wrapSupervisor(supervisor) {
    return Object.freeze({ ...supervisor,
      async start(options) {
        const before = snapshotStatus(supervisor);
        record({ type: 'load-start', before, requestedContextTokens: scalar(options?.contextLength), requestedModelKey: key(options?.modelId) });
        try {
          const result = await supervisor.start(options);
          record({ type: 'load-end', outcome: 'resolved', runtime: snapshotStatus(supervisor) });
          return result;
        } catch (error) { record({ type: 'load-end', outcome: 'rejected', runtime: snapshotStatus(supervisor) }); throw error; }
      },
      async stop(...args) {
        record({ type: 'stop-start', runtime: snapshotStatus(supervisor) });
        try { return await supervisor.stop(...args); }
        finally { record({ type: 'stop-end', runtime: snapshotStatus(supervisor), interpretation: 'Method returned; process-close is a separate event.' }); }
      },
      async request(path, options = {}) {
        const recognized = ['/v1/chat/completions', '/completion', '/v1/completions', '/props', '/tokenize', '/apply-template'].includes(path);
        if (!recognized) return supervisor.request(path, options);
        if (requestCount >= limits.requests) {
          if (!limitNoted) { limitNoted = true; record({ type: 'recording-limit', requests: requestCount }); }
          return supervisor.request(path, options);
        }
        const id = `r${String(++requestCount).padStart(5, '0')}`;
        const route = storage.getStore()?.route ?? 'supervisor-unattributed';
        const chat = ['/v1/chat/completions', '/completion', '/v1/completions'].includes(path);
        const callMs = now(), scope = context();
        let snapshot = null;
        try { if (chat) snapshot = requestSnapshot(options, id, route); } catch { snapshot = { capture: 'observer-failed' }; }
        const sendMs = now();
        record({ type: 'request-start', ...scope, requestId: id, route, endpoint: path, callMs, sendMs, snapshotMs: sendMs - callMs, runtime: snapshotStatus(supervisor), snapshot });
        let response;
        try { response = await supervisor.request(path, options); }
        catch (error) { record({ type: 'request-error', ...scope, requestId: id, aborted: options.signal?.aborted === true }); throw error; }
        const headersMs = now();
        record({ type: 'response-headers', ...scope, requestId: id, headersMs, status: scalar(response.status), runtime: snapshotStatus(supervisor) });
        let milestones = 0;
        try {
          return observeResponse(response, { now,
            onMilestone: observation => { if (milestones++ < limits.milestones) record({ type: 'stream-observation', ...scope, requestId: id, observation }); },
            onEnd: observation => record({ type: 'request-end', ...scope, requestId: id, observation, runtime: snapshotStatus(supervisor) }),
          });
        } catch { record({ type: 'observer-unavailable', ...scope, requestId: id }); return response; }
      },
    });
  }
  function supervisorOptions(options) {
    const spawnFn = options.spawnImpl ?? spawn;
    return { ...options, spawnImpl(command, args, spawnOptions) {
      const child = spawnFn(command, args, spawnOptions);
      const generation = ++processGeneration;
      const processInfo = { generation, pid: scalar(child?.pid), binaryKey: key(command) };
      currentProcess = processInfo;
      const flags = {};
      for (const flag of ['-c', '-ngl', '--cache-type-k', '--cache-type-v', '--spec-type', '--parallel', '-np', '--keep', '--cache-reuse', '--cache-ram']) {
        const i = args.indexOf(flag), value = i < 0 ? null : args[i + 1];
        flags[flag] = typeof value === 'string' && /^(?:-?\d+|f16|f32|bf16|q8_0|q4_0|q4_1|ngram-mod|none|auto|all)$/u.test(value) ? value : null;
      }
      record({ type: 'process-spawn', process: processInfo, flags });
      child?.once?.('close', (code, signal) => record({ type: 'process-close', process: processInfo, exitCode: typeof code === 'number' ? code : null, signalled: Boolean(signal) }));
      child?.once?.('error', () => record({ type: 'process-error', process: processInfo }));
      return child;
    } };
  }
  function wrapRuntime(runtime) {
    return Object.freeze({ ...runtime,
      async *generateStream(...args) {
        const captured = { ...storage.getStore(), route: 'llama-adapter' };
        const iterator = runtime.generateStream(...args)[Symbol.asyncIterator]();
        let finished = false;
        try {
          while (true) {
            const next = await storage.run(captured, () => iterator.next());
            if (next.done) { finished = true; return next.value; }
            yield next.value;
          }
        } finally { if (!finished && iterator.return) await storage.run(captured, () => iterator.return()); }
      },
    });
  }
  function registryOptions(options) {
    if (typeof options.avviaSessioneFn !== 'function') return options;
    return { ...options, avviaSessioneFn(input) {
      record({ type: 'agent-service-entry' });
      const original = input.onEvento;
      const firstContent = new Set();
      if (typeof original !== 'function') return options.avviaSessioneFn(input);
      return options.avviaSessioneFn({ ...input, onEvento(event, ...rest) {
        // Event kinds only: never persist message bodies, error strings or tool arguments here.
        if (['RunStarted', 'RunFinished', 'RunError', 'TextMessageStart', 'ReasoningMessageStart', 'ToolCallStart', 'ToolCallEnd', 'ToolCallResult'].includes(event?.type)) {
          const scope = storage.getStore();
          if (scope && !scope.sessionId && typeof event.threadId === 'string') scope.sessionId = event.threadId;
          record({ type: 'agent-event', eventType: event.type });
        }
        if (['TextMessageContent', 'ReasoningMessageContent'].includes(event?.type) && typeof event.delta === 'string' && event.delta !== '') {
          const identity = `${event.type}:${event.messageId}`;
          if (firstContent.size < 256 && !firstContent.has(identity)) {
            firstContent.add(identity);
            record({ type: 'agent-event', eventType: event.type });
          }
        }
        return original(event, ...rest);
      } });
    } };
  }
  function wrapRegistry(registry) {
    const wrapped = { ...registry };
    for (const method of ['resume', 'avvia', 'avviaLibero', 'fork']) {
      if (typeof registry[method] !== 'function') continue;
      wrapped[method] = function (...args) {
        const scope = { operationId: randomUUID(), sessionId: method === 'resume' && typeof args[0] === 'string' ? args[0] : null, entry: method, entryMs: now() };
        return storage.run(scope, () => {
          record({ type: 'operation-entry' });
          const result = registry[method].apply(wrapped, args);
          // These registry methods are synchronous. Do not make them async or assimilate promises.
          if (typeof result?.sessionId === 'string') scope.sessionId = result.sessionId;
          record({ type: 'operation-return' });
          return result;
        });
      };
    }
    return Object.freeze(wrapped);
  }
  return Object.freeze({ enabled: true, withRoute, wrapRegistry, registryOptions, wrapRuntime, supervisorOptions, wrapSupervisor,
    record, bootId,
    async flush() { const before = sink.stats?.() ?? null; record({ type: 'recorder-flush', sink: before }); return sink.flush?.(); },
  });
}

/** An explicit directory enables recording; raw conversation capture needs a second opt-in AND session ID. */
export async function createLocalResumeDiagnostics({ env = process.env, sourceFiles = {}, warn = message => console.warn(message) } = {}) {
  const directory = env.TALOS_RESUME_DIAGNOSTICS_DIR;
  if (!directory) return NOOP;
  try {
    if (!isAbsolute(directory)) throw new Error('absolute-directory-required');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if (!(await lstat(directory)).isDirectory() || (await lstat(directory)).isSymbolicLink()) throw new Error('directory-required');
    const keyPath = join(directory, '.resume-key');
    let secret;
    try {
      const handle = await open(keyPath, 'wx', 0o600);
      try { secret = randomBytes(32); await handle.writeFile(secret); } finally { await handle.close(); }
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = await lstat(keyPath);
      if (!existing.isFile() || existing.isSymbolicLink() || existing.size !== 32) throw new Error('invalid-key-file');
      secret = await readFile(keyPath);
      if (secret.length !== 32) throw new Error('invalid-key');
    }
    const runDirectory = await mkdtemp(join(directory, 'run-'));
    await mkdir(join(runDirectory, 'private'), { mode: 0o700 });
    const sink = createBoundedResumeSink({ directory: runDirectory });
    const recorder = createResumeRecorder({ sink, secret, sessionId: env.TALOS_RESUME_DIAGNOSTICS_SESSION ?? null, captureRaw: env.TALOS_RESUME_CAPTURE_RAW === '1' });
    const sources = {};
    for (const [name, path] of Object.entries({ recorder: new URL('./local-resume-diagnostics.mjs', import.meta.url), observer: new URL('./local-resume-observer.mjs', import.meta.url), prefix: new URL('./local-resume-prefix.mjs', import.meta.url), ...sourceFiles })) {
      try {
        const bytes = await readFile(path);
        sources[name] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), gitBlobSha1: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') };
      } catch { sources[name] = null; }
    }
    recorder.record({ type: 'environment', node: process.version, platform: platform(), osRelease: release(), arch: process.arch, logicalCpus: cpus().length, ramBytes: totalmem(), sources });
    warn(`[resume-diagnostics] active: ${runDirectory}; metadata only unless raw capture + session selection are both enabled. Private files must not be published.`);
    return Object.freeze({ ...recorder, async flush() {
      const stats = await recorder.flush();
      if (stats?.errors || stats?.dropped) warn('[resume-diagnostics] incomplete capture: diagnostic writes failed or reached a configured limit.');
      return stats;
    } });
  } catch {
    warn('[resume-diagnostics] unavailable: check diagnostic directory permissions/configuration. Inference configuration is unchanged.');
    return NOOP;
  }
}
