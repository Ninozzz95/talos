import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, isAbsolute } from 'node:path';

const MODEL_ID = 'qwen3-embedding-0.6b-q8_0';
const MODEL = Object.freeze({
  id: MODEL_ID, repo: 'Qwen/Qwen3-Embedding-0.6B-GGUF', revision: '370f27d7550e0def9b39c1f16d3fbaa13aa67728',
  bytes: 639150592, sha256: '06507c7b42688469c4e7298b0a1e16deff06caf291cf0a5b278c308249c3e439',
  license: 'Apache-2.0', path: MODEL_ID,
  files: [{ path: 'Qwen3-Embedding-0.6B-Q8_0.gguf', bytes: 639150592, sha256: '06507c7b42688469c4e7298b0a1e16deff06caf291cf0a5b278c308249c3e439' }],
});
const QUERY_INSTRUCTION = 'Given a conversation search query, retrieve relevant passages from the same conversation';
const PROFILE = Object.freeze({ runtime: 'llama.cpp', runtimeVersion: 'b10517', runtimeCommit: 'dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe', dimensions: 1024, pooling: 'last', queryInstruction: QUERY_INSTRUCTION });
const HEALTH_TIMEOUT = 30000;
const REQUEST_TIMEOUT = 30000;
const MAX_RESPONSE = 2 * 1024 * 1024;
const fail = (message, code) => { throw Object.assign(new Error(message), { code }); };

async function allocateLoopbackPort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

// A promise race also bounds injected transports that do not honor AbortSignal.
async function abortable(action, signal) {
  if (signal.aborted) throw signal.reason;
  let listener;
  const stopped = new Promise((_, reject) => { listener = () => reject(signal.reason); signal.addEventListener('abort', listener, { once: true }); });
  try { return await Promise.race([Promise.resolve().then(action), stopped]); }
  finally { signal.removeEventListener('abort', listener); }
}

async function pause(ms, signal) {
  let timer;
  try { await abortable(() => new Promise(resolve => { timer = setTimeout(resolve, ms); }), signal); }
  finally { clearTimeout(timer); }
}

export function createContextEmbeddingRuntime({ binaryPath, modelPath, modelSha256, processPolicy, fetchFn, downloadModel, modelStore, clock = () => new Date().toISOString() } = {}) {
  if (typeof binaryPath !== 'string' || !isAbsolute(binaryPath) || typeof modelPath !== 'string' || !isAbsolute(modelPath)
    || typeof modelSha256 !== 'string' || !/^[a-f0-9]{64}$/iu.test(modelSha256) || !processPolicy || typeof processPolicy.spawn !== 'function'
    || typeof fetchFn !== 'function' || (downloadModel !== undefined && typeof downloadModel !== 'function') || typeof clock !== 'function') fail('Embedding dependencies are invalid', 'CTX_EMBEDDING_CONFIG');
  const digest = modelSha256.toLowerCase();
  const profile = { ...PROFILE, modelId: MODEL_ID, modelSha256: digest, revision: MODEL.revision };
  const profileId = createHash('sha256').update(JSON.stringify(profile)).digest('hex');
  const lifetime = new AbortController();
  let closed = false; let active = null; let running = false; let downloadFlight = null; let verified = null; let state = 'unavailable';

  const manifest = (status, extra = {}) => ({ ...structuredClone(MODEL), ...profile, profileId, sha256: digest, state: status, observedAt: clock(), ...extra });
  function check(signal) {
    if (closed) fail('Embedding runtime is closed', 'CTX_EMBEDDING_CLOSED');
    if (signal?.aborted) fail('Embedding operation cancelled', 'CTX_CANCELLED');
  }
  function scopedSignal(signal, timeout = REQUEST_TIMEOUT) {
    return AbortSignal.any([lifetime.signal, AbortSignal.timeout(timeout), ...(signal ? [signal] : [])]);
  }
  function translate(error, signal, defaultCode = 'CTX_EMBEDDING_FAILED') {
    check(signal);
    if (error?.code?.startsWith('CTX_')) return error;
    if (error instanceof SyntaxError) return Object.assign(new Error('Local embedding endpoint returned malformed JSON'), { code: 'CTX_EMBEDDING_RESPONSE' });
    return Object.assign(new Error(error?.name === 'TimeoutError' ? 'Embedding operation timed out' : 'Local embedding runtime failed'), { code: error?.name === 'TimeoutError' ? 'CTX_EMBEDDING_TIMEOUT' : defaultCode });
  }

  async function verifyWeights(signal) {
    check(signal);
    let info;
    try { info = await stat(modelPath); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    if (!info.isFile() || info.size === 0) fail('Embedding model is not a regular nonempty file', 'CTX_EMBEDDING_HASH');
    const key = `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
    if (verified?.key === key) return verified;
    const hash = createHash('sha256');
    const stream = createReadStream(modelPath, { signal: scopedSignal(signal, 60000) });
    for await (const chunk of stream) { check(signal); hash.update(chunk); }
    if (hash.digest('hex') !== digest) fail('Embedding model SHA-256 mismatch', 'CTX_EMBEDDING_HASH');
    if (digest === MODEL.sha256 && info.size !== MODEL.bytes) fail('Embedding model size mismatch', 'CTX_EMBEDDING_HASH');
    verified = { key, byteLength: info.size };
    return verified;
  }

  async function ensureEmbeddingModel({ approved = false, signal } = {}) {
    check(signal);
    if (typeof approved !== 'boolean') fail('Download approval must be explicit', 'CTX_EMBEDDING_INVALID');
    try {
      const local = await verifyWeights(signal);
      check(signal);
      if (local) return manifest('ready', { byteLength: local.byteLength });
      if (approved !== true) return manifest('approval-required');
      if (!downloadModel) fail('Guided embedding download is unavailable', 'CTX_EMBEDDING_DOWNLOAD_UNAVAILABLE');
      if (!downloadFlight) {
        // The owner binds this port to the existing HF transfer/model store.
        downloadFlight = Promise.resolve().then(() => downloadModel({ ...structuredClone(MODEL), approved: true, signal: scopedSignal(signal, 600000) }));
        downloadFlight.finally(() => { downloadFlight = null; }).catch(() => {});
      }
      const result = await abortable(() => downloadFlight, scopedSignal(signal, 600000));
      check(signal);
      const ready = await verifyWeights(signal);
      if (ready) return manifest('ready', { byteLength: ready.byteLength });
      const pending = result?.state;
      if (!['queued', 'downloading', 'incomplete', 'paused'].includes(pending)) fail('Embedding download did not produce verified model bytes', 'CTX_EMBEDDING_DOWNLOAD_FAILED');
      return manifest(pending);
    } catch (error) { throw translate(error, signal); }
  }

  async function jsonRequest(entry, path, options, signal, timeout = REQUEST_TIMEOUT) {
    const requestSignal = scopedSignal(signal, timeout);
    return abortable(async () => {
      const response = await fetchFn(`${entry.baseURL}${path}`, {
        ...options, redirect: 'error', signal: requestSignal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${entry.token}` },
      });
      if (!response?.ok) fail('Local embedding endpoint is unavailable', path === '/health' ? 'CTX_EMBEDDING_HEALTH' : 'CTX_EMBEDDING_HTTP');
      const declaredSize = response.headers?.get?.('content-length');
      if (declaredSize && Number(declaredSize) > MAX_RESPONSE) fail('Embedding response exceeds limit', 'CTX_EMBEDDING_RESPONSE');
      if (response.body?.getReader) {
        const reader = response.body.getReader(); const chunks = []; let size = 0;
        try {
          for (;;) {
            const { value, done } = await abortable(() => reader.read(), requestSignal);
            if (done) break;
            size += value.byteLength;
            if (size > MAX_RESPONSE) fail('Embedding response exceeds limit', 'CTX_EMBEDDING_RESPONSE');
            chunks.push(Buffer.from(value));
          }
          return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
        } finally { void reader.cancel().catch(() => {}); }
      }
      const data = await response.json();
      if (Buffer.byteLength(JSON.stringify(data), 'utf8') > MAX_RESPONSE) fail('Embedding response exceeds limit', 'CTX_EMBEDDING_RESPONSE');
      return data;
    }, requestSignal);
  }

  async function stopEntry(entry) {
    if (!entry) return;
    if (entry.stopping) return entry.stopping;
    entry.stopping = (async () => {
      const waitForExit = async () => {
        let timer;
        try { await Promise.race([entry.completion, new Promise(resolve => { timer = setTimeout(resolve, 1000); })]); }
        finally { clearTimeout(timer); }
      };
      if (entry.child && !entry.closed) {
        try { entry.child.kill('SIGTERM'); } catch { /* child can exit concurrently */ }
        await waitForExit();
        if (!entry.closed) {
          try { entry.child.kill('SIGKILL'); } catch { /* child can exit concurrently */ }
          await waitForExit();
        }
        if (!entry.closed) fail('Embedding process did not confirm shutdown', 'CTX_EMBEDDING_STOP_FAILED');
      }
      if (entry.locked) { await modelStore.unlock(MODEL_ID); entry.locked = false; }
      if (active === entry) active = null;
      if (!closed) state = 'unavailable';
    })();
    try { await entry.stopping; } catch (error) { entry.stopping = null; throw error; }
  }

  async function start(signal) {
    if (active && state === 'ready' && !active.closed) return active;
    if (active) await stopEntry(active);
    const local = await ensureEmbeddingModel({ approved: false, signal });
    if (local.state !== 'ready') fail('Download the local embedding model to enable semantic search', 'CTX_EMBEDDING_MODEL_REQUIRED');
    const port = await allocateLoopbackPort(); check(signal);
    const entry = { baseURL: `http://127.0.0.1:${port}`, token: randomBytes(32).toString('hex'), child: null, closed: false, failure: null, locked: false };
    try {
      if (modelStore) {
        const stored = await modelStore.inspect(MODEL_ID);
        if (stored) {
          if (stored.sha256 !== digest || stored.state !== 'ready') fail('Registered embedding model is not ready or has another digest', 'CTX_EMBEDDING_HASH');
          await modelStore.lock(MODEL_ID); entry.locked = true;
        }
      }
      check(signal);
      entry.child = processPolicy.spawn(binaryPath, [
        '-m', modelPath, '--alias', MODEL_ID, '--host', '127.0.0.1', '--port', String(port), '--api-key', entry.token,
        '--embedding', '--pooling', 'last', '-ngl', '0', '--device', 'none', '-c', '8192', '-b', '8192', '-ub', '8192',
        '--parallel', '1', '--threads', '2', '--threads-batch', '2', '--no-webui',
      ], { cwd: dirname(binaryPath), shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      if (!entry.child || typeof entry.child.once !== 'function') fail('Embedding process did not start', 'CTX_EMBEDDING_PROCESS');
      entry.completion = new Promise(resolve => entry.child.once('close', () => { entry.closed = true; if (active === entry) state = 'failed'; resolve(); }));
      entry.child.on('error', () => { entry.failure = true; if (active === entry) state = 'failed'; });
      // Drain diagnostic output without persisting prompt text or credentials.
      entry.child.stdout?.resume?.(); entry.child.stderr?.resume?.();
      active = entry; state = 'loading';
      const startupSignal = scopedSignal(signal, HEALTH_TIMEOUT);
      while (!startupSignal.aborted) {
        if (entry.closed || entry.failure) fail('Embedding process exited before becoming ready', 'CTX_EMBEDDING_PROCESS');
        try {
          const result = await jsonRequest(entry, '/health', { method: 'GET' }, startupSignal, 2000);
          if (result?.status !== 'ok') fail('Embedding health response is invalid', 'CTX_EMBEDDING_HEALTH');
          if (entry.closed || entry.failure) fail('Embedding process exited during health probe', 'CTX_EMBEDDING_PROCESS');
          check(signal); state = 'ready'; return entry;
        } catch (error) {
          if (!['CTX_EMBEDDING_HEALTH', 'CTX_EMBEDDING_HTTP'].includes(error?.code) && error?.name !== 'TypeError' && error?.name !== 'TimeoutError') throw error;
        }
        await pause(100, startupSignal);
      }
      throw startupSignal.reason;
    } catch (error) { await stopEntry(entry); throw translate(error, signal); }
  }

  async function embedContextBatch({ texts, kind, signal } = {}) {
    check(signal);
    if (!Array.isArray(texts) || texts.length > 32 || !['query', 'document'].includes(kind)
      || [...texts].some(text => typeof text !== 'string' || !text.trim() || !text.isWellFormed() || Buffer.byteLength(text, 'utf8') > 7680)
      || texts.reduce((sum, text) => sum + Buffer.byteLength(text, 'utf8'), 0) > 32768) fail('Embedding input must contain at most 32 bounded text passages', 'CTX_EMBEDDING_INVALID');
    if (texts.length === 0) return [];
    if (running) fail('Another embedding request is active', 'CTX_EMBEDDING_BUSY');
    check(signal); running = true;
    try {
      if (typeof processPolicy.isChatBusy === 'function' && await processPolicy.isChatBusy()) fail('Embedding yields to active chat', 'CTX_EMBEDDING_BUSY');
      const entry = await start(signal);
      if (typeof processPolicy.isChatBusy === 'function' && await processPolicy.isChatBusy()) fail('Embedding yields to active chat', 'CTX_EMBEDDING_BUSY');
      const input = texts.map(text => kind === 'query' ? `Instruct: ${QUERY_INSTRUCTION}\nQuery: ${text}` : text);
      const response = await jsonRequest(entry, '/v1/embeddings', { method: 'POST', body: JSON.stringify({ model: MODEL_ID, input, encoding_format: 'float' }) }, signal);
      check(signal);
      if (!Array.isArray(response?.data) || response.data.length !== texts.length) fail('Embedding response has the wrong batch shape', 'CTX_EMBEDDING_RESPONSE');
      const vectors = new Array(texts.length);
      for (const row of response.data) {
        if (!Number.isSafeInteger(row?.index) || row.index < 0 || row.index >= texts.length || vectors[row.index] !== undefined
          || !Array.isArray(row.embedding) || row.embedding.length !== PROFILE.dimensions || [...row.embedding].some(value => typeof value !== 'number' || !Number.isFinite(value))) fail('Embedding response has invalid indexes, dimensions or values', 'CTX_EMBEDDING_RESPONSE');
        vectors[row.index] = [...row.embedding];
      }
      return vectors;
    } catch (error) {
      if (signal?.aborted || closed || error?.name === 'TimeoutError') await stopEntry(active);
      throw translate(error, signal);
    } finally { running = false; }
  }

  async function health() {
    if (closed) return { ready: false, state: 'closed', profileId, profile: { ...profile } };
    let ready = false;
    if (active && state === 'ready' && !active.closed && !active.failure) {
      try { ready = (await jsonRequest(active, '/health', { method: 'GET' }, undefined, 2000))?.status === 'ok'; } catch { ready = false; }
    }
    return { ready, state: ready ? 'ready' : state === 'ready' ? 'unavailable' : state, profileId, profile: { ...profile } };
  }

  async function close() {
    if (closed && !active) return;
    closed = true; lifetime.abort(); state = 'closed'; verified = null;
    await stopEntry(active);
  }

  return Object.freeze({ ensureEmbeddingModel, embedContextBatch, health, close });
}
