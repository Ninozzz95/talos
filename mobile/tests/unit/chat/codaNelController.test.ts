// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createChatController, type ChatControllerDeps } from '@/stores/chatController'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { talosTestT } from '../../helpers/talosTestI18n'
import { TALOS_EMPTY_TOOL_AUTHORIZATIONS } from '@/lib/tools/toolAuthorizations'

/**
 * ⭐ B3 — la coda nel controller (LEDGER-B3-2026-09-24, F3). Controller, store e catalogo sono veri; solo il confine
 * del fornitore è simulato. Decisioni owner 24/09: mentre l'app risponde si ACCODA (D-B3-01), anche da un'altra chat
 * (D-B3-04); la voce parte da sola a fine giro, dalla stessa strada di un invio normale.
 */
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
    return { controller, repository }
}
const controllers: ReturnType<typeof createChatController>[] = []

/** Il primo giro resta aperto finché la prova non lo chiude; i successivi rispondono subito. */
function primoGiroApribile() {
    let chiudi: () => void = () => undefined
    let segnalaAvvio: () => void = () => undefined
    const avviato = new Promise<void>((r) => { segnalaAvvio = r })
    provider.complete.mockImplementationOnce(() => new Promise((resolve) => {
        segnalaAvvio()
        chiudi = () => resolve({ text: 'Prima risposta.', model: 'calm-test', finishReason: 'stop' })
    }))
    return { avviato, chiudi: () => chiudi() }
}

const attesa = async (condizione: () => boolean | Promise<boolean>) => {
    for (let i = 0; i < 100; i += 1) {
        if (await condizione()) return
        await new Promise((r) => setTimeout(r, 5))
    }
    throw new Error('condizione mai vera')
}

beforeEach(() => provider.complete.mockReset().mockResolvedValue({ text: 'Risposta diretta.', model: 'calm-test', finishReason: 'stop' }))
afterEach(() => controllers.splice(0).forEach((c) => c.dispose()))

describe('B3 — la coda nel controller', () => {
    it('CTRL-CODA-01 a app ferma non si accoda: si invia', async () => {
        const { controller } = setup()
        await controller.init()
        expect(controller.canQueue.value).toBe(false)
        expect(await controller.queueMessage('niente')).toEqual({ ok: false, rifiuto: 'nessuna-chat' })
    })

    it('CTRL-CODA-02 scritto mentre risponde: si accoda e parte da solo a fine giro, nella stessa chat', async () => {
        const { controller, repository } = setup()
        await controller.init()
        const giro = primoGiroApribile()
        const invio = controller.send('Primo messaggio.')
        await giro.avviato
        expect(controller.canQueue.value).toBe(true)
        const sessione = controller.chat.activeSession.value!.id
        expect((await controller.queueMessage('Poi questo.')).ok).toBe(true)
        expect(controller.chat.queueOf(sessione).voci.map((v) => v.testo)).toEqual(['Poi questo.'])
        giro.chiudi()
        await invio
        await attesa(async () => (await repository.listMessages(sessione)).length === 4)
        const messaggi = await repository.listMessages(sessione)
        expect(messaggi.map((m) => [m.role, m.content])).toEqual([
            ['user', 'Primo messaggio.'], ['assistant', 'Prima risposta.'],
            ['user', 'Poi questo.'], ['assistant', 'Risposta diretta.'],
        ])
        expect(controller.chat.queueOf(sessione).voci).toEqual([])
    })

    it('CTRL-CODA-03 la coda di un’altra chat parte nella SUA chat, e quella aperta non si sporca', async () => {
        const { controller, repository } = setup()
        await controller.init()
        await controller.send('Apro la chat B.')
        const b = controller.chat.activeSession.value!.id
        await controller.newSession()
        const giro = primoGiroApribile()
        const invio = controller.send('Lavoro nella chat A.')
        await giro.avviato
        const a = controller.chat.activeSession.value!.id
        expect(a).not.toBe(b)
        expect((await controller.chat.enqueue('Per la chat B.', b)).ok).toBe(true)
        giro.chiudi()
        await invio
        await attesa(async () => (await repository.listMessages(b)).length === 4)
        expect((await repository.listMessages(b)).slice(2).map((m) => [m.role, m.content]))
            .toEqual([['user', 'Per la chat B.'], ['assistant', 'Risposta diretta.']])
        expect((await repository.listMessages(a)).map((m) => m.content)).toEqual(['Lavoro nella chat A.', 'Prima risposta.'])
        expect(controller.chat.activeSession.value!.id).toBe(a)
    })

    it('CTRL-CODA-04 al contrario: lo Stop mette in pausa, e la voce non parte', async () => {
        const { controller, repository } = setup()
        await controller.init()
        let segnalaAvvio: () => void = () => undefined
        const avviato = new Promise<void>((r) => { segnalaAvvio = r })
        provider.complete.mockImplementationOnce((_input: unknown, handlers?: { signal?: AbortSignal }) => new Promise((_resolve, reject) => {
            segnalaAvvio()
            handlers?.signal?.addEventListener('abort', () => {
                const errore = new Error('aborted')
                errore.name = 'AbortError'
                reject(errore)
            })
        }))
        const invio = controller.send('Primo messaggio.')
        await avviato
        const sessione = controller.chat.activeSession.value!.id
        await controller.queueMessage('Poi questo.')
        controller.chat.stopStreaming()
        await invio
        await new Promise((r) => setTimeout(r, 30))
        expect(controller.chat.queueOf(sessione)).toEqual({ voci: [expect.objectContaining({ testo: 'Poi questo.' })], inPausa: true })
        expect((await repository.listMessages(sessione)).some((m) => m.content === 'Poi questo.')).toBe(false)
    })

    it('CTRL-STEER-01 con attrezzi: la correzione aspetta il punto sicuro, il lavoro fatto resta, poi parte come turno nuovo', async () => {
        const { controller, repository } = setup()
        await controller.init()
        let rilascia: () => void = () => undefined
        const primo = new Promise<void>((r) => { rilascia = r })
        let segnalaAvvio: () => void = () => undefined
        const partito = new Promise<void>((r) => { segnalaAvvio = r })
        provider.complete
            .mockImplementationOnce(async () => {
                segnalaAvvio()
                await primo
                return { text: 'Guardo l’ora.', model: 'calm-test', finishReason: 'tool_calls', toolCalls: [{ id: 'c1', name: 'time_now', arguments: {} }] }
            })
            .mockResolvedValue({ text: 'Risposta diretta.', model: 'calm-test', finishReason: 'stop' })
        const invio = controller.send('Che ore sono?')
        await partito
        const sessione = controller.chat.activeSession.value!.id
        // D-B3-02 «con attrezzi IN USO»: il modello non ha ancora chiamato niente, quindi non c'è un passo fra attrezzi
        // da aspettare (misurato sul Pad il 24/09: offerti ≠ usati).
        expect(controller.turnUsesTools.value).toBe(false)
        expect((await controller.queueMessage('Rispondi in inglese.')).ok).toBe(true)
        const voce = controller.chat.queueOf(sessione).voci[0]
        expect(await controller.chat.steerQueued(sessione, voce.id, 'punto-sicuro')).toBe(true)
        rilascia()
        await invio
        await attesa(async () => (await repository.listMessages(sessione)).length === 4)
        const messaggi = await repository.listMessages(sessione)
        expect(messaggi.map((m) => [m.role, m.content])).toEqual([
            ['user', 'Che ore sono?'], ['assistant', 'Guardo l’ora.'],
            ['user', 'Rispondi in inglese.'], ['assistant', 'Risposta diretta.'],
        ])
        // Una sola chiamata nel primo giro (chiuso al punto sicuro) + una per la correzione.
        expect(provider.complete).toHaveBeenCalledTimes(2)
        const ultimoIngresso = provider.complete.mock.calls[1]![0] as { messages?: Array<{ role: string; content: unknown }> }
        expect(JSON.stringify(ultimoIngresso)).toContain('Rispondi in inglese.')
    })

    it('CTRL-RESUME-01 dopo uno Stop «Riprendi» è offerto, rifà la risposta e poi non è più offerto', async () => {
        const { controller, repository } = setup()
        await controller.init()
        let segnalaAvvio: () => void = () => undefined
        const avviato = new Promise<void>((r) => { segnalaAvvio = r })
        provider.complete.mockImplementationOnce((_input: unknown, handlers?: { signal?: AbortSignal }) => new Promise((_resolve, reject) => {
            segnalaAvvio()
            handlers?.signal?.addEventListener('abort', () => {
                const errore = new Error('aborted')
                errore.name = 'AbortError'
                reject(errore)
            })
        }))
        expect(controller.canResume.value).toBe(false)
        const invio = controller.send('Raccontami una storia.')
        await avviato
        controller.chat.stopStreaming()
        await invio
        const sessione = controller.chat.activeSession.value!.id
        expect(controller.canResume.value).toBe(true)
        expect(await controller.resumeSession()).toBe(true)
        const messaggi = await repository.listMessages(sessione)
        expect(messaggi.filter((m) => m.role === 'user').map((m) => m.content)).toEqual(['Raccontami una storia.'])
        expect(messaggi.at(-1)).toMatchObject({ role: 'assistant', content: 'Risposta diretta.' })
        expect(controller.canResume.value).toBe(false)
    })

    it('CTRL-TOOLS-01 «attrezzi in uso» solo DOPO la prima chiamata: offerti non basta (Pad, 24/09)', async () => {
        const { controller } = setup()
        await controller.init()
        let rilasciaPrimo: () => void = () => undefined
        const primo = new Promise<void>((r) => { rilasciaPrimo = r })
        let segnalaPrimo: () => void = () => undefined
        const primoPartito = new Promise<void>((r) => { segnalaPrimo = r })
        let rilasciaSecondo: () => void = () => undefined
        const secondo = new Promise<void>((r) => { rilasciaSecondo = r })
        let segnalaSecondo: () => void = () => undefined
        const secondoPartito = new Promise<void>((r) => { segnalaSecondo = r })
        provider.complete
            .mockImplementationOnce(async () => {
                segnalaPrimo()
                await primo
                return { text: '', model: 'calm-test', finishReason: 'tool_calls', toolCalls: [{ id: 'c1', name: 'time_now', arguments: {} }] }
            })
            .mockImplementationOnce(async () => {
                segnalaSecondo()
                await secondo
                return { text: 'Sono le dieci.', model: 'calm-test', finishReason: 'stop' }
            })
        const invio = controller.send('Che ore sono?')
        await primoPartito
        expect(controller.turnUsesTools.value).toBe(false)
        rilasciaPrimo()
        await secondoPartito
        expect(controller.turnUsesTools.value).toBe(true)
        rilasciaSecondo()
        await invio
        expect(controller.turnUsesTools.value).toBe(false)
    })
})

