import { Worker } from 'node:worker_threads';

export class ContextStoreError extends Error {
  constructor(message, code = 'CTX_STORE_FAILED', options) {
    super(message, options);
    this.name = 'ContextStoreError';
    this.code = code;
  }
}

/** SQLite owns all durable state in one dedicated worker. Requests are copied
 * when submitted and serialized in the worker, including backup and shutdown. */
export function createSqliteContextStore({ databasePath, vectorExtension = false, faultPoint } = {}) {
  if (typeof databasePath !== 'string' || !databasePath || databasePath.includes('\0')) {
    throw new ContextStoreError('A database path is required', 'CTX_INVALID_INPUT');
  }
  const worker = new Worker(new URL('./sqlite-worker.mjs', import.meta.url), {
    workerData: { databasePath, vectorExtension, faultPoint },
  });
  const pending = new Map();
  let nextId = 0;
  let failure;
  let closing = false;
  let closePromise;
  let resolveExit;
  const exited = new Promise(resolve => { resolveExit = resolve; });
  const fail = error => {
    failure ??= error;
    for (const entry of pending.values()) entry.reject(failure);
    pending.clear();
  };
  worker.on('message', response => {
    const entry = pending.get(response?.id);
    if (!entry) return;
    pending.delete(response.id);
    if (response.error) entry.reject(new ContextStoreError(response.error.message, response.error.code));
    else entry.resolve(response.result);
  });
  worker.on('error', error => fail(new ContextStoreError(error.message, 'CTX_WORKER_FAILED')));
  worker.on('exit', code => {
    if (!closing || code !== 0 || pending.size) fail(new ContextStoreError(`Context worker exited (${code})`, 'CTX_WORKER_EXIT'));
    resolveExit();
  });
  const request = (method, args = {}) => {
    if (failure) return Promise.reject(failure);
    if (closing && method !== 'close') return Promise.reject(new ContextStoreError('Context store is closed', 'CTX_STORE_CLOSED'));
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try { worker.postMessage({ id, method, args }); }
      catch (error) {
        pending.delete(id);
        reject(new ContextStoreError('Context arguments must be cloneable data', 'CTX_INVALID_INPUT', { cause: error }));
      }
    });
  };
  const store = {};
  for (const method of [
    'initSession', 'readContextSnapshot', 'appendOriginalBatch', 'readOriginals',
    'updateSessionSettings', 'listContextVersions', 'commitContextVersion',
    'restoreContextVersion', 'claimContextJob', 'saveJobProgress', 'readContextJob',
    'upsertProtectedFact', 'removeProtectedFact', 'readContextOutbox', 'ackContextEvent',
    'recordUsage', 'readUsage', 'readContextMutation', 'putBlob', 'readBlob', 'replaceSearchChunks',
    'searchLexical', 'searchVector', 'exportSession', 'importSession', 'backup', 'health',
  ]) store[method] = args => request(method, args);
  store.close = () => {
    if (closePromise) return closePromise;
    closing = true;
    closePromise = (async () => {
      if (!failure) await request('close');
      await exited;
    })();
    return closePromise;
  };
  return Object.freeze(store);
}

export const appendOriginalBatch = (options, { store }) => store.appendOriginalBatch(options);
export const commitContextVersion = (options, { store }) => store.commitContextVersion(options);
export const readContextSnapshot = (options, { store }) => store.readContextSnapshot(options);
export const saveJobProgress = (options, { store }) => store.saveJobProgress(options);
export const claimContextJob = (options, { store }) => store.claimContextJob(options);
export const readContextOutbox = (options, { store }) => store.readContextOutbox(options);
export const ackContextEvent = (options, { store }) => store.ackContextEvent(options);
