import { describe, expect, it, vi } from 'vitest'
import { buildChatCompletion, ChatConfigError, type CompletionContext } from '@/lib/chat/chatCompletion'
import type { TalosMobileHttpTransport } from '@/lib/chat/httpTransport'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'
import type { TalosMobileProviderModel } from '@/lib/chat/providerContracts'
import { defineTalosTool } from '@/lib/tools/registry'
import { z } from 'zod'

const anthropicProfile: TalosMobileModelProfileView = {
    id: 'claude-opus', provider: 'anthropic', model: 'claude-opus-4-8', display_name: 'Claude Opus 4.8',
    status: 'healthy', has_secret: true, effort_levels: ['low', 'medium', 'high'], supports_thinking: true,
    show_in_composer: true, capabilities: null, probe_ok: null,
}

const anthropicModel: TalosMobileProviderModel = {
    id: 'claude-opus-4-8', provider: 'anthropic', displayName: 'Claude Opus 4.8', chatCompatibility: 'supported',
    inputModalities: ['text'], outputModalities: ['text'], supportedParameters: ['thinking'],
}

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

function transportReturning(text: string): { transport: TalosMobileHttpTransport; request: ReturnType<typeof vi.fn> } {
    const request = vi.fn().mockResolvedValue({ status: 200, data: { model: 'claude-opus', content: [{ type: 'text', text }] } })
    return { transport: { request }, request }
}

describe('buildChatCompletion', () => {
    it('AV-09 rejects an image before transport when the selected model has no observed vision capability', async () => {
        const request = vi.fn()
        const completion = buildChatCompletion(() => ({
            profile: {
                id: 'deepseek:deepseek-chat', provider: 'deepseek', model: 'deepseek-chat',
                display_name: 'DeepSeek Chat', status: 'healthy', has_secret: true,
                effort_levels: ['off'], supports_thinking: false, show_in_composer: true,
                capabilities: null, probe_ok: true,
            },
            providerModel: {
                id: 'deepseek-chat', provider: 'deepseek', displayName: 'DeepSeek Chat',
                chatCompatibility: 'supported', inputModalities: ['text'], outputModalities: ['text'],
                supportedParameters: [],
            },
            apiKey: 'secret',
            effort: 'off',
            thinking: false,
        }), { request })

        await expect(completion([{
            role: 'user',
            content: 'Inspect this.',
            parts: [{
                type: 'image', attachmentId: 'image-1', name: 'image.png', mediaType: 'image/png',
                base64: 'aGVsbG8=', sha256: 'a'.repeat(64),
            }],
        }])).rejects.toMatchObject({
            message: 'TALOS_CHAT_IMAGE_INPUT_UNSUPPORTED',
            uiMessageKey: 'chat.modelCannotReadImages',
        })
        expect(request).not.toHaveBeenCalled()
    })

    it('throws a config error when no model is selected', async () => {
        const complete = buildChatCompletion(() => ({ profile: null, apiKey: 'k', effort: 'off', thinking: false }))
        await expect(complete([{ role: 'user', content: 'hi' }])).rejects.toThrow(ChatConfigError)
    })

    it('throws a helpful config error when the provider key is missing', async () => {
        const complete = buildChatCompletion(() => ({ profile: anthropicProfile, apiKey: null, effort: 'off', thinking: false }))
        await expect(complete([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
            message: 'TALOS_CHAT_PROVIDER_KEY_REQUIRED',
            uiMessageKey: 'chat.addProviderKeyToChat',
        })
    })

    it('calls the Anthropic client with the selected model + key and returns the reply', async () => {
        const { transport, request } = transportReturning('pong')
        const ctx: CompletionContext = { profile: anthropicProfile, providerModel: anthropicModel, apiKey: 'sk-ant', timeoutMs: 47_000, effort: 'high', thinking: true, system: 'sys' }
        const complete = buildChatCompletion(() => ctx, transport)
        const out = await complete([{ role: 'user', content: 'ping' }])
        expect(out.text).toBe('pong')
        const arg = request.mock.calls[0][0]
        expect(arg.headers['x-api-key']).toBe('sk-ant')
        expect(arg.data.model).toBe('claude-opus-4-8')
        expect(arg.data.thinking).toEqual({ type: 'adaptive' })
        expect(arg.data.output_config).toEqual({ effort: 'high' })
        expect(arg.connectTimeout).toBe(47_000)
        expect(arg.readTimeout).toBe(47_000)
    })

    it('routes non-Anthropic providers through the canonical registry', async () => {
        const request = vi.fn().mockResolvedValue({
            status: 200,
            data: { model: 'vendor/model', choices: [{ message: { content: 'router pong' }, finish_reason: 'stop' }] },
        })
        const providerModel: TalosMobileProviderModel = {
            id: 'vendor/model', provider: 'openrouter', displayName: 'Vendor model', chatCompatibility: 'supported',
            inputModalities: ['text'], outputModalities: ['text'], supportedParameters: [],
        }
        const complete = buildChatCompletion(() => ({
            profile: { ...anthropicProfile, provider: 'openrouter', model: providerModel.id },
            providerModel, apiKey: 'k', effort: 'off', thinking: false,
        }), { request })
        await expect(complete([{ role: 'user', content: 'hi' }])).resolves.toMatchObject({ text: 'router pong' })
        expect(request.mock.calls[0][0].url).toBe('https://openrouter.ai/api/v1/chat/completions')
    })

    it('OPENROUTER-TOOLS-03 fails closed when a caller supplies tools to a model without capability', async () => {
        const request = vi.fn().mockResolvedValue({
            status: 200,
            data: { model: 'vendor/plain', choices: [{ message: { content: 'plain reply' }, finish_reason: 'stop' }] },
        })
        const providerModel: TalosMobileProviderModel = {
            id: 'vendor/plain',
            provider: 'openrouter',
            displayName: 'Plain model',
            chatCompatibility: 'supported',
            inputModalities: ['text'],
            outputModalities: ['text'],
            supportedParameters: [],
        }
        const complete = buildChatCompletion(() => ({
            profile: { ...anthropicProfile, provider: 'openrouter', model: providerModel.id },
            providerModel,
            apiKey: 'k',
            effort: 'off',
            thinking: false,
        }), { request })

        await expect(complete(
            [{ role: 'user', content: 'List files' }],
            undefined,
            [libraryTool] as never,
        )).resolves.toMatchObject({ text: 'plain reply' })

        expect(request.mock.calls[0][0].data).not.toHaveProperty('tools')
        expect(request.mock.calls[0][0].data).not.toHaveProperty('tool_choice')
    })
})
