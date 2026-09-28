import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, realpath, stat, link, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

const SHA256 = /^sha256:([0-9a-f]{64})$/u;

export class WorkflowResultStoreError extends Error {
  constructor(message, code = 'WORKFLOW_STORE_IO', cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'WorkflowResultStoreError';
    this.code = code;
  }
}

function resultError(message, code, cause) {
  return new WorkflowResultStoreError(message, code, cause);
}

function requireLimit(maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw resultError('Workflow result byte limit is required and must be a positive safe integer', 'WORKFLOW_LIMIT_EXCEEDED');
  }
  return maxBytes;
}

async function resultRoot(workflowDataRoot) {
  if (typeof workflowDataRoot !== 'string' || !isAbsolute(workflowDataRoot)) {
    throw resultError('Workflow result root must be absolute', 'WORKFLOW_STORE_LOCATION_INVALID');
  }
  try {
    await mkdir(workflowDataRoot, { recursive: true, mode: 0o700 });
    return await realpath(workflowDataRoot);
  } catch (error) {
    throw resultError(`Workflow result root is unavailable: ${error.message}`, 'WORKFLOW_STORE_IO', error);
  }
}

function pathIsWithin(root, candidate) {
  const delta = relative(root, candidate);
  return delta === '' || (!delta.startsWith('..') && !isAbsolute(delta));
}

async function resolveProspectivePath(candidate) {
  let cursor = candidate;
  const missing = [];
  for (;;) {
    try { return resolve(await realpath(cursor), ...missing); } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const parent = dirname(cursor);
      if (parent === cursor) throw error;
      missing.unshift(basename(cursor));
      cursor = parent;
    }
  }
}

async function ensureContainedDirectory(root, directory) {
  let prospective;
  try { prospective = await resolveProspectivePath(directory); } catch (error) {
    throw resultError(`Cannot resolve Workflow result directory safely: ${error.message}`, 'WORKFLOW_STORE_LOCATION_INVALID', error);
  }
  if (!pathIsWithin(root, prospective)) {
    throw resultError('Workflow result directory resolves outside the data root', 'WORKFLOW_STORE_LOCATION_INVALID');
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const canonical = await realpath(directory);
  if (!pathIsWithin(root, canonical)) {
    throw resultError('Workflow result directory escapes the data root', 'WORKFLOW_STORE_LOCATION_INVALID');
  }
  return canonical;
}

function parseDigest(sha256) {
  const match = typeof sha256 === 'string' ? SHA256.exec(sha256) : null;
  if (!match) throw resultError('Workflow result digest is invalid', 'WORKFLOW_RESULT_NOT_FOUND');
  return match[1];
}

function keyFor(hex) {
  return `cas/sha256/${hex.slice(0, 2)}/${hex}`;
}

const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function readVerified({ root, hex, maxBytes }) {
  const path = join(root, ...keyFor(hex).split('/'));
  let canonicalPath;
  try { canonicalPath = await realpath(path); } catch (error) {
    if (error?.code === 'ENOENT') throw resultError('Workflow result bytes were not found', 'WORKFLOW_RESULT_NOT_FOUND');
    throw resultError(`Cannot resolve Workflow result bytes safely: ${error.message}`, 'WORKFLOW_STORE_IO', error);
  }
  if (!pathIsWithin(root, canonicalPath)) {
    throw resultError('Workflow result bytes resolve outside the data root', 'WORKFLOW_STORE_LOCATION_INVALID');
  }
  let info;
  try { info = await stat(canonicalPath); } catch (error) {
    if (error?.code === 'ENOENT') throw resultError('Workflow result bytes were not found', 'WORKFLOW_RESULT_NOT_FOUND');
    throw resultError(`Cannot inspect Workflow result bytes: ${error.message}`, 'WORKFLOW_STORE_IO', error);
  }
  if (!info.isFile()) throw resultError('Workflow result storage entry is not a file', 'WORKFLOW_RESULT_CORRUPT');
  if (info.size > maxBytes) throw resultError('Workflow result exceeds the configured byte limit', 'WORKFLOW_LIMIT_EXCEEDED');
  let bytes;
  try { bytes = await readFile(canonicalPath); } catch (error) {
    throw resultError(`Cannot read Workflow result bytes: ${error.message}`, 'WORKFLOW_STORE_IO', error);
  }
  if (hashBytes(bytes) !== hex) throw resultError('Workflow result bytes do not match their SHA-256 identity', 'WORKFLOW_RESULT_CORRUPT');
  return bytes;
}

export async function putResultBytes({ workflowDataRoot, bytes, maxBytes } = {}) {
  const limit = requireLimit(maxBytes);
  if (!(bytes instanceof Uint8Array)) throw resultError('Workflow result must be bytes', 'WORKFLOW_RESULT_CORRUPT');
  const immutableBytes = Buffer.from(bytes);
  if (immutableBytes.byteLength > limit) throw resultError('Workflow result exceeds the configured byte limit', 'WORKFLOW_LIMIT_EXCEEDED');
  const root = await resultRoot(workflowDataRoot);
  const hex = hashBytes(immutableBytes);
  const storageKey = keyFor(hex);
  const finalPath = join(root, ...storageKey.split('/'));
  const tempDirectory = join(root, 'temp', 'cas');
  const temporary = join(tempDirectory, `${hex}.${process.pid}.${randomUUID()}.tmp`);
  await ensureContainedDirectory(root, join(root, 'cas', 'sha256', hex.slice(0, 2)));
  await ensureContainedDirectory(root, tempDirectory);

  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(immutableBytes);
    await handle.sync();
    await handle.close();
    handle = null;
    try {
      // A hard link publishes the already-flushed inode without an overwrite race.
      await link(temporary, finalPath);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      await readVerified({ root, hex, maxBytes: limit });
    }
  } catch (error) {
    if (error instanceof WorkflowResultStoreError) throw error;
    throw resultError(`Cannot persist Workflow result bytes: ${error.message}`, 'WORKFLOW_STORE_IO', error);
  } finally {
    try { await handle?.close(); } catch {}
    try { await unlink(temporary); } catch {}
  }

  return Object.freeze({
    sha256: `sha256:${hex}`,
    bytes: immutableBytes.byteLength,
    storageKey,
  });
}

export async function readResultBytes({ workflowDataRoot, sha256, maxBytes } = {}) {
  const limit = requireLimit(maxBytes);
  const root = await resultRoot(workflowDataRoot);
  return readVerified({ root, hex: parseDigest(sha256), maxBytes: limit });
}

export async function verifyResultBytes(options) {
  await readResultBytes(options);
  return true;
}
