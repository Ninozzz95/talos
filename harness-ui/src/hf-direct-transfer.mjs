import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { mkdir, stat, rm } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';

const HOST_OK = (host) => host === 'huggingface.co' || host.endsWith('.huggingface.co') || host.endsWith('.hf.co');

export class HfDirectTransferError extends Error {
  constructor(message, code = 'HF_TRANSFER_FAILED') { super(message); this.name = 'HfDirectTransferError'; this.code = code; }
}

function fail(message, code = 'HF_TRANSFER_INVALID') { throw new HfDirectTransferError(message, code); }
const LOCAL_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/iu;
const LOCAL_NAME = /^.{1,160}$/su;
const MAX_LOCAL_IMPORT_BYTES_DEFAULT = 64 * 1024 ** 3;
function inside(root, value) { const absolute = resolve(root, value); const rel = relative(resolve(root), absolute); if (rel === '..' || rel.startsWith(`..${'\\'}`) || isAbsolute(rel)) fail('model path escapes root', 'HF_PATH_REJECTED'); return absolute; }
function validateManifest(value) {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || typeof value.repo !== 'string' || typeof value.revision !== 'string' || !/^[a-f0-9]{40,64}$/iu.test(value.revision) || !Array.isArray(value.files) || value.files.length === 0 || !Number.isSafeInteger(value.bytes) || value.bytes <= 0 || typeof value.path !== 'string' || isAbsolute(value.path)) fail('download manifest is invalid');
  const files = value.files.map((file) => {
    if (!file || typeof file.path !== 'string' || !file.path || file.path.startsWith('/') || file.path.split('/').some((part) => !part || part === '.' || part === '..') || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !/^[a-f0-9]{64}$/iu.test(file.sha256)) fail('download file is invalid');
    return { path: file.path, bytes: file.bytes, sha256: file.sha256.toLowerCase() };
  });
  if (files.reduce((sum, file) => sum + file.bytes, 0) !== value.bytes) fail('download byte total is invalid');
  return { ...value, files, sha256: typeof value.sha256 === 'string' ? value.sha256.toLowerCase() : files[0].sha256, state: 'incomplete' };
}

async function digest(path) { const hash = createHash('sha256'); let bytes = 0; const stream = (await import('node:fs')).createReadStream(path); for await (const chunk of stream) { hash.update(chunk); bytes += chunk.length; } return { bytes, sha256: hash.digest('hex') }; }

export function createHfDirectTransfer({ rootDir, modelStore, hubClient, fetchImpl = fetch, now = () => new Date(), maxConcurrent = 2, maxImportBytes = MAX_LOCAL_IMPORT_BYTES_DEFAULT } = {}) {
  if (typeof rootDir !== 'string' || !isAbsolute(rootDir) || !modelStore || typeof modelStore.inspect !== 'function' || typeof modelStore.register !== 'function' || typeof modelStore.setState !== 'function' || !hubClient || typeof hubClient.resolveDownload !== 'function') fail('direct transfer dependencies are invalid', 'HF_TRANSFER_MISCONFIGURED');
  const records = new Map(); const queue = []; let active = 0;
  if (!Number.isSafeInteger(maxImportBytes) || maxImportBytes <= 0) fail('local import limit is invalid', 'HF_TRANSFER_MISCONFIGURED');
  async function verify(request) {
    for (const file of request.files) {
      const target = inside(rootDir, join(request.path, file.path));
      let actual; try { actual = await digest(target); } catch { fail(`cannot read ${file.path}`, 'MODEL_FILE_UNREADABLE'); }
      if (actual.bytes !== file.bytes || actual.sha256 !== file.sha256) fail(`checksum mismatch for ${file.path}`, 'CHECKSUM_MISMATCH');
    }
    return modelStore.setState(request.id, 'ready');
  }
  async function download(record) {
    const { request } = record;
    for (const file of request.files) {
      if (record.abort.signal.aborted) throw new HfDirectTransferError('download cancelled', 'CANCELLED_BY_OWNER');
      const target = inside(rootDir, join(request.path, file.path)); await mkdir(resolve(target, '..'), { recursive: true });
      let offset = 0; try { offset = (await stat(`${target}.partial`)).size; } catch {}
      const signed = await hubClient.resolveDownload(request.repo, request.revision, file.path);
      const parsed = new URL(signed.url); if (parsed.protocol !== 'https:' || !HOST_OK(parsed.hostname)) fail('download host is not official', 'HF_REDIRECT_HOST_REJECTED');
      const headers = offset > 0 && offset < file.bytes ? { Range: `bytes=${offset}-` } : {};
      if (offset >= file.bytes) offset = 0;
      const response = await fetchImpl(signed.url, { headers, signal: record.abort.signal });
      if (!response.ok || !response.body) fail(`Hugging Face download HTTP ${response.status}`, 'HF_DOWNLOAD_FAILED');
      if (offset > 0 && response.status !== 206) { await rm(`${target}.partial`, { force: true }); offset = 0; }
      const output = createWriteStream(`${target}.partial`, { flags: offset > 0 ? 'a' : 'w' });
      let received = offset; const reader = response.body.getReader ? response.body.getReader() : null;
      try {
        if (reader) { while (true) { const { value, done } = await reader.read(); if (done) break; if (value) { if (!output.write(Buffer.from(value))) await new Promise((resolveWrite) => output.once('drain', resolveWrite)); received += value.byteLength; record.bytes = record.baseBytes + received; record.progress = Math.min(99, Math.round((record.bytes / request.bytes) * 100)); } } } else { for await (const chunk of response.body) { if (!output.write(Buffer.from(chunk))) await new Promise((resolveWrite) => output.once('drain', resolveWrite)); received += chunk.length; record.bytes = record.baseBytes + received; record.progress = Math.min(99, Math.round((record.bytes / request.bytes) * 100)); } }
        await new Promise((resolveClose, rejectClose) => { output.once('close', resolveClose); output.once('error', rejectClose); output.end(); });
      } catch (error) {
        output.destroy();
        throw error;
      }
      await (await import('node:fs/promises')).rename(`${target}.partial`, target); record.baseBytes += file.bytes;
    }
    record.state = 'verifying'; await verify(request); record.state = 'ready'; record.progress = 100; record.bytes = request.bytes;
  }
  function pump() { while (active < maxConcurrent && queue.length) { const record = queue.shift(); active += 1; if (record.state === 'queued') record.state = 'running'; download(record).catch((error) => { if (!['paused', 'cancelled'].includes(record.state)) { record.state = 'failed'; record.reason = error.code || 'HF_DOWNLOAD_FAILED'; } }).finally(() => { active -= 1; pump(); }); } }
  async function start(value) {
    const request = validateManifest(value); const existing = await modelStore.inspect(request.id); if (existing && (existing.repo !== request.repo || existing.revision !== request.revision)) fail('existing transfer has different revision', 'HF_TRANSFER_COLLISION');
    if (existing?.state === 'ready') {
      const ready = { id: request.id, request: existing, state: 'ready', progress: 100, bytes: existing.bytes, baseBytes: existing.bytes, reason: null, startedAt: existing.updatedAt, abort: new AbortController() };
      records.set(request.id, ready);
      return status(request.id);
    }
    if (!existing) await modelStore.register({ ...request, state: 'incomplete', updatedAt: now().toISOString() });
    const previous = records.get(request.id); if (previous && ['queued', 'running', 'verifying'].includes(previous.state)) return status(request.id);
    const record = { id: request.id, request, state: 'queued', progress: 0, bytes: 0, baseBytes: 0, reason: null, startedAt: now().toISOString(), abort: new AbortController() }; records.set(request.id, record); queue.push(record); pump();
    return status(request.id);
  }
  function status(id) { const record = records.get(id); return record ? { id: record.id, state: record.state, progress: record.progress, bytes: record.bytes, totalBytes: record.request.bytes, reason: record.reason, startedAt: record.startedAt } : null; }
  async function pause(id) { const record = records.get(id); if (!record || !['queued', 'running'].includes(record.state)) return false; record.state = 'paused'; record.reason = 'PAUSED_BY_OWNER'; record.abort.abort(); return true; }
  async function resume(id) {
    const record = records.get(id);
    if (!record) {
      const manifest = await modelStore.inspect(id);
      if (!manifest || manifest.state === 'ready') return false;
      return start(manifest);
    }
    if (!['paused', 'failed'].includes(record.state)) return false;
    return start(record.request);
  }
  async function cancel(id) {
    const record = records.get(id); if (!record || ['ready', 'failed', 'cancelled'].includes(record.state)) return false;
    record.state = 'cancelled'; record.reason = 'CANCELLED_BY_OWNER'; record.abort.abort();
    await Promise.all(record.request.files.map((file) => rm(`${inside(rootDir, join(record.request.path, file.path))}.partial`, { force: true })));
    await modelStore.remove(record.id).catch(() => {});
    return true;
  }
  async function verifyById(id) { const record = records.get(id); const manifest = record?.request || await modelStore.inspect(id); if (!manifest) fail('model manifest not found', 'MODEL_NOT_FOUND'); return verify(manifest); }
  function validateImportMetadata(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.id !== 'string' || !LOCAL_ID.test(value.id)) fail('local model id is invalid', 'LOCAL_IMPORT_INVALID');
    if (typeof value.filename !== 'string' || value.filename.trim() === '' || value.filename.length > 240 || basename(value.filename) !== value.filename || value.filename.includes('\\') || value.filename.includes('/') || !/\.gguf$/iu.test(value.filename)) fail('local model filename is invalid', 'LOCAL_IMPORT_INVALID');
    if (value.expectedBytes !== undefined && (!Number.isSafeInteger(value.expectedBytes) || value.expectedBytes <= 0)) fail('local model size is invalid', 'LOCAL_IMPORT_INVALID');
    if (value.expectedBytes !== undefined && value.expectedBytes > maxImportBytes) fail('local model is too large', 'LOCAL_IMPORT_TOO_LARGE');
    if (value.name !== undefined && (typeof value.name !== 'string' || !LOCAL_NAME.test(value.name.trim()))) fail('local model name is invalid', 'LOCAL_IMPORT_INVALID');
    return { id: value.id, filename: value.filename, expectedBytes: value.expectedBytes ?? null, name: value.name?.trim() || null };
  }
  async function importStream(readable, metadata) {
    if (!readable || typeof readable[Symbol.asyncIterator] !== 'function') fail('local import stream is invalid', 'LOCAL_IMPORT_INVALID');
    const request = validateImportMetadata(metadata);
    if (await modelStore.inspect(request.id)) fail(`model ${request.id} already exists`, 'HF_TRANSFER_COLLISION');
    const target = inside(rootDir, join(request.id, request.filename));
    await mkdir(resolve(target, '..'), { recursive: true });
    const temporary = `${target}.partial-upload-${process.pid}-${Date.now()}`;
    const output = createWriteStream(temporary, { flags: 'wx' });
    const hash = createHash('sha256');
    let total = 0;
    let prefix = Buffer.alloc(0);
    let registered = false;
    try {
      for await (const chunk of readable) {
        const value = Buffer.from(chunk);
        if (!value.length) continue;
        total += value.length;
        if (total > maxImportBytes) fail('local model is too large', 'LOCAL_IMPORT_TOO_LARGE');
        if (request.expectedBytes !== null && total > request.expectedBytes) fail('local model size does not match', 'LOCAL_IMPORT_SIZE_MISMATCH');
        if (prefix.length < 4) prefix = Buffer.concat([prefix, value.subarray(0, 4 - prefix.length)]);
        hash.update(value);
        if (!output.write(value)) await once(output, 'drain');
      }
      await new Promise((resolveClose, rejectClose) => output.end((error) => error ? rejectClose(error) : resolveClose()));
      if (total === 0) fail('local model is empty', 'LOCAL_IMPORT_EMPTY');
      if (request.expectedBytes !== null && total !== request.expectedBytes) fail('local model size does not match', 'LOCAL_IMPORT_SIZE_MISMATCH');
      if (prefix.toString('ascii') !== 'GGUF') fail('local file is not a GGUF model', 'LOCAL_IMPORT_NOT_GGUF');
      const sha256 = hash.digest('hex');
      await (await import('node:fs/promises')).rename(temporary, target);
      const manifest = { id: request.id, repo: 'local-upload', revision: sha256, files: [{ path: request.filename, bytes: total, sha256 }], bytes: total, sha256, license: 'unknown', path: request.id, state: 'ready', updatedAt: now().toISOString() };
      try {
        await modelStore.register(manifest);
        registered = true;
        if (request.name && typeof modelStore.rename === 'function') await modelStore.rename(request.id, request.name);
      } catch (error) {
        await rm(target, { force: true }).catch(() => {});
        if (registered) await modelStore.remove?.(request.id).catch?.(() => {});
        throw error;
      }
      return (await modelStore.inspect(request.id)) || manifest;
    } catch (error) {
      output.destroy();
      await rm(temporary, { force: true }).catch(() => {});
      throw error;
    }
  }
  async function listStatuses() {
    for (const manifest of await modelStore.list()) {
      if (records.has(manifest.id)) continue;
      if (manifest.state === 'ready') {
        records.set(manifest.id, { id: manifest.id, request: manifest, state: 'ready', progress: 100, bytes: manifest.bytes, baseBytes: manifest.bytes, reason: null, startedAt: manifest.updatedAt, abort: new AbortController() });
      } else {
        let bytes = 0;
        for (const file of manifest.files) { try { bytes += (await stat(`${inside(rootDir, join(manifest.path, file.path))}.partial`)).size; } catch {} }
        records.set(manifest.id, { id: manifest.id, request: manifest, state: 'paused', progress: Math.min(99, Math.round((bytes / manifest.bytes) * 100)), bytes, baseBytes: 0, reason: 'RECOVERED_AFTER_RESTART', startedAt: manifest.updatedAt, abort: new AbortController() });
      }
    }
    return [...records.keys()].map((id) => status(id)).filter(Boolean);
  }
  return Object.freeze({ start, status, listStatuses, pause, resume, cancel, verify: verifyById, importStream });
}
