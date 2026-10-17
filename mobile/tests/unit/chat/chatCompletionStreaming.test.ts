import { describe, expect, it, vi } from 'vitest'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'
import type { TalosMobileProviderModel } from '@/lib/chat/providerContracts'

// F2-T4 — attempt-and-fallback routing: stream when the adapter can, fall back
// to the buffered transport on any PRE-first-byte failure, and never retry once
// partial text has been delivered (the store persists the honest partial).
const registryMock = vi.hoisted(() => ({ providerAdapterFor: vi.fn() }))
vi.mock('@/lib/chat/providerRegistry', () => registryMock)

import { buildChatCompletion } from '@/lib/chat/chatCompletion'

const profile: TalosMobileModelProfileView = {
    id: 'claude-opus', provider: 'anthropic', model: 'claude-opus-4-8', display_name: 'Claude Opus 4.8',
    status: 'healthy', has_secret: true, effort_levels: ['low', 'medium', 'high'], supports_thinking: true,
    show_in_composer: true, capabilities: null, probe_ok: null,
}

const providerModel: TalosMobileProviderModel = {
    id: 'claude-opus-4-8', provider: 'anthropic', displayName: 'Claude Opus 4.8', chatCompatibility: 'supported',
    inputModalities: ['text'], outputModalities: ['text'], supportedParameters: ['thinking'],
}

function contextFor() {
    return { profile, providerModel, apiKey: 'secret', effort: 'off', thinking: false }
}

describe('buildChatCompletion streaming routing (F2-T4)', () => {
    it('streams through adapter.streamComplete and forwards chunks live', async () => {
        const streamComplete = vi.fn(async (_input, _credential, handlers) => {
            handlers.onChunk('He')
            handlers.onChunk('llo')
            return { text: 'Hello', model: 'claude-opus-4-8' }
        })
        const complete = vi.fn()
        registryMock.providerAdapterFor.mockReturnValue({
            provider: 'anthropic', requiresSecret: true, streamComplete, complete,
        })
        const completion = buildChatCompletion(contextFor)
        const chunks: string[] = []
        const text = await completion(
            [{ role: 'user', content: 'hi' }],
            { onChunk: (chunk) => chunks.push(chunk) },
        )
        expect(text.text).toBe('Hello')
        expect(chunks).toEqual(['He', 'llo'])
        expect(complete).not.toHaveBeenCalled()
    })

    it('falls back to buffered complete on PRE-first-byte stream failure', async () => {
        const streamComplete = vi.fn(async () => { throw new Error('stream HTTP 403: CORS') })
        const complete = vi.fn(async () => ({ text: 'Buffered answer', model: 'claude-opus-4-8' }))
        registryMock.providerAdapterFor.mockReturnValue({
            provider: 'anthropic', requiresSecret: true, streamComplete, complete,
        })
        const completion = buildChatCompletion(contextFor)
        const text = await completion([{ role: 'user', content: 'hi' }], { onChunk: () => {} })
        expect(text.text).toBe('Buffered answer')
        expect(streamComplete).toHaveBeenCalledOnce()
        expect(complete).toHaveBeenCalledOnce()
    })

    /**
     * N15-FORN-06 (13/10/2026) — un RIFIUTO del piano ChatGPT (limite d'uso, piano non abilitato…) non è un inciampo del
     * trasporto: rifare la richiesta dall'altra strada sarebbe un secondo invio contro lo stesso rifiuto. Esce com'è, e chi
     * sta sopra decide (al limite d'uso: aspetta).
     */
    it('N15-FORN-06: a ChatGPT plan refusal before the first byte does NOT fall back to a second request', async () => {
        const rifiuto = Object.assign(new Error('CHATGPT_LIMITE_DEL_PIANO'), { provider: 'chatgpt', attesaMs: 120_000 })
        const streamComplete = vi.fn(async () => { throw rifiuto })
        const complete = vi.fn(async () => ({ text: 'mai', model: 'gpt' }))
        registryMock.providerAdapterFor.mockReturnValue({
            provider: 'chatgpt', requiresSecret: true, streamComplete, complete,
        })
        const completion = buildChatCompletion(contextFor)
        await expect(completion([{ role: 'user', content: 'hi' }], { onChunk: () => {} })).rejects.toBe(rifiuto)
        expect(complete).not.toHaveBeenCalled()
    })

    /**
     * ⛔ N15-RITARDO-01 — owner 13/10/2026, dal Pad: «c'è molto delay da quando invio la domanda a quando ricevo la
     * risposta». MISURATO sull'app di sviluppo, cronometrando le chiamate: col piano ChatGPT ogni giro cominciava con un
     * `fetch` in flusso dalla pagina verso `api.openai.com/v1/responses`, che dalla WebView non può riuscire (OpenAI
     * rifiuta le origini di pagina) e falliva dopo 1,8 secondi; solo allora partiva la richiesta vera dal trasporto
     * nativo. Un fornitore che dichiara di non essere raggiungibile in flusso dalla pagina va subito dalla strada buona.
     */
    it('N15-RITARDO-01: an adapter that declares its stream unreachable from the page goes straight to the native request', async () => {
        const streamComplete = vi.fn(async () => { throw new TypeError('Failed to fetch') })
        const complete = vi.fn(async () => ({ text: 'Un fiume è un corso d acqua.', model: 'gpt' }))
        registryMock.providerAdapterFor.mockReturnValue({
            provider: 'chatgpt', requiresSecret: true, streamComplete, complete, flussoNonRaggiungibileDallaPagina: true,
        })
        const completion = buildChatCompletion(contextFor)
        const esito = await completion([{ role: 'user', content: 'hi' }], { onChunk: () => {} })
        expect(esito.text).toBe('Un fiume è un corso d acqua.')
        expect(streamComplete).not.toHaveBeenCalled()
        expect(complete).toHaveBeenCalledTimes(1)
        // ed è il piano ChatGPT a dichiararlo; gli altri fornitori no
        const veri = await vi.importActual<typeof import('@/lib/chat/providers/openAiCompatibleAdapter')>('@/lib/chat/providers/openAiCompatibleAdapter')
        expect(veri.chatgptAdapter.flussoNonRaggiungibileDallaPagina).toBe(true)
        expect(veri.openRouterAdapter.flussoNonRaggiungibileDallaPagina).toBeUndefined()
        // ⛔ e lo dichiara anche l'involucro del registro, che è ciò che `providerAdapterFor` consegna davvero: MISURATO sul
        // Pad, con la dichiarazione solo nel modulo il flusso inutile partiva ancora.
        const registro = await vi.importActual<typeof import('@/lib/chat/providerRegistry')>('@/lib/chat/providerRegistry')
        expect(registro.TALOS_MOBILE_PROVIDER_ADAPTERS.chatgpt.flussoNonRaggiungibileDallaPagina).toBe(true)
        expect(registro.TALOS_MOBILE_PROVIDER_ADAPTERS.openrouter.flussoNonRaggiungibileDallaPagina).toBeUndefined()
    })

    it('does NOT fall back once chunks were delivered — the error propagates', async () => {
        const streamComplete = vi.fn(async (_input, _credential, handlers) => {
            handlers.onChunk('Half ')
            throw new Error('connection reset')
        })
        const complete = vi.fn()
        registryMock.providerAdapterFor.mockReturnValue({
            provider: 'anthropic', requiresSecret: true, streamComplete, complete,
        })
        const completion = buildChatCompletion(contextFor)
        await expect(completion([{ role: 'user', content: 'hi' }], { onChunk: () => {} }))
            .rejects.toThrow('connection reset')
        expect(complete).not.toHaveBeenCalled()
    })

    it('does NOT fall back on user abort even before the first byte', async () => {
        const streamComplete = vi.fn(async () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            throw error
        })
        const complete = vi.fn()
        registryMock.providerAdapterFor.mockReturnValue({
            provider: 'anthropic', requiresSecret: true, streamComplete, complete,
        })
        const completion = buildChatCompletion(contextFor)
        await expect(completion([{ role: 'user', content: 'hi' }], { onChunk: () => {} }))
            .rejects.toMatchObject({ name: 'AbortError' })
        expect(complete).not.toHaveBeenCalled()
    })

    it('P1-CTX-ISO-07 abort signal state wins over a wrapped stream error', async () => {
        const abort = new AbortController()
        const streamComplete = vi.fn(async () => {
            abort.abort()
            throw new Error('reader closed after cancellation')
        })
        const complete = vi.fn(async () => ({
            text: 'This fallback must never run.',
            model: 'claude-opus-4-8',
        }))
        registryMock.providerAdapterFor.mockReturnValue({
            provider: 'anthropic', requiresSecret: true, streamComplete, complete,
        })
        const completion = buildChatCompletion(contextFor)

        await expect(completion(
            [{ role: 'user', content: 'hi' }],
            { onChunk: () => {}, signal: abort.signal },
        )).rejects.toMatchObject({ name: 'AbortError' })
        expect(streamComplete).toHaveBeenCalledOnce()
        expect(complete).not.toHaveBeenCalled()
    })

    it('uses buffered complete directly when the adapter cannot stream', async () => {
        const complete = vi.fn(async () => ({ text: 'Plain answer', model: 'claude-opus-4-8' }))
        registryMock.providerAdapterFor.mockReturnValue({
            provider: 'anthropic', requiresSecret: true, complete,
        })
        const completion = buildChatCompletion(contextFor)
        const text = await completion([{ role: 'user', content: 'hi' }], { onChunk: () => {} })
        expect(text.text).toBe('Plain answer')
        expect(complete).toHaveBeenCalledOnce()
    })
})
