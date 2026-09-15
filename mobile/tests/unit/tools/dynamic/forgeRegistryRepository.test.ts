// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { registerTalosSqliteRuntime } from '@/services/databaseProtection'
import { TALOS_CHAT_DATABASE_UPGRADES } from '@/persistence/chatDatabaseSchema'
import type { TalosSqlConnection, TalosSqliteRuntime } from '@/persistence/sqliteTypes'
import { createSqlJsConnection } from '../../repositories/sqlJsConnection'
import {
    getForgeTool, installForgeTool, listForgeAudit, listForgeTools, removeForgeTool,
    rollbackForgeTool, setForgeToolEnabled,
} from '@/lib/tools/dynamic/forgeRegistryRepository'
import type { TalosLocalToolManifestV1 } from '@/lib/tools/dynamic/contracts'

/**
 * ⛔⛔⛔ Owner 2026-08-27 — Tool Forge Fase 3. Contro un motore SQLite VERO
 * (sql.js, già usato da `sqliteChatRepository.engine.test.ts` per la
 * stessa ragione): un mock che restituisce righe accodate a prescindere
 * dall'SQL avrebbe fatto passare un JOIN sbagliato o un typo di colonna.
 * Applica le migrazioni REALI (`TALOS_CHAT_DATABASE_UPGRADES`, che ora
 * include la v8 col registro del Forge) — se lo schema e il repository
 * divergono, questi test lo scoprono, non un utente sul dispositivo.
 */

let connection: (TalosSqlConnection & { close(): void }) | null = null

function manifest(id: string, version = 1): TalosLocalToolManifestV1 {
    return {
        schema: 'talos.local-tool.v1', id, version, title: `Tool ${id}`,
        description: 'test manifest', createdAt: new Date().toISOString(), parentVersion: null,
        execution: 'declarative-flow', installScope: 'device',
        network: { mode: 'forbidden', domains: [] }, credentialRequirements: [],
        flow: {
            entry: 'ret', maxTransitions: 8,
            nodes: [{ id: 'ret', type: 'return', value: version }],
        },
    }
}

beforeEach(async () => {
    connection = await createSqlJsConnection()
    for (const upgrade of TALOS_CHAT_DATABASE_UPGRADES) {
        for (const statement of upgrade.statements) await connection.execute(statement)
    }
    const runtime: TalosSqliteRuntime = {
        platform: 'web',
        connect: async () => connection!,
        persist: async () => undefined,
        close: async () => undefined,
    }
    registerTalosSqliteRuntime(runtime)
})

afterEach(() => {
    registerTalosSqliteRuntime(null)
    connection?.close()
    connection = null
})

describe('forgeRegistryRepository — install/list/get', () => {
    it('un tool nuovo appare disabilitato, senza versioni precedenti', async () => {
        await installForgeTool(manifest('tool-a'))
        const record = await getForgeTool('tool-a')
        expect(record?.enabled).toBe(false)
        expect(record?.previousVersions).toEqual([])
        expect(record?.manifest.version).toBe(1)
    })

    it('listForgeTools ordina per titolo, non per data', async () => {
        await installForgeTool(manifest('tool-b')) // "Tool b"
        await installForgeTool(manifest('tool-a')) // "Tool a"
        const tools = await listForgeTools()
        expect(tools.map((t) => t.manifest.id)).toEqual(['tool-a', 'tool-b'])
    })

    it('rifiuta un manifest non valido prima di toccare il database', async () => {
        const broken = manifest('tool-c'); (broken as any).schema = 'wrong'
        await expect(installForgeTool(broken)).rejects.toThrow('TALOS_FORGE_INSTALL_INVALID')
        expect(await getForgeTool('tool-c')).toBeNull()
    })

    it('rifiuta una versione non più nuova di quella installata', async () => {
        await installForgeTool(manifest('tool-a', 2))
        await expect(installForgeTool(manifest('tool-a', 2))).rejects.toThrow('TALOS_FORGE_VERSION_NOT_NEWER')
        await expect(installForgeTool(manifest('tool-a', 1))).rejects.toThrow('TALOS_FORGE_VERSION_NOT_NEWER')
    })

    it('installare una versione più nuova archivia quella vecchia come RIGA VERA, e disabilita di nuovo', async () => {
        await installForgeTool(manifest('tool-a', 1))
        await setForgeToolEnabled('tool-a', true)
        await installForgeTool(manifest('tool-a', 2))
        const record = await getForgeTool('tool-a')
        expect(record?.manifest.version).toBe(2)
        expect(record?.enabled).toBe(false) // un nuovo install torna sempre disabilitato
        expect(record?.previousVersions.map((m) => m.version)).toEqual([1])
    })

    it('tiene solo le ultime 10 versioni — stessa ritenzione di prima, ora con una DELETE reale', async () => {
        for (let v = 1; v <= 12; v++) await installForgeTool(manifest('tool-a', v))
        const record = await getForgeTool('tool-a')
        expect(record?.previousVersions).toHaveLength(10)
        expect(record?.previousVersions.map((m) => m.version)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    })

    /**
     * ⛔ Owner 2026-08-27, confrontando col pacchetto "hardened final":
     * nessun tetto sul NUMERO di tool installati, mai imposto prima.
     */
    it('rifiuta il 65-esimo tool NUOVO (TALOS_FORGE_REGISTRY_FULL), ma una nuova versione di uno ESISTENTE non conta contro il tetto', async () => {
        for (let i = 0; i < 64; i++) await installForgeTool(manifest(`tool-${i}`))
        await expect(installForgeTool(manifest('tool-65'))).rejects.toThrow('TALOS_FORGE_REGISTRY_FULL')
        // Il tetto vale per i NUOVI tool, non per aggiornare uno che c'è già.
        await expect(installForgeTool(manifest('tool-0', 2))).resolves.toBeUndefined()
    })
})

describe('forgeRegistryRepository — enable/disable', () => {
    it('abilita e disabilita, e scrive un evento di audit per ciascuno', async () => {
        await installForgeTool(manifest('tool-a'))
        await setForgeToolEnabled('tool-a', true)
        expect((await getForgeTool('tool-a'))?.enabled).toBe(true)
        await setForgeToolEnabled('tool-a', false)
        expect((await getForgeTool('tool-a'))?.enabled).toBe(false)
        // ⛔ `rowid`, non `at`: la prima versione di questo test ordinava per
        // timestamp e falliva a intermittenza — tre scritture così vicine
        // possono condividere la STESSA stringa ISO al millisecondo, e SQL
        // non garantisce nessun ordine fra chiavi di ordinamento uguali.
        // `rowid` è l'ordine di inserimento vero, sempre univoco.
        const audit = await connection!.query('SELECT kind FROM talos_forge_audit WHERE tool_id = ? ORDER BY rowid ASC', ['tool-a'])
        expect(audit.map((row: any) => row.kind)).toEqual(['install', 'enable', 'disable'])
    })

    it('rifiuta enable/disable su un id mai installato', async () => {
        await expect(setForgeToolEnabled('ghost', true)).rejects.toThrow('TALOS_FORGE_NOT_INSTALLED')
    })
})

describe('forgeRegistryRepository — rollback', () => {
    it('torna alla versione precedente e la toglie dalla storia', async () => {
        await installForgeTool(manifest('tool-a', 1))
        await installForgeTool(manifest('tool-a', 2))
        await rollbackForgeTool('tool-a')
        const record = await getForgeTool('tool-a')
        expect(record?.manifest.version).toBe(1)
        expect(record?.previousVersions).toEqual([])
        expect(record?.enabled).toBe(false)
    })

    it('rifiuta il rollback quando non c\'è nessuna versione precedente', async () => {
        await installForgeTool(manifest('tool-a', 1))
        await expect(rollbackForgeTool('tool-a')).rejects.toThrow('TALOS_FORGE_NO_ROLLBACK')
    })
})

describe('forgeRegistryRepository — remove', () => {
    it('rimuove il tool E la sua storia (ON DELETE CASCADE), non solo la riga corrente', async () => {
        await installForgeTool(manifest('tool-a', 1))
        await installForgeTool(manifest('tool-a', 2))
        await removeForgeTool('tool-a')
        expect(await getForgeTool('tool-a')).toBeNull()
        const versions = await connection!.query('SELECT * FROM talos_forge_tool_versions WHERE tool_id = ?', ['tool-a'])
        expect(versions).toHaveLength(0)
    })

    it('rimuovere un id inesistente non lancia e non scrive un evento di audit fantasma', async () => {
        await expect(removeForgeTool('ghost')).resolves.toBeUndefined()
        const audit = await connection!.query('SELECT * FROM talos_forge_audit WHERE tool_id = ?', ['ghost'])
        expect(audit).toHaveLength(0)
    })
})

describe('forgeRegistryRepository — rilettura rivalida, non si fida solo della scrittura', () => {
    it('un manifest corrotto sul disco (scrittura diretta, non tramite installForgeTool) non torna come valido', async () => {
        const now = new Date().toISOString()
        await connection!.run(
            'INSERT INTO talos_forge_tools (id, manifest_json, version, enabled, installed_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)',
            ['corrupt', '{"not":"a manifest"}', 1, now, now],
        )
        expect(await getForgeTool('corrupt')).toBeNull()
        expect(await listForgeTools()).toEqual([])
    })

    /**
     * ⛔⛔⛔ Fase 7 (avversariale — registro corrotto), trovato progettando
     * questo test, non ipotizzato: `parseManifest` era `JSON.parse` nudo.
     * Un manifest genuinamente TRONCATO (non "sintatticamente valido ma
     * semanticamente sbagliato", quello sopra) lanciava un `SyntaxError`
     * che NESSUN chiamante catturava — si sarebbe propagato fuori da
     * `listForgeTools`/`getForgeTool` come un'eccezione non gestita.
     * Corretto in `parseManifest` (try/catch → null, scartato come
     * qualunque altro manifest non valido).
     */
    it('JSON genuinamente TRONCATO (non solo semanticamente sbagliato) non fa esplodere la lettura', async () => {
        const now = new Date().toISOString()
        await connection!.run(
            'INSERT INTO talos_forge_tools (id, manifest_json, version, enabled, installed_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)',
            ['truncated', '{"schema":"talos.local-tool.v1","id":"tru', 1, now, now],
        )
        await expect(getForgeTool('truncated')).resolves.toBeNull()
        await expect(listForgeTools()).resolves.toEqual([])
    })

    it('una VERSIONE precedente con JSON troncato viene scartata dalla storia, senza far fallire il record corrente', async () => {
        await installForgeTool(manifest('tool-a', 1))
        await installForgeTool(manifest('tool-a', 2))
        // Corrompe la riga di storia che `installForgeTool` ha appena
        // archiviato per la v1, scrivendo sopra direttamente.
        await connection!.run(
            'UPDATE talos_forge_tool_versions SET manifest_json = ? WHERE tool_id = ? AND version = ?',
            ['{not even json', 'tool-a', 1],
        )
        const record = await getForgeTool('tool-a')
        expect(record?.manifest.version).toBe(2) // il record corrente resta leggibile
        expect(record?.previousVersions).toEqual([]) // la versione corrotta è scartata, non fa fallire tutto
    })

    it('il CHECK dello schema rifiuta un `enabled` fuori da {0,1} — l\'invariante è del database, non solo del codice sopra', async () => {
        const now = new Date().toISOString()
        await expect(connection!.run(
            'INSERT INTO talos_forge_tools (id, manifest_json, version, enabled, installed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
            ['bad-enabled', JSON.stringify(manifest('bad-enabled')), 1, 2, now, now],
        )).rejects.toThrow()
    })

    it('il registro d\'audit SOPRAVVIVE alla rimozione del tool — l\'unica traccia che "questo È STATO installato" dopo che è sparito', async () => {
        await installForgeTool(manifest('tool-a'))
        await removeForgeTool('tool-a')
        const audit = await connection!.query('SELECT kind FROM talos_forge_audit WHERE tool_id = ? ORDER BY rowid ASC', ['tool-a'])
        expect(audit.map((row: any) => row.kind)).toEqual(['install', 'remove'])
    })
})

describe('forgeRegistryRepository — concorrenza oltre Fase 3 (avversariale, Fase 7)', () => {
    it('rollback e remove concorrenti sullo STESSO tool non lasciano uno stato a metà: il risultato finale è SEMPRE leggibile in modo pulito', async () => {
        await installForgeTool(manifest('tool-a', 1))
        await installForgeTool(manifest('tool-a', 2))
        await Promise.all([
            rollbackForgeTool('tool-a').catch(() => undefined),
            removeForgeTool('tool-a').catch(() => undefined),
        ])
        // Qualunque sia l'ordine in cui la coda serializzata li ha
        // eseguiti — mai un'eccezione non gestita, e lo stato finale è
        // O completamente rimosso, O un record valido, MAI una via di
        // mezzo corrotta (`getForgeTool` non lancia in nessun caso).
        const after = await getForgeTool('tool-a')
        if (after) {
            expect(after.manifest.version).toBeGreaterThan(0)
        } else {
            const versions = await connection!.query('SELECT * FROM talos_forge_tool_versions WHERE tool_id = ?', ['tool-a'])
            expect(versions).toHaveLength(0) // rimosso vuol dire rimosso DAVVERO, CASCADE incluso
        }
    })

    it('due install della STESSA versione in corsa: uno vince, l\'altro riceve TALOS_FORGE_VERSION_NOT_NEWER — la coda serializzata previene un lost update, non solo lo dichiara', async () => {
        await installForgeTool(manifest('tool-a', 1))
        const results = await Promise.allSettled([
            installForgeTool(manifest('tool-a', 2)),
            installForgeTool(manifest('tool-a', 2)),
        ])
        const fulfilled = results.filter((r) => r.status === 'fulfilled')
        const rejected = results.filter((r) => r.status === 'rejected')
        expect(fulfilled).toHaveLength(1)
        expect(rejected).toHaveLength(1)
        expect(String((rejected[0] as PromiseRejectedResult).reason)).toContain('TALOS_FORGE_VERSION_NOT_NEWER')
        // E la versione superata è archiviata UNA volta sola, non due.
        const record = await getForgeTool('tool-a')
        expect(record?.previousVersions.map((m) => m.version)).toEqual([1])
    })
})

describe('forgeRegistryRepository — listForgeAudit (Fase 6, la storia mai riletta)', () => {
    it('più recente prima, e ogni voce porta il dettaglio scritto da audit()', async () => {
        await installForgeTool(manifest('tool-a', 1))
        await setForgeToolEnabled('tool-a', true)
        await installForgeTool(manifest('tool-a', 2))
        const entries = await listForgeAudit('tool-a')
        expect(entries.map((entry) => entry.kind)).toEqual(['install', 'enable', 'install'])
        expect(entries[0]?.detail).toEqual({ version: 2 })
    })

    it('un tool senza storia torna un elenco vuoto, non un errore', async () => {
        expect(await listForgeAudit('ghost')).toEqual([])
    })

    it('non mischia la storia di due tool diversi', async () => {
        await installForgeTool(manifest('tool-a'))
        await installForgeTool(manifest('tool-b'))
        const entries = await listForgeAudit('tool-a')
        expect(entries).toHaveLength(1)
    })
})

describe('forgeRegistryRepository — la corsa che il bug originale perdeva', () => {
    /**
     * ⛔⛔⛔ Il difetto ESATTO che questa Fase corregge: due scritture in
     * corsa su Preferences vedevano lo stesso stato di partenza, e
     * l'ultima `write()` vinceva — un lost update. Qui le due chiamate
     * partono SENZA await fra loro (`Promise.all`), esattamente come
     * accadrebbe con due tocchi rapidi sulla stessa riga della stazione:
     * la coda di scrittura serializzata deve garantire che ENTRAMBE
     * le mutazioni sopravvivano, non solo l'ultima.
     */
    it('due enable/disable concorrenti sullo stesso tool non si perdono a vicenda', async () => {
        await installForgeTool(manifest('tool-a'))
        await Promise.all([
            setForgeToolEnabled('tool-a', true),
            setForgeToolEnabled('tool-a', false),
        ])
        // Qualunque sia l'ordine reale con cui la coda le ha servite, ENTRAMBI
        // gli eventi di audit devono esistere — non uno solo, come sarebbe
        // successo con un read-modify-write non serializzato.
        const audit = await connection!.query('SELECT kind FROM talos_forge_audit WHERE tool_id = ? ORDER BY rowid ASC', ['tool-a'])
        expect(audit.map((row: any) => row.kind)).toEqual(['install', 'enable', 'disable'])
    })

    it('due install concorrenti su tool diversi non si calpestano a vicenda', async () => {
        await Promise.all([
            installForgeTool(manifest('tool-a')),
            installForgeTool(manifest('tool-b')),
        ])
        expect(await getForgeTool('tool-a')).not.toBeNull()
        expect(await getForgeTool('tool-b')).not.toBeNull()
    })
})
