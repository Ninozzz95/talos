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

    it('CODE-MOBILE-GUTTER-01 can hand all viewport gutters to an embedded surface', () => {
        const wrapper = mount(TalosMobileScreen, {
            props: { title: 'Code', edgeToEdge: true },
            slots: { default: '<p>code</p>' },
        })
        const body = wrapper.get('[data-testid="mobile-screen-body"]')

        expect(body.classes()).toContain('p-0')
        expect(body.classes()).toContain('overflow-hidden')
        expect(body.classes()).not.toContain('px-4')
    })

    it('labels the screen region with its title for assistive tech', () => {
        const wrapper = mount(TalosMobileScreen, { props: { title: 'Library' } })
        expect(wrapper.get('[data-testid="mobile-screen"]').attributes('aria-label')).toBe('Library')
    })

    // F6 sidebar refactor (24/8): `embedded` mounts this shell as a persistent
    // panel's own content (the tablet rail showing Harness) — no own H1 (the
    // panel already has a brand header) and no opaque background (the panel
    // is translucent; painting over it would defeat the blur).
    it('embedded: hides its own H1 and drops the opaque background', () => {
        const wrapper = mount(TalosMobileScreen, {
            props: { title: 'Harness', embedded: true },
            slots: { default: '<p data-testid="panel-body">sessions</p>' },
        })
        expect(wrapper.findAll('h1')).toHaveLength(0)
        expect(wrapper.get('[data-testid="mobile-screen"]').classes()).not.toContain('bg-[var(--talos-background)]')
        // Still labeled for assistive tech even without a visible H1.
        expect(wrapper.get('[data-testid="mobile-screen"]').attributes('aria-label')).toBe('Harness')
        expect(wrapper.find('[data-testid="panel-body"]').exists()).toBe(true)
    })

    it('non-embedded keeps the H1 and the opaque background (no regression)', () => {
        const wrapper = mount(TalosMobileScreen, { props: { title: 'Library' } })
        expect(wrapper.findAll('h1')).toHaveLength(1)
        expect(wrapper.get('[data-testid="mobile-screen"]').classes()).toContain('bg-[var(--talos-background)]')
    })
})
