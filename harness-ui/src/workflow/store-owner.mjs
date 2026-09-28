import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  unlink,
} from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import { isAbsolute, join, relative } from 'node:path';

import { canonicalJson } from './canonical-json.mjs';

const OWNER_SCHEMA = 'talos.workflow-store-owner.v1';
const OWNER_FIELDS = Object.freeze([
  'schema', 'bootId', 'pid', 'processStartIdentity', 'hostFingerprint', 'acquiredAt',
  'heartbeatAt', 'dataRootFingerprint', 'endpointKey', 'platform', 'state',
]);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const ENDPOINT_KEY = /^[0-9a-f]{40}$/u;

export class WorkflowStoreOwnerError extends Error {
  constructor(message, code = 'WORKFLOW_STORE_IO', cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'WorkflowStoreOwnerError';
    this.code = code;
  }
}

function ownerError(message, code, cause) {
  return new WorkflowStoreOwnerError(message, code, cause);
}

function utcNow(now) {
  const value = now();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw ownerError('Workflow StoreOwner clock returned an invalid instant');
  return date.toISOString();
}

async function canonicalRoot(workflowDataRoot, { create = true } = {}) {
  if (typeof workflowDataRoot !== 'string' || !isAbsolute(workflowDataRoot)) {
    throw ownerError('Workflow data root must be an absolute path', 'WORKFLOW_STORE_LOCATION_INVALID');
  }
  try {
    if (create) await mkdir(workflowDataRoot, { recursive: true, mode: 0o700 });
    return await realpath(workflowDataRoot);
  } catch (error) {
    throw ownerError(`Workflow data root is unavailable: ${error.message}`, 'WORKFLOW_STORE_UNAVAILABLE', error);
  }
}

function endpointIdentity(root) {
  const digest = createHash('sha256').update(Buffer.from(root, 'utf8')).digest('hex');
  return {
    dataRootFingerprint: `sha256:${digest}`,
    endpointKey: digest.slice(0, 40),
  };
}

function endpointFor(root, endpointKey, platform) {
  if (platform === 'win32') return `\\\\.\\pipe\\talos-workflow-store-${endpointKey}`;
  if (platform === 'linux') return `\0talos-workflow-store-${endpointKey}`;
  return join(root, '.store-owner.sock');
}

function validateOwnerRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw ownerError('Workflow StoreOwner record is not an object', 'WORKFLOW_STORE_IO');
  }
  const keys = Object.keys(value);
  if (keys.length !== OWNER_FIELDS.length || keys.some((key) => !OWNER_FIELDS.includes(key))) {
    throw ownerError('Workflow StoreOwner record has an unknown or missing field', 'WORKFLOW_STORE_IO');
  }
  if (value.schema !== OWNER_SCHEMA || !UUID_V4.test(value.bootId)
    || !Number.isSafeInteger(value.pid) || value.pid <= 0
    || (value.processStartIdentity !== null && typeof value.processStartIdentity !== 'string')
    || (value.hostFingerprint !== null && !SHA256.test(value.hostFingerprint))
    || !SHA256.test(value.dataRootFingerprint) || !ENDPOINT_KEY.test(value.endpointKey)
    || typeof value.platform !== 'string' || !['active', 'released'].includes(value.state)) {
    throw ownerError('Workflow StoreOwner record violates its v1 contract', 'WORKFLOW_STORE_IO');
  }
  for (const key of ['acquiredAt', 'heartbeatAt']) {
    if (typeof value[key] !== 'string' || !Number.isFinite(Date.parse(value[key])) || !value[key].endsWith('Z')) {
      throw ownerError(`Workflow StoreOwner ${key} is invalid`, 'WORKFLOW_STORE_IO');
    }
  }
  return value;
}

async function durableJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(`${canonicalJson(value)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, path);
  } catch (error) {
    try { await handle?.close(); } catch {}
    try { await unlink(temporary); } catch {}
    throw error;
  }
}

async function readBufferedOwner(root) {
  const current = join(root, 'owner.json');
  let info;
  try {
    info = await lstat(current);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    throw ownerError('Workflow StoreOwner record is not a regular in-root file', 'WORKFLOW_STORE_NEEDS_ATTENTION');
  }
  return readFile(current);
}

function pathIsWithin(root, candidate) {
  const delta = relative(root, candidate);
  return delta === '' || (!delta.startsWith('..') && !isAbsolute(delta));
}

async function archiveBufferedOwner(root, bytes) {
  if (bytes === null) return;
  let key = createHash('sha256').update(bytes).digest('hex');
  try {
    const parsed = JSON.parse(bytes.toString('utf8'));
    if (typeof parsed?.bootId === 'string' && UUID_V4.test(parsed.bootId)) key = parsed.bootId;
  } catch {}
  const history = join(root, 'owner-history');
  await mkdir(history, { recursive: true, mode: 0o700 });
  const canonicalHistory = await realpath(history);
  if (!pathIsWithin(root, canonicalHistory)) {
    throw ownerError('Workflow StoreOwner history resolves outside the data root', 'WORKFLOW_STORE_NEEDS_ATTENTION');
  }
  const destination = join(canonicalHistory, `${key}.json`);
  let handle;
  try {
    handle = await open(destination, 'wx', 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
  } catch (error) {
    try { await handle?.close(); } catch {}
    if (error?.code !== 'EEXIST') throw error;
    const existing = await readFile(destination);
    if (!existing.equals(bytes)) {
      throw ownerError('Workflow StoreOwner history identity conflicts with different bytes', 'WORKFLOW_STORE_NEEDS_ATTENTION');
    }
  }
}

function listen(server, endpoint) {
  return new Promise((resolve, reject) => {
    const onError = (error) => { server.off('listening', onListening); reject(error); };
    const onListening = () => { server.off('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen({ path: endpoint, exclusive: true });
  });
}

function closeServer(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function endpointIsLive(endpoint, { timeoutMs = 500 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const socket = createConnection(endpoint);
    const finish = (live) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(live);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    timer.unref?.();
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

async function bindEndpoint({ root, endpoint, platform, server, failpoint }) {
  await failpoint?.('store.owner.before_bind');
  try {
    await listen(server, endpoint);
    await failpoint?.('store.owner.after_bind');
    return;
  } catch (error) {
    if (error?.code !== 'EADDRINUSE' && error?.code !== 'EACCES') throw error;
    if (platform === 'win32' || platform === 'linux') {
      throw ownerError('Workflow store is already owned by another process', 'WORKFLOW_STORE_OWNED', error);
    }
    await failpoint?.('store.owner.unix_before_stale_probe');
    if (await endpointIsLive(endpoint)) {
      throw ownerError('Workflow store is already owned by another process', 'WORKFLOW_STORE_OWNED', error);
    }
    await failpoint?.('store.owner.unix_after_stale_probe');
    let stat;
    try { stat = await lstat(endpoint); } catch (statError) {
      throw ownerError(`Workflow owner endpoint cannot be proved stale: ${statError.message}`, 'WORKFLOW_STORE_NEEDS_ATTENTION', statError);
    }
    if (!stat.isSocket() || endpoint !== join(root, '.store-owner.sock')) {
      throw ownerError('Workflow owner endpoint is not a removable socket', 'WORKFLOW_STORE_NEEDS_ATTENTION');
    }
    await failpoint?.('store.owner.unix_before_stale_unlink');
    await unlink(endpoint);
    await failpoint?.('store.owner.unix_after_stale_unlink');
    try {
      await listen(server, endpoint);
      await failpoint?.('store.owner.after_bind');
    } catch (retryError) {
      throw ownerError('Workflow store is already owned or its endpoint is ambiguous', 'WORKFLOW_STORE_OWNED', retryError);
    }
  }
}

export async function readStoreOwner({ workflowDataRoot }) {
  const root = await canonicalRoot(workflowDataRoot, { create: false });
  try {
    const parsed = JSON.parse(await readFile(join(root, 'owner.json'), 'utf8'));
    return validateOwnerRecord(parsed);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    if (error instanceof WorkflowStoreOwnerError) throw error;
    throw ownerError(`Cannot read Workflow StoreOwner record: ${error.message}`, 'WORKFLOW_STORE_IO', error);
  }
}

export async function proveStoreOwnerLiveness({ workflowDataRoot, timeoutMs = 500 }) {
  let root;
  try { root = await canonicalRoot(workflowDataRoot, { create: false }); } catch { return false; }
  const { endpointKey } = endpointIdentity(root);
  return endpointIsLive(endpointFor(root, endpointKey, process.platform), { timeoutMs });
}

export async function acquireStoreOwner({
  workflowDataRoot,
  now = () => new Date(),
  bootId = randomUUID(),
  pid = process.pid,
  processStartIdentity = null,
  hostFingerprint = null,
  platform = process.platform,
  failpoint,
} = {}, deps = {}) {
  const root = await canonicalRoot(workflowDataRoot);
  const staleOwnerBytes = await readBufferedOwner(root);
  const identity = endpointIdentity(root);
  const endpoint = endpointFor(root, identity.endpointKey, platform);
  const server = (deps.createServer ?? createServer)((socket) => socket.destroy());
  try {
    await bindEndpoint({ root, endpoint, platform, server, failpoint });
    const timestamp = utcNow(now);
    const record = validateOwnerRecord({
      schema: OWNER_SCHEMA,
      bootId,
      pid,
      processStartIdentity,
      hostFingerprint,
      acquiredAt: timestamp,
      heartbeatAt: timestamp,
      dataRootFingerprint: identity.dataRootFingerprint,
      endpointKey: identity.endpointKey,
      platform,
      state: 'active',
    });
    await failpoint?.('store.owner.before_record_persist');
    const persist = deps.persistOwnerRecord ?? (async ({ record: next }) => durableJson(join(root, 'owner.json'), next));
    await persist({ workflowDataRoot: root, record });
    await archiveBufferedOwner(root, staleOwnerBytes);
    await failpoint?.('store.owner.after_record_persist');
    return { root, endpoint, record, server, released: false, now, persistOwnerRecord: persist, failpoint };
  } catch (error) {
    try { await closeServer(server); } catch {}
    if (error instanceof WorkflowStoreOwnerError) throw error;
    if (error?.code === 'EADDRINUSE' || error?.code === 'EACCES') {
      throw ownerError('Workflow store is already owned by another process', 'WORKFLOW_STORE_OWNED', error);
    }
    throw ownerError(`Cannot acquire Workflow StoreOwner: ${error.message}`, 'WORKFLOW_STORE_IO', error);
  }
}

export async function releaseStoreOwner(owner) {
  if (!owner || owner.released) return;
  owner.released = true;
  let persistenceError;
  try {
    await owner.failpoint?.('store.owner.before_release');
    const record = validateOwnerRecord({
      ...owner.record,
      heartbeatAt: utcNow(owner.now ?? (() => new Date())),
      state: 'released',
    });
    await owner.persistOwnerRecord({ workflowDataRoot: owner.root, record });
    owner.record = record;
  } catch (error) {
    persistenceError = error;
  } finally {
    try { await closeServer(owner.server); } finally {
      if (owner.record.platform !== 'win32' && owner.record.platform !== 'linux') {
        try {
          const stat = await lstat(owner.endpoint);
          if (stat.isSocket() && owner.endpoint === join(owner.root, '.store-owner.sock')) await unlink(owner.endpoint);
        } catch (error) {
          if (error?.code !== 'ENOENT') persistenceError ??= error;
        }
      }
    }
  }
  await owner.failpoint?.('store.owner.after_release');
  if (persistenceError) throw ownerError(`Cannot persist Workflow StoreOwner release: ${persistenceError.message}`, 'WORKFLOW_STORE_IO', persistenceError);
}
