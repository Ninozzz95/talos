import { describe, expect, it, vi } from 'vitest'
import { talosNumericUsage } from '@/lib/chat/providers/usage'
import { anthropicAdapter } from '@/lib/chat/providers/anthropicAdapter'

/**
 * The accounting block must never be able to fail an answer.
 *
 * Found on the tablet 2026-08-03: a deep research with Sonnet 5 as author
 * stopped at the synthesis on TALOS_PROVIDER_RESPONSE_MALFORMED, and nothing on
 * screen said why. The Anthropic adapter was the last place still demanding
 * `z.record(z.string(), z.number())` for `usage` — while the OpenAI-compatible
 * one already accepted anything and the consumer types it `unknown`.
 *
 * Anthropic's usage block is not a bag of numbers. It carries nulls, nested
 * objects and strings, and every one of them threw away a whole answer that had
 * been generated and PAID FOR — over a field nobody reads.
 *
 * Chat never showed it because chat STREAMS and builds its own usage. Only the
 * non-streaming path, which the research synthesis uses, parses the provider's.
 */
describe('what comes back in a provider usage block', () => {
    it('keeps the counters out of a real Anthropic response', () => {
        // The shape as the Messages API sends it today: two plain counters, two
        // nullable ones, a nested object and a string.
        const counters = talosNumericUsage({
            input_tokens: 4211,
            output_tokens: 918,
            cache_creation_input_tokens: null,
            cache_read_input_tokens: 0,
            cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
            server_tool_use: { web_search_requests: 0 },
            service_tier: 'standard',
        })

        expect(counters).toEqual({
            input_tokens: 4211,
            output_tokens: 918,
            cache_read_input_tokens: 0,
        })
    })

    it('drops what is not a countable number, rather than refusing the lot', () => {
        expect(talosNumericUsage({ a: 1, b: 'x', c: null, d: {}, e: [], f: true }))
            .toEqual({ a: 1 })
        // NaN and Infinity are not counts. A total that is Infinity is worse
        // than no total at all, because something downstream will add it up.
        expect(talosNumericUsage({ a: Number.NaN, b: Number.POSITIVE_INFINITY })).toBeNull()
    })

    it('says nothing rather than nothing-shaped', () => {
        // `null` means "no accounting", which is different from an empty bag —
        // and `{}` would read as "we counted, and it was zero of everything".
        expect(talosNumericUsage(undefined)).toBeNull()
        expect(talosNumericUsage(null)).toBeNull()
        expect(talosNumericUsage({})).toBeNull()
        expect(talosNumericUsage({ service_tier: 'standard' })).toBeNull()
    })
})

/**
 * And the same thing proved through the ADAPTER, because the helper being right
 * is not what broke: the schema in front of it was.
 */
describe('a real Anthropic answer arriving at the adapter', () => {
    const MODEL = {
        id: 'claude-sonnet-5',
        provider: 'anthropic' as const,
        displayName: 'Claude Sonnet 5',
        chatCompatibility: 'supported' as const,
        inputModalities: [],
        outputModalities: ['text' as const],
        supportedParameters: [],
    }

    function transportWith(data: unknown) {
        const request = vi.fn().mockResolvedValue({ status: 200, data })
        return { request, transport: { request } as never }
    }

    it('is accepted, counters kept and the rest ignored', async () => {
        // The exact shape that stopped the research: nulls, a nested object and
        // a string, beside the two counters that matter.
        const { transport } = transportWith({
            model: 'claude-sonnet-5',
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: '{"claims":[]}' }],
            usage: {
                input_tokens: 4211,
                output_tokens: 918,
                cache_creation_input_tokens: null,
                cache_creation: { ephemeral_5m_input_tokens: 0 },
                service_tier: 'standard',
            },
        })

        const result = await anthropicAdapter.complete({
            model: MODEL,
            turns: [{ role: 'user', content: 'scrivi il rapporto' }],
        } as never, { apiKey: 'sentinel', timeoutMs: 60_000 } as never, transport)

        // The answer survives — this is the whole point. It was generated and
        // paid for; an accounting field must not be able to throw it away.
        expect(result.text).toBe('{"claims":[]}')
        expect(result.usage).toEqual({ input_tokens: 4211, output_tokens: 918 })
    })
})
