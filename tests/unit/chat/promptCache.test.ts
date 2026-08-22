import { describe, expect, it } from 'vitest'
import {
    readTalosCacheUsage,
    talosPromptCacheKey,
    withTalosAnthropicMessageCache,
    withTalosAnthropicToolCache,
} from '@/lib/chat/promptCache'

/**
 * Owner 2026-07-27: speed and tokens "al massimo del potenziale". Measured on
 * this build the repeated prefix is ~2,099 tokens and 1,823 of them are the
 * nine tool schemas, re-sent on every round of the agent loop.
 */
describe('asking Anthropic to cache the part that never changes', () => {
    it('cuts after the last tool, so all of them cache as one prefix', () => {
        const tools = withTalosAnthropicToolCache([
            { name: 'a', input_schema: {} },
            { name: 'b', input_schema: {} },
        ]) as Array<Record<string, unknown>>
        expect(tools[0]!.cache_control).toBeUndefined()
        expect(tools[1]!.cache_control).toEqual({ type: 'ephemeral' })
    })

    it('leaves an empty tool list alone', () => {
        expect(withTalosAnthropicToolCache([])).toEqual([])
    })

    it('cuts at the end of the conversation so the next round reads it back', () => {
        const messages = withTalosAnthropicMessageCache([
            { role: 'user', content: [{ type: 'text', text: 'ciao' }] },
            { role: 'assistant', content: [{ type: 'text', text: 'ciao!' }] },
        ]) as Array<{ content: Array<Record<string, unknown>> }>
        expect(messages[0]!.content[0]!.cache_control).toBeUndefined()
        expect(messages[1]!.content[0]!.cache_control).toEqual({ type: 'ephemeral' })
    })

    it('never marks an image or an empty block, which cannot carry it', () => {
        const messages = withTalosAnthropicMessageCache([
            { role: 'user', content: [
                { type: 'text', text: 'guarda' },
                { type: 'image', source: {} },
            ] },
        ]) as Array<{ content: Array<Record<string, unknown>> }>
        expect(messages[0]!.content[1]!.cache_control).toBeUndefined()
        expect(messages[0]!.content[0]!.cache_control).toEqual({ type: 'ephemeral' })
    })

    it('marks a tool result, which is what a loop round ends on', () => {
        const messages = withTalosAnthropicMessageCache([
            { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] },
        ]) as Array<{ content: Array<Record<string, unknown>> }>
        expect(messages[0]!.content[0]!.cache_control).toEqual({ type: 'ephemeral' })
    })

    it('changes nothing when there is nothing it may mark', () => {
        const input = [{ role: 'user', content: 'a plain string' }]
        expect(withTalosAnthropicMessageCache(input)).toEqual(input)
    })
})

describe('the OpenAI routing key', () => {
    it('is the same for every request that shares a prefix', () => {
        // Two chats with the same tools warm one cache instead of each paying
        // to fill its own.
        expect(talosPromptCacheKey('system+tools')).toBe(talosPromptCacheKey('system+tools'))
        expect(talosPromptCacheKey('system+tools')).not.toBe(talosPromptCacheKey('system+other'))
    })

    it('sends a digest, never the prompt text', () => {
        expect(talosPromptCacheKey('you are TALOS')).not.toContain('TALOS')
        expect(talosPromptCacheKey('you are TALOS')).toMatch(/^talos-[a-z0-9]+$/)
    })

    it('is absent when there is no prefix to key on', () => {
        expect(talosPromptCacheKey(null)).toBeUndefined()
        expect(talosPromptCacheKey('')).toBeUndefined()
    })
})

describe('reading back what the cache actually did', () => {
    it('understands all four dialects', () => {
        expect(readTalosCacheUsage({ cache_read_input_tokens: 2000, cache_creation_input_tokens: 99 }))
            .toEqual({ readTokens: 2000, writeTokens: 99 })
        expect(readTalosCacheUsage({ prompt_cache_hit_tokens: 1500, prompt_cache_miss_tokens: 10 }))
            .toEqual({ readTokens: 1500, writeTokens: 0 })
        expect(readTalosCacheUsage({ prompt_tokens_details: { cached_tokens: 1024 } }))
            .toEqual({ readTokens: 1024, writeTokens: 0 })
        expect(readTalosCacheUsage({ cachedContentTokenCount: 2048 }))
            .toEqual({ readTokens: 2048, writeTokens: 0 })
    })

    it('says nothing rather than zero when the provider reported no cache', () => {
        // A flat 0 in the Doctor reads as "caching ran and saved nothing", which
        // is a different fact from "this provider said nothing about it".
        expect(readTalosCacheUsage({ prompt_tokens: 100 })).toBeNull()
        expect(readTalosCacheUsage(null)).toBeNull()
        expect(readTalosCacheUsage({ cache_read_input_tokens: 0 })).toBeNull()
    })
})
