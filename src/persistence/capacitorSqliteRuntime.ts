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
    /**
     * CR-CAND-01: upstream types this `Promise<capSQLiteChanges>` and runs the
     * import as three separate SQL transactions, so a resolved call is not
     * proof the rows landed. The count is the only evidence we get; discarding
     * it made a refused import look identical to a complete one.
     */
    importFromJson(payload: string): Promise<TalosSqlChanges>
    /** Upstream's own payload check, so a bad export is caught before anything is destroyed. */
    isJsonValid(payload: string): Promise<boolean>
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
        importFromJson: async (payload) => changes(await sqlite.importFromJson(payload)),
        isJsonValid: async (payload) => (await sqlite.isJsonValid(payload)).result === true,
        deleteDatabase: async (database) => {
            const link = await sqlite.retrieveConnection(database, false)
            await link.delete()
        },
        initWebStore: () => sqlite.initWebStore(),
        saveToStore: (database) => sqlite.saveToStore(database),
        closeConnection: (database, readonly) => sqlite.closeConnection(database, readonly),
    }
}

import { cifraGiornale, decifraGiornale, giornaleECifrato } from '@/persistence/giornaleMigrazione'

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
        /**
         * ⛔⛔⛔ SI SCRIVE DI FIANCO, SI RILEGGE, E SOLO ALLORA SI RINOMINA.
         *
         * Subito dopo questa chiamata il database viene DISTRUTTO. Prima era una
         * `writeFile` sola: l'API promette «scrivi un file», e non promette
         * niente su fsync, rinomina atomica o sincronizzazione della cartella.
         * Prima di una cancellazione irreversibile la garanzia va POSSEDUTA, non
         * dedotta dal fatto che una promessa si sia risolta.
         *
         * Tre passi, e ognuno toglie un modo di perdere i dati:
         *
         * ```
         * scrivi su .tmp    un file a metà non ha ancora il nome che conta
         * rileggi e CONFRONTA   la scrittura è arrivata davvero, e per intero
         * rinomina          il nome buono compare solo su un file completo
         * ```
         *
         * ⛔ La rilettura non è una fsync e non fa finta di esserlo: non prova
         * che i byte siano sul supporto. Prova che sono arrivati allo strato che
         * li serve, che è dove capitano il troncamento e la codifica sbagliata —
         * i modi in cui questa scrittura fallisce davvero. La garanzia piena
         * vuole codice nativo, ed è scritta come debito qui sotto, non spacciata
         * per fatta.
         *
         * ⛔ E se il confronto non torna si SOLLEVA. Chi chiama non cancella
         * niente, e la persona resta con il database che aveva.
         */
        persistMigration: async (payload) => {
            const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
            const provvisorio = `${MIGRATION_FILE}.tmp`
            await Filesystem.writeFile({
                path: provvisorio, data: payload, directory: Directory.Data, encoding: Encoding.UTF8,
            })
            const riletto = await Filesystem.readFile({
                path: provvisorio, directory: Directory.Data, encoding: Encoding.UTF8,
            })
            const testo = typeof riletto.data === 'string' ? riletto.data : await riletto.data.text()
            if (testo !== payload) {
                throw new Error(
                    'TALOS_DB_JOURNAL_UNVERIFIED: the migration journal did not read back as written,'
                    + ' so nothing was deleted.',
                )
            }
            /*
             * ⛔ La rinomina cancella il file di destinazione se c'e gia: un
             * giornale precedente rimasto li apparterrebbe a una migrazione
             * fallita, e tenerlo significherebbe riprendere quella invece di
             * questa. Ma si cancella DOPO che il nuovo e stato verificato, mai
             * prima.
             */
            await Filesystem.rename({
                from: provvisorio, to: MIGRATION_FILE,
                directory: Directory.Data, toDirectory: Directory.Data,
            })
        },
        /**
         * ⛔ NIENTE RITENTATIVI QUI DENTRO, ed è una conclusione, non una svista.
         *
         * Per un giorno intero questa lettura è sembrata il difetto: partiva a
         * 172 ms e tornava a 10.048 ms, tagliata di netto dal recinto da dieci
         * secondi del ponte. Ci ho scritto sopra un giro di richiami che
         * bussava finché il Filesystem non rispondeva, e funzionava.
         *
         * Non era sua la colpa. Capacitor esegue i metodi di **tutti** i plugin
         * su un thread solo, e il ponte ADB lo teneva occupato per dieci
         * secondi a ogni avvio: questa lettura stava semplicemente in coda
         * dietro di lui (la storia intera sta su `TalosFilaPonte`).
         *
         * Tolto il tappo vero, misurato sul telefono dell'owner: **12 ms**, con
         * la chiamata secca. Il giro di richiami è stato rimosso — un rimedio al
         * sintomo che sopravvive alla sua causa non è una difesa, è un posto
         * dove il prossimo blocco si nasconde invece di farsi vedere.
         */
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
            const { Filesystem, Directory } = await import('@capacitor/filesystem')
            /*
             * ⛔ Anche il provvisorio. Un .tmp rimasto indietro e una copia di
             * tutto il database che sopravvive alla migrazione che l'ha prodotta.
             */
            for (const nome of [MIGRATION_FILE, `${MIGRATION_FILE}.tmp`]) {
                try {
                    await Filesystem.deleteFile({ path: nome, directory: Directory.Data })
                } catch {
                    // Already gone: the migration is finished either way.
                }
            }
        },
        prepareWebStore: prepareOfficialWebStore,
    },
): TalosSqliteRuntime {
    let connection: TalosSqlConnection | null = null
    let connecting: Promise<TalosSqlConnection> | null = null

    /**
     * CR-CAND-01. Upstream gives two pieces of evidence and we now use both:
     * `isJsonValid` before touching anything, and the applied-change count
     * afterwards. `importFromJson` runs as three separate SQL transactions, so
     * resolving is not the same as succeeding.
     *
     * A negative count is the plugin's documented error sentinel. An absent
     * count is not treated as failure: refusing on missing evidence would lock
     * a user out of a database that is perfectly fine, and locking someone out
     * of their own chats is its own kind of data loss.
     */
    async function applyMigrationPayload(payload: string): Promise<void> {
        if (!await options.gateway.isJsonValid(payload)) {
            throw new Error('the exported payload is not a database the plugin will accept')
        }
        const applied = await options.gateway.importFromJson(payload)
        if (applied.changes < 0) {
            throw new Error(`the import reported ${applied.changes} applied changes`)
        }
    }

    /**
     * A pending migration is data that exists ONLY in that file. Either it goes
     * back into the database or the boot stops here — there is no third branch
     * where we carry on with an empty store and hope someone notices.
     */
    async function resumeMigration(payload: string): Promise<void> {
        try {
            await applyMigrationPayload(payload)
        } catch (error) {
            throw new Error(
                `TALOS_DB_MIGRATION_PENDING: your data is safe in the migration file but could not be restored (${String(error)}). `
                + 'TALOS will not open a new database over it. Retrying re-reads the same file, so the attempt is safe to repeat.',
            )
        }
        await options.clearMigration()
    }

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
        //
        // CR-CAND-01: this used to swallow a failed resume and walk on. The
        // next few lines then created a database — an EMPTY one, over the only
        // copy of the user's chats. The file survived, but nothing surfaced it:
        // what you saw was an app that had forgotten everything, silently.
        //
        // A pending migration is now a hard stop. While one exists, no
        // replacement database may be created under any circumstances.
        if (options.platform === 'native') {
            const pending = await options.readMigration()
            if (pending) {
                /*
                 * ⛔⛔ La chiave si chiede SOLO se il giornale e cifrato.
                 *
                 * Risolverla a ogni avvio potrebbe far comparire la richiesta del
                 * PIN dove oggi non compare, e un giornale in sospeso e raro.
                 * Quando c'e ed e cifrato, invece, la persona deve comunque
                 * sbloccare: il database che sta per tornare dentro e protetto
                 * dalla stessa chiave.
                 *
                 * ⛔ E un giornale VECCHIO in chiaro passa di qui INTATTO. Chi
                 * aggiorna TALOS con una migrazione a meta ha il database gia
                 * distrutto: non saperlo leggere sarebbe la perdita di tutte le
                 * sue chat durante un aggiornamento fatto per proteggerle.
                 */
                const chiaro = giornaleECifrato(pending)
                    ? await decifraGiornale(pending, (await options.secret()).secret)
                    : pending
                await resumeMigration(chiaro)
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
            // CR-CAND-01: everything below this line is irreversible. Ask the
            // plugin whether it would accept this payload back BEFORE handing
            // it the delete. Failing here is safe — the user simply keeps the
            // database they already have.
            let importable = false
            try {
                importable = await options.gateway.isJsonValid(payload)
            } catch {
                importable = false
            }
            if (!importable) {
                throw new Error(
                    'TALOS_DB_ADOPT_FAILED: the export could not be validated, so nothing was deleted. Your database is untouched.',
                )
            }
            // SF-CRITICAL: the export used to live in this local variable alone.
            // Android kills backgrounded apps freely, and this runs while the
            // user waits on a modal — a kill between the delete and the import
            // destroyed every chat with the only copy in RAM. It goes to disk
            // first, and `establish()` resumes from it on the next launch.
            /*
             * ⛔ CIFRATO. Il giornale e una copia dell'INTERO database: in chiaro
             * abbassava, per la durata della migrazione, la protezione che l'app
             * mantiene tutto il resto del tempo. La chiave e quella NUOVA —
             * l'unica che esista ancora quando il giornale va riletto.
             */
            await options.persistMigration(await cifraGiornale(payload, secret))
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
                await applyMigrationPayload(payload)
            } catch (error) {
                throw new Error(`TALOS_DB_ADOPT_FAILED: ${String(error)} — your data is safe in the migration file and will be restored on the next launch.`)
            }
            await options.clearMigration()
        },
    }
}

export type { TalosSqlValue }
