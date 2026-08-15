import { describe, expect, it, vi } from 'vitest'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'
import type { TalosMobileProviderModel } from '@/lib/chat/providerContracts'

// F2-T4 — attempt-and-fallback routing: stream when the adapter can, fall back
// to the buffered transport on any PRE-first-byte failure, and never retry once
// partial text has been delivered (the store persists the honest partial).
const registryMock = vi.hoisted(() => ({ providerAdapterFor: vi.fn() }))
vi.mock('@/lib/chat/providerRegistry', () => registryMock)

import { buildChatCompletion } from '@/lib/chat/chatCompletion'

const profile: TalosMobileModelProfileView = {
    id: 'claude-opus', provider: 'anthropic', model: 'claude-opus-4-8', display_name: 'Claude Opus 4.8',
    status: 'healthy', has_secret: true, effort_levels: ['low', 'medium', 'high'], supports_thinking: true,
    show_in_composer: true, capabilities: null, probe_ok: null,
}

const providerModel: TalosMobileProviderModel = {
    id: 'claude-opus-4-8', provider: 'anthropic', displayName: 'Claude Opus 4.8', chatCompatibility: 'supported',
    inputModalities: ['text'], outputModalities: ['text'], supportedParameters: ['thinking'],
}

function contextFor() {
    return { profile, providerModel, apiKey: 'secret', effort: 'off', thinking: false }
}

describe('buildChatCompletion streaming routing (F2-T4)', () => {
    it('streams through adapter.streamComplete and forwards chunks live', async () => {
        const streamComplete = vi.fn(async (_input, _credential, handlers) => {
            handlers.onChunk('He')
            handlers.onChunk('llo')
            return { text: 'Hello', model: 'claude-opus-4-8' }
        })
        const complete = vi.fn()
        registryMock.providerAdapterFor.mockReturnValue({
            provider: 'anthropic', requiresSecret: true, streamComplete, complete,
        })
        const completion = buildChatCompletion(contextFor)
        const chunks: string[] = []
        const text = await completion(
            [{ role: 'user', content: 'hi' }],
            { onChunk: (chunk) => chunks.push(chunk) },
        )
        expect(text.text).toBe('Hello')
        expect(chunks).toEqual(['He', 'llo'])
        expect(complete).not.toHaveBeenCalled()
    })

    it('falls back to buffered complete on PRE-first-byte stream failure', async () => {
        const streamComplete = vi.fn(async () => { throw new Error('stream HTTP 403: CORS') })
        const complete = vi.fn(async () => ({ text: 'Buffered answer', model: 'claude-opus-4-8' }))
        registryMock.providerAdapterFor.mockReturnValue({
            provider: 'anthropic', requiresSecret: true, streamComplete, complete,
        })
        const completion = buildChatCompletion(contextFor)
        const text = await completion([{ role: 'user', content: 'hi' }], { onChunk: () => {} })
        expect(text.text).toBe('Buffered answer')
        expect(streamComplete).toHaveBeenCalledOnce()
        expect(complete).toHaveBeenCalledOnce()
    })

    it('does NOT fall back once chunks were delivered — the error propagates', async () => {
        const streamComplete = vi.fn(async (_input, _credential, handlers) => {
            handlers.onChunk('Half ')
            throw new Error('connection reset')
        })
        const complete = vi.fn()
        registryMock.providerAdapterFor.mockReturnValue({
            provider: 'anthropic', requiresSecret: true, streamComplete, complete,
        })
        const completion = buildChatCompletion(contextFor)
        await expect(completion([{ role: 'user', content: 'hi' }], { onChunk: () => {} }))
            .rejects.toThrow('connection reset')
        expect(complete).not.toHaveBeenCalled()
    })

    it('does NOT fall back on user abort even before the first byte', async () => {
        const streamComplete = vi.fn(async () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            throw error
        })
        const complete = vi.fn()
        registryMock.providerAdapterFor.mockReturnValue({
            provider: 'anthropic', requiresSecret: true, streamComplete, complete,
        })
        const completion = buildChatCompletion(contextFor)
        await expect(completion([{ role: 'user', content: 'hi' }], { onChunk: () => {} }))
            .rejects.toMatchObject({ name: 'AbortError' })
        expect(complete).not.toHaveBeenCalled()
    })

    it('P1-CTX-ISO-07 abort signal state wins over a wrapped stream error', async () => {
        const abort = new AbortController()
        const streamComplete = vi.fn(async () => {
            abort.abort()
            throw new Error('reader closed after cancellation')
        })
        const complete = vi.fn(async () => ({
            text: 'This fallback must never run.',
            model: 'claude-opus-4-8',
        }))
        registryMock.providerAdapterFor.mockReturnValue({
            provider: 'anthropic', requiresSecret: true, streamComplete, complete,
        })
        const completion = buildChatCompletion(contextFor)

        await expect(completion(
            [{ role: 'user', content: 'hi' }],
            { onChunk: () => {}, signal: abort.signal },
        )).rejects.toMatchObject({ name: 'AbortError' })
        expect(streamComplete).toHaveBeenCalledOnce()
        expect(complete).not.toHaveBeenCalled()
    })

    it('uses buffered complete directly when the adapter cannot stream', async () => {
        const complete = vi.fn(async () => ({ text: 'Plain answer', model: 'claude-opus-4-8' }))
        registryMock.providerAdapterFor.mockReturnValue({
            provider: 'anthropic', requiresSecret: true, complete,
        })
        const completion = buildChatCompletion(contextFor)
        const text = await completion([{ role: 'user', content: 'hi' }], { onChunk: () => {} })
        expect(text.text).toBe('Plain answer')
        expect(complete).toHaveBeenCalledOnce()
    })
})
