import { describe, expect, it, vi } from 'vitest'
import {
    createCapacitorSqliteRuntime,
    prepareOfficialWebStore,
    type TalosCapacitorSqliteGateway,
} from '@/persistence/capacitorSqliteRuntime'
import { TALOS_CHAT_DATABASE_NAME, TALOS_CHAT_DATABASE_VERSION } from '@/persistence/chatDatabaseSchema'
import type { TalosSqlConnection } from '@/persistence/sqliteTypes'

function connection(): TalosSqlConnection {
    return {
        open: vi.fn().mockResolvedValue(undefined),
        isOpen: vi.fn().mockResolvedValue(false),
        close: vi.fn().mockResolvedValue(undefined),
        execute: vi.fn().mockResolvedValue({ changes: 0 }),
        run: vi.fn().mockResolvedValue({ changes: 0 }),
        query: vi.fn().mockResolvedValue([]),
        beginTransaction: vi.fn().mockResolvedValue(undefined),
        commitTransaction: vi.fn().mockResolvedValue(undefined),
        rollbackTransaction: vi.fn().mockResolvedValue(undefined),
    }
}

function gateway(overrides: Partial<TalosCapacitorSqliteGateway> = {}) {
    const db = connection()
    const value: TalosCapacitorSqliteGateway = {
        addUpgradeStatement: vi.fn().mockResolvedValue(undefined),
        checkConnectionsConsistency: vi.fn().mockResolvedValue(true),
        isConnection: vi.fn().mockResolvedValue(false),
        retrieveConnection: vi.fn().mockResolvedValue(db),
        createConnection: vi.fn().mockResolvedValue(db),
        isSecretStored: vi.fn().mockResolvedValue(false),
        isDatabase: vi.fn().mockResolvedValue(false),
        setEncryptionSecret: vi.fn().mockResolvedValue(undefined),
        initWebStore: vi.fn().mockResolvedValue(undefined),
        saveToStore: vi.fn().mockResolvedValue(undefined),
        closeConnection: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    }
    return { value, db }
}

describe('createCapacitorSqliteRuntime', () => {
    it('boots the pinned jeep-sqlite loader through its real runtime exports', async () => {
        document.querySelectorAll('jeep-sqlite').forEach((element) => element.remove())
        const upstreamLoader = await import('jeep-sqlite/loader')
        expect(upstreamLoader.defineCustomElements).toBeTypeOf('function')
        expect(upstreamLoader).not.toHaveProperty('applyPolyfills')

        const defineCustomElements = vi.fn(async () => {
            if (!customElements.get('jeep-sqlite')) {
                customElements.define('jeep-sqlite', class extends HTMLElement {})
            }
        })

        await prepareOfficialWebStore({ defineCustomElements })
        await prepareOfficialWebStore({ defineCustomElements })

        expect(customElements.get('jeep-sqlite')).toBeTypeOf('function')
        expect(document.querySelectorAll('jeep-sqlite')).toHaveLength(1)
        expect(defineCustomElements).toHaveBeenCalledTimes(2)
        expect(defineCustomElements).toHaveBeenCalledWith(window)
    })

    it('creates one native secret before opening an encrypted versioned database', async () => {
        const { value, db } = gateway()
        const runtime = createCapacitorSqliteRuntime({
            platform: 'native',
            gateway: value,
            randomSecret: () => 'generated-secret',
            prepareWebStore: vi.fn(),
        })

        await expect(runtime.connect()).resolves.toBe(db)
        expect(value.setEncryptionSecret).toHaveBeenCalledOnce()
        expect(value.setEncryptionSecret).toHaveBeenCalledWith('generated-secret')
        expect(value.addUpgradeStatement).toHaveBeenCalledBefore(vi.mocked(value.createConnection))
        expect(value.createConnection).toHaveBeenCalledWith(
            TALOS_CHAT_DATABASE_NAME,
            true,
            'secret',
            TALOS_CHAT_DATABASE_VERSION,
            false,
        )
        expect(db.open).toHaveBeenCalledOnce()
    })

    it('fails closed when a native database exists but its encryption secret is missing', async () => {
        const { value } = gateway({ isDatabase: vi.fn().mockResolvedValue(true) })
        const runtime = createCapacitorSqliteRuntime({
            platform: 'native',
            gateway: value,
            randomSecret: () => 'must-not-be-used',
            prepareWebStore: vi.fn(),
        })

        await expect(runtime.connect()).rejects.toThrow('TALOS_CHAT_DB_KEY_MISSING')
        expect(value.setEncryptionSecret).not.toHaveBeenCalled()
        expect(value.createConnection).not.toHaveBeenCalled()
    })

    it('initializes the official web store once and persists writes without encryption calls', async () => {
        const { value } = gateway()
        const prepareWebStore = vi.fn().mockResolvedValue(undefined)
        const runtime = createCapacitorSqliteRuntime({
            platform: 'web',
            gateway: value,
            randomSecret: () => 'unused',
            prepareWebStore,
        })

        await runtime.connect()
        await runtime.connect()
        await runtime.persist()

        expect(prepareWebStore).toHaveBeenCalledOnce()
        expect(value.initWebStore).toHaveBeenCalledOnce()
        expect(value.setEncryptionSecret).not.toHaveBeenCalled()
        expect(value.createConnection).toHaveBeenCalledWith(
            TALOS_CHAT_DATABASE_NAME,
            false,
            'no-encryption',
            TALOS_CHAT_DATABASE_VERSION,
            false,
        )
        expect(value.saveToStore).toHaveBeenCalledOnce()
    })

    it('retrieves a consistent existing connection rather than creating a duplicate', async () => {
        const db = connection()
        vi.mocked(db.isOpen).mockResolvedValue(true)
        const { value } = gateway({
            isConnection: vi.fn().mockResolvedValue(true),
            retrieveConnection: vi.fn().mockResolvedValue(db),
        })
        const runtime = createCapacitorSqliteRuntime({
            platform: 'web',
            gateway: value,
            randomSecret: () => 'unused',
            prepareWebStore: vi.fn().mockResolvedValue(undefined),
        })

        await expect(runtime.connect()).resolves.toBe(db)
        expect(value.retrieveConnection).toHaveBeenCalledWith(TALOS_CHAT_DATABASE_NAME, false)
        expect(value.createConnection).not.toHaveBeenCalled()
        expect(db.open).not.toHaveBeenCalled()
    })
})
