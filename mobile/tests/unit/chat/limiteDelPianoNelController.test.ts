// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createChatController, type ChatControllerDeps } from '@/stores/chatController'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { talosTestT } from '../../helpers/talosTestI18n'
import { TALOS_EMPTY_TOOL_AUTHORIZATIONS } from '@/lib/tools/toolAuthorizations'

/*
 * N15 fetta 9 (13/10/2026) — il limite d'uso del piano ChatGPT nel controller VERO: controller, store e catalogo veri, solo il
 * confine del fornitore è simulato (stesso schema di `compattazioneNelController.test.ts`). Il limite non si può provocare
 * dal vivo, quindi è qui che si prova il collegamento intero: rifiuto → `attesaDelPiano` → attesa → STESSA richiesta → risposta.
 */
const provider = vi.hoisted(() => ({ complete: vi.fn() }))
vi.mock('@/lib/chat/providerRegistry', () => ({
    providerAdapterFor: (id: string) => ({
        provider: id, requiresSecret: false, requiresEndpoint: false,
        listModels: async () => ({ provider: id, models: [{
            id: `modello-${id}`, provider: id, displayName: `Modello ${id}`,
            chatCompatibility: 'supported', inputModalities: ['text'],
            outputModalities: ['text'], supportedParameters: ['tools'],
        }] }),
        complete: provider.complete,
    }),
}))
vi.mock('@/services/localEngine', () => ({
    talosWarmLocalModel: vi.fn(async () => ({ opened: true, ms: 0 })),
}))
const consumi = vi.hoisted(() => ({ registra: vi.fn() }))
vi.mock('@/services/chatgptConsumi', () => ({ talosConsumiChatgpt: () => consumi }))

const controllers: ReturnType<typeof createChatController>[] = []
function setup() {
    const repository = createMemoryChatRepository()
    const state = reactive({
        composer_defaults: { model_profile_id: null, effort: 'off', thinking: false },
        model_lab: { schema_version: 1, manual_models: [], model_overrides: {}, provider_runtime: {}, probe_results: {} },
        tone: { preset: 'balanced' },
        shell: { library_context_enabled: false, library_autosave_generated: false },
        search: { source: null, endpoint: null },
        tools: { read: 'allow', write: 'ask', outbound: 'deny' },
        agent_tools: { time_now: true },
        tool_authorizations: TALOS_EMPTY_TOOL_AUTHORIZATIONS,
        local_engine_probe: { consent: 'declined' },
    })
    const transport = { request: vi.fn(async () => { throw new Error('Rete vietata in questa prova') }) }
    const deps = {
        translate: talosTestT('en'), chatRepository: repository, transport,
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
    return { controller, repository }
}
async function colModello(controller: ReturnType<typeof createChatController>, fornitore: string) {
    await controller.init()
    const profilo = controller.profiles.value.find((p) => p.provider === fornitore)
    expect(profilo, `profilo ${fornitore}`).toBeDefined()
    await controller.selectModel(profilo!.id)
}
const limite = (attesaMs: number | null = 60_000) => Object.assign(new Error('CHATGPT_LIMITE_DEL_PIANO'), {
    provider: 'chatgpt', uiMessageKey: 'models.chatgptErrors.CHATGPT_LIMITE_DEL_PIANO', attesaMs,
})
const risposta = { text: 'Eccomi.', model: 'modello-chatgpt', finishReason: 'stop', usage: { prompt_tokens: 40, completion_tokens: 5 } }

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    provider.complete.mockReset()
    consumi.registra.mockReset()
})
afterEach(() => {
    controllers.splice(0).forEach((c) => c.dispose())
    vi.useRealTimers()
})

describe('N15 — il limite d uso del piano nel controller vero', () => {
    it('N15-LIM-CTRL-01: al limite il giro ASPETTA (stato esposto con chat, ora e tentativo), poi rifà la stessa richiesta e risponde; niente errore nella chat', async () => {
        const { controller, repository } = setup()
        await colModello(controller, 'chatgpt')
        provider.complete.mockRejectedValueOnce(limite(60_000)).mockResolvedValue(risposta)
        const invio = controller.send('quanto manca a Natale?')
        await vi.waitFor(() => expect(controller.attesaDelPiano.value).not.toBeNull(), { timeout: 4000, interval: 5 })
        const sessione = controller.chat.activeSession.value!.id
        expect(controller.attesaDelPiano.value).toMatchObject({ sessionId: sessione, tentativo: 1, totale: 9 })
        // (l'orologio finto è avanzato di qualche millisecondo mentre la prova aspettava lo stato)
        const resta = controller.attesaDelPiano.value!.riprendeAlle - Date.now()
        expect(resta).toBeGreaterThan(59_000)
        expect(resta).toBeLessThanOrEqual(60_000)
        expect(provider.complete).toHaveBeenCalledTimes(1)
        // prima dell'ora non riparte
        await vi.advanceTimersByTimeAsync(58_000)
        expect(provider.complete).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(3_000)
        await invio
        expect(provider.complete).toHaveBeenCalledTimes(2)
        expect(controller.attesaDelPiano.value).toBeNull()
        // la STESSA richiesta: stessi turni
        const [prima, dopo] = provider.complete.mock.calls.map(([input]) => (input as { turns: unknown[] }).turns)
        expect(dopo).toEqual(prima)
        const righe = await repository.listMessages(sessione)
        expect(righe.map((r) => r.role)).toEqual(['user', 'assistant'])
        expect(righe[1]!.content).toBe('Eccomi.')
        // una sola richiesta è andata a buon fine: il conto locale ne segna una
        await vi.waitFor(() => expect(consumi.registra).toHaveBeenCalledTimes(1), { timeout: 2000, interval: 5 })
    })

    it('N15-LIM-CTRL-02: «Ferma l attesa» (lo Stop del giro) chiude subito: nessuna nuova richiesta, nessun errore scritto, stato tolto', async () => {
        const { controller, repository } = setup()
        await colModello(controller, 'chatgpt')
        provider.complete.mockRejectedValue(limite(60_000))
        const invio = controller.send('ciao')
        await vi.waitFor(() => expect(controller.attesaDelPiano.value).not.toBeNull(), { timeout: 4000, interval: 5 })
        const sessione = controller.chat.activeSession.value!.id
        controller.chat.stopStreaming()
        await invio
        expect(provider.complete).toHaveBeenCalledTimes(1)
        expect(controller.attesaDelPiano.value).toBeNull()
        const righe = await repository.listMessages(sessione)
        expect(righe.some((r) => r.state === 'failed')).toBe(false)
        await vi.advanceTimersByTimeAsync(120_000)
        expect(provider.complete).toHaveBeenCalledTimes(1)
    })

    it('N15-LIM-CTRL-03: oltre 24 ore non si aspetta — il giro si ferma con la frase del limite, e mai su un altro fornitore', async () => {
        const { controller, repository } = setup()
        await colModello(controller, 'chatgpt')
        provider.complete.mockRejectedValue(limite(null))
        await controller.send('ciao')
        expect(provider.complete).toHaveBeenCalledTimes(1)
        expect(controller.attesaDelPiano.value).toBeNull()
        const righe = await repository.listMessages(controller.chat.activeSession.value!.id)
        const guasto = righe.find((r) => r.state === 'failed')
        expect(guasto).toBeDefined()
        expect(guasto!.content).toContain('usage limit')
    })

    it('N15-LIM-CTRL-04 AL CONTRARIO: lo stesso rifiuto da un fornitore a chiave NON fa aspettare nessuno', async () => {
        const { controller } = setup()
        await colModello(controller, 'openai')
        provider.complete.mockRejectedValue(limite(60_000))
        await controller.send('ciao')
        expect(provider.complete).toHaveBeenCalledTimes(1)
        expect(controller.attesaDelPiano.value).toBeNull()
    })
})
