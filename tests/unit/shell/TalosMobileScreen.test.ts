// @vitest-environment jsdom

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'

describe('TalosMobileScreen', () => {
    it('renders the screen title as the single h1', () => {
        const wrapper = mount(TalosMobileScreen, { props: { title: 'Runtime cockpit' } })
        const h1 = wrapper.findAll('h1')
        expect(h1).toHaveLength(1)
        expect(h1[0].text()).toBe('Runtime cockpit')
    })

    it('renders the eyebrow label above the title when provided', () => {
        const wrapper = mount(TalosMobileScreen, { props: { title: 'Deep Research V3', eyebrow: 'Deep research' } })
        expect(wrapper.find('[data-testid="mobile-screen-eyebrow"]').text()).toContain('Deep research')
    })

    it('omits the eyebrow entirely when not provided', () => {
        const wrapper = mount(TalosMobileScreen, { props: { title: 'Library' } })
        expect(wrapper.find('[data-testid="mobile-screen-eyebrow"]').exists()).toBe(false)
    })

    it('renders default slot content inside a scrollable region', () => {
        const wrapper = mount(TalosMobileScreen, {
            props: { title: 'Settings Center' },
            slots: { default: '<p data-testid="screen-body">hello</p>' },
        })
        expect(wrapper.find('[data-testid="screen-body"]').text()).toBe('hello')
    })

    it('TABLET-SETTINGS-03 exposes an md-only edge-to-edge list-detail body', () => {
        const wrapper = mount(TalosMobileScreen, {
            props: { title: 'Settings Center', tabletEdgeToEdge: true },
            slots: { default: '<p>settings</p>' },
        })
        const body = wrapper.get('[data-testid="mobile-screen-body"]')

        expect(body.classes()).toContain('px-4')
        expect(body.classes()).toContain('md:p-0')
        expect(body.classes()).toContain('md:overflow-hidden')
    })

    it('labels the screen region with its title for assistive tech', () => {
        const wrapper = mount(TalosMobileScreen, { props: { title: 'Library' } })
        expect(wrapper.get('[data-testid="mobile-screen"]').attributes('aria-label')).toBe('Library')
    })
})
