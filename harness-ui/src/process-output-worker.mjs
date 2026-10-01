import {parentPort, workerData} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {ProcessOutputStoreError, normalizzaConfigurazioneOutput, normalizzaRichiestaOutput, normalizzaMetadatiCattura} from './process-output-contract.mjs';

const APPLICATION_ID = 0x544f5554;
const writerId = randomUUID();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (code, message) => {throw new ProcessOutputStoreError(message, code);};
const integrity = () => fail('OUTPUT_INTEGRITY_FAILED', 'Retained process output failed integrity verification');
const encodeError = error => error instanceof ProcessOutputStoreError
  ? {code: error.code, message: error.message}
  : {code: 'OUTPUT_STORE_IO', message: 'Process output storage operation failed'};
let db, config;
const run = (sql, ...args) => db.prepare(sql).run(...args);
const get = (sql, ...args) => db.prepare(sql).get(...args);
function transaction(fn, write = true) {
  db.exec(write ? 'BEGIN IMMEDIATE' : 'BEGIN');
  try {const result = fn(); db.exec('COMMIT'); return result;} catch (error) {db.exec('ROLLBACK'); throw error;}
}
function initialize() {
  config = normalizzaConfigurazioneOutput(workerData);
  if (config.databasePath !== ':memory:') mkdirSync(dirname(config.databasePath), {recursive: true, mode: 0o700});
  db = new DatabaseSync(config.databasePath, {timeout: 5000, allowExtension: false, enableForeignKeyConstraints: true});
  const version = get('PRAGMA user_version').user_version, app = get('PRAGMA application_id').application_id;
  const tables = get("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").n;
  if (!((version === 0 && app === 0 && tables === 0) || ([1, 2, 3].includes(version) && app === APPLICATION_ID))) fail('OUTPUT_SCHEMA_UNSUPPORTED', 'The database is not a supported process output store');
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA cache_size=-2048; PRAGMA journal_size_limit=8388608;');
  transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS output_captures (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, run_id TEXT NOT NULL, tool_call_id TEXT NOT NULL,
      writer_id TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('recording','complete','failed')),
      limit_bytes INTEGER NOT NULL CHECK(limit_bytes>0), next_sequence INTEGER NOT NULL DEFAULT 0,
      observed_bytes INTEGER NOT NULL DEFAULT 0, stored_bytes INTEGER NOT NULL DEFAULT 0,
      stdout_observed INTEGER NOT NULL DEFAULT 0, stdout_stored INTEGER NOT NULL DEFAULT 0,
      stderr_observed INTEGER NOT NULL DEFAULT 0, stderr_stored INTEGER NOT NULL DEFAULT 0,
      last_hash TEXT, last_stream TEXT, last_stored INTEGER,
      stdout_hash TEXT, stderr_hash TEXT, created_at TEXT NOT NULL, finished_at TEXT,
      termination TEXT, exit_code INTEGER, error_code TEXT, control_footer TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS output_chunks (
      output_id TEXT NOT NULL REFERENCES output_captures(id), sequence INTEGER NOT NULL,
      stream TEXT NOT NULL CHECK(stream IN ('stdout','stderr')), stream_offset INTEGER NOT NULL,
      bytes BLOB NOT NULL CHECK(length(bytes)>0 AND length(bytes)<=65536), sha256 TEXT NOT NULL,
      PRIMARY KEY(output_id,sequence)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS output_chunk_pages ON output_chunks(output_id,stream,stream_offset);
    CREATE INDEX IF NOT EXISTS output_capture_sessions ON output_captures(session_id);
    CREATE TABLE IF NOT EXISTS output_session_deletions (
      session_id TEXT PRIMARY KEY, operation_id TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
    ) STRICT;
    PRAGMA application_id=${APPLICATION_ID};`);
    if (version === 1) db.exec('ALTER TABLE output_captures ADD COLUMN control_footer TEXT;');
    db.exec('PRAGMA user_version=3;');
  });
}
function record({sessionId, outputId}) {
  sessionAvailable(sessionId);
  const row = get('SELECT * FROM output_captures WHERE id=? AND session_id=?', outputId, sessionId);
  if (!row) fail('OUTPUT_NOT_FOUND', 'Process output was not found in this session');
  return row;
}
function sessionAvailable(sessionId) {
  if (get('SELECT session_id FROM output_session_deletions WHERE session_id=?', sessionId)) {
    fail('OUTPUT_SESSION_DELETING', 'Output is fenced while its session deletion is being settled');
  }
}
function deletion(args) {
  const row = get('SELECT * FROM output_session_deletions WHERE session_id=?', args.sessionId);
  if (row && row.operation_id !== args.operationId) fail('OUTPUT_DELETE_CONFLICT', 'The session deletion receipt does not match');
  return row;
}
const deletionReceipt = row => ({sessionId: row.session_id, operationId: row.operation_id, createdAt: row.created_at});
function owner(row) {if (row.writer_id !== writerId) fail('OUTPUT_WRITER_MISMATCH', 'This capture belongs to another writer; its retained bytes remain readable');}
function recording(row) {if (row.state !== 'recording') fail('OUTPUT_STATE_CONFLICT', 'The process output capture has already settled');}
const TRACKING_SCHEMA = 'talos.process-output-tracking.v1';
function storedFooter(row) {
  try {return row.control_footer ? JSON.parse(row.control_footer) : null;} catch {integrity();}
}
function tracking(row) {
  const state = storedFooter(row);
  if (!state || state.schema === undefined) return null; // legacy footer, schema 2
  if (state.schema !== TRACKING_SCHEMA) integrity();
  let metadata;
  try {metadata = normalizzaMetadatiCattura(state.metadata);} catch {integrity();}
  const marker = metadata.controlFooter?.marker;
  if (!Number.isSafeInteger(state.observedThrough) || state.observedThrough !== row.stdout_observed
      || !Number.isSafeInteger(state.pendingPrefixBytes) || state.pendingPrefixBytes < 0
      || state.pendingPrefixBytes > state.observedThrough || state.pendingPrefixBytes >= (marker?.length ?? 1)
      || typeof state.previousByteIsLF !== 'boolean' || typeof state.prefixPrecededByLF !== 'boolean'
      || (state.byteOffset !== null && (!marker || !Number.isSafeInteger(state.byteOffset) || state.byteOffset < 0
        || state.byteOffset + marker.length > state.observedThrough))) integrity();
  return {...state, metadata};
}
function admitMetadata(row, metadata) {
  const state = tracking(row);
  if (state) {
    if (JSON.stringify(state.metadata) !== JSON.stringify(metadata)) fail('OUTPUT_METADATA_CONFLICT', 'Capture metadata must remain identical across chunks and settlement');
    return state;
  }
  if (metadata === undefined) return null;
  if (row.next_sequence !== 0 || row.control_footer) fail('OUTPUT_METADATA_CONFLICT', 'Metadata cannot be introduced after untracked output');
  return {schema: TRACKING_SCHEMA, metadata, observedThrough: 0, byteOffset: null, pendingPrefixBytes: 0, previousByteIsLF: false, prefixPrecededByLF: false};
}
function advanceTracking(state, stream, bytes) {
  if (!state || stream !== 'stdout') return state;
  const next = {...state, observedThrough: state.observedThrough + bytes.length};
  const footer = state.metadata.controlFooter;
  if (!footer) return next;
  const marker = Buffer.from(footer.marker), pending = state.pendingPrefixBytes;
  // Reconstruct only the known nonce prefix, never retain arbitrary bytes past the cap.
  const combined = Buffer.concat([marker.subarray(0, pending), bytes]);
  const beforeCombinedIsLF = pending ? state.prefixPrecededByLF : state.previousByteIsLF;
  const at = combined.lastIndexOf(marker);
  if (at >= 0) {
    const precedingLF = at > 0 ? combined[at - 1] === 10 : beforeCombinedIsLF;
    next.byteOffset = state.observedThrough - pending + at - (footer.prefixBytes === 1 && precedingLF ? 1 : 0);
  }
  next.pendingPrefixBytes = 0;
  for (let length = Math.min(marker.length - 1, combined.length); length > 0; length--) {
    if (combined.subarray(combined.length - length).equals(marker.subarray(0, length))) {next.pendingPrefixBytes = length; break;}
  }
  const start = combined.length - next.pendingPrefixBytes;
  next.prefixPrecededByLF = next.pendingPrefixBytes > 0 && (start > 0 ? combined[start - 1] === 10 : beforeCombinedIsLF);
  next.previousByteIsLF = bytes.at(-1) === 10;
  return next;
}
function manifest(row) {
  const state = tracking(row), footer = state?.metadata.controlFooter;
  return {schema: 'talos.process-output.v1', outputId: row.id, sessionId: row.session_id, runId: row.run_id, toolCallId: row.tool_call_id,
    state: row.state === 'complete' && row.observed_bytes > row.stored_bytes ? 'limited' : row.state,
    limitBytes: row.limit_bytes, nextSequence: row.next_sequence, observedBytes: row.observed_bytes, storedBytes: row.stored_bytes,
    stdout: {observedBytes: row.stdout_observed, storedBytes: row.stdout_stored, sha256: row.stdout_hash},
    stderr: {observedBytes: row.stderr_observed, storedBytes: row.stderr_stored, sha256: row.stderr_hash},
    createdAt: row.created_at, finishedAt: row.finished_at, termination: row.termination, exitCode: row.exit_code, errorCode: row.error_code,
    ...(state ? {outputMetadataVersion: 1, ...(footer ? {controlFooter: {...footer, byteOffset: state.byteOffset, observedThrough: state.observedThrough, pendingPrefixBytes: state.pendingPrefixBytes}} : {})}
      : row.control_footer ? {controlFooter: storedFooter(row)} : {})};
}
function verifyStreams(row) {
  const result = {};
  for (const stream of ['stdout', 'stderr']) {
    const digest = createHash('sha256'); let offset = 0;
    for (const chunk of db.prepare('SELECT * FROM output_chunks WHERE output_id=? AND stream=? ORDER BY stream_offset').iterate(row.id, stream)) {
      if (chunk.stream_offset !== offset || hash(chunk.bytes) !== chunk.sha256) integrity();
      digest.update(chunk.bytes); offset += chunk.bytes.length;
    }
    if (offset !== row[`${stream}_stored`]) integrity();
    result[stream] = digest.digest('hex');
  }
  if (row.stdout_stored + row.stderr_stored !== row.stored_bytes) integrity();
  return result;
}
const methods = {
  beginSessionDeletion(args) {
    return transaction(() => {
      const pending = get('SELECT * FROM output_session_deletions WHERE session_id=?', args.sessionId);
      if (pending) return deletionReceipt(pending);
      if (get("SELECT id FROM output_captures WHERE session_id=? AND writer_id=? AND state='recording' LIMIT 1", args.sessionId, writerId)) {
        fail('OUTPUT_SESSION_BUSY', 'Wait for the command output to settle before deleting its session');
      }
      const createdAt = new Date().toISOString();
      run('INSERT INTO output_session_deletions(session_id,operation_id,created_at) VALUES(?,?,?)', args.sessionId, args.operationId, createdAt);
      return {sessionId: args.sessionId, operationId: args.operationId, createdAt};
    });
  },
  cancelSessionDeletion(args) {
    return transaction(() => {
      if (deletion(args)) run('DELETE FROM output_session_deletions WHERE session_id=?', args.sessionId);
      return {state: 'cancelled'};
    });
  },
  completeSessionDeletion(args) {
    return transaction(() => {
      const pending = deletion(args);
      const counts = get('SELECT count(*) AS capturesRemoved,coalesce(sum(stored_bytes),0) AS bytesRemoved FROM output_captures WHERE session_id=?', args.sessionId);
      if (!pending && counts.capturesRemoved > 0) fail('OUTPUT_DELETE_CONFLICT', 'New output cannot be removed using an old deletion receipt');
      run('DELETE FROM output_chunks WHERE output_id IN (SELECT id FROM output_captures WHERE session_id=?)', args.sessionId);
      run('DELETE FROM output_captures WHERE session_id=?', args.sessionId);
      run('DELETE FROM output_session_deletions WHERE session_id=?', args.sessionId);
      return {state: 'complete', ...counts};
    });
  },
  listSessionDeletions(args) {
    const rows = db.prepare('SELECT * FROM output_session_deletions WHERE (? IS NULL OR session_id>?) ORDER BY session_id LIMIT ?').all(args.after, args.after, args.limit + 1);
    return {items: rows.slice(0, args.limit).map(deletionReceipt), nextAfter: rows.length > args.limit ? rows[args.limit - 1].session_id : null};
  },
  begin(args) {
    return transaction(() => {
      sessionAvailable(args.sessionId);
      if (get('SELECT id FROM output_captures WHERE id=?', args.outputId)) fail('OUTPUT_ID_CONFLICT', 'The output identifier is already allocated');
      run("INSERT INTO output_captures(id,session_id,run_id,tool_call_id,writer_id,state,limit_bytes,created_at) VALUES(?,?,?,?,?,'recording',?,?)", args.outputId, args.sessionId, args.runId, args.toolCallId, writerId, config.maxOutputBytes, new Date().toISOString());
      return manifest(record(args));
    });
  },
  append(args) {
    return transaction(() => {
      const row = record(args); owner(row); recording(row);
      const state = admitMetadata(row, args.metadata);
      const digest = hash(args.bytes);
      if (args.sequence === row.next_sequence - 1 && digest === row.last_hash && args.stream === row.last_stream) return {sequence: args.sequence, nextSequence: row.next_sequence, storedBytes: row.last_stored, duplicate: true};
      if (args.sequence !== row.next_sequence) fail('OUTPUT_SEQUENCE_CONFLICT', 'Output chunk sequence or retry payload does not match');
      if (!Number.isSafeInteger(row.observed_bytes + args.bytes.length) || !Number.isSafeInteger(row.next_sequence + 1)) fail('OUTPUT_INVALID_INPUT', 'Output counters exceed the supported range');
      const retained = Math.min(args.bytes.length, row.limit_bytes - row.stored_bytes);
      if (retained) {
        const bytes = args.bytes.subarray(0, retained);
        run('INSERT INTO output_chunks(output_id,sequence,stream,stream_offset,bytes,sha256) VALUES(?,?,?,?,?,?)', row.id, args.sequence, args.stream, row[`${args.stream}_stored`], bytes, hash(bytes));
      }
      // The column names come only from the two validated stream literals.
      const advanced = advanceTracking(state, args.stream, args.bytes);
      run(`UPDATE output_captures SET next_sequence=next_sequence+1,observed_bytes=observed_bytes+?,stored_bytes=stored_bytes+?,${args.stream}_observed=${args.stream}_observed+?,${args.stream}_stored=${args.stream}_stored+?,last_hash=?,last_stream=?,last_stored=?,control_footer=? WHERE id=?`, args.bytes.length, retained, args.bytes.length, retained, digest, args.stream, retained, advanced ? JSON.stringify(advanced) : row.control_footer, row.id);
      return {sequence: args.sequence, nextSequence: row.next_sequence + 1, storedBytes: retained, duplicate: false};
    });
  },
  finish(args) {
    return transaction(() => {
      const row = record(args); owner(row);
      if (args.sequence !== row.next_sequence) fail('OUTPUT_SEQUENCE_CONFLICT', 'Capture cannot finish before all admitted chunks settle');
      const state = admitMetadata(row, args.metadata);
      if (state && args.controlFooter) {
        const expected = state.metadata.controlFooter;
        if (!expected || ['type', 'stream', 'marker'].some(k => expected[k] !== args.controlFooter[k])) fail('OUTPUT_METADATA_CONFLICT', 'The final footer differs from the admitted capture metadata');
      }
      const footer = state ? JSON.stringify(state) : args.controlFooter ? JSON.stringify(args.controlFooter) : null;
      if (row.state === 'complete' && row.termination === args.termination && row.exit_code === args.exitCode && row.control_footer === footer) return manifest(row);
      recording(row);
      const hashes = verifyStreams(row);
      run("UPDATE output_captures SET state='complete',stdout_hash=?,stderr_hash=?,finished_at=?,termination=?,exit_code=?,control_footer=? WHERE id=?", hashes.stdout, hashes.stderr, new Date().toISOString(), args.termination, args.exitCode, footer, row.id);
      return manifest(record(args));
    });
  },
  fail(args) {
    return transaction(() => {
      const row = record(args); owner(row); recording(row);
      if (args.sequence !== row.next_sequence) fail('OUTPUT_SEQUENCE_CONFLICT', 'Capture failure sequence does not match');
      run("UPDATE output_captures SET state='failed',error_code=?,finished_at=? WHERE id=?", args.code, new Date().toISOString(), row.id);
      return manifest(record(args));
    });
  },
  inspect(args) {return manifest(record(args));},
  readPage(args) {
    return transaction(() => {
      const row = record(args), availableBytes = row[`${args.stream}_stored`];
      const end = Math.min(availableBytes, args.offset + args.limit);
      const bytes = Buffer.alloc(Math.max(0, end - args.offset)); let position = args.offset;
      for (const chunk of db.prepare('SELECT stream_offset,bytes,sha256 FROM output_chunks WHERE output_id=? AND stream=? AND stream_offset<? AND stream_offset+length(bytes)>? ORDER BY stream_offset').iterate(row.id, args.stream, end, args.offset)) {
        if (hash(chunk.bytes) !== chunk.sha256 || chunk.stream_offset > position) integrity();
        const start = Math.max(0, position - chunk.stream_offset), take = Math.min(chunk.bytes.length - start, end - position);
        if (take > 0) {bytes.set(chunk.bytes.subarray(start, start + take), position - args.offset); position += take;}
      }
      if (position !== Math.max(args.offset, end)) integrity();
      return {bytes, offset: args.offset, nextOffset: position < availableBytes ? position : null, availableBytes, manifest: manifest(row)};
    }, false);
  },
  health() {return {sqliteVersion: get('SELECT sqlite_version() AS version').version, journalMode: get('PRAGMA journal_mode').journal_mode, synchronous: get('PRAGMA synchronous').synchronous, foreignKeys: get('PRAGMA foreign_keys').foreign_keys, schemaVersion: get('PRAGMA user_version').user_version};},
  close() {db.close(); db = null; return {closed: true};},
};
try {
  initialize();
  parentPort.on('message', ({id, method, args}) => {
    try {const result = methods[method](normalizzaRichiestaOutput(method, args)); parentPort.postMessage({id, result});}
    catch (error) {parentPort.postMessage({id, error: encodeError(error)});}
    if (method === 'close') parentPort.close();
  });
  parentPort.postMessage({ready: true});
} catch (error) {
  try {db?.close();} catch {}
  parentPort.postMessage({ready: false, error: encodeError(error)});
  parentPort.close();
}
