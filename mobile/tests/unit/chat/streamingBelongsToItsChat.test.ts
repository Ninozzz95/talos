// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

/**
 * Owner 2026-07-26: he left one chat generating, opened a new one, and a message
 * appeared there by itself.
 *
 * It was not a new message. It was the other chat's reply, rendered by a single
 * global field: `selectSession` replaces the message list and never touched the
 * streaming text. The durable write always went to the right conversation — only
 * the live rendering was homeless, which is the worse half, because it is the
 * half the user sees and cannot explain.
 */
const controller = vi.hoisted(() => ({
    chat: {
        state: {
            sending: true,
            streamingText: 'risposta della chat A',
            streamingReasoning: null,
            streamingSessionId: 'session-a' as string | null,
        },
        activeSession: { value: { id: 'session-a', title: 'A' } },
        sessions: [],
    },
    toolActivity: { value: [] as Array<{ name: string; detail: string | null }> },
}))

vi.mock('@/stores/chatController', () => ({ useChatController: () => controller }))
vi.mock('@/stores/settings', () => ({
    // BOTH modes are paced since 2026-07-27 — fade rendered at network cadence
    // was the reason it never looked smooth — so this file waits a frame before
    // asserting. What is under test is ownership, not pacing.
    useSettingsStore: () => ({ state: { shell: { streaming_animation: 'fade' } } }),
}))

import TalosMobileStreamingReply from '@/components/chat/TalosMobileStreamingReply.vue'

describe('the in-flight reply belongs to one conversation', () => {
    it('renders in the chat it was started from', async () => {
        controller.chat.activeSession.value = { id: 'session-a', title: 'A' }
        const wrapper = mount(TalosMobileStreamingReply)
        // Complete-word buffering can legitimately keep the first fragment in
        // the loader for more than two frames. This test owns conversation
        // routing, not a fixed paint deadline.
        await vi.waitFor(() => {
            expect(wrapper.find('[data-testid="talos-mobile-streaming"]').exists()).toBe(true)
        })
    })

    it('does NOT render in a different chat, even while it is still running', () => {
        // Opening another conversation must not show it someone else's answer.
        controller.chat.activeSession.value = { id: 'session-b', title: 'B' }
        const wrapper = mount(TalosMobileStreamingReply)
        expect(wrapper.find('[data-testid="talos-mobile-streaming"]').exists()).toBe(false)
        expect(wrapper.text()).not.toContain('risposta della chat A')
    })

    it('renders nothing when no conversation owns the stream', () => {
        controller.chat.activeSession.value = { id: 'session-a', title: 'A' }
        controller.chat.state.streamingSessionId = null
        const wrapper = mount(TalosMobileStreamingReply)
        expect(wrapper.find('[data-testid="talos-mobile-streaming"]').exists()).toBe(false)
        controller.chat.state.streamingSessionId = 'session-a'
    })
})
