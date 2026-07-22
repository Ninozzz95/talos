import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileChatHeader from '@/components/chat/TalosMobileChatHeader.vue'

describe('TalosMobileChatHeader', () => {
    it('shows the active title and exposes history and new-chat commands as icon buttons', async () => {
        const wrapper = mount(TalosMobileChatHeader, {
            props: {
                title: 'Release review',
                sessionCount: 3,
                creatingSession: false,
            },
        })

        expect(wrapper.get('[data-testid="talos-mobile-chat-title"]').text()).toBe('Release review')
        expect(wrapper.get('[aria-label="Open chat history"]').attributes('title')).toBe('Chat history (3)')
        expect(wrapper.get('[aria-label="New Chat"]').text()).toBe('')

        await wrapper.get('[aria-label="Open chat history"]').trigger('click')
        await wrapper.get('[aria-label="New Chat"]').trigger('click')
        expect(wrapper.emitted('openHistory')).toHaveLength(1)
        expect(wrapper.emitted('newChat')).toHaveLength(1)
    })

    it('uses an untitled fallback and disables new chat while a session is being created', () => {
        const wrapper = mount(TalosMobileChatHeader, {
            props: { title: '', sessionCount: 0, creatingSession: true },
        })
        expect(wrapper.get('[data-testid="talos-mobile-chat-title"]').text()).toBe('New chat')
        expect(wrapper.get('[aria-label="New Chat"]').attributes('disabled')).toBeDefined()
    })
})
