import { parentPort, workerData } from 'node:worker_threads';
import { DatabaseSync, backup } from 'node:sqlite';
import { readFileSync, mkdirSync, existsSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { ContextStoreError } from './sqlite-store.mjs';
import { verifyContextArchive } from './context-export.mjs';

const { databasePath, vectorExtension, faultPoint } = workerData;
if (databasePath !== ':memory:') mkdirSync(dirname(resolve(databasePath)), { recursive: true });
const db = new DatabaseSync(databasePath, { timeout: 5000, allowExtension: vectorExtension === true, enableForeignKeyConstraints: true });
db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
if (db.prepare('PRAGMA user_version').get().user_version > 1) throw new ContextStoreError('Unsupported context database version', 'CTX_SCHEMA_UNSUPPORTED');
db.exec('BEGIN IMMEDIATE');
try { db.exec(readFileSync(new URL('./migrations/001-context.sql', import.meta.url), 'utf8')); db.exec('COMMIT'); }
catch (error) { db.exec('ROLLBACK'); throw error; }
let vector = false;
if (vectorExtension === true) {
  try {
    const sqliteVec = await import('sqlite-vec');
    sqliteVec.load(db);
    vector = db.prepare('SELECT vec_version() AS version').get().version === 'v0.1.9';
  } catch { vector = false; }
  finally { db.enableLoadExtension(false); }
}

const fail = (message, code = 'CTX_INVALID_INPUT') => { throw new ContextStoreError(message, code); };
const hash = value => createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !value.includes('\0');
const id = (value, name = 'id') => { if (!validId(value)) fail(`Invalid ${name}`); return value; };
const integer = (value, name = 'revision') => { if (!Number.isSafeInteger(value) || value < 0) fail(`Invalid ${name}`); return value; };
const iso = value => { if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) fail('Invalid ISO timestamp'); };
const textOf = message => typeof message.content === 'string' ? message.content : Array.isArray(message.content) ? message.content.filter(part => part && ['text', 'input_text', 'output_text'].includes(part.type) && typeof part.text === 'string').map(part => part.text).join('\n') : '';
const run = (sql, ...args) => db.prepare(sql).run(...args);
const get = (sql, ...args) => db.prepare(sql).get(...args);
const all = (sql, ...args) => db.prepare(sql).all(...args);
const parseRows = (sql, field, ...args) => all(sql, ...args).map(row => JSON.parse(row[field]));
function json(value, ancestors = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value))) return;
  if ((!object(value) && !Array.isArray(value)) || ancestors.has(value)) fail('Expected finite acyclic JSON data');
  ancestors.add(value);
  if (Array.isArray(value) && Object.keys(value).length !== value.length) fail('Sparse arrays are invalid');
  for (const entry of Object.values(value)) json(entry, ancestors);
  ancestors.delete(value);
}
let transactionDepth = 0;
function tx(fn) {
  const depth = transactionDepth++;
  const name = `context_nested_${depth}`;
  try {
    db.exec(depth ? `SAVEPOINT ${name}` : 'BEGIN IMMEDIATE');
    try { const result = fn(); db.exec(depth ? `RELEASE ${name}` : 'COMMIT'); return result; }
    catch (error) { db.exec(depth ? `ROLLBACK TO ${name}; RELEASE ${name}` : 'ROLLBACK'); throw error; }
  } finally { transactionDepth--; }
}
function fault(point) {
  if (faultPoint === `crash-${point}`) process.exit(91);
  if (faultPoint === point) fail(`Injected persistence failure: ${point}`, 'CTX_PERSISTENCE_FAILED');
}
function session(sessionId, required = true) {
  id(sessionId, 'sessionId');
  const row = get('SELECT * FROM context_sessions WHERE session_id=?', sessionId);
  if (!row && required) fail('Context session does not exist', 'CTX_SESSION_NOT_FOUND');
  return row;
}
function revision(row, expectedRevision, expectedStateRevision) {
  integer(expectedRevision);
  if (row.revision !== expectedRevision || (expectedStateRevision !== undefined && row.state_revision !== integer(expectedStateRevision, 'stateRevision'))) fail('Context changed; reread the current revision', 'CTX_STALE_REVISION');
}
function settings(value) {
  json(value);
  const fields = ['auto', 'model', 'triggerRatio', 'targetRatio', 'retainRecentTurns', 'focus', 'nativeMode', 'semanticSearch'];
  if (!object(value) || Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key)) || typeof value.auto !== 'boolean' || typeof value.semanticSearch !== 'boolean' || typeof value.targetRatio !== 'number' || typeof value.triggerRatio !== 'number' || !(value.targetRatio > 0 && value.targetRatio < value.triggerRatio && value.triggerRatio < 1) || !Number.isSafeInteger(value.retainRecentTurns) || value.retainRecentTurns < 0 || value.retainRecentTurns > 100 || typeof value.focus !== 'string' || value.focus.length > 8000 || !['off', 'qualified'].includes(value.nativeMode) || !object(value.model)) fail('Invalid context settings');
  const modelFields = value.model.mode === 'follow-session' ? ['mode'] : value.model.mode === 'explicit' ? ['mode', 'provider', 'model'] : [];
  if (!modelFields.length || Object.keys(value.model).length !== modelFields.length || modelFields.some(key => !validId(value.model[key]))) fail('Invalid context model selection');
}
function message(value) {
  json(value);
  if (!object(value) || !['system', 'developer', 'user', 'assistant', 'tool'].includes(value.role) || (!Object.hasOwn(value, 'content') && !(value.role === 'assistant' && Array.isArray(value.tool_calls) && value.tool_calls.length))) fail('Invalid original message');
  if (value.role === 'tool') id(value.tool_call_id, 'tool_call_id');
  if (value.tool_calls !== undefined) {
    if (value.role !== 'assistant' || !Array.isArray(value.tool_calls)) fail('Invalid tool_calls');
    const seen = new Set();
    for (const call of value.tool_calls) {
      if (!object(call) || !validId(call.id) || seen.has(call.id) || call.type !== 'function' || !object(call.function) || !validId(call.function.name) || typeof call.function.arguments !== 'string') fail('Malformed tool call');
      seen.add(call.id);
    }
  }
}
function originals(sessionId, afterSequence = 0, throughSequence = Number.MAX_SAFE_INTEGER) {
  return parseRows('SELECT record_json FROM original_records WHERE session_id=? AND sequence>? AND sequence<=? ORDER BY sequence', 'record_json', sessionId, afterSequence, throughSequence);
}
function snapshot(sessionId) {
  const row = session(sessionId, false);
  if (!row) return null;
  const active = row.active_version_id === null ? null : get('SELECT version_json FROM context_versions WHERE session_id=? AND id=?', sessionId, row.active_version_id);
  const measured = get('SELECT revision, measured_at, measurement_json FROM context_measurements WHERE session_id=?', sessionId);
  return {
    schema: 'talos.context.snapshot.v1', sessionId, revision: row.revision, stateRevision: row.state_revision, headSequence: row.head_sequence,
    settings: JSON.parse(row.settings_json), metadata: JSON.parse(row.metadata_json), activeVersion: active ? JSON.parse(active.version_json) : null,
    measurement: measured ? { schema: 'talos.context.measurement.v1', revision: measured.revision, measuredAt: measured.measured_at, tokens: JSON.parse(measured.measurement_json) } : null,
    facts: parseRows('SELECT fact_json FROM protected_facts WHERE session_id=? ORDER BY id', 'fact_json', sessionId),
    jobs: parseRows('SELECT job_json FROM compaction_jobs WHERE session_id=? ORDER BY id', 'job_json', sessionId),
  };
}
/*
 * L3-3 (owner 13/10/2026, D1 + D2) — una copia messa da parte DICHIARA di chi era: `metadata.aside = { id, of, at }`, scritto da
 * `setAsideSession`. Le copie nate prima di questa dichiarazione si riconoscono dalla forma dell'id che il servizio desktop dà
 * loro (`<conversazione>.aside-<millisecondi>-<8 esadecimali>`, `context-desktop-service.mjs`).
 */
const FORMA_ID_DA_PARTE = /^(.+)\.aside-(\d+)-[0-9a-f]{8}$/u;
function asideOwner(sessionId, row = session(sessionId, false)) {
  if (!row) return null;
  let metadata = null;
  try { metadata = JSON.parse(row.metadata_json); } catch { metadata = null; }
  const dichiarata = metadata?.aside;
  if (dichiarata && typeof dichiarata === 'object' && dichiarata.id === sessionId && validId(dichiarata.of) && dichiarata.of !== sessionId) {
    return { of: dichiarata.of, at: typeof dichiarata.at === 'string' ? dichiarata.at : null };
  }
  const forma = FORMA_ID_DA_PARTE.exec(sessionId);
  if (!forma) return null;
  const quando = Number(forma[2]);
  return { of: forma[1], at: Number.isSafeInteger(quando) && quando > 0 && quando < 8.64e15 ? new Date(quando).toISOString() : null };
}
function archive(sessionId) {
  let snap = snapshot(sessionId);
  if (!snap) fail('Context session does not exist', 'CTX_SESSION_NOT_FOUND');
  /* Una copia da parte si esporta come l'archivio DELLA CONVERSAZIONE a cui apparteneva, com'era in quel momento: gli originali,
     le versioni e i lavori (immutabili, mai riscritti) portano già quell'id. La copia lo dichiara in `session.metadata.aside`. */
  const daParte = asideOwner(sessionId);
  if (daParte) snap = { ...snap, sessionId: daParte.of, metadata: { ...snap.metadata, aside: { id: sessionId, of: daParte.of, at: daParte.at } } };
  const payload = {
    schema: 'talos.context.archive.v1', session: snap, records: originals(sessionId),
    versions: methods.listContextVersions({ sessionId }), facts: snap.facts, jobs: snap.jobs,
    usage: daParte ? methods.readUsage({ sessionId }).map(voce => ({ ...voce, sessionId: daParte.of })) : methods.readUsage({ sessionId }),
    mutations: all('SELECT idempotency_key AS idempotencyKey, request_fingerprint AS requestFingerprint, result_json FROM context_mutations WHERE session_id=? ORDER BY idempotency_key', sessionId).map(({ result_json, ...entry }) => ({ ...entry, result: JSON.parse(result_json) })),
    blobs: all('SELECT a.id,a.sha256,a.mime_type,b.bytes FROM record_assets a JOIN content_blobs b ON b.sha256=a.sha256 WHERE a.session_id=? ORDER BY a.id', sessionId).map(row => ({ id: row.id, sha256: row.sha256, mimeType: row.mime_type, base64: Buffer.from(row.bytes).toString('base64') })),
  };
  return { ...payload, manifest: { schema: 'talos.context.manifest.v1', algorithm: 'sha256', payloadSha256: hash(JSON.stringify(payload)) } };
}
function comparableArchive(value) {
  const { manifest, ...payload } = value;
  payload.mutations = [...(payload.mutations ?? [])].sort((a, b) => a.idempotencyKey.localeCompare(b.idempotencyKey));
  const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return {
    ...payload,
    // 09/09 — `measurement` è un fatto sul presente che invecchia, non stato archiviato: due archivi
    //   della stessa sessione non divergono perché una richiesta è stata misurata nel frattempo.
    session: { ...payload.session, measurement: undefined, facts: [...payload.session.facts].sort(byId), jobs: [...payload.session.jobs].sort(byId) },
    blobs: [...payload.blobs].sort(byId), facts: [...payload.facts].sort(byId), jobs: [...payload.jobs].sort(byId),
  };
}
function jobRow(sessionId, jobId) {
  id(sessionId, 'sessionId'); id(jobId, 'jobId');
  const row = get('SELECT job_json FROM compaction_jobs WHERE session_id=? AND id=?', sessionId, jobId);
  return row ? JSON.parse(row.job_json) : null;
}
const activeStates = ['queued', 'preparing', 'summarizing', 'validating', 'ready'];
function validateJob(job, sessionId) {
  json(job);
  if (!object(job) || job.schema !== 'talos.context.job.v1' || job.sessionId !== sessionId || !validId(job.id) || !validId(job.idempotencyKey) || !validId(job.requestFingerprint) || !['compact', 'regenerate', 'restore'].includes(job.kind) || ![...activeStates, 'committed', 'paused', 'cancelled', 'failed'].includes(job.state)) fail('Invalid context job');
  for (const key of ['baseRevision', 'baseStateRevision', 'coveredThrough']) integer(job[key], key);
  iso(job.createdAt); iso(job.updatedAt);
  if (!object(job.model) || !validId(job.model.provider) || !validId(job.model.model) || !Array.isArray(job.completedSegments) || !object(job.progress) || !Number.isSafeInteger(job.progress.completed) || !Number.isSafeInteger(job.progress.total) || job.progress.completed < 0 || job.progress.total < job.progress.completed || typeof job.progress.phase !== 'string') fail('Invalid job model or progress');
}
function requireNoOtherActive(sessionId, jobId) {
  if (get("SELECT id FROM compaction_jobs WHERE session_id=? AND id<>? AND state IN ('queued','preparing','summarizing','validating','ready')", sessionId, jobId)) fail('Another context job is active', 'CTX_JOB_ACTIVE');
}
function sources(sessionId, values) {
  if (!Array.isArray(values)) fail('Invalid source references', 'CTX_SOURCE_INVALID');
  return values.map(source => {
    if (!object(source) || !validId(source.recordId) || typeof source.quote !== 'string' || !source.quote) fail('Invalid source reference', 'CTX_SOURCE_INVALID');
    const row = get('SELECT record_json FROM original_records WHERE session_id=? AND id=?', sessionId, source.recordId);
    if (!row) fail('Source belongs to no original in this session', 'CTX_SOURCE_INVALID');
    const text = textOf(JSON.parse(row.record_json).message);
    const start = source.start === undefined ? text.indexOf(source.quote) : source.start;
    if (!Number.isSafeInteger(start) || start < 0 || text.slice(start, start + source.quote.length) !== source.quote || (source.end !== undefined && source.end !== start + source.quote.length)) fail('Source quote does not match original', 'CTX_SOURCE_INVALID');
    return { ...source, start, end: start + source.quote.length };
  });
}
function writeVersion(sessionId, version) {
  if (get('SELECT id FROM context_versions WHERE session_id=? AND id=?', sessionId, version.id)) fail('Version id already exists', 'CTX_VERSION_CONFLICT');
  run('INSERT INTO context_versions(session_id,id,version_json) VALUES(?,?,?)', sessionId, version.id, JSON.stringify(version));
  run('INSERT INTO summary_nodes(session_id,version_id,summary_json) VALUES(?,?,?)', sessionId, version.id, JSON.stringify(version.summary));
}
const usageBackfilled = new Set();
function enqueueUsage(sessionId, operationId, jobId, usage) {
  const event = { schema: 'talos.context.event.v1', id: `usage-${hash(JSON.stringify([sessionId, operationId]))}`, sessionId,
    ...(jobId ? { jobId } : {}), kind: 'context.usage.recorded', createdAt: new Date().toISOString(), payload: { operationId, usage } };
  // The retained receipt includes acknowledged deliveries: retry cannot revive it.
  run('INSERT INTO context_outbox(session_id,id,event_json) VALUES(?,?,?) ON CONFLICT(session_id,id) DO NOTHING', sessionId, event.id, JSON.stringify(event));
}
function activate(sessionId, version, jobId, kind = 'context.version.committed') {
  run('UPDATE context_sessions SET active_version_id=?,revision=revision+1,state_revision=state_revision+1 WHERE session_id=?', version.id, sessionId);
  const event = { schema: 'talos.context.event.v1', id: randomUUID(), sessionId, ...(jobId ? { jobId } : {}), versionId: version.id, kind, createdAt: version.createdAt, payload: { coveredThrough: version.coveredThrough } };
  run('INSERT INTO context_outbox(session_id,id,event_json) VALUES(?,?,?)', sessionId, event.id, JSON.stringify(event));
}

const methods = {
  initSession({ sessionId, settings: value, metadata = {} }) {
    id(sessionId, 'sessionId'); settings(value); json(metadata);
    if (!object(metadata)) fail('Session metadata must be a JSON object');
    return tx(() => {
      run('INSERT OR IGNORE INTO context_sessions(session_id,settings_json,metadata_json) VALUES(?,?,?)', sessionId, JSON.stringify(value), JSON.stringify(metadata));
      return snapshot(sessionId);
    });
  },
  readContextSnapshot({ sessionId }) { return tx(() => snapshot(sessionId)); },
  /* 09/09 — l'ultima misura preparata: una per sessione, l'ultima vince. Non è una versione né un
     evento: è un fatto sul presente che invecchia, e per questo porta la revisione e l'ora. */
  recordMeasurement({ sessionId, revision: measuredRevision, measuredAt, measurement }) {
    id(sessionId, 'sessionId'); json(measurement);
    if (!Number.isSafeInteger(measuredRevision) || measuredRevision < 0) fail('Invalid measurement revision');
    if (typeof measuredAt !== 'string' || Number.isNaN(Date.parse(measuredAt))) fail('Invalid measurement date');
    return tx(() => {
      session(sessionId);
      run('INSERT INTO context_measurements(session_id,revision,measured_at,measurement_json) VALUES(?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET revision=excluded.revision, measured_at=excluded.measured_at, measurement_json=excluded.measurement_json', sessionId, measuredRevision, measuredAt, JSON.stringify(measurement));
      return snapshot(sessionId);
    });
  },
  appendOriginalBatch({ sessionId, records, expectedRevision }) {
    if (!Array.isArray(records)) fail('Original records must be an array');
    return tx(() => {
      const row = session(sessionId);
      if (expectedRevision !== undefined) revision(row, expectedRevision);
      let sequence = row.head_sequence;
      const result = [];
      for (const input of records) {
        json(input);
        if (!object(input)) fail('Invalid original record');
        id(input.id); message(input.message); iso(input.createdAt);
        const sha256 = hash(JSON.stringify(input.message));
        if (input.sha256 !== undefined && input.sha256 !== sha256) fail('Original hash mismatch', 'CTX_HASH_MISMATCH');
        if (input.sessionId !== undefined && input.sessionId !== sessionId) fail('Original session mismatch', 'CTX_SOURCE_INVALID');
        const prior = get('SELECT sha256,record_json FROM original_records WHERE session_id=? AND id=?', sessionId, input.id);
        if (prior) {
          if (prior.sha256 !== sha256) fail('Original id already contains different bytes', 'CTX_RECORD_CONFLICT');
          result.push(JSON.parse(prior.record_json));
          continue;
        }
        if (input.assetRefs !== undefined) {
          if (!Array.isArray(input.assetRefs)) fail('Invalid original asset references');
          for (const ref of input.assetRefs) {
            const assetId = typeof ref === 'string' ? ref : ref?.id;
            if (!validId(assetId) || !get('SELECT id FROM record_assets WHERE session_id=? AND id=?', sessionId, assetId)) fail('Original references an absent session asset', 'CTX_SOURCE_INVALID');
          }
        }
        const record = { ...input, schema: 'talos.context.record.v1', sessionId, sequence: ++sequence, sha256 };
        run('INSERT INTO original_records(session_id,id,sequence,sha256,record_json) VALUES(?,?,?,?,?)', sessionId, record.id, sequence, sha256, JSON.stringify(record));
        fault('append-after-record');
        result.push(record);
      }
      if (sequence !== row.head_sequence) run('UPDATE context_sessions SET head_sequence=?,revision=revision+1 WHERE session_id=?', sequence, sessionId);
      return { records: result, revision: row.revision + Number(sequence !== row.head_sequence), headSequence: sequence };
    });
  },
  /*
   * 12/10/2026, decisione dell'owner («Si ripara da solo»): quando la storia attiva non combacia più con l'archivio, gli
   *   originali NON si buttano e NON si riscrivono: tutto ciò che dipende da loro (originali, allegati, versioni, riassunti,
   *   lavori, indice di ricerca, misura) passa sotto un altro id — `asideId` — in una transazione sola, e la sessione vera
   *   riparte vuota, con la revisione avanzata (chi aveva una revisione vecchia lo scopre). Restano alla sessione vera ciò che
   *   è della PERSONA o del conto: impostazioni, informazioni protette (copiate anche di là), consumi, avvisi non consegnati,
   *   chiavi di idempotenza.
   * ⛔ Mai con un lavoro di compattazione in corso: sposterebbe un lavoro da sotto chi lo sta eseguendo.
   * ⛔ Originali, allegati e versioni sono IMMUTABILI per trigger (`*_no_update`). Qui non cambia un byte del loro contenuto,
   *   né l'impronta né la sequenza: cambia solo sotto quale id stanno. I tre trigger si sospendono e si ricreano DENTRO la
   *   stessa transazione, col loro testo letto dal catalogo (mai riscritto a mano): o tutto, o niente, e fuori da qui la
   *   protezione non manca mai.
   */
  setAsideSession({ sessionId, asideId }) {
    id(sessionId, 'sessionId'); id(asideId, 'asideId');
    if (asideId === sessionId) fail('The aside id must differ from the session id');
    return tx(() => {
      session(sessionId);
      if (session(asideId, false)) fail('The aside session already exists', 'CTX_ASIDE_CONFLICT');
      const attivi = parseRows('SELECT job_json FROM compaction_jobs WHERE session_id=?', 'job_json', sessionId).filter(job => !['committed', 'failed', 'cancelled', 'paused'].includes(job.state));
      if (attivi.length) fail('A compaction job is active', 'CTX_JOB_ACTIVE');
      db.exec('PRAGMA defer_foreign_keys=ON');
      const guardie = all("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND name IN ('originals_no_update','assets_no_update','versions_no_update')");
      if (guardie.length !== 3 || guardie.some(g => typeof g.sql !== 'string' || !g.sql)) fail('The immutability guards are not the expected ones', 'CTX_PERSISTENCE_FAILED');
      for (const g of guardie) db.exec(`DROP TRIGGER ${g.name}`);
      /* L3-3: la copia dichiara di chi era e da quando (`asideOwner`): è ciò che la rende esportabile ed elencabile. */
      run("INSERT INTO context_sessions(session_id,revision,state_revision,head_sequence,settings_json,metadata_json,active_version_id) SELECT ?,revision,state_revision,head_sequence,settings_json,json_set(metadata_json,'$.aside',json(?)),active_version_id FROM context_sessions WHERE session_id=?", asideId, JSON.stringify({ id: asideId, of: sessionId, at: new Date().toISOString() }), sessionId);
      for (const tabella of ['original_records', 'record_assets', 'context_versions', 'summary_nodes', 'compaction_jobs', 'search_chunks', 'context_measurements']) run(`UPDATE ${tabella} SET session_id=? WHERE session_id=?`, asideId, sessionId);
      fault('aside-after-move');
      for (const g of guardie) db.exec(g.sql);
      /* La sessione viva deve restare un archivio COERENTE (`verifyContextArchive` gira a ogni commit di versione): un consumo
         legato a un lavoro segue il suo lavoro (i consumi senza lavoro restano contati qui), e un'informazione protetta resta
         della persona ma non può più citare originali che qui non ci sono: la copia da parte conserva le sue fonti, quella viva
         le perde. Trovato dalla prova: senza, il primo commit dopo la riparazione moriva con «Invalid usage ownership». */
      run('UPDATE usage_records SET session_id=? WHERE session_id=? AND job_id IS NOT NULL', asideId, sessionId);
      run('INSERT INTO protected_facts(session_id,id,fact_json) SELECT ?,id,fact_json FROM protected_facts WHERE session_id=?', asideId, sessionId);
      run("UPDATE protected_facts SET fact_json=json_set(fact_json,'$.sources',json('[]')) WHERE session_id=?", sessionId);
      run("UPDATE protected_facts SET fact_json=json_set(fact_json,'$.conflict.sources',json('[]')) WHERE session_id=? AND json_type(fact_json,'$.conflict') = 'object'", sessionId);
      run('UPDATE context_sessions SET revision=revision+1, state_revision=state_revision+1, head_sequence=0, active_version_id=NULL WHERE session_id=?', sessionId);
      return snapshot(sessionId);
    });
  },
  /** L3-3: le copie da parte di UNA conversazione, dalla più vecchia alla più nuova. */
  listAsideSessions({ sessionId }) {
    id(sessionId, 'sessionId');
    const prefisso = `${sessionId}.aside-`;
    return all('SELECT session_id, head_sequence, metadata_json FROM context_sessions WHERE substr(session_id,1,?)=? ORDER BY session_id', prefisso.length, prefisso)
      .map(row => ({ row, owner: asideOwner(row.session_id, row) }))
      .filter(({ owner }) => owner?.of === sessionId)
      .map(({ row, owner }) => ({ asideId: row.session_id, asideAt: owner.at, records: row.head_sequence }))
      .sort((a, b) => String(a.asideAt ?? '').localeCompare(String(b.asideAt ?? '')) || a.asideId.localeCompare(b.asideId));
  },
  /*
   * L3-3 (owner 13/10/2026, D1: «solo l'ULTIMA per conversazione») — toglie le copie da parte di `sessionId` tranne `keep`.
   * ⛔ Cancella dati della persona, quindi: SOLO dopo aver riletto e verificato PER INTERO la copia da tenere (lo stesso
   *   controllo dell'export: manifesto, provenienza, impronta di ogni originale); se non si rilegge non si cancella niente.
   * ⛔ Mai la conversazione viva, mai una copia di un'altra conversazione: si toccano solo gli id che `asideOwner` attribuisce
   *   a QUESTA. Una transazione sola: o tutte, o nessuna.
   * ⛔ Originali e versioni non si cancellano per trigger (`*_no_delete`): come in `setAsideSession`, le due guardie si
   *   sospendono e si ricreano DENTRO la transazione, col testo letto dal catalogo.
   * I blob (`content_blobs`) restano: sono indirizzati per contenuto e possono servire alla conversazione viva.
   */
  pruneAsideSessions({ sessionId, keep }) {
    id(sessionId, 'sessionId'); id(keep, 'keep');
    if (keep === sessionId) fail('The copy to keep must be a copy set aside, not the live session');
    return tx(() => {
      session(sessionId);
      const tenuta = session(keep, false);
      if (!tenuta) fail(keep.startsWith(`${sessionId}.aside-`) ? 'The copy to keep does not exist' : 'The copy to keep does not belong to this session', keep.startsWith(`${sessionId}.aside-`) ? 'CTX_SESSION_NOT_FOUND' : 'CTX_INVALID_INPUT');
      if (asideOwner(keep, tenuta)?.of !== sessionId) fail('The copy to keep does not belong to this session');
      verifyContextArchive(archive(keep));
      const daTogliere = methods.listAsideSessions({ sessionId }).map(copia => copia.asideId).filter(altro => altro !== keep && altro !== sessionId);
      if (!daTogliere.length) return { kept: keep, removed: [] };
      db.exec('PRAGMA defer_foreign_keys=ON');
      const guardie = all("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND name IN ('originals_no_delete','versions_no_delete')");
      if (guardie.length !== 2 || guardie.some(g => typeof g.sql !== 'string' || !g.sql)) fail('The immutability guards are not the expected ones', 'CTX_PERSISTENCE_FAILED');
      for (const g of guardie) db.exec(`DROP TRIGGER ${g.name}`);
      for (const altro of daTogliere) {
        for (const tabella of ['search_chunks', 'summary_nodes', 'usage_records', 'compaction_jobs', 'context_measurements', 'protected_facts', 'record_assets', 'context_outbox', 'context_mutations', 'context_versions', 'original_records', 'context_sessions']) run(`DELETE FROM ${tabella} WHERE session_id=?`, altro);
      }
      fault('prune-after-delete');
      for (const g of guardie) db.exec(g.sql);
      return { kept: keep, removed: daTogliere };
    });
  },
  readOriginals({ sessionId, afterSequence = 0, throughSequence = Number.MAX_SAFE_INTEGER, ids, limit = 1000 }) {
    id(sessionId, 'sessionId'); integer(afterSequence, 'afterSequence'); integer(throughSequence, 'throughSequence'); integer(limit, 'limit');
    if (ids !== undefined && (!Array.isArray(ids) || ids.some(value => !validId(value)))) fail('Invalid record ids');
    if (ids?.length === 0 || limit === 0) return [];
    const selected = new Set(ids);
    if (!ids) return parseRows('SELECT record_json FROM original_records WHERE session_id=? AND sequence>? AND sequence<=? ORDER BY sequence LIMIT ?', 'record_json', sessionId, afterSequence, throughSequence, limit);
    return originals(sessionId, afterSequence, throughSequence).filter(record => selected.has(record.id)).slice(0, limit);
  },
  updateSessionSettings({ sessionId, settings: value, expectedRevision }) {
    settings(value);
    return tx(() => { revision(session(sessionId), expectedRevision); run('UPDATE context_sessions SET settings_json=?,revision=revision+1,state_revision=state_revision+1 WHERE session_id=?', JSON.stringify(value), sessionId); return snapshot(sessionId); });
  },
  listContextVersions({ sessionId }) {
    id(sessionId, 'sessionId');
    return parseRows('SELECT version_json FROM context_versions WHERE session_id=? ORDER BY ordinal DESC', 'version_json', sessionId);
  },
  commitContextVersion({ sessionId, expectedRevision, expectedStateRevision, jobId, version }) {
    return tx(() => {
      const row = session(sessionId);
      revision(row, expectedRevision, integer(expectedStateRevision, 'expectedStateRevision'));
      const job = jobRow(sessionId, jobId);
      if (!job) fail('Context job does not exist', 'CTX_JOB_NOT_FOUND');
      if (job.state === 'cancelled') fail('Cancelled job cannot publish', 'CTX_JOB_CANCELLED');
      if (job.state !== 'ready') fail('Only a ready job can publish', 'CTX_JOB_NOT_READY');
      if (job.baseStateRevision !== row.state_revision || job.coveredThrough !== version?.coveredThrough || job.baseRevision > row.revision) fail('Job context is stale', 'CTX_STALE_REVISION');
      json(version);
      if (!object(version) || version.sessionId !== sessionId || JSON.stringify(version.model) !== JSON.stringify(job.model)) fail('Version does not match job', 'CTX_SOURCE_INVALID');
      // The archive verifier checks every immutable source/hash, summary and
      // measurement before the transaction promotes any candidate bytes.
      const preview = archive(sessionId);
      const completed = { ...job, state: 'committed', versionId: version.id, updatedAt: version.createdAt };
      preview.versions.unshift(version);
      preview.jobs = preview.jobs.map(entry => entry.id === jobId ? completed : entry);
      preview.session.jobs = preview.jobs;
      preview.session.activeVersion = version;
      const { manifest: unused, ...payload } = preview;
      preview.manifest.payloadSha256 = hash(JSON.stringify(payload));
      verifyContextArchive(preview);
      writeVersion(sessionId, version);
      fault('publish-after-version');
      run('UPDATE compaction_jobs SET state=?,job_json=? WHERE session_id=? AND id=?', completed.state, JSON.stringify(completed), sessionId, jobId);
      activate(sessionId, version, jobId);
      fault('publish-after-outbox');
      return version;
    });
  },
  restoreContextVersion({ sessionId, versionId, expectedRevision, newVersionId, createdAt }) {
    id(versionId); id(newVersionId); iso(createdAt);
    return tx(() => {
      revision(session(sessionId), expectedRevision);
      const row = get('SELECT version_json FROM context_versions WHERE session_id=? AND id=?', sessionId, versionId);
      if (!row) fail('Context version not found in this session', 'CTX_VERSION_NOT_FOUND');
      const version = { ...JSON.parse(row.version_json), id: newVersionId, createdAt, restoredFrom: versionId };
      writeVersion(sessionId, version);
      fault('restore-after-version');
      activate(sessionId, version, undefined, 'context.version.restored');
      return version;
    });
  },
  claimContextJob({ sessionId, job }) {
    validateJob(job, sessionId);
    return tx(() => {
      const row = session(sessionId);
      const byKey = get('SELECT job_json FROM compaction_jobs WHERE session_id=? AND idempotency_key=?', sessionId, job.idempotencyKey);
      if (byKey) {
        const prior = JSON.parse(byKey.job_json);
        if (prior.requestFingerprint !== job.requestFingerprint) fail('Idempotency key already used for a different request', 'CTX_IDEMPOTENCY_CONFLICT');
        if (prior.state === 'paused' && activeStates.includes(job.state)) {
          requireNoOtherActive(sessionId, prior.id);
          const resumed = { ...prior, state: job.state, updatedAt: job.updatedAt };
          delete resumed.error;
          run('UPDATE compaction_jobs SET state=?,job_json=? WHERE session_id=? AND id=?', resumed.state, JSON.stringify(resumed), sessionId, prior.id);
          return resumed;
        }
        return prior;
      }
      if (jobRow(sessionId, job.id)) fail('Job id already exists', 'CTX_IDEMPOTENCY_CONFLICT');
      if (!activeStates.includes(job.state) && job.state !== 'paused') fail('New job must be active or paused');
      if (job.baseRevision !== row.revision || job.baseStateRevision !== row.state_revision || job.coveredThrough > row.head_sequence) fail('Job starts from a stale snapshot', 'CTX_STALE_REVISION');
      if (activeStates.includes(job.state)) requireNoOtherActive(sessionId, job.id);
      run('INSERT INTO compaction_jobs(session_id,id,idempotency_key,state,job_json) VALUES(?,?,?,?,?)', sessionId, job.id, job.idempotencyKey, job.state, JSON.stringify(job));
      return job;
    });
  },
  saveJobProgress({ sessionId, job }) {
    validateJob(job, sessionId);
    return tx(() => {
      const prior = jobRow(sessionId, job.id);
      if (!prior) fail('Context job does not exist', 'CTX_JOB_NOT_FOUND');
      if (prior.state === 'cancelled' && JSON.stringify(prior) !== JSON.stringify(job)) fail('Cancelled job cannot be changed', 'CTX_JOB_CANCELLED');
      if (['committed', 'failed'].includes(prior.state) && JSON.stringify(prior) !== JSON.stringify(job)) fail('Completed job cannot be changed', 'CTX_JOB_TERMINAL');
      for (const key of ['schema', 'id', 'sessionId', 'idempotencyKey', 'requestFingerprint', 'kind', 'baseRevision', 'baseStateRevision', 'coveredThrough', 'model', 'createdAt']) if (JSON.stringify(prior[key]) !== JSON.stringify(job[key])) fail('Job identity and base snapshot are immutable', 'CTX_JOB_CONFLICT');
      // Cancellation changes state, never replaces a concurrent progress write.
      // Merge under the same SQLite transaction after validating immutable identity.
      if (job.state === 'cancelled') job = { ...prior, state: 'cancelled', updatedAt: Date.parse(job.updatedAt) >= Date.parse(prior.updatedAt) ? job.updatedAt : prior.updatedAt, ...(job.error ? { error: job.error } : {}) };
      if (job.state === 'committed' && prior.state !== 'committed') fail('A job may be committed only with a version', 'CTX_JOB_NOT_READY');
      if (job.versionId !== prior.versionId) fail('Job version is assigned by publication', 'CTX_JOB_CONFLICT');
      if (activeStates.includes(prior.state) && activeStates.includes(job.state) && activeStates.indexOf(job.state) < activeStates.indexOf(prior.state)) fail('Job phase cannot move backwards', 'CTX_JOB_CONFLICT');
      if (job.progress.completed < prior.progress.completed || job.completedSegments.length < prior.completedSegments.length || prior.completedSegments.some((segment, index) => JSON.stringify(segment) !== JSON.stringify(job.completedSegments[index]))) fail('Verified job progress cannot be discarded', 'CTX_JOB_CONFLICT');
      if (Date.parse(job.updatedAt) < Date.parse(prior.updatedAt)) fail('Job progress timestamp is stale', 'CTX_JOB_CONFLICT');
      if (activeStates.includes(job.state)) requireNoOtherActive(sessionId, job.id);
      run('UPDATE compaction_jobs SET state=?,job_json=? WHERE session_id=? AND id=?', job.state, JSON.stringify(job), sessionId, job.id);
      return job;
    });
  },
  readContextJob({ sessionId, jobId }) { return jobRow(sessionId, jobId); },
  upsertProtectedFact({ sessionId, fact, expectedRevision }) {
    json(fact);
    if (!object(fact) || !validId(fact.id) || typeof fact.text !== 'string' || !fact.text.trim() || !['active', 'conflict', 'removed'].includes(fact.status)) fail('Invalid protected fact');
    integer(fact.revision, 'fact revision');
    return tx(() => {
      revision(session(sessionId), expectedRevision);
      const normalized = { ...fact, sources: sources(sessionId, fact.sources) };
      if (fact.status === 'conflict') {
        if (!object(fact.conflict) || typeof fact.conflict.proposedText !== 'string' || !fact.conflict.proposedText.trim()) fail('Invalid protected fact conflict');
        normalized.conflict = { ...fact.conflict, sources: sources(sessionId, fact.conflict.sources) };
      }
      run('INSERT INTO protected_facts(session_id,id,fact_json) VALUES(?,?,?) ON CONFLICT(session_id,id) DO UPDATE SET fact_json=excluded.fact_json', sessionId, fact.id, JSON.stringify(normalized));
      run('UPDATE context_sessions SET revision=revision+1,state_revision=state_revision+1 WHERE session_id=?', sessionId);
      return normalized;
    });
  },
  removeProtectedFact({ sessionId, factId, expectedRevision }) {
    id(factId);
    return tx(() => {
      revision(session(sessionId), expectedRevision);
      const row = get('SELECT fact_json FROM protected_facts WHERE session_id=? AND id=?', sessionId, factId);
      if (!row) fail('Protected fact not found', 'CTX_FACT_NOT_FOUND');
      const prior = JSON.parse(row.fact_json);
      const fact = { ...prior, status: 'removed', revision: prior.revision + 1 };
      delete fact.conflict;
      run('UPDATE protected_facts SET fact_json=? WHERE session_id=? AND id=?', JSON.stringify(fact), sessionId, factId);
      run('UPDATE context_sessions SET revision=revision+1,state_revision=state_revision+1 WHERE session_id=?', sessionId);
      return fact;
    });
  },
  readContextOutbox({ sessionId, limit = 100 }) {
    id(sessionId, 'sessionId'); integer(limit, 'limit');
    if (!usageBackfilled.has(sessionId) && session(sessionId, false)) {
      tx(() => {
        for (const row of all('SELECT operation_id,job_id,usage_json FROM usage_records WHERE session_id=? ORDER BY ordinal', sessionId)) {
          enqueueUsage(sessionId, row.operation_id, row.job_id, JSON.parse(row.usage_json));
        }
      });
      usageBackfilled.add(sessionId);
    }
    return parseRows('SELECT event_json FROM context_outbox WHERE session_id=? AND acknowledged=0 ORDER BY ordinal LIMIT ?', 'event_json', sessionId, limit);
  },
  ackContextEvent({ sessionId, eventId }) { id(sessionId, 'sessionId'); id(eventId); run('UPDATE context_outbox SET acknowledged=1 WHERE session_id=? AND id=?', sessionId, eventId); },
  /*
   * 25/09/2026 — ticket della CLI «riassunto rifiutato richiesto a ogni passo», decisione owner «pausa che cresce + segnale»:
   *   l'AVVISO che la compattazione automatica è in pausa dopo un rifiuto. Id deterministico (uno per lavoro fallito, scelto
   *   dal motore) e `ON CONFLICT DO NOTHING`: ogni passo del giro che lo ripete non ne aggiunge un secondo.
   */
  recordContextNotice({ sessionId, event }) {
    id(sessionId, 'sessionId'); json(event);
    if (!object(event) || event.sessionId !== sessionId) fail('A context notice belongs to its own session');
    id(event.id);
    run('INSERT INTO context_outbox(session_id,id,event_json) VALUES(?,?,?) ON CONFLICT(session_id,id) DO NOTHING', sessionId, event.id, JSON.stringify(event));
  },
  recordUsage({ sessionId, jobId = null, operationId, usage }) {
    id(operationId); json(usage);
    if (!object(usage)) fail('Usage must be a JSON object');
    for (const [key, value] of Object.entries(usage)) {
      if (['inputTokens', 'outputTokens', 'totalTokens', 'cachedTokens'].includes(key)) integer(value, key);
      if (key === 'cost' && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) fail('Invalid usage cost');
      if (['currency', 'requestId'].includes(key) && typeof value !== 'string') fail('Invalid usage metadata');
    }
    return tx(() => {
      session(sessionId);
      if (jobId !== null && !jobRow(sessionId, jobId)) fail('Usage job belongs to no session job', 'CTX_JOB_NOT_FOUND');
      const prior = get('SELECT job_id,usage_json FROM usage_records WHERE session_id=? AND operation_id=?', sessionId, operationId);
      if (prior) {
        if (prior.job_id !== jobId || prior.usage_json !== JSON.stringify(usage)) fail('Usage operation contains different accounting', 'CTX_IDEMPOTENCY_CONFLICT');
        enqueueUsage(sessionId, operationId, jobId, usage);
        return;
      }
      run('INSERT INTO usage_records(session_id,operation_id,job_id,usage_json) VALUES(?,?,?,?)', sessionId, operationId, jobId, JSON.stringify(usage));
      fault('usage-after-record');
      enqueueUsage(sessionId, operationId, jobId, usage);
      fault('usage-after-outbox');
    });
  },
  readUsage({ sessionId }) {
    id(sessionId, 'sessionId');
    return all('SELECT operation_id,job_id,usage_json FROM usage_records WHERE session_id=? ORDER BY ordinal', sessionId).map(row => ({ sessionId, operationId: row.operation_id, jobId: row.job_id, usage: JSON.parse(row.usage_json) }));
  },
  readContextMutation({ sessionId, idempotencyKey, requestFingerprint }) {
    id(sessionId); id(idempotencyKey);
    if (typeof requestFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(requestFingerprint)) fail('Invalid request fingerprint');
    const prior = get('SELECT request_fingerprint,result_json FROM context_mutations WHERE session_id=? AND idempotency_key=?', sessionId, idempotencyKey);
    if (!prior) return null;
    if (prior.request_fingerprint !== requestFingerprint) fail('Idempotency key identifies a different request', 'CTX_IDEMPOTENCY_CONFLICT');
    return { result: JSON.parse(prior.result_json) };
  },
  putBlob({ sessionId, id: blobId, bytes, mimeType, sha256 }) {
    id(blobId);
    if (!(bytes instanceof Uint8Array) || typeof mimeType !== 'string' || !mimeType || mimeType.length > 256) fail('Invalid blob bytes or MIME');
    const digest = hash(bytes);
    if (sha256 !== undefined && digest !== sha256) fail('Blob hash mismatch', 'CTX_HASH_MISMATCH');
    return tx(() => {
      session(sessionId);
      const prior = get('SELECT sha256,mime_type FROM record_assets WHERE session_id=? AND id=?', sessionId, blobId);
      if (prior && (prior.sha256 !== digest || prior.mime_type !== mimeType)) fail('Asset id already contains different bytes or MIME', 'CTX_BLOB_CONFLICT');
      run('INSERT OR IGNORE INTO content_blobs(sha256,bytes) VALUES(?,?)', digest, bytes);
      run('INSERT OR IGNORE INTO record_assets(session_id,id,sha256,mime_type) VALUES(?,?,?,?)', sessionId, blobId, digest, mimeType);
      return { id: blobId, sha256: digest, mimeType, byteLength: bytes.byteLength };
    });
  },
  readBlob({ sessionId, id: blobId }) {
    id(sessionId, 'sessionId'); id(blobId);
    const row = get('SELECT a.id,a.sha256,a.mime_type,b.bytes FROM record_assets a JOIN content_blobs b ON a.sha256=b.sha256 WHERE a.session_id=? AND a.id=?', sessionId, blobId);
    if (!row) return null;
    if (hash(row.bytes) !== row.sha256) fail('Stored blob failed integrity verification', 'CTX_HASH_MISMATCH');
    return { id: row.id, sha256: row.sha256, mimeType: row.mime_type, bytes: row.bytes };
  },
  replaceSearchChunks({ sessionId, chunks }) {
    if (!Array.isArray(chunks)) fail('Chunks must be an array');
    return tx(() => {
      session(sessionId);
      const seen = new Set();
      let dimensions;
      for (const chunk of chunks) {
        json(chunk);
        if (!object(chunk) || !validId(chunk.id) || seen.has(chunk.id) || !validId(chunk.recordId)) fail('Invalid or duplicate search chunk', 'CTX_SOURCE_INVALID');
        seen.add(chunk.id);
        const row = get('SELECT sequence,record_json FROM original_records WHERE session_id=? AND id=?', sessionId, chunk.recordId);
        if (!row || row.sequence !== chunk.sequence || !Number.isSafeInteger(chunk.start) || chunk.start < 0 || !Number.isSafeInteger(chunk.end) || chunk.end <= chunk.start || typeof chunk.text !== 'string' || textOf(JSON.parse(row.record_json).message).slice(chunk.start, chunk.end) !== chunk.text || chunk.text.length !== chunk.end - chunk.start) fail('Chunk offsets do not match session original', 'CTX_SOURCE_INVALID');
        if (chunk.embedding !== undefined) {
          if (!Array.isArray(chunk.embedding) || !chunk.embedding.length || chunk.embedding.length > 65536 || chunk.embedding.some(value => typeof value !== 'number' || !Number.isFinite(value) || !Number.isFinite(Math.fround(value)))) fail('Invalid search embedding');
          dimensions ??= chunk.embedding.length;
          if (chunk.embedding.length !== dimensions) fail('Embedding dimensions differ');
        }
      }
      run('DELETE FROM search_chunks WHERE session_id=?', sessionId);
      for (const chunk of chunks) run('INSERT INTO search_chunks(session_id,id,record_id,sequence,text,start,end,embedding,dimensions) VALUES(?,?,?,?,?,?,?,?,?)', sessionId, chunk.id, chunk.recordId, chunk.sequence, chunk.text, chunk.start, chunk.end, chunk.embedding ? new Uint8Array(new Float32Array(chunk.embedding).buffer) : null, chunk.embedding?.length ?? null);
    });
  },
  searchLexical({ sessionId, query, limit = 20 }) {
    id(sessionId, 'sessionId'); integer(limit, 'limit');
    if (typeof query !== 'string' || query.length > 8000) fail('Invalid lexical query');
    const terms = query.match(/[\p{L}\p{N}_]+/gu)?.slice(0, 100) ?? [];
    if (!terms.length || limit === 0) return [];
    const escaped = terms.map(term => `"${term.replaceAll('"', '""')}"`).join(' OR ');
    return all('SELECT c.id,c.record_id AS recordId,c.sequence,c.text,c.start,c.end,-bm25(search_chunks_fts) AS score FROM search_chunks_fts JOIN search_chunks c ON c.rowid=search_chunks_fts.rowid WHERE search_chunks_fts MATCH ? AND c.session_id=? ORDER BY score DESC,c.sequence,c.start,c.id LIMIT ?', escaped, sessionId, limit);
  },
  searchVector({ sessionId, embedding, limit = 20 }) {
    id(sessionId, 'sessionId'); integer(limit, 'limit');
    if (!vector) fail('Pinned sqlite-vec extension is unavailable', 'CTX_VECTOR_UNAVAILABLE');
    if (!Array.isArray(embedding) || !embedding.length || embedding.some(value => typeof value !== 'number' || !Number.isFinite(value) || !Number.isFinite(Math.fround(value)))) fail('Invalid query embedding');
    const dimensions = get('SELECT dimensions FROM search_chunks WHERE session_id=? AND embedding IS NOT NULL LIMIT 1', sessionId)?.dimensions;
    if (dimensions !== undefined && dimensions !== embedding.length) fail('Query embedding dimensions differ');
    return all('SELECT id,record_id AS recordId,sequence,text,start,end,1-vec_distance_cosine(embedding,?) AS score FROM search_chunks WHERE session_id=? AND embedding IS NOT NULL ORDER BY score DESC,sequence,start,id LIMIT ?', new Uint8Array(new Float32Array(embedding).buffer), sessionId, limit);
  },
  exportSession({ sessionId }) { return tx(() => verifyContextArchive(archive(sessionId))); },
  importSession({ archive: input }) {
    const verified = verifyContextArchive(input);
    return tx(() => {
      const { session: snap } = verified;
      const sessionId = snap.sessionId;
      if (session(sessionId, false)) {
        const current = archive(sessionId);
        if (!isDeepStrictEqual(comparableArchive(current), comparableArchive(verified))) fail('Existing context session diverges from import', 'CTX_IMPORT_CONFLICT');
        return snapshot(sessionId);
      }
      run('INSERT INTO context_sessions(session_id,revision,state_revision,head_sequence,settings_json,metadata_json,active_version_id) VALUES(?,?,?,?,?,?,?)', sessionId, snap.revision, snap.stateRevision, snap.headSequence, JSON.stringify(snap.settings), JSON.stringify(snap.metadata), snap.activeVersion?.id ?? null);
      for (const blob of verified.blobs) {
        run('INSERT OR IGNORE INTO content_blobs(sha256,bytes) VALUES(?,?)', blob.sha256, Buffer.from(blob.base64, 'base64'));
        run('INSERT INTO record_assets(session_id,id,sha256,mime_type) VALUES(?,?,?,?)', sessionId, blob.id, blob.sha256, blob.mimeType);
      }
      for (const record of verified.records) run('INSERT INTO original_records(session_id,id,sequence,sha256,record_json) VALUES(?,?,?,?,?)', sessionId, record.id, record.sequence, record.sha256, JSON.stringify(record));
      fault('import-after-records');
      for (const version of [...verified.versions].reverse()) writeVersion(sessionId, version);
      for (const fact of verified.facts) run('INSERT INTO protected_facts(session_id,id,fact_json) VALUES(?,?,?)', sessionId, fact.id, JSON.stringify(fact));
      for (const job of verified.jobs) run('INSERT INTO compaction_jobs(session_id,id,idempotency_key,state,job_json) VALUES(?,?,?,?,?)', sessionId, job.id, job.idempotencyKey, job.state, JSON.stringify(job));
      for (const item of verified.usage) run('INSERT INTO usage_records(session_id,operation_id,job_id,usage_json) VALUES(?,?,?,?)', sessionId, item.operationId, item.jobId ?? null, JSON.stringify(item.usage));
      for (const item of verified.mutations ?? []) run('INSERT INTO context_mutations(session_id,idempotency_key,request_fingerprint,result_json) VALUES(?,?,?,?)', sessionId, item.idempotencyKey, item.requestFingerprint, JSON.stringify(item.result));
      return snapshot(sessionId);
    });
  },
  async backup({ destinationPath }) {
    if (typeof destinationPath !== 'string' || !destinationPath || destinationPath.includes('\0') || destinationPath === ':memory:') fail('Invalid backup destination');
    const target = resolve(destinationPath);
    if (databasePath !== ':memory:' && target.toLowerCase() === resolve(databasePath).toLowerCase()) fail('Backup destination must differ from database', 'CTX_BACKUP_CONFLICT');
    if (existsSync(target)) fail('Backup destination already exists', 'CTX_BACKUP_CONFLICT');
    mkdirSync(dirname(target), { recursive: true });
    // Exclusive reservation prevents overwriting another backup or a raced file.
    const fd = openSync(target, 'wx'); closeSync(fd);
    try {
      await backup(db, target);
      const bytes = readFileSync(target);
      return { schema: 'talos.context.backup.v1', sha256: hash(bytes), byteLength: bytes.length, createdAt: new Date().toISOString(), sqliteVersion: get('SELECT sqlite_version() AS version').version };
    } catch (error) {
      try { unlinkSync(target); } catch { /* Preserve original failure. */ }
      throw new ContextStoreError('SQLite backup failed', 'CTX_BACKUP_FAILED', { cause: error });
    }
  },
  health() { return { sqliteVersion: get('SELECT sqlite_version() AS version').version, fts5: !!get("SELECT name FROM sqlite_master WHERE name='search_chunks_fts'"), vector, integrity: get('PRAGMA integrity_check').integrity_check }; },
  close() { db.close(); },
};

let queue = Promise.resolve();
const idempotentMethods = new Set(['updateSessionSettings', 'upsertProtectedFact', 'removeProtectedFact', 'restoreContextVersion', 'saveJobProgress']);
parentPort.on('message', request => {
  queue = queue.then(async () => {
    try {
      if (!object(request) || !Object.hasOwn(methods, request.method) || !object(request.args)) fail('Unknown context worker operation');
      const result = idempotentMethods.has(request.method) && request.args.idempotencyKey !== undefined
        ? tx(() => {
          const prior = methods.readContextMutation(request.args);
          if (prior) return prior.result;
          const output = methods[request.method](request.args);
          json(output);
          run('INSERT INTO context_mutations(session_id,idempotency_key,request_fingerprint,result_json) VALUES(?,?,?,?)', request.args.sessionId, request.args.idempotencyKey, request.args.requestFingerprint, JSON.stringify(output));
          return output;
        })
        : await methods[request.method](request.args);
      parentPort.postMessage({ id: request.id, result });
      if (request.method === 'close') parentPort.close();
    } catch (error) {
      parentPort.postMessage({ id: request.id, error: { code: error?.code?.startsWith('CTX_') ? error.code : 'CTX_PERSISTENCE_FAILED', message: error?.code?.startsWith('CTX_') ? error.message : 'Context persistence operation failed' } });
    }
  });
});
