CREATE TABLE IF NOT EXISTS context_sessions (
  session_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  state_revision INTEGER NOT NULL DEFAULT 0 CHECK(state_revision >= 0),
  head_sequence INTEGER NOT NULL DEFAULT 0 CHECK(head_sequence >= 0),
  settings_json TEXT NOT NULL CHECK(json_valid(settings_json)),
  metadata_json TEXT NOT NULL CHECK(json_valid(metadata_json)),
  active_version_id TEXT
) STRICT;
CREATE TABLE IF NOT EXISTS original_records (
  session_id TEXT NOT NULL REFERENCES context_sessions(session_id),
  id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK(sequence > 0),
  sha256 TEXT NOT NULL,
  record_json TEXT NOT NULL CHECK(json_valid(record_json)),
  PRIMARY KEY(session_id, id),
  UNIQUE(session_id, sequence)
) STRICT;
CREATE TRIGGER IF NOT EXISTS originals_no_update BEFORE UPDATE ON original_records
BEGIN SELECT RAISE(ABORT, 'original records are immutable'); END;
CREATE TRIGGER IF NOT EXISTS originals_no_delete BEFORE DELETE ON original_records
BEGIN SELECT RAISE(ABORT, 'original records are immutable'); END;
CREATE TABLE IF NOT EXISTS content_blobs (
  sha256 TEXT PRIMARY KEY,
  bytes BLOB NOT NULL
) STRICT;
CREATE TRIGGER IF NOT EXISTS blobs_no_update BEFORE UPDATE ON content_blobs
BEGIN SELECT RAISE(ABORT, 'original blobs are immutable'); END;
CREATE TRIGGER IF NOT EXISTS blobs_no_delete BEFORE DELETE ON content_blobs
BEGIN SELECT RAISE(ABORT, 'original blobs are immutable'); END;
CREATE TABLE IF NOT EXISTS record_assets (
  session_id TEXT NOT NULL REFERENCES context_sessions(session_id),
  id TEXT NOT NULL,
  sha256 TEXT NOT NULL REFERENCES content_blobs(sha256),
  mime_type TEXT NOT NULL,
  PRIMARY KEY(session_id, id)
) STRICT;
CREATE TRIGGER IF NOT EXISTS assets_no_update BEFORE UPDATE ON record_assets
BEGIN SELECT RAISE(ABORT, 'original assets are immutable'); END;
CREATE TABLE IF NOT EXISTS context_versions (
  ordinal INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES context_sessions(session_id),
  id TEXT NOT NULL,
  version_json TEXT NOT NULL CHECK(json_valid(version_json)),
  UNIQUE(session_id, id)
) STRICT;
CREATE TRIGGER IF NOT EXISTS versions_no_update BEFORE UPDATE ON context_versions
BEGIN SELECT RAISE(ABORT, 'context versions are immutable'); END;
CREATE TRIGGER IF NOT EXISTS versions_no_delete BEFORE DELETE ON context_versions
BEGIN SELECT RAISE(ABORT, 'context versions are immutable'); END;
CREATE TABLE IF NOT EXISTS summary_nodes (
  session_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  summary_json TEXT NOT NULL CHECK(json_valid(summary_json)),
  PRIMARY KEY(session_id, version_id),
  FOREIGN KEY(session_id, version_id) REFERENCES context_versions(session_id, id)
) STRICT;
CREATE TABLE IF NOT EXISTS protected_facts (
  session_id TEXT NOT NULL REFERENCES context_sessions(session_id),
  id TEXT NOT NULL,
  fact_json TEXT NOT NULL CHECK(json_valid(fact_json)),
  PRIMARY KEY(session_id, id)
) STRICT;
CREATE TABLE IF NOT EXISTS compaction_jobs (
  session_id TEXT NOT NULL REFERENCES context_sessions(session_id),
  id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  state TEXT NOT NULL,
  job_json TEXT NOT NULL CHECK(json_valid(job_json)),
  PRIMARY KEY(session_id, id),
  UNIQUE(session_id, idempotency_key)
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS context_one_active_job ON compaction_jobs(session_id)
WHERE state IN ('queued','preparing','summarizing','validating','ready');
CREATE TABLE IF NOT EXISTS context_outbox (
  ordinal INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES context_sessions(session_id),
  id TEXT NOT NULL,
  event_json TEXT NOT NULL CHECK(json_valid(event_json)),
  acknowledged INTEGER NOT NULL DEFAULT 0 CHECK(acknowledged IN (0,1)),
  UNIQUE(session_id, id)
) STRICT;
CREATE TABLE IF NOT EXISTS search_chunks (
  rowid INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL,
  id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  text TEXT NOT NULL,
  start INTEGER NOT NULL,
  end INTEGER NOT NULL,
  embedding BLOB,
  dimensions INTEGER,
  UNIQUE(session_id, id),
  FOREIGN KEY(session_id, record_id) REFERENCES original_records(session_id, id)
) STRICT;
CREATE VIRTUAL TABLE IF NOT EXISTS search_chunks_fts USING fts5(text, content='search_chunks', content_rowid='rowid');
CREATE TRIGGER IF NOT EXISTS search_chunks_insert AFTER INSERT ON search_chunks
BEGIN INSERT INTO search_chunks_fts(rowid,text) VALUES(new.rowid,new.text); END;
CREATE TRIGGER IF NOT EXISTS search_chunks_delete AFTER DELETE ON search_chunks
BEGIN INSERT INTO search_chunks_fts(search_chunks_fts,rowid,text) VALUES('delete',old.rowid,old.text); END;
CREATE TABLE IF NOT EXISTS usage_records (
  ordinal INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES context_sessions(session_id),
  operation_id TEXT NOT NULL,
  job_id TEXT,
  usage_json TEXT NOT NULL CHECK(json_valid(usage_json)),
  UNIQUE(session_id, operation_id)
) STRICT;
CREATE TABLE IF NOT EXISTS context_mutations (
  session_id TEXT NOT NULL REFERENCES context_sessions(session_id),
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  result_json TEXT NOT NULL CHECK(json_valid(result_json)),
  PRIMARY KEY(session_id,idempotency_key)
) STRICT;
PRAGMA user_version = 1;

-- 09/09/2026 — l'ULTIMA misura preparata per la richiesta (strumenti e riserva compresi), con la
-- revisione a cui si riferisce: la modale la mostra come «misurata alle …», mai come dato vivo.
CREATE TABLE IF NOT EXISTS context_measurements (
  session_id TEXT PRIMARY KEY REFERENCES context_sessions(session_id),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  measured_at TEXT NOT NULL,
  measurement_json TEXT NOT NULL CHECK(json_valid(measurement_json))
) STRICT;
