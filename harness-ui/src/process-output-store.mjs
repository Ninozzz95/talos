import {Worker} from 'node:worker_threads';
import {ProcessOutputStoreError, OUTPUT_MAX_REQUESTS, normalizzaConfigurazioneOutput, normalizzaRichiestaOutput} from './process-output-contract.mjs';

/** The caller supplies a private profile database, never a model-provided path. */
export async function createProcessOutputStore(options) {
  const config = normalizzaConfigurazioneOutput(options);
  const worker = new Worker(new URL('./process-output-worker.mjs', import.meta.url), {workerData: config});
  const pending = new Map();
  let nextId = 0, failure, closing = false, closePromise, readyResolve, readyReject, exitResolve;
  const ready = new Promise((resolve, reject) => {readyResolve = resolve; readyReject = reject;});
  const exited = new Promise(resolve => {exitResolve = resolve;});
  const rejectAll = error => {
    failure ??= error;
    readyReject(failure);
    for (const entry of pending.values()) entry.reject(failure);
    pending.clear();
  };
  worker.on('message', message => {
    if (Object.hasOwn(message, 'ready')) {
      if (message.ready) readyResolve();
      else rejectAll(new ProcessOutputStoreError(message.error.message, message.error.code));
      return;
    }
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new ProcessOutputStoreError(message.error.message, message.error.code));
    else entry.resolve(message.result);
  });
  worker.on('error', () => rejectAll(new ProcessOutputStoreError('Process output worker failed', 'OUTPUT_WORKER_FAILED')));
  worker.on('exit', code => {
    if (!closing || code !== 0 || pending.size) rejectAll(new ProcessOutputStoreError('Process output worker exited before settlement', 'OUTPUT_WORKER_EXIT'));
    exitResolve();
  });
  const request = (method, raw, allowClose = false) => {
    if (closing && !allowClose) return Promise.reject(new ProcessOutputStoreError('Process output store is closed', 'OUTPUT_STORE_CLOSED'));
    if (failure) return Promise.reject(failure);
    if (!allowClose && pending.size >= OUTPUT_MAX_REQUESTS) return Promise.reject(new ProcessOutputStoreError('Await pending output storage requests before sending more', 'OUTPUT_STORE_BUSY'));
    let args;
    try {args = normalizzaRichiestaOutput(method, raw);} catch (error) {return Promise.reject(error);}
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      pending.set(id, {resolve, reject});
      try {worker.postMessage({id, method, args});}
      catch {pending.delete(id); reject(new ProcessOutputStoreError('Could not submit process output request', 'OUTPUT_STORE_IO'));}
    });
  };
  try {await ready;} catch (error) {closing = true; await worker.terminate(); await exited; throw error;}
  const store = {};
  for (const method of ['begin', 'append', 'finish', 'fail', 'inspect', 'readPage', 'health',
    'beginSessionDeletion', 'cancelSessionDeletion', 'completeSessionDeletion', 'listSessionDeletions']) store[method] = args => request(method, args);
  store.close = () => {
    if (closePromise) return closePromise;
    closing = true;
    closePromise = (async () => {try {if (!failure) await request('close', {}, true);} finally {await exited;}})();
    return closePromise;
  };
  return Object.freeze(store);
}
