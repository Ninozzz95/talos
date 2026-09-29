import { randomUUID } from 'node:crypto';
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { canonicalHash, canonicalJson, validateCanonicalizable } from './canonical-json.mjs';
import {
  upgradeCheckpoint,
  upgradeDefinition,
  upgradeEvent,
} from './migrations.mjs';
import { workflowApply, workflowReplay, workflowReplayWithHistory, workflowStateChanges, workflowStateHash } from './run.mjs';
import { acquireStoreOwner, releaseStoreOwner } from './store-owner.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const SEGMENT = /^([0-9]{6})\.jsonl$/u;
const CHECKPOINT_FILE = /^([0-9]+)-([0-9a-f]{64})\.json$/u;
const APPROVAL_FIELDS = Object.freeze([
  'schema', 'workflowId', 'version', 'definitionHash', 'commandId',
  'approvedAt', 'approvedBy', 'commandPayloadHash',
]);
const JOURNAL_FIELDS = Object.freeze(['seq', 'event', 'prevRecordHash', 'recordHash']);
/*
 * ⭐ F3-41c (25/09/2026), decisione owner «Da parte + rename»: un run si prepara in una cartella di CANTIERE nascosta e diventa
 *   visibile con un solo rename; la cartella di un run nato a metà (nessun `run_created`) si mette da parte con un MARCATORE,
 *   come le sessioni (`session-store.mjs`, `.quarantena`). Nessuno dei due nomi è un runId: le letture dei run non li vedono.
 */
const RUN_BUILD_DIRECTORY = /^\.creating-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})-[0-9a-f-]{36}$/iu;
const RUN_QUARANTINE_MARKER = /^\.([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.quarantena$/iu;
const RENAME_TRANSIENT_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);

export class WorkflowStoreError extends Error {
  constructor(message, code = 'WORKFLOW_STORE_IO', cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'WorkflowStoreError';
    this.code = code;
  }
}

function storeError(message, code, cause) {
  return new WorkflowStoreError(message, code, cause);
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value, fields, message, code) {
  if (!plainObject(value)) throw storeError(message, code);
  const keys = Object.keys(value);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) {
    throw storeError(message, code);
  }
}

function validUtc(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function requireRunId(runId) {
  if (!UUID_V4.test(runId)) throw storeError('Workflow runId must be a v4 UUID', 'WORKFLOW_RUN_ID_INVALID');
  return runId;
}

function requireWorkflowId(workflowId) {
  if (!UUID.test(workflowId)) throw storeError('Workflow workflowId is invalid', 'WORKFLOW_DEFINITION_ID_INVALID');
  return workflowId;
}

function requireVersion(version) {
  if (!Number.isSafeInteger(version) || version < 1) {
    throw storeError('Workflow Definition version is invalid', 'WORKFLOW_DEFINITION_VERSION_INVALID');
  }
  return version;
}

function requireCommandId(commandId) {
  if (!UUID_V4.test(commandId)) throw storeError('Workflow commandId must be a v4 UUID', 'WORKFLOW_COMMAND_ID_INVALID');
  return commandId;
}

function validateResultLimits(value) {
  if (!plainObject(value)
    || Object.keys(value).length !== 2
    || !Object.hasOwn(value, 'maxItemBytes')
    || !Object.hasOwn(value, 'maxRunBytes')
    || !Number.isSafeInteger(value.maxItemBytes) || value.maxItemBytes < 1
    || !Number.isSafeInteger(value.maxRunBytes) || value.maxRunBytes < value.maxItemBytes) {
    throw storeError('Workflow result byte ceilings must be explicit positive safe integers', 'WORKFLOW_LIMIT_INVALID');
  }
  return Object.freeze({ maxItemBytes: value.maxItemBytes, maxRunBytes: value.maxRunBytes });
}

async function pathExists(path) {
  try { await stat(path); return true; } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
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
    try {
      const canonicalAncestor = await realpath(cursor);
      return resolve(canonicalAncestor, ...missing);
    } catch (error) {
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
    throw storeError(`Workflow store path cannot be resolved safely: ${error.message}`, 'WORKFLOW_STORE_NEEDS_ATTENTION', error);
  }
  if (!pathIsWithin(root, prospective)) {
    throw storeError('Workflow store path resolves outside its data root', 'WORKFLOW_STORE_NEEDS_ATTENTION');
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const canonical = await realpath(directory);
  if (!pathIsWithin(root, canonical)) {
    throw storeError('Workflow store path escapes its data root', 'WORKFLOW_STORE_NEEDS_ATTENTION');
  }
  return canonical;
}

async function validateLocation(workflowDataRoot, workspaceRoots) {
  if (typeof workflowDataRoot !== 'string' || !isAbsolute(workflowDataRoot)) {
    throw storeError('Workflow data root must be absolute', 'WORKFLOW_STORE_LOCATION_INVALID');
  }
  if (!Array.isArray(workspaceRoots)) {
    throw storeError('Workflow workspaceRoots must be an array', 'WORKFLOW_STORE_LOCATION_INVALID');
  }
  const candidate = resolve(workflowDataRoot);
  let prospectiveRoot;
  try { prospectiveRoot = await resolveProspectivePath(candidate); } catch (error) {
    throw storeError(`Workflow data root cannot be resolved safely: ${error.message}`, 'WORKFLOW_STORE_LOCATION_INVALID', error);
  }
  const canonicalWorkspaces = [];
  for (const workspaceRoot of workspaceRoots) {
    if (typeof workspaceRoot !== 'string' || !isAbsolute(workspaceRoot)) {
      throw storeError('Workflow workspace root must be absolute', 'WORKFLOW_STORE_LOCATION_INVALID');
    }
    let canonical;
    try { canonical = await realpath(workspaceRoot); } catch (error) {
      throw storeError(`Workflow workspace root cannot be resolved: ${error.message}`, 'WORKFLOW_STORE_LOCATION_INVALID', error);
    }
    canonicalWorkspaces.push(canonical);
    if (pathIsWithin(canonical, prospectiveRoot)) {
      throw storeError('Workflow data root cannot be equal to or inside a workspace', 'WORKFLOW_STORE_LOCATION_INVALID');
    }
  }
  await mkdir(candidate, { recursive: true, mode: 0o700 });
  const canonicalRoot = await realpath(candidate);
  for (const workspace of canonicalWorkspaces) {
    if (pathIsWithin(workspace, canonicalRoot)) {
      throw storeError('Workflow data root resolves inside a workspace', 'WORKFLOW_STORE_LOCATION_INVALID');
    }
  }
  return canonicalRoot;
}

function jsonBytes(value) {
  return Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
}

async function writeTemporary(path, bytes) {
  let handle;
  try {
    handle = await open(path, 'wx', 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
  } catch (error) {
    try { await handle?.close(); } catch {}
    try { await unlink(path); } catch {}
    throw error;
  }
}

async function publishCreateOnce(root, path, bytes, conflictCode) {
  await ensureContainedDirectory(root, dirname(path));
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeTemporary(temporary, bytes);
    try {
      await link(temporary, path);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const existing = await readFile(path);
      if (!existing.equals(bytes)) throw storeError(`Immutable Workflow record already exists at ${path}`, conflictCode, error);
    }
  } finally {
    try { await unlink(temporary); } catch {}
  }
}

async function durableReplace(root, path, bytes) {
  await ensureContainedDirectory(root, dirname(path));
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeTemporary(temporary, bytes);
    await rename(temporary, path);
  } catch (error) {
    try { await unlink(temporary); } catch {}
    throw error;
  }
}

/*
 * F3-41c — il rename che PUBBLICA una cartella. Su Windows un rename subito dopo aver scritto i file dentro può fallire per un
 *   blocco transitorio (antivirus, indicizzazione): EPERM/EACCES/EBUSY. Si ritenta come `graceful-fs` (attesa che cresce di 10 ms
 *   fino a 100, per al massimo 60 s; npm/write-file-atomic#227, nodejs/node#29481, letti il 25/09/2026) — ma se il bersaglio
 *   ESISTE non è un blocco: è un conflitto, e si ferma subito. Fuori da Windows il rename si rende durevole con l'fsync della
 *   cartella madre (0xkiire, «Crash consistency: fsync(), rename()»; Windows non apre le cartelle per l'fsync).
 */
async function publishDirectory(from, to, { deadlineMs = 60_000 } = {}) {
  const start = Date.now();
  let wait = 0;
  for (;;) {
    try {
      await rename(from, to);
      break;
    } catch (error) {
      if (process.platform !== 'win32' || !RENAME_TRANSIENT_CODES.has(error?.code)
        || Date.now() - start >= deadlineMs || await pathExists(to)) throw error;
      wait = Math.min(wait + 10, 100);
      await new Promise((resolveWait) => { setTimeout(resolveWait, wait); });
    }
  }
  if (process.platform !== 'win32') {
    const handle = await open(dirname(to), 'r');
    try { await handle.sync(); } finally { await handle.close(); }
  }
}

async function readContainedBytes(root, path, notFoundCode, label) {
  let canonical;
  try { canonical = await realpath(path); } catch (error) {
    if (error?.code === 'ENOENT') throw storeError(`${label} was not found`, notFoundCode, error);
    throw storeError(`Cannot resolve ${label} safely: ${error.message}`, 'WORKFLOW_STORE_IO', error);
  }
  if (!pathIsWithin(root, canonical)) {
    throw storeError(`${label} resolves outside the Workflow data root`, 'WORKFLOW_STORE_NEEDS_ATTENTION');
  }
  try { return await readFile(canonical); } catch (error) {
    throw storeError(`Cannot read ${label}: ${error.message}`, 'WORKFLOW_STORE_IO', error);
  }
}

async function readJson(root, path, notFoundCode, label) {
  let text;
  text = (await readContainedBytes(root, path, notFoundCode, label)).toString('utf8');
  try { return JSON.parse(text); } catch (error) {
    throw storeError(`${label} is not valid JSON`, 'WORKFLOW_STORE_CORRUPT', error);
  }
}

function definitionPath(store, workflowId, version) {
  return join(store.root, 'definitions', requireWorkflowId(workflowId), String(requireVersion(version)), 'record.json');
}

function approvalPath(store, workflowId, version) {
  return join(store.root, 'definitions', requireWorkflowId(workflowId), String(requireVersion(version)), 'approval.json');
}

function runRoot(store, runId) {
  return join(store.root, 'runs', requireRunId(runId));
}

function assertWritable(store) {
  if (!store || store.closed || store.state === 'closed') throw storeError('Workflow store is closed', 'WORKFLOW_STORE_CLOSED');
  if (store.state !== 'ready' || store.owner?.released) {
    throw storeError('Workflow store requires recovery attention before mutation', 'WORKFLOW_STORE_NEEDS_ATTENTION');
  }
}

function assertReadable(store) {
  if (!store || store.closed || store.state === 'closed') throw storeError('Workflow store is closed', 'WORKFLOW_STORE_CLOSED');
}

function validateApproval(value) {
  const code = 'WORKFLOW_APPROVAL_INVALID';
  exactKeys(value, APPROVAL_FIELDS, 'Workflow approval has an unknown or missing field', code);
  try { validateCanonicalizable(value); } catch (error) { throw storeError(error.message, code, error); }
  if (value.schema !== 'talos.workflow-approval.v1' || !UUID.test(value.workflowId)
    || !Number.isSafeInteger(value.version) || value.version < 1
    || !SHA256.test(value.definitionHash) || !UUID_V4.test(value.commandId)
    || !validUtc(value.approvedAt) || value.approvedBy !== 'user'
    || !SHA256.test(value.commandPayloadHash)) {
    throw storeError('Workflow approval violates its v1 contract', code);
  }
  const expected = canonicalHash({
    schema: 'talos.workflow-command-dedupe.v1',
    commandType: 'approve-definition',
    target: {
      workflowId: value.workflowId,
      definitionVersion: value.version,
      runId: null,
      nodeId: null,
      requestId: null,
    },
    payload: { definitionHash: value.definitionHash },
  });
  if (value.commandPayloadHash !== expected) throw storeError('Workflow approval commandPayloadHash mismatch', code);
  return structuredClone(value);
}

async function readApproval(store, workflowId, version) {
  const value = await readJson(
    store.root,
    approvalPath(store, workflowId, version),
    'WORKFLOW_APPROVAL_NOT_FOUND',
    'Workflow approval',
  );
  return validateApproval(value);
}

/** Read the validated, immutable approval without exposing Store paths to HTTP adapters. */
export async function readDefinitionApproval(store, { workflowId, version } = {}) {
  assertReadable(store);
  const approval = await readApproval(store, workflowId, version);
  const definition = await readDefinition(store, { workflowId, version });
  if (approval.workflowId !== definition.workflowId || approval.version !== definition.version
    || approval.definitionHash !== definition.definitionHash) {
    throw storeError('Workflow approval does not bind the stored Definition', 'WORKFLOW_STORE_NEEDS_ATTENTION');
  }
  return structuredClone(approval);
}

function wrapJournal(error, message = 'Workflow journal is corrupt') {
  if (['WORKFLOW_SCHEMA_FUTURE', 'WORKFLOW_SCHEMA_UNSUPPORTED'].includes(error?.code)) throw error;
  if (error?.code === 'WORKFLOW_JOURNAL_CORRUPT') throw error;
  throw storeError(`${message}: ${error.message}`, 'WORKFLOW_JOURNAL_CORRUPT', error);
}

function validateJournalFrame(value, expectedSeq, expectedPrevHash, runId) {
  exactKeys(value, JOURNAL_FIELDS, 'Workflow journal record framing is invalid', 'WORKFLOW_JOURNAL_CORRUPT');
  if (!Number.isSafeInteger(value.seq) || value.seq !== expectedSeq || !plainObject(value.event)
    || (value.prevRecordHash !== 'GENESIS' && !SHA256.test(value.prevRecordHash))
    || !SHA256.test(value.recordHash)) {
    throw storeError('Workflow journal record framing is invalid', 'WORKFLOW_JOURNAL_CORRUPT');
  }
  if (value.prevRecordHash !== expectedPrevHash) {
    throw storeError('Workflow journal hash chain is discontinuous', 'WORKFLOW_JOURNAL_CORRUPT');
  }
  const expectedHash = canonicalHash({ seq: value.seq, event: value.event, prevRecordHash: value.prevRecordHash });
  if (value.recordHash !== expectedHash) {
    throw storeError('Workflow journal record hash mismatch', 'WORKFLOW_JOURNAL_CORRUPT');
  }
  if (value.event.seq !== value.seq || value.event.runId !== runId) {
    throw storeError('Workflow journal record/event identity mismatch', 'WORKFLOW_JOURNAL_CORRUPT');
  }
}

async function truncateAndSync(path, size) {
  const handle = await open(path, 'r+');
  try {
    await handle.truncate(size);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function readJournal(store, runId, { repairTail = false } = {}) {
  const requestedRoot = join(runRoot(store, runId), 'journal');
  let root;
  try { root = await realpath(requestedRoot); } catch (error) {
    if (error?.code === 'ENOENT') return { events: [], records: [], lastHash: 'GENESIS', segmentNames: [], lastLineBytes: null };
    throw storeError(`Cannot resolve Workflow journal safely: ${error.message}`, 'WORKFLOW_STORE_IO', error);
  }
  if (!pathIsWithin(store.root, root)) {
    throw storeError('Workflow journal resolves outside the data root', 'WORKFLOW_STORE_NEEDS_ATTENTION');
  }
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); } catch (error) {
    throw storeError(`Cannot enumerate Workflow journal: ${error.message}`, 'WORKFLOW_STORE_IO', error);
  }
  const segments = [];
  for (const entry of entries) {
    const match = entry.isFile() ? SEGMENT.exec(entry.name) : null;
    if (!match) throw storeError(`Unexpected Workflow journal entry ${entry.name}`, 'WORKFLOW_JOURNAL_CORRUPT');
    segments.push({ number: Number(match[1]), name: entry.name });
  }
  segments.sort((left, right) => left.number - right.number);
  for (let index = 0; index < segments.length; index += 1) {
    if (segments[index].number !== index + 1) throw storeError('Workflow journal segments are discontinuous', 'WORKFLOW_JOURNAL_CORRUPT');
  }

  const events = [];
  const records = [];
  let lastLineBytes = null;
  let expectedSeq = 1;
  let expectedPrevHash = 'GENESIS';
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    lastLineBytes = null;
    const path = join(root, segments[segmentIndex].name);
    const bytes = await readFile(path);
    const isLastSegment = segmentIndex === segments.length - 1;
    const terminated = bytes.length === 0 || bytes[bytes.length - 1] === 0x0a;
    let completeBytes = bytes;
    if (!terminated) {
      if (!isLastSegment) throw storeError('Non-final Workflow journal segment is unterminated', 'WORKFLOW_JOURNAL_CORRUPT');
      const lastNewline = bytes.lastIndexOf(0x0a);
      const tailBytes = bytes.subarray(lastNewline + 1);
      try {
        const tail = new TextDecoder('utf-8', { fatal: true }).decode(tailBytes);
        JSON.parse(tail);
        throw storeError('Valid but unterminated Workflow journal record is ambiguous', 'WORKFLOW_JOURNAL_CORRUPT');
      } catch (error) {
        if (error instanceof WorkflowStoreError) throw error;
        if (repairTail) await truncateAndSync(path, lastNewline + 1);
      }
      completeBytes = bytes.subarray(0, lastNewline + 1);
    }
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(completeBytes); } catch (error) {
      throw storeError('Workflow journal committed prefix is not valid UTF-8', 'WORKFLOW_JOURNAL_CORRUPT', error);
    }
    const lines = text.split('\n');
    if (completeBytes.length === 0 || completeBytes[completeBytes.length - 1] === 0x0a) lines.pop();
    for (const line of lines) {
      if (line.length === 0) throw storeError('Workflow journal contains an empty record', 'WORKFLOW_JOURNAL_CORRUPT');
      let record;
      try { record = JSON.parse(line); } catch (error) { wrapJournal(error, 'Workflow journal contains malformed terminated JSON'); }
      validateJournalFrame(record, expectedSeq, expectedPrevHash, runId);
      let upgraded;
      try { upgraded = store.upgradeEventFn(record.event); } catch (error) { wrapJournal(error); }
      records.push({ ...record, event: upgraded });
      events.push(upgraded);
      lastLineBytes = Buffer.from(`${line}\n`, 'utf8');
      expectedSeq += 1;
      expectedPrevHash = record.recordHash;
    }
  }
  return {
    events, records, lastHash: expectedPrevHash,
    segmentNames: segments.map((segment) => segment.name), lastLineBytes,
  };
}

async function captureJournalStamp(store, runId, segmentNames, lastLineBytes) {
  const requestedRoot = join(runRoot(store, runId), 'journal');
  const root = await realpath(requestedRoot);
  if (!pathIsWithin(store.root, root)) throw storeError('Workflow journal root escaped the Store', 'WORKFLOW_JOURNAL_CHANGED');
  const entries = await readdir(root, { withFileTypes: true });
  const currentNames = entries.map((entry) => entry.name).sort();
  if (entries.some((entry) => !entry.isFile())
    || currentNames.length !== segmentNames.length
    || currentNames.some((name, index) => name !== [...segmentNames].sort()[index])) {
    throw storeError('Workflow journal segment set changed', 'WORKFLOW_JOURNAL_CHANGED');
  }
  const segments = [];
  for (const name of segmentNames) {
    const path = join(root, name);
    const info = await lstat(path, { bigint: true });
    if (!info.isFile() || !pathIsWithin(store.root, await realpath(path))) {
      throw storeError('Workflow journal segment identity changed', 'WORKFLOW_JOURNAL_CHANGED');
    }
    segments.push({ name, size: info.size, dev: info.dev, ino: info.ino,
      mtimeNs: info.mtimeNs, ctimeNs: info.ctimeNs });
  }
  const tail = lastLineBytes === null ? null : Buffer.from(lastLineBytes);
  const last = segments.at(-1);
  if (last && tail !== null) {
    if (last.size < BigInt(tail.length) || !Number.isSafeInteger(Number(last.size))) {
      throw storeError('Workflow journal tail size changed', 'WORKFLOW_JOURNAL_CHANGED');
    }
    const handle = await open(join(root, last.name), 'r');
    try {
      const observed = Buffer.alloc(tail.length);
      const { bytesRead } = await handle.read(observed, 0, observed.length, Number(last.size) - observed.length);
      if (bytesRead !== tail.length || !observed.equals(tail)) {
        throw storeError('Workflow journal tail bytes changed', 'WORKFLOW_JOURNAL_CHANGED');
      }
    } finally { await handle.close(); }
  } else if (last && last.size !== 0n) {
    throw storeError('Workflow journal tail identity is missing', 'WORKFLOW_JOURNAL_CHANGED');
  }
  return { root, segments, lastLineBytes: tail };
}

async function assertJournalStamp(store, runId, expected) {
  const observed = await captureJournalStamp(store, runId,
    expected.segments.map((segment) => segment.name), expected.lastLineBytes);
  if (observed.root !== expected.root || observed.segments.some((current, index) => {
    const prior = expected.segments[index];
    return ['size', 'dev', 'ino', 'mtimeNs', 'ctimeNs'].some((key) => current[key] !== prior[key]);
  })) throw storeError('Workflow journal changed since verified replay', 'WORKFLOW_JOURNAL_CHANGED');
}

async function runDefinition(store, runId) {
  const value = await readJson(
    store.root,
    join(runRoot(store, runId), 'definition', 'record.json'),
    'WORKFLOW_RUN_NOT_FOUND',
    'Workflow run Definition',
  );
  try { return store.upgradeDefinitionFn(value); } catch (error) {
    if (['WORKFLOW_SCHEMA_FUTURE', 'WORKFLOW_SCHEMA_UNSUPPORTED'].includes(error?.code)) throw error;
    throw storeError(`Workflow run Definition is invalid: ${error.message}`, 'WORKFLOW_STORE_CORRUPT', error);
  }
}

/* `conStoria`: lo stesso rigioco raccoglie anche la storia pubblica degli stati (`workflowStateChanges`, decisione owner 29):
   chi costruisce la cache la paga una volta sola, dentro il giro che faceva già. */
async function replayJournal(store, runId, events, { conStoria = false } = {}) {
  const definition = await runDefinition(store, runId);
  try {
    if (!conStoria) return { definition, state: workflowReplay({ definition: definition.core, runId, events }) };
    /* Owner 26/09/2026: rigioco lineare, sul posto (`run.mjs`, `workflowReplayWithHistory`) — era quadratico, 1.000 passi = 52 s. */
    const { state, history } = workflowReplayWithHistory({ definition: definition.core, runId, events });
    return { definition, state, history };
  } catch (error) {
    throw storeError(`Workflow journal cannot be replayed: ${error.message}`, 'WORKFLOW_JOURNAL_CORRUPT', error);
  }
}

function enqueueRun(store, runId, operation) {
  const previous = store.runQueues.get(runId) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  store.runQueues.set(runId, current.then(() => undefined, () => undefined));
  return current;
}

async function waitForRun(store, runId) {
  await (store.runQueues.get(runId) ?? Promise.resolve());
}

const RUN_CACHES = new WeakMap();
const ACTIVE_CLAIMS = new WeakMap();
const ADMISSION_QUEUES = new WeakMap();
/*
 * ⭐ F3-51d (25/09/2026) — chi GUARDA un run (il flusso dal vivo, decisione owner D33). Riceve solo il numero dell'ultimo fatto
 *   scritto, MAI il fatto: chi guarda rilegge dal registro col suo cursore, così un client lento non accumula niente in memoria
 *   (la coda di Hermes `api_server_runs.py:662` è un `asyncio.Queue()` senza limite, e chi si stacca perde gli eventi). Avviso
 *   dopo il `sync` e dopo la cache: chi rilegge trova il fatto. In una microtask: un errore di chi guarda non tocca un append
 *   già durevole.
 */
const RUN_WATCHERS = new WeakMap();

export function watchRun(store, { runId, onAppend } = {}) {
  assertReadable(store);
  requireRunId(runId);
  if (typeof onAppend !== 'function') throw storeError('Workflow run watcher requires onAppend', 'WORKFLOW_INVALID_INPUT');
  const perRun = RUN_WATCHERS.get(store);
  if (!perRun.has(runId)) perRun.set(runId, new Set());
  const watchers = perRun.get(runId);
  watchers.add(onAppend);
  return () => {
    watchers.delete(onAppend);
    if (watchers.size === 0 && perRun.get(runId) === watchers) perRun.delete(runId);
  };
}

/** Quanti guardano un run adesso: la prova che un client staccato non lascia un'iscrizione appesa (e un numero per il Doctor). */
export function countRunWatchers(store, { runId } = {}) {
  return RUN_WATCHERS.get(store)?.get(runId)?.size ?? 0;
}

function notifyWatchers(store, runId, seq) {
  const watchers = RUN_WATCHERS.get(store)?.get(runId);
  if (!watchers?.size) return;
  for (const onAppend of [...watchers]) queueMicrotask(() => onAppend(seq));
}
/*
 * ⭐ F3-21 (25/09/2026) — l'elenco delle proposte di una sessione viene dallo Store (fonte unica: nessuna copia nel journal della
 *   sessione) attraverso un INDICE in memoria per `initiatingSessionId`. Si costruisce dalla scansione d'avvio, che legge già
 *   ogni Definition per verificarla (zero letture in più), e si aggiorna quando una Definition nasce o viene approvata: chi
 *   scrive nello Store è uno solo (il proprietario, `store-owner.mjs`), quindi l'indice non può restare indietro rispetto al disco.
 *   Come la board di Hermes (`plugins/kanban/dashboard/plugin_api.py:291`, letto il 25/09/2026: «rollups are each one aggregate query rather than N per-task lookups»): i conteggi di una riga si
 *   calcolano una volta, mai una lettura per riga. Una Definition illeggibile alla scansione resta nelle diagnostiche e fuori
 *   dall'elenco: non si inventa una riga per un file che non si sa leggere.
 */
const DEFINITION_INDEXES = new WeakMap();

function definitionSummary(record, approved) {
  const writers = record.preflight?.estimates?.writerCount;
  return {
    workflowId: record.workflowId,
    version: record.version,
    definitionHash: record.definitionHash,
    createdAt: record.proposal.createdAt,
    title: record.core.title,
    phaseCount: Array.isArray(record.core.phases) ? record.core.phases.length : 0,
    nodeCount: record.core.nodes.length,
    edgeCount: record.core.edges.length,
    writerCount: Number.isSafeInteger(writers) ? writers : null,
    status: approved ? 'approved' : 'proposed',
  };
}

function indexDefinition(store, record, approved) {
  const index = DEFINITION_INDEXES.get(store);
  const sessionId = record.proposal?.initiatingSessionId;
  if (!index || typeof sessionId !== 'string') return;
  if (!index.has(sessionId)) index.set(sessionId, new Map());
  index.get(sessionId).set(`${record.workflowId}\u0000${record.version}`, { sessionId, summary: definitionSummary(record, approved) });
}

function markDefinitionApproved(store, record) {
  const entry = DEFINITION_INDEXES.get(store)?.get(record.proposal?.initiatingSessionId)?.get(`${record.workflowId}\u0000${record.version}`);
  if (entry) entry.summary.status = 'approved';
  else indexDefinition(store, record, true);
}

/*
 * ⭐ F3-21 (25/09/2026) — le letture di VISTA (revisione e grafo pianificato) non rivalidano a ogni pagina una Definition che
 *   non può cambiare. Misurato su 5.000 passi (record di 4,56 MB): `readFile` 1 ms, `JSON.parse` 12 ms, `upgradeDefinition`
 *   (tutto il contratto) 352 ms, `readDefinition` 530 ms — mezzo secondo per ogni pagina da 50 righe. Una Definition nasce
 *   con creazione esclusiva (`publishCreateOnce`) e lo Store ha un solo proprietario: qui si tiene la copia VERIFICATA delle
 *   ultime quattro, congelata (chi provasse a modificarla esplode invece di sporcarla), e si butta appena il file cambia
 *   dimensione, data o inode — un file toccato a mano dopo l'avvio torna alla validazione intera. ⛔ Approvazione,
 *   compilatore e run continuano a usare `readDefinition`: la cache vale solo per ciò che si guarda.
 */
const DEFINITION_VIEW_CACHES = new WeakMap();
const DEFINITION_VIEW_CACHE_MAX = 4;

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export async function readDefinitionForView(store, { workflowId, version } = {}) {
  assertReadable(store);
  const path = definitionPath(store, workflowId, version);
  let canonical, info;
  try { canonical = await realpath(path); info = await stat(canonical); } catch (error) {
    if (error?.code === 'ENOENT') throw storeError('Workflow Definition was not found', 'WORKFLOW_DEFINITION_NOT_FOUND', error);
    throw storeError(`Cannot resolve Workflow Definition safely: ${error.message}`, 'WORKFLOW_STORE_IO', error);
  }
  if (!pathIsWithin(store.root, canonical)) {
    throw storeError('Workflow Definition resolves outside the Workflow data root', 'WORKFLOW_STORE_NEEDS_ATTENTION');
  }
  const stamp = `${info.size}:${info.mtimeMs}:${info.ino}`;
  const cache = DEFINITION_VIEW_CACHES.get(store);
  const key = `${workflowId}\u0000${version}`;
  const hit = cache?.get(key);
  if (hit && hit.stamp === stamp) { cache.delete(key); cache.set(key, hit); return hit.record; }
  const record = deepFreeze(await readDefinition(store, { workflowId, version }));
  if (cache) {
    cache.delete(key);
    cache.set(key, { stamp, record });
    while (cache.size > DEFINITION_VIEW_CACHE_MAX) cache.delete(cache.keys().next().value);
  }
  return record;
}

/** Proposal summaries of one session from the in-memory index, newest first. Never reads a Core from disk. */
export function listDefinitionsForSession(store, { sessionId } = {}) {
  assertReadable(store);
  if (typeof sessionId !== 'string' || sessionId.length < 1 || sessionId.length > 128) {
    throw storeError('Workflow sessionId is invalid', 'WORKFLOW_SESSION_ID_INVALID');
  }
  const entries = [...(DEFINITION_INDEXES.get(store)?.get(sessionId)?.values() ?? [])].map(({ summary }) => ({ ...summary }));
  return entries.sort((left, right) => comparableUtcTimestamp(right.createdAt).localeCompare(comparableUtcTimestamp(left.createdAt), 'en')
    || left.workflowId.localeCompare(right.workflowId, 'en') || right.version - left.version);
}

function indexActiveClaims(store, runId, state) {
  const claims = [...state.capacityClaims.values()]
    .filter((claim) => claim.state === 'active')
    .map((claim) => structuredClone(claim));
  if (claims.length === 0) ACTIVE_CLAIMS.get(store).delete(runId);
  else ACTIVE_CLAIMS.get(store).set(runId, claims);
}

export function listActiveCapacityClaims(store) {
  assertWritable(store);
  const index = ACTIVE_CLAIMS.get(store);
  if (!index) throw storeError('Workflow admission index is unavailable', 'WORKFLOW_STORE_NEEDS_ATTENTION');
  return [...index.values()].flatMap((claims) => claims.map((claim) => structuredClone(claim)));
}

export async function withGlobalAdmission(store, operation) {
  assertWritable(store);
  if (typeof operation !== 'function') throw storeError('Workflow admission operation is required', 'WORKFLOW_STORE_IO');
  const previous = ADMISSION_QUEUES.get(store) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(async () => {
    assertWritable(store);
    return operation();
  });
  ADMISSION_QUEUES.set(store, current.then(() => undefined, () => undefined));
  return current;
}
const JOURNAL_INTEGRITY_CODES = new Set([
  'WORKFLOW_JOURNAL_CORRUPT', 'WORKFLOW_JOURNAL_CHANGED',
  'WORKFLOW_STORE_NEEDS_ATTENTION', 'WORKFLOW_SCHEMA_FUTURE', 'WORKFLOW_SCHEMA_UNSUPPORTED',
]);

// F3-41c: un run messo da parte non esiste per le letture — e chiederlo (un vecchio link) non deve dichiarare rotto lo Store intero
function assertRunNotSetAside(store, runId) {
  if (store.quarantineMarked?.has(runId)) throw storeError('Workflow run was set aside at startup: it has no run_created fact', 'WORKFLOW_RUN_NOT_FOUND');
}

async function readVerifiedJournal(store, runId, options, { conStoria = false } = {}) {
  assertRunNotSetAside(store, runId);
  try {
    const journal = await readJournal(store, runId, options);
    const replayed = await replayJournal(store, runId, journal.events, { conStoria });
    return { journal, ...replayed };
  } catch (error) {
    if (JOURNAL_INTEGRITY_CODES.has(error?.code)) {
      RUN_CACHES.get(store)?.delete(runId);
      ACTIVE_CLAIMS.get(store)?.delete(runId);
      store.state = 'needs_attention';
    }
    throw error;
  }
}

async function verifiedRunCache(store, runId) {
  assertRunNotSetAside(store, runId);
  const runCache = RUN_CACHES.get(store);
  const existing = runCache.get(runId);
  if (existing) return existing;
  const journal = await readJournal(store, runId, { repairTail: true });
  const { state, history } = await replayJournal(store, runId, journal.events, { conStoria: true });
  const stamp = await captureJournalStamp(store, runId, journal.segmentNames, journal.lastLineBytes);
  const cache = { state, lastHash: journal.lastHash, stamp, events: journal.events, history };
  runCache.set(runId, cache);
  indexActiveClaims(store, runId, state);
  return cache;
}

/*
 * ⭐ F3-41b (25/09/2026) — le LETTURE dalla stessa cache delle scritture. Prima ogni `readEvents`/`readRunState` rileggeva e
 *   riverificava tutto il giornale dal disco e lo rigiocava (e `workflowApply` clona lo stato intero a ogni evento): misurati
 *   130-365 ms per rileggere un run di ~100 eventi, e un passo dello scheduler ne fa decine ⇒ un Workflow di 12 passi non
 *   finiva in 20 s. La cache è quella che le scritture usano già (stato e impronta dei file dopo l'ultimo append); una lettura
 *   la usa solo se l'impronta dei segmenti (dimensione, inode, mtime, ctime) è ancora quella — la stessa garanzia su cui si
 *   appoggia ogni append. Impronta cambiata ⇒ la cache si butta e si rilegge tutto, con tutte le verifiche di integrità.
 *   Il modello è la cache locale degli aggregati di Marten («node-local cache of aggregate snapshots»,
 *   martendb.io/events/optimizing.html, letto il 25/09/2026).
 */
async function cachedRunView(store, runId) {
  const cache = RUN_CACHES.get(store)?.get(runId);
  if (!cache?.events) return null;
  try {
    await assertJournalStamp(store, runId, cache.stamp);
  } catch (error) {
    if (error?.code === 'WORKFLOW_JOURNAL_CHANGED') { RUN_CACHES.get(store).delete(runId); return null; }
    throw error;
  }
  return cache;
}

async function appendEventInternal(store, event) {
  const upgraded = store.upgradeEventFn(event);
  const runId = requireRunId(upgraded.runId);
  let writeStarted = false;
  let candidateRejected = false;
  try {
    const cache = await verifiedRunCache(store, runId);
    await assertJournalStamp(store, runId, cache.stamp);
    if (upgraded.seq !== cache.state.lastSeq + 1) {
      throw storeError(`Workflow event seq must be ${cache.state.lastSeq + 1}`, 'WORKFLOW_JOURNAL_SEQUENCE_CONFLICT');
    }
    let nextState;
    try { nextState = workflowApply(cache.state, upgraded); } catch (error) {
      candidateRejected = true;
      throw storeError(`Workflow journal cannot be replayed: ${error.message}`, 'WORKFLOW_JOURNAL_CORRUPT', error);
    }
    const record = {
      seq: upgraded.seq,
      event: upgraded,
      prevRecordHash: cache.lastHash,
      recordHash: null,
    };
    record.recordHash = canonicalHash({ seq: record.seq, event: record.event, prevRecordHash: record.prevRecordHash });
    const bytes = jsonBytes(record);
    const journalRoot = join(runRoot(store, runId), 'journal');
    await ensureContainedDirectory(store.root, journalRoot);
    const segmentNames = cache.stamp.segments.map((segment) => segment.name);
    const segmentName = segmentNames.at(-1) ?? '000001.jsonl';
    if (segmentNames.length === 0) segmentNames.push(segmentName);
    const segment = join(journalRoot, segmentName);
    await store.failpoint?.('store.journal.before_append', { runId, seq: upgraded.seq });
    const handle = await open(segment, 'a', 0o600);
    try {
      writeStarted = true;
      await handle.writeFile(bytes);
      await handle.sync();
    } finally { await handle.close(); }
    await store.failpoint?.('store.journal.after_sync_before_cache', { runId, seq: upgraded.seq });
    const stamp = await captureJournalStamp(store, runId, segmentNames, bytes);
    /* La storia degli stati cresce IN CODA sullo stesso array (voci congelate; chi legge ne riceve una copia, `readRunHistory`):
       ricopiarla a ogni fatto sarebbe quadratico, e a 5.000 passi le voci sono decine di migliaia. Si aggiunge solo qui, dopo
       il giornale scritto e sincronizzato: un fatto rifiutato o non scritto non lascia voci. */
    if (cache.history) for (const voce of workflowStateChanges(cache.state, nextState, upgraded)) cache.history.push(voce);
    RUN_CACHES.get(store).set(runId, { state: nextState, lastHash: record.recordHash, stamp,
      events: cache.events ? [...cache.events, structuredClone(upgraded)] : null, history: cache.history ?? null });
    indexActiveClaims(store, runId, nextState);
    notifyWatchers(store, runId, upgraded.seq);
    return structuredClone(upgraded);
  } catch (error) {
    RUN_CACHES.get(store).delete(runId);
    if (writeStarted || error?.code === 'WORKFLOW_JOURNAL_CHANGED'
      || (!candidateRejected && ['WORKFLOW_JOURNAL_CORRUPT', 'WORKFLOW_SCHEMA_FUTURE', 'WORKFLOW_SCHEMA_UNSUPPORTED'].includes(error?.code))) {
      store.state = 'needs_attention';
    }
    throw error;
  }
}

async function scanExistingStore(store) {
  const diagnostics = [];
  const definitionsRoot = join(store.root, 'definitions');
  const runsRoot = join(store.root, 'runs');
  for (const [path, label] of [[definitionsRoot, 'definitions'], [runsRoot, 'runs']]) {
    await ensureContainedDirectory(store.root, path);
    let entries;
    try { entries = await readdir(path, { withFileTypes: true }); } catch (error) {
      diagnostics.push({ scope: label, code: 'WORKFLOW_STORE_IO', message: error.message });
      continue;
    }
    const marked = label === 'runs'
      ? new Set(entries.filter((entry) => entry.isFile()).map((entry) => RUN_QUARANTINE_MARKER.exec(entry.name)?.[1]).filter(Boolean))
      : new Set();
    for (const entry of entries) {
      if (label === 'runs' && entry.isFile() && RUN_QUARANTINE_MARKER.test(entry.name)) continue;
      if (!entry.isDirectory()) {
        diagnostics.push({ scope: `${label}/${entry.name}`, code: 'WORKFLOW_STORE_CORRUPT', message: 'unexpected non-directory entry' });
        continue;
      }
      /*
       * ⭐ F3-41c — ciò che un crollo lascia a metà non ferma più lo Store (owner 25/09, «Da parte + rename»): un CANTIERE mai
       *   pubblicato e un run senza `run_created` si mettono da parte, si dicono in `quarantinedRuns` col motivo, e restano sul
       *   disco. Un giornale che ha fatti ma non si rigioca resta invece una diagnostica: quello è un danno, non una nascita a metà.
       */
      if (label === 'runs' && RUN_BUILD_DIRECTORY.test(entry.name)) {
        store.quarantinedRuns.push({ scope: `${label}/${entry.name}`, runId: RUN_BUILD_DIRECTORY.exec(entry.name)[1],
          code: 'WORKFLOW_RUN_CREATION_INTERRUPTED', message: 'run creation stopped before it was published; kept aside, nothing deleted' });
        continue;
      }
      if (label === 'runs' && marked.has(entry.name)) {
        store.quarantineMarked.add(entry.name);
        store.quarantinedRuns.push({ scope: `${label}/${entry.name}`, runId: entry.name,
          code: 'WORKFLOW_RUN_HALF_CREATED', message: 'run has no run_created fact; kept aside, nothing deleted' });
        continue;
      }
      if (label === 'definitions') {
        if (!UUID.test(entry.name)) {
          diagnostics.push({ scope: `${label}/${entry.name}`, code: 'WORKFLOW_STORE_CORRUPT', message: 'invalid workflowId directory' });
          continue;
        }
        const versions = await readdir(join(path, entry.name), { withFileTypes: true });
        for (const versionEntry of versions) {
          const version = Number(versionEntry.name);
          if (!versionEntry.isDirectory() || !Number.isSafeInteger(version) || version < 1 || String(version) !== versionEntry.name) {
            diagnostics.push({ scope: `${label}/${entry.name}/${versionEntry.name}`, code: 'WORKFLOW_STORE_CORRUPT', message: 'invalid Definition version directory' });
            continue;
          }
          try {
            const record = await readDefinition(store, { workflowId: entry.name, version });
            const approved = await pathExists(approvalPath(store, entry.name, version));
            if (approved) {
              const accepted = await readApproval(store, entry.name, version);
              if (accepted.definitionHash !== record.definitionHash) throw storeError('Approval/Definition hash mismatch', 'WORKFLOW_APPROVAL_INVALID');
            }
            indexDefinition(store, record, approved);
          } catch (error) {
            diagnostics.push({ scope: `${label}/${entry.name}/${version}`, code: error.code ?? 'WORKFLOW_STORE_CORRUPT', message: error.message });
          }
        }
      } else {
        if (!UUID_V4.test(entry.name)) {
          diagnostics.push({ scope: `${label}/${entry.name}`, code: 'WORKFLOW_STORE_CORRUPT', message: 'invalid runId directory' });
          continue;
        }
        try {
          const journal = await readJournal(store, entry.name, { repairTail: true });
          if (journal.events.length === 0) {
            await publishCreateOnce(store.root, join(path, `.${entry.name}.quarantena`), jsonBytes({
              schema: 'talos.workflow-run-quarantine.v1', runId: entry.name, reason: 'no_run_created',
              markedAt: new Date().toISOString(),
            }), 'WORKFLOW_STORE_CORRUPT');
            store.quarantineMarked.add(entry.name);
            store.quarantinedRuns.push({ scope: `${label}/${entry.name}`, runId: entry.name,
              code: 'WORKFLOW_RUN_HALF_CREATED', message: 'run has no run_created fact; kept aside, nothing deleted' });
            continue;
          }
          if (journal.events[0].type !== 'run_created') {
            throw storeError('Workflow run has no durable run_created event', 'WORKFLOW_JOURNAL_CORRUPT');
          }
          const { state } = await replayJournal(store, entry.name, journal.events);
          const stamp = await captureJournalStamp(store, entry.name, journal.segmentNames, journal.lastLineBytes);
          RUN_CACHES.get(store).set(entry.name, { state, lastHash: journal.lastHash, stamp });
          indexActiveClaims(store, entry.name, state);
        } catch (error) {
          diagnostics.push({ scope: `${label}/${entry.name}`, code: error.code ?? 'WORKFLOW_STORE_CORRUPT', message: error.message });
        }
      }
    }
  }
  return diagnostics;
}

export async function createWorkflowStore({
  workflowDataRoot,
  workspaceRoots = [],
  resultLimits,
} = {}, deps = {}) {
  const limits = validateResultLimits(resultLimits);
  const root = await validateLocation(workflowDataRoot, workspaceRoots);
  const failpoint = deps.failpoint;
  const owner = await acquireStoreOwner({ workflowDataRoot: root, failpoint }, deps.storeOwnerDeps ?? {});
  const store = {
    root,
    owner,
    resultLimits: limits,
    state: 'recovering',
    diagnostics: [],
    // F3-41c: i run messi da parte all'apertura (non fermano lo Store; il Doctor li può dire) e i runId esclusi dalle letture
    quarantinedRuns: [],
    quarantineMarked: new Set(),
    closed: false,
    runQueues: new Map(),
    failpoint,
    upgradeEventFn: deps.upgradeEventFn ?? upgradeEvent,
    upgradeDefinitionFn: deps.upgradeDefinitionFn ?? upgradeDefinition,
    upgradeCheckpointFn: deps.upgradeCheckpointFn ?? upgradeCheckpoint,
    durability: Object.freeze({
      processCrash: 'file-sync-before-resolution',
      powerLoss: 'target-filesystem-certification-required',
    }),
  };
  RUN_CACHES.set(store, new Map());
  RUN_WATCHERS.set(store, new Map());
  ACTIVE_CLAIMS.set(store, new Map());
  ADMISSION_QUEUES.set(store, Promise.resolve());
  DEFINITION_INDEXES.set(store, new Map());
  DEFINITION_VIEW_CACHES.set(store, new Map());
  store.close = async () => {
    if (store.closed) return;
    await ADMISSION_QUEUES.get(store);
    await Promise.all([...store.runQueues.values()]);
    RUN_CACHES.get(store).clear();
    RUN_CACHES.delete(store);
    RUN_WATCHERS.delete(store);
    ACTIVE_CLAIMS.get(store).clear();
    ACTIVE_CLAIMS.delete(store);
    ADMISSION_QUEUES.delete(store);
    DEFINITION_INDEXES.delete(store);
    DEFINITION_VIEW_CACHES.delete(store);
    store.closed = true;
    store.state = 'closed';
    await releaseStoreOwner(owner);
  };
  try {
    await failpoint?.('store.startup.after_owner_before_recovery', { store });
    store.diagnostics = await scanExistingStore(store);
    store.state = store.diagnostics.length === 0 ? 'ready' : 'needs_attention';
    await failpoint?.('store.startup.after_recovery', { store });
    return store;
  } catch (error) {
    await store.close();
    throw error;
  }
}

export async function createDefinition(store, { record } = {}) {
  assertWritable(store);
  const upgraded = store.upgradeDefinitionFn(record);
  const path = definitionPath(store, upgraded.workflowId, upgraded.version);
  await publishCreateOnce(store.root, path, jsonBytes(upgraded), 'WORKFLOW_DEFINITION_CONFLICT');
  indexDefinition(store, upgraded, false);
  return structuredClone(upgraded);
}

export async function readDefinition(store, { workflowId, version } = {}) {
  assertReadable(store);
  const value = await readJson(
    store.root,
    definitionPath(store, workflowId, version),
    'WORKFLOW_DEFINITION_NOT_FOUND',
    'Workflow Definition',
  );
  try { return store.upgradeDefinitionFn(value); } catch (error) {
    if (['WORKFLOW_SCHEMA_FUTURE', 'WORKFLOW_SCHEMA_UNSUPPORTED'].includes(error?.code)) throw error;
    throw storeError(`Workflow Definition is invalid: ${error.message}`, 'WORKFLOW_STORE_CORRUPT', error);
  }
}

export async function approveDefinition(store, { approval } = {}) {
  assertWritable(store);
  const accepted = validateApproval(approval);
  const definition = await readDefinition(store, {
    workflowId: accepted.workflowId,
    version: accepted.version,
  });
  if (definition.definitionHash !== accepted.definitionHash) {
    throw storeError('Workflow approval does not bind the stored Definition', 'WORKFLOW_APPROVAL_INVALID');
  }
  await publishCreateOnce(
    store.root,
    approvalPath(store, accepted.workflowId, accepted.version),
    jsonBytes(accepted),
    'WORKFLOW_APPROVAL_CONFLICT',
  );
  markDefinitionApproved(store, definition);
  return structuredClone(accepted);
}

export async function createRun(store, { event } = {}) {
  assertWritable(store);
  const created = store.upgradeEventFn(event);
  if (created.type !== 'run_created' || created.seq !== 1) {
    throw storeError('Workflow run must start with run_created at seq 1', 'WORKFLOW_RUN_CREATE_INVALID');
  }
  const root = runRoot(store, created.runId);
  if (await pathExists(root)) throw storeError('Workflow run already exists', 'WORKFLOW_RUN_CONFLICT');
  const definition = await readDefinition(store, {
    workflowId: created.payload.workflowId,
    version: created.payload.definitionVersion,
  });
  const approval = await readApproval(store, created.payload.workflowId, created.payload.definitionVersion);
  if (definition.definitionHash !== created.payload.definitionHash
    || approval.definitionHash !== created.payload.definitionHash) {
    throw storeError('Workflow run does not bind the approved Definition', 'WORKFLOW_RUN_CREATE_INVALID');
  }
  /*
   * ⭐ F3-41c (25/09/2026), decisione owner «Da parte + rename»: prima le tre cartelle, la copia della Definition e il
   *   `run_created` si scrivevano DENTRO la cartella del run, e un crollo in mezzo lasciava un run senza fatti che alla
   *   riapertura fermava l'intero Store. Ora tutto si prepara in un CANTIERE nascosto e il run appare con un rename solo:
   *   o c'è intero, col suo primo fatto, o non c'è. Il primo fatto si valida contro la Definition PRIMA di pubblicare
   *   (come `appendEventInternal` fa con `workflowApply`), quindi un fatto rifiutato non lascia niente.
   */
  const sourceBytes = await readContainedBytes(
    store.root,
    definitionPath(store, definition.workflowId, definition.version),
    'WORKFLOW_DEFINITION_NOT_FOUND',
    'Workflow Definition',
  );
  try {
    workflowReplay({ definition: definition.core, runId: created.runId, events: [created] });
  } catch (error) {
    throw storeError(`Workflow run_created is not valid for its Definition: ${error.message}`, 'WORKFLOW_RUN_CREATE_INVALID', error);
  }
  const build = join(store.root, 'runs', `.creating-${created.runId}-${randomUUID()}`);
  let published = false;
  try {
    await ensureContainedDirectory(store.root, join(build, 'definition'));
    await ensureContainedDirectory(store.root, join(build, 'journal'));
    await ensureContainedDirectory(store.root, join(build, 'checkpoints'));
    await publishCreateOnce(store.root, join(build, 'definition', 'record.json'), sourceBytes, 'WORKFLOW_RUN_CONFLICT');
    const record = { seq: 1, event: created, prevRecordHash: 'GENESIS', recordHash: null };
    record.recordHash = canonicalHash({ seq: record.seq, event: record.event, prevRecordHash: record.prevRecordHash });
    await writeTemporary(join(build, 'journal', '000001.jsonl'), jsonBytes(record));
    await store.failpoint?.('store.run.before_publish', { runId: created.runId });
    await enqueueRun(store, created.runId, async () => {
      await publishDirectory(build, root);
      published = true;
      await verifiedRunCache(store, created.runId);
    });
  } catch (error) {
    // il cantiere è di QUESTA chiamata e non è mai stato pubblicato: si toglie (un crollo vero lo lascia, e l'avvio lo mette da parte)
    if (!published) { try { await rm(build, { recursive: true, force: true }); } catch {} }
    if (published) store.state = 'needs_attention';
    if (!published && error?.code === 'EEXIST') throw storeError('Workflow run already exists', 'WORKFLOW_RUN_CONFLICT', error);
    throw error;
  }
  return { runId: created.runId, event: structuredClone(created), definition: structuredClone(definition) };
}

export async function appendEvent(store, { event } = {}) {
  assertWritable(store);
  const runId = requireRunId(event?.runId);
  return enqueueRun(store, runId, () => appendEventInternal(store, event));
}

/*
 * ⭐ Owner 26/09/2026 («i run si eliminano con la loro sessione, e la conferma lo dice») — fino a oggi, eliminata una
 *   conversazione, i suoi run restavano nel registro orfani e irraggiungibili (sul 4174 ce ne sono, delle sessioni eliminate
 *   il 25/09). Questa è l'unica porta che toglie un run.
 * ⛔ Solo un run FINITO (riuscito, fallito, annullato): uno in corso ha passi che lavorano, e togliergli il giornale sotto i
 *   piedi sarebbe un danno — si rifiuta per nome (`WORKFLOW_RUN_NOT_FINISHED`), come la sessione in corso che non si elimina.
 * ⛔ Nella coda del run, così nessuna scrittura in volo lo ripopola; la cartella si RINOMINA prima nella cartella temporanea del
 *   registro (un lettore vede il run intero o non lo vede, mai a metà) e solo dopo si rimuove.
 */
const STATI_FINALI_DEL_RUN = new Set(['succeeded', 'failed', 'cancelled']);
export async function removeRun(store, { runId } = {}) {
  assertWritable(store);
  requireRunId(runId);
  return enqueueRun(store, runId, async () => {
    const cache = await verifiedRunCache(store, runId);
    const stato = cache.state.run?.status ?? null;
    if (!STATI_FINALI_DEL_RUN.has(stato)) {
      throw storeError(`Workflow run ${runId} is not finished (${stato ?? 'unknown'}): cancel it before removing it`, 'WORKFLOW_RUN_NOT_FINISHED');
    }
    const cartellaTemporanea = join(store.root, 'temp');
    await mkdir(cartellaTemporanea, { recursive: true });
    const parcheggio = join(cartellaTemporanea, `rimosso-${runId}-${randomUUID()}`);
    await rename(runRoot(store, runId), parcheggio);
    RUN_CACHES.get(store)?.delete(runId);
    ACTIVE_CLAIMS.get(store)?.delete(runId);
    await rm(parcheggio, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    return { runId, removed: true, status: stato };
  });
}

export async function readEvents(store, { runId } = {}) {
  assertReadable(store);
  requireRunId(runId);
  await waitForRun(store, runId);
  const cache = await cachedRunView(store, runId);
  if (cache) return structuredClone(cache.events);
  const { journal } = await readVerifiedJournal(store, runId);
  return structuredClone(journal.events);
}

/** Verified internal state for bounded public projections; never send it directly over HTTP. */
export async function readRunState(store, { runId } = {}) {
  assertReadable(store);
  requireRunId(runId);
  await waitForRun(store, runId);
  const cache = await cachedRunView(store, runId);
  if (cache) return { state: structuredClone(cache.state), events: structuredClone(cache.events) };
  const { journal, state } = await readVerifiedJournal(store, runId);
  return { state: structuredClone(state), events: structuredClone(journal.events) };
}

/**
 * La storia pubblica degli stati (decisione owner 29), per `projectWorkflowStateHistory`. Dalla cache delle scritture quando
 * c'è ed è ancora quella del disco (`cachedRunView`); altrimenti — un run caricato alla scansione d'avvio, che non tiene gli
 * eventi in memoria — un rigioco verificato dal disco, come fa `readRunState`. ⛔ Degli eventi torna solo il PRIMO (`run_created`):
 * la rotta ci controlla la sessione proprietaria, e ricopiare decine di migliaia di fatti per una pagina di storia non serve.
 */
export async function readRunHistory(store, { runId } = {}) {
  assertReadable(store);
  requireRunId(runId);
  await waitForRun(store, runId);
  const cache = await cachedRunView(store, runId);
  if (cache?.history) {
    return { state: structuredClone(cache.state), events: cache.events.slice(0, 1).map((event) => structuredClone(event)),
      lastAt: cache.events.at(-1)?.at ?? null, history: cache.history.slice() };
  }
  const { journal, state, history } = await readVerifiedJournal(store, runId, undefined, { conStoria: true });
  return { state, events: journal.events.slice(0, 1), lastAt: journal.events.at(-1)?.at ?? null, history };
}

export async function listRunIds(store) {
  assertReadable(store);
  const entries = await readdir(join(store.root, 'runs'), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && UUID_V4.test(entry.name) && !store.quarantineMarked?.has(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, 'en'));
}

export async function writeCheckpoint(store, { checkpoint } = {}) {
  assertWritable(store);
  const runId = requireRunId(checkpoint?.runId);
  return enqueueRun(store, runId, async () => {
    const upgraded = store.upgradeCheckpointFn(checkpoint);
    const { journal } = await readVerifiedJournal(store, runId, { repairTail: true });
    if (upgraded.throughSeq > journal.events.length) {
      throw storeError('Workflow checkpoint is ahead of the durable journal', 'WORKFLOW_CHECKPOINT_INVALID');
    }
    const { definition, state } = await replayJournal(store, runId, journal.events.slice(0, upgraded.throughSeq));
    if (upgraded.definitionHash !== definition.definitionHash
      || upgraded.graphVersion !== state.run.graphVersion
      || upgraded.stateHash !== workflowStateHash(state)) {
      throw storeError('Workflow checkpoint does not match journal replay', 'WORKFLOW_CHECKPOINT_INVALID');
    }
    const filename = `${upgraded.throughSeq}-${upgraded.stateHash.slice('sha256:'.length)}.json`;
    const directory = join(runRoot(store, runId), 'checkpoints');
    await publishCreateOnce(store.root, join(directory, filename), jsonBytes(upgraded), 'WORKFLOW_CHECKPOINT_CONFLICT');
    await store.failpoint?.('store.checkpoint.after_generation_before_current', { runId, filename });
    await durableReplace(store.root, join(directory, 'CURRENT'), Buffer.from(`${filename}\n`, 'utf8'));
    return structuredClone(upgraded);
  });
}

export async function readSnapshot(store, { runId } = {}) {
  assertReadable(store);
  requireRunId(runId);
  await waitForRun(store, runId);
  const { journal, definition } = await readVerifiedJournal(store, runId);
  const directory = join(runRoot(store, runId), 'checkpoints');
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw storeError(`Cannot enumerate Workflow checkpoints: ${error.message}`, 'WORKFLOW_STORE_IO', error);
  }
  const accepted = [];
  for (const entry of entries) {
    const match = entry.isFile() ? CHECKPOINT_FILE.exec(entry.name) : null;
    if (!match) continue;
    try {
      const value = store.upgradeCheckpointFn(JSON.parse(await readFile(join(directory, entry.name), 'utf8')));
      if (value.runId !== runId || value.definitionHash !== definition.definitionHash
        || value.throughSeq > journal.events.length
        || String(value.throughSeq) !== match[1]
        || value.stateHash.slice('sha256:'.length) !== match[2]) continue;
      const replayed = await replayJournal(store, runId, journal.events.slice(0, value.throughSeq));
      if (value.graphVersion !== replayed.state.run.graphVersion
        || value.stateHash !== workflowStateHash(replayed.state)) continue;
      accepted.push(value);
    } catch (error) {
      if (['WORKFLOW_SCHEMA_FUTURE', 'WORKFLOW_SCHEMA_UNSUPPORTED'].includes(error?.code)) throw error;
    }
  }
  accepted.sort((left, right) => right.throughSeq - left.throughSeq
    || left.stateHash.localeCompare(right.stateHash, 'en'));
  if (accepted.length > 1 && accepted[0].throughSeq === accepted[1].throughSeq
    && accepted[0].stateHash !== accepted[1].stateHash) {
    throw storeError('Workflow checkpoints conflict at the same journal sequence', 'WORKFLOW_CHECKPOINT_CORRUPT');
  }
  return accepted.length ? structuredClone(accepted[0]) : null;
}

export async function listRunsForSession(store, { rootSessionId } = {}) {
  return (await listRunSummariesForSession(store, { rootSessionId })).map(({ runId }) => runId);
}

function comparableUtcTimestamp(at) {
  const [seconds, fraction = ''] = at.slice(0, -1).split('.');
  return `${seconds}.${fraction.padEnd(64, '0')}`;
}

/** Safe list metadata from verified run_created facts, newest first. */
export async function listRunSummariesForSession(store, { rootSessionId } = {}) {
  assertReadable(store);
  if (!UUID_V4.test(rootSessionId)) throw storeError('Workflow rootSessionId must be a v4 UUID', 'WORKFLOW_SESSION_ID_INVALID');
  const root = join(store.root, 'runs');
  const entries = await readdir(root, { withFileTypes: true });
  const matches = [];
  const definitions = new Map();
  for (const entry of entries) {
    if (!entry.isDirectory() || !UUID_V4.test(entry.name) || store.quarantineMarked?.has(entry.name)) continue;
    const { state, events } = await readRunState(store, { runId: entry.name });
    if (events[0]?.type === 'run_created' && events[0].payload.rootSessionId === rootSessionId) {
      const { workflowId, definitionVersion: version, definitionHash } = events[0].payload;
      const key = `${workflowId}:${version}`;
      if (!definitions.has(key)) definitions.set(key, await readDefinition(store, { workflowId, version }));
      const definition = definitions.get(key);
      if (definition.definitionHash !== definitionHash) {
        throw storeError('Workflow run does not match its verified Definition', 'WORKFLOW_STORE_CORRUPT');
      }
      const startedAt = events.find((event) => event.type === 'run_started')?.at ?? null;
      const finishedAt = events.find((event) => ['run_succeeded', 'run_failed', 'run_cancelled'].includes(event.type))?.at ?? null;
      const startMs = startedAt === null ? NaN : Date.parse(startedAt);
      const finishMs = finishedAt === null ? NaN : Date.parse(finishedAt);
      const durationMs = Number.isFinite(startMs) && Number.isFinite(finishMs) && finishMs >= startMs
        ? finishMs - startMs : null;
      const nodeStates = [...state.nodes.values()].map((node) => node.state);
      const terminal = new Set(['succeeded', 'failed', 'cancelled', 'skipped', 'superseded']);
      const active = new Set(['leased', 'running', 'retry_wait', 'waiting_human', 'reconciling']);
      const models = new Set(events.filter((event) => event.type === 'agent_session_created')
        .map((event) => event.payload?.model).filter((model) => typeof model === 'string' && model));
      /* F3 Workflow UI (25/09/2026): la card della proposta nel transcript deve ritrovare, anche dopo una ricarica, il SUO run
         e dirne lo stato — prima la riga portava solo id e data, e nessuna lettura pubblica legava un run al suo workflow. */
      matches.push({ runId: entry.name, createdAt: events[0].at, workflowId: events[0].payload.workflowId,
        version, status: state.run?.status ?? null, title: definition.core.title,
        startedAt, finishedAt, durationMs,
        steps: { total: nodeStates.length, terminal: nodeStates.filter((status) => terminal.has(status)).length,
          failed: nodeStates.filter((status) => status === 'failed').length,
          active: nodeStates.filter((status) => active.has(status)).length },
        model: models.size === 0 ? 'unknown' : models.size === 1 ? [...models][0] : 'mixed' });
    }
  }
  return matches.sort((left, right) => comparableUtcTimestamp(right.createdAt).localeCompare(comparableUtcTimestamp(left.createdAt), 'en')
    || left.runId.localeCompare(right.runId, 'en'));
}

function receiptFromApproval(value) {
  return {
    schema: 'talos.workflow-command-receipt.v1',
    commandId: value.commandId,
    commandType: 'approve-definition',
    payloadHash: value.commandPayloadHash,
    acceptedAt: value.approvedAt,
    source: 'approval-record',
    runId: null,
    resultingSeq: null,
    resultingGraphVersion: null,
    outcome: 'accepted',
    errorCode: null,
  };
}

/*
 * F3-31 (25/09/2026): la ricevuta ricavata da un fatto porta il `runId` del giornale in cui sta — per `start-run` è l'unico
 *   modo in cui la ripetizione dello stesso comando risolve lo STESSO run. ⛔ Solo qui, nella ricevuta PROIETTATA dallo Store:
 *   quella del riduttore (`run.mjs` `commandReceipt`) entra nello stato e nell'impronta dei checkpoint già su disco, e non cambia.
 */
function receiptFromEvent(value) {
  return {
    schema: 'talos.workflow-command-receipt.v1',
    commandId: value.commandId,
    commandType: value.commandType,
    payloadHash: value.commandPayloadHash,
    acceptedAt: value.at,
    source: 'journal-event',
    runId: value.runId,
    resultingSeq: value.seq,
    resultingGraphVersion: value.graphVersion,
    outcome: 'accepted',
    errorCode: null,
  };
}

function acceptReceipt(current, candidate) {
  if (current === null) return candidate;
  if (current.commandType !== candidate.commandType || current.payloadHash !== candidate.payloadHash) {
    throw storeError('Workflow commandId is bound to conflicting durable receipts', 'WORKFLOW_COMMAND_CONFLICT');
  }
  return current;
}

export async function lookupCommandReceipt(store, { commandId } = {}) {
  assertReadable(store);
  requireCommandId(commandId);
  let found = null;
  const definitionsRoot = join(store.root, 'definitions');
  const workflows = await readdir(definitionsRoot, { withFileTypes: true });
  for (const workflow of workflows) {
    if (!workflow.isDirectory() || !UUID.test(workflow.name)) continue;
    const versions = await readdir(join(definitionsRoot, workflow.name), { withFileTypes: true });
    for (const versionEntry of versions) {
      const version = Number(versionEntry.name);
      if (!versionEntry.isDirectory() || !Number.isSafeInteger(version) || version < 1) continue;
      if (!(await pathExists(approvalPath(store, workflow.name, version)))) continue;
      const approval = await readApproval(store, workflow.name, version);
      if (approval.commandId === commandId) found = acceptReceipt(found, receiptFromApproval(approval));
    }
  }
  const runs = await readdir(join(store.root, 'runs'), { withFileTypes: true });
  for (const run of runs) {
    if (!run.isDirectory() || !UUID_V4.test(run.name) || store.quarantineMarked?.has(run.name)) continue;
    const events = await readEvents(store, { runId: run.name });
    for (const event of events) {
      if (event.commandId === commandId) found = acceptReceipt(found, receiptFromEvent(event));
    }
  }
  return found === null ? null : structuredClone(found);
}
