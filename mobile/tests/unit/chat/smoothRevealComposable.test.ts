// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useTalosSmoothReveal } from '@/composables/useTalosSmoothReveal'

describe('useTalosSmoothReveal loop boundary', () => {
    it('does not schedule frames while the smooth mode is inactive', async () => {
        const source = ref('Fade inattivo: nessun frame sprecato.')
        const frames: Array<(timestamp: number) => void> = []
        const wrapper = mount(defineComponent({
            setup() {
                const reveal = useTalosSmoothReveal(source, {
                    enabled: () => false,
                    raf: (callback) => { frames.push(callback); return frames.length },
                    cancel: () => undefined,
                })
                return () => h('span', reveal.revealed.value)
            },
        }))

        await wrapper.vm.$nextTick()
        expect(frames).toHaveLength(0)
        expect(wrapper.text()).toBe('')
        wrapper.unmount()
    })
})
