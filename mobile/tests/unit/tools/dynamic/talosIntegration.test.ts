import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { createInstalledDynamicTools } from '@/lib/tools/dynamic/talosIntegration'
import { installForgeTool, setForgeToolEnabled } from '@/lib/tools/dynamic/forgeRegistryRepository'
import { registerTalosSqliteRuntime } from '@/services/databaseProtection'
import { TALOS_CHAT_DATABASE_UPGRADES } from '@/persistence/chatDatabaseSchema'
import type { TalosSqlConnection, TalosSqliteRuntime } from '@/persistence/sqliteTypes'
import { createSqlJsConnection } from '../../repositories/sqlJsConnection'
import type { TalosLocalToolManifestV1 } from '@/lib/tools/dynamic/contracts'
import type { TalosChatRepository } from '@/repositories/chatRepository'

/**
 * ⛔⛔⛔ Owner 2026-08-27 — Tool Forge Fase 4, il gap che né la ZIP né la
 * revisione avevano visto: nessun tool forgiato dichiarava `premesse`/
 * `verify` (registry.ts:196-224), nessun credential resolver, nessuna
 * sanitizzazione dell'errore nel trace. Questi test provano tutti e tre,
 * più il confine onesto (solo capability sole + input pass-through).
 */

let connection: (TalosSqlConnection & { close(): void }) | null = null

function passthroughManifest(id: string, capability: string): TalosLocalToolManifestV1 {
    return {
        schema: 'talos.local-tool.v1', id, version: 1, title: `Tool ${id}`,
        description: 'test manifest', createdAt: new Date().toISOString(), parentVersion: null,
        execution: 'declarative-flow', installScope: 'device',
        network: { mode: 'forbidden', domains: [] }, credentialRequirements: [],
        flow: {
            entry: 'call', maxTransitions: 8,
            nodes: [
                { id: 'call', type: 'capability', capability, input: { $ref: '$.input' }, target: '$.result', next: 'done' },
                { id: 'done', type: 'return', value: { $ref: '$.result' } },
            ],
        },
    }
}

function remappedInputManifest(id: string, capability: string): TalosLocalToolManifestV1 {
    // Il nodo NON passa l'input del tool alla capability così com'è: lo
    // ricostruisce prima con un `set`. Anche se la capability è UNA sola,
    // premesse/verify NON devono attivarsi qui — l'input del tool e
    // quello della capability non sono dimostrabilmente la stessa cosa.
    return {
        schema: 'talos.local-tool.v1', id, version: 1, title: `Tool ${id}`,
        description: 'test manifest', createdAt: new Date().toISOString(), parentVersion: null,
        execution: 'declarative-flow', installScope: 'device',
        network: { mode: 'forbidden', domains: [] }, credentialRequirements: [],
        flow: {
            entry: 'remap', maxTransitions: 8,
            nodes: [
                { id: 'remap', type: 'set', target: '$.mapped', value: { id: { $ref: '$.input.taskId' }, status: 'done' }, next: 'call' },
                { id: 'call', type: 'capability', capability, input: { $ref: '$.mapped' }, target: '$.result', next: 'done' },
                { id: 'done', type: 'return', value: { $ref: '$.result' } },
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

async function withOneEnabledTool(manifest: TalosLocalToolManifestV1): Promise<void> {
    await installForgeTool(manifest)
    await setForgeToolEnabled(manifest.id, true)
}

describe('talosIntegration — premesse/verify, solo quando è provabile', () => {
    it('tasks.setStatus (pass-through): premesse vede il task assente, poi presente', async () => {
        await withOneEnabledTool(passthroughManifest('set_status_tool', 'tasks.setStatus'))
        const repository = createMemoryChatRepository()
        const [tool] = await createInstalledDynamicTools({ repository })
        expect(tool?.premesse).toBeDefined()

        const context = { sessionId: null }
        const absent = await tool!.premesse!({ id: 'ghost-task', status: 'done' } as never, context)
        expect(absent).toMatchObject({ stato: 'assente', copertura: 'completa' })

        const task = await repository.createTask({
            id: 'real-task', title: 'x', description: null, run_id: null, priority: 'normal',
            status: 'todo', schedule_json: null, instruction: null,
            content_origin: 'user', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        } as any)
        const present = await tool!.premesse!({ id: task.id, status: 'done' } as never, context)
        expect(present).toEqual({ stato: 'presente' })
    })

    it('tasks.setStatus: verify degrada un falso successo — lo stato non è cambiato davvero', async () => {
        await withOneEnabledTool(passthroughManifest('set_status_tool', 'tasks.setStatus'))
        const repository = createMemoryChatRepository()
        const [tool] = await createInstalledDynamicTools({ repository })
        const task = await repository.createTask({
            id: 'real-task', title: 'x', description: null, run_id: null, priority: 'normal',
            status: 'todo', schedule_json: null, instruction: null,
            content_origin: 'user', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        } as any)
        // Il tool non ha ancora girato: verify guarda lo stato REALE, non promette.
        const verdict = await tool!.verify!({ id: task.id, status: 'done' } as never, null, { sessionId: null })
        expect(verdict).toEqual({ held: false, reason: expect.stringContaining('non') })
    })

    it('tasks.setStatus: verify promuove — lo stato È cambiato davvero', async () => {
        await withOneEnabledTool(passthroughManifest('set_status_tool', 'tasks.setStatus'))
        const repository = createMemoryChatRepository()
        const [tool] = await createInstalledDynamicTools({ repository })
        const task = await repository.createTask({
            id: 'real-task', title: 'x', description: null, run_id: null, priority: 'normal',
            status: 'todo', schedule_json: null, instruction: null,
            content_origin: 'user', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        } as any)
        await repository.setTaskStatus(task.id, 'done')
        const verdict = await tool!.verify!({ id: task.id, status: 'done' } as never, null, { sessionId: null })
        expect(verdict).toEqual({ held: true })
    })

    it('tasks.create: nessuna premessa (niente deve esistere prima), verify per CONTENUTO', async () => {
        await withOneEnabledTool(passthroughManifest('create_tool', 'tasks.create'))
        const repository = createMemoryChatRepository()
        const [tool] = await createInstalledDynamicTools({ repository })
        expect(tool?.premesse).toBeUndefined()
        expect(tool?.verify).toBeDefined()

        const before = await tool!.verify!({ title: 'Comprare il latte' } as never, null, { sessionId: null })
        expect(before).toEqual({ held: false, reason: expect.any(String) })

        await repository.createTask({
            id: 'x', title: 'Comprare il latte', description: null, run_id: null, priority: 'normal',
            status: 'todo', schedule_json: null, instruction: null,
            content_origin: 'user', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        } as any)
        const after = await tool!.verify!({ title: 'Comprare il latte' } as never, null, { sessionId: null })
        expect(after).toEqual({ held: true })
    })

    it('confine onesto: due capability raggiungibili ⇒ niente premesse/verify', async () => {
        const manifest: TalosLocalToolManifestV1 = {
            schema: 'talos.local-tool.v1', id: 'two_capability_tool', version: 1, title: 'Two',
            description: 'x', createdAt: new Date().toISOString(), parentVersion: null,
            execution: 'declarative-flow', installScope: 'device',
            network: { mode: 'forbidden', domains: [] }, credentialRequirements: [],
            flow: {
                entry: 'nod1', maxTransitions: 8,
                nodes: [
                    { id: 'nod1', type: 'capability', capability: 'tasks.list', input: {}, target: '$.t', next: 'nod2' },
                    { id: 'nod2', type: 'capability', capability: 'notes.list', input: {}, target: '$.n', next: 'done' },
                    { id: 'done', type: 'return', value: { $ref: '$.n' } },
                ],
            },
        }
        await withOneEnabledTool(manifest)
        const [tool] = await createInstalledDynamicTools({ repository: createMemoryChatRepository() })
        expect(tool?.premesse).toBeUndefined()
        expect(tool?.verify).toBeUndefined()
    })

    it('confine onesto: input rimappato (non pass-through) ⇒ niente premesse/verify, anche con una sola capability', async () => {
        await withOneEnabledTool(remappedInputManifest('remap_tool', 'tasks.setStatus'))
        const [tool] = await createInstalledDynamicTools({ repository: createMemoryChatRepository() })
        expect(tool?.premesse).toBeUndefined()
        expect(tool?.verify).toBeUndefined()
    })

    it('confine onesto: una capability senza controllo registrato (tasks.list) ⇒ niente premesse/verify', async () => {
        await withOneEnabledTool(passthroughManifest('list_tool', 'tasks.list'))
        const [tool] = await createInstalledDynamicTools({ repository: createMemoryChatRepository() })
        expect(tool?.premesse).toBeUndefined()
        expect(tool?.verify).toBeUndefined()
    })
})

describe('talosIntegration — credential resolver, fail-closed', () => {
    it('un tool con uno slot di credenziale non risolvibile non entra nella lista dei tool vivi', async () => {
        const manifest = passthroughManifest('needs_credential_tool', 'tasks.list')
        manifest.network = { mode: 'allowlist', domains: ['example.com'] }
        manifest.credentialRequirements = [{ id: 'svc', kind: 'api_profile', purpose: 'x', outboundScope: ['example.com'] }]
        await withOneEnabledTool(manifest)
        const tools = await createInstalledDynamicTools({ repository: createMemoryChatRepository() })
        expect(tools).toHaveLength(0)
    })

    it('un resolver che sa risolvere lo slot lo lascia entrare', async () => {
        const manifest = passthroughManifest('needs_credential_tool', 'tasks.list')
        manifest.network = { mode: 'allowlist', domains: ['example.com'] }
        manifest.credentialRequirements = [{ id: 'svc', kind: 'api_profile', purpose: 'x', outboundScope: ['example.com'] }]
        await withOneEnabledTool(manifest)
        const tools = await createInstalledDynamicTools({
            repository: createMemoryChatRepository(),
            credentialResolver: { canResolve: async () => true },
        })
        expect(tools).toHaveLength(1)
    })

    it('un tool senza credenziali dichiarate non è mai toccato dal resolver', async () => {
        await withOneEnabledTool(passthroughManifest('no_credential_tool', 'tasks.list'))
        const tools = await createInstalledDynamicTools({ repository: createMemoryChatRepository() })
        expect(tools).toHaveLength(1)
    })
})

describe('talosIntegration — l\'errore del repository non finisce grezzo nel trace', () => {
    it('un errore del repository diventa un codice pubblico, non il messaggio originale', async () => {
        await withOneEnabledTool(passthroughManifest('create_tool', 'tasks.create'))
        const failing: TalosChatRepository = {
            ...createMemoryChatRepository(),
            async createTask() { throw new Error('SQLITE_CONSTRAINT: UNIQUE failed: talos_tasks.id at /data/user/0/ai.talos/databases/talos_mobile') },
        }
        const [tool] = await createInstalledDynamicTools({ repository: failing })
        const result = await tool!.run({ title: 'x' } as never, { sessionId: null })
        expect(result.ok).toBe(false)
        const serialized = JSON.stringify(result)
        expect(serialized).not.toContain('SQLITE_CONSTRAINT')
        expect(serialized).not.toContain('talos_mobile')
        expect(serialized).toContain('TALOS_FORGE_CAPABILITY_EXECUTION_FAILED')
    })
})
