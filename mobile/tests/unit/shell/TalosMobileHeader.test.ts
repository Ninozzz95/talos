import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileHeader from '@/components/shell/TalosMobileHeader.vue'

// F1-T3 — app-level header (D5): hamburger left, session title center, new chat right.
function mountHeader(props: Record<string, unknown> = {}) {
    return mount(TalosMobileHeader, {
        props: { title: 'Release review', creatingSession: false, ...props },
    })
}

describe('TalosMobileHeader (F1-T3)', () => {
    it('renders hamburger (Open menu), centered truncated title and New Chat', () => {
        const wrapper = mountHeader()
        expect(wrapper.find('[data-testid="talos-mobile-header"]').exists()).toBe(true)
        expect(wrapper.find('[aria-label="Open menu"]').exists()).toBe(true)
        expect(wrapper.get('[data-testid="talos-mobile-header-title"]').text()).toBe('Release review')
        expect(wrapper.find('[aria-label="New Chat"]').exists()).toBe(true)
    })

    it('falls back to New chat when the title is blank', () => {
        const wrapper = mountHeader({ title: '   ' })
        expect(wrapper.get('[data-testid="talos-mobile-header-title"]').text()).toBe('New chat')
    })

    it('emits openMenu and newChat from the two controls', async () => {
        const wrapper = mountHeader()
        await wrapper.get('[aria-label="Open menu"]').trigger('click')
        await wrapper.get('[aria-label="New Chat"]').trigger('click')
        expect(wrapper.emitted('openMenu')).toHaveLength(1)
        expect(wrapper.emitted('newChat')).toHaveLength(1)
    })

    it('disables New Chat while a session is being created', () => {
        const wrapper = mountHeader({ creatingSession: true })
        expect(wrapper.get('[aria-label="New Chat"]').attributes('disabled')).toBeDefined()
    })
})
