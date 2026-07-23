import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type {
    TalosMobileMessageView,
    TalosMobileModelProfileView,
} from '@/components/chat/mobileChatTypes'

// F2-T4 — streaming UI: live assistant text replaces the typing dots while
// chunks arrive; the composer send button becomes an honest Stop control.
function msg(overrides: Partial<TalosMobileMessageView>): TalosMobileMessageView {
    return {
        id: 'id', role: 'user', content: 'x', state: 'persisted',
        created_at: '2026-07-22T12:00:00.000Z', model_profile_id: null,
        run_id: null, metadata: {},
        ...overrides,
    } as TalosMobileMessageView
}

const profiles: TalosMobileModelProfileView[] = [{
    id: 'profile-deepseek', provider: 'deepseek', model: 'deepseek-chat', display_name: 'DeepSeek Chat',
    status: 'healthy', has_secret: true, effort_levels: ['low'], supports_thinking: false,
    show_in_composer: true, capabilities: null, probe_ok: true,
}]

describe('TalosMobileMessageList streaming (F2-T4)', () => {
    it('renders the live streaming text as an in-progress assistant section instead of typing dots', () => {
        const wrapper = mount(TalosMobileMessageList, {
            props: {
                messages: [msg({ id: 'u1', role: 'user', content: 'hi' })],
                sending: true,
                streamingText: 'Streaming ans',
            },
        })
        const live = wrapper.get('[data-testid="talos-mobile-streaming"]')
        expect(live.text()).toContain('Streaming ans')
        expect(wrapper.find('[data-testid="talos-mobile-typing"]').exists()).toBe(false)
    })

    it('keeps the typing dots while sending WITHOUT streamed text yet', () => {
        const wrapper = mount(TalosMobileMessageList, {
            props: {
                messages: [msg({ id: 'u1', role: 'user', content: 'hi' })],
                sending: true,
                streamingText: null,
            },
        })
        expect(wrapper.find('[data-testid="talos-mobile-typing"]').exists()).toBe(true)
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
