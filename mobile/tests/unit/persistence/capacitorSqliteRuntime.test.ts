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

// Debt S1: the migration payload is written to disk before the database is
// destroyed, so the runtime needs somewhere to put it. In tests that is memory.
function migration() {
    let stored: string | null = null
    return {
        persistMigration: vi.fn(async (payload: string) => { stored = payload }),
        readMigration: vi.fn(async () => stored),
        clearMigration: vi.fn(async () => { stored = null }),
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
        clearEncryptionSecret: vi.fn().mockResolvedValue(undefined),
        exportToJson: vi.fn().mockResolvedValue({ database: 'talos', tables: [] }),
        importFromJson: vi.fn().mockResolvedValue({ changes: 1 }),
        deleteDatabase: vi.fn().mockResolvedValue(undefined),
        initWebStore: vi.fn().mockResolvedValue(undefined),
        saveToStore: vi.fn().mockResolvedValue(undefined),
        closeConnection: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    }
    return { value, db }
}

describe('createCapacitorSqliteRuntime', () => {
    // Debt S1 — the database key is now the PIN-wrapped one. These pin the
    // contract the lock depends on: the runtime asks for a key instead of
    // minting one, refuses to invent a key over an existing database, forgets
    // the secret when the app re-locks, and can move a legacy database (whose
    // secret the plugin holds and we cannot read) onto a key we DO manage.
    it('S1: asks the key provider instead of generating its own secret', async () => {
        const { value } = gateway()
        const secret = vi.fn().mockResolvedValue({ secret: 'a'.repeat(64), fresh: true })
        const runtime = createCapacitorSqliteRuntime({
            platform: 'native', gateway: value, secret, prepareWebStore: vi.fn(), ...migration(),
        })
        await runtime.connect()
        expect(secret).toHaveBeenCalledTimes(1)
        expect(value.setEncryptionSecret).toHaveBeenCalledWith('a'.repeat(64))
    })

    it('S1: a locked key rejects the connection instead of opening an empty database', async () => {
        const { value } = gateway()
        const runtime = createCapacitorSqliteRuntime({
            platform: 'native',
            gateway: value,
            secret: vi.fn().mockRejectedValue(new Error('TALOS_DB_KEY_LOCKED: protected')),
            prepareWebStore: vi.fn(), ...migration(),
        })
        await expect(runtime.connect()).rejects.toThrow(/TALOS_DB_KEY_LOCKED/)
        expect(value.createConnection).not.toHaveBeenCalled()
    })

    it('S1: refuses to mint a FRESH key over a database that already exists', async () => {
        const { value } = gateway({ isDatabase: vi.fn().mockResolvedValue(true) })
        const runtime = createCapacitorSqliteRuntime({
            platform: 'native',
            gateway: value,
            secret: vi.fn().mockResolvedValue({ secret: 'b'.repeat(64), fresh: true }),
            prepareWebStore: vi.fn(), ...migration(),
        })
        await expect(runtime.connect()).rejects.toThrow(/TALOS_CHAT_DB_KEY_MISSING/)
        expect(value.setEncryptionSecret).not.toHaveBeenCalled()
    })

    it('S1: forgetSecret closes the database AND clears the stored secret', async () => {
        const { value, db } = gateway()
        db.isOpen = vi.fn().mockResolvedValue(true)
        const runtime = createCapacitorSqliteRuntime({
            platform: 'native',
            gateway: value,
            secret: vi.fn().mockResolvedValue({ secret: 'c'.repeat(64), fresh: true }),
            prepareWebStore: vi.fn(), ...migration(),
        })
        await runtime.connect()
        await runtime.forgetSecret()
        expect(db.close).toHaveBeenCalled()
        // Leaving the secret behind would keep the database openable without
        // the PIN — the whole point of the debt.
        expect(value.clearEncryptionSecret).toHaveBeenCalled()
    })

    it('S1: adopts a legacy database onto a managed key via export/import', async () => {
        const { value, db } = gateway({ isSecretStored: vi.fn().mockResolvedValue(true), isDatabase: vi.fn().mockResolvedValue(true) })
        db.isOpen = vi.fn().mockResolvedValue(true)
        const runtime = createCapacitorSqliteRuntime({
            platform: 'native',
            gateway: value,
            secret: vi.fn().mockResolvedValue({ secret: 'd'.repeat(64), fresh: false }),
            prepareWebStore: vi.fn(), ...migration(),
        })
        await runtime.connect()
        await runtime.adoptManagedSecret('e'.repeat(64))
        // The old secret cannot be read, so the data is exported, the database
        // is destroyed and rebuilt under the key we control.
        expect(value.exportToJson).toHaveBeenCalled()
        expect(value.clearEncryptionSecret).toHaveBeenCalled()
        expect(value.setEncryptionSecret).toHaveBeenCalledWith('e'.repeat(64))
        expect(value.importFromJson).toHaveBeenCalled()
    })

    it('S1: a failed import keeps the exported data on disk for the next launch', async () => {
        const { value, db } = gateway({
            isSecretStored: vi.fn().mockResolvedValue(true),
            isDatabase: vi.fn().mockResolvedValue(true),
            importFromJson: vi.fn().mockRejectedValue(new Error('boom')),
        })
        db.isOpen = vi.fn().mockResolvedValue(true)
        const seams = migration()
        const runtime = createCapacitorSqliteRuntime({
            platform: 'native',
            gateway: value,
            secret: vi.fn().mockResolvedValue({ secret: 'f'.repeat(64), fresh: false }),
            prepareWebStore: vi.fn(),
            ...seams,
        })
        await runtime.connect()
        await expect(runtime.adoptManagedSecret('g'.repeat(64))).rejects.toThrow(/TALOS_DB_ADOPT_FAILED/)
        // The payload must still be readable: a kill or a failure here used to
        // destroy every chat with the only copy in a local variable.
        expect(await seams.readMigration()).toContain('talos')
        expect(seams.clearMigration).not.toHaveBeenCalled()
    })

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
            secret: async () => ({ secret: 'generated-secret', fresh: true }),
            prepareWebStore: vi.fn(), ...migration(),
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
            secret: async () => ({ secret: 'must-not-be-used', fresh: true }),
            prepareWebStore: vi.fn(), ...migration(),
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
            secret: async () => ({ secret: 'unused', fresh: true }),
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
            secret: async () => ({ secret: 'unused', fresh: true }),
            prepareWebStore: vi.fn().mockResolvedValue(undefined),
        })

        await expect(runtime.connect()).resolves.toBe(db)
        expect(value.retrieveConnection).toHaveBeenCalledWith(TALOS_CHAT_DATABASE_NAME, false)
        expect(value.createConnection).not.toHaveBeenCalled()
        expect(db.open).not.toHaveBeenCalled()
    })
})
