import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

// F2-T4 — streaming UI: live assistant text replaces the typing dots while
// chunks arrive; the composer send button becomes an honest Stop control.
// R1-5 — the streaming tail moved into TalosMobileStreamingReply, which
// subscribes to the chat store DIRECTLY so token bursts never re-diff the
// message list. The tests drive the store state the component really reads.
const mockChatState = vi.hoisted(() => ({
    state: null as unknown as { sending: boolean; streamingText: string | null },
}))
vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({ chat: { state: mockChatState.state } }),
}))

import TalosMobileStreamingReply from '@/components/chat/TalosMobileStreamingReply.vue'

const profiles: TalosMobileModelProfileView[] = [{
    id: 'profile-deepseek', provider: 'deepseek', model: 'deepseek-chat', display_name: 'DeepSeek Chat',
    status: 'healthy', has_secret: true, effort_levels: ['low'], supports_thinking: false,
    show_in_composer: true, capabilities: null, probe_ok: true,
}]

function mountStreaming(sending: boolean, streamingText: string | null) {
    mockChatState.state = reactive({ sending, streamingText })
    return mount(TalosMobileStreamingReply)
}

describe('TalosMobileStreamingReply (F2-T4 / R1-5)', () => {
    it('F5.1 (owner): streaming text renders as PROGRESSIVE MARKDOWN, not plain text', async () => {
        const wrapper = mountStreaming(true, '## Piano\n\n- primo punto\n\n```ts\nconst x =')
        const live = wrapper.get('[data-testid="talos-mobile-streaming"]')
        await vi.waitFor(() => {
            expect(live.find('h2').exists()).toBe(true)
        })
        expect(live.get('h2').text()).toBe('Piano')
        expect(live.find('li').exists()).toBe(true)
        // The unterminated fence is auto-closed so the code renders instead of flickering raw.
        expect(live.find('pre').exists()).toBe(true)
    })

    it('renders the live streaming text as an in-progress assistant section instead of typing dots', () => {
        const wrapper = mountStreaming(true, 'Streaming ans')
        const live = wrapper.get('[data-testid="talos-mobile-streaming"]')
        expect(live.text()).toContain('Streaming ans')
        expect(wrapper.find('[data-testid="talos-mobile-typing"]').exists()).toBe(false)
    })

    it('keeps the typing dots while sending WITHOUT streamed text yet', () => {
        const wrapper = mountStreaming(true, null)
        expect(wrapper.find('[data-testid="talos-mobile-typing"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-mobile-streaming"]').exists()).toBe(false)
    })

    it('renders nothing at all when idle', () => {
        const wrapper = mountStreaming(false, null)
        expect(wrapper.find('[data-testid="talos-mobile-typing"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-mobile-streaming"]').exists()).toBe(false)
    })
})

describe('TalosMobileComposer stop control (F2-T4)', () => {
    function mountComposer(sending: boolean) {
        return mount(TalosMobileComposer, {
            props: {
                prompt: '', modelProfiles: profiles, routingProfiles: [],
                selectedModelProfileId: 'profile-deepseek', selectedRoutingProfileId: null,
                selectedEffort: 'low', thinking: false, canSend: true, sending,
                sendDisabledReason: '',
            },
        })
    }

    it('replaces Send with a Stop button while sending, emitting stop on tap', async () => {
        const wrapper = mountComposer(true)
        const stop = wrapper.get('button[aria-label="Stop response"]')
        await stop.trigger('click')
        expect(wrapper.emitted('stop')).toHaveLength(1)
        expect(wrapper.find('button[aria-label="Send message"]').exists()).toBe(false)
    })

    it('shows the Send button when idle', () => {
        const wrapper = mountComposer(false)
        expect(wrapper.find('button[aria-label="Send message"]').exists()).toBe(true)
        expect(wrapper.find('button[aria-label="Stop response"]').exists()).toBe(false)
    })
})
