import { describe, expect, it, vi } from 'vitest'
import { createSqliteChatRepository } from '@/repositories/sqliteChatRepository'
import type { TalosSqlConnection, TalosSqlRow, TalosSqliteRuntime } from '@/persistence/sqliteTypes'

function sessionRow(overrides: Partial<Record<string, unknown>> = {}): TalosSqlRow {
    return {
        id: 'session-1',
        title: 'First chat',
        surface: 'chat',
        mode: 'answer_only',
        persistence_mode: 'persistent',
        active_model_profile_id: null,
        metadata_json: '{}',
        created_at: '2026-07-22T09:59:00.000Z',
        updated_at: '2026-07-22T10:00:00.000Z',
        ...overrides,
    }
}

function harness(rows: TalosSqlRow[][] = []) {
    const queryRows = [...rows]
    const connection: TalosSqlConnection = {
        open: vi.fn().mockResolvedValue(undefined),
        isOpen: vi.fn().mockResolvedValue(true),
        close: vi.fn().mockResolvedValue(undefined),
        execute: vi.fn().mockResolvedValue({ changes: 0 }),
        run: vi.fn().mockResolvedValue({ changes: 1 }),
        query: vi.fn().mockImplementation(async () => queryRows.shift() ?? []),
        beginTransaction: vi.fn().mockResolvedValue(undefined),
        commitTransaction: vi.fn().mockResolvedValue(undefined),
        rollbackTransaction: vi.fn().mockResolvedValue(undefined),
    }
    const runtime: TalosSqliteRuntime = {
        platform: 'web',
        connect: vi.fn().mockResolvedValue(connection),
        persist: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
    }
    return { connection, runtime }
}

describe('createSqliteChatRepository', () => {
    it('P0 relock: reacquires the runtime connection after the runtime replaces its wrapper', async () => {
        const first = harness().connection
        const second = harness().connection
        let current = first
        const runtime: TalosSqliteRuntime = {
            platform: 'native',
            connect: vi.fn(async () => current),
            persist: vi.fn().mockResolvedValue(undefined),
            close: vi.fn().mockResolvedValue(undefined),
        }
        const repository = createSqliteChatRepository(runtime)

        await repository.initialize()
        // This is the observable boundary of relock -> unlock: the runtime has
        // discarded upstream wrapper A and now owns wrapper B. The repository
        // must not keep A as a second source of truth.
        current = second
        await repository.listSessions()

        expect(runtime.connect).toHaveBeenCalledTimes(2)
        expect(first.query).not.toHaveBeenCalled()
        expect(second.query).toHaveBeenCalledOnce()
    })

    it('BR-03 persists and parses tool activities through exact repository methods', async () => {
        const row = {
            id: 'activity-1',
            session_id: 'session-1',
            message_id: 'message-1',
            operation: 'screenshot',
            status: 'succeeded',
            payload_json: '{"source":"trusted_node"}',
            evidence_json: '{"contract":"talos.mobile.browser.evidence.v1"}',
            created_at: '2026-07-22T10:00:00.000Z',
            updated_at: '2026-07-22T10:00:00.000Z',
        }
        const { connection, runtime } = harness([[row], [row], [{ id: 'activity-2' }]])
        const repository = createSqliteChatRepository(runtime, {
            now: () => '2026-07-22T10:01:00.000Z',
        })

        await expect(repository.listMessageToolActivities('message-1')).resolves.toEqual([
            expect.objectContaining({ id: 'activity-1', payload: { source: 'trusted_node' } }),
        ])
        await expect(repository.listSessionToolActivities('session-1')).resolves.toHaveLength(1)

        await repository.appendToolActivity({
            id: 'activity-2',
            session_id: 'session-1',
            message_id: 'message-1',
            operation: 'navigate',
            status: 'pending',
            payload: { url: 'https://example.com' },
            evidence: {},
            created_at: '2026-07-22T10:01:00.000Z',
        })
        expect(connection.run).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO talos_chat_tool_activities'),
            expect.arrayContaining(['activity-2', 'session-1', 'message-1', 'navigate', 'pending']),
        )

        await repository.updateToolActivity('activity-2', {
            status: 'succeeded',
            evidence: { current_url: 'https://example.com/' },
        })
        expect(connection.run).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE talos_chat_tool_activities'),
            expect.arrayContaining(['succeeded', '{"current_url":"https://example.com/"}']),
        )
    })

    it('creates a session and active pointer in one committed transaction', async () => {
        const { connection, runtime } = harness()
        const repository = createSqliteChatRepository(runtime, {
            now: () => '2026-07-22T10:00:00.000Z',
        })
        await repository.initialize()
        const created = await repository.createSession({
            id: 'session-1',
            title: ' First chat ',
            active_model_profile_id: 'openrouter:model-a',
            created_at: '2026-07-22T09:59:00.000Z',
        })

        expect(created).toMatchObject({ id: 'session-1', title: 'First chat' })
        expect(connection.beginTransaction).toHaveBeenCalledOnce()
        expect(connection.commitTransaction).toHaveBeenCalledOnce()
        expect(connection.rollbackTransaction).not.toHaveBeenCalled()
        expect(runtime.persist).toHaveBeenCalledOnce()

        const runCalls = vi.mocked(connection.run).mock.calls
        expect(runCalls).toHaveLength(2)
        expect(runCalls[0]?.[0]).toContain('INSERT INTO talos_chat_sessions')
        expect(runCalls[0]?.[0]).not.toContain('First chat')
        expect(runCalls[0]?.[1]).toContain('First chat')
        expect(runCalls[1]?.[0]).toContain('talos_chat_state')
    })

    it('rolls back an append when the session touch fails and does not persist the web store', async () => {
        const { connection, runtime } = harness([
            [{ id: 'session-1' }],
            [{ next_ordinal: 2 }],
        ])
        vi.mocked(connection.run)
            .mockResolvedValueOnce({ changes: 1 })
            .mockRejectedValueOnce(new Error('disk full'))
        const repository = createSqliteChatRepository(runtime, {
            now: () => '2026-07-22T10:00:00.000Z',
        })

        await expect(repository.appendMessage({
            id: 'message-3',
            session_id: 'session-1',
            role: 'assistant',
            content: 'Durable response',
            state: 'persisted',
            created_at: '2026-07-22T10:00:00.000Z',
        })).rejects.toThrow('disk full')

        expect(connection.rollbackTransaction).toHaveBeenCalledOnce()
        expect(connection.commitTransaction).not.toHaveBeenCalled()
        expect(runtime.persist).not.toHaveBeenCalled()
    })

    it('maps ordered rows and rejects malformed metadata instead of casting unchecked data', async () => {
        const good = {
            id: 'message-1',
            session_id: 'session-1',
            role: 'user',
            content: 'Hello',
            state: 'persisted',
            model_profile_id: null,
            run_id: null,
            ordinal: 0,
            metadata_json: '{"source":"composer"}',
            created_at: '2026-07-22T10:00:00.000Z',
            updated_at: '2026-07-22T10:00:00.000Z',
        }
        const first = harness([[good]])
        const repository = createSqliteChatRepository(first.runtime)
        await expect(repository.listMessages('session-1')).resolves.toEqual([
            expect.objectContaining({ id: 'message-1', metadata: { source: 'composer' } }),
        ])
        expect(first.connection.query).toHaveBeenCalledWith(
            expect.stringContaining('ORDER BY ordinal ASC, created_at ASC, id ASC'),
            ['session-1'],
        )

        const malformed = harness([[{ ...good, metadata_json: '[]' }]])
        await expect(createSqliteChatRepository(malformed.runtime).listMessages('session-1'))
            .rejects.toThrow('TALOS_CHAT_ROW_INVALID')
    })

    // F4-#22 — the owner cannot rename/delete on device while web is fine. The
    // only device-only seam is the native driver, and rename/delete were the
    // only writes trusting its `changes` counter. The contract is now
    // driver-independent: existence guarded by SELECT, writes verified by
    // reading back inside the transaction — `changes` is never consulted.
    it('F4-#22 renames even when the driver reports zero changes for a landed write', async () => {
        const { connection, runtime } = harness([
            [sessionRow()],
            [{ title: 'New name' }],
            [sessionRow({ title: 'New name' })],
        ])
        vi.mocked(connection.run).mockResolvedValue({ changes: 0 })
        const repository = createSqliteChatRepository(runtime, {
            now: () => '2026-07-22T10:00:00.000Z',
        })

        await expect(repository.renameSession('session-1', 'New name'))
            .resolves.toMatchObject({ id: 'session-1', title: 'New name' })
        expect(connection.commitTransaction).toHaveBeenCalledOnce()
        expect(connection.rollbackTransaction).not.toHaveBeenCalled()
    })

    it('F4-#22 rejects a rename whose write did not land, regardless of the reported changes', async () => {
        const { connection, runtime } = harness([
            [sessionRow()],
            [{ title: 'First chat' }],
        ])
        vi.mocked(connection.run).mockResolvedValue({ changes: 1 })
        const repository = createSqliteChatRepository(runtime, {
            now: () => '2026-07-22T10:00:00.000Z',
        })

        await expect(repository.renameSession('session-1', 'New name'))
            .rejects.toThrow('TALOS_CHAT_RENAME_UNVERIFIED')
        expect(connection.rollbackTransaction).toHaveBeenCalledOnce()
        expect(connection.commitTransaction).not.toHaveBeenCalled()
    })

    it('F4-#22 deletes even when the driver reports zero changes for a landed delete', async () => {
        const { connection, runtime } = harness([
            [sessionRow()],
            [{ value_json: '"session-1"' }],
            [],
            [{ id: 'session-2' }],
        ])
        vi.mocked(connection.run).mockResolvedValue({ changes: 0 })
        const repository = createSqliteChatRepository(runtime, {
            now: () => '2026-07-22T10:00:00.000Z',
        })

        await expect(repository.deleteSession('session-1')).resolves.toBe('session-2')
        expect(connection.beginTransaction).toHaveBeenCalledOnce()
        expect(connection.commitTransaction).toHaveBeenCalledOnce()
        expect(vi.mocked(connection.run).mock.calls.some(([sql]) => sql.includes('DELETE FROM talos_chat_sessions'))).toBe(true)
        expect(vi.mocked(connection.run).mock.calls.some(([sql]) => sql.includes('talos_chat_state'))).toBe(true)
    })

    it('F4-#22 updates a session even when the driver reports zero changes', async () => {
        const { connection, runtime } = harness([
            [sessionRow()],
            [sessionRow()],
            [sessionRow({ surface: 'browse' })],
        ])
        vi.mocked(connection.run).mockResolvedValue({ changes: 0 })
        const repository = createSqliteChatRepository(runtime, {
            now: () => '2026-07-22T10:00:00.000Z',
        })

        await expect(repository.updateSession('session-1', { surface: 'browse' }))
            .resolves.toMatchObject({ id: 'session-1', surface: 'browse' })
        expect(connection.commitTransaction).toHaveBeenCalledOnce()
        expect(connection.rollbackTransaction).not.toHaveBeenCalled()
    })

    it('F4-#22 updates a tool activity even when the driver reports zero changes', async () => {
        const { connection, runtime } = harness([[{ id: 'activity-1' }]])
        vi.mocked(connection.run).mockResolvedValue({ changes: 0 })
        const repository = createSqliteChatRepository(runtime, {
            now: () => '2026-07-22T10:00:00.000Z',
        })

        await expect(repository.updateToolActivity('activity-1', { status: 'succeeded' }))
            .resolves.toBeUndefined()
        expect(connection.commitTransaction).toHaveBeenCalledOnce()
        expect(connection.rollbackTransaction).not.toHaveBeenCalled()
    })

    it('SF-3: grant revocation never trusts the changes counter — read-back decides', async () => {
        const { connection, runtime } = harness([[{ status: 'revoked' }]])
        vi.mocked(connection.run).mockResolvedValue({ changes: 1 })
        const repository = createSqliteChatRepository(runtime, {
            now: () => '2026-07-22T10:00:00.000Z',
        })
        await expect(repository.revokeFileAuthorityGrant('grant-1')).resolves.toBeUndefined()
        expect(vi.mocked(connection.query).mock.calls.some(([sql]) => sql.includes('SELECT status'))).toBe(true)

        const lying = harness([[{ status: 'active' }]])
        vi.mocked(lying.connection.run).mockResolvedValue({ changes: 1 })
        await expect(createSqliteChatRepository(lying.runtime, { now: () => '2026-07-22T10:00:00.000Z' })
            .revokeFileAuthorityGrant('grant-1')).rejects.toThrow('TALOS_CHAT_ROW_INVALID')
    })

    it('rejects a missing session before attempting the delete', async () => {
        const { connection, runtime } = harness([[]])
        const repository = createSqliteChatRepository(runtime)

        await expect(repository.deleteSession('session-1'))
            .rejects.toThrow('TALOS_CHAT_SESSION_NOT_FOUND')
        expect(vi.mocked(connection.run).mock.calls.some(([sql]) => sql.includes('DELETE FROM talos_chat_sessions'))).toBe(false)
        expect(connection.rollbackTransaction).toHaveBeenCalledOnce()
        expect(connection.commitTransaction).not.toHaveBeenCalled()
    })

    it('stores composer drafts in talos_chat_state without a schema migration', async () => {
        const { connection, runtime } = harness([
            [{ value_json: '"Keep this local"' }],
        ])
        const repository = createSqliteChatRepository(runtime, {
            now: () => '2026-07-22T10:00:00.000Z',
        })

        await expect(repository.loadComposerDraft('session-1')).resolves.toBe('Keep this local')
        expect(connection.query).toHaveBeenCalledWith(
            expect.stringContaining('talos_chat_state'),
            ['composer_draft:session-1'],
        )

        await repository.saveComposerDraft('session-1', 'Updated draft')
        expect(connection.run).toHaveBeenCalledWith(
            expect.stringContaining('ON CONFLICT(key) DO UPDATE'),
            ['composer_draft:session-1', '"Updated draft"', '2026-07-22T10:00:00.000Z'],
        )

        await repository.saveComposerDraft('session-1', '')
        expect(connection.run).toHaveBeenCalledWith(
            expect.stringContaining('DELETE FROM talos_chat_state'),
            ['composer_draft:session-1'],
        )
        expect(runtime.persist).toHaveBeenCalledTimes(2)
    })

    it('AV-03 writes an authorized message and its immutable binding in one transaction', async () => {
        const vaultRow = {
            id: 'vault-1',
            display_name: 'report.txt',
            media_type: 'text/plain',
            size_bytes: 12,
            private_uri: 'talos-vault/files/vault-1.txt',
            status: 'available',
            trust: 'untrusted',
            sha256: 'a'.repeat(64),
            extracted_text: 'Report body',
            failure_code: null,
            metadata_json: '{}',
            created_at: '2026-07-22T10:00:00.000Z',
            updated_at: '2026-07-22T10:00:00.000Z',
        }
        const grantRow = {
            id: 'grant-1',
            vault_file_id: 'vault-1',
            permissions_json: '["model.read","browser.upload"]',
            status: 'active',
            label: 'report.txt',
            created_at: '2026-07-22T10:00:00.000Z',
            updated_at: '2026-07-22T10:00:00.000Z',
            revoked_at: null,
        }
        const { connection, runtime } = harness([
            [{ id: 'session-1' }],
            [{ next_ordinal: 0 }],
            [vaultRow],
            [grantRow],
        ])
        const repository = createSqliteChatRepository(runtime)

        await repository.appendMessage({
            id: 'message-1',
            session_id: 'session-1',
            role: 'user',
            content: 'Use report.',
            state: 'persisted',
            created_at: '2026-07-22T10:00:01.000Z',
            attachments: [{ id: 'binding-1', vault_file_id: 'vault-1', grant_id: 'grant-1' }],
        })

        expect(connection.beginTransaction).toHaveBeenCalledOnce()
        expect(connection.commitTransaction).toHaveBeenCalledOnce()
        expect(connection.rollbackTransaction).not.toHaveBeenCalled()
        const writes = vi.mocked(connection.run).mock.calls
        expect(writes.map(([sql]) => sql)).toEqual([
            expect.stringContaining('INSERT INTO talos_chat_messages'),
            // `OR IGNORE` dal 2026-08-07: legare due volte lo stesso
            // allegato non e' un errore, e' la stessa cosa detta due volte.
            // Sul Pad l'utente vedeva `UNIQUE constraint failed` dopo che
            // l'immagine era stata generata e salvata benissimo.
            expect.stringContaining('INSERT OR IGNORE INTO talos_chat_attachments'),
            expect.stringContaining('UPDATE talos_chat_sessions'),
        ])
        expect(writes[1]?.[1]).toEqual([
            'binding-1',
            'session-1',
            'message-1',
            'vault-1',
            'grant-1',
            'report.txt',
            'text/plain',
            12,
            '2026-07-22T10:00:01.000Z',
        ])
    })

    it('AV-03 rolls back before the message insert when the grant belongs to another file', async () => {
        const { connection, runtime } = harness([
            [{ id: 'session-1' }],
            [{ next_ordinal: 0 }],
            [{
                id: 'vault-1',
                display_name: 'report.txt',
                media_type: 'text/plain',
                size_bytes: 12,
                private_uri: 'talos-vault/files/vault-1.txt',
                status: 'available',
                trust: 'untrusted',
                sha256: 'a'.repeat(64),
                extracted_text: 'Report body',
                failure_code: null,
                metadata_json: '{}',
                created_at: '2026-07-22T10:00:00.000Z',
                updated_at: '2026-07-22T10:00:00.000Z',
            }],
            [{
                id: 'grant-other',
                vault_file_id: 'vault-other',
                permissions_json: '["model.read"]',
                status: 'active',
                label: 'other.txt',
                created_at: '2026-07-22T10:00:00.000Z',
                updated_at: '2026-07-22T10:00:00.000Z',
                revoked_at: null,
            }],
        ])
        const repository = createSqliteChatRepository(runtime)

        await expect(repository.appendMessage({
            id: 'message-1',
            session_id: 'session-1',
            role: 'user',
            content: 'Do not persist.',
            state: 'persisted',
            created_at: '2026-07-22T10:00:01.000Z',
            attachments: [{ id: 'binding-1', vault_file_id: 'vault-1', grant_id: 'grant-other' }],
        })).rejects.toThrow('TALOS_FILE_GRANT_MISMATCH')

        expect(connection.run).not.toHaveBeenCalled()
        expect(connection.rollbackTransaction).toHaveBeenCalledOnce()
        expect(connection.commitTransaction).not.toHaveBeenCalled()
        expect(runtime.persist).not.toHaveBeenCalled()
    })

    it('AV-03 returns message bindings enriched with current grant authority', async () => {
        const { connection, runtime } = harness([[
            {
                id: 'binding-1',
                session_id: 'session-1',
                message_id: 'message-1',
                vault_file_id: 'vault-1',
                grant_id: 'grant-1',
                display_name: 'report.txt',
                media_type: 'text/plain',
                size_bytes: 12,
                permissions_json: '["browser.upload","model.read"]',
                grant_status: 'active',
                created_at: '2026-07-22T10:00:01.000Z',
            },
        ]])
        const repository = createSqliteChatRepository(runtime)

        await expect(repository.listMessageAttachments('message-1')).resolves.toEqual([
            expect.objectContaining({
                id: 'binding-1',
                permissions: ['browser.upload', 'model.read'],
                grant_status: 'active',
            }),
        ])
        expect(connection.query).toHaveBeenCalledWith(
            expect.stringContaining('INNER JOIN talos_file_authority_grants'),
            ['message-1'],
        )
    })
})
