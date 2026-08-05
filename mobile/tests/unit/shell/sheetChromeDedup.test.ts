// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import TalosMobileToolSheet from '@/components/shell/TalosMobileToolSheet.vue'
import TalosMobileSettingsCenter from '@/components/talos/settings/TalosMobileSettingsCenter.vue'

// F3-T3 (owner #10 + SF-critic #10): ONE title per surface. Screens presented
// inside the tool sheet drop their own duplicate header; standalone screens
// keep it. The settings category pane no longer repeats a second heading.
describe('sheet chrome dedup (F3-T3)', () => {
    it('hides the screen header inside the tool sheet (sheet already titles it)', () => {
        const wrapper = mount(TalosMobileToolSheet, {
            props: { title: 'Settings' },
            slots: { default: () => h(TalosMobileScreen, { title: 'Settings Center', eyebrow: 'Protected preferences' }) },
        })
        expect(wrapper.find('[data-testid="mobile-screen-title"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="mobile-screen-eyebrow"]').exists()).toBe(false)
    })

    it('keeps the screen header when standalone', () => {
        const wrapper = mount(TalosMobileScreen, { props: { title: 'Deep Research V3' } })
        expect(wrapper.get('[data-testid="mobile-screen-title"]').text()).toBe('Deep Research V3')
    })

    it('the settings category pane carries no duplicate heading block', () => {
        const wrapper = mount(TalosMobileSettingsCenter)
        expect(wrapper.text()).not.toContain('Settings categories')
        expect(wrapper.text()).not.toContain('Local preferences and capability readiness.')
    })
})
