import { describe, expect, it } from 'vitest'
import { computed } from 'vue'
import { createTalosTraceRecorder } from '@/lib/diagnostics/sendTrace'

/**
 * SF-critic 2026-07-26, MAJOR: the Doctor read the timings through
 * `computed(() => controller.traces())` over a PLAIN array living in a closure.
 * A computed with no reactive dependency is evaluated once and never
 * invalidated — so "Clear timings" cleared the data and left the list on
 * screen, and a send recorded while the screen was open never appeared at all.
 *
 * The button looked like it worked. That is worse than not having one.
 */
describe('the timings a screen renders follow the timings that exist', () => {
    it('shows a send recorded after the first read', () => {
        const recorder = createTalosTraceRecorder({ enabled: () => true, now: () => 0 })
        const rendered = computed(() => recorder.sends().length)

        expect(rendered.value).toBe(0)
        recorder.begin({ provider: 'openai', model: 'gpt-5' }).finish('ok')
        expect(rendered.value).toBe(1)
    })

    it('empties when they are cleared', () => {
        const recorder = createTalosTraceRecorder({ enabled: () => true, now: () => 0 })
        recorder.begin({ provider: 'openai', model: 'gpt-5' }).finish('ok')
        const rendered = computed(() => recorder.sends().length)
        expect(rendered.value).toBe(1)

        recorder.clear()
        expect(rendered.value).toBe(0)
    })

    it('drops the oldest reactively once the buffer is full', () => {
        const recorder = createTalosTraceRecorder({ enabled: () => true, now: () => 0, keep: 2 })
        const models = computed(() => recorder.sends().map((trace) => trace.model))

        recorder.begin({ provider: 'openai', model: 'a' }).finish('ok')
        expect(models.value).toEqual(['a'])
        recorder.begin({ provider: 'openai', model: 'b' }).finish('ok')
        recorder.begin({ provider: 'openai', model: 'c' }).finish('ok')
        expect(models.value).toEqual(['c', 'b'])
    })
})
