import { Capacitor } from '@capacitor/core'
import { talosBridgeCall } from '@/lib/talosBridge'
import {
    CapacitorSQLite,
    SQLiteConnection,
    type SQLiteDBConnection,
} from '@capacitor-community/sqlite'
import {
    TALOS_CHAT_DATABASE_NAME,
    TALOS_CHAT_DATABASE_UPGRADES,
    TALOS_CHAT_DATABASE_VERSION,
} from '@/persistence/chatDatabaseSchema'
import type {
    TalosSqlChanges,
    TalosSqlConnection,
    TalosSqlitePlatform,
    TalosSqliteRuntime,
    TalosSqlRow,
    TalosSqlValue,
} from '@/persistence/sqliteTypes'

export interface TalosCapacitorSqliteGateway {
    addUpgradeStatement(database: string, upgrades: typeof TALOS_CHAT_DATABASE_UPGRADES): Promise<void>
    checkConnectionsConsistency(): Promise<boolean>
    isConnection(database: string, readonly: boolean): Promise<boolean>
    retrieveConnection(database: string, readonly: boolean): Promise<TalosSqlConnection>
    createConnection(
        database: string,
        encrypted: boolean,
        mode: string,
        version: number,
        readonly: boolean,
    ): Promise<TalosSqlConnection>
    isSecretStored(): Promise<boolean>
    isDatabase(database: string): Promise<boolean>
    setEncryptionSecret(passphrase: string): Promise<void>
    clearEncryptionSecret(): Promise<void>
    exportToJson(database: string): Promise<unknown>
    importFromJson(payload: string): Promise<void>
    deleteDatabase(database: string): Promise<void>
    initWebStore(): Promise<void>
    saveToStore(database: string): Promise<void>
    closeConnection(database: string, readonly: boolean): Promise<void>
}

export interface TalosDatabaseSecret {
    secret: string
    /** True when the key was just minted - see the guard in establish(). */
    fresh: boolean
}

export interface CapacitorSqliteRuntimeOptions {
    platform: TalosSqlitePlatform
    gateway: TalosCapacitorSqliteGateway
    /** Debt S1: the key comes from the PIN-wrapped store, never invented here. */
    secret: () => Promise<TalosDatabaseSecret>
    /** Debt S1: the migration payload survives a process kill on disk. */
    persistMigration: (payload: string) => Promise<void>
    readMigration: () => Promise<string | null>
    clearMigration: () => Promise<void>
    prepareWebStore: () => Promise<void> | void
}

function changes(value: { changes?: { changes?: number; lastId?: number } }): TalosSqlChanges {
    return {
        changes: Number.isFinite(value.changes?.changes) ? Number(value.changes?.changes) : 0,
        ...(Number.isFinite(value.changes?.lastId) ? { lastId: Number(value.changes?.lastId) } : {}),
    }
}

function wrapConnection(connection: SQLiteDBConnection): TalosSqlConnection {
    return {
        open: () => connection.open(),
        isOpen: async () => (await connection.isDBOpen()).result === true,
        close: () => connection.close(),
        execute: async (statements) => changes(await connection.execute(statements, true)),
        run: async (statement, values = []) => changes(await connection.run(statement, values, false)),
        query: async (statement, values = []) => {
            const result = await connection.query(statement, values)
            return Array.isArray(result.values) ? result.values as TalosSqlRow[] : []
        },
        beginTransaction: async () => { await connection.beginTransaction() },
        commitTransaction: async () => { await connection.commitTransaction() },
        rollbackTransaction: async () => { await connection.rollbackTransaction() },
    }
}

function createDefaultGateway(): TalosCapacitorSqliteGateway {
    const sqlite = new SQLiteConnection(CapacitorSQLite)
    return {
        addUpgradeStatement: (database, upgrades) => sqlite.addUpgradeStatement(database, [...upgrades]),
        checkConnectionsConsistency: async () => (await sqlite.checkConnectionsConsistency()).result === true,
        isConnection: async (database, readonly) => (await sqlite.isConnection(database, readonly)).result === true,
        retrieveConnection: async (database, readonly) => wrapConnection(await sqlite.retrieveConnection(database, readonly)),
        createConnection: async (database, encrypted, mode, version, readonly) =>
            wrapConnection(await sqlite.createConnection(database, encrypted, mode, version, readonly)),
        isSecretStored: async () => (await sqlite.isSecretStored()).result === true,
        isDatabase: async (database) => (await sqlite.isDatabase(database)).result === true,
        setEncryptionSecret: (passphrase) => sqlite.setEncryptionSecret(passphrase),
        clearEncryptionSecret: () => sqlite.clearEncryptionSecret(),
        exportToJson: async (database) => {
            const link = await sqlite.retrieveConnection(database, false)
            return (await link.exportToJson('full')).export
        },
        importFromJson: async (payload) => { await sqlite.importFromJson(payload) },
        deleteDatabase: async (database) => {
            const link = await sqlite.retrieveConnection(database, false)
            await link.delete()
        },
        initWebStore: () => sqlite.initWebStore(),
        saveToStore: (database) => sqlite.saveToStore(database),
        closeConnection: (database, readonly) => sqlite.closeConnection(database, readonly),
    }
}

const MIGRATION_FILE = 'talos-db-migration.json'

async function managedDatabaseSecret(): Promise<TalosDatabaseSecret> {
    const { resolveTalosDatabaseKey, readTalosDatabaseKeyState } = await import('@/services/databaseKey')
    const before = await readTalosDatabaseKeyState()
    const secret = await resolveTalosDatabaseKey()
    return { secret, fresh: before === 'absent' }
}

type TalosJeepSqliteLoader = Pick<typeof import('jeep-sqlite/loader'), 'defineCustomElements'>

export async function prepareOfficialWebStore(loader?: TalosJeepSqliteLoader): Promise<void> {
    const { defineCustomElements } = loader ?? await import('jeep-sqlite/loader')
    await defineCustomElements(window)
    await customElements.whenDefined('jeep-sqlite')
    if (!document.querySelector('jeep-sqlite')) {
        document.body.append(document.createElement('jeep-sqlite'))
    }
}

export function createCapacitorSqliteRuntime(
    options: CapacitorSqliteRuntimeOptions = {
        platform: Capacitor.getPlatform() === 'web' ? 'web' : 'native',
        gateway: createDefaultGateway(),
        secret: managedDatabaseSecret,
        persistMigration: async (payload) => {
            const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
            await Filesystem.writeFile({
                path: MIGRATION_FILE, data: payload, directory: Directory.Data, encoding: Encoding.UTF8,
            })
        },
        readMigration: async () => {
            try {
                const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
                const file = await Filesystem.readFile({
                    path: MIGRATION_FILE, directory: Directory.Data, encoding: Encoding.UTF8,
                })
                return typeof file.data === 'string' && file.data.length > 0 ? file.data : null
            } catch {
                return null
            }
        },
        clearMigration: async () => {
            try {
                const { Filesystem, Directory } = await import('@capacitor/filesystem')
                await Filesystem.deleteFile({ path: MIGRATION_FILE, directory: Directory.Data })
            } catch {
                // Already gone: the migration is finished either way.
            }
        },
        prepareWebStore: prepareOfficialWebStore,
    },
): TalosSqliteRuntime {
    let connection: TalosSqlConnection | null = null
    let connecting: Promise<TalosSqlConnection> | null = null

    async function establish(): Promise<TalosSqlConnection> {
        if (options.platform === 'web') {
            await options.prepareWebStore()
            await options.gateway.initWebStore()
        } else if (!await options.gateway.isSecretStored()) {
            // Debt S1: ask FIRST. A protected-and-locked key rejects here, which
            // is the whole point - no connection exists until the PIN is given.
            const { secret, fresh } = await options.secret()
            // A freshly minted key over an existing database would open an
            // unreadable file and look like data loss. That case is a hard stop.
            if (fresh && await options.gateway.isDatabase(TALOS_CHAT_DATABASE_NAME)) {
                throw new Error('TALOS_CHAT_DB_KEY_MISSING: the encrypted chat database key is unavailable.')
            }
            await options.gateway.setEncryptionSecret(secret)
        }

        // Debt S1: a migration interrupted by a process kill left its data in a
        // file. Restore it BEFORE anything else touches the database.
        if (options.platform === 'native') {
            const pending = await options.readMigration()
            if (pending) {
                try {
                    await options.gateway.importFromJson(pending)
                    await options.clearMigration()
                } catch {
                    // Keep the file: a failed resume must not discard the data.
                }
            }
        }

        await options.gateway.addUpgradeStatement(TALOS_CHAT_DATABASE_NAME, TALOS_CHAT_DATABASE_UPGRADES)
        const consistent = await options.gateway.checkConnectionsConsistency()
        const exists = consistent && await options.gateway.isConnection(TALOS_CHAT_DATABASE_NAME, false)
        const db = exists
            ? await options.gateway.retrieveConnection(TALOS_CHAT_DATABASE_NAME, false)
            : await options.gateway.createConnection(
                TALOS_CHAT_DATABASE_NAME,
                options.platform === 'native',
                options.platform === 'native' ? 'secret' : 'no-encryption',
                TALOS_CHAT_DATABASE_VERSION,
                false,
            )
        if (!await db.isOpen()) await db.open()
        await db.execute('PRAGMA foreign_keys = ON;')
        connection = db
        return db
    }

    return {
        platform: options.platform,
        connect() {
            if (connection) return Promise.resolve(connection)
            if (!connecting) {
                connecting = establish().finally(() => { connecting = null })
            }
            // R1-6: fenced — a hung native connect froze "Preparing local
            // chat storage" forever with no Doctor evidence. The fence wraps
            // the CALLER's wait, never the in-flight establish (m6): a retry
            // after a timeout re-awaits the SAME connection attempt instead
            // of racing a second createConnection against it.
            return talosBridgeCall('TALOS_DB_CONNECT', () => connecting as Promise<TalosSqlConnection>, 20_000)
        },
        async persist() {
            if (options.platform === 'web') {
                await options.gateway.saveToStore(TALOS_CHAT_DATABASE_NAME)
            }
        },
        async close() {
            if (!connection) return
            if (await connection.isOpen()) await connection.close()
            await options.gateway.closeConnection(TALOS_CHAT_DATABASE_NAME, false)
            connection = null
        },
        /**
         * Debt S1 - re-lock. Closing the connection is not enough: the plugin
         * keeps the passphrase in encrypted preferences, so the database would
         * still open without the PIN. The secret leaves the device store too.
         */
        async forgetSecret() {
            if (connection) {
                if (await connection.isOpen()) await connection.close()
                await options.gateway.closeConnection(TALOS_CHAT_DATABASE_NAME, false)
                connection = null
            }
            if (options.platform === 'native') await options.gateway.clearEncryptionSecret()
        },
        /**
         * Debt S1 - legacy installs. Their passphrase was generated before this
         * existed and lives ONLY inside the plugin: it cannot be read, so it
         * cannot be wrapped with the PIN. The data is exported, the database is
         * destroyed and rebuilt under a key we control. Nothing is destroyed
         * before the export has succeeded.
         */
        async adoptManagedSecret(secret: string) {
            if (options.platform !== 'native') return
            if (!await options.gateway.isDatabase(TALOS_CHAT_DATABASE_NAME)) {
                // Nothing to carry over: just move the store onto our key.
                await options.gateway.clearEncryptionSecret()
                await options.gateway.setEncryptionSecret(secret)
                return
            }
            let payload: string
            try {
                const exported = await options.gateway.exportToJson(TALOS_CHAT_DATABASE_NAME)
                payload = JSON.stringify(exported)
            } catch (error) {
                throw new Error(`TALOS_DB_ADOPT_FAILED: export refused (${String(error)})`)
            }
            // SF-CRITICAL: the export used to live in this local variable alone.
            // Android kills backgrounded apps freely, and this runs while the
            // user waits on a modal — a kill between the delete and the import
            // destroyed every chat with the only copy in RAM. It goes to disk
            // first, and `establish()` resumes from it on the next launch.
            await options.persistMigration(payload)
            try {
                // SF-CRITICAL: deleting AFTER closeConnection can never work —
                // the plugin drops the connection from its dictionary and the
                // delete path retrieves it again. Delete first, close second.
                await options.gateway.deleteDatabase(TALOS_CHAT_DATABASE_NAME)
                if (connection) {
                    await options.gateway.closeConnection(TALOS_CHAT_DATABASE_NAME, false)
                    connection = null
                }
                await options.gateway.clearEncryptionSecret()
                await options.gateway.setEncryptionSecret(secret)
                await options.gateway.importFromJson(payload)
            } catch (error) {
                throw new Error(`TALOS_DB_ADOPT_FAILED: ${String(error)} — your data is safe in the migration file and will be restored on the next launch.`)
            }
            await options.clearMigration()
        },
    }
}

export type { TalosSqlValue }
