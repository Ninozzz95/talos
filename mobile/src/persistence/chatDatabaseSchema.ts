import type { capSQLiteVersionUpgrade } from '@capacitor-community/sqlite'

export const TALOS_CHAT_DATABASE_NAME = 'talos_mobile'
export const TALOS_CHAT_DATABASE_VERSION = 8

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

// F5 stations — run-linked local tasks + untrusted notes (airplane-mode
// functional; notes are disclosed context only, like memories).
const VERSION_4_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS talos_tasks (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 255),
        description TEXT NULL,
        run_id TEXT NULL,
        priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
        status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS talos_tasks_status_idx
        ON talos_tasks(status, updated_at DESC, id);`,
    `CREATE TABLE IF NOT EXISTS talos_notes (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 255),
        content TEXT NOT NULL,
        trust_level TEXT NOT NULL DEFAULT 'untrusted',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS talos_notes_updated_idx
        ON talos_notes(updated_at DESC, id);`,
] as const

/**
 * A research run, and everything that happened during it.
 *
 * Two tables and only one of them is the truth. `talos_research_events` is an
 * append-only journal: it is never updated and never deleted from, and the
 * state of a run is what you get by replaying it. `talos_research_runs` is a
 * projection of that journal kept only so the station can list runs without
 * reading every event of every one of them.
 *
 * Written this way because of what the journal has to survive. On a phone the
 * process is killed as a matter of course — Doze, the six-hour foreground
 * budget, an OEM that reclaims memory whenever it likes — and a row updated in
 * place tells you only what it believed at the end. The journal tells you that
 * a search FINISHED before the process died, which is the difference between
 * paying for it once and paying for it twice.
 *
 * `UNIQUE (run_id, seq)` is the whole guard against a double append. A write
 * acknowledged after the process died is replayed on the next boot, and without
 * the constraint the same step would be counted twice — in a spend figure shown
 * to the user, who is paying for it.
 */
const VERSION_5_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS talos_research_runs (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL,
        question TEXT NOT NULL CHECK (length(question) BETWEEN 1 AND 4000),
        depth TEXT NOT NULL CHECK (depth IN ('quick', 'deep', 'exhaustive')),
        engine TEXT NOT NULL DEFAULT 'device' CHECK (engine IN ('device', 'cloud')),
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS talos_research_runs_updated_idx
        ON talos_research_runs(updated_at DESC, id DESC);`,
    `CREATE TABLE IF NOT EXISTS talos_research_events (
        run_id TEXT NOT NULL,
        seq INTEGER NOT NULL CHECK (seq >= 0),
        kind TEXT NOT NULL,
        at TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        UNIQUE (run_id, seq)
    );`,
    `CREATE INDEX IF NOT EXISTS talos_research_events_run_idx
        ON talos_research_events(run_id, seq);`,
] as const

/**
 * Le attività imparano a RIPETERSI.
 *
 * ## Cosa manca oggi
 *
 * Un'attività di TALOS è una riga con uno stato: da fare, in corso, fatta. È il
 * modello di una lista della spesa, e va benissimo per quello. Ma l'owner ha
 * chiesto la funzione «Pianificare» di ChatGPT, che è un'altra cosa: un'istruzione
 * che TALOS esegue DA SOLO a un'ora stabilita, e il cui risultato arriva come
 * notifica.
 *
 * ## Perché tre colonne e non una tabella nuova
 *
 * Perché sono la stessa entità vista due volte. «Ricordami di chiamare il
 * commercialista giovedì» e «ogni mattina alle 8 riassumimi le notizie» sono
 * tutte e due attività: la seconda ha in più un orario e un'istruzione. Una
 * tabella separata avrebbe costretto ogni superficie — l'elenco, la ricerca, i
 * tool della chat — a leggerne due e a fonderle a mano, per sempre.
 *
 * - `schedule_json`: NULL per un'attività normale. Quando c'è, dice quando
 *   ripartire. JSON e non colonne separate perché la forma della ricorrenza
 *   cambierà (giorni della settimana, fine, condizioni) e ogni cambiamento
 *   sarebbe una migrazione; qui il contratto vive nel codice, dove è provato.
 * - `instruction`: cosa chiedere al modello. Separata dalla descrizione perché
 *   la descrizione la legge un umano e l'istruzione la esegue una macchina, e
 *   confonderle significa mandare al modello degli appunti.
 * - `last_run_at`: quando è partita l'ultima volta. Serve a NON rieseguire dopo
 *   un riavvio, ed è l'unico modo di saperlo che sopravvive alla morte del
 *   processo.
 *
 * `ALTER TABLE ADD COLUMN` con un default nullo non riscrive la tabella e non
 * tocca una sola riga esistente: chi aggiorna trova le sue attività dov'erano.
 */
const VERSION_6_STATEMENTS = [
    `ALTER TABLE talos_tasks ADD COLUMN schedule_json TEXT NULL;`,
    `ALTER TABLE talos_tasks ADD COLUMN instruction TEXT NULL;`,
    `ALTER TABLE talos_tasks ADD COLUMN last_run_at TEXT NULL;`,
    /*
     * L'indice guarda `schedule_json`, non lo stato: chi cerca «cosa deve
     * partire» scorre solo le attività pianificate, che saranno sempre una
     * frazione. Senza, ogni risveglio del programmatore leggerebbe l'intera
     * tabella per scartarne quasi tutto.
     */
    `CREATE INDEX IF NOT EXISTS talos_tasks_scheduled_idx
        ON talos_tasks(schedule_json, updated_at DESC, id);`,
] as const

/**
 * ⛔ Versione 7 — la provenienza del contenuto, riga per riga (A8).
 *
 * ## Il difetto che cura, misurato
 *
 * La difesa contro l'iniezione indiretta guardava una bandiera **statica per
 * tool**: `notes_list` dichiara «porta dentro contenuto non attendibile», e lo
 * dichiara sempre, che le note le abbia scritte l'utente o gliele abbia
 * riassunte il modello da una pagina web.
 *
 * Il conto sul catalogo di oggi: **15 tool su 38** tingono la conversazione, e
 * fra questi ci sono `notes_list`, `tasks_list`, `memory_search`,
 * `library_list` — le letture più banali. Quindi dopo la **prima** lettura
 * qualsiasi, tutti e otto i tool che possono trasmettere chiudono la trifecta e
 * chiedono conferma. Ogni volta.
 *
 * La ricerca lo chiama **label creep** e dice che è il modo tipico in cui
 * queste difese falliscono: non perché non scattino, ma perché scattano sempre
 * e vengono spente (arXiv 2604.23374, «Ghost in the Agent»). `security.ts` se
 * lo diceva già da solo — «una difesa che scatta sempre viene disattivata dopo
 * tre giorni» — e intanto il codice la costruiva così.
 *
 * ## Cosa cambia
 *
 * L'etichetta smette di essere una proprietà del **tool** e diventa una
 * proprietà del **dato**, registrata quando il dato nasce. La Libreria ce
 * l'aveva già (`origin: uploaded | generated | downloaded`); qui la prendono le
 * altre quattro superfici che portano testo.
 *
 * ## Perché si eredita, e non si chiede
 *
 * Una nota scritta dal modello **mentre la conversazione era già contaminata**
 * è contaminata: il testo viene da lì. Quindi il valore non lo decide chi
 * scrive — lo decide lo stato della catena in quell'istante, che è l'unica
 * cosa che sa da dove arriva il contenuto.
 *
 * `NULL` significa «scritta prima che questa colonna esistesse», e va letta
 * come **non attendibile**: il predefinito prudente è quello che non regala
 * fiducia a righe di cui non sappiamo la storia.
 */
const VERSION_7_STATEMENTS = [
    `ALTER TABLE talos_notes ADD COLUMN content_origin TEXT NULL;`,
    `ALTER TABLE talos_tasks ADD COLUMN content_origin TEXT NULL;`,
    `ALTER TABLE talos_memories ADD COLUMN content_origin TEXT NULL;`,
    `ALTER TABLE talos_research_runs ADD COLUMN content_origin TEXT NULL;`,
] as const

/**
 * ⛔⛔ Owner 2026-08-27 — Tool Forge Fase 3, finding critico della revisione
 * ("la persistenza non è adatta a stato sensibile o aggiornamenti
 * concorrenti"): `registryStore.ts` teneva l'intero registro come UN blob
 * JSON in Capacitor Preferences (`Preferences.get` → `JSON.parse` → muta
 * → `Preferences.set` dell'intero envelope). Confermato leggendo Android
 * SharedPreferences (su cui Preferences si appoggia): **nessuna garanzia
 * di consistenza multi-thread** sul ciclo read-modify-write — due
 * `install`/`rollback` in corsa vedono lo stesso stato di partenza e
 * l'ultimo `write()` vince, un lost update da manuale.
 *
 * ⇒ Tre tabelle nello STESSO database cifrato della chat (non uno nuovo:
 * `@capacitor-community/sqlite` + `databaseKey.ts`/`databaseProtection.ts`
 * sono già qui, vedi `talosSqliteRuntime()`), con transazioni vere
 * (`beginTransaction`/`commitTransaction`/`rollbackTransaction`, stessa
 * `transaction()` serializzata di `sqliteChatRepository.ts`):
 *
 * - `talos_forge_tools` — lo stato installato corrente, una riga per id.
 * - `talos_forge_tool_versions` — la storia delle versioni precedenti,
 *   righe vere invece di un array `previousVersions` dentro il JSON
 *   (che veniva anche tagliato a mano a 10 con `.slice(-10)`, ora una
 *   DELETE con lo stesso limite, non più un accorgimento in memoria).
 * - `talos_forge_audit` — APPEND-ONLY, mai aggiornata né cancellata,
 *   stesso principio di `talos_research_events` sopra: install/enable/
 *   disable/rollback/remove lasciano una traccia che sopravvive al
 *   processo, che oggi (Preferences) non esisteva affatto.
 */
const VERSION_8_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS talos_forge_tools (
        id TEXT PRIMARY KEY NOT NULL,
        manifest_json TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version >= 1),
        enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
        installed_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS talos_forge_tools_updated_idx
        ON talos_forge_tools(updated_at DESC, id);`,
    `CREATE TABLE IF NOT EXISTS talos_forge_tool_versions (
        tool_id TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version >= 1),
        manifest_json TEXT NOT NULL,
        replaced_at TEXT NOT NULL,
        UNIQUE (tool_id, version),
        FOREIGN KEY (tool_id) REFERENCES talos_forge_tools(id) ON DELETE CASCADE
    );`,
    `CREATE INDEX IF NOT EXISTS talos_forge_tool_versions_tool_idx
        ON talos_forge_tool_versions(tool_id, version DESC);`,
    `CREATE TABLE IF NOT EXISTS talos_forge_audit (
        id TEXT PRIMARY KEY NOT NULL,
        tool_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('install', 'enable', 'disable', 'rollback', 'remove')),
        detail_json TEXT NOT NULL DEFAULT '{}',
        at TEXT NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS talos_forge_audit_tool_idx
        ON talos_forge_audit(tool_id, at DESC);`,
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
    Object.freeze({
        toVersion: 4,
        statements: [...VERSION_4_STATEMENTS],
    }),
    Object.freeze({
        toVersion: 5,
        statements: [...VERSION_5_STATEMENTS],
    }),
    Object.freeze({
        toVersion: 6,
        statements: [...VERSION_6_STATEMENTS],
    }),
    Object.freeze({
        toVersion: 7,
        statements: [...VERSION_7_STATEMENTS],
    }),
    Object.freeze({
        toVersion: 8,
        statements: [...VERSION_8_STATEMENTS],
    }),
])
