// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { TALOS_COMMIT_INTERVAL_MS, useTalosSmoothReveal } from './useTalosSmoothReveal'

const mounted: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    mounted.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

function mountReveal(paced = true) {
    const source = ref('')
    const settled = ref(false)
    const frames: Array<(timestamp: number) => void> = []
    const cancelled: number[] = []
    let nextHandle = 1
    let revealed!: ReturnType<typeof useTalosSmoothReveal>['revealed']

    const app = createApp(defineComponent({
        setup() {
            revealed = useTalosSmoothReveal(source, {
                paced: () => paced,
                settled: () => settled.value,
                raf: (callback) => {
                    frames.push(callback)
                    return nextHandle++
                },
                cancel: (handle) => cancelled.push(handle),
            }).revealed
            return () => h('div')
        },
    }))
    app.mount(document.createElement('div'))
    mounted.push(app)

    return { app, source, settled, frames, cancelled, revealed }
}

describe('useTalosSmoothReveal', () => {
    it('drives a growing answer on rAF and throttles visible commits', async () => {
        const harness = mountReveal()
        harness.source.value = 'One answer arrives in a network burst.'
        await nextTick()

        expect(harness.frames).toHaveLength(1)
        harness.frames.shift()!(10)
        const opening = harness.revealed.value
        expect(opening.length).toBeGreaterThan(0)

        harness.frames.shift()!(10 + TALOS_COMMIT_INTERVAL_MS - 1)
        expect(harness.revealed.value).toBe(opening)

        harness.frames.shift()!(10 + TALOS_COMMIT_INTERVAL_MS)
        expect(harness.revealed.value.length).toBeGreaterThanOrEqual(opening.length)
    })

    it('flushes the canonical source immediately when the stream settles', async () => {
        const harness = mountReveal()
        harness.source.value = 'A final answer including its last word'
        await nextTick()
        harness.frames.shift()!(40)

        harness.settled.value = true
        await nextTick()

        expect(harness.revealed.value).toBe(harness.source.value)
        expect(harness.cancelled).not.toHaveLength(0)
    })

    it('reveals without pacing when motion is disabled', async () => {
        const harness = mountReveal(false)
        harness.source.value = 'No animated typing for reduced motion'
        await nextTick()
        harness.frames.shift()!(0)

        expect(harness.revealed.value).toBe(harness.source.value)
    })

    it('clears state for the next answer and cancels its pending frame on unmount', async () => {
        const harness = mountReveal()
        harness.source.value = 'First answer'
        await nextTick()
        harness.frames.shift()!(40)

        harness.source.value = ''
        await nextTick()
        expect(harness.revealed.value).toBe('')

        harness.source.value = 'Second answer'
        await nextTick()
        harness.app.unmount()
        expect(harness.cancelled).not.toHaveLength(0)
        mounted.splice(mounted.indexOf(harness.app), 1)
    })
})
