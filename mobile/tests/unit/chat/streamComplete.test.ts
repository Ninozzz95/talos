import { afterEach, describe, expect, it, vi } from 'vitest'
import { anthropicAdapter } from '@/lib/chat/providers/anthropicAdapter'
import { deepSeekAdapter } from '@/lib/chat/providers/openAiCompatibleAdapter'
import { geminiAdapter } from '@/lib/chat/providers/geminiAdapter'
import { ollamaAdapter } from '@/lib/chat/providers/ollamaAdapter'
import type { TalosMobileCompletionInput } from '@/lib/chat/providerContracts'

// F2-T4 — adapter streamComplete implementations: native fetch SSE/NDJSON,
// chunks forwarded live, pre-first-byte HTTP failures thrown for fallback.
function inputFor(provider: string, modelId: string): TalosMobileCompletionInput {
    return {
        model: {
            id: modelId, provider: provider as never, displayName: modelId, chatCompatibility: 'supported',
            inputModalities: ['text'], outputModalities: ['text'], supportedParameters: [],
        },
        turns: [{ role: 'user', content: 'hi' }],
        effort: 'off',
        thinking: false,
    }
}

function streamResponse(chunks: string[], status = 200): Response {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
            controller.close()
        },
    })
    return new Response(body, { status })
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('anthropicAdapter.streamComplete (F2-T4)', () => {
    it('streams content_block_delta text with the direct-browser-access header', async () => {
        const fetchMock = vi.fn(async () => streamResponse([
            'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\n\n',
            'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}\n\n',
            'data: {"type":"message_stop"}\n\n',
        ]))
        vi.stubGlobal('fetch', fetchMock)
        const chunks: string[] = []
        const result = await anthropicAdapter.streamComplete!(
            inputFor('anthropic', 'claude-opus-4-8'),
            { apiKey: 'secret' },
            { onChunk: (text) => chunks.push(text) },
        )
        expect(chunks).toEqual(['Hel', 'lo'])
        expect(result.text).toBe('Hello')
        const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
        expect((init.headers as Record<string, string>)['anthropic-dangerous-direct-browser-access']).toBe('true')
        expect(JSON.parse(init.body as string).stream).toBe(true)
    })

    it('throws before any chunk on HTTP failure so the router can fall back', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => streamResponse(['forbidden'], 403)))
        const onChunk = vi.fn()
        await expect(anthropicAdapter.streamComplete!(
            inputFor('anthropic', 'claude-opus-4-8'),
            { apiKey: 'secret' },
            { onChunk },
        )).rejects.toThrow(/403/)
        expect(onChunk).not.toHaveBeenCalled()
    })
})

describe('openAiCompatibleAdapter.streamComplete (F2-T4)', () => {
    it('streams choices[0].delta.content with stream:true', async () => {
        const fetchMock = vi.fn(async () => streamResponse([
            'data: {"choices":[{"delta":{"content":"An"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"swer"}}]}\n\ndata: [DONE]\n\n',
        ]))
        vi.stubGlobal('fetch', fetchMock)
        const chunks: string[] = []
        const result = await deepSeekAdapter.streamComplete!(
            inputFor('deepseek', 'deepseek-chat'),
            { apiKey: 'secret' },
            { onChunk: (text) => chunks.push(text) },
        )
        expect(chunks).toEqual(['An', 'swer'])
        expect(result.text).toBe('Answer')
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
        expect(url).toMatch(/\/chat\/completions$/)
        expect(JSON.parse(init.body as string).stream).toBe(true)
    })
})

describe('geminiAdapter.streamComplete (F2-T4)', () => {
    it('streams candidates[0].content.parts text via :streamGenerateContent?alt=sse', async () => {
        const fetchMock = vi.fn(async () => streamResponse([
            'data: {"candidates":[{"content":{"parts":[{"text":"Ge"}]}}]}\n\n',
            'data: {"candidates":[{"content":{"parts":[{"text":"mini"}]}}]}\n\n',
        ]))
        vi.stubGlobal('fetch', fetchMock)
        const chunks: string[] = []
        const result = await geminiAdapter.streamComplete!(
            inputFor('gemini', 'gemini-2.5-pro'),
            { apiKey: 'secret' },
            { onChunk: (text) => chunks.push(text) },
        )
        expect(chunks).toEqual(['Ge', 'mini'])
        expect(result.text).toBe('Gemini')
        const [url] = fetchMock.mock.calls[0] as unknown as [string]
        expect(url).toContain(':streamGenerateContent?alt=sse')
    })
})

describe('ollamaAdapter.streamComplete (F2-T4)', () => {
    it('streams NDJSON message.content lines', async () => {
        const fetchMock = vi.fn(async () => streamResponse([
            '{"message":{"content":"Lo"},"done":false}\n{"message":{"content":"cal"},"done":false}\n',
            '{"message":{"content":""},"done":true}\n',
        ]))
        vi.stubGlobal('fetch', fetchMock)
        const chunks: string[] = []
        const result = await ollamaAdapter.streamComplete!(
            inputFor('ollama', 'llama3.2'),
            { apiKey: null, endpoint: 'http://localhost:11434' },
            { onChunk: (text) => chunks.push(text) },
        )
        expect(chunks).toEqual(['Lo', 'cal'])
        expect(result.text).toBe('Local')
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
        expect(url).toBe('http://localhost:11434/api/chat')
        expect(JSON.parse(init.body as string).stream).toBe(true)
    })
})
