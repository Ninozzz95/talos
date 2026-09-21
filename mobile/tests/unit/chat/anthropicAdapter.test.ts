import { describe, expect, it, vi } from 'vitest'
import { anthropicAdapter } from '@/lib/chat/providers/anthropicAdapter'
import type { TalosMobileHttpTransport } from '@/lib/chat/httpTransport'

function transportWith(...responses: Array<{ status: number; data: unknown }>) {
    const request = vi.fn()
    responses.forEach((response) => request.mockResolvedValueOnce(response))
    return { request, transport: { request } as TalosMobileHttpTransport }
}

describe('Anthropic mobile adapter', () => {
    it('AV-09 maps canonical image and document parts to official Messages blocks', async () => {
        const { request, transport } = transportWith({
            status: 200,
            data: { model: 'claude-a', stop_reason: 'end_turn', content: [{ type: 'text', text: 'seen' }] },
        })
        await anthropicAdapter.complete({
            model: {
                id: 'claude-a', provider: 'anthropic', displayName: 'Claude A',
                chatCompatibility: 'supported', inputModalities: ['text', 'image'],
                outputModalities: ['text'], supportedParameters: [],
            },
            turns: [{
                role: 'user', content: 'Inspect.', parts: [
                    {
                        type: 'image', attachmentId: 'image-1', name: 'image.png', mediaType: 'image/png',
                        base64: 'aGVsbG8=', sha256: 'a'.repeat(64),
                    },
                    {
                        type: 'document_text', attachmentId: 'doc-1', name: 'notes.txt',
                        mediaType: 'text/plain', text: 'Untrusted notes', sha256: 'b'.repeat(64),
                    },
                ],
            }],
            effort: 'off', thinking: false,
        }, { apiKey: 'sentinel-secret' }, transport)

        expect(request.mock.calls[0][0].data.messages[0]).toEqual({
            role: 'user',
            content: [
                { type: 'text', text: 'Inspect.' },
                { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aGVsbG8=' } },
                // The last cacheable block of the last message carries the
                // rolling cache breakpoint, so the next round of the agent loop
                // reads this prefix back instead of paying for it again.
                // Asserted on a real request, not only on the pure builder.
                {
                    type: 'text',
                    text: '[Untrusted attachment: notes.txt]\nUntrusted notes',
                    cache_control: { type: 'ephemeral' },
                },
            ],
        })
    })

    it('paginates the official model endpoint and preserves display names', async () => {
        const { request, transport } = transportWith(
            { status: 200, data: { data: [{ id: 'claude-a', display_name: 'Claude A', type: 'model', created_at: '2026-01-01' }], has_more: true, last_id: 'claude-a' } },
            { status: 200, data: { data: [{ id: 'claude-b', display_name: 'Claude B', type: 'model', created_at: '2026-01-02' }], has_more: false, last_id: 'claude-b' } },
        )
        const catalog = await anthropicAdapter.listModels({ apiKey: 'sentinel-secret' }, transport)

        expect(catalog.models.map((model) => [model.id, model.displayName])).toEqual([
            ['claude-a', 'Claude A'],
            ['claude-b', 'Claude B'],
        ])
        // N1.5 root-cause fix: every current Claude model is vision-capable, so
        // discovery MUST declare image input — otherwise attaching an image
        // hard-fails at send ("does not declare image input support").
        expect(catalog.models.every((model) => model.inputModalities.includes('image'))).toBe(true)
        expect(request.mock.calls[0][0].url).toContain('/v1/models?limit=1000')
        expect(request.mock.calls[1][0].url).toContain('after_id=claude-a')
    })

    it('sends full multi-turn context through Messages and parses text blocks', async () => {
        const { request, transport } = transportWith({
            status: 200,
            data: { id: 'msg-1', model: 'claude-a', stop_reason: 'end_turn', content: [
                { type: 'thinking', thinking: 'private' },
                { type: 'text', text: 'Hello ' },
                { type: 'text', text: 'world' },
            ] },
        })
        const result = await anthropicAdapter.complete({
            model: { id: 'claude-a', provider: 'anthropic', displayName: 'Claude A', chatCompatibility: 'supported', inputModalities: [], outputModalities: ['text'], supportedParameters: [] },
            turns: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello' }, { role: 'user', content: 'Continue' }],
            system: 'sys',
            effort: 'high',
            thinking: true,
        }, { apiKey: 'sentinel-secret', timeoutMs: 65_000 }, transport)

        expect(result).toMatchObject({ text: 'Hello world', model: 'claude-a', finishReason: 'end_turn' })
        expect(request.mock.calls[0][0].data.messages).toHaveLength(3)
        // Adaptive is what an unknown model is asked for first: it is where
        // Anthropic is going, and the models that refuse it are the ones being
        // retired. The adapter learns the older shape from the provider's 400.
        expect(request.mock.calls[0][0].data.thinking).toMatchObject({ type: 'adaptive' })
        expect(request.mock.calls[0][0]).toMatchObject({
            connectTimeout: 65_000,
            readTimeout: 65_000,
        })
    })

    it('applies configured Capacitor timeouts without changing the official endpoint', async () => {
        const { request, transport } = transportWith({
            status: 200,
            data: { data: [], has_more: false },
        })

        await anthropicAdapter.listModels({ apiKey: 'sentinel-secret', timeoutMs: 75_000 }, transport)

        expect(request).toHaveBeenCalledWith(expect.objectContaining({
            url: expect.stringContaining('https://api.anthropic.com/v1/models?'),
            connectTimeout: 75_000,
            readTimeout: 75_000,
        }))
    })
})

/**
 * C45-RED-19E — il tetto di risposta viaggia dal catalogo alla richiesta.
 *
 * È il pezzo che mancava davvero: il client aveva un ripiego a 4096 e
 * l'adattatore non gli passava MAI un tetto, quindi il ripiego valeva per ogni
 * risposta di Claude. `GET /v1/models` dichiara `max_tokens` dal marzo 2026 e lo
 * schema lo lasciava passare inosservato.
 */
describe('C45-RED-19E declared output ceiling flows from catalogue to request', () => {
    it('reads max_tokens off the model list', async () => {
        const { transport } = transportWith({
            status: 200,
            data: {
                data: [{
                    id: 'claude-opus-5',
                    display_name: 'Claude Opus 5',
                    max_tokens: 128000,
                    max_input_tokens: 1000000,
                }],
                has_more: false,
                last_id: 'claude-opus-5',
            },
        })

        const catalog = await anthropicAdapter.listModels({ apiKey: 'k', endpoint: null }, transport)

        expect(catalog.models[0]).toMatchObject({ maxOutputTokens: 128000 })
    })

    it('says «not declared» rather than inventing one', async () => {
        const { transport } = transportWith({
            status: 200,
            data: {
                data: [{ id: 'claude-legacy', display_name: 'Legacy' }],
                has_more: false,
                last_id: 'claude-legacy',
            },
        })

        const catalog = await anthropicAdapter.listModels({ apiKey: 'k', endpoint: null }, transport)

        expect(catalog.models[0].maxOutputTokens).toBeNull()
    })

    it('asks the API for the declared ceiling instead of the local fallback', async () => {
        const { request, transport } = transportWith({
            status: 200,
            data: { model: 'claude-opus-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] },
        })

        await anthropicAdapter.complete({
            model: {
                id: 'claude-opus-5', provider: 'anthropic', displayName: 'Claude Opus 5',
                chatCompatibility: 'supported', inputModalities: ['text'],
                outputModalities: ['text'], supportedParameters: [],
                maxOutputTokens: 128000,
            },
            turns: [{ role: 'user', content: 'Scrivi a lungo.' }],
        } as never, { apiKey: 'k', endpoint: null }, transport)

        expect(request.mock.calls[0][0].data.max_tokens).toBe(128000)
    })
})

/**
 * ⛔⛔⛔ DOPO UN RISULTATO DI TOOL, IL SILENZIO È LEGITTIMO.
 *
 * ## Misurato sul Pad il 2026-08-14
 *
 * «spegni la torcia» → la torcia si spegneva davvero (08:26:23 in `dumpsys`),
 * compariva «Torcia spenta.», e **subito dopo** `PROVIDER_CHAT_FAILED`. Ogni
 * volta, su ogni chat, con ogni modello Anthropic.
 *
 * La causa è una differenza fra provider: **Claude parla INSIEME alla
 * chiamata**, Gemini tace. Al giro finale — quello dopo il risultato — Claude
 * non ha più niente da dire e chiude senza testo e senza chiamate. Noi lo
 * dichiaravamo malformato.
 *
 * ⇒ È la stessa differenza che produceva il testo doppio.
 */
describe('risposta vuota dopo un tool', () => {
    it('⛔⛔ una risposta VUOTA dopo un tool result NON è un errore', async () => {
        const { transport } = transportWith({
            status: 200,
            data: { model: 'claude-a', stop_reason: 'end_turn', content: [] },
        })

        const esito = await anthropicAdapter.complete({
            model: {
                id: 'claude-a', provider: 'anthropic', displayName: 'Claude A',
                chatCompatibility: 'supported', inputModalities: ['text'],
                outputModalities: ['text'], supportedParameters: [],
            },
            turns: [
                { role: 'user', content: 'spegni la torcia' },
                { role: 'assistant', content: 'Torcia spenta.', toolCalls: [{ id: 't1', name: 'device_torch', arguments: '{}' }] },
                { role: 'tool', content: 'done', toolCallId: 't1' },
            ],
            effort: 'off', thinking: false,
        } as never, { apiKey: 'k' }, transport)

        expect(esito.text).toBe('')
    })

    /*
     * ⛔ E LA GUARDIA RESTA dove è nata: al primo giro una risposta senza testo
     * e senza chiamate è davvero un guasto — il modello non ha detto niente e
     * non ha chiesto niente, e senza questa riga si vedrebbe una bolla vuota.
     */
    it('⛔ ma al PRIMO giro una risposta vuota resta un errore', async () => {
        const { transport } = transportWith({
            status: 200,
            data: { model: 'claude-a', stop_reason: 'end_turn', content: [] },
        })

        await expect(anthropicAdapter.complete({
            model: {
                id: 'claude-a', provider: 'anthropic', displayName: 'Claude A',
                chatCompatibility: 'supported', inputModalities: ['text'],
                outputModalities: ['text'], supportedParameters: [],
            },
            turns: [{ role: 'user', content: 'ciao' }],
            effort: 'off', thinking: false,
        } as never, { apiKey: 'k' }, transport)).rejects.toThrow()
    })
})
