// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { SliderRoot } from 'reka-ui'
import TalosThemedSegmentedSlider from '@/components/talos/ui/TalosThemedSegmentedSlider.vue'

const options = [
    { value: 'off', label: 'Off' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
] as const

describe('TalosThemedSegmentedSlider', () => {
    it('uses the repository slider primitive and exposes one human-readable thumb', async () => {
        const wrapper = mount(TalosThemedSegmentedSlider, {
            props: { modelValue: 'medium', options, ariaLabel: 'Reasoning effort' },
        })
        await nextTick()
        expect(wrapper.findComponent(SliderRoot).exists()).toBe(true)
        expect(wrapper.findAll('[role="slider"]')).toHaveLength(1)
        const thumb = wrapper.get('[role="slider"]')
        expect(thumb.attributes('aria-label')).toBe('Reasoning effort')
        expect(thumb.attributes('aria-valuemin')).toBe('0')
        expect(thumb.attributes('aria-valuemax')).toBe('3')
        expect(thumb.attributes('aria-valuenow')).toBe('2')
        expect(thumb.attributes('aria-valuetext')).toBe('Medium')
    })

    it('emits the corresponding string and remains controlled', async () => {
        const wrapper = mount(TalosThemedSegmentedSlider, {
            props: { modelValue: 'low', options, ariaLabel: 'Reasoning effort' },
        })
        wrapper.findComponent(SliderRoot).vm.$emit('update:modelValue', [3])
        await wrapper.vm.$nextTick()
        expect(wrapper.emitted('update:modelValue')).toEqual([['high']])
        expect(wrapper.attributes('data-value')).toBe('low')
    })

    it('removes empty and duplicate values without changing first-seen order', () => {
        const wrapper = mount(TalosThemedSegmentedSlider, {
            props: {
                modelValue: 'low',
                ariaLabel: 'Reasoning effort',
                options: [
                    { value: 'low', label: 'Low' },
                    { value: '', label: 'Invalid' },
                    { value: 'low', label: 'Duplicate' },
                    { value: 'high', label: 'High' },
                ],
            },
        })
        expect(wrapper.findAll('[data-talos-filter-option]').map((node) => (
            node.attributes('data-talos-filter-option')
        ))).toEqual(['low', 'high'])
        expect(wrapper.get('[role="slider"]').attributes('aria-valuemax')).toBe('1')
    })

    it('keeps every stop but reduces label clutter on a seven-value scale', () => {
        const full = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
            .map((value) => ({ value, label: value }))
        const wrapper = mount(TalosThemedSegmentedSlider, {
            props: { modelValue: 'medium', options: full, ariaLabel: 'Reasoning effort' },
        })
        expect(wrapper.findAll('[data-talos-filter-option]')).toHaveLength(7)
        const visible = wrapper.findAll('[data-label-visible="true"]')
            .map((node) => node.attributes('data-talos-filter-option'))
        expect(visible).toEqual(['off', 'medium', 'max'])
    })

    it('disables a one-value scale', () => {
        const wrapper = mount(TalosThemedSegmentedSlider, {
            props: {
                modelValue: 'off',
                ariaLabel: 'Reasoning effort',
                options: [{ value: 'off', label: 'Off' }],
            },
        })
        expect(wrapper.get('[role="slider"]').attributes()).toHaveProperty('data-disabled')
    })
})
