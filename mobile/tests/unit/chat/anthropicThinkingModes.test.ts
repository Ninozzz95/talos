import { describe, expect, it } from 'vitest'
import {
    buildAnthropicRequest,
    talosAnthropicThinkingFallback,
} from '@/lib/chat/anthropicClient'

/**
 * Owner 2026-07-27 on claude-opus-5, verbatim from the wire:
 *
 *   "thinking.type.enabled" is not supported for this model.
 *   Use "thinking.type.adaptive" and "output_config.effort".
 *
 * The docs make this worse than a rename. `type: "enabled"` with a budget is a
 * 400 on Opus 4.7 and later; `type: "adaptive"` is a 400 on Sonnet 4.5, Opus
 * 4.5, Haiku 4.5 and earlier. There is NO shape that works on both, and TALOS
 * will be distributed — so a hardcoded list of which models take which would be
 * wrong the day a model ships that the APK has never heard of.
 *
 * So the adapter learns from the wire: try one, and when the provider names the
 * other in a 400, use that one from then on for that model.
 */
describe('the two shapes Anthropic thinking comes in', () => {
    it('asks for adaptive thinking with an effort, not a token budget', () => {
        const request = buildAnthropicRequest('k', {
            model: 'claude-opus-5',
            turns: [{ role: 'user', content: 'hard' }],
            effort: 'high',
            thinking: true,
            thinkingMode: 'adaptive',
        })
        expect(request.body.thinking).toEqual({ type: 'adaptive' })
        expect(request.body.output_config).toEqual({ effort: 'high' })
        expect(request.body).not.toHaveProperty('temperature')
    })

    it('still speaks the older shape when that is what the model takes', () => {
        const request = buildAnthropicRequest('k', {
            model: 'claude-sonnet-4-5',
            turns: [{ role: 'user', content: 'hard' }],
            effort: 'high',
            thinking: true,
            thinkingMode: 'enabled',
        })
        expect(request.body.thinking).toEqual({ type: 'enabled', budget_tokens: 24576 })
        expect(request.body).not.toHaveProperty('output_config')
    })

    it('asks for no thinking at all when thinking is off', () => {
        const request = buildAnthropicRequest('k', {
            model: 'claude-opus-5',
            turns: [{ role: 'user', content: 'ciao' }],
            effort: 'off',
            thinking: false,
            thinkingMode: 'adaptive',
        })
        expect(request.body).not.toHaveProperty('thinking')
        expect(request.body).not.toHaveProperty('output_config')
    })
})

describe('learning which shape a model wants, from the model', () => {
    it('reads the provider telling it to use adaptive', () => {
        expect(talosAnthropicThinkingFallback(
            '"thinking.type.enabled" is not supported for this model. Use "thinking.type.adaptive" and "output_config.effort" to control thinking behavior.',
        )).toBe('adaptive')
    })

    it('reads the provider telling it to use the older shape', () => {
        expect(talosAnthropicThinkingFallback(
            '"thinking.type.adaptive" is not supported for this model.',
        )).toBe('enabled')
    })

    it('does not retry a failure that has nothing to do with thinking', () => {
        // A retry on an unrelated 400 spends the owner's tokens twice to get
        // the same refusal, and hides the real cause behind a second one.
        expect(talosAnthropicThinkingFallback('credit balance is too low')).toBeNull()
        expect(talosAnthropicThinkingFallback('')).toBeNull()
    })
})
