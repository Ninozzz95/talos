import { createHash } from 'node:crypto';

const fail = (message, code = 'CTX_RETRIEVAL_INVALID') => { throw Object.assign(new Error(message), { code }); };
const idValid = value => typeof value === 'string' && value.trim() !== '' && value.length <= 256;
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function textOf(content) {
  if (typeof content === 'string') return content;
  return Array.isArray(content) ? content.filter(part => ['text', 'input_text', 'output_text'].includes(part?.type) && typeof part.text === 'string').map(part => part.text).join('\n') : '';
}

// Offsets are UTF-16 indices into the canonical text projection, never byte offsets.
function boundary(text, offset) {
  return offset > 0 && offset < text.length && /[\uD800-\uDBFF]/u.test(text[offset - 1]) && /[\uDC00-\uDFFF]/u.test(text[offset]) ? offset - 1 : offset;
}

function assertSession(rows) {
  const sessions = new Set(rows.filter(row => row?.sessionId !== undefined).map(row => row.sessionId));
  if ([...sessions].some(sessionId => !idValid(sessionId))) fail('Invalid session id');
  if (sessions.size > 1) fail('Context sources must belong to one session', 'CTX_SESSION_ISOLATION');
}

function validateHit(hit) {
  if (!hit || !idValid(hit.id) || !idValid(hit.recordId) || !integer(hit.sequence, 1)
    || typeof hit.text !== 'string' || !hit.text.isWellFormed() || !integer(hit.start) || !integer(hit.end)
    || hit.end - hit.start !== hit.text.length) fail('Invalid context source');
}

export function chunkContextRecords(records, { maxChars = 1600, overlapChars = 160 } = {}) {
  if (!Array.isArray(records) || !integer(maxChars, 2) || !integer(overlapChars) || overlapChars >= maxChars) fail('Invalid chunk size or overlap');
  assertSession(records);
  const chunks = [];
  const seen = new Set();
  for (const record of records) {
    if (!record || !idValid(record.id) || !integer(record.sequence, 1) || !record.message) fail('Invalid original record');
    if (seen.has(record.id)) fail('Duplicate original record');
    seen.add(record.id);
    const text = textOf(record.message.content);
    if (!text.isWellFormed()) fail('Original text contains invalid Unicode');
    for (let start = 0; start < text.length;) {
      const end = boundary(text, Math.min(text.length, start + maxChars));
      const value = text.slice(start, end);
      const id = createHash('sha256').update(JSON.stringify([record.sessionId ?? null, record.id, start, end, value])).digest('hex');
      chunks.push({ id, recordId: record.id, sequence: record.sequence, text: value, start, end });
      if (end === text.length) break;
      const next = boundary(text, end - overlapChars);
      start = next > start ? next : end;
    }
  }
  return chunks;
}

export function rankContextSources({ lexical = [], semantic = [], limit = 20 } = {}) {
  if (!Array.isArray(lexical) || !Array.isArray(semantic) || !integer(limit) || limit > 1000) fail('Invalid ranked sources');
  assertSession([...lexical, ...semantic]);
  const hits = new Map();
  for (const lane of [lexical, semantic]) {
    const seen = new Set();
    let rank = 0;
    for (const hit of lane) {
      validateHit(hit);
      const existing = hits.get(hit.id);
      if (existing && ['recordId', 'sequence', 'text', 'start', 'end'].some(key => existing[key] !== hit[key])) fail('Source id identifies conflicting evidence', 'CTX_SOURCE_CONFLICT');
      if (seen.has(hit.id)) continue;
      seen.add(hit.id);
      rank++;
      const score = (existing?.score ?? 0) + 1 / (60 + rank);
      hits.set(hit.id, { id: hit.id, recordId: hit.recordId, sequence: hit.sequence, text: hit.text, start: hit.start, end: hit.end, score });
    }
  }
  return [...hits.values()].sort((a, b) => b.score - a.score || a.sequence - b.sequence || a.start - b.start || compare(a.id, b.id)).slice(0, limit);
}

export function selectContextEvidence(hits, { maxChars = 8000 } = {}) {
  if (!Array.isArray(hits) || !integer(maxChars)) fail('Invalid evidence budget');
  assertSession(hits);
  hits.forEach(validateHit);
  const selected = [];
  const seen = new Set();
  let remaining = maxChars;
  for (let i = 0; i < hits.length && remaining > 0; i++) {
    const hit = hits[i];
    if (seen.has(hit.id) || hit.text.length === 0) continue;
    seen.add(hit.id);
    let take = hit.text.length;
    if (take > remaining) {
      // Keep smaller later sources intact where possible, then use the spare budget.
      let reserved = 0;
      const futureIds = new Set(seen);
      for (const future of hits.slice(i + 1)) {
        if (futureIds.has(future.id)) continue;
        futureIds.add(future.id);
        if (future.text.length <= remaining - reserved) reserved += future.text.length;
      }
      take = boundary(hit.text, remaining - reserved);
    }
    if (take > 0) {
      selected.push({ ...structuredClone(hit), text: hit.text.slice(0, take), end: hit.start + take });
      remaining -= take;
    }
  }
  return selected;
}
