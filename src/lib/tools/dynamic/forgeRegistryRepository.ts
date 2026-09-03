import { talosSqliteRuntime } from '@/services/databaseProtection'
import type { TalosSqlConnection, TalosSqlRow } from '@/persistence/sqliteTypes'
import type { TalosLocalToolManifestV1 } from './contracts'
import { validateTalosLocalTool } from './validator'

/**
 * ⛔⛔⛔ Owner 2026-08-27 — Tool Forge Fase 3, sostituisce `registryStore.ts`
 * (Capacitor Preferences). Finding critico della revisione, confermato
 * leggendo il vecchio codice: `Preferences.get` → `JSON.parse` → muta la
 * copia in memoria → `Preferences.set` dell'INTERO envelope, senza lock.
 * Due `install`/`rollback` in corsa vedono lo stesso stato di partenza;
 * l'ultimo `write()` vince — un lost update da manuale (Android
 * SharedPreferences, su cui Preferences si appoggia, non garantisce
 * consistenza multi-thread sul ciclo read-modify-write).
 *
 * Ora tre tabelle nello STESSO database cifrato della chat
 * (`chatDatabaseSchema.ts` v8), con transazioni vere — stessa
 * `transaction()` serializzata di `sqliteChatRepository.ts`: un solo
 * scrittore alla volta, mai due `BEGIN` in corsa.
 *
 * Stessa connessione della chat, non una seconda: `talosSqliteRuntime()`
 * (nuovo getter in `databaseProtection.ts`) restituisce quella già
 * registrata da `createProductionChatRepository()`, così il registro del
 * Forge partecipa correttamente al ciclo del lock (`relockTalosDatabase`)
 * invece di restare con una connessione che il lock non conosce.
 */

export interface ForgeInstalledRecord {
    manifest: TalosLocalToolManifestV1
    enabled: boolean
    installedAt: string
    previousVersions: TalosLocalToolManifestV1[]
}

export interface ForgeAuditEntry {
    kind: ForgeAuditKind
    detail: Record<string, unknown>
    at: string
}

/** Stessa politica di prima (`previousVersions.slice(-10)`), ora una vera
 * riga per versione invece di un array dentro il JSON. */
const MAX_KEPT_VERSIONS = 10
/** Owner 2026-08-27, confrontando col pacchetto "hardened final": un tetto
 * di buon senso sul NUMERO di tool installati, mai imposto prima. */
const MAX_INSTALLED_TOOLS = 64

async function connection(): Promise<TalosSqlConnection> {
    const runtime = talosSqliteRuntime()
    if (!runtime) throw new Error('TALOS_FORGE_DB_UNAVAILABLE')
    return runtime.connect()
}

// SF-6 style, come sqliteChatRepository.ts: un solo scrittore alla volta,
// mai "transaction within a transaction".
let writeQueue: Promise<unknown> = Promise.resolve()

async function transaction<T>(operation: (db: TalosSqlConnection) => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
        const db = await connection()
        await db.beginTransaction()
        try {
            const result = await operation(db)
            await db.commitTransaction()
            await talosSqliteRuntime()?.persist()
            return result
        } catch (error) {
            try {
                await db.rollbackTransaction()
            } catch {
                // Preserva l'errore di scrittura originale; un rollback
                // fallito è un problema del runtime, non di questa riga.
            }
            throw error
        }
    }
    const chained = writeQueue.then(run, run)
    writeQueue = chained.catch(() => undefined)
    return chained
}

/**
 * ⛔⛔ Owner 2026-08-27, Fase 7 (avversariale — registro corrotto): prima
 * era `JSON.parse` nudo. Un manifest genuinamente TRONCATO/corrotto sul
 * disco (non "sintatticamente valido ma semanticamente sbagliato" — quello
 * lo prende già `validateTalosLocalTool` — proprio JSON rotto) lanciava un
 * `SyntaxError` che NESSUNO dei chiamanti (`loadRecord`, `loadVersions`)
 * catturava: si sarebbe propagato fuori da `listForgeTools`/`getForgeTool`
 * come un'eccezione non gestita invece di un record scartato. Stesso
 * principio del fuzzing (ricerca 2026): input malformato si rifiuta con
 * pulizia, non fa esplodere il chiamante.
 */
function parseManifest(json: string): TalosLocalToolManifestV1 | null {
    try {
        return JSON.parse(json) as TalosLocalToolManifestV1
    } catch {
        return null
    }
}

async function loadVersions(db: TalosSqlConnection, toolId: string): Promise<TalosLocalToolManifestV1[]> {
    const rows = await db.query(
        'SELECT manifest_json FROM talos_forge_tool_versions WHERE tool_id = ? ORDER BY version ASC',
        [toolId],
    )
    // Una versione corrotta viene scartata, non fa fallire la lettura
    // dell'intera storia — le altre versioni, e il record corrente, restano leggibili.
    return rows
        .map((row) => parseManifest(String((row as TalosSqlRow).manifest_json)))
        .filter((manifest): manifest is TalosLocalToolManifestV1 => manifest !== null)
}

async function loadRecord(db: TalosSqlConnection, toolId: string): Promise<ForgeInstalledRecord | null> {
    const rows = await db.query(
        'SELECT id, manifest_json, enabled, installed_at FROM talos_forge_tools WHERE id = ? LIMIT 1',
        [toolId],
    )
    if (rows.length !== 1) return null
    const row = rows[0] as TalosSqlRow
    // ⛔ Rivalidato alla LETTURA, non solo alla scrittura — un manifest
    // scritto da una versione precedente del validator (o corrotto sul
    // disco) non deve tornare "valido" solo perché passò l'installazione.
    const manifest = parseManifest(String(row.manifest_json))
    if (!manifest || row.id !== manifest.id || !validateTalosLocalTool(manifest).ok) return null
    return {
        manifest,
        enabled: Number(row.enabled) === 1,
        installedAt: String(row.installed_at),
        previousVersions: await loadVersions(db, toolId),
    }
}

export type ForgeAuditKind = 'install' | 'enable' | 'disable' | 'rollback' | 'remove'

/** APPEND-ONLY (mai UPDATE, mai DELETE) — stesso principio di
 * `talos_research_events`: install/enable/disable/rollback/remove
 * lasciano una traccia che sopravvive al processo, che con Preferences
 * non esisteva affatto. */
async function audit(db: TalosSqlConnection, toolId: string, kind: ForgeAuditKind, detail: Record<string, unknown> = {}): Promise<void> {
    await db.run(
        'INSERT INTO talos_forge_audit (id, tool_id, kind, detail_json, at) VALUES (?, ?, ?, ?, ?)',
        [`forge-audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, toolId, kind, JSON.stringify(detail), new Date().toISOString()],
    )
}

export async function listForgeTools(): Promise<ForgeInstalledRecord[]> {
    const db = await connection()
    const rows = await db.query('SELECT id FROM talos_forge_tools')
    const records: ForgeInstalledRecord[] = []
    for (const row of rows) {
        const record = await loadRecord(db, String((row as TalosSqlRow).id))
        if (record) records.push(record)
    }
    return records.sort((a, b) => a.manifest.title.localeCompare(b.manifest.title))
}

export async function getForgeTool(id: string): Promise<ForgeInstalledRecord | null> {
    return loadRecord(await connection(), id)
}

export async function installForgeTool(manifest: TalosLocalToolManifestV1, now = new Date().toISOString()): Promise<void> {
    const validation = validateTalosLocalTool(manifest)
    if (!validation.ok) throw new Error('TALOS_FORGE_INSTALL_INVALID')
    await transaction(async (db) => {
        const existingRows = await db.query('SELECT manifest_json, version FROM talos_forge_tools WHERE id = ? LIMIT 1', [manifest.id])
        const existing = existingRows[0] as TalosSqlRow | undefined
        if (existing && manifest.version <= Number(existing.version)) throw new Error('TALOS_FORGE_VERSION_NOT_NEWER')
        // ⛔ Owner 2026-08-27 — confrontando col pacchetto "hardened final"
        // dell'owner: nessun tetto al NUMERO di tool installabili. Un
        // registro senza limite non è pericoloso di per sé (ogni tool
        // resta comunque validato/disabilitato di default), ma è un
        // ceiling di buon senso mai imposto — la stessa disciplina già
        // applicata a byte/nodi/transizioni di un SINGOLO manifest, qui
        // sull'INSIEME. Solo per un tool NUOVO: sostituire una versione
        // esistente non deve mai bloccarsi contro il proprio stesso tetto.
        if (!existing) {
            const countRow = (await db.query('SELECT COUNT(*) AS n FROM talos_forge_tools'))[0] as TalosSqlRow
            if (Number(countRow.n) >= MAX_INSTALLED_TOOLS) throw new Error('TALOS_FORGE_REGISTRY_FULL')
        }
        if (existing) {
            // La versione RIMPIAZZATA diventa una riga vera in
            // talos_forge_tool_versions, non un array in memoria.
            await db.run(
                'INSERT INTO talos_forge_tool_versions (tool_id, version, manifest_json, replaced_at) VALUES (?, ?, ?, ?)',
                [manifest.id, Number(existing.version), String(existing.manifest_json), now],
            )
            // Stessa ritenzione di prima (.slice(-10)) — ora una DELETE, non
            // un accorgimento in memoria che si perde a ogni riavvio.
            await db.run(
                `DELETE FROM talos_forge_tool_versions WHERE tool_id = ? AND version NOT IN (
                    SELECT version FROM talos_forge_tool_versions WHERE tool_id = ? ORDER BY version DESC LIMIT ?
                )`,
                [manifest.id, manifest.id, MAX_KEPT_VERSIONS],
            )
            await db.run(
                'UPDATE talos_forge_tools SET manifest_json = ?, version = ?, enabled = 0, updated_at = ? WHERE id = ?',
                [JSON.stringify(manifest), manifest.version, now, manifest.id],
            )
        } else {
            await db.run(
                'INSERT INTO talos_forge_tools (id, manifest_json, version, enabled, installed_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)',
                [manifest.id, JSON.stringify(manifest), manifest.version, now, now],
            )
        }
        await audit(db, manifest.id, 'install', { version: manifest.version })
    })
}

export async function setForgeToolEnabled(id: string, enabled: boolean): Promise<void> {
    await transaction(async (db) => {
        const exists = await db.query('SELECT id FROM talos_forge_tools WHERE id = ? LIMIT 1', [id])
        if (exists.length !== 1) throw new Error('TALOS_FORGE_NOT_INSTALLED')
        await db.run(
            'UPDATE talos_forge_tools SET enabled = ?, updated_at = ? WHERE id = ?',
            [enabled ? 1 : 0, new Date().toISOString(), id],
        )
        await audit(db, id, enabled ? 'enable' : 'disable')
    })
}

export async function rollbackForgeTool(id: string): Promise<void> {
    await transaction(async (db) => {
        const exists = await db.query('SELECT id FROM talos_forge_tools WHERE id = ? LIMIT 1', [id])
        if (exists.length !== 1) throw new Error('TALOS_FORGE_NOT_INSTALLED')
        const versionRows = await db.query(
            'SELECT version, manifest_json FROM talos_forge_tool_versions WHERE tool_id = ? ORDER BY version DESC LIMIT 1',
            [id],
        )
        if (versionRows.length !== 1) throw new Error('TALOS_FORGE_NO_ROLLBACK')
        const previous = versionRows[0] as TalosSqlRow
        await db.run('DELETE FROM talos_forge_tool_versions WHERE tool_id = ? AND version = ?', [id, Number(previous.version)])
        await db.run(
            'UPDATE talos_forge_tools SET manifest_json = ?, version = ?, enabled = 0, updated_at = ? WHERE id = ?',
            [String(previous.manifest_json), Number(previous.version), new Date().toISOString(), id],
        )
        await audit(db, id, 'rollback', { toVersion: previous.version })
    })
}

export async function removeForgeTool(id: string): Promise<void> {
    await transaction(async (db) => {
        // ON DELETE CASCADE (talos_forge_tool_versions.tool_id) porta via
        // anche la storia — rimuovere un tool rimuove tutto quello che gli
        // appartiene, non solo la riga corrente.
        const result = await db.run('DELETE FROM talos_forge_tools WHERE id = ?', [id])
        if (result.changes > 0) await audit(db, id, 'remove')
    })
}

/**
 * ⛔ Owner 2026-08-27, Fase 6 — la tabella era scritta da Fase 3
 * (`audit()` sopra) ma mai riletta: la stazione UI ha bisogno di mostrare
 * la storia vera, non solo di lasciarla accumularsi inosservata. `rowid`,
 * non `at` — lo stesso motivo del test di Fase 3: scritture abbastanza
 * vicine condividono lo stesso millisecondo, e SQL non garantisce alcun
 * ordine fra chiavi uguali; `rowid` è l'ordine di inserimento vero, sempre
 * univoco. Più recente prima, per la lettura a schermo.
 */
export async function listForgeAudit(toolId: string): Promise<ForgeAuditEntry[]> {
    const db = await connection()
    const rows = await db.query(
        'SELECT kind, detail_json, at FROM talos_forge_audit WHERE tool_id = ? ORDER BY rowid DESC',
        [toolId],
    )
    return rows.map((row) => {
        const typed = row as TalosSqlRow
        return { kind: String(typed.kind) as ForgeAuditKind, detail: JSON.parse(String(typed.detail_json)) as Record<string, unknown>, at: String(typed.at) }
    })
}
