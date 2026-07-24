import { describe, expect, it, vi } from 'vitest'
import { geminiAdapter } from '@/lib/chat/providers/geminiAdapter'
import type { TalosMobileHttpTransport } from '@/lib/chat/httpTransport'

function transportWith(...responses: Array<{ status: number; data: unknown }>) {
    const request = vi.fn()
    responses.forEach((response) => request.mockResolvedValueOnce(response))
    return { request, transport: { request } as TalosMobileHttpTransport }
}

describe('Gemini mobile adapter', () => {
    it('AV-09 maps canonical parts to generateContent text and inlineData', async () => {
        const { request, transport } = transportWith({
            status: 200,
            data: { candidates: [{ content: { parts: [{ text: 'seen' }] } }] },
        })
        await geminiAdapter.complete({
            model: {
                id: 'gemini-chat', provider: 'gemini', displayName: 'Gemini Chat',
                chatCompatibility: 'supported', inputModalities: ['text', 'image'],
                outputModalities: ['text'], supportedParameters: ['generateContent'],
            },
            turns: [{
                role: 'user', content: 'Inspect.', parts: [{
                    type: 'image', attachmentId: 'image-1', name: 'image.png', mediaType: 'image/png',
                    base64: 'aGVsbG8=', sha256: 'a'.repeat(64),
                }],
            }],
            effort: 'off', thinking: false,
        }, { apiKey: 'sentinel-secret' }, transport)

        expect(request.mock.calls[0][0].data.contents[0]).toEqual({
            role: 'user',
            parts: [
                { text: 'Inspect.' },
                { inlineData: { mimeType: 'image/png', data: 'aGVsbG8=' } },
            ],
        })
    })

    it('paginates models and derives compatibility only from supported generation methods', async () => {
        const { request, transport } = transportWith(
            { status: 200, data: { models: [{ name: 'models/gemini-chat', displayName: 'Gemini Chat', supportedGenerationMethods: ['generateContent'], inputTokenLimit: 1000, outputTokenLimit: 100 }], nextPageToken: 'next page' } },
            { status: 200, data: { models: [{ name: 'models/gemini-embed', displayName: 'Gemini Embed', supportedGenerationMethods: ['embedContent'] }] } },
        )
        const catalog = await geminiAdapter.listModels({ apiKey: 'sentinel-secret' }, transport)

        expect(catalog.models).toEqual(expect.arrayContaining([
            // N1.5: generateContent Gemini models are multimodal → declare image;
            // an embed-only model stays text (and is chat-unsupported anyway).
            expect.objectContaining({ id: 'gemini-chat', displayName: 'Gemini Chat', chatCompatibility: 'supported', contextLength: 1000, inputModalities: expect.arrayContaining(['image']) }),
            expect.objectContaining({ id: 'gemini-embed', chatCompatibility: 'unsupported', inputModalities: ['text'] }),
        ]))
        expect(new URL(request.mock.calls[1][0].url).searchParams.get('pageToken')).toBe('next page')
        expect(request.mock.calls[0][0].headers['x-goog-api-key']).toBe('sentinel-secret')
    })

    it('applies configured Capacitor timeouts to the official model endpoint', async () => {
        const { request, transport } = transportWith({
            status: 200,
            data: { models: [] },
        })

        await geminiAdapter.listModels({ apiKey: 'sentinel-secret', timeoutMs: 30_000 }, transport)

        expect(request).toHaveBeenCalledWith(expect.objectContaining({
            url: expect.stringContaining('https://generativelanguage.googleapis.com/v1beta/models?'),
            connectTimeout: 30_000,
            readTimeout: 30_000,
        }))
    })

    it('maps conversation roles and parses all text parts from generateContent', async () => {
        const { request, transport } = transportWith({
            status: 200,
            data: { modelVersion: 'gemini-chat-001', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'one' }, { text: ' two' }] } }] },
        })
        const result = await geminiAdapter.complete({
            model: { id: 'gemini-chat', provider: 'gemini', displayName: 'Gemini Chat', chatCompatibility: 'supported', inputModalities: [], outputModalities: ['text'], supportedParameters: ['generateContent'] },
            turns: [{ role: 'user', content: 'Q1' }, { role: 'assistant', content: 'A1' }, { role: 'user', content: 'Q2' }],
            system: 'sys', effort: 'off', thinking: false,
        }, { apiKey: 'sentinel-secret', timeoutMs: 35_000 }, transport)

        expect(result).toMatchObject({ text: 'one two', model: 'gemini-chat-001', finishReason: 'STOP' })
        expect(request.mock.calls[0][0].url).toContain('/models/gemini-chat:generateContent')
        expect(request.mock.calls[0][0].data.contents.map((entry: { role: string }) => entry.role)).toEqual(['user', 'model', 'user'])
        expect(request.mock.calls[0][0]).toMatchObject({
            connectTimeout: 35_000,
            readTimeout: 35_000,
        })
    })
})
