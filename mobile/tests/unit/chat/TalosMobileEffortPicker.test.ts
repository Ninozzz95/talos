// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileEffortPicker from '@/components/chat/TalosMobileEffortPicker.vue'
import TalosThemedSwitch from '@/components/talos/ui/TalosThemedSwitch.vue'

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

    it('uses the shared switch, not a sixth hand-rolled one', () => {
        /**
         * Owner 2026-08-03, with a screenshot: the thumb sat OUTSIDE its track.
         * Measured in the live page on the tablet — track 48px wide, thumb
         * starting at 48px, twenty pixels of overflow, the whole thing outside.
         *
         * The cause was structural, not cosmetic: the thumb was `absolute` with
         * no `left`, so it started from its STATIC position — and a `<button>`
         * centres its content, putting that at 24px — and `translate-x-6` added
         * another 24. The five other hand-rolled copies in the app set `left`
         * explicitly and are fine, which is why it showed in exactly one place.
         *
         * Geometry is not assertable in jsdom, so this asserts the thing that
         * makes the geometry impossible to get wrong: there is ONE switch, and
         * this is it. Rewriting a bespoke one here fails this test.
         */
        const wrapper = mountPicker({ supportsThinking: true, thinking: true })
        expect(wrapper.findComponent(TalosThemedSwitch).exists()).toBe(true)

        const thumbs = wrapper.findAll('.absolute')
        expect(thumbs.map((node) => node.attributes('class') ?? '')
            .filter((classes) => classes.includes('translate-x')))
            .toEqual([])
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
