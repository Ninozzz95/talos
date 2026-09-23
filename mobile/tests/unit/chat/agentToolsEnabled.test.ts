// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createChatController, type ChatControllerDeps } from '@/stores/chatController'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { talosTestT } from '../../helpers/talosTestI18n'
import type { TalosMobileProviderId } from '@/components/chat/mobileChatTypes'
import type { TalosMobileCompletionInput } from '@/lib/chat/providerContracts'
import { TALOS_EMPTY_TOOL_AUTHORIZATIONS } from '@/lib/tools/toolAuthorizations'

// Il controller, il catalogo strumenti e buildChatCompletion sono reali.
// Solo il confine del provider è simulato: nessuna rete o motore nativo.
const provider = vi.hoisted(() => ({ complete: vi.fn() }))
vi.mock('@/lib/chat/providerRegistry', () => ({
    providerAdapterFor: (id: string) => ({
        provider: id, requiresSecret: false, requiresEndpoint: false,
        listModels: async () => ({ provider: id, models: [{
            id: 'calm-test', provider: id, displayName: 'Calm test',
            chatCompatibility: 'supported', inputModalities: ['text'],
            outputModalities: ['text'], supportedParameters: ['tools'],
        }] }),
        complete: provider.complete,
    }),
}))
vi.mock('@/services/localEngine', () => ({
    talosWarmLocalModel: vi.fn(async () => ({ opened: true, ms: 0 })),
}))

function setup(repository = createMemoryChatRepository()) {
    const state = reactive({
        composer_defaults: { model_profile_id: null, effort: 'off', thinking: false },
        model_lab: { schema_version: 1, manual_models: [], model_overrides: {}, provider_runtime: {}, probe_results: {} },
        tone: { preset: 'balanced' },
        shell: { library_context_enabled: false, library_autosave_generated: false },
        search: { source: null, endpoint: null },
        tools: { read: 'allow', write: 'ask', outbound: 'deny' },
        agent_tools: { time_now: true, notes_list: true, document_create: true },
        tool_authorizations: TALOS_EMPTY_TOOL_AUTHORIZATIONS,
        local_engine_probe: { consent: 'declined' },
    })
    const transport = { request: vi.fn(async () => { throw new Error('Rete vietata in questa prova') }) }
    const deps = {
        translate: talosTestT('it'), chatRepository: repository, transport,
        hasKey: async () => true, getKey: async () => 'fake-key',
        getEndpoint: async () => null,
        settings: {
            state, hydrate: async () => {},
            setComposerDefaults: vi.fn(async (patch) => Object.assign(state.composer_defaults, patch)),
            setShell: vi.fn(async (patch) => Object.assign(state.shell, patch)),
            effectiveToolPermissions: () => state.tools,
        },
    } as unknown as ChatControllerDeps
    const controller = createChatController(deps)
    controllers.push(controller)
    return { controller, transport, repository }
}
const controllers: ReturnType<typeof createChatController>[] = []
beforeEach(() => provider.complete.mockReset().mockResolvedValue({ text: 'Risposta diretta.', model: 'calm-test', finishReason: 'stop' }))
afterEach(() => controllers.splice(0).forEach(c => c.dispose()))

describe('Calm — Agente per sessione', () => {
    it('la scelta non è persistita: un nuovo controller riparte acceso nella stessa chat', async () => {
        const first = setup()
        await first.controller.init()
        await first.controller.send('Una conversazione da riaprire.')
        const sessionId = first.controller.chat.activeSession.value!.id
        first.controller.setAgentToolsEnabled(false)
        const second = setup(first.repository)
        await second.controller.init()
        await second.controller.selectSession(sessionId)
        expect(second.controller.agentToolsEnabled.value).toBe(true)
    })
    it.each<TalosMobileProviderId>(['openai', 'deepseek', 'anthropic', 'gemini', 'openrouter', 'ollama', 'local'])(
        '%s: spento non espone tools; riacceso li espone di nuovo', async (id) => {
            const { controller, transport } = setup()
            await controller.init()
            await controller.selectModel(`${id}:calm-test`)
            expect(controller.agentToolsEnabled.value).toBe(true)
            controller.setAgentToolsEnabled(false)
            expect(await controller.send('Spiega il contenuto della richiesta.')).toBe(true)
            const spento = provider.complete.mock.calls.at(-1)![0] as TalosMobileCompletionInput
            expect(spento.model.provider).toBe(id)
            expect(spento.tools ?? []).toEqual([])
            expect(spento.executableToolNames ?? []).toEqual([])
            expect(spento.system).toContain('The person has disabled model tools')
            expect(controller.pendingToolAuthorizations.value).toEqual([])
            controller.setAgentToolsEnabled(true)
            expect(await controller.send('Controlla quali strumenti puoi usare.')).toBe(true)
            const acceso = provider.complete.mock.calls.at(-1)![0] as TalosMobileCompletionInput
            expect(acceso.tools?.length).toBeGreaterThan(0)
            expect(acceso.system).not.toContain('The person has disabled model tools')
            expect(transport.request).not.toHaveBeenCalled()
        },
    )

    it('conserva la scelta tornando alla chat e parte acceso in una nuova sessione, anche temporanea', async () => {
        const { controller } = setup()
        await controller.init()
        await controller.send('Prima conversazione.')
        const first = controller.chat.activeSession.value!.id
        controller.setAgentToolsEnabled(false)
        await controller.newSession()
        expect(controller.agentToolsEnabled.value).toBe(true)
        await controller.selectSession(first)
        expect(controller.agentToolsEnabled.value).toBe(false)
        await controller.newSession({ ephemeral: true })
        expect(controller.agentToolsEnabled.value).toBe(true)
        controller.setAgentToolsEnabled(false)
        expect(controller.agentToolsEnabled.value).toBe(false)
    })

    it('non esegue né chiede consenso se il provider restituisce comunque una tool call', async () => {
        const { controller } = setup()
        await controller.init()
        controller.setAgentToolsEnabled(false)
        provider.complete.mockResolvedValue({ text: 'Risposta.', model: 'calm-test', finishReason: 'tool_calls', toolCalls: [{
            id: 'unexpected', name: 'document_create', arguments: { title: 'Non creare', format: 'txt', content: 'X' },
        }] })
        expect(await controller.send('Rispondi senza strumenti.')).toBe(true)
        expect(provider.complete).toHaveBeenCalledTimes(1)
        expect(controller.pendingToolAuthorizations.value).toEqual([])
        expect(controller.toolAuthorizationPromptVisible.value).toBe(false)
    })

    it('fotografa la scelta all’accettazione: cambiare sessione durante il turno non lo riaccende', async () => {
        const { controller } = setup()
        await controller.init()
        controller.setAgentToolsEnabled(false)
        let finish!: () => void
        const pending = new Promise<void>(resolve => { finish = resolve })
        provider.complete.mockImplementation(async () => {
            await pending
            return { text: 'Finito.', model: 'calm-test', finishReason: 'stop' }
        })
        const sent = controller.send('Descrivi il problema con cura.')
        await vi.waitFor(() => expect(provider.complete).toHaveBeenCalledTimes(1))
        await controller.newSession()
        expect(controller.agentToolsEnabled.value).toBe(true)
        const input = provider.complete.mock.calls[0]![0] as TalosMobileCompletionInput
        expect(input.tools ?? []).toEqual([])
        finish()
        await sent
    })
})
