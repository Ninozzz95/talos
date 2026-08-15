import { describe, expect, it } from 'vitest'
import { createSqliteChatRepository } from '@/repositories/sqliteChatRepository'
import { TALOS_CHAT_DATABASE_UPGRADES } from '@/persistence/chatDatabaseSchema'
import type { TalosSqlConnection, TalosSqliteRuntime } from '@/persistence/sqliteTypes'
import { exerciseChatRepositoryContract } from './chatRepository.contract'
import { createSqlJsConnection } from './sqlJsConnection'

/**
 * Test review 2026-07-25 (CRITICAL C1/C2): the repository contract only ever ran
 * against the in-memory fake, and the migrations were asserted as SUBSTRINGS of
 * SQL that nothing executed. Both are now run against a real SQLite engine
 * (sql.js — already pinned, wasm already vendored), so column typos, ORDER BY
 * mistakes, FK ordering and ALTER TABLE restrictions fail the build instead of
 * shipping.
 */
async function sqlJsRuntime(): Promise<{ runtime: TalosSqliteRuntime; connection: TalosSqlConnection & { close(): void } }> {
    const connection = await createSqlJsConnection()
    // The real repository expects the schema to exist, exactly as the production
    // runtime applies it on connect.
    for (const upgrade of TALOS_CHAT_DATABASE_UPGRADES) {
        for (const statement of upgrade.statements) await connection.execute(statement)
    }
    const runtime: TalosSqliteRuntime = {
        platform: 'web',
        connect: async () => connection,
        persist: async () => undefined,
        close: async () => undefined,
    }
    return { runtime, connection }
}

describe('sqliteChatRepository against a real SQLite engine', () => {
    it('satisfies the full behavioural repository contract', async () => {
        const { runtime, connection } = await sqlJsRuntime()
        try {
            await exerciseChatRepositoryContract(createSqliteChatRepository(runtime))
        } finally {
            connection.close()
        }
    }, 60_000)

    it('applies every schema upgrade in order and preserves seeded rows', async () => {
        const connection = await createSqlJsConnection()
        try {
            // v1 only, then seed, then the remaining upgrades — the shape of a real
            // device upgrading across releases (the highest-risk, unrecoverable path).
            const [first, ...rest] = TALOS_CHAT_DATABASE_UPGRADES
            for (const statement of first!.statements) await connection.execute(statement)

            // v1 columns only — the point is that later upgrades preserve this row.
            await connection.run(
                'INSERT INTO talos_chat_sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
                ['legacy-session', 'Legacy chat', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'],
            )

            for (const upgrade of rest) {
                for (const statement of upgrade.statements) await connection.execute(statement)
            }

            const rows = await connection.query('SELECT id, title FROM talos_chat_sessions')
            expect(rows).toEqual([{ id: 'legacy-session', title: 'Legacy chat' }])

            // The v4 stations must exist after the chain.
            const tables = await connection.query(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
            )
            const names = tables.map((row) => String(row.name))
            for (const table of ['talos_chat_messages', 'talos_vault_files', 'talos_tasks', 'talos_notes', 'talos_memories']) {
                expect(names).toContain(table)
            }
        } finally {
            connection.close()
        }
    }, 60_000)
})
