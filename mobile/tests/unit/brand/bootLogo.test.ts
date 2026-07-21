import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosBootLogo from '@/components/brand/TalosBootLogo.vue'

describe('TalosBootLogo (animated intro)', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('renders the hex frame, all stroke-draw edges, and igniting nodes + wordmark', () => {
        const wrapper = mount(TalosBootLogo)
        expect(wrapper.find('[data-testid="talos-boot-logo"]').exists()).toBe(true)
        expect(wrapper.find('svg .hex').exists()).toBe(true)
        expect(wrapper.findAll('svg .edge').length).toBeGreaterThanOrEqual(4)
        expect(wrapper.findAll('svg .node').length).toBeGreaterThanOrEqual(5)
        expect(wrapper.text()).toContain('TALOS')
    })

    it('fades out and emits done after the hold', () => {
        const wrapper = mount(TalosBootLogo)
        expect(wrapper.emitted('done')).toBeUndefined()
        vi.advanceTimersByTime(2500)
        expect(wrapper.emitted('done')).toBeTruthy()
    })
})
