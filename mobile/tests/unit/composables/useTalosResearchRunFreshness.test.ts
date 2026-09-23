// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import type { TalosResearchRun, TalosResearchStep } from '@/lib/research/researchRun'

const mockState = vi.hoisted(() => ({ controller: null as never }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => mockState.controller }))

import { useTalosResearchRun, type TalosResearchRunView } from '@/composables/useTalosResearchRun'

/**
 * Il verdetto non invecchia sulla pagina. (MB-1)
 *
 * ⛔ Misurato sul Pad il 12/09/2026 (foto RE5/RE6): una corsa conclusa col suo
 * rapporto veniva raccontata col verdetto misurato mezz'ora prima, quando il
 * rapporto non era ancora stato scritto. La lettura si faceva una volta sola e
 * non aveva modo di sapere che la corsa si era mossa.
 *
 * `ensureFresh` è la domanda che mancava — «quello che ho in mano parla ancora
 * di questa corsa?» — e queste prove la fanno nei due versi: rilegge quando la
 * corsa cambia, NON rilegge quando non è cambiato niente.
 */

const NIENTE = { tokens: 0, searches: 0, pages: 0 }

const SINTESI: TalosResearchStep = {
    id: 'synthesis',
    branchId: 'synthesis',
    kind: 'synthesise',
    state: 'done',
    attempts: 1,
    startedAt: '2026-09-12T10:30:00.000Z',
    finishedAt: '2026-09-12T10:36:00.000Z',
    spend: NIENTE,
    resultRef: 'vault:rapporto',
    error: null,
}

function corsa(over: Partial<TalosResearchRun> = {}): TalosResearchRun {
    return {
        id: 'run-1',
        sessionId: 'chat-1',
        question: 'quanto costa una pagina?',
        depth: 'quick',
        engine: 'device',
        status: 'synthesising',
        title: null,
        plan: [{ id: 'b1', question: 'prezzi', estimate: NIENTE }],
        steps: [],
        startedAt: '2026-09-12T10:00:00.000Z',
        updatedAt: '2026-09-12T10:30:00.000Z',
        ...over,
    }
}

const CONCLUSA = corsa({ status: 'done', steps: [SINTESI], updatedAt: '2026-09-12T10:36:00.000Z' })

const RAPPORTO = [
    '# quanto costa una pagina?',
    '',
    'Dipende dal fornitore.',
    '',
    '```talos-research-report',
    JSON.stringify({
        version: 1,
        question: 'quanto costa una pagina?',
        summary: 'Dipende dal fornitore.',
        judge: 'giudice-locale',
        claims: [{
            text: 'Una pagina costa fra 20 e 60 euro.',
            sourceIndex: 1,
            passage: 'Una pagina costa fra 20 e 60 euro.',
            checks: { quoteFound: 'yes', claimSupported: 'yes', supportReason: null, judge: 'giudice-locale' },
        }],
        sources: [{ url: 'https://example.org/prezzi', title: 'Il listino', publishedAt: null, obtained: 'page' }],
    }),
    '```',
].join('\n')

function banco(prima: TalosResearchRun, viva = true) {
    const stato = { corsa: prima, viva }
    const list = vi.fn(async () => [stato.corsa])
    const reportDocument = vi.fn(async () => RAPPORTO)
    mockState.controller = {
        catalogs: {},
        research: {
            registry: {
                watch: vi.fn(() => () => {}),
                isRunning: vi.fn(() => stato.viva),
                running: vi.fn(() => (stato.viva ? ['run-1'] : [])),
                latest: vi.fn(() => null),
                open: vi.fn(() => () => {}),
                close: vi.fn(),
            },
            list,
            reportDocument,
            report: vi.fn().mockResolvedValue(null),
        },
    } as never
    return { stato, list, reportDocument }
}

async function pagina() {
    let vista: TalosResearchRunView | null = null
    const Finta = defineComponent({
        setup() {
            vista = useTalosResearchRun(() => 'run-1')
            return () => h('div')
        },
    })
    const wrapper = mount(Finta)
    await flushPromises()
    return { wrapper, vista: vista as unknown as TalosResearchRunView }
}

describe('una lettura che scade quando la corsa si muove', () => {
    beforeEach(() => { vi.clearAllMocks() })

    it('⛔ la corsa finisce sotto gli occhi: il verdetto si rifà, senza riaprire niente', async () => {
        const banca = banco(corsa())
        const { vista } = await pagina()

        // Durante la sintesi non c'è nessun rapporto da leggere: il verdetto
        // misurato ora dice «non ci è arrivata», ed è vero ORA.
        expect(vista.completion.value).toBe('giri-esauriti')
        expect(vista.report.value).toBeNull()

        // La corsa finisce e scrive il rapporto.
        banca.stato.corsa = CONCLUSA
        banca.stato.viva = false
        await vista.ensureFresh(CONCLUSA)
        await flushPromises()

        expect(vista.completion.value).toBe('con-rapporto')
        expect(vista.report.value?.claims.length).toBe(1)
    })

    /* ⛔ AL CONTRARIO: se non è cambiato niente, non si torna sul disco. */
    it('⛔ la stessa identica corsa non fa rileggere niente', async () => {
        const banca = banco(corsa())
        const { vista } = await pagina()
        const letturePrima = banca.list.mock.calls.length

        await vista.ensureFresh(corsa())
        await flushPromises()

        expect(banca.list.mock.calls.length).toBe(letturePrima)
    })

    /*
     * ⛔ E mentre la corsa lavora non si rilegge a ogni passo: il verdetto su una
     * corsa in volo non si mostra (il secchio dice «in corso»), e una lettura per
     * passo sarebbe un giro su disco per niente.
     */
    it('⛔ un passo di una corsa ancora viva non fa rileggere niente', async () => {
        const banca = banco(corsa())
        const { vista } = await pagina()
        const letturePrima = banca.list.mock.calls.length

        await vista.ensureFresh(corsa({ updatedAt: '2026-09-12T10:31:00.000Z' }))
        await flushPromises()

        expect(banca.list.mock.calls.length).toBe(letturePrima)
    })

    it('⛔ ma un rapporto che COMPARE si legge subito, anche a corsa viva', async () => {
        const banca = banco(corsa())
        const { vista } = await pagina()
        const letturePrima = banca.list.mock.calls.length

        banca.stato.corsa = CONCLUSA
        await vista.ensureFresh(corsa({ steps: [SINTESI], updatedAt: '2026-09-12T10:36:00.000Z' }))
        await flushPromises()

        expect(banca.list.mock.calls.length).toBeGreaterThan(letturePrima)
        expect(vista.completion.value).toBe('con-rapporto')
    })

    it('una ricerca che non è questa pagina viene ignorata', async () => {
        const banca = banco(corsa())
        const { vista } = await pagina()
        const letturePrima = banca.list.mock.calls.length

        await vista.ensureFresh(corsa({ id: 'run-9', status: 'done', steps: [SINTESI] }))
        await flushPromises()

        expect(banca.list.mock.calls.length).toBe(letturePrima)
    })

    /*
     * ⛔ Una rilettura non spegne la pagina: `loading` accende «Sto aprendo…» al
     * posto di tutto il rapporto, e farlo a ogni aggiornamento sarebbe uno
     * sfarfallio al posto di una notizia.
     */
    it('⛔ la rilettura non riporta la pagina su «sto aprendo»', async () => {
        const banca = banco(corsa())
        const { vista } = await pagina()
        expect(vista.loading.value).toBe(false)

        banca.stato.corsa = CONCLUSA
        banca.stato.viva = false
        const inCorso = vista.ensureFresh(CONCLUSA)
        expect(vista.loading.value).toBe(false)
        await inCorso
        await flushPromises()
        expect(vista.loading.value).toBe(false)
    })
})
