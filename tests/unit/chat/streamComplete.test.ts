import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
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

/**
 * Defect #5 (owner): each family carries the model's reasoning on a different
 * field, and the first version of this feature shipped with Gemini's path DEAD
 * — the request never asked for thoughts, so the block could never appear.
 * These drive the REAL adapters, which is the only place that mistake is
 * visible.
 */
describe('reasoning capture per provider family (defect #5)', () => {
    it('anthropic: thinking_delta becomes reasoning, never answer text', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => streamResponse([
            'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"Valuto le opzioni."}}\n\n',
            'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Scegli la seconda."}}\n\n',
        ])))
        const thoughts: string[] = []
        const result = await anthropicAdapter.streamComplete!(
            inputFor('anthropic', 'claude-opus-4-8'),
            { apiKey: 'secret' },
            { onChunk: () => {}, onReasoning: (text) => thoughts.push(text) },
        )
        expect(result.text).toBe('Scegli la seconda.')
        expect(result.reasoning).toBe('Valuto le opzioni.')
        expect(thoughts).toEqual(['Valuto le opzioni.'])
    })

    it('deepseek: reasoning_content becomes reasoning, never answer text', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => streamResponse([
            'data: {"choices":[{"delta":{"reasoning_content":"Confronto i due casi."}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"Il primo."}}]}\n\n',
        ])))
        const result = await deepSeekAdapter.streamComplete!(
            inputFor('deepseek', 'deepseek-reasoner'),
            { apiKey: 'secret' },
            { onChunk: () => {} },
        )
        expect(result.text).toBe('Il primo.')
        expect(result.reasoning).toBe('Confronto i due casi.')
    })

    it('ollama: message.thinking becomes reasoning', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => streamResponse([
            '{"message":{"thinking":"Rifletto."}}\n',
            '{"message":{"content":"Fatto."},"done":true}\n',
        ])))
        const result = await ollamaAdapter.streamComplete!(
            inputFor('ollama', 'qwen3'),
            { apiKey: '', endpoint: 'http://localhost:11434' },
            { onChunk: () => {} },
        )
        expect(result.text).toBe('Fatto.')
        expect(result.reasoning).toBe('Rifletto.')
    })

    it('gemini: ASKS for thought summaries, then keeps them out of the answer', async () => {
        const fetchMock = vi.fn(async () => streamResponse([
            'data: {"candidates":[{"content":{"parts":[{"text":"Sto ragionando","thought":true},{"text":"Risposta."}]}}]}\n\n',
        ]))
        vi.stubGlobal('fetch', fetchMock)
        const input = { ...inputFor('gemini', 'gemini-2.5-pro'), thinking: true }
        const result = await geminiAdapter.streamComplete!(input, { apiKey: 'secret' }, { onChunk: () => {} })
        // Without this request field Gemini never returns a thought part, and
        // the extractor is dead code — which is exactly how it shipped first.
        const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
        expect(JSON.parse(String(init.body))).toMatchObject({
            generationConfig: { thinkingConfig: { includeThoughts: true } },
        })
        expect(result.text).toBe('Risposta.')
        expect(result.reasoning).toBe('Sto ragionando')
    })

    it('gemini: the BUFFERED path filters thoughts too, or they enter the history', async () => {
        const transport = {
            request: vi.fn(async () => ({
                status: 200,
                data: {
                    candidates: [{ content: { parts: [{ text: 'pensiero', thought: true }, { text: 'risposta' }] } }],
                    modelVersion: 'gemini-2.5-pro',
                },
            })),
        }
        const input = { ...inputFor('gemini', 'gemini-2.5-pro'), thinking: true }
        const result = await geminiAdapter.complete(input, { apiKey: 'secret' }, transport as never)
        expect(result.text).toBe('risposta')
        expect(result.reasoning).toBe('pensiero')
    })
})

/**
 * Tool calling on the wire. The two families here are the extremes: OpenAI
 * splits one call across indexed deltas and wants a `tool` role for results;
 * Anthropic streams `input_json_delta` fragments and has no tool role at all —
 * a result is a USER message of tool_result blocks. If both work, the shape of
 * the abstraction is right.
 */
describe('tool calls over the wire (tool block)', () => {
    const searchTool = {
        name: 'library_search',
        title: 'Search the Library',
        description: 'Find documents by meaning.',
        action: 'read' as const,
        input: z.object({ query: z.string() }),
        async run() { return { ok: true, content: '' } },
    }

    it('deepseek: sends the schema and reassembles a call split across deltas', async () => {
        const fetchMock = vi.fn(async () => streamResponse([
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"library_search","arguments":"{\\"qu"}}]}}]}\n\n',
            'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ery\\":\\"fattura\\"}"}}]}}]}\n\n',
        ]))
        vi.stubGlobal('fetch', fetchMock)
        const result = await deepSeekAdapter.streamComplete!(
            { ...inputFor('deepseek', 'deepseek-chat'), tools: [searchTool] as never },
            { apiKey: 'secret' },
            { onChunk: () => {} },
        )
        const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
        const body = JSON.parse(String(init.body)) as { tools?: Array<{ function: { name: string } }>; tool_choice?: string }
        expect(body.tools?.[0]?.function.name).toBe('library_search')
        expect(body.tool_choice).toBe('auto')
        expect(result.toolCalls).toEqual([
            { id: 'call_1', name: 'library_search', arguments: '{"query":"fattura"}' },
        ])
        // A turn that only calls tools has no text, and that is not an error.
        expect(result.text).toBe('')
        expect(result.finishReason).toBe('tool_calls')
    })

    it('deepseek: a tool RESULT turn becomes the tool role, tied to its call', async () => {
        const fetchMock = vi.fn(async () => streamResponse([
            'data: {"choices":[{"delta":{"content":"Ecco."}}]}\n\n',
        ]))
        vi.stubGlobal('fetch', fetchMock)
        await deepSeekAdapter.streamComplete!(
            {
                ...inputFor('deepseek', 'deepseek-chat'),
                turns: [
                    { role: 'user', content: 'cerca' },
                    { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'library_search', arguments: '{}' }] },
                    { role: 'tool', content: 'found: fattura', toolCallId: 'call_1' },
                ],
            },
            { apiKey: 'secret' },
            { onChunk: () => {} },
        )
        const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
        const body = JSON.parse(String(init.body)) as { messages: Array<Record<string, unknown>> }
        expect(body.messages[1]).toMatchObject({ role: 'assistant', tool_calls: [{ id: 'call_1' }] })
        expect(body.messages[2]).toMatchObject({ role: 'tool', tool_call_id: 'call_1', content: 'found: fattura' })
    })

    it('anthropic: reassembles input_json_delta fragments and maps results onto user blocks', async () => {
        const fetchMock = vi.fn(async () => streamResponse([
            'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"library_search"}}\n\n',
            'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"query\\":\\"x\\"}"}}\n\n',
        ]))
        vi.stubGlobal('fetch', fetchMock)
        const result = await anthropicAdapter.streamComplete!(
            {
                ...inputFor('anthropic', 'claude-opus-4-8'),
                tools: [searchTool] as never,
                turns: [
                    { role: 'user', content: 'cerca' },
                    { role: 'assistant', content: '', toolCalls: [{ id: 'toolu_0', name: 'library_search', arguments: '{"query":"y"}' }] },
                    { role: 'tool', content: 'trovato', toolCallId: 'toolu_0' },
                ],
            },
            { apiKey: 'secret' },
            { onChunk: () => {} },
        )
        const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
        const body = JSON.parse(String(init.body)) as {
            tools?: Array<{ name: string; input_schema: unknown }>
            messages: Array<{ role: string; content: unknown }>
        }
        // Anthropic wants input_schema, and a result is a USER message.
        expect(body.tools?.[0]).toMatchObject({ name: 'library_search' })
        expect(body.tools?.[0]).toHaveProperty('input_schema')
        expect(body.messages[1]).toMatchObject({ role: 'assistant' })
        expect((body.messages[1]!.content as Array<{ type: string }>)[0]).toMatchObject({ type: 'tool_use' })
        expect(body.messages[2]).toMatchObject({ role: 'user' })
        expect((body.messages[2]!.content as Array<{ type: string; tool_use_id: string }>)[0])
            .toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_0' })

        expect(result.toolCalls).toEqual([
            { id: 'toolu_1', name: 'library_search', arguments: '{"query":"x"}' },
        ])
    })
})
