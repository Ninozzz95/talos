import { describe, expect, it } from 'vitest'
import {
    TALOS_LOCAL_DEFAULT_CONTEXT_TOKENS,
    TALOS_LOCAL_FALLBACK_CONTEXT_TOKENS,
    TALOS_LOCAL_MAX_CONTEXT_TOKENS,
    talosLocalContextCandidates,
    talosLocalEscalatedContextTokens,
    talosShouldRetryLocalOpen,
} from '@/lib/models/localContextPolicy'

describe('LOCAL-CONTEXT-PARITY-01 canonical local context policy', () => {
    it('starts at 4096 and offers one bounded 2048 fallback', () => {
        expect(TALOS_LOCAL_DEFAULT_CONTEXT_TOKENS).toBe(4096)
        expect(TALOS_LOCAL_FALLBACK_CONTEXT_TOKENS).toBe(2048)
        expect(talosLocalContextCandidates()).toEqual([4096, 2048])
    })

    it('never raises an explicit small context and preserves a larger first attempt', () => {
        expect(talosLocalContextCandidates(1024)).toEqual([1024])
        expect(talosLocalContextCandidates(2048)).toEqual([2048])
        expect(talosLocalContextCandidates(8192)).toEqual([8192, 2048])
    })

    it('allows retry for context allocation only', () => {
        expect(talosShouldRetryLocalOpen('context')).toBe(true)
        for (const stage of ['path', 'model-load', 'sampler', 'template', 'generation', 'unknown'] as const) {
            expect(talosShouldRetryLocalOpen(stage)).toBe(false)
        }
    })

    it('C45-RED-18H raises the measured Qwen tool prompt once to 8192', () => {
        expect(TALOS_LOCAL_MAX_CONTEXT_TOKENS).toBe(8192)
        expect(talosLocalEscalatedContextTokens(4096, 5779, 1024)).toBe(8192)
    })

    it('keeps an ordinary prompt in its current context', () => {
        expect(talosLocalEscalatedContextTokens(4096, 1200, 512)).toBe(4096)
    })

    it('refuses a requirement above the mobile ceiling instead of truncating it', () => {
        expect(talosLocalEscalatedContextTokens(4096, 8000, 1024)).toBeNull()
    })
})
