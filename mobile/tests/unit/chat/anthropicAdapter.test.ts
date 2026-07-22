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
                { type: 'text', text: '[Untrusted attachment: notes.txt]\nUntrusted notes' },
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
        expect(request.mock.calls[0][0].data.thinking).toMatchObject({ type: 'enabled' })
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
