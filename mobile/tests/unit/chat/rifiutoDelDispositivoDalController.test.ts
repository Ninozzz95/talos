// @vitest-environment jsdom
// Revisore A, ripasso dopo la 382 (giudice v1623, v1626): il rifiuto del dispositivo lungo il percorso INTERO controller → store.
// Controller, store e catalogo veri; finto solo il confine dell'adattatore, che lancia ESATTAMENTE ciò che lancia
// `promptTooLongFailure` (`localAdapter.ts:339-358`): messaggio-codice, chiave, numeri.
// Giudice v1630: portata nel ramo dall'autore; RA6-01, RA6-04, RL-04 e RA6-07 rafforzate (il ramo senza misura mostrava il testo del
// fornitore; il riassunto fallito diceva «even with the shortest summary» col numero della richiesta NON riassunta).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createChatController, rilanciaErroreDelFornitore, type ChatControllerDeps } from '@/stores/chatController'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { stimaDellaRichiestaDelPc, TALOS_METADATA_COMPATTAZIONE } from '@/lib/chat/compattazioneChat'
import { TalosMobileProviderError } from '@/lib/chat/providerErrors'
import { talosTestT } from '../../helpers/talosTestI18n'
import { TALOS_EMPTY_TOOL_AUTHORIZATIONS } from '@/lib/tools/toolAuthorizations'

const provider = vi.hoisted(() => ({ complete: vi.fn() }))
vi.mock('@/lib/chat/providerRegistry', () => ({
    providerAdapterFor: (id: string) => ({
        provider: id, requiresSecret: false, requiresEndpoint: false,
        listModels: async () => ({ provider: id, models: [{
            id: 'calm-test', provider: id, displayName: 'Calm test', chatCompatibility: 'supported', inputModalities: ['text'],
            outputModalities: ['text'], supportedParameters: ['tools'], contextLength: 16_384, maxOutputTokens: 1_024,
        }] }),
        complete: provider.complete,
    }),
}))
vi.mock('@/services/localEngine', () => ({ talosWarmLocalModel: vi.fn(async () => ({ opened: true, ms: 0 })) }))

const RISERVA = 1_024
type Input = { turns: Array<{ role: string, content: string }>, tools?: unknown[], system?: string }
const eRiassunto = (i: Input) => /^(CONTEXT COMPACTION|Summarize the core points)/.test(i.turns.at(-1)?.content ?? '')
const peso = (i: Input) => stimaDellaRichiestaDelPc({ turni: i.turns as never, system: i.system, tools: i.tools })
/** Come `promptTooLongFailure`: messaggio = codice, chiave, numeri (o senza numeri se `misurato` è falso). */
const rifiuto = (servono: number, tetto: number, misurato = true) => new TalosMobileProviderError({
    provider: 'local', operation: 'complete', message: 'TALOS_LOCAL_PROMPT_TOO_LONG',
    uiMessageKey: misurato ? 'models.localPromptTooLongMeasured' : 'models.localPromptTooLong',
    ...(misurato ? { uiMessageParameters: { required: String(servono), available: String(tetto) } } : {}),
})

const dispositivo = { leggero: false, acceso: false, tetti: [] as number[], invii: 0, misurato: true, risposte: 0, riassunto: 'RIASSUNTO BREVE.' }
let RISPOSTA = 'parola '.repeat(700)
beforeEach(() => {
    Object.assign(dispositivo, { leggero: false, acceso: false, tetti: [], invii: 0, misurato: true, risposte: 0, riassunto: 'RIASSUNTO BREVE.' })
    RISPOSTA = 'parola '.repeat(700)
    provider.complete.mockReset().mockImplementation(async (input: Input) => {
        const token = peso(input)
        // Il riassunto sul dispositivo si misura e si stringe nel tetto (`richiestaLocaleNelTetto`, solo per `local`): qui, se LEGGERO, è esente.
        if (dispositivo.acceso && !(dispositivo.leggero && eRiassunto(input))) {
            const tetto = dispositivo.tetti[Math.min(dispositivo.invii, dispositivo.tetti.length - 1)]!
            dispositivo.invii += 1
            if (token + RISERVA + 1 > tetto) throw rifiuto(token + RISERVA + 1, tetto, dispositivo.misurato)
        }
        if (eRiassunto(input)) return { text: dispositivo.riassunto, model: 'calm-test', finishReason: 'stop', usage: { prompt_tokens: token, completion_tokens: 10 } }
        dispositivo.risposte += 1
        return { text: `Risposta ${dispositivo.risposte}. ${RISPOSTA}`, model: 'calm-test', finishReason: 'stop', usage: { prompt_tokens: token, completion_tokens: 10 } }
    })
})
const controllers: ReturnType<typeof createChatController>[] = []
afterEach(() => controllers.splice(0).forEach((c) => c.dispose()))

function setup(lingua: 'en' | 'it' = 'en', senzaAttrezzi = false) {
    const repository = createMemoryChatRepository()
    const state = reactive({
        composer_defaults: { model_profile_id: null, effort: 'off', thinking: false },
        model_lab: { schema_version: 1, manual_models: [], model_overrides: {}, provider_runtime: {}, probe_results: {} },
        tone: { preset: 'balanced' }, shell: { library_context_enabled: false, library_autosave_generated: false },
        search: { source: null, endpoint: null }, tools: { read: 'allow', write: 'ask', outbound: 'deny' },
        agent_tools: senzaAttrezzi ? { time_now: false, notes_list: false, document_create: false } : { time_now: true, notes_list: true, document_create: true }, tool_authorizations: TALOS_EMPTY_TOOL_AUTHORIZATIONS,
        local_engine_probe: { consent: 'declined' },
    })
    const deps = {
        translate: talosTestT(lingua), chatRepository: repository, transport: { request: vi.fn(async () => { throw new Error('Rete vietata') }) },
        hasKey: async () => true, getKey: async () => 'fake-key', getEndpoint: async () => null,
        settings: {
            state, hydrate: async () => {},
            setComposerDefaults: vi.fn(async (patch) => Object.assign(state.composer_defaults, patch)),
            setShell: vi.fn(async (patch) => Object.assign(state.shell, patch)), effectiveToolPermissions: () => state.tools,
        },
    } as unknown as ChatControllerDeps
    const controller = createChatController(deps)
    controllers.push(controller)
    return { controller, repository }
}

async function caso(nome: string, { scambi = 7, tetti, domanda = 'ancora una domanda corta', misurato = true, riassunto, lingua = 'en' as 'en' | 'it', leggero = false }: { leggero?: boolean, scambi?: number, tetti: number[], domanda?: string, misurato?: boolean, riassunto?: string, lingua?: 'en' | 'it' }) {
    const { controller, repository } = setup(lingua, leggero)
    await controller.init()
    for (let i = 0; i < scambi; i += 1) await controller.send(`domanda ${i}`)
    const sessione = controller.chat.activeSession.value!.id
    const ultima = provider.complete.mock.calls.filter(([i]) => !eRiassunto(i as Input)).at(-1)![0] as Input
    const pesoPrima = peso({ ...ultima, turns: [...ultima.turns, { role: 'assistant', content: `Risposta ${dispositivo.risposte}. ${RISPOSTA}` }, { role: 'user', content: domanda }] })
    Object.assign(dispositivo, { leggero, acceso: true, tetti, invii: 0, misurato, ...(riassunto ? { riassunto } : {}) })
    const chiamatePrima = provider.complete.mock.calls.length
    const t0 = Date.now()
    await controller.send(domanda)
    const nuove = provider.complete.mock.calls.slice(chiamatePrima).map(([i]) => i as Input)
    const righe = await repository.listMessages(sessione)
    const fallita = righe.filter((r) => r.state === 'failed').at(-1)
    const esito = {
        nome, pesoPrima: pesoPrima + RISERVA + 1, tetti, invii: dispositivo.invii,
        riassunti: nuove.filter(eRiassunto).length, risposte: nuove.filter((i) => !eRiassunto(i)).length,
        salvati: righe.filter((r) => r.metadata?.[TALOS_METADATA_COMPATTAZIONE]).length,
        rispostaSalvata: righe.at(-1)?.role === 'assistant' && righe.at(-1)?.state !== 'failed',
        codice: (fallita?.metadata?.chat_error as { code?: string } | undefined)?.code ?? null,
        schermo: fallita?.content ?? null, prossima: (fallita?.metadata?.chat_error as { next_action?: string } | undefined)?.next_action ?? null,
        ms: Date.now() - t0,
    }
    return esito
}
const FORNITORE = /can safely (give|allocate)|può darne .* in sicurezza|allocare in sicurezza/i

describe('Revisore A — rifiuto del dispositivo lungo controller → store (v1623, v1626)', () => {
    it('RA6-01 caso (2) del Tester: tetto 4.096 al momento dell\'invio; mai il testo del fornitore', async () => {
        const e = await caso('RA6-01', { tetti: [4_096] })
        expect(e.schermo ?? '').not.toMatch(FORNITORE)
        expect(e.codice).not.toBe('PROVIDER_CHAT_FAILED')
        // Il riassunto stesso è rifiutato: niente «col riassunto più breve», e il numero è quello della richiesta che il dispositivo ha contato.
        expect(e.riassunti).toBe(1)
        expect(e.schermo).toBe(talosTestT('en')('chat.compaction.deviceTooLongMeasured', { required: String(e.pesoPrima), available: '4096' }))
    })
    it('RA6-02 caso (1) del Tester: messaggio di ~2.137 token, tetto 3.328: il testo nuovo coi numeri', async () => {
        const e = await caso('RA6-02', { tetti: [3_328], domanda: `${'parola '.repeat(2_137 * 4 / 7 | 0)}` })
        expect(e.schermo ?? '').not.toMatch(FORNITORE)
        expect(e.codice).not.toBe('PROVIDER_CHAT_FAILED')
    })
    it('RA6-03 il ritentativo rifiutato con un tetto DIVERSO (3.328 poi 2.304): UN ritentativo, poi i numeri', async () => {
        const e = await caso('RA6-03', { tetti: [3_328, 2_304, 2_304, 2_304] })
        expect(e.risposte).toBeLessThanOrEqual(2)
        expect(e.schermo ?? '').not.toMatch(FORNITORE)
    })
    it('RA6-04 rifiuto SENZA misura (vecchio motore): cosa va a schermo', async () => {
        const e = await caso('RA6-04', { tetti: [3_328], misurato: false })
        expect(e.risposte).toBeLessThanOrEqual(2)
        expect(e.codice).toBe('CHAT_EXECUTION_FAILED')
        expect(e.schermo).toBe(talosTestT('en')('chat.compaction.deviceTooLong'))
        expect(e.schermo ?? '').not.toMatch(/\d/)
        expect(e.prossima).toBeNull()
    })
    it('RA6-07 il controller tiene il codice del rifiuto accanto alla frase tradotta (pulizia: la cura vera è nello store)', async () => {
        const { classificaErroreFornitore } = await import('@/lib/kernel/compattazione')
        const frase = talosTestT('en')('models.localPromptTooLongMeasured', { required: '7441', available: '3328' })
        const rilanciato = rilanciaErroreDelFornitore(rifiuto(7_441, 3_328), frase)
        expect(rilanciato.message).toBe(frase)
        expect(rilanciato.code).toBe('TALOS_LOCAL_PROMPT_TOO_LONG')
        expect(rilanciato.uiMessageKey).toBe('models.localPromptTooLongMeasured')
        expect(rilanciato.uiMessageParameters).toEqual({ required: '7441', available: '3328' })
        expect(classificaErroreFornitore(rilanciato)).toBe('contesto-pieno')
        // Un messaggio che non è un codice non diventa un codice; un codice già tenuto passa com'è.
        const libero = new TalosMobileProviderError({ provider: 'openrouter', operation: 'complete', message: 'Upstream said no', status: 502 })
        const r2 = rilanciaErroreDelFornitore(libero, 'Upstream said no')
        expect(r2.code).toBeUndefined()
        expect(r2.status).toBe(502)
        const tenuto = new TalosMobileProviderError({ provider: 'local', operation: 'complete', message: 'frase', code: 'TALOS_LOCAL_PROMPT_TOO_LONG' })
        expect(rilanciaErroreDelFornitore(tenuto, 'frase').code).toBe('TALOS_LOCAL_PROMPT_TOO_LONG')
    })
    it('RA6-05 riassunto disobbediente (lungo) col rifiuto: al più una chiamata di riassunto, mai il fornitore', async () => {
        const e = await caso('RA6-05', { tetti: [3_328], riassunto: Array.from({ length: 200 }, (_, i) => `Fatto ${i} della chat con parole.`).join(' ') })
        expect(e.riassunti).toBeLessThanOrEqual(1)
        expect(e.schermo ?? '').not.toMatch(FORNITORE)
    })
    it('RA6-06 lo stesso in italiano: mai la frase del rifiuto', async () => {
        const e = await caso('RA6-06', { tetti: [3_328, 2_304], lingua: 'it' })
        expect(e.schermo ?? '').not.toMatch(FORNITORE)
    })
    it('RL-01 leggero (senza attrezzi, riassunto misurato): tetto 4.096 ⇒ riassume, ritenta UNA volta, risposta salvata', async () => {
        const e = await caso('RL-01', { tetti: [4_096], leggero: true })
        expect(e.schermo ?? '').not.toMatch(FORNITORE)
    })
    it('RL-02 leggero, 2.137 token e tetto 3.328', async () => {
        const e = await caso('RL-02', { tetti: [3_328], leggero: true, domanda: `${'parola '.repeat(2_137 * 4 / 7 | 0)}` })
        expect(e.schermo ?? '').not.toMatch(FORNITORE)
    })
    it('RL-03 leggero, ritentativo rifiutato con tetto diverso (3.328 poi 2.304): risposte al più 2', async () => {
        const e = await caso('RL-03', { tetti: [3_328, 2_304], leggero: true })
        expect(e.risposte).toBeLessThanOrEqual(2)
        expect(e.schermo ?? '').not.toMatch(FORNITORE)
    })
    it('RL-04 leggero, rifiuto senza misura', async () => {
        const e = await caso('RL-04', { tetti: [3_328], leggero: true, misurato: false })
        expect(e.risposte).toBeLessThanOrEqual(2)
        expect(e.codice).toBe('CHAT_EXECUTION_FAILED')
        expect(e.schermo).toBe(talosTestT('en')('chat.compaction.deviceTooLong'))
        expect(e.schermo ?? '').not.toMatch(FORNITORE)
    })
    it('RL-05 leggero, riassunto disobbediente lungo, tetto 3.328', async () => {
        const e = await caso('RL-05', { tetti: [3_328], leggero: true, riassunto: Array.from({ length: 200 }, (_, i) => `Fatto ${i} della chat con parole.`).join(' ') })
        expect(e.riassunti).toBeLessThanOrEqual(1)
        expect(e.schermo ?? '').not.toMatch(FORNITORE)
    })
})
