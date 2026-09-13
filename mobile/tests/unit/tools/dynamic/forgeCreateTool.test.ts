// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { registerTalosSqliteRuntime } from '@/services/databaseProtection'
import { TALOS_CHAT_DATABASE_UPGRADES } from '@/persistence/chatDatabaseSchema'
import type { TalosSqlConnection, TalosSqliteRuntime } from '@/persistence/sqliteTypes'
import { createSqlJsConnection } from '../../repositories/sqlJsConnection'
import { getForgeTool } from '@/lib/tools/dynamic/forgeRegistryRepository'
import { createTalosForgeCreateTool } from '@/lib/tools/dynamic/forgeCreateTool'

/**
 * ⛔⛔⛔ Owner 2026-08-27 — «un utente finale, che magari non ha idea di cosa
 * sia un JSON, come fa a creare un tool da solo?». Contro un motore SQLite
 * VERO (sql.js, stesso pattern di `forgeRegistryRepository.test.ts`): il
 * tool scrive DAVVERO nel registro, non in un mock che accoda righe a
 * prescindere.
 */

let connection: (TalosSqlConnection & { close(): void }) | null = null

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

const tool = createTalosForgeCreateTool()

describe('forgeCreateTool — il tool che ne crea altri', () => {
    it('un manifest valido si installa DAVVERO, disabilitato di default come ogni altro tool forgiato', async () => {
        const result = await tool.run({
            id: 'log-water-intake',
            title: 'Log water intake',
            description: 'Adds a glass of water to today\'s count.',
            inputSchema: {
                type: 'object',
                properties: { glasses: { type: 'number' } },
                required: ['glasses'],
            },
            flow: {
                entry: 'ret',
                maxTransitions: 4,
                nodes: [{ id: 'ret', type: 'return', value: { $ref: '$.input.glasses' } }],
            },
        } as never, { sessionId: null, signal: new AbortController().signal })

        expect(result.ok).toBe(true)
        const record = await getForgeTool('log-water-intake')
        expect(record).not.toBeNull()
        // ⛔ Come ogni altro tool forgiato (Import sheet, Fase 6): installato
        // non vuol dire abilitato. Un secondo cancello separato, sempre.
        expect(record?.enabled).toBe(false)
        expect(record?.manifest.title).toBe('Log water intake')
    })

    /**
     * ⛔ Verso contrario: un manifest strutturalmente valido per lo schema
     * Zod (che il modello DEVE riuscire a produrre) ma SEMANTICAMENTE
     * rotto — qui un nodo "capability" che chiama un id di capacità
     * inventato — deve fallire con un messaggio LEGGIBILE che il modello
     * possa correggere, non un crash e non un'installazione silenziosa.
     */
    it('una capacità inventata viene rifiutata con un motivo leggibile, non installata', async () => {
        const result = await tool.run({
            id: 'broken-tool',
            title: 'Broken tool',
            description: 'Should never install.',
            flow: {
                entry: 'call',
                maxTransitions: 4,
                nodes: [
                    { id: 'call', type: 'capability', capability: 'nuclear.launch', input: {}, next: 'ret' },
                    { id: 'ret', type: 'return', value: null },
                ],
            },
        } as never, { sessionId: null, signal: new AbortController().signal })

        expect(result.ok).toBe(false)
        expect(result.content).toContain('could not be created')
        const record = await getForgeTool('broken-tool')
        expect(record).toBeNull()
    })

    it('lo stesso id, stessa versione, la seconda volta si rifiuta con un motivo leggibile', async () => {
        const proposal = {
            id: 'repeat-id',
            title: 'First',
            description: 'x',
            flow: { entry: 'ret', maxTransitions: 4, nodes: [{ id: 'ret', type: 'return', value: null }] },
        }
        const first = await tool.run(proposal as never, { sessionId: null, signal: new AbortController().signal })
        expect(first.ok).toBe(true)

        const second = await tool.run(proposal as never, { sessionId: null, signal: new AbortController().signal })
        expect(second.ok).toBe(false)
        expect(second.content).toContain('already exists')
    })
})
