// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createChatController, type ChatControllerDeps } from '@/stores/chatController'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { TALOS_METADATA_COMPATTAZIONE, stimaDellaRichiestaDelPc } from '@/lib/chat/compattazioneChat'
import { talosTestT } from '../../helpers/talosTestI18n'
import { TALOS_EMPTY_TOOL_AUTHORIZATIONS } from '@/lib/tools/toolAuthorizations'

/*
 * ⭐⭐ P4-ter passo 2 (02/10/2026) — la compattazione della chat nel controller: controller, store e catalogo veri, solo il
 * confine del fornitore è simulato (stesso schema di `codaNelController.test.ts`). Il modello dichiara la sua finestra
 * (4.000 token, 500 di risposta): soglia = 0,75 × 3.500 = 2.625.
 */
const provider = vi.hoisted(() => ({ complete: vi.fn() }))
vi.mock('@/lib/chat/providerRegistry', () => ({
    providerAdapterFor: (id: string) => ({
        provider: id, requiresSecret: false, requiresEndpoint: false,
        listModels: async () => ({ provider: id, models: [{
            id: 'calm-test', provider: id, displayName: 'Calm test',
            chatCompatibility: 'supported', inputModalities: ['text'],
            outputModalities: ['text'], supportedParameters: ['tools'],
            contextLength: 4_000, maxOutputTokens: 500,
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

type Input = { turns: Array<{ role: string, content: string }>, tools?: unknown[], system?: string }
const eRiassunto = (input: Input) => input.turns.at(-1)?.content.startsWith('CONTEXT COMPACTION') === true
let promptDellaRisposta = 100
/** Risposte realistiche: con risposte di una parola l'intestazione del riassunto pesa più di ciò che toglie (owner: almeno il 30%). */
const LUNGA = 'con il ragionamento, le alternative scartate e i passi concreti da seguire. '.repeat(120)

/** Giudice v1547: un fornitore tarato, i cui token veri sono `rapporto` × la stima del PC della richiesta che riceve. */
let rapporto: number | null = null

beforeEach(() => {
    promptDellaRisposta = 100
    rapporto = null
    provider.complete.mockReset().mockImplementation(async (input: Input) => (eRiassunto(input)
        ? { text: 'RIASSUNTO DEL CONTROLLER', model: 'calm-test', finishReason: 'stop' }
        : {
            text: `Risposta. ${LUNGA}`, model: 'calm-test', finishReason: 'stop',
            usage: {
                prompt_tokens: rapporto !== null
                    ? Math.round(rapporto * stimaDellaRichiestaDelPc({ turni: input.turns as never, system: input.system, tools: input.tools }))
                    : promptDellaRisposta,
                completion_tokens: 10,
            },
        }))
})
afterEach(() => controllers.splice(0).forEach((c) => c.dispose()))

const chiamateDiRiassunto = () => provider.complete.mock.calls.map(([input]) => input as Input).filter(eRiassunto)

async function conversazione(controller: ReturnType<typeof createChatController>, domande = 10) {
    for (let i = 0; i < domande; i += 1) await controller.send(`domanda ${i}`)
    return controller.chat.activeSession.value!.id
}

describe('P4-ter passo 2 — la compattazione della chat nel controller', () => {
    /*
     * Telefono 0.1.48, giudice v1547 (strada (b)): questo fornitore finto dice 100 token per una richiesta che la stima del PC conta
     * ~25.500 con sistema e attrezzi (rapporto 0,004). È un dato rotto: k scende al più a 1/FATTORE_K_MASSIMO (0,25), il riassunto atteso pesa 100 token
     * veri, e 31 + 100 > 77 (il 70% di 110). Fino al giro dopo i revisori la prova si aspettava il riassunto; ora «niente».
     */
    it('CTRL-COMP-01 dato rotto ⇒ niente: un fornitore che dice 100 token su ~25.500 stimati non paga il riassunto', async () => {
        const { controller, repository } = setup()
        await controller.init()
        const sessione = await conversazione(controller)
        expect(chiamateDiRiassunto()).toHaveLength(0)
        const esito = await controller.chat.compattaOra(sessione)
        expect(esito).toEqual({ ok: true, compattato: false, motivo: 'niente-da-guadagnare' })
        expect(chiamateDiRiassunto()).toHaveLength(0)
        expect((await repository.listMessages(sessione)).some((r) => r.metadata?.[TALOS_METADATA_COMPATTAZIONE])).toBe(false)
    })

    /*
     * Giudice v1547: la via del controller ha ancora una prova che il riassunto si fa, con un fornitore tarato a 0,4 (i token veri
     * sono 0,4 × la stima del PC della richiesta che riceve). A rapporto 1 su questa finestra da 4.000 non si può: sistema e attrezzi
     * pesano ~2.700 token e l'ultima risposta ~2.290, il pavimento (5.023) sta già oltre il limite (3.499). A 0,4 il riassunto parte
     * DA SOLO durante gli scambi, prima di «Compatta ora»: la prova lo dice e lo controlla.
     */
    it('CTRL-COMP-01b fornitore tarato a 0,4: il riassunto parte da solo durante gli scambi, separato e senza attrezzi, e la richiesta dopo lo porta', async () => {
        rapporto = 0.4
        const { controller, repository } = setup()
        await controller.init()
        const sessione = await conversazione(controller)
        const [richiesta] = chiamateDiRiassunto()
        expect(richiesta).toBeDefined()
        expect(richiesta!.tools ?? []).toHaveLength(0)
        expect(richiesta!.turns.some((t) => t.content === 'domanda 0')).toBe(true)
        const riga = (await repository.listMessages(sessione)).find((r) => r.metadata?.[TALOS_METADATA_COMPATTAZIONE])
        expect(riga).toMatchObject({ role: 'system' })
        expect((riga!.metadata[TALOS_METADATA_COMPATTAZIONE] as { motivo: string }).motivo).not.toBe('manuale')
        await controller.send('e adesso?')
        const ultima = provider.complete.mock.calls.at(-1)![0] as Input
        expect(ultima.turns.some((t) => t.content.includes('RIASSUNTO DEL CONTROLLER'))).toBe(true)
        expect(ultima.turns.some((t) => t.content === 'domanda 0')).toBe(false)
    })

    /*
     * ⭐⭐ Owner 02/10 «Token veri»: con un fornitore remoto il numero vero dell'ultima richiesta TARA la stima; la riga
     * porta la misura «fornitore», non «stimato».
     */
    it('CTRL-COMP-03 i numeri della compattazione sono tarati sul numero vero del fornitore', async () => {
        const { controller, repository } = setup()
        await controller.init()
        promptDellaRisposta = 9_000
        // 9.000 token veri su una finestra di 4.000: la compattazione parte DA SOLA durante la conversazione.
        const sessione = await conversazione(controller)
        const riga = (await repository.listMessages(sessione)).find((r) => r.metadata?.[TALOS_METADATA_COMPATTAZIONE])!
        expect(riga).toBeDefined()
        const { record } = riga.metadata[TALOS_METADATA_COMPATTAZIONE] as { record: { tokenPrima: number, tokenDopo: number, misura: string } }
        expect(record.misura).toBe('fornitore')
        // L'ultima richiesta vera era 9.000 token: la richiesta di adesso (quella più la risposta) è vicina, non la stima a caratteri.
        expect(record.tokenPrima).toBeGreaterThanOrEqual(9_000)
        expect(record.tokenPrima).toBeLessThan(13_000)
        expect(record.tokenDopo).toBeLessThanOrEqual(record.tokenPrima * 0.7)
    })

    it('CTRL-COMP-02 da sola: la risposta dice 3.000 token su una finestra di 4.000 ⇒ si compatta subito dopo', async () => {
        const { controller, repository } = setup()
        await controller.init()
        const sessione = await conversazione(controller)
        expect(chiamateDiRiassunto()).toHaveLength(0)
        promptDellaRisposta = 3_000
        await controller.send('una domanda lunga')
        expect(chiamateDiRiassunto()).toHaveLength(1)
        const righe = await repository.listMessages(sessione)
        expect(righe.filter((r) => r.metadata?.[TALOS_METADATA_COMPATTAZIONE])).toHaveLength(1)
        // Ordine nella storia: la risposta, poi la riga (la compattazione è successa DOPO la risposta).
        const ultime = righe.slice(-2).map((r) => r.role)
        expect(ultime).toEqual(['assistant', 'system'])
    })
})
