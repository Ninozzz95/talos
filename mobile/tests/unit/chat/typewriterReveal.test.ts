// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useTalosTypewriterReveal } from '@/composables/useTalosTypewriterReveal'

/**
 * SF: the composable's injectable clock existed but nothing used it, so the
 * three riskiest lines — the non-monotonic reset, the reduced-motion branch and
 * the unmount cancel — had zero direct coverage. These drive the frame loop by
 * hand, so the assertions are exact rather than timing-dependent.
 */
function harness(source: ReturnType<typeof ref<string>>, options: {
    reducedMotion?: boolean
    enabled?: boolean
    pacing?: Record<string, number>
} = {}) {
    const frames: Array<(time: number) => void> = []
    let cancelled = 0
    let clock = 0
    const revealed = ref('')
    const wrapper = mount(defineComponent({
        setup() {
            const reveal = useTalosTypewriterReveal(source as ReturnType<typeof ref<string>> & { value: string }, {
                now: () => clock,
                raf: (callback) => { frames.push(callback); return frames.length },
                cancel: () => { cancelled += 1 },
                reducedMotion: () => options.reducedMotion === true,
                enabled: () => options.enabled !== false,
                pacing: options.pacing,
            })
            return () => h('span', reveal.revealed.value)
        },
    }))
    return {
        wrapper,
        text: () => wrapper.text(),
        cancelled: () => cancelled,
        pendingFrames: () => frames.length,
        async tick(ms = 16, times = 1) {
            for (let index = 0; index < times; index += 1) {
                const frame = frames.shift()
                if (!frame) return
                clock += ms
                frame(clock)
                await wrapper.vm.$nextTick()
            }
        },
    }
}

describe('useTalosTypewriterReveal', () => {
    it('reveals progressively across frames instead of all at once', async () => {
        const source = ref('Una risposta che arriva a pezzi ma si stampa liscia.')
        const rig = harness(source)
        expect(rig.text()).toBe('')
        await rig.tick(16)
        const afterOne = rig.text()
        expect(afterOne.length).toBeGreaterThan(0)
        expect(afterOne.length).toBeLessThan(source.value.length)
        await rig.tick(16, 40)
        expect(rig.text()).toBe(source.value)
        rig.wrapper.unmount()
    })

    it('SF-MAJOR: a mid-reply rewrite (marker strip) never restarts from zero', async () => {
        // The store swaps `streamingText` for a marker-stripped copy while the
        // reply is still streaming. Restarting there flashed the loader back on
        // and re-typed the whole answer.
        const source = ref('Ecco il file [TALOS_SAVE_LIBRARY: note]')
        const rig = harness(source)
        await rig.tick(16, 30)
        const painted = rig.text()
        expect(painted.length).toBeGreaterThan(10)
        source.value = 'Ecco il file '
        await rig.wrapper.vm.$nextTick()
        // Still showing the shared prefix — never blank, so the article stays
        // mounted and the waiting logo cannot reappear.
        expect(rig.text().length).toBeGreaterThan(0)
        expect(source.value.startsWith(rig.text())).toBe(true)
        rig.wrapper.unmount()
    })

    it('a new reply (empty source) is the only real reset', async () => {
        const source = ref('prima risposta')
        const rig = harness(source)
        await rig.tick(16, 30)
        expect(rig.text()).toBe('prima risposta')
        source.value = ''
        await rig.wrapper.vm.$nextTick()
        expect(rig.text()).toBe('')
        rig.wrapper.unmount()
    })

    it('reduced motion shows the text immediately — accessibility is not a slower animation', async () => {
        const source = ref('Nessuna animazione qui.')
        const rig = harness(source, { reducedMotion: true })
        await rig.wrapper.vm.$nextTick()
        expect(rig.text()).toBe(source.value)
        expect(rig.pendingFrames()).toBe(0)
        rig.wrapper.unmount()
    })

    it('does not schedule frames while this reveal mode is inactive', async () => {
        const source = ref('Modalita inattiva: nessun lavoro di animazione.')
        const rig = harness(source, { enabled: false })
        await rig.wrapper.vm.$nextTick()
        expect(rig.pendingFrames()).toBe(0)
        expect(rig.text()).toBe('')
        rig.wrapper.unmount()
    })

    it('cancels the frame loop on unmount — no orphan rAF after the reply', async () => {
        const source = ref('Una risposta abbastanza lunga da restare in coda per parecchi frame.')
        const rig = harness(source)
        await rig.tick(16)
        rig.wrapper.unmount()
        expect(rig.cancelled()).toBeGreaterThan(0)
    })
})
