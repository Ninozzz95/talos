import type { capSQLiteVersionUpgrade } from '@capacitor-community/sqlite'

export const TALOS_CHAT_DATABASE_NAME = 'talos_mobile'
export const TALOS_CHAT_DATABASE_VERSION = 3

const VERSION_1_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS talos_chat_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 255),
        surface TEXT NOT NULL DEFAULT 'chat' CHECK (surface IN ('chat', 'browse')),
        mode TEXT NOT NULL DEFAULT 'verified_execution' CHECK (mode IN ('answer_only', 'verified_execution')),
        persistence_mode TEXT NOT NULL DEFAULT 'persistent' CHECK (persistence_mode IN ('persistent', 'temporary')),
        active_model_profile_id TEXT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS talos_chat_sessions_updated_idx
        ON talos_chat_sessions(updated_at DESC, created_at DESC, id DESC);`,
    `CREATE TABLE IF NOT EXISTS talos_chat_messages (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
        content TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'persisted' CHECK (state IN ('persisted', 'pending', 'failed')),
        model_profile_id TEXT NULL,
        run_id TEXT NULL,
        ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES talos_chat_sessions(id) ON DELETE CASCADE,
        UNIQUE (session_id, ordinal)
    );`,
    `CREATE INDEX IF NOT EXISTS talos_chat_messages_session_order_idx
        ON talos_chat_messages(session_id, ordinal, created_at, id);`,
    `CREATE TABLE IF NOT EXISTS talos_chat_attachments (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL,
        message_id TEXT NULL,
        display_name TEXT NOT NULL,
        media_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
        local_uri TEXT NOT NULL,
        sha256 TEXT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'available', 'failed', 'revoked')),
        grant_scope TEXT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES talos_chat_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (message_id) REFERENCES talos_chat_messages(id) ON DELETE CASCADE
    );`,
    `CREATE INDEX IF NOT EXISTS talos_chat_attachments_session_idx
        ON talos_chat_attachments(session_id, created_at, id);`,
    `CREATE TABLE IF NOT EXISTS talos_chat_tool_activities (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL,
        message_id TEXT NULL,
        operation TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled', 'recovery_required')),
        payload_json TEXT NOT NULL DEFAULT '{}',
        evidence_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES talos_chat_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (message_id) REFERENCES talos_chat_messages(id) ON DELETE CASCADE
    );`,
    `CREATE INDEX IF NOT EXISTS talos_chat_tool_activities_session_idx
        ON talos_chat_tool_activities(session_id, created_at, id);`,
    `CREATE TABLE IF NOT EXISTS talos_chat_state (
        key TEXT PRIMARY KEY NOT NULL,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );`,
] as const

const VERSION_2_STATEMENTS = [
    `ALTER TABLE talos_chat_attachments RENAME TO talos_chat_attachments_v1;`,
    `CREATE TABLE IF NOT EXISTS talos_vault_files (
        id TEXT PRIMARY KEY NOT NULL,
        display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 255),
        media_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
        private_uri TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'available', 'failed', 'revoked')),
        trust TEXT NOT NULL DEFAULT 'untrusted' CHECK (trust IN ('untrusted')),
        sha256 TEXT NULL,
        extracted_text TEXT NULL,
        failure_code TEXT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS talos_vault_files_status_updated_idx
        ON talos_vault_files(status, updated_at DESC, created_at DESC, id DESC);`,
    `CREATE TABLE IF NOT EXISTS talos_file_authority_grants (
        id TEXT PRIMARY KEY NOT NULL,
        vault_file_id TEXT NOT NULL,
        permissions_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
        label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 255),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        revoked_at TEXT NULL,
        FOREIGN KEY (vault_file_id) REFERENCES talos_vault_files(id) ON DELETE CASCADE
    );`,
    `CREATE INDEX IF NOT EXISTS talos_file_authority_grants_file_status_idx
        ON talos_file_authority_grants(vault_file_id, status, created_at, id);`,
    `CREATE TABLE IF NOT EXISTS talos_chat_attachments (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL,
        message_id TEXT NULL,
        vault_file_id TEXT NOT NULL,
        grant_id TEXT NOT NULL,
        display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 255),
        media_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES talos_chat_sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (message_id) REFERENCES talos_chat_messages(id) ON DELETE CASCADE,
        FOREIGN KEY (vault_file_id) REFERENCES talos_vault_files(id) ON DELETE RESTRICT,
        FOREIGN KEY (grant_id) REFERENCES talos_file_authority_grants(id) ON DELETE RESTRICT,
        UNIQUE (message_id, vault_file_id)
    );`,
    `CREATE INDEX IF NOT EXISTS talos_chat_attachments_message_idx
        ON talos_chat_attachments(message_id, created_at, id);`,
    `INSERT INTO talos_vault_files
        (id, display_name, media_type, size_bytes, private_uri, status, trust, sha256,
         extracted_text, failure_code, metadata_json, created_at, updated_at)
     SELECT 'legacy:' || id, display_name, media_type, size_bytes, local_uri,
            CASE WHEN status = 'revoked' THEN 'revoked'
                 WHEN status = 'failed' THEN 'failed'
                 ELSE 'available' END,
            'untrusted', sha256, NULL,
            CASE WHEN status = 'failed' THEN 'TALOS_ATTACHMENT_LEGACY_FAILED' ELSE NULL END,
            metadata_json, created_at, updated_at
     FROM talos_chat_attachments_v1;`,
    `INSERT INTO talos_file_authority_grants
        (id, vault_file_id, permissions_json, status, label, created_at, updated_at, revoked_at)
     SELECT 'legacy-grant:' || id, 'legacy:' || id, '["model.read"]',
            CASE WHEN status = 'revoked' THEN 'revoked' ELSE 'active' END,
            display_name, created_at, updated_at,
            CASE WHEN status = 'revoked' THEN updated_at ELSE NULL END
     FROM talos_chat_attachments_v1;`,
    `INSERT INTO talos_chat_attachments
        (id, session_id, message_id, vault_file_id, grant_id, display_name,
         media_type, size_bytes, created_at)
     SELECT id, session_id, message_id, 'legacy:' || id, 'legacy-grant:' || id,
            display_name, media_type, size_bytes, created_at
     FROM talos_chat_attachments_v1;`,
    `DROP TABLE talos_chat_attachments_v1;`,
] as const

// F4 Memory station — desktop-parity memory registry. Every row is untrusted
// by construction (trust_level fixed at 'untrusted'); status transitions are
// how memories are disabled/quarantined, never silent deletion by the model.
const VERSION_3_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS talos_memories (
        id TEXT PRIMARY KEY NOT NULL,
        scope_type TEXT NOT NULL DEFAULT 'global' CHECK (scope_type IN ('global', 'project', 'session')),
        scope_id TEXT NULL,
        kind TEXT NOT NULL DEFAULT 'project_fact' CHECK (kind IN ('preference', 'project_fact', 'procedure', 'policy_note', 'rejected')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'quarantined', 'rejected')),
        title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 255),
        content TEXT NOT NULL,
        source TEXT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        trust_level TEXT NOT NULL DEFAULT 'untrusted',
        last_used_at TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS talos_memories_status_scope_idx
        ON talos_memories(status, scope_type, scope_id, updated_at DESC, id);`,
] as const

export const TALOS_CHAT_DATABASE_UPGRADES: readonly capSQLiteVersionUpgrade[] = Object.freeze([
    Object.freeze({
        toVersion: 1,
        statements: [...VERSION_1_STATEMENTS],
    }),
    Object.freeze({
        toVersion: 2,
        statements: [...VERSION_2_STATEMENTS],
    }),
    Object.freeze({
        toVersion: 3,
        statements: [...VERSION_3_STATEMENTS],
    }),
])
