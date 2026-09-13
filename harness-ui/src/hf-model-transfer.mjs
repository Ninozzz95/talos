import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createProcessPolicy } from './process-policy.mjs';

const REVISION = /^[a-f0-9]{40}$/iu;
const SHA256 = /^[a-f0-9]{64}$/iu;
const ID = /^[a-z0-9][a-z0-9._-]{0,127}$/iu;

export class HfModelTransferError extends Error {
  constructor(message, code = 'HF_TRANSFER_FAILED') {
    super(message);
    this.name = 'HfModelTransferError';
    this.code = code;
  }
}

function fail(message, code = 'HF_TRANSFER_INVALID') {
  throw new HfModelTransferError(message, code);
}

function validateRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !ID.test(value.id) || typeof value.repo !== 'string' || value.repo.trim() === ''
    || !REVISION.test(value.revision) || !Array.isArray(value.files) || value.files.length === 0
    || !Number.isSafeInteger(value.bytes) || value.bytes <= 0
    || !SHA256.test(value.sha256) || typeof value.license !== 'string' || value.license.trim() === ''
    || typeof value.path !== 'string' || value.path.trim() === '' || isAbsolute(value.path)) {
    fail('model transfer request is invalid');
  }
  const files = value.files.map((file) => {
    if (!file || typeof file.path !== 'string' || file.path.trim() === '' || isAbsolute(file.path)
      || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !SHA256.test(file.sha256)) fail('model transfer file is invalid');
    return { path: file.path, bytes: file.bytes, sha256: file.sha256.toLowerCase() };
  });
  if (files.reduce((sum, file) => sum + file.bytes, 0) !== value.bytes) fail('model transfer byte count is invalid');
  return { ...value, files, sha256: value.sha256.toLowerCase(), state: 'incomplete' };
}

function assertInside(rootDir, value, label) {
  const absolute = resolve(rootDir, value);
  const difference = relative(resolve(rootDir), absolute);
  if (difference === '..' || difference.startsWith(`..${'\\'}`) || isAbsolute(difference)) fail(`${label} escapes model root`);
  return absolute;
}

async function digestFile(path) {
  const hash = createHash('sha256');
  let bytes = 0;
  const stream = createReadStream(path);
  for await (const chunk of stream) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest('hex') };
}

function progressFrom(text) {
  const matches = [...String(text).matchAll(/(?:^|\s)(\d{1,3}(?:\.\d+)?)%/gu)];
  if (matches.length === 0) return null;
  const value = Number(matches.at(-1)[1]);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;
}

export function createHfModelTransfer({
  hfExecutable = 'hf',
  spawnImpl,
  modelStore,
  rootDir,
  fsImpl = {},
  now = () => new Date(),
  allowedRepositories = [],
} = {}) {
  if (typeof spawnImpl !== 'function' || !modelStore || typeof modelStore.inspect !== 'function'
    || typeof modelStore.register !== 'function' || typeof modelStore.setState !== 'function'
    || typeof rootDir !== 'string' || !isAbsolute(rootDir)) {
    fail('transfer dependencies are invalid', 'HF_TRANSFER_MISCONFIGURED');
  }
  const fs = { copyFile, createReadStream, mkdir, rename, rm, stat, ...fsImpl };
  const processPolicy = createProcessPolicy({
    allowedExecutables: [hfExecutable],
    capabilities: { models: rootDir },
    spawnFn: spawnImpl,
  });
  const allowed = new Set(allowedRepositories);
  const transfers = new Map();

  function checkRepo(request) {
    if (!allowed.has(request.repo)) fail(`repository ${request.repo} is not allowed`, 'HF_REPOSITORY_NOT_ALLOWED');
  }

  function argsFor(request, dryRun = false) {
    const args = ['download', request.repo, '--revision', request.revision];
    for (const file of request.files) args.push('--include', file.path);
    args.push('--local-dir', assertInside(rootDir, request.path, 'local-dir'), '--quiet');
    if (dryRun) args.push('--dry-run');
    return args;
  }

  function spawn(command, args) {
    try {
      return processPolicy.spawn(command, args, { cwd: rootDir, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      if (error?.code === 'ENOENT') fail('Hugging Face CLI is not installed', 'HF_CLI_MISSING');
      throw new HfModelTransferError(`cannot start Hugging Face CLI: ${error.message}`, 'HF_SPAWN_FAILED');
    }
  }

  function observeProgress(record, chunk) {
    const value = progressFrom(chunk);
    if (value !== null) record.progress = Math.max(record.progress ?? 0, value);
  }

  function wireProcess(record, child) {
    record.child = child;
    const onData = (chunk) => observeProgress(record, chunk);
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.once('error', (error) => {
      if (error?.code === 'ENOENT') {
        record.state = 'gated';
        record.reason = 'HF_CLI_MISSING';
      } else if (!['paused', 'cancelled'].includes(record.state)) {
        record.state = 'failed';
        record.reason = 'HF_CLI_ERROR';
      }
    });
    child.once('close', (code) => {
      if (record.state === 'paused' || record.state === 'cancelled') return;
      if (code !== 0) {
        record.state = 'failed';
        record.reason = 'HF_DOWNLOAD_FAILED';
        return;
      }
      record.state = 'verifying';
      verify(record.request).then(() => {
        record.state = 'ready';
        record.progress = 100;
      }).catch((error) => {
        record.state = 'failed';
        record.reason = error.code || 'CHECKSUM_MISMATCH';
      });
    });
  }

  async function inspect(value) {
    const request = validateRequest(value);
    checkRepo(request);
    const child = spawn(hfExecutable, argsFor(request, true));
    return new Promise((resolveResult, reject) => {
      let missing = false;
      child.once('error', (error) => {
        if (error?.code === 'ENOENT') {
          missing = true;
          resolveResult({ state: 'gated', reason: 'HF_CLI_MISSING' });
        } else reject(new HfModelTransferError(error.message, 'HF_CLI_ERROR'));
      });
      child.once('close', (code) => {
        if (missing) return;
        if (code !== 0) reject(new HfModelTransferError('Hugging Face dry-run failed', 'HF_INSPECT_FAILED'));
        else resolveResult({ state: 'available', repo: request.repo, revision: request.revision, files: request.files, cli: { executable: hfExecutable, version: null } });
      });
    });
  }

  async function start(value) {
    const request = validateRequest(value);
    checkRepo(request);
    const previous = transfers.get(request.id);
    if (previous?.state === 'running' || previous?.state === 'verifying') return status(request.id);
    const existing = await modelStore.inspect(request.id);
    if (!existing) await modelStore.register({ ...request, updatedAt: now().toISOString() });
    else if (existing.repo !== request.repo || existing.revision !== request.revision) fail('existing transfer has a different revision', 'HF_TRANSFER_COLLISION');
    const record = { id: request.id, request, state: 'running', progress: previous?.progress ?? 0, reason: null, startedAt: now().toISOString(), child: null };
    transfers.set(request.id, record);
    try { wireProcess(record, spawn(hfExecutable, argsFor(request))); } catch (error) {
      if (error.code === 'HF_CLI_MISSING') { record.state = 'gated'; record.reason = error.code; }
      else throw error;
    }
    return status(request.id);
  }

  async function pause(id) {
    const record = transfers.get(id);
    if (!record || !['running', 'verifying'].includes(record.state)) return false;
    record.state = 'paused';
    record.reason = 'PAUSED_BY_OWNER';
    record.child?.kill?.('SIGTERM');
    return true;
  }

  async function resume(id) {
    const record = transfers.get(id);
    if (!record || !['paused', 'cancelled', 'incomplete'].includes(record.state)) return false;
    return start(record.request);
  }

  async function cancel(id) {
    const record = transfers.get(id);
    if (!record || ['ready', 'failed', 'gated'].includes(record.state)) return false;
    record.state = 'cancelled';
    record.reason = 'CANCELLED_BY_OWNER';
    record.child?.kill?.('SIGTERM');
    return true;
  }

  function status(id) {
    const record = transfers.get(id);
    if (!record) return null;
    return Object.freeze({ id: record.id, state: record.state, progress: record.progress, reason: record.reason, startedAt: record.startedAt });
  }

  async function verify(id) {
    const manifest = await modelStore.inspect(typeof id === 'string' ? id : id.id);
    if (!manifest) fail('model manifest not found', 'MODEL_NOT_FOUND');
    for (const file of manifest.files) {
      const path = assertInside(rootDir, join(manifest.path, file.path), 'model file');
      let actual;
      try { actual = await digestFile(path); } catch (error) { fail(`cannot read ${file.path}: ${error.message}`, 'MODEL_FILE_UNREADABLE'); }
      if (actual.bytes !== file.bytes || actual.sha256.toLowerCase() !== file.sha256.toLowerCase()) {
        fail(`checksum mismatch for ${file.path}`, 'CHECKSUM_MISMATCH');
      }
    }
    return modelStore.setState(manifest.id, 'ready');
  }

  async function importLocal(value, sourcePath) {
    const request = validateRequest(value);
    if (!isAbsolute(sourcePath)) fail('local source must be absolute');
    if (request.files.length !== 1) fail('local import currently supports one GGUF file', 'LOCAL_IMPORT_UNSUPPORTED');
    checkRepo(request);
    const source = resolve(sourcePath);
    const destination = assertInside(rootDir, join(request.path, request.files[0].path), 'model file');
    const existing = await modelStore.inspect(request.id);
    if (!existing) await modelStore.register({ ...request, updatedAt: now().toISOString() });
    await fs.mkdir(resolve(destination, '..'), { recursive: true });
    const temporary = `${destination}.partial-${process.pid}-${Date.now()}`;
    await fs.copyFile(source, temporary);
    await fs.rename(temporary, destination);
    return verify(request.id);
  }

  return Object.freeze({ inspect, start, pause, resume, cancel, status, verify, importLocal });
}
