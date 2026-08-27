// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import TalosMobileEffortPicker from '@/components/chat/TalosMobileEffortPicker.vue'
import TalosThemedSegmentedSlider from '@/components/talos/ui/TalosThemedSegmentedSlider.vue'
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

describe('TalosMobileEffortPicker segmented slider', () => {
    it('keeps the model-specific canonical ladder and replaces the radiogroup with one slider', async () => {
        const wrapper = mountPicker()
        await nextTick()
        expect(wrapper.findComponent(TalosThemedSegmentedSlider).exists()).toBe(true)
        expect(wrapper.find('[role="radiogroup"]').exists()).toBe(false)
        expect(wrapper.findAll('[data-testid="talos-mobile-effort-level"]').map((item) => (
            item.attributes('data-talos-filter-option')
        ))).toEqual(['off', 'low', 'medium', 'high'])

        const slider = wrapper.get('[role="slider"]')
        expect(slider.attributes('aria-valuemin')).toBe('0')
        expect(slider.attributes('aria-valuemax')).toBe('3')
        expect(slider.attributes('aria-valuenow')).toBe('2')
        expect(slider.attributes('aria-valuetext')).toBe('Medium')
    })

    it('shows the translated selected effort above the rail', () => {
        const wrapper = mountPicker({ selectedEffort: 'high' })
        expect(wrapper.get('[data-testid="talos-mobile-effort-selected"]').text()).toBe('High')
    })

    it('maps the discrete slider value back to the existing effort event', async () => {
        const wrapper = mountPicker()
        wrapper.findComponent(TalosThemedSegmentedSlider).vm.$emit('update:modelValue', 'high')
        await wrapper.vm.$nextTick()
        expect(wrapper.emitted('selectEffort')).toEqual([['high']])
    })

    it('stays controlled and does not mutate the supplied value', async () => {
        const wrapper = mountPicker()
        wrapper.findComponent(TalosThemedSegmentedSlider).vm.$emit('update:modelValue', 'high')
        await wrapper.vm.$nextTick()
        expect(wrapper.get('[data-testid="talos-mobile-effort-selected"]').text()).toBe('Medium')
    })

    it('supports the complete seven-level TALOS ladder without inventing levels', () => {
        const wrapper = mountPicker({
            effortLevels: ['max', 'minimal', 'xhigh', 'low', 'high', 'medium'],
            selectedEffort: 'xhigh',
        })
        expect(wrapper.findAll('[data-testid="talos-mobile-effort-level"]').map((item) => (
            item.attributes('data-talos-filter-option')
        ))).toEqual(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
        expect(wrapper.get('[role="slider"]').attributes('aria-valuemax')).toBe('6')
        expect(wrapper.get('[role="slider"]').attributes('aria-valuetext')).toBe('Extra high')
    })

    it('does not expose extended thinking for unsupported profiles', () => {
        const wrapper = mountPicker({ supportsThinking: false, thinking: true })
        expect(wrapper.find('[data-testid="talos-mobile-thinking-toggle"]').exists()).toBe(false)
    })

    it('keeps the shared TALOS switch for thinking-capable profiles', async () => {
        const wrapper = mountPicker({ supportsThinking: true, thinking: false })
        expect(wrapper.findComponent(TalosThemedSwitch).exists()).toBe(true)
        expect(wrapper.text()).toContain('Extended thinking')
        const toggle = wrapper.get('[data-testid="talos-mobile-thinking-toggle"]')
        expect(toggle.attributes('role')).toBe('switch')
        await toggle.trigger('click')
        expect(wrapper.emitted('selectThinking')).toEqual([[true]])
    })

    it('does not render a meaningless one-step slider', () => {
        const wrapper = mountPicker({ effortLevels: [] })
        expect(wrapper.find('[role="slider"]').exists()).toBe(false)
        expect(wrapper.text()).toContain('This model runs without a reasoning setting.')
    })

    it('emits a close request on Escape', async () => {
        const wrapper = mountPicker()
        await wrapper.get('[data-testid="talos-mobile-effort-picker"]').trigger('keydown', { key: 'Escape' })
        expect(wrapper.emitted('requestClose')).toHaveLength(1)
    })
})
