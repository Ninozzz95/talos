// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTalosToolset } from '@/lib/tools/toolset'
import { TALOS_DEFAULT_AGENT_TOOL_ENABLED } from '@/lib/tools/toolControls'
import { registerTalosSqliteRuntime } from '@/services/databaseProtection'
import { TALOS_CHAT_DATABASE_UPGRADES } from '@/persistence/chatDatabaseSchema'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { installForgeTool } from '@/lib/tools/dynamic/forgeRegistryRepository'
import { createSqlJsConnection } from '../repositories/sqlJsConnection'
import type { TalosSqlConnection, TalosSqliteRuntime } from '@/persistence/sqliteTypes'
import type { TalosLocalToolManifestV1 } from '@/lib/tools/dynamic/contracts'

/**
 * ⛔⛔⛔ Owner 2026-08-27 — Tool Forge Fase 8, l'INNESTO provato a livello
 * giusto: non l'interprete da solo (già provato in `forgeInterpreter.test.ts`),
 * il `toolset.ts` REALE che il resto della chat consuma. `createInstalledDynamicTools`
 * esisteva ed era testato da Fase 0 — mai chiamato da nessuno finché questo
 * file non prova che ORA lo è, e che un tool forgiato arriva fino a dove il
 * modello può davvero vederlo e chiamarlo.
 *
 * Due difetti reali trovati ATTIVANDO per davvero (non ipotizzati), corretti
 * in `toolset.ts` prima di questo file:
 * 1. `isEnabled()` negava SEMPRE un nome `dynamic:*` — non è mai nell'elenco
 *    statico `TALOS_AGENT_TOOL_IDS`, e quella funzione dichiara "unknown
 *    tool IDs are denied". Un tool abilitato dalla stazione sarebbe
 *    comparso come "esiste ma non è permesso", per sempre.
 * 2. Senza un registro SQLite pronto (PIN non ancora sbloccato, un test che
 *    non ne registra uno), `createInstalledDynamicTools` lanciava e faceva
 *    fallire l'INTERO `createTalosToolset` — non solo i tool forgiati, ogni
 *    strumento della chat. Ora fallisce chiuso solo sulla sua parte.
 */

let connection: (TalosSqlConnection & { close(): void }) | null = null

function manifest(): TalosLocalToolManifestV1 {
    return {
        schema: 'talos.local-tool.v1', id: 'quick-note', version: 1, title: 'Quick note',
        description: 'Fase 8 activation probe — creates a note from a title.',
        createdAt: new Date().toISOString(), parentVersion: null,
        execution: 'declarative-flow', installScope: 'device',
        network: { mode: 'forbidden', domains: [] }, credentialRequirements: [],
        inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
        flow: {
            entry: 'create', maxTransitions: 8,
            nodes: [
                { id: 'create', type: 'capability', capability: 'notes.create', input: { title: { $ref: '$.input.title' }, content: '' }, target: '$.note', next: 'ret' },
                { id: 'ret', type: 'return', value: { $ref: '$.note' } },
            ],
        },
    }
}

beforeEach(async () => {
    connection = await createSqlJsConnection()
    for (const upgrade of TALOS_CHAT_DATABASE_UPGRADES) {
        for (const statement of upgrade.statements) await connection.execute(statement)
    }
    const runtime: TalosSqliteRuntime = {
        platform: 'web', connect: async () => connection!, persist: async () => undefined, close: async () => undefined,
    }
    registerTalosSqliteRuntime(runtime)
})

afterEach(() => {
    registerTalosSqliteRuntime(null)
    connection?.close()
    connection = null
})

describe('toolset — un tool forgiato installato e abilitato arriva DAVVERO al modello', () => {
    it('installato ma NON abilitato: non compare in nessuna delle tre porte (tools/describe/offer)', async () => {
        await installForgeTool(manifest()) // installato, MAI abilitato
        const repository = createMemoryChatRepository()
        const suite = await createTalosToolset({ repository, readVaultFileText: async () => null })

        expect(suite.tools.some((tool) => tool.name === 'dynamic:quick-note')).toBe(false)
        expect(suite.describe('dynamic:quick-note', { read: 'allow', write: 'allow', outbound: 'allow' }, TALOS_DEFAULT_AGENT_TOOL_ENABLED)).toBeNull()
        const offered = suite.offer({ read: 'allow', write: 'allow', outbound: 'allow' }, TALOS_DEFAULT_AGENT_TOOL_ENABLED)
        expect(offered.some((tool) => tool.name === 'dynamic:quick-note')).toBe(false)
    })

    it('installato E abilitato: compare in tools/describe/offer, ed è REALMENTE chiamabile — la prova end-to-end', async () => {
        const { installForgeTool: install, setForgeToolEnabled } = await import('@/lib/tools/dynamic/forgeRegistryRepository')
        await install(manifest())
        await setForgeToolEnabled('quick-note', true)

        const repository = createMemoryChatRepository()
        const suite = await createTalosToolset({ repository, readVaultFileText: async () => null })

        const NAME = 'dynamic:quick-note'
        const tool = suite.tools.find((t) => t.name === NAME)
        expect(tool).toBeDefined()

        const described = suite.describe(NAME, { read: 'allow', write: 'allow', outbound: 'allow' }, TALOS_DEFAULT_AGENT_TOOL_ENABLED)
        expect(described).not.toBeNull()
        // ⛔ La prova del PRIMO difetto corretto: prima di correggere
        // `isEnabled()`, questo era SEMPRE `false` per qualunque nome
        // `dynamic:*`, indipendentemente dallo stato vero nel registro.
        expect(described?.allowed).toBe(true)

        const offered = suite.offer({ read: 'allow', write: 'allow', outbound: 'allow' }, TALOS_DEFAULT_AGENT_TOOL_ENABLED)
        expect(offered.some((t) => t.name === NAME)).toBe(true)

        // La chiamata VERA: non solo "è nell'elenco", il DAG gira e produce
        // un effetto reale sul repository — la stessa nota che il modello
        // vedrebbe come risultato di aver chiamato questo tool.
        const parsed = tool!.input.parse({ title: 'Richiama Marco domani' })
        const result = await tool!.run(parsed, { sessionId: 'test-session', signal: undefined as never })
        expect(result.ok).toBe(true)
        const notes = await repository.listNotes()
        expect(notes.some((note) => note.title === 'Richiama Marco domani')).toBe(true)
    })
})

describe('toolset — il registro non disponibile non porta giù il resto del toolset (Fase 8, il secondo difetto trovato)', () => {
    it('senza un runtime SQLite registrato, createTalosToolset costruisce comunque, con zero tool dinamici', async () => {
        registerTalosSqliteRuntime(null) // nessun database pronto — es. PIN non ancora sbloccato
        const repository = createMemoryChatRepository()
        await expect(createTalosToolset({ repository, readVaultFileText: async () => null })).resolves.toBeDefined()
        const suite = await createTalosToolset({ repository, readVaultFileText: async () => null })
        expect(suite.tools.some((tool) => tool.name.startsWith('dynamic:'))).toBe(false)
        // E gli strumenti che NON hanno niente a che fare col Forge restano
        // vivi — questa è la prova che il difetto era isolato, non che il
        // toolset intero fosse comunque sano per caso.
        expect(suite.tools.some((tool) => tool.name === 'notes_list' || tool.name.includes('note'))).toBe(true)
    })
})
