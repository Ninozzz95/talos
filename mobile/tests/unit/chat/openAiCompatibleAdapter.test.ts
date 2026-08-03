import { describe, expect, it, vi } from 'vitest'
import {
    deepSeekAdapter,
    openAiAdapter,
    openRouterAdapter,
} from '@/lib/chat/providers/openAiCompatibleAdapter'
import type { TalosMobileHttpTransport } from '@/lib/chat/httpTransport'
import { defineTalosTool } from '@/lib/tools/registry'
import { z } from 'zod'

const libraryTool = defineTalosTool({
    name: 'library_list',
    title: 'List the Library',
    description: 'List Library files.',
    action: 'read',
    input: z.object({}),
    async run() {
        return { ok: true, content: '' }
    },
})

function transportWith(...responses: Array<{ status: number; data: unknown }>) {
    const request = vi.fn()
    responses.forEach((response) => request.mockResolvedValueOnce(response))
    return { request, transport: { request } as TalosMobileHttpTransport }
}

describe('OpenAI-compatible mobile adapters', () => {
    it('AV-09 maps canonical image and document parts without leaking AVM fields', async () => {
        const { request, transport } = transportWith({
            status: 200,
            data: { model: 'gpt-vision', choices: [{ message: { content: 'seen' }, finish_reason: 'stop' }] },
        })
        await deepSeekAdapter.complete({
            model: {
                id: 'gpt-vision', provider: 'openai', displayName: 'Vision',
                chatCompatibility: 'supported', inputModalities: ['text', 'image'],
                outputModalities: ['text'], supportedParameters: [],
            },
            turns: [{
                role: 'user',
                content: 'Inspect.',
                parts: [
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
            effort: 'off',
            thinking: false,
        }, { apiKey: 'sentinel-secret' }, transport)

        expect(request.mock.calls[0][0].data.messages[0]).toEqual({
            role: 'user',
            content: [
                { type: 'text', text: 'Inspect.' },
                { type: 'image_url', image_url: { url: 'data:image/png;base64,aGVsbG8=' } },
                { type: 'text', text: '[Untrusted attachment: notes.txt]\nUntrusted notes' },
            ],
        })
        expect(JSON.stringify(request.mock.calls[0][0].data)).not.toContain('attachmentId')
        expect(JSON.stringify(request.mock.calls[0][0].data)).not.toContain('sha256')
    })

    it('normalizes the complete OpenAI model list without inventing capabilities', async () => {
        const { request, transport } = transportWith({
            status: 200,
            data: { object: 'list', data: [
                { id: 'gpt-alpha', object: 'model', created: 1, owned_by: 'openai' },
                { id: 'embedding-alpha', object: 'model', created: 2, owned_by: 'openai' },
            ] },
        })
        const catalog = await openAiAdapter.listModels({ apiKey: 'sentinel-secret' }, transport)

        expect(catalog.models.map((model) => model.id)).toEqual(['gpt-alpha', 'embedding-alpha'])
        expect(catalog.models.every((model) => model.chatCompatibility === 'unknown')).toBe(true)
        expect(request.mock.calls[0][0]).toMatchObject({
            method: 'GET',
            url: 'https://api.openai.com/v1/models',
            headers: { authorization: 'Bearer sentinel-secret' },
        })
    })

    it('uses the current DeepSeek list and chat endpoints', async () => {
        const { request, transport } = transportWith(
            { status: 200, data: { object: 'list', data: [{ id: 'deepseek-v4-flash', object: 'model', owned_by: 'deepseek' }] } },
            { status: 200, data: { model: 'deepseek-v4-flash', choices: [{ message: { role: 'assistant', content: 'pong' }, finish_reason: 'stop' }] } },
        )
        const catalog = await deepSeekAdapter.listModels({ apiKey: 'sentinel-secret' }, transport)
        const completion = await deepSeekAdapter.complete({
            model: catalog.models[0]!,
            turns: [{ role: 'user', content: 'ping' }],
            system: 'sys',
            effort: 'off',
            thinking: false,
        }, { apiKey: 'sentinel-secret', timeoutMs: 60_000 }, transport)

        expect(completion).toMatchObject({ text: 'pong', model: 'deepseek-v4-flash' })
        expect(request.mock.calls[1][0]).toMatchObject({
            method: 'POST',
            url: 'https://api.deepseek.com/chat/completions',
            connectTimeout: 60_000,
            readTimeout: 60_000,
        })
        expect(request.mock.calls[1][0].data.messages).toEqual([
            { role: 'system', content: 'sys' },
            { role: 'user', content: 'ping' },
        ])
    })

    it('uses an explicit OpenAI-compatible base URL and real Capacitor timeouts', async () => {
        const { request, transport } = transportWith(
            {
                status: 200,
                data: { object: 'list', data: [{ id: 'custom-model', object: 'model' }] },
            },
            {
                status: 200,
                data: { model: 'custom-model', choices: [{ message: { content: 'TALOS_PROBE_OK' } }] },
            },
        )

        const credential = {
            apiKey: 'sentinel-secret',
            endpoint: 'https://models.example.test/v1/',
            timeoutMs: 45_000,
        }
        const catalog = await openAiAdapter.listModels(credential, transport)
        await deepSeekAdapter.complete({
            model: catalog.models[0]!,
            turns: [{ role: 'user', content: 'Reply exactly TALOS_PROBE_OK' }],
            effort: 'off',
            thinking: false,
        }, credential, transport)

        expect(request).toHaveBeenCalledWith(expect.objectContaining({
            url: 'https://models.example.test/v1/models',
            connectTimeout: 45_000,
            readTimeout: 45_000,
        }))
        expect(request).toHaveBeenCalledWith(expect.objectContaining({
            url: 'https://models.example.test/v1/chat/completions',
            connectTimeout: 45_000,
            readTimeout: 45_000,
        }))
    })

    it('preserves OpenRouter catalog metadata and marks non-text output unsupported for chat', async () => {
        const { transport } = transportWith({
            status: 200,
            data: { data: [
                {
                    id: 'vendor/text-model',
                    canonical_slug: 'vendor/text-model-v1',
                    name: 'Text Model',
                    context_length: 131072,
                    architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
                    supported_parameters: ['tools', 'reasoning'],
                    expiration_date: null,
                },
                {
                    id: 'vendor/image-model',
                    name: 'Image Model',
                    architecture: { input_modalities: ['text'], output_modalities: ['image'] },
                    supported_parameters: [],
                },
            ] },
        })
        const catalog = await openRouterAdapter.listModels({ apiKey: 'sentinel-secret' }, transport)

        expect(catalog.models[0]).toMatchObject({
            id: 'vendor/text-model',
            canonicalSlug: 'vendor/text-model-v1',
            displayName: 'Text Model',
            contextLength: 131072,
            inputModalities: ['text', 'image'],
            supportedParameters: ['tools', 'reasoning'],
            chatCompatibility: 'supported',
        })
        expect(catalog.models[1]?.chatCompatibility).toBe('unsupported')
    })

    it('OPENROUTER-TOOLS-01 omits tool parameters when the selected model does not declare tools', async () => {
        const { request, transport } = transportWith({
            status: 200,
            data: { model: 'vendor/plain', choices: [{ message: { content: 'plain reply' }, finish_reason: 'stop' }] },
        })

        await openRouterAdapter.complete({
            model: {
                id: 'vendor/plain',
                provider: 'openrouter',
                displayName: 'Plain model',
                chatCompatibility: 'supported',
                inputModalities: ['text'],
                outputModalities: ['text'],
                supportedParameters: [],
            },
            turns: [{ role: 'user', content: 'List files' }],
            tools: [libraryTool] as never,
            effort: 'off',
            thinking: false,
        }, { apiKey: 'sentinel-secret' }, transport)

        expect(request.mock.calls[0][0].data).not.toHaveProperty('tools')
        expect(request.mock.calls[0][0].data).not.toHaveProperty('tool_choice')
    })

    it('OPENROUTER-TOOLS-02 retains canonical tool parameters for a capable model', async () => {
        const { request, transport } = transportWith({
            status: 200,
            data: { model: 'vendor/tools', choices: [{ message: { content: 'ready' }, finish_reason: 'stop' }] },
        })

        await openRouterAdapter.complete({
            model: {
                id: 'vendor/tools',
                provider: 'openrouter',
                displayName: 'Tool model',
                chatCompatibility: 'supported',
                inputModalities: ['text'],
                outputModalities: ['text'],
                supportedParameters: ['tools'],
            },
            turns: [{ role: 'user', content: 'List files' }],
            tools: [libraryTool] as never,
            effort: 'off',
            thinking: false,
        }, { apiKey: 'sentinel-secret' }, transport)

        expect(request.mock.calls[0][0].data.tools).toEqual([
            expect.objectContaining({
                type: 'function',
                function: expect.objectContaining({ name: 'library_list' }),
            }),
        ])
        expect(request.mock.calls[0][0].data.tool_choice).toBe('auto')
    })

    it('accepts documented nested OpenRouter usage while keeping canonical numeric metrics', async () => {
        const { transport } = transportWith({
            status: 200,
            data: {
                model: 'openrouter/free',
                choices: [{
                    finish_reason: 'stop',
                    native_finish_reason: 'stop',
                    message: { role: 'assistant', content: 'TALOS_OK', reasoning: 'internal' },
                }],
                usage: {
                    prompt_tokens: 8,
                    completion_tokens: 4,
                    total_tokens: 12,
                    cost: 0,
                    prompt_tokens_details: { cached_tokens: 0 },
                    completion_tokens_details: { reasoning_tokens: 2 },
                },
            },
        })

        const completion = await openRouterAdapter.complete({
            model: {
                id: 'openrouter/free', provider: 'openrouter', displayName: 'Free router',
                chatCompatibility: 'supported', inputModalities: ['text'], outputModalities: ['text'],
                supportedParameters: [],
            },
            turns: [{ role: 'user', content: 'Reply exactly TALOS_OK' }],
            effort: 'off',
            thinking: false,
        }, { apiKey: 'sentinel-secret' }, transport)

        expect(completion.text).toBe('TALOS_OK')
        expect(completion.usage).toEqual({
            prompt_tokens: 8,
            completion_tokens: 4,
            total_tokens: 12,
            cost: 0,
        })
    })

    it('rejects malformed and failed list responses without leaking the key', async () => {
        const { transport } = transportWith({ status: 401, data: { error: { message: 'invalid key' } } })
        const failure = openAiAdapter.listModels({ apiKey: 'sentinel-secret' }, transport)
        await expect(failure).rejects.toMatchObject({ provider: 'openai', operation: 'list_models', status: 401 })
        await expect(failure).rejects.not.toThrow(/sentinel-secret/)
    })
})

describe('l endpoint, per provider', () => {
    /**
     * Owner 2026-08-03: su `/v1/chat/completions` i modelli OpenAI nuovi
     * rifiutano tool e ragionamento insieme, e TALOS offre i tool a ogni
     * messaggio. La deviazione e' per il SOLO OpenAI, e questo test esiste
     * perche' il modo piu' facile di rompere tre provider e' correggerne uno.
     */
    function transportFor(data: unknown) {
        const request = vi.fn().mockResolvedValue({ status: 200, data })
        return { request, transport: { request } as unknown as TalosMobileHttpTransport }
    }

    const messaggio = {
        model: 'x',
        input: [{ role: 'user' as const, content: 'ciao' }],
    }

    it('manda OpenAI su /v1/responses, con il corpo nuovo', async () => {
        const { request, transport } = transportFor({
            status: 'completed',
            output: [{ type: 'message', content: [{ type: 'output_text', text: 'ciao' }] }],
            usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        })
        await openAiAdapter.complete({
            model: { id: 'gpt-5.6-luna', provider: 'openai', displayName: 'Luna', supportedParameters: [] },
            turns: [{ role: 'user', content: 'ciao' }],
            system: 'Sei TALOS.',
            effort: 'high',
        } as never, { apiKey: 'k' }, transport)

        const inviata = request.mock.calls[0]![0] as { url: string, data: Record<string, unknown> }
        expect(inviata.url).toMatch(/\/responses$/)
        // `instructions` e `input`, non `messages`. E il ragionamento resta
        // quello scelto: e' tutto il punto della migrazione.
        expect(inviata.data.instructions).toBe('Sei TALOS.')
        expect(inviata.data.input).toBeDefined()
        expect(inviata.data.messages).toBeUndefined()
        expect(inviata.data.reasoning).toEqual({ effort: 'high' })
        expect(inviata.data.store).toBe(false)
    })

    it('lascia DeepSeek e OpenRouter dove stavano', async () => {
        for (const adapter of [deepSeekAdapter, openRouterAdapter]) {
            const { request, transport } = transportFor({
                model: 'x', choices: [{ message: { content: 'ciao' } }],
            })
            await adapter.complete({
                model: { id: 'x', provider: adapter.provider, displayName: 'X', supportedParameters: [] },
                turns: [{ role: 'user', content: 'ciao' }],
                effort: 'high',
            } as never, { apiKey: 'k' }, transport)

            const inviata = request.mock.calls[0]![0] as { url: string, data: Record<string, unknown> }
            expect(inviata.url).toMatch(/\/chat\/completions$/)
            expect(inviata.data.messages).toBeDefined()
            expect(inviata.data.input).toBeUndefined()
        }
    })
})

describe('il ciclo dei tool, che qui non ha un ruolo tool', () => {
    /**
     * Su chat/completions il risultato e' un messaggio `role:"tool"` con
     * `tool_call_id`. Su `/v1/responses` sono ELEMENTI: `function_call` per la
     * richiesta e `function_call_output` per la risposta, appaiati da `call_id`.
     *
     * Con `store:false` il contesto lo ricostruiamo noi a ogni richiesta, quindi
     * la chiamata originale va RIMESSA accanto al suo risultato: se manca, il
     * modello riceve un esito senza sapere di che domanda fosse.
     */
    it('rimette la chiamata accanto al suo risultato', async () => {
        const request = vi.fn().mockResolvedValue({
            status: 200,
            data: { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'trovato' }] }] },
        })
        await openAiAdapter.complete({
            model: { id: 'gpt-5.6-luna', provider: 'openai', displayName: 'Luna', supportedParameters: [] },
            effort: 'off',
            turns: [
                { role: 'user', content: 'Cerca batteria.' },
                { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'library_search', arguments: '{"query":"batteria"}' }] },
                { role: 'tool', content: '[{"nome":"batteria.md"}]', toolCallId: 'call_1' },
            ],
        } as never, { apiKey: 'k' }, { request } as unknown as TalosMobileHttpTransport)

        const items = (request.mock.calls[0]![0] as { data: { input: Array<Record<string, unknown>> } }).data.input
        expect(items).toEqual([
            { role: 'user', content: 'Cerca batteria.' },
            { type: 'function_call', call_id: 'call_1', name: 'library_search', arguments: '{"query":"batteria"}' },
            { type: 'function_call_output', call_id: 'call_1', output: '[{"nome":"batteria.md"}]' },
        ])
        // Nessun `role: "tool"`: quel ruolo su questo endpoint non esiste.
        expect(items.some((item) => item.role === 'tool')).toBe(false)
    })

    it('non lascia mai un risultato senza il suo call_id', async () => {
        // Due risultati con lo stesso identificativo vuoto sarebbero due esiti
        // che non si sa a chi appartengono.
        const request = vi.fn().mockResolvedValue({
            status: 200,
            data: { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }] },
        })
        await openAiAdapter.complete({
            model: { id: 'gpt-5.6-luna', provider: 'openai', displayName: 'Luna', supportedParameters: [] },
            effort: 'off',
            turns: [
                { role: 'assistant', content: '', toolCalls: [{ id: 'call_a', name: 'x', arguments: '{}' }] },
                { role: 'tool', content: 'primo', toolCallId: 'call_a' },
            ],
        } as never, { apiKey: 'k' }, { request } as unknown as TalosMobileHttpTransport)

        const items = (request.mock.calls[0]![0] as { data: { input: Array<Record<string, unknown>> } }).data.input
        const risultato = items.find((item) => item.type === 'function_call_output')!
        expect(risultato.call_id).toBe('call_a')
    })
})
