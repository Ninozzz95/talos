import { describe, expect, it, vi } from 'vitest'
import {
    deepSeekAdapter,
    openAiAdapter,
    openRouterAdapter,
} from '@/lib/chat/providers/openAiCompatibleAdapter'
import type { TalosMobileHttpTransport } from '@/lib/chat/httpTransport'

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
        await openAiAdapter.complete({
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
        await openAiAdapter.complete({
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
