import { TALOS_CONTENT_ORIGIN_FALLBACK, talosContentOrigin } from '@/lib/tools/security'
import type {
    TalosSqlConnection,
    TalosSqlRow,
    TalosSqlValue,
    TalosSqliteRuntime,
} from '@/persistence/sqliteTypes'
import { talosWithTimeout } from '@/lib/talosDeviceLog'
import {
    cloneJsonObject,
    normalizeFileAuthorityPermissions,
    normalizeComposerDraft,
    normalizeComposerDraftScope,
    normalizeChatTitle,
    normalizeChatSurface,
    normalizeRepositoryId,
    normalizeStationTitle,
    normalizeToolOperation,
    normalizeVaultDisplayName,
    normalizeVaultMediaType,
    normalizeVaultSha256,
    normalizeVaultSize,
    type AppendChatMessageInput,
    type ChatRepositoryOptions,
    type CreateChatSessionInput,
    type CreateFileAuthorityGrantInput,
    type CreateMemoryInput,
    type CreateNoteInput,
    type UpdateNoteInput,
    type CreateTaskInput,
    type CreateVaultFileInput,
    type CreateToolActivityInput,
    type TalosChatAttachmentBinding,
    type TalosChatRepository,
    type TalosLocalChatMessage,
    type TalosLocalChatSession,
    type TalosLocalToolActivity,
    type TalosLocalFileAuthorityGrant,
    type TalosLocalMemory,
    type TalosLocalNote,
    type TalosLocalTask,
    type TalosTaskPriority,
    type TalosTaskStatus,
    type UpdateMemoryPatch,
    type UpdateTaskPatch,
    type TalosMemoryKind,
    type TalosMemoryScopeType,
    type TalosMemoryStatus,
    type TalosLocalVaultFile,
    type UpdateChatSessionInput,
    type UpdateVaultFileInput,
    type UpdateToolActivityInput,
} from '@/repositories/chatRepository'

const ACTIVE_SESSION_KEY = 'active_session_id'
const COMPOSER_DRAFT_KEY_PREFIX = 'composer_draft:'

function invalidRow(): never {
    throw new Error('TALOS_CHAT_ROW_INVALID')
}

function requiredString(row: TalosSqlRow, key: string): string {
    const value = row[key]
    if (typeof value !== 'string') invalidRow()
    return value
}

function nullableString(row: TalosSqlRow, key: string): string | null {
    const value = row[key]
    if (value === null) return null
    if (typeof value !== 'string') invalidRow()
    return value
}

function boundedInteger(row: TalosSqlRow, key: string): number {
    const value = row[key]
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalidRow()
    return value
}

function jsonObject(raw: unknown): Record<string, unknown> {
    if (typeof raw !== 'string') invalidRow()
    try {
        const parsed: unknown = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) invalidRow()
        return parsed as Record<string, unknown>
    } catch {
        return invalidRow()
    }
}

function oneOf<T extends string>(value: string, values: readonly T[]): T {
    if (!(values as readonly string[]).includes(value)) invalidRow()
    return value as T
}

/**
 * Read a driver's answer to an `EXISTS` column, failing toward YES.
 *
 * Every driver we ship returns 1/0, but a driver that answered with a boolean,
 * a string or a bigint would have been read as "this chat has nothing in it" —
 * and that value HIDES the chat. The two failure directions are not equal: a
 * blank chat that lingers is untidy, a real conversation that vanishes from the
 * user's history is not survivable. So only the explicit falses mean no.
 */
function reportedTrue(value: unknown): boolean {
    return value !== null && value !== undefined && value !== false && String(value) !== '0'
}

function parseSession(row: TalosSqlRow): TalosLocalChatSession {
    return {
        id: requiredString(row, 'id'),
        title: requiredString(row, 'title'),
        surface: oneOf(requiredString(row, 'surface'), ['chat', 'browse'] as const),
        mode: oneOf(requiredString(row, 'mode'), ['answer_only', 'verified_execution'] as const),
        persistence_mode: oneOf(requiredString(row, 'persistence_mode'), ['persistent', 'temporary'] as const),
        active_model_profile_id: nullableString(row, 'active_model_profile_id'),
        metadata: jsonObject(row.metadata_json),
        created_at: requiredString(row, 'created_at'),
        updated_at: requiredString(row, 'updated_at'),
    }
}

function parseTask(row: TalosSqlRow): TalosLocalTask {
    return {
        id: requiredString(row, 'id'),
        title: requiredString(row, 'title'),
        description: nullableString(row, 'description'),
        run_id: nullableString(row, 'run_id'),
        priority: oneOf(requiredString(row, 'priority'), ['low', 'normal', 'high'] as const) as TalosTaskPriority,
        status: oneOf(requiredString(row, 'status'), ['todo', 'doing', 'done'] as const) as TalosTaskStatus,
        content_origin: talosContentOrigin(row.content_origin),
        schedule_json: nullableString(row, 'schedule_json'),
        instruction: nullableString(row, 'instruction'),
        last_run_at: nullableString(row, 'last_run_at'),
        created_at: requiredString(row, 'created_at'),
        updated_at: requiredString(row, 'updated_at'),
    }
}

function parseNote(row: TalosSqlRow): TalosLocalNote {
    return {
        id: requiredString(row, 'id'),
        title: requiredString(row, 'title'),
        content: requiredString(row, 'content'),
        trust_level: 'untrusted',
        // A8 — `NULL` (riga nata prima della colonna) cade su `external`:
        // il predefinito prudente non regala fiducia.
        content_origin: talosContentOrigin(row.content_origin),
        created_at: requiredString(row, 'created_at'),
        updated_at: requiredString(row, 'updated_at'),
    }
}

function parseMemory(row: TalosSqlRow): TalosLocalMemory {
    return {
        id: requiredString(row, 'id'),
        scope_type: oneOf(requiredString(row, 'scope_type'), ['global', 'project', 'session'] as const) as TalosMemoryScopeType,
        scope_id: nullableString(row, 'scope_id'),
        kind: oneOf(requiredString(row, 'kind'), ['preference', 'project_fact', 'procedure', 'policy_note', 'rejected'] as const) as TalosMemoryKind,
        status: oneOf(requiredString(row, 'status'), ['active', 'disabled', 'quarantined', 'rejected'] as const) as TalosMemoryStatus,
        title: requiredString(row, 'title'),
        content: requiredString(row, 'content'),
        source: nullableString(row, 'source'),
        metadata: jsonObject(row.metadata_json),
        trust_level: 'untrusted',
        content_origin: talosContentOrigin(row.content_origin),
        last_used_at: nullableString(row, 'last_used_at'),
        created_at: requiredString(row, 'created_at'),
        updated_at: requiredString(row, 'updated_at'),
    }
}

function parseMessage(row: TalosSqlRow): TalosLocalChatMessage {
    return {
        id: requiredString(row, 'id'),
        session_id: requiredString(row, 'session_id'),
        role: oneOf(requiredString(row, 'role'), ['user', 'assistant', 'system', 'tool'] as const),
        content: requiredString(row, 'content'),
        state: oneOf(requiredString(row, 'state'), ['persisted', 'pending', 'failed'] as const),
        model_profile_id: nullableString(row, 'model_profile_id'),
        run_id: nullableString(row, 'run_id'),
        ordinal: boundedInteger(row, 'ordinal'),
        metadata: jsonObject(row.metadata_json),
        created_at: requiredString(row, 'created_at'),
        updated_at: requiredString(row, 'updated_at'),
    }
}

function parseVaultFile(row: TalosSqlRow): TalosLocalVaultFile {
    return {
        id: requiredString(row, 'id'),
        display_name: requiredString(row, 'display_name'),
        media_type: requiredString(row, 'media_type'),
        size_bytes: boundedInteger(row, 'size_bytes'),
        private_uri: requiredString(row, 'private_uri'),
        status: oneOf(requiredString(row, 'status'), ['pending', 'available', 'failed', 'revoked'] as const),
        trust: oneOf(requiredString(row, 'trust'), ['untrusted'] as const),
        sha256: nullableString(row, 'sha256'),
        extracted_text: nullableString(row, 'extracted_text'),
        failure_code: nullableString(row, 'failure_code'),
        metadata: jsonObject(row.metadata_json),
        created_at: requiredString(row, 'created_at'),
        updated_at: requiredString(row, 'updated_at'),
    }
}

function permissions(raw: unknown): TalosLocalFileAuthorityGrant['permissions'] {
    if (typeof raw !== 'string') invalidRow()
    try {
        const value: unknown = JSON.parse(raw)
        if (!Array.isArray(value)) invalidRow()
        return normalizeFileAuthorityPermissions(value as TalosLocalFileAuthorityGrant['permissions'])
    } catch {
        return invalidRow()
    }
}

function parseGrant(row: TalosSqlRow): TalosLocalFileAuthorityGrant {
    return {
        id: requiredString(row, 'id'),
        vault_file_id: requiredString(row, 'vault_file_id'),
        permissions: permissions(row.permissions_json),
        status: oneOf(requiredString(row, 'status'), ['active', 'revoked'] as const),
        label: requiredString(row, 'label'),
        created_at: requiredString(row, 'created_at'),
        updated_at: requiredString(row, 'updated_at'),
        revoked_at: nullableString(row, 'revoked_at'),
    }
}

function parseBinding(row: TalosSqlRow): TalosChatAttachmentBinding {
    return {
        id: requiredString(row, 'id'),
        session_id: requiredString(row, 'session_id'),
        message_id: requiredString(row, 'message_id'),
        vault_file_id: requiredString(row, 'vault_file_id'),
        grant_id: requiredString(row, 'grant_id'),
        display_name: requiredString(row, 'display_name'),
        media_type: requiredString(row, 'media_type'),
        size_bytes: boundedInteger(row, 'size_bytes'),
        permissions: permissions(row.permissions_json),
        grant_status: oneOf(requiredString(row, 'grant_status'), ['active', 'revoked'] as const),
        created_at: requiredString(row, 'created_at'),
    }
}

function parseToolActivity(row: TalosSqlRow): TalosLocalToolActivity {
    return {
        id: requiredString(row, 'id'),
        session_id: requiredString(row, 'session_id'),
        message_id: nullableString(row, 'message_id'),
        operation: requiredString(row, 'operation'),
        status: oneOf(requiredString(row, 'status'), ['pending', 'succeeded', 'failed', 'cancelled', 'recovery_required'] as const),
        payload: jsonObject(row.payload_json),
        evidence: jsonObject(row.evidence_json),
        created_at: requiredString(row, 'created_at'),
        updated_at: requiredString(row, 'updated_at'),
    }
}

function encodeObject(value: Record<string, unknown> | undefined): string {
    return JSON.stringify(cloneJsonObject(value))
}

function composerDraftKey(scopeId: string): string {
    return `${COMPOSER_DRAFT_KEY_PREFIX}${normalizeComposerDraftScope(scopeId)}`
}

export function createSqliteChatRepository(
    runtime: TalosSqliteRuntime,
    options: ChatRepositoryOptions = {},
): TalosChatRepository {
    const now = options.now ?? (() => new Date().toISOString())
    let connection: TalosSqlConnection | null = null
    let initializing: Promise<void> | null = null

    async function initialize(): Promise<void> {
        if (!initializing) {
            // P0 relock recovery: the runtime is the connection authority.
            // `forgetSecret()` deliberately removes its upstream wrapper, but
            // this repository survives behind the lazy production facade. A
            // local non-null reference can therefore be closed and absent from
            // the native registry. Reacquiring is bridge-free while healthy
            // (runtime.connect returns its cache) and returns the replacement
            // wrapper after unlock, before any read or write is attempted.
            initializing = runtime.connect().then((value) => { connection = value }).finally(() => {
                initializing = null
            })
        }
        await initializing
    }

    async function db(): Promise<TalosSqlConnection> {
        await initialize()
        if (!connection) throw new Error('TALOS_CHAT_DB_UNAVAILABLE')
        return connection
    }

    // SF-6: one connection, one transaction at a time — concurrent writers
    // (reorder + archive tap, double-tapped delete) queue instead of throwing
    // "transaction within a transaction" and poisoning the store.
    let writeQueue: Promise<unknown> = Promise.resolve()

    async function transaction<T>(operation: (database: TalosSqlConnection) => Promise<T>): Promise<T> {
        const run = async (): Promise<T> => {
            const database = await db()
            await database.beginTransaction()
            try {
                const result = await operation(database)
                await database.commitTransaction()
                await runtime.persist()
                return result
            } catch (error) {
                try {
                    await database.rollbackTransaction()
                } catch {
                    // Preserve the original write failure; runtime recovery owns a failed rollback.
                }
                throw error
            }
        }
        // F5.1: a native call that never settles must not jam the queue
        // forever — fence the whole transaction; the queue then moves on and
        // the caller surfaces a REAL error instead of a silent hang.
        const chained = writeQueue.then(
            () => talosWithTimeout(run(), 20000, 'TALOS_DB_TRANSACTION'),
            () => talosWithTimeout(run(), 20000, 'TALOS_DB_TRANSACTION'),
        )
        writeQueue = chained.catch(() => undefined)
        return chained
    }

    async function activeSessionId(existing?: TalosSqlConnection): Promise<string | null> {
        const database = existing ?? await db()
        const rows = await database.query(
            'SELECT value_json FROM talos_chat_state WHERE key = ? LIMIT 1',
            [ACTIVE_SESSION_KEY],
        )
        if (rows.length === 0) return null
        const raw = requiredString(rows[0] as TalosSqlRow, 'value_json')
        try {
            const value: unknown = JSON.parse(raw)
            if (value === null || typeof value === 'string') return value
        } catch {
            // Fall through to one canonical validation error.
        }
        return invalidRow()
    }

    async function writeActiveSession(database: TalosSqlConnection, sessionId: string | null): Promise<void> {
        if (sessionId === null) {
            await database.run('DELETE FROM talos_chat_state WHERE key = ?', [ACTIVE_SESSION_KEY])
            return
        }
        await database.run(
            `INSERT INTO talos_chat_state (key, value_json, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
            [ACTIVE_SESSION_KEY, JSON.stringify(sessionId), now()],
        )
    }

    async function findSession(sessionId: string, existing?: TalosSqlConnection): Promise<TalosLocalChatSession> {
        const database = existing ?? await db()
        const rows = await database.query(
            `SELECT id, title, surface, mode, persistence_mode, active_model_profile_id,
                    metadata_json, created_at, updated_at
             FROM talos_chat_sessions WHERE id = ? LIMIT 1`,
            [sessionId],
        )
        if (rows.length !== 1) throw new Error('TALOS_CHAT_SESSION_NOT_FOUND')
        return parseSession(rows[0] as TalosSqlRow)
    }

    return {
        initialize,
        /**
         * The complete list, each row saying whether it has anything in it.
         *
         * EXISTS rather than a join or a count: SQLite stops at the first row it
         * finds, so this costs one index seek per session and never materialises
         * a message.
         */
        async listSessions() {
            const rows = await (await db()).query(
                `SELECT s.id, s.title, s.surface, s.mode, s.persistence_mode,
                        s.active_model_profile_id, s.metadata_json, s.created_at, s.updated_at,
                        EXISTS (SELECT 1 FROM talos_chat_messages m WHERE m.session_id = s.id)
                            AS has_messages
                 FROM talos_chat_sessions s
                 ORDER BY s.updated_at DESC, s.created_at DESC, s.id DESC`,
            )
            return rows.map((row) => ({
                ...parseSession(row),
                has_messages: reportedTrue(row.has_messages),
            }))
        },
        getActiveSessionId: () => activeSessionId(),
        async createSession(input: CreateChatSessionInput) {
            const title = normalizeChatTitle(input.title)
            const metadata = encodeObject(input.metadata)
            const session: TalosLocalChatSession = {
                id: input.id,
                title,
                surface: normalizeChatSurface(input.surface ?? 'chat'),
                mode: input.mode ?? 'verified_execution',
                persistence_mode: input.persistence_mode ?? 'persistent',
                active_model_profile_id: input.active_model_profile_id,
                metadata: JSON.parse(metadata) as Record<string, unknown>,
                created_at: input.created_at,
                updated_at: input.created_at,
            }
            return transaction(async (database) => {
                await database.run(
                    `INSERT INTO talos_chat_sessions
                        (id, title, surface, mode, persistence_mode, active_model_profile_id, metadata_json, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        session.id,
                        session.title,
                        session.surface,
                        session.mode,
                        session.persistence_mode,
                        session.active_model_profile_id,
                        metadata,
                        session.created_at,
                        session.updated_at,
                    ],
                )
                await writeActiveSession(database, session.id)
                return session
            })
        },
        async selectSession(sessionId: string) {
            await transaction(async (database) => {
                await findSession(sessionId, database)
                await writeActiveSession(database, sessionId)
            })
        },
        async renameSession(sessionId: string, title: string) {
            // F4-#22: never trust the driver's `changes` counter — the native
            // Android driver under a manual transaction is the only surface
            // where these writes run, and it is exactly where the owner saw
            // rename/delete fail. Guard existence and verify the write by
            // reading back inside the transaction instead.
            const normalized = normalizeChatTitle(title)
            await transaction(async (database) => {
                await findSession(sessionId, database)
                await database.run(
                    'UPDATE talos_chat_sessions SET title = ?, updated_at = ? WHERE id = ?',
                    [normalized, now(), sessionId],
                )
                const rows = await database.query(
                    'SELECT title FROM talos_chat_sessions WHERE id = ? LIMIT 1',
                    [sessionId],
                )
                if (rows.length !== 1 || requiredString(rows[0] as TalosSqlRow, 'title') !== normalized) {
                    throw new Error('TALOS_CHAT_RENAME_UNVERIFIED')
                }
            })
            return findSession(sessionId)
        },
        async updateSession(sessionId: string, input: UpdateChatSessionInput) {
            const current = await findSession(sessionId)
            const title = input.title === undefined ? current.title : normalizeChatTitle(input.title)
            const surface = input.surface === undefined ? current.surface : normalizeChatSurface(input.surface)
            const model = input.active_model_profile_id === undefined
                ? current.active_model_profile_id
                : input.active_model_profile_id
            const metadata = input.metadata === undefined ? current.metadata : cloneJsonObject(input.metadata)
            await transaction(async (database) => {
                await findSession(sessionId, database)
                await database.run(
                    `UPDATE talos_chat_sessions
                     SET title = ?, surface = ?, active_model_profile_id = ?, metadata_json = ?, updated_at = ?
                     WHERE id = ?`,
                    [title, surface, model, JSON.stringify(metadata), now(), sessionId],
                )
            })
            return findSession(sessionId)
        },
        async updateSessionMetadata(sessionId: string, metadata: Record<string, unknown>) {
            const cloned = cloneJsonObject(metadata)
            await transaction(async (database) => {
                await findSession(sessionId, database)
                await database.run(
                    'UPDATE talos_chat_sessions SET metadata_json = ? WHERE id = ?',
                    [JSON.stringify(cloned), sessionId],
                )
            })
            return findSession(sessionId)
        },
        async deleteSession(sessionId: string) {
            return transaction(async (database) => {
                // F4-#22: existence guarded by SELECT, deletion verified by
                // reading back — the driver's `changes` counter is never
                // consulted (see renameSession).
                await findSession(sessionId, database)
                const wasActive = await activeSessionId(database) === sessionId
                await database.run('DELETE FROM talos_chat_sessions WHERE id = ?', [sessionId])
                const remaining = await database.query(
                    'SELECT id FROM talos_chat_sessions WHERE id = ? LIMIT 1',
                    [sessionId],
                )
                if (remaining.length !== 0) throw new Error('TALOS_CHAT_DELETE_UNVERIFIED')
                await database.run('DELETE FROM talos_chat_state WHERE key = ?', [composerDraftKey(sessionId)])
                // SF-10: session-scoped memories die with their session.
                await database.run(
                    "DELETE FROM talos_memories WHERE scope_type = 'session' AND scope_id = ?",
                    [sessionId],
                )
                if (!wasActive) return activeSessionId(database)
                const rows = await database.query(
                    `SELECT id FROM talos_chat_sessions
                     ORDER BY updated_at DESC, created_at DESC, id DESC LIMIT 1`,
                )
                const next = rows.length === 0 ? null : requiredString(rows[0] as TalosSqlRow, 'id')
                await writeActiveSession(database, next)
                return next
            })
        },
        async listMessages(sessionId, options) {
            const limit = options?.limit
            if (limit === undefined) {
                const rows = await (await db()).query(
                    `SELECT id, session_id, role, content, state, model_profile_id, run_id,
                            ordinal, metadata_json, created_at, updated_at
                     FROM talos_chat_messages
                     WHERE session_id = ?
                     ORDER BY ordinal ASC, created_at ASC, id ASC`,
                    [sessionId],
                )
                return rows.map(parseMessage)
            }
            // Defect #4: read the NEWEST page and reverse it. Keyset, not
            // offset: `(ordinal, id) < (cursor)` seeks straight to the row
            // instead of walking and discarding everything above it.
            const cursor = options?.before
            const rows = await (await db()).query(
                `SELECT id, session_id, role, content, state, model_profile_id, run_id,
                        ordinal, metadata_json, created_at, updated_at
                 FROM talos_chat_messages
                 WHERE session_id = ?${cursor ? ' AND (ordinal < ? OR (ordinal = ? AND id < ?))' : ''}
                 ORDER BY ordinal DESC, created_at DESC, id DESC
                 LIMIT ?`,
                cursor ? [sessionId, cursor.ordinal, cursor.ordinal, cursor.id, limit] : [sessionId, limit],
            )
            return rows.map(parseMessage).reverse()
        },
        async appendMessage(input: AppendChatMessageInput) {
            const metadata = encodeObject(input.metadata)
            return transaction(async (database) => {
                const exists = await database.query(
                    'SELECT id FROM talos_chat_sessions WHERE id = ? LIMIT 1',
                    [input.session_id],
                )
                if (exists.length !== 1) throw new Error('TALOS_CHAT_SESSION_NOT_FOUND')
                const ordinalRows = await database.query(
                    `SELECT COALESCE(MAX(ordinal), -1) + 1 AS next_ordinal
                     FROM talos_chat_messages WHERE session_id = ?`,
                    [input.session_id],
                )
                const ordinal = boundedInteger(ordinalRows[0] as TalosSqlRow, 'next_ordinal')
                const message: TalosLocalChatMessage = {
                    id: input.id,
                    session_id: input.session_id,
                    role: input.role,
                    content: input.content,
                    state: input.state,
                    model_profile_id: input.model_profile_id ?? null,
                    run_id: input.run_id ?? null,
                    ordinal,
                    metadata: JSON.parse(metadata) as Record<string, unknown>,
                    created_at: input.created_at,
                    updated_at: input.created_at,
                }
                const bindingIds = new Set<string>()
                const fileIds = new Set<string>()
                const bindings: Array<{
                    id: string
                    file: TalosLocalVaultFile
                    grant: TalosLocalFileAuthorityGrant
                }> = []
                for (const binding of input.attachments ?? []) {
                    if (bindingIds.has(binding.id) || fileIds.has(binding.vault_file_id)) {
                        throw new Error('TALOS_CHAT_ATTACHMENT_DUPLICATE')
                    }
                    bindingIds.add(binding.id)
                    fileIds.add(binding.vault_file_id)
                    const fileRows = await database.query(
                        `SELECT id, display_name, media_type, size_bytes, private_uri, status, trust,
                                sha256, extracted_text, failure_code, metadata_json, created_at, updated_at
                         FROM talos_vault_files WHERE id = ? AND status != 'revoked' LIMIT 1`,
                        [binding.vault_file_id],
                    )
                    if (fileRows.length !== 1) throw new Error('TALOS_VAULT_FILE_NOT_FOUND')
                    const file = parseVaultFile(fileRows[0] as TalosSqlRow)
                    if (file.status !== 'available') throw new Error('TALOS_VAULT_FILE_UNAVAILABLE')
                    const grantRows = await database.query(
                        `SELECT id, vault_file_id, permissions_json, status, label,
                                created_at, updated_at, revoked_at
                         FROM talos_file_authority_grants WHERE id = ? LIMIT 1`,
                        [binding.grant_id],
                    )
                    if (grantRows.length !== 1) throw new Error('TALOS_FILE_GRANT_NOT_FOUND')
                    const grant = parseGrant(grantRows[0] as TalosSqlRow)
                    if (grant.vault_file_id !== file.id) throw new Error('TALOS_FILE_GRANT_MISMATCH')
                    if (grant.status !== 'active') throw new Error('TALOS_FILE_GRANT_INACTIVE')
                    if (!grant.permissions.includes('model.read')) {
                        throw new Error('TALOS_FILE_GRANT_PERMISSION_INVALID')
                    }
                    bindings.push({ id: normalizeRepositoryId(binding.id), file, grant })
                }
                await database.run(
                    `INSERT INTO talos_chat_messages
                        (id, session_id, role, content, state, model_profile_id, run_id, ordinal, metadata_json, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        message.id,
                        message.session_id,
                        message.role,
                        message.content,
                        message.state,
                        message.model_profile_id,
                        message.run_id,
                        message.ordinal,
                        metadata,
                        message.created_at,
                        message.updated_at,
                    ],
                )
                for (const binding of bindings) {
                    await database.run(
                        /*
                         * ⛔ `OR IGNORE`: legare due volte lo stesso allegato
                         * non e' un errore, e' la stessa cosa detta due volte.
                         *
                         * MISURATO sul Pad il 2026-08-07, generando un'immagine
                         * con il consenso da dare: il turno si interrompe per
                         * chiedere, riprende dal checkpoint, e la stessa
                         * associazione viene scritta di nuovo. Fino a qui
                         * SQLite rispondeva `UNIQUE constraint failed:
                         * talos_chat_attachments.id (code 1555)` — un errore
                         * del database mostrato dentro un riquadro rosso a chi
                         * aveva chiesto un gatto.
                         *
                         * L'id di un'associazione LA identifica: se e' lo
                         * stesso, e' la stessa. Rifiutare la seconda scrittura
                         * non protegge niente e rompe un turno riuscito.
                         *
                         * E' la stessa idempotenza che la ricerca di stamattina
                         * chiedeva per i tool: un'operazione ripetuta con la
                         * stessa identita' deve essere innocua.
                         */
                        `INSERT OR IGNORE INTO talos_chat_attachments
                            (id, session_id, message_id, vault_file_id, grant_id,
                             display_name, media_type, size_bytes, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            binding.id,
                            message.session_id,
                            message.id,
                            binding.file.id,
                            binding.grant.id,
                            binding.file.display_name,
                            binding.file.media_type,
                            binding.file.size_bytes,
                            message.created_at,
                        ],
                    )
                }
                await database.run(
                    'UPDATE talos_chat_sessions SET updated_at = ? WHERE id = ?',
                    [message.created_at, message.session_id],
                )
                return message
            })
        },
        async appendToolActivity(input: CreateToolActivityInput) {
            const activity: TalosLocalToolActivity = {
                id: normalizeRepositoryId(input.id),
                session_id: normalizeRepositoryId(input.session_id),
                message_id: input.message_id === null ? null : normalizeRepositoryId(input.message_id),
                operation: normalizeToolOperation(input.operation),
                status: input.status,
                payload: cloneJsonObject(input.payload),
                evidence: cloneJsonObject(input.evidence),
                created_at: input.created_at,
                updated_at: input.created_at,
            }
            await transaction(async (database) => {
                await database.run(
                    `INSERT INTO talos_chat_tool_activities
                        (id, session_id, message_id, operation, status, payload_json, evidence_json, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        activity.id,
                        activity.session_id,
                        activity.message_id,
                        activity.operation,
                        activity.status,
                        JSON.stringify(activity.payload),
                        JSON.stringify(activity.evidence),
                        activity.created_at,
                        activity.updated_at,
                    ],
                )
            })
            return activity
        },
        async updateToolActivity(activityId: string, input: UpdateToolActivityInput) {
            const assignments: string[] = []
            const values: Array<string | number | null> = []
            if (input.status !== undefined) {
                assignments.push('status = ?')
                values.push(input.status)
            }
            if (input.payload !== undefined) {
                assignments.push('payload_json = ?')
                values.push(JSON.stringify(cloneJsonObject(input.payload)))
            }
            if (input.evidence !== undefined) {
                assignments.push('evidence_json = ?')
                values.push(JSON.stringify(cloneJsonObject(input.evidence)))
            }
            assignments.push('updated_at = ?')
            values.push(now(), normalizeRepositoryId(activityId))
            await transaction(async (database) => {
                const exists = await database.query(
                    'SELECT id FROM talos_chat_tool_activities WHERE id = ? LIMIT 1',
                    [normalizeRepositoryId(activityId)],
                )
                if (exists.length !== 1) throw new Error('TALOS_TOOL_ACTIVITY_NOT_FOUND')
                await database.run(
                    `UPDATE talos_chat_tool_activities SET ${assignments.join(', ')} WHERE id = ?`,
                    values,
                )
            })
        },
        async listMessageToolActivities(messageId: string) {
            const rows = await (await db()).query(
                `SELECT id, session_id, message_id, operation, status, payload_json, evidence_json, created_at, updated_at
                 FROM talos_chat_tool_activities WHERE message_id = ?
                 ORDER BY created_at ASC, id ASC`,
                [messageId],
            )
            return rows.map(parseToolActivity)
        },
        async listSessionToolActivities(sessionId: string) {
            const rows = await (await db()).query(
                `SELECT id, session_id, message_id, operation, status, payload_json, evidence_json, created_at, updated_at
                 FROM talos_chat_tool_activities WHERE session_id = ?
                 ORDER BY created_at ASC, id ASC`,
                [sessionId],
            )
            return rows.map(parseToolActivity)
        },
        async listVaultFiles() {
            const rows = await (await db()).query(
                `SELECT id, display_name, media_type, size_bytes, private_uri, status, trust,
                        sha256, extracted_text, failure_code, metadata_json, created_at, updated_at
                 FROM talos_vault_files
                 WHERE status != 'revoked'
                 ORDER BY updated_at DESC, created_at DESC, id DESC`,
            )
            return rows.map(parseVaultFile)
        },
        async listVaultFileSummaries() {
            // No extracted_text: only a bounded preview for ranking.
            const rows = await (await db()).query(
                `SELECT id, display_name, media_type, size_bytes, private_uri, status, trust,
                        sha256, substr(COALESCE(extracted_text, ''), 1, 600) AS text_preview,
                        failure_code, metadata_json, created_at, updated_at
                 FROM talos_vault_files
                 WHERE status != 'revoked'
                 ORDER BY updated_at DESC, created_at DESC, id DESC`,
            )
            return rows.map((row) => {
                const preview = typeof row.text_preview === 'string' ? row.text_preview : null
                const { extracted_text: _unused, ...rest } = parseVaultFile({ ...row, extracted_text: null })
                return { ...rest, text_preview: preview === '' ? null : preview }
            })
        },
        /**
         * I-03. The term is compared against the WHOLE text, inside SQLite. Only
         * ids and hit counts cross the bridge, so recall stops depending on a
         * word landing inside the first 600 characters and nothing is
         * materialised to find that out.
         *
         * Terms are capped: the statement grows one CASE per term, and an
         * unbounded question would build an unbounded query.
         */
        async matchVaultFileTerms(terms: readonly string[]) {
            const cleaned = [...new Set(
                terms.map((term) => term.trim().toLowerCase()).filter((term) => term.length > 0),
            )].slice(0, 12)
            if (cleaned.length === 0) return {}
            const hits = cleaned
                .map(() => "(CASE WHEN instr(lower(COALESCE(extracted_text, '')), ?) > 0 THEN 1 ELSE 0 END)")
                .join(' + ')
            const rows = await (await db()).query(
                `SELECT id, ${hits} AS hits
                 FROM talos_vault_files
                 WHERE status != 'revoked'`,
                cleaned,
            )
            const matched: Record<string, number> = {}
            for (const row of rows) {
                const count = Number(row.hits)
                if (typeof row.id === 'string' && Number.isFinite(count) && count > 0) {
                    matched[row.id] = count
                }
            }
            return matched
        },
        async getVaultFile(fileId: string) {
            const rows = await (await db()).query(
                `SELECT id, display_name, media_type, size_bytes, private_uri, status, trust,
                        sha256, extracted_text, failure_code, metadata_json, created_at, updated_at
                 FROM talos_vault_files
                 WHERE id = ? AND status != 'revoked' LIMIT 1`,
                [fileId],
            )
            if (rows.length === 0) return null
            if (rows.length !== 1) return invalidRow()
            return parseVaultFile(rows[0] as TalosSqlRow)
        },
        async createVaultFile(input: CreateVaultFileInput) {
            const metadata = encodeObject(input.metadata)
            const file: TalosLocalVaultFile = {
                id: normalizeRepositoryId(input.id),
                display_name: normalizeVaultDisplayName(input.display_name),
                media_type: normalizeVaultMediaType(input.media_type),
                size_bytes: normalizeVaultSize(input.size_bytes),
                private_uri: input.private_uri,
                status: input.status,
                trust: input.trust,
                sha256: normalizeVaultSha256(input.sha256),
                extracted_text: input.extracted_text,
                failure_code: input.failure_code,
                metadata: JSON.parse(metadata) as Record<string, unknown>,
                created_at: input.created_at,
                updated_at: input.created_at,
            }
            await transaction(async (database) => {
                await database.run(
                    `INSERT INTO talos_vault_files
                        (id, display_name, media_type, size_bytes, private_uri, status, trust,
                         sha256, extracted_text, failure_code, metadata_json, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        file.id,
                        file.display_name,
                        file.media_type,
                        file.size_bytes,
                        file.private_uri,
                        file.status,
                        file.trust,
                        file.sha256,
                        file.extracted_text,
                        file.failure_code,
                        metadata,
                        file.created_at,
                        file.updated_at,
                    ],
                )
            })
            return file
        },
        async updateVaultFile(fileId: string, input: UpdateVaultFileInput) {
            const currentRows = await (await db()).query(
                `SELECT id, display_name, media_type, size_bytes, private_uri, status, trust,
                        sha256, extracted_text, failure_code, metadata_json, created_at, updated_at
                 FROM talos_vault_files WHERE id = ? AND status != 'revoked' LIMIT 1`,
                [fileId],
            )
            if (currentRows.length !== 1) throw new Error('TALOS_VAULT_FILE_NOT_FOUND')
            const current = parseVaultFile(currentRows[0] as TalosSqlRow)
            const updated: TalosLocalVaultFile = {
                ...current,
                display_name: input.display_name ?? current.display_name,
                status: input.status ?? current.status,
                private_uri: input.private_uri ?? current.private_uri,
                sha256: input.sha256 === undefined ? current.sha256 : normalizeVaultSha256(input.sha256),
                extracted_text: input.extracted_text === undefined ? current.extracted_text : input.extracted_text,
                failure_code: input.failure_code === undefined ? current.failure_code : input.failure_code,
                metadata: input.metadata === undefined ? current.metadata : cloneJsonObject(input.metadata),
                updated_at: now(),
            }
            await transaction(async (database) => {
                const exists = await database.query(
                    "SELECT id FROM talos_vault_files WHERE id = ? AND status != 'revoked' LIMIT 1",
                    [updated.id],
                )
                if (exists.length !== 1) throw new Error('TALOS_VAULT_FILE_NOT_FOUND')
                await database.run(
                    `UPDATE talos_vault_files
                     SET display_name = ?, private_uri = ?, status = ?, sha256 = ?,
                         extracted_text = ?, failure_code = ?, metadata_json = ?, updated_at = ?
                     WHERE id = ? AND status != 'revoked'`,
                    [
                        updated.display_name,
                        updated.private_uri,
                        updated.status,
                        updated.sha256,
                        updated.extracted_text,
                        updated.failure_code,
                        JSON.stringify(updated.metadata),
                        updated.updated_at,
                        updated.id,
                    ],
                )
            })
            return updated
        },
        async deleteVaultFile(fileId: string) {
            await transaction(async (database) => {
                const timestamp = now()
                const exists = await database.query(
                    "SELECT id FROM talos_vault_files WHERE id = ? AND status != 'revoked' LIMIT 1",
                    [fileId],
                )
                if (exists.length !== 1) throw new Error('TALOS_VAULT_FILE_NOT_FOUND')
                await database.run(
                    `UPDATE talos_vault_files
                     SET status = 'revoked', private_uri = '', extracted_text = NULL, updated_at = ?
                     WHERE id = ? AND status != 'revoked'`,
                    [timestamp, fileId],
                )
                await database.run(
                    `UPDATE talos_file_authority_grants
                     SET status = 'revoked', revoked_at = ?, updated_at = ?
                     WHERE vault_file_id = ? AND status = 'active'`,
                    [timestamp, timestamp, fileId],
                )
            })
        },
        async createFileAuthorityGrant(input: CreateFileAuthorityGrantInput) {
            const fileRows = await (await db()).query(
                `SELECT id, display_name, media_type, size_bytes, private_uri, status, trust,
                        sha256, extracted_text, failure_code, metadata_json, created_at, updated_at
                 FROM talos_vault_files WHERE id = ? AND status != 'revoked' LIMIT 1`,
                [input.vault_file_id],
            )
            if (fileRows.length !== 1) throw new Error('TALOS_VAULT_FILE_NOT_FOUND')
            if (parseVaultFile(fileRows[0] as TalosSqlRow).status !== 'available') {
                throw new Error('TALOS_VAULT_FILE_UNAVAILABLE')
            }
            const grant: TalosLocalFileAuthorityGrant = {
                id: normalizeRepositoryId(input.id),
                vault_file_id: normalizeRepositoryId(input.vault_file_id),
                permissions: normalizeFileAuthorityPermissions(input.permissions),
                status: 'active',
                label: normalizeVaultDisplayName(input.label),
                created_at: input.created_at,
                updated_at: input.created_at,
                revoked_at: null,
            }
            await transaction(async (database) => {
                await database.run(
                    `INSERT INTO talos_file_authority_grants
                        (id, vault_file_id, permissions_json, status, label,
                         created_at, updated_at, revoked_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        grant.id,
                        grant.vault_file_id,
                        JSON.stringify(grant.permissions),
                        grant.status,
                        grant.label,
                        grant.created_at,
                        grant.updated_at,
                        grant.revoked_at,
                    ],
                )
            })
            return grant
        },
        async revokeFileAuthorityGrant(grantId: string) {
            await transaction(async (database) => {
                const timestamp = now()
                await database.run(
                    `UPDATE talos_file_authority_grants
                     SET status = 'revoked', revoked_at = ?, updated_at = ?
                     WHERE id = ? AND status = 'active'`,
                    [timestamp, timestamp, grantId],
                )
                // SF-3: the read-back ALWAYS decides — the driver's changes
                // counter is never trusted on this security-relevant path.
                const rows = await database.query(
                    'SELECT status FROM talos_file_authority_grants WHERE id = ? LIMIT 1',
                    [grantId],
                )
                if (rows.length !== 1) throw new Error('TALOS_FILE_GRANT_NOT_FOUND')
                if (requiredString(rows[0] as TalosSqlRow, 'status') !== 'revoked') return invalidRow()
            })
        },
        async listSessionAttachmentMessageIds(sessionId: string) {
            const rows = await (await db()).query(
                `SELECT DISTINCT message_id FROM talos_chat_attachments
                 WHERE session_id = ? AND message_id IS NOT NULL`,
                [sessionId],
            )
            return rows
                .map((row) => (typeof row.message_id === 'string' ? row.message_id : null))
                .filter((id): id is string => id !== null)
        },
        async listSessionAttachmentFileIds(sessionId: string) {
            // Served by talos_chat_attachments_session_idx (session_id, ...).
            const rows = await (await db()).query(
                `SELECT DISTINCT vault_file_id FROM talos_chat_attachments
                 WHERE session_id = ?`,
                [sessionId],
            )
            return rows
                .map((row) => (typeof row.vault_file_id === 'string' ? row.vault_file_id : null))
                .filter((id): id is string => id !== null)
        },
        async listMessageAttachments(messageId: string) {
            const rows = await (await db()).query(
                `SELECT attachment.id, attachment.session_id, attachment.message_id,
                        attachment.vault_file_id, attachment.grant_id, attachment.display_name,
                        attachment.media_type, attachment.size_bytes, attachment.created_at,
                        grant.permissions_json, grant.status AS grant_status
                 FROM talos_chat_attachments AS attachment
                 INNER JOIN talos_file_authority_grants AS grant ON grant.id = attachment.grant_id
                 WHERE attachment.message_id = ?
                 ORDER BY attachment.created_at ASC, attachment.id ASC`,
                [messageId],
            )
            return rows.map(parseBinding)
        },
        async createTask(input: CreateTaskInput) {
            const task: TalosLocalTask = {
                id: normalizeRepositoryId(input.id),
                title: normalizeStationTitle(input.title),
                description: input.description,
                run_id: input.run_id,
                priority: input.priority,
                status: 'todo',
                content_origin: input.content_origin ?? TALOS_CONTENT_ORIGIN_FALLBACK,
                schedule_json: input.schedule_json ?? null,
                instruction: input.instruction ?? null,
                // Mai eseguita, ed è diverso da «eseguita e senza esito»: una
                // pianificazione il cui momento e' gia' passato parte comunque
                // la prima volta, e questo `null` e' come fa a saperlo.
                last_run_at: null,
                created_at: input.created_at,
                updated_at: input.created_at,
            }
            await transaction(async (database) => {
                await database.run(
                    `INSERT INTO talos_tasks
                        (id, title, description, run_id, priority, status, content_origin,
                         schedule_json, instruction, last_run_at, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [task.id, task.title, task.description, task.run_id, task.priority, task.status,
                        task.content_origin,
                     task.schedule_json, task.instruction, task.last_run_at, task.created_at, task.updated_at],
                )
            })
            return task
        },
        async listTasks() {
            const rows = await (await db()).query(
                `SELECT id, title, description, run_id, priority, status, content_origin, schedule_json, instruction, last_run_at, created_at, updated_at
                 FROM talos_tasks ORDER BY updated_at DESC, id DESC`,
            )
            return rows.map((row) => parseTask(row as TalosSqlRow))
        },
        async setTaskStatus(taskId: string, status: TalosTaskStatus) {
            await transaction(async (database) => {
                const exists = await database.query('SELECT id FROM talos_tasks WHERE id = ? LIMIT 1', [taskId])
                if (exists.length !== 1) throw new Error('TALOS_TASK_NOT_FOUND')
                await database.run(
                    'UPDATE talos_tasks SET status = ?, updated_at = ? WHERE id = ?',
                    [status, now(), taskId],
                )
            })
            const rows = await (await db()).query(
                `SELECT id, title, description, run_id, priority, status, content_origin, schedule_json, instruction, last_run_at, created_at, updated_at
                 FROM talos_tasks WHERE id = ? LIMIT 1`,
                [taskId],
            )
            if (rows.length !== 1) throw new Error('TALOS_TASK_NOT_FOUND')
            return parseTask(rows[0] as TalosSqlRow)
        },
        async updateTask(taskId: string, patch: UpdateTaskPatch) {
            /*
             * Le colonne si compongono, invece di scrivere cinque UPDATE o uno
             * solo che riscrive tutto. Riscrivere tutto sembra più semplice ed
             * è il modo di perdere un campo che il chiamante non aveva in mano:
             * chi cambia la priorità dalla chat non ha mai visto `instruction`.
             */
            const colonne: string[] = []
            const valori: (string | number | null)[] = []
            if (patch.title !== undefined) {
                colonne.push('title = ?')
                valori.push(normalizeStationTitle(patch.title))
            }
            if (patch.description !== undefined) {
                colonne.push('description = ?')
                valori.push(patch.description)
            }
            if (patch.priority !== undefined) {
                colonne.push('priority = ?')
                valori.push(patch.priority)
            }
            if (patch.schedule_json !== undefined) {
                colonne.push('schedule_json = ?')
                valori.push(patch.schedule_json)
            }
            if (patch.instruction !== undefined) {
                colonne.push('instruction = ?')
                valori.push(patch.instruction)
            }

            await transaction(async (database) => {
                const exists = await database.query('SELECT id FROM talos_tasks WHERE id = ? LIMIT 1', [taskId])
                if (exists.length !== 1) throw new Error('TALOS_TASK_NOT_FOUND')
                // Una patch vuota tocca comunque `updated_at`: chi ha chiesto di
                // salvare deve vedere l'attività risalire in cima, altrimenti
                // sembra che il salvataggio non sia avvenuto.
                await database.run(
                    `UPDATE talos_tasks SET ${[...colonne, 'updated_at = ?'].join(', ')} WHERE id = ?`,
                    [...valori, now(), taskId],
                )
            })
            const rows = await (await db()).query(
                `SELECT id, title, description, run_id, priority, status, content_origin, schedule_json, instruction, last_run_at, created_at, updated_at
                 FROM talos_tasks WHERE id = ? LIMIT 1`,
                [taskId],
            )
            if (rows.length !== 1) throw new Error('TALOS_TASK_NOT_FOUND')
            return parseTask(rows[0] as TalosSqlRow)
        },
        async deleteTask(taskId: string) {
            await transaction(async (database) => {
                const exists = await database.query('SELECT id FROM talos_tasks WHERE id = ? LIMIT 1', [taskId])
                if (exists.length !== 1) throw new Error('TALOS_TASK_NOT_FOUND')
                await database.run('DELETE FROM talos_tasks WHERE id = ?', [taskId])
            })
        },
        async createNote(input: CreateNoteInput) {
            const note: TalosLocalNote = {
                id: normalizeRepositoryId(input.id),
                title: normalizeStationTitle(input.title),
                content: input.content,
                trust_level: 'untrusted',
                content_origin: input.content_origin ?? TALOS_CONTENT_ORIGIN_FALLBACK,
                created_at: input.created_at,
                updated_at: input.created_at,
            }
            await transaction(async (database) => {
                await database.run(
                    `INSERT INTO talos_notes
                        (id, title, content, trust_level, content_origin, created_at, updated_at)
                     VALUES (?, ?, ?, 'untrusted', ?, ?, ?)`,
                    [note.id, note.title, note.content, note.content_origin,
                        note.created_at, note.updated_at],
                )
            })
            return note
        },
        async appendResearchEvent(entry) {
            // The refusal is the UNIQUE (run_id, seq) constraint doing its job,
            // not an exception to swallow blindly: only a collision on THAT
            // pair is a duplicate, and anything else must still be a failure.
            const existing = await (await db()).query(
                'SELECT seq FROM talos_research_events WHERE run_id = ? AND seq = ? LIMIT 1',
                [entry.run_id, entry.seq],
            )
            if (existing.length > 0) return false
            await (await db()).run(
                `INSERT INTO talos_research_events (run_id, seq, kind, at, payload_json)
                 VALUES (?, ?, ?, ?, ?)`,
                [entry.run_id, entry.seq, entry.kind, entry.at, entry.payload_json],
            )
            return true
        },
        async readResearchJournal(runId) {
            const rows = await (await db()).query(
                `SELECT run_id, seq, kind, at, payload_json
                 FROM talos_research_events WHERE run_id = ? ORDER BY seq ASC`,
                [runId],
            )
            return rows.map((row) => {
                const entry = row as TalosSqlRow
                return {
                    run_id: String(entry.run_id),
                    seq: Number(entry.seq),
                    kind: String(entry.kind),
                    at: String(entry.at),
                    payload_json: String(entry.payload_json ?? '{}'),
                }
            })
        },
        async upsertResearchRun(row) {
            await (await db()).run(
                `INSERT INTO talos_research_runs
                    (id, session_id, question, depth, engine, status, started_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                    status = excluded.status,
                    engine = excluded.engine,
                    updated_at = excluded.updated_at`,
                [row.id, row.session_id, row.question, row.depth, row.engine,
                    row.status, row.started_at, row.updated_at],
            )
        },
        /**
         * A research and everything it wrote, in ONE transaction.
         *
         * The dossiers are revoked with the same call that drops the journal
         * because the two only make sense together: pages kept without the run
         * that fetched them are files nobody can trace, and a journal kept
         * without its pages points at evidence that is gone. Half of this
         * committing would leave exactly one of those.
         *
         * A dossier already revoked is skipped rather than failing the delete:
         * the person asked for this research to go, and refusing because part
         * of it went earlier would strand the rest forever.
         */
        async deleteResearchRun(runId: string) {
            return transaction(async (database) => {
                const rows = await database.query(
                    "SELECT payload_json FROM talos_research_events WHERE run_id = ?",
                    [runId],
                )
                const dossiers = new Set<string>()
                for (const row of rows) {
                    const payload = String((row as TalosSqlRow).payload_json ?? '{}')
                    let parsed: { resultRef?: unknown }
                    // A journal is read from storage: one unparseable row must
                    // not make a research undeletable.
                    try { parsed = JSON.parse(payload) as { resultRef?: unknown } } catch { continue }
                    if (typeof parsed.resultRef === 'string' && parsed.resultRef.length > 0) {
                        dossiers.add(parsed.resultRef)
                    }
                }

                const timestamp = now()
                const removed: string[] = []
                for (const fileId of dossiers) {
                    const exists = await database.query(
                        "SELECT id FROM talos_vault_files WHERE id = ? AND status != 'revoked' LIMIT 1",
                        [fileId],
                    )
                    if (exists.length !== 1) continue
                    await database.run(
                        `UPDATE talos_vault_files
                         SET status = 'revoked', private_uri = '', extracted_text = NULL, updated_at = ?
                         WHERE id = ?`,
                        [timestamp, fileId],
                    )
                    await database.run(
                        `UPDATE talos_file_authority_grants
                         SET status = 'revoked', revoked_at = ?, updated_at = ?
                         WHERE vault_file_id = ? AND status = 'active'`,
                        [timestamp, timestamp, fileId],
                    )
                    removed.push(fileId)
                }

                await database.run('DELETE FROM talos_research_events WHERE run_id = ?', [runId])
                await database.run('DELETE FROM talos_research_runs WHERE id = ?', [runId])
                return removed
            })
        },
        async listResearchRuns() {
            const rows = await (await db()).query(
                `SELECT id, session_id, question, depth, engine, status, started_at, updated_at
                 FROM talos_research_runs ORDER BY updated_at DESC, id DESC`,
            )
            return rows.map((row) => {
                const entry = row as TalosSqlRow
                return {
                    id: String(entry.id),
                    session_id: String(entry.session_id),
                    question: String(entry.question),
                    depth: String(entry.depth),
                    engine: String(entry.engine),
                    status: String(entry.status),
                    started_at: String(entry.started_at),
                    updated_at: String(entry.updated_at),
                }
            })
        },
        async listNotes() {
            const rows = await (await db()).query(
                `SELECT id, title, content, trust_level, content_origin, created_at, updated_at
                 FROM talos_notes ORDER BY updated_at DESC, id DESC`,
            )
            return rows.map((row) => parseNote(row as TalosSqlRow))
        },
        async updateNote(input: UpdateNoteInput) {
            return transaction(async (database) => {
                const rows = await database.query(
                    `SELECT id, title, content, trust_level, content_origin, created_at, updated_at
                     FROM talos_notes WHERE id = ? LIMIT 1`,
                    [input.id],
                )
                if (rows.length !== 1) throw new Error('TALOS_NOTE_NOT_FOUND')
                const current = parseNote(rows[0] as TalosSqlRow)
                /*
                 * Assente vuol dire «non toccarlo», non «svuotalo».
                 *
                 * La differenza pesa perché il chiamante tipico e' il tool della
                 * chat, dove un modello che vuole correggere il titolo manda il
                 * titolo e basta. Con un aggiornamento totale quella chiamata
                 * cancellerebbe il corpo della nota — e la perdita si vedrebbe
                 * solo aprendola.
                 */
                const title = input.title ?? current.title
                const content = input.content ?? current.content
                // La data di modifica la mette il deposito, non chi scrive:
                // l'elenco si ordina su questa, e una data fornita da fuori
                // potrebbe tenere una nota in cima per sempre.
                const updatedAt = new Date().toISOString()
                await database.run(
                    'UPDATE talos_notes SET title = ?, content = ?, updated_at = ? WHERE id = ?',
                    [title, content, updatedAt, input.id],
                )
                return { ...current, title, content, updated_at: updatedAt }
            })
        },
        async deleteNote(noteId: string) {
            await transaction(async (database) => {
                const exists = await database.query('SELECT id FROM talos_notes WHERE id = ? LIMIT 1', [noteId])
                if (exists.length !== 1) throw new Error('TALOS_NOTE_NOT_FOUND')
                await database.run('DELETE FROM talos_notes WHERE id = ?', [noteId])
            })
        },
        async createMemory(input: CreateMemoryInput) {
            const memory: TalosLocalMemory = {
                id: normalizeRepositoryId(input.id),
                scope_type: input.scope_type,
                scope_id: input.scope_id,
                kind: input.kind,
                status: 'active',
                title: input.title,
                content: input.content,
                source: input.source,
                metadata: cloneJsonObject(input.metadata),
                trust_level: 'untrusted',
                content_origin: input.content_origin ?? TALOS_CONTENT_ORIGIN_FALLBACK,
                last_used_at: null,
                created_at: input.created_at,
                updated_at: input.created_at,
            }
            await transaction(async (database) => {
                await database.run(
                    `INSERT INTO talos_memories
                        (id, scope_type, scope_id, kind, status, title, content, source,
                         metadata_json, trust_level, content_origin, last_used_at, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'untrusted', ?, NULL, ?, ?)`,
                    [
                        memory.id, memory.scope_type, memory.scope_id, memory.kind, memory.status,
                        memory.title, memory.content, memory.source, JSON.stringify(memory.metadata),
                        memory.content_origin, memory.created_at, memory.updated_at,
                    ],
                )
            })
            return memory
        },
        async upsertMemory(input: CreateMemoryInput) {
            const memory: TalosLocalMemory = {
                id: normalizeRepositoryId(input.id),
                scope_type: input.scope_type,
                scope_id: input.scope_id,
                kind: input.kind,
                status: 'active',
                title: input.title,
                content: input.content,
                source: input.source,
                metadata: cloneJsonObject(input.metadata),
                trust_level: 'untrusted',
                content_origin: input.content_origin ?? TALOS_CONTENT_ORIGIN_FALLBACK,
                last_used_at: null,
                created_at: input.created_at,
                updated_at: input.created_at,
            }
            await transaction(async (database) => {
                await database.run(
                    `INSERT INTO talos_memories
                        (id, scope_type, scope_id, kind, status, title, content, source,
                         metadata_json, trust_level, content_origin, last_used_at, created_at, updated_at)
                     VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, 'untrusted', ?, NULL, ?, ?)
                     ON CONFLICT(id) DO UPDATE SET
                         scope_type = excluded.scope_type,
                         scope_id = excluded.scope_id,
                         kind = excluded.kind,
                         status = 'active',
                         title = excluded.title,
                         content = excluded.content,
                         source = excluded.source,
                         metadata_json = excluded.metadata_json,
                         trust_level = 'untrusted',
                         updated_at = excluded.updated_at`,
                    [
                        memory.id, memory.scope_type, memory.scope_id, memory.kind,
                        memory.title, memory.content, memory.source, JSON.stringify(memory.metadata),
                        memory.content_origin, memory.created_at, memory.updated_at,
                    ],
                )
            })
            const rows = await (await db()).query(
                `SELECT id, scope_type, scope_id, kind, status, title, content, source, metadata_json, content_origin, last_used_at, created_at, updated_at
                 FROM talos_memories WHERE id = ? LIMIT 1`,
                [memory.id],
            )
            if (rows.length !== 1) throw new Error('TALOS_MEMORY_NOT_FOUND')
            return parseMemory(rows[0] as TalosSqlRow)
        },
        async listMemories() {
            const rows = await (await db()).query(
                `SELECT id, scope_type, scope_id, kind, status, title, content, source, metadata_json, content_origin, last_used_at, created_at, updated_at
                 FROM talos_memories
                 ORDER BY updated_at DESC, id DESC`,
            )
            return rows.map((row) => parseMemory(row as TalosSqlRow))
        },
        async updateMemory(memoryId: string, patch: UpdateMemoryPatch) {
            const campi: string[] = []
            const valori: TalosSqlValue[] = []
            if (patch.title !== undefined) { campi.push('title = ?'); valori.push(patch.title) }
            if (patch.content !== undefined) { campi.push('content = ?'); valori.push(patch.content) }
            if (patch.kind !== undefined) { campi.push('kind = ?'); valori.push(patch.kind) }
            // Una patch vuota non e' un aggiornamento a zero campi: e' una
            // chiamata che chi l'ha scritta credeva facesse qualcosa.
            if (campi.length === 0) throw new Error('TALOS_MEMORY_UPDATE_EMPTY')

            await transaction(async (database) => {
                const exists = await database.query(
                    'SELECT id FROM talos_memories WHERE id = ? LIMIT 1',
                    [memoryId],
                )
                if (exists.length !== 1) throw new Error('TALOS_MEMORY_NOT_FOUND')
                await database.run(
                    `UPDATE talos_memories SET ${campi.join(', ')}, updated_at = ? WHERE id = ?`,
                    [...valori, now(), memoryId],
                )
            })
            const rows = await (await db()).query(
                `SELECT id, scope_type, scope_id, kind, status, title, content, source, metadata_json, content_origin, last_used_at, created_at, updated_at
                 FROM talos_memories WHERE id = ? LIMIT 1`,
                [memoryId],
            )
            if (rows.length !== 1) throw new Error('TALOS_MEMORY_NOT_FOUND')
            return parseMemory(rows[0] as TalosSqlRow)
        },
        async updateMemoryStatus(memoryId: string, status: TalosMemoryStatus) {
            // Driver-independent (F4-#22 pattern): guard by SELECT, never
            // consult the driver's changes counter.
            await transaction(async (database) => {
                const exists = await database.query(
                    'SELECT id FROM talos_memories WHERE id = ? LIMIT 1',
                    [memoryId],
                )
                if (exists.length !== 1) throw new Error('TALOS_MEMORY_NOT_FOUND')
                await database.run(
                    'UPDATE talos_memories SET status = ?, updated_at = ? WHERE id = ?',
                    [status, now(), memoryId],
                )
            })
            const rows = await (await db()).query(
                `SELECT id, scope_type, scope_id, kind, status, title, content, source, metadata_json, content_origin, last_used_at, created_at, updated_at
                 FROM talos_memories WHERE id = ? LIMIT 1`,
                [memoryId],
            )
            if (rows.length !== 1) throw new Error('TALOS_MEMORY_NOT_FOUND')
            return parseMemory(rows[0] as TalosSqlRow)
        },
        async touchMemories(memoryIds: string[], usedAt: string) {
            if (memoryIds.length === 0) return
            await transaction(async (database) => {
                for (const memoryId of memoryIds) {
                    await database.run(
                        'UPDATE talos_memories SET last_used_at = ? WHERE id = ?',
                        [usedAt, memoryId],
                    )
                }
            })
        },
        async deleteMemory(memoryId: string) {
            await transaction(async (database) => {
                const exists = await database.query(
                    'SELECT id FROM talos_memories WHERE id = ? LIMIT 1',
                    [memoryId],
                )
                if (exists.length !== 1) throw new Error('TALOS_MEMORY_NOT_FOUND')
                await database.run('DELETE FROM talos_memories WHERE id = ?', [memoryId])
            })
        },
        async loadComposerDraft(scopeId: string) {
            const rows = await (await db()).query(
                'SELECT value_json FROM talos_chat_state WHERE key = ? LIMIT 1',
                [composerDraftKey(scopeId)],
            )
            if (rows.length === 0) return ''
            const raw = requiredString(rows[0] as TalosSqlRow, 'value_json')
            try {
                const value: unknown = JSON.parse(raw)
                if (typeof value === 'string') return normalizeComposerDraft(value)
            } catch {
                // Collapse malformed JSON and an invalid draft into one repository fault.
            }
            return invalidRow()
        },
        async saveComposerDraft(scopeId: string, draft: string) {
            const key = composerDraftKey(scopeId)
            const value = normalizeComposerDraft(draft)
            await transaction(async (database) => {
                if (value === '') {
                    await database.run('DELETE FROM talos_chat_state WHERE key = ?', [key])
                    return
                }
                await database.run(
                    `INSERT INTO talos_chat_state (key, value_json, updated_at)
                     VALUES (?, ?, ?)
                     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
                    [key, JSON.stringify(value), now()],
                )
            })
        },
        close: () => runtime.close(),
    }
}
