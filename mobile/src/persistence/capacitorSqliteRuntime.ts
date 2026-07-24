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
    initWebStore(): Promise<void>
    saveToStore(database: string): Promise<void>
    closeConnection(database: string, readonly: boolean): Promise<void>
}

export interface CapacitorSqliteRuntimeOptions {
    platform: TalosSqlitePlatform
    gateway: TalosCapacitorSqliteGateway
    randomSecret: () => string
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
        initWebStore: () => sqlite.initWebStore(),
        saveToStore: (database) => sqlite.saveToStore(database),
        closeConnection: (database, readonly) => sqlite.closeConnection(database, readonly),
    }
}

function randomDatabaseSecret(): string {
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
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
        randomSecret: randomDatabaseSecret,
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
            if (await options.gateway.isDatabase(TALOS_CHAT_DATABASE_NAME)) {
                throw new Error('TALOS_CHAT_DB_KEY_MISSING: the encrypted chat database key is unavailable.')
            }
            await options.gateway.setEncryptionSecret(options.randomSecret())
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
    }
}

export type { TalosSqlValue }
