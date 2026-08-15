import { describe, expect, it, vi } from 'vitest'
import { geminiAdapter } from '@/lib/chat/providers/geminiAdapter'
import { ollamaAdapter } from '@/lib/chat/providers/ollamaAdapter'
import { defineTalosTool } from '@/lib/tools/registry'
import { z } from 'zod'
import type { TalosMobileCompletionInput, TalosMobileHttpTransport } from '@/lib/chat/providerContracts'

/**
 * Gemini and Ollama shipped with the translation helpers written and TESTED —
 * and imported by neither adapter. The result was the quietest failure in the
 * app: on those two providers the model was never offered a tool, `toolCalls`
 * came back undefined, the loop exited at round 0, and the user was told "I
 * don't have access to your files" with no error and no chip. Switching
 * provider silently changed what TALOS could do.
 *
 * The two wire formats are NOT the OpenAI one, and neither matches results by
 * call id — both match by NAME:
 *  - Gemini: results are a `user` turn carrying `functionResponse` parts;
 *  - Ollama: results are a `tool` turn carrying `tool_name`.
 */
const searchTool = defineTalosTool({
    name: 'library_search',
    title: 'Search the Library',
    description: 'Find documents by meaning.',
    action: 'read',
    input: z.object({ query: z.string().min(1) }),
    async run() {
        return { ok: true, content: '' }
    },
})

function transportWith(data: unknown): TalosMobileHttpTransport {
    return { request: vi.fn(async () => ({ status: 200, data, headers: {} })) } as never
}

function bodyOf(transport: TalosMobileHttpTransport): Record<string, unknown> {
    const [call] = (transport.request as unknown as { mock: { calls: Array<[{ data: unknown }]> } }).mock.calls
    return call![0].data as Record<string, unknown>
}

function input(provider: string, modelId: string): TalosMobileCompletionInput {
    return {
        model: {
            id: modelId, provider: provider as never, displayName: modelId, chatCompatibility: 'supported',
            inputModalities: ['text'], outputModalities: ['text'], supportedParameters: [],
        },
        turns: [
            { role: 'user', content: 'quanto devo?' },
            {
                role: 'assistant',
                content: 'Guardo nella Libreria.',
                toolCalls: [{ id: 'library_search-0', name: 'library_search', arguments: '{"query":"fattura"}' }],
            },
            { role: 'tool', content: 'found: fattura 2196', toolCallId: 'library_search-0', toolName: 'library_search' },
        ],
        effort: 'off',
        thinking: false,
        tools: [searchTool as never],
    }
}

describe('gemini tool wiring', () => {
    const answer = {
        modelVersion: 'gemini-3-pro',
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Sono 2196 euro.' }] } }],
    }

    it('advertises the tools as functionDeclarations', async () => {
        const transport = transportWith(answer)
        await geminiAdapter.complete(input('gemini', 'gemini-3-pro'), { apiKey: 'k' }, transport)
        expect(bodyOf(transport).tools).toEqual([{
            functionDeclarations: [expect.objectContaining({ name: 'library_search' })],
        }])
    })

    it('never sends $schema, which Gemini rejects outright', async () => {
        const transport = transportWith(answer)
        await geminiAdapter.complete(input('gemini', 'gemini-3-pro'), { apiKey: 'k' }, transport)
        expect(JSON.stringify(bodyOf(transport))).not.toContain('$schema')
    })

    it('sends a result as a user turn carrying functionResponse, matched by NAME', async () => {
        const transport = transportWith(answer)
        await geminiAdapter.complete(input('gemini', 'gemini-3-pro'), { apiKey: 'k' }, transport)
        const contents = bodyOf(transport).contents as Array<{ role: string; parts: unknown[] }>
        expect(contents[1]).toMatchObject({
            role: 'model',
            parts: [
                { text: 'Guardo nella Libreria.' },
                { functionCall: { name: 'library_search', args: { query: 'fattura' } } },
            ],
        })
        expect(contents[2]).toMatchObject({
            role: 'user',
            parts: [{ functionResponse: { name: 'library_search', response: { result: 'found: fattura 2196' } } }],
        })
    })

    it('reads a functionCall back out, and a call-only turn is not malformed', async () => {
        const result = await geminiAdapter.complete(
            input('gemini', 'gemini-3-pro'), { apiKey: 'k' },
            transportWith({
                candidates: [{
                    finishReason: 'STOP',
                    content: { parts: [{ functionCall: { name: 'library_search', args: { query: 'fattura' } } }] },
                }],
            }),
        )
        expect(result.toolCalls).toEqual([
            { id: 'library_search-0', name: 'library_search', arguments: '{"query":"fattura"}' },
        ])
        expect(result.text).toBe('')
    })
})

describe('ollama tool wiring', () => {
    const answer = { model: 'qwen3', message: { role: 'assistant', content: 'Sono 2196 euro.' }, done: true }

    it('advertises the tools in the OpenAI shape Ollama speaks', async () => {
        const transport = transportWith(answer)
        await ollamaAdapter.complete(input('ollama', 'qwen3'), { endpoint: 'http://localhost:11434' }, transport)
        expect(bodyOf(transport).tools).toEqual([
            expect.objectContaining({ type: 'function', function: expect.objectContaining({ name: 'library_search' }) }),
        ])
    })

    it('sends a result as a tool message keyed by tool_name, not by id', async () => {
        const transport = transportWith(answer)
        await ollamaAdapter.complete(input('ollama', 'qwen3'), { endpoint: 'http://localhost:11434' }, transport)
        const messages = bodyOf(transport).messages as Array<Record<string, unknown>>
        expect(messages.at(-1)).toMatchObject({
            role: 'tool',
            tool_name: 'library_search',
            content: 'found: fattura 2196',
        })
        expect(messages.at(-2)).toMatchObject({
            role: 'assistant',
            tool_calls: [{ function: { name: 'library_search', arguments: { query: 'fattura' } } }],
        })
    })

    it('reads tool_calls back out of the message', async () => {
        const result = await ollamaAdapter.complete(
            input('ollama', 'qwen3'), { endpoint: 'http://localhost:11434' },
            transportWith({
                model: 'qwen3',
                message: {
                    role: 'assistant',
                    content: '',
                    tool_calls: [{ function: { name: 'library_search', arguments: { query: 'fattura' } } }],
                },
                done: true,
            }),
        )
        expect(result.toolCalls).toEqual([
            { id: 'library_search-0', name: 'library_search', arguments: '{"query":"fattura"}' },
        ])
    })
})
