import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import initSqlJs, { type Database } from 'sql.js'
import type { TalosSqlChanges, TalosSqlConnection, TalosSqlRow, TalosSqlValue } from '@/persistence/sqliteTypes'

/**
 * Test review 2026-07-25: the behavioural repository contract only ever ran
 * against the in-memory fake, so the 50KB SQLite implementation that actually
 * ships was verified by a mock whose `query` returned pre-queued rows regardless
 * of the SQL. A column typo, a wrong ORDER BY or a bad JOIN passed green — which
 * is exactly the class of the F4-#22 device bug ("rename/delete works on web,
 * fails on device").
 *
 * sql.js (already a pinned dependency, wasm already vendored in public/assets)
 * gives a REAL SQLite engine in-process, so the shipped repository and the real
 * migrations can be exercised.
 */
export async function createSqlJsConnection(): Promise<TalosSqlConnection & { close(): void }> {
    const wasmBinary = readFileSync(resolve(process.cwd(), 'public/assets/sql-wasm.wasm'))
    const SQL = await initSqlJs({ wasmBinary })
    const db: Database = new SQL.Database()
    db.run('PRAGMA foreign_keys = ON;')

    const changes = (): TalosSqlChanges => ({ changes: db.getRowsModified() })

    return {
        async open() { /* already open */ },
        async isOpen() { return true },
        async beginTransaction() { db.run('BEGIN TRANSACTION;') },
        async commitTransaction() { db.run('COMMIT;') },
        async rollbackTransaction() { db.run('ROLLBACK;') },
        async execute(statements: string) {
            db.exec(statements)
            return changes()
        },
        async run(statement: string, values: TalosSqlValue[] = []) {
            db.run(statement, values as never[])
            return changes()
        },
        async query(statement: string, values: TalosSqlValue[] = []) {
            const stmt = db.prepare(statement)
            try {
                stmt.bind(values as never[])
                const rows: TalosSqlRow[] = []
                while (stmt.step()) rows.push(stmt.getAsObject() as TalosSqlRow)
                return rows
            } finally {
                stmt.free()
            }
        },
        close() {
            db.close()
        },
    }
}
