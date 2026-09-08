import { createHash } from 'node:crypto';
import { ContextStoreError } from './sqlite-store.mjs';
import { verifyContextArchive } from './context-export.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 256;

function validJson(value, ancestors = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value))) return true;
  if ((!object(value) && !Array.isArray(value)) || ancestors.has(value) || (object(value) && Object.getPrototypeOf(value) !== Object.prototype)) return false;
  if (Array.isArray(value) && Object.keys(value).length !== value.length) return false;
  ancestors.add(value);
  const valid = Object.values(value).every(child => validJson(child, ancestors));
  ancestors.delete(value);
  return valid;
}

function validMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || !validJson(messages)) return false;
  const pending = new Set();
  for (const message of messages) {
    if (!object(message) || !['system', 'developer', 'user', 'assistant', 'tool'].includes(message.role) || (!Object.hasOwn(message, 'content') && !(message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length))) return false;
    if (message.tool_calls !== undefined) {
      if (message.role !== 'assistant' || !Array.isArray(message.tool_calls)) return false;
      for (const call of message.tool_calls) {
        if (!object(call) || !id(call.id) || pending.has(call.id) || call.type !== 'function' || !object(call.function) || !id(call.function.name) || typeof call.function.arguments !== 'string') return false;
        pending.add(call.id);
      }
    }
    if (message.role === 'tool' && (!id(message.tool_call_id) || !pending.delete(message.tool_call_id))) return false;
  }
  try { JSON.stringify(messages); } catch { return false; }
  return true;
}

/** First validate the body, then compare generations. A malformed late final
 * must never hide a usable checkpoint from an earlier run. */
export function selectLastValidCheckpoint(records) {
  if (!Array.isArray(records)) throw new ContextStoreError('Legacy records must be an array', 'CTX_LEGACY_CORRUPT');
  let selected = null;
  for (let recordIndex = 0; recordIndex < records.length; recordIndex++) {
    const record = records[recordIndex];
    const messages = record?.tipo === 'messaggi-finali' ? record.messaggiFinali : record?.tipo === 'checkpoint-ripresa' ? record.messaggi : null;
    const versioneGiro = record?.versioneGiro ?? 0;
    if (!Number.isSafeInteger(versioneGiro) || versioneGiro < 0 || !validMessages(messages)) continue;
    if (!selected || versioneGiro >= selected.versioneGiro) selected = { messages: JSON.parse(JSON.stringify(messages)), versioneGiro, recordIndex };
  }
  return selected;
}

/** Import once through the same atomic archive boundary as normal exports.
 * jsonl is captured bytes/text, never a path; no legacy source is rewritten. */
export async function importLegacySession({ sessionId, jsonl, settings, metadata = {} }, { store }) {
  if (typeof jsonl !== 'string' && !(jsonl instanceof Uint8Array)) throw new ContextStoreError('Legacy JSONL must be captured text or bytes', 'CTX_LEGACY_CORRUPT');
  const bytes = typeof jsonl === 'string' ? Buffer.from(jsonl, 'utf8') : Buffer.from(jsonl);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch (cause) { throw new ContextStoreError('Legacy JSONL is not valid UTF-8', 'CTX_LEGACY_CORRUPT', { cause }); }
  const lines = text.split('\n').filter(line => line.trim() !== '');
  const records = [];
  let corruptTail = false;
  for (let index = 0; index < lines.length; index++) {
    try {
      const parsed = JSON.parse(lines[index]);
      if (!object(parsed)) throw new Error('Expected a legacy record object');
      records.push(parsed);
    } catch (cause) {
      if (index === lines.length - 1) { corruptTail = true; break; }
      throw new ContextStoreError(`Legacy JSONL has a corrupt intermediate record at line ${index + 1}`, 'CTX_LEGACY_CORRUPT', { cause });
    }
  }
  const checkpoint = selectLastValidCheckpoint(records);
  if (!checkpoint) throw new ContextStoreError('Legacy JSONL contains no valid message checkpoint', 'CTX_LEGACY_NO_CHECKPOINT');
  const sourceSha256 = hash(bytes);
  const sourceBlobId = `legacy-jsonl:${sourceSha256}`;
  const headerDate = records.find(record => typeof record.avviataAlle === 'string')?.avviataAlle;
  const createdAt = typeof headerDate === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(headerDate) && Number.isFinite(Date.parse(headerDate)) ? headerDate : '1970-01-01T00:00:00.000Z';
  const originals = checkpoint.messages.map((message, index) => ({
    id: `legacy:${sourceSha256}:${index + 1}`, message, createdAt,
    origin: 'legacy-jsonl',
    schema: 'talos.context.record.v1', sessionId, sequence: index + 1, sha256: hash(JSON.stringify(message)),
  }));
  const session = {
    schema: 'talos.context.snapshot.v1', sessionId, revision: originals.length ? 1 : 0, stateRevision: 0, headSequence: originals.length, settings,
    metadata: { ...metadata, legacy: { sourceBlobId, sourceSha256, corruptTail, versioneGiro: checkpoint.versioneGiro, recordIndex: checkpoint.recordIndex, records: originals.map((record, messageIndex) => ({ recordId: record.id, messageIndex })) } },
    activeVersion: null, facts: [], jobs: [],
  };
  const payload = { schema: 'talos.context.archive.v1', session, records: originals, versions: [], facts: [], jobs: [], usage: [], blobs: [{ id: sourceBlobId, sha256: sourceSha256, mimeType: 'application/x-ndjson', base64: bytes.toString('base64') }] };
  const archive = { ...payload, manifest: { schema: 'talos.context.manifest.v1', algorithm: 'sha256', payloadSha256: hash(JSON.stringify(payload)) } };
  return store.importSession({ archive: verifyContextArchive(archive) });
}
