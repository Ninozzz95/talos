// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileNewChatFab from '@/components/shell/TalosMobileNewChatFab.vue'

// Owner 2026-07-24 (Claude-style): a floating "New chat" pill, bottom-right,
// thumb-zone. Shared by the chat list and the sidebar.
describe('TalosMobileNewChatFab', () => {
    it('renders an accessible New chat button and emits on click', async () => {
        const wrapper = mount(TalosMobileNewChatFab)
        const button = wrapper.get('[data-testid="talos-new-chat-fab"]')
        expect(button.attributes('aria-label')).toMatch(/new chat/i)
        expect(button.text()).toMatch(/new chat/i)
        await button.trigger('click')
        expect(wrapper.emitted('click')).toHaveLength(1)
    })

    it('reflects the disabled state and does not emit while disabled', async () => {
        const wrapper = mount(TalosMobileNewChatFab, { props: { disabled: true } })
        const button = wrapper.get('[data-testid="talos-new-chat-fab"]')
        expect(button.attributes('disabled')).toBeDefined()
        await button.trigger('click')
        expect(wrapper.emitted('click')).toBeUndefined()
    })
})
