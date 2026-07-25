import { describe, expect, it, vi } from 'vitest'
import {
    ANTHROPIC_MESSAGES_URL,
    ANTHROPIC_VERSION,
    AnthropicChatError,
    buildAnthropicRequest,
    parseAnthropicResponse,
    sendAnthropicChat,
    type HttpTransport,
} from '@/lib/chat/anthropicClient'

describe('buildAnthropicRequest', () => {
    it('targets the messages endpoint with the required auth + version headers', () => {
        const req = buildAnthropicRequest('sk-key-123', {
            model: 'claude-opus-4-8',
            turns: [{ role: 'user', content: 'hi' }],
        })
        expect(req.url).toBe(ANTHROPIC_MESSAGES_URL)
        expect(req.headers['x-api-key']).toBe('sk-key-123')
        expect(req.headers['anthropic-version']).toBe(ANTHROPIC_VERSION)
        expect(req.headers['content-type']).toBe('application/json')
    })

    it('maps turns + system into the body and defaults temperature when not thinking', () => {
        const req = buildAnthropicRequest('k', {
            model: 'claude-sonnet-5',
            system: 'You are TALOS.',
            turns: [
                { role: 'user', content: 'a' },
                { role: 'assistant', content: 'b' },
                { role: 'user', content: 'c' },
            ],
        })
        expect(req.body.model).toBe('claude-sonnet-5')
        expect(req.body.system).toBe('You are TALOS.')
        expect(req.body.messages).toEqual([
            { role: 'user', content: 'a' },
            { role: 'assistant', content: 'b' },
            { role: 'user', content: 'c' },
        ])
        expect(req.body.max_tokens).toBeGreaterThan(0)
        expect(req.body).toHaveProperty('temperature')
        expect(req.body).not.toHaveProperty('thinking')
    })

    it('omits an empty system prompt', () => {
        const req = buildAnthropicRequest('k', { model: 'm', system: '   ', turns: [{ role: 'user', content: 'x' }] })
        expect(req.body).not.toHaveProperty('system')
    })

    it('enables extended thinking with a budget below max_tokens and drops temperature', () => {
        const req = buildAnthropicRequest('k', {
            model: 'claude-opus-4-8',
            turns: [{ role: 'user', content: 'hard' }],
            effort: 'high',
            thinking: true,
        })
        expect(req.body.thinking).toEqual({ type: 'enabled', budget_tokens: 24576 })
        expect(req.body.max_tokens as number).toBeGreaterThan(24576)
        expect(req.body).not.toHaveProperty('temperature')
    })

    it('does not enable thinking when effort is off even if the toggle is on', () => {
        const req = buildAnthropicRequest('k', {
            model: 'm',
            turns: [{ role: 'user', content: 'x' }],
            effort: 'off',
            thinking: true,
        })
        expect(req.body).not.toHaveProperty('thinking')
    })
})

describe('parseAnthropicResponse', () => {
    it('concatenates text blocks and ignores non-text (thinking) blocks', () => {
        const text = parseAnthropicResponse(200, {
            content: [
                { type: 'thinking', thinking: 'hmm' },
                { type: 'text', text: 'Hello ' },
                { type: 'text', text: 'world' },
            ],
        })
        expect(text).toBe('Hello world')
    })

    it('throws AnthropicChatError with the API message on a non-2xx status', () => {
        expect(() => parseAnthropicResponse(401, { error: { message: 'invalid x-api-key' } }))
            .toThrowError(/invalid x-api-key/)
    })

    it('throws when the response carries no text', () => {
        expect(() => parseAnthropicResponse(200, { content: [] })).toThrow(AnthropicChatError)
    })

    it('throws on a malformed body', () => {
        expect(() => parseAnthropicResponse(200, { nope: true })).toThrow(AnthropicChatError)
    })
})

describe('sendAnthropicChat', () => {
    it('posts the built request through the transport and returns the assistant text', async () => {
        const post = vi.fn().mockResolvedValue({ status: 200, data: { content: [{ type: 'text', text: 'pong' }] } })
        const transport: HttpTransport = { post }
        const out = await sendAnthropicChat('k', { model: 'm', turns: [{ role: 'user', content: 'ping' }] }, transport)
        expect(out).toBe('pong')
        expect(post).toHaveBeenCalledOnce()
        const arg = post.mock.calls[0][0]
        expect(arg.url).toBe(ANTHROPIC_MESSAGES_URL)
        expect(arg.headers['x-api-key']).toBe('k')
        expect(arg.data.messages).toEqual([{ role: 'user', content: 'ping' }])
    })

    it('propagates a transport-level error as an AnthropicChatError', async () => {
        const transport: HttpTransport = { post: vi.fn().mockResolvedValue({ status: 500, data: { error: { message: 'overloaded' } } }) }
        await expect(sendAnthropicChat('k', { model: 'm', turns: [{ role: 'user', content: 'x' }] }, transport))
            .rejects.toThrow(/overloaded/)
    })
})
