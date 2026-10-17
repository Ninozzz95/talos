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

/**
 * N13 (owner 02/10): con un giro di attrezzi vero (controller, catalogo e ciclo reali; solo il provider simulato) il messaggio salvato
 * porta la sequenza ordinata: la riga dell'attrezzo DOPO il testo che l'ha preceduta, poi la risposta finale.
 */
describe('N13 — la sequenza del turno passa dal controller', () => {
    it('SEQ-CTRL-01 un giro con un attrezzo salva la sequenza con la riga dell’attrezzo al suo posto', async () => {
        const { controller } = setup()
        await controller.init()
        provider.complete
            .mockResolvedValueOnce({ text: '', model: 'calm-test', finishReason: 'tool_calls', toolCalls: [{
                id: 'ora-1', name: 'time_now', arguments: {},
            }] })
            .mockResolvedValueOnce({ text: 'Sono le dieci.', model: 'calm-test', finishReason: 'stop' })
        expect(await controller.send('Che ore sono adesso?')).toBe(true)
        const risposta = controller.chat.messages.filter((m) => m.role === 'assistant').at(-1)!
        expect(risposta.content).toContain('Sono le dieci.')
        const sequenza = risposta.metadata?.talos_sequenza as Array<{ tipo: string; attrezzi?: Array<{ name: string }>; testo?: string }>
        expect(sequenza.map((segmento) => segmento.tipo)).toEqual(['attrezzi', 'testo'])
        expect(sequenza[0]!.attrezzi![0]!.name).toBe('time_now')
        expect(sequenza[1]!.testo).toContain('Sono le dieci.')
    })
})
