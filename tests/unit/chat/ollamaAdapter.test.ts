import { describe, expect, it, vi } from 'vitest'
import { ollamaAdapter } from '@/lib/chat/providers/ollamaAdapter'
import type { TalosMobileHttpTransport } from '@/lib/chat/httpTransport'

function transportWith(...responses: Array<{ status: number; data: unknown }>) {
    const request = vi.fn()
    responses.forEach((response) => request.mockResolvedValueOnce(response))
    return { request, transport: { request } as TalosMobileHttpTransport }
}

describe('Ollama mobile adapter', () => {
    it('AV-09 maps canonical image parts to the per-message images array', async () => {
        const { request, transport } = transportWith({
            status: 200,
            data: { model: 'llava', done: true, message: { role: 'assistant', content: 'seen' } },
        })
        await ollamaAdapter.complete({
            model: {
                id: 'llava', provider: 'ollama', displayName: 'Llava', chatCompatibility: 'supported',
                inputModalities: ['text', 'image'], outputModalities: ['text'], supportedParameters: [],
            },
            turns: [{
                role: 'user', content: 'Inspect.', parts: [{
                    type: 'image', attachmentId: 'image-1', name: 'image.png', mediaType: 'image/png',
                    base64: 'aGVsbG8=', sha256: 'a'.repeat(64),
                }],
            }],
            effort: 'off', thinking: false,
        }, { endpoint: 'http://10.0.0.4:11434' }, transport)

        expect(request.mock.calls[0][0].data.messages).toEqual([
            { role: 'user', content: 'Inspect.', images: ['aGVsbG8='] },
        ])
    })

    it('lists every locally installed model from an explicit endpoint', async () => {
        const { request, transport } = transportWith({
            status: 200,
            data: { models: [{ name: 'gemma3:4b', model: 'gemma3:4b', size: 123, digest: 'sha', details: { family: 'gemma', parameter_size: '4.3B', quantization_level: 'Q4_K_M' } }] },
        })
        const catalog = await ollamaAdapter.listModels({ endpoint: 'http://10.0.0.4:11434/' }, transport)

        expect(catalog.models[0]).toMatchObject({ id: 'gemma3:4b', displayName: 'gemma3:4b', chatCompatibility: 'unknown' })
        expect(request.mock.calls[0][0].url).toBe('http://10.0.0.4:11434/api/tags')
    })

    it('applies configured Capacitor timeouts to the explicit local endpoint', async () => {
        const { request, transport } = transportWith({
            status: 200,
            data: { models: [] },
        })

        await ollamaAdapter.listModels({ endpoint: 'http://10.0.0.4:11434', timeoutMs: 90_000 }, transport)

        expect(request).toHaveBeenCalledWith(expect.objectContaining({
            url: 'http://10.0.0.4:11434/api/tags',
            connectTimeout: 90_000,
            readTimeout: 90_000,
        }))
    })

    it('uses /api/chat with stream false and provider-supported thinking', async () => {
        const { request, transport } = transportWith({
            status: 200,
            data: { model: 'gemma3:4b', done: true, done_reason: 'stop', message: { role: 'assistant', content: 'pong' } },
        })
        const result = await ollamaAdapter.complete({
            model: { id: 'gemma3:4b', provider: 'ollama', displayName: 'gemma3:4b', chatCompatibility: 'unknown', inputModalities: [], outputModalities: ['text'], supportedParameters: ['think'] },
            turns: [{ role: 'user', content: 'ping' }], system: 'sys', effort: 'medium', thinking: true,
        }, { endpoint: 'http://10.0.0.4:11434', timeoutMs: 95_000 }, transport)

        expect(result).toMatchObject({ text: 'pong', model: 'gemma3:4b', finishReason: 'stop' })
        expect(request.mock.calls[0][0]).toMatchObject({
            method: 'POST',
            url: 'http://10.0.0.4:11434/api/chat',
            connectTimeout: 95_000,
            readTimeout: 95_000,
        })
        expect(request.mock.calls[0][0].data).toMatchObject({ stream: false, think: 'medium' })
    })

    it('I18N-CONFORMANCE-09 rejects missing or unsafe endpoints with stable error identities', async () => {
        const { transport } = transportWith()
        await expect(ollamaAdapter.listModels({}, transport))
            .rejects.toThrow('TALOS_PROVIDER_ENDPOINT_REQUIRED')
        await expect(ollamaAdapter.listModels({ endpoint: 'file:///tmp/socket' }, transport))
            .rejects.toThrow('TALOS_PROVIDER_ENDPOINT_PROTOCOL')
    })
})
