// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileEffortPicker from '@/components/chat/TalosMobileEffortPicker.vue'

function mountPicker(overrides: Record<string, unknown> = {}) {
    return mount(TalosMobileEffortPicker, {
        props: {
            effortLevels: ['high', 'low', 'medium'],
            selectedEffort: 'medium',
            supportsThinking: false,
            thinking: false,
            ...overrides,
        },
    })
}

describe('TalosMobileEffortPicker', () => {
    it('renders only the selected profile ladder in canonical order plus off', () => {
        const wrapper = mountPicker()
        // One hook for every filter in the app since the shared radiogroup
        // landed, the same way the Doctor's own tab hook went. And the state is
        // ARIA now: `aria-checked` on a radio, not `aria-pressed` on a toggle —
        // eight independent pressed buttons never said "one of these".
        expect(wrapper.findAll('[data-testid="talos-mobile-effort-level"]').map((item) => (
            item.attributes('data-talos-filter-option')
        ))).toEqual(['off', 'low', 'medium', 'high'])
        expect(wrapper.get('[role="radiogroup"]').exists()).toBe(true)
        expect(wrapper.get('[data-talos-filter-option="medium"]').attributes('aria-checked')).toBe('true')
    })

    it('emits the selected effort without mutating the supplied value', async () => {
        const wrapper = mountPicker()
        await wrapper.get('[data-talos-filter-option="high"]').trigger('click')
        expect(wrapper.emitted('selectEffort')).toEqual([['high']])
        expect(wrapper.get('[data-talos-filter-option="medium"]').attributes('aria-checked')).toBe('true')
    })

    it('does not expose extended thinking for unsupported profiles', () => {
        const wrapper = mountPicker({ supportsThinking: false, thinking: true })
        expect(wrapper.find('[data-testid="talos-mobile-thinking-toggle"]').exists()).toBe(false)
    })

    it('renders a switch and emits a boolean for thinking-capable profiles', async () => {
        const wrapper = mountPicker({ supportsThinking: true, thinking: false })
        const toggle = wrapper.get('[data-testid="talos-mobile-thinking-toggle"]')
        expect(toggle.attributes('role')).toBe('switch')
        expect(toggle.attributes('aria-checked')).toBe('false')
        await toggle.trigger('click')
        expect(wrapper.emitted('selectThinking')).toEqual([[true]])
    })

    it('explains when a model has no reasoning setting', () => {
        const wrapper = mountPicker({ effortLevels: [] })
        expect(wrapper.text()).toContain('This model runs without a reasoning setting.')
    })

    it('emits a close request on Escape', async () => {
        const wrapper = mountPicker()
        await wrapper.get('[data-testid="talos-mobile-effort-picker"]').trigger('keydown', { key: 'Escape' })
        expect(wrapper.emitted('requestClose')).toHaveLength(1)
    })
})
