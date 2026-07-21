import { describe, expect, it, vi } from 'vitest'
import { buildChatCompletion, ChatConfigError, type CompletionContext } from '@/lib/chat/chatCompletion'
import type { HttpTransport } from '@/lib/chat/anthropicClient'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

const anthropicProfile: TalosMobileModelProfileView = {
    id: 'claude-opus', provider: 'anthropic', model: 'claude-opus-4-8', display_name: 'Claude Opus 4.8',
    status: 'healthy', has_secret: true, effort_levels: ['low', 'medium', 'high'], supports_thinking: true,
    show_in_composer: true, capabilities: null, probe_ok: null,
}

function transportReturning(text: string): { transport: HttpTransport; post: ReturnType<typeof vi.fn> } {
    const post = vi.fn().mockResolvedValue({ status: 200, data: { content: [{ type: 'text', text }] } })
    return { transport: { post }, post }
}

describe('buildChatCompletion', () => {
    it('throws a config error when no model is selected', async () => {
        const complete = buildChatCompletion(() => ({ profile: null, apiKey: 'k', effort: 'off', thinking: false }))
        await expect(complete([{ role: 'user', content: 'hi' }])).rejects.toThrow(ChatConfigError)
    })

    it('throws a helpful config error when the provider key is missing', async () => {
        const complete = buildChatCompletion(() => ({ profile: anthropicProfile, apiKey: null, effort: 'off', thinking: false }))
        await expect(complete([{ role: 'user', content: 'hi' }])).rejects.toThrow(/api key/i)
    })

    it('calls the Anthropic client with the selected model + key and returns the reply', async () => {
        const { transport, post } = transportReturning('pong')
        const ctx: CompletionContext = { profile: anthropicProfile, apiKey: 'sk-ant', effort: 'high', thinking: true, system: 'sys' }
        const complete = buildChatCompletion(() => ctx, transport)
        const out = await complete([{ role: 'user', content: 'ping' }])
        expect(out).toBe('pong')
        const arg = post.mock.calls[0][0]
        expect(arg.headers['x-api-key']).toBe('sk-ant')
        expect(arg.data.model).toBe('claude-opus-4-8')
        expect(arg.data.thinking).toEqual({ type: 'enabled', budget_tokens: 24576 })
    })

    it('rejects providers without a mobile client yet', async () => {
        const complete = buildChatCompletion(() => ({
            profile: { ...anthropicProfile, provider: 'gemini' }, apiKey: 'k', effort: 'off', thinking: false,
        }))
        await expect(complete([{ role: 'user', content: 'hi' }])).rejects.toThrow(/not available/i)
    })
})
