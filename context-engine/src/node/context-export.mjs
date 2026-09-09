import { createHash } from 'node:crypto';
import { ContextStoreError } from './sqlite-store.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw new ContextStoreError(message, 'CTX_ARCHIVE_INVALID'); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !value.includes('\0');
const integer = value => Number.isSafeInteger(value) && value >= 0;
const date = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const textOf = message => typeof message.content === 'string' ? message.content : Array.isArray(message.content) ? message.content.filter(part => part && ['text', 'input_text', 'output_text'].includes(part.type) && typeof part.text === 'string').map(part => part.text).join('\n') : '';

function jsonData(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return;
  if ((!object(value) && !Array.isArray(value)) || ancestors.has(value)) fail('Archive must contain finite, acyclic JSON values');
  ancestors.add(value);
  if (Array.isArray(value) && Object.keys(value).length !== value.length) fail('Sparse arrays are not JSON data');
  for (const child of Object.values(value)) jsonData(child, ancestors);
  ancestors.delete(value);
}

function settings(value) {
  const keys = ['auto', 'model', 'triggerRatio', 'targetRatio', 'retainRecentTurns', 'focus', 'nativeMode', 'semanticSearch'];
  if (!object(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail('Invalid context settings');
  if (typeof value.auto !== 'boolean' || typeof value.semanticSearch !== 'boolean' || typeof value.targetRatio !== 'number' || typeof value.triggerRatio !== 'number' || !(value.targetRatio > 0 && value.targetRatio < value.triggerRatio && value.triggerRatio < 1) || !integer(value.retainRecentTurns) || value.retainRecentTurns > 100 || typeof value.focus !== 'string' || value.focus.length > 8000 || !['off', 'qualified'].includes(value.nativeMode)) fail('Invalid context settings values');
  if (!object(value.model) || !['follow-session', 'explicit'].includes(value.model.mode)) fail('Invalid context model');
  const modelKeys = value.model.mode === 'explicit' ? ['mode', 'provider', 'model'] : ['mode'];
  if (Object.keys(value.model).length !== modelKeys.length || modelKeys.some(key => !id(value.model[key]))) fail('Invalid context model fields');
}

function message(value) {
  if (!object(value) || !['system', 'developer', 'user', 'assistant', 'tool'].includes(value.role) || (!Object.hasOwn(value, 'content') && !(value.role === 'assistant' && Array.isArray(value.tool_calls) && value.tool_calls.length))) fail('Invalid message');
  if (value.role === 'tool' && !id(value.tool_call_id)) fail('Tool message has no call id');
  if (value.tool_calls !== undefined) {
    if (value.role !== 'assistant' || !Array.isArray(value.tool_calls)) fail('Invalid tool calls');
    const seen = new Set();
    for (const call of value.tool_calls) {
      if (!object(call) || !id(call.id) || seen.has(call.id) || call.type !== 'function' || !object(call.function) || !id(call.function.name) || typeof call.function.arguments !== 'string') fail('Malformed tool call');
      seen.add(call.id);
    }
  }
}

function sources(values, records) {
  if (!Array.isArray(values)) fail('Invalid source references');
  for (const source of values) {
    if (!object(source) || !id(source.recordId) || typeof source.quote !== 'string' || !source.quote || !records.has(source.recordId)) fail('Source has no original');
    const text = textOf(records.get(source.recordId).message);
    const start = source.start === undefined ? text.indexOf(source.quote) : source.start;
    if (!integer(start) || text.slice(start, start + source.quote.length) !== source.quote || (source.end !== undefined && source.end !== start + source.quote.length)) fail('Source quote or offsets do not match original');
  }
}

function version(value, archive, records) {
  if (!object(value) || value.schema !== 'talos.context.version.v1' || !id(value.id) || value.sessionId !== archive.session.sessionId || !integer(value.coveredThrough) || value.coveredThrough > archive.session.headSequence || !date(value.createdAt)) fail('Invalid context version');
  const prefix = archive.records.filter(record => record.sequence <= value.coveredThrough);
  if (JSON.stringify(value.sourceIds) !== JSON.stringify(prefix.map(record => record.id)) || value.sourceHash !== digest(JSON.stringify(prefix.map(({ id, sha256 }) => ({ id, sha256 }))))) fail('Version source provenance mismatch');
  const summary = value.summary;
  if (!object(summary) || summary.schema !== 'talos.context.summary.v1' || typeof summary.text !== 'string' || !summary.text.trim() || typeof summary.goal !== 'string' || !summary.goal.trim()) fail('Invalid summary');
  for (const field of ['decisions', 'constraints', 'completed', 'pending', 'resources']) if (!Array.isArray(summary[field]) || summary[field].some(item => typeof item !== 'string')) fail('Invalid summary entries');
  sources(summary.sources, new Map(prefix.map(record => [record.id, record])));
  if (prefix.length && !summary.sources.length) fail('Summary must cite its originals');
  if (!Array.isArray(value.activeMessages) || !value.activeMessages.length) fail('Invalid active messages');
  for (const entry of value.activeMessages) message(entry);
  if (!object(value.model) || !id(value.model.provider) || !id(value.model.model)) fail('Invalid version model');
  const measurement = value.measurement;
  if (!object(measurement) || measurement.schema !== 'talos.context.tokens.v1' || !integer(measurement.inputTokens) || !integer(measurement.windowTokens) || !integer(measurement.responseReserve) || !['runtime', 'provider', 'heuristic'].includes(measurement.method) || typeof measurement.exact !== 'boolean' || !hash(measurement.requestHash) || !id(measurement.provider) || !id(measurement.model)) fail('Invalid version measurement');
  if (value.restoredFrom !== undefined && (!id(value.restoredFrom) || value.restoredFrom === value.id || !archive.versions.some(other => other.id === value.restoredFrom))) fail('Missing restored version provenance');
  // A compacted prefix is closed: replay must not strand pending tools.
  const pending = new Set();
  for (const record of prefix) {
    for (const call of record.message.tool_calls ?? []) { if (pending.has(call.id)) fail('Duplicate pending tool call'); pending.add(call.id); }
    if (record.message.role === 'tool' && !pending.delete(record.message.tool_call_id)) fail('Orphan tool result in version');
  }
  if (pending.size) fail('Version covers an open tool prefix');
}

/** Verify before any import writes. The manifest is integrity evidence, not a
 * signature or authorization: all nested ownership/provenance is checked too. */
export function verifyContextArchive(archive) {
  try {
    jsonData(archive);
    if (!object(archive) || archive.schema !== 'talos.context.archive.v1') fail('Unsupported context archive');
    const keys = ['schema', 'session', 'records', 'versions', 'facts', 'jobs', 'usage', 'blobs', 'manifest', ...(Object.hasOwn(archive, 'mutations') ? ['mutations'] : [])];
    if (Object.keys(archive).length !== keys.length || keys.some(key => !Object.hasOwn(archive, key))) fail('Unexpected archive fields');
    const { manifest, ...payload } = archive;
    if (!object(manifest) || manifest.schema !== 'talos.context.manifest.v1' || manifest.algorithm !== 'sha256' || !hash(manifest.payloadSha256) || manifest.payloadSha256 !== digest(JSON.stringify(payload))) fail('Archive manifest mismatch');
    const session = archive.session;
    if (!object(session) || session.schema !== 'talos.context.snapshot.v1' || !id(session.sessionId) || !integer(session.revision) || !integer(session.stateRevision) || session.stateRevision > session.revision || !integer(session.headSequence) || !object(session.metadata)) fail('Invalid session snapshot');
    settings(session.settings);
    for (const field of ['records', 'versions', 'facts', 'jobs', 'usage', 'blobs']) if (!Array.isArray(archive[field])) fail(`Invalid archive ${field}`);
    const unique = (items, key) => {
      const seen = new Set();
      for (const item of items) { if (!object(item) || !id(item[key]) || seen.has(item[key])) fail(`Duplicate or invalid ${key}`); seen.add(item[key]); }
      return seen;
    };
    const blobIds = unique(archive.blobs, 'id');
    for (const blob of archive.blobs) {
      if (!hash(blob.sha256) || typeof blob.mimeType !== 'string' || !blob.mimeType || blob.mimeType.length > 256 || typeof blob.base64 !== 'string') fail('Invalid blob manifest');
      const bytes = Buffer.from(blob.base64, 'base64');
      if (bytes.toString('base64') !== blob.base64 || digest(bytes) !== blob.sha256) fail('Blob bytes do not match manifest');
    }
    unique(archive.records, 'id');
    if (archive.records.length !== session.headSequence) fail('Missing original sequence');
    for (let i = 0; i < archive.records.length; i++) {
      const record = archive.records[i];
      if (record.schema !== 'talos.context.record.v1' || record.sessionId !== session.sessionId || record.sequence !== i + 1 || !date(record.createdAt)) fail('Invalid original provenance');
      message(record.message);
      if (record.sha256 !== digest(JSON.stringify(record.message))) fail('Original hash mismatch');
      if (record.assetRefs !== undefined && (!Array.isArray(record.assetRefs) || record.assetRefs.some(ref => !blobIds.has(typeof ref === 'string' ? ref : ref?.id)))) fail('Original refers to absent asset');
    }
    const records = new Map(archive.records.map(record => [record.id, record]));
    const versionIds = unique(archive.versions, 'id');
    for (const entry of archive.versions) version(entry, archive, records);
    if (session.activeVersion !== null && (!object(session.activeVersion) || !versionIds.has(session.activeVersion.id) || JSON.stringify(session.activeVersion) !== JSON.stringify(archive.versions.find(entry => entry.id === session.activeVersion.id)))) fail('Active version does not match immutable version');
    unique(archive.facts, 'id');
    for (const fact of archive.facts) {
      if (typeof fact.text !== 'string' || !fact.text.trim() || !integer(fact.revision) || !['active', 'conflict', 'removed'].includes(fact.status)) fail('Invalid protected fact');
      sources(fact.sources, records);
      if (fact.status === 'conflict') {
        if (!object(fact.conflict) || typeof fact.conflict.proposedText !== 'string' || !fact.conflict.proposedText.trim()) fail('Invalid fact conflict');
        sources(fact.conflict.sources, records);
      }
    }
    unique(archive.jobs, 'id');
    unique(archive.jobs, 'idempotencyKey');
    let activeJobs = 0;
    for (const job of archive.jobs) {
      if (job.schema !== 'talos.context.job.v1' || job.sessionId !== session.sessionId || !id(job.requestFingerprint) || !['compact', 'regenerate', 'restore'].includes(job.kind) || !['queued', 'preparing', 'summarizing', 'validating', 'ready', 'committed', 'paused', 'cancelled', 'failed'].includes(job.state) || !integer(job.baseRevision) || !integer(job.baseStateRevision) || !integer(job.coveredThrough) || job.coveredThrough > session.headSequence || !date(job.createdAt) || !date(job.updatedAt) || !Array.isArray(job.completedSegments) || !object(job.progress) || !integer(job.progress.completed) || !integer(job.progress.total) || job.progress.completed > job.progress.total || typeof job.progress.phase !== 'string' || !object(job.model) || !id(job.model.provider) || !id(job.model.model)) fail('Invalid compaction job');
      if (job.versionId !== undefined && !versionIds.has(job.versionId)) fail('Job refers to absent version');
      if (job.state === 'committed' && !versionIds.has(job.versionId)) fail('Committed job lacks version');
      if (['queued', 'preparing', 'summarizing', 'validating', 'ready'].includes(job.state)) activeJobs++;
    }
    if (activeJobs > 1 || JSON.stringify(session.jobs) !== JSON.stringify(archive.jobs) || JSON.stringify(session.facts) !== JSON.stringify(archive.facts)) fail('Snapshot derived state mismatch');
    unique(archive.usage, 'operationId');
    for (const item of archive.usage) {
      if (item.sessionId !== session.sessionId || !object(item.usage) || (item.jobId != null && !archive.jobs.some(job => job.id === item.jobId))) fail('Invalid usage ownership');
      for (const [key, value] of Object.entries(item.usage)) {
        if (['inputTokens', 'outputTokens', 'totalTokens', 'cachedTokens'].includes(key) && !integer(value)) fail('Invalid usage token count');
        if (key === 'cost' && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) fail('Invalid usage cost');
        if (['currency', 'requestId'].includes(key) && typeof value !== 'string') fail('Invalid usage metadata');
      }
    }
    if (archive.mutations !== undefined) {
      if (!Array.isArray(archive.mutations)) fail('Invalid mutation receipts');
      unique(archive.mutations, 'idempotencyKey');
      for (const receipt of archive.mutations) {
        if (!hash(receipt.requestFingerprint) || !object(receipt.result) || (receipt.result.sessionId !== undefined && receipt.result.sessionId !== session.sessionId)) fail('Invalid mutation receipt ownership');
      }
    }
    return JSON.parse(JSON.stringify(archive));
  } catch (error) {
    if (error?.code === 'CTX_ARCHIVE_INVALID') throw error;
    throw new ContextStoreError('Malformed context archive', 'CTX_ARCHIVE_INVALID', { cause: error });
  }
}

export async function exportContextArchive({ sessionId }, { store }) {
  return verifyContextArchive(await store.exportSession({ sessionId }));
}

export async function importContextArchive(archive, { store }) {
  return store.importSession({ archive: verifyContextArchive(archive) });
}
