// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TalosStreamRequest } from '@/lib/chat/providers/streamShared'

/**
 * N15 — il piano ChatGPT a pezzi (owner 13/10/2026: «Sì, risposta a pezzi»). Dove c'è il flusso nativo il piano lo usa, e
 * il registro smette di dire che il flusso è irraggiungibile; dove non c'è (web, build senza plugin) resta la strada di
 * `392ff15a0`: niente tentativo inutile dalla pagina, risposta intera dal trasporto nativo.
 */
const nativo = vi.hoisted(() => ({
    disponibile: true,
    richieste: [] as TalosStreamRequest[],
    copione: [] as string[],
}))

vi.mock('@/lib/chat/flussoNativoDisponibile', () => ({ talosFlussoNativoDisponibile: () => nativo.disponibile }))
vi.mock('@/lib/chat/providers/flussoNativo', () => ({
    talosFlussoNativo: async (request: TalosStreamRequest) => {
        nativo.richieste.push(request)
        for (const riga of nativo.copione) request.onText(riga)
    },
}))

const fetchSpia = vi.fn(async () => { throw new TypeError('Failed to fetch') })

beforeEach(() => {
    nativo.disponibile = true
    nativo.richieste = []
    nativo.copione = []
    fetchSpia.mockClear()
    vi.stubGlobal('fetch', fetchSpia)
})

const INGRESSO = {
    model: { id: 'gpt-5.6-luna' },
    turns: [{ role: 'user', content: 'Che cos è un fiume?' }],
    system: 'Sei TALOS.',
} as never

describe('il piano ChatGPT e il flusso nativo', () => {
    it('N15-FLUSSO-01: il registro dichiara il flusso irraggiungibile SOLO dove il flusso nativo non c è', async () => {
        const { TALOS_MOBILE_PROVIDER_ADAPTERS } = await import('@/lib/chat/providerRegistry')
        nativo.disponibile = true
        expect(TALOS_MOBILE_PROVIDER_ADAPTERS.chatgpt.flussoNonRaggiungibileDallaPagina).not.toBe(true)
        nativo.disponibile = false
        expect(TALOS_MOBILE_PROVIDER_ADAPTERS.chatgpt.flussoNonRaggiungibileDallaPagina).toBe(true)
        // gli altri fornitori non c'entrano
        expect(TALOS_MOBILE_PROVIDER_ADAPTERS.openrouter.flussoNonRaggiungibileDallaPagina).toBeUndefined()
    })

    it('N15-FLUSSO-02: col flusso nativo il piano consegna il testo a pezzi, senza toccare il fetch della pagina', async () => {
        const { chatgptAdapter } = await import('@/lib/chat/providers/openAiCompatibleAdapter')
        nativo.copione = [
            'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Un fiume "}\n\n',
            'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"è acqua che scorre."}\n\n',
            'event: response.completed\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":6,"total_tokens":16}}}\n\n',
        ]
        const pezzi: string[] = []
        const esito = await chatgptAdapter.streamComplete!(INGRESSO, { apiKey: 'token-del-piano' } as never, { onChunk: (t) => pezzi.push(t) } as never)
        expect(pezzi).toEqual(['Un fiume ', 'è acqua che scorre.'])
        expect(esito.text).toBe('Un fiume è acqua che scorre.')
        expect(fetchSpia).not.toHaveBeenCalled()
        expect(nativo.richieste).toHaveLength(1)
        expect(nativo.richieste[0]!.url).toBe('https://api.openai.com/v1/responses')
        expect(nativo.richieste[0]!.headers.authorization).toBe('Bearer token-del-piano')
        expect((nativo.richieste[0]!.body as { stream?: boolean }).stream).toBe(true)
    })

    it('N15-FLUSSO-03 AL CONTRARIO: senza flusso nativo il piano non lo chiama; e la chiave OpenAI non lo usa mai', async () => {
        const { chatgptAdapter, openAiAdapter } = await import('@/lib/chat/providers/openAiCompatibleAdapter')
        nativo.disponibile = false
        await expect(chatgptAdapter.streamComplete!(INGRESSO, { apiKey: 't' } as never, { onChunk: () => {} } as never)).rejects.toThrow()
        expect(nativo.richieste).toHaveLength(0)
        nativo.disponibile = true
        await expect(openAiAdapter.streamComplete!(INGRESSO, { apiKey: 'sk-x' } as never, { onChunk: () => {} } as never)).rejects.toThrow()
        expect(nativo.richieste).toHaveLength(0)
        expect(fetchSpia).toHaveBeenCalledTimes(2)
    })
})
