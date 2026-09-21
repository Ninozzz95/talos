// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

// F3-T1 (owner device feedback #2): the effort control is HIDDEN — not
// disabled — when the selected model exposes no real effort levels.
function profileWith(effortLevels: string[]): TalosMobileModelProfileView {
    return {
        id: 'profile-x', provider: 'deepseek', model: 'deepseek-chat', display_name: 'DeepSeek Chat',
        status: 'healthy', has_secret: true, effort_levels: effortLevels as never,
        supports_thinking: false, show_in_composer: true, capabilities: null, probe_ok: true,
    }
}

function mountComposer(profile: TalosMobileModelProfileView) {
    return mount(TalosMobileComposer, {
        props: {
            prompt: '', modelProfiles: [profile], routingProfiles: [],
            selectedModelProfileId: profile.id, selectedRoutingProfileId: null,
            selectedEffort: 'off', thinking: false, canSend: true, sending: false,
            sendDisabledReason: '',
        },
    })
}

describe('TalosMobileComposer effort visibility (F3-T1)', () => {
    it('shows the effort control when the model has real effort levels', () => {
        const wrapper = mountComposer(profileWith(['low', 'medium', 'high']))
        expect(wrapper.find('[aria-label="Choose reasoning effort"]').exists()).toBe(true)
    })

    it('hides the effort control entirely when the model only has off', () => {
        const wrapper = mountComposer(profileWith(['off']))
        expect(wrapper.find('[aria-label="Choose reasoning effort"]').exists()).toBe(false)
    })

    it('hides the effort control when no model is selected', () => {
        const wrapper = mount(TalosMobileComposer, {
            props: {
                prompt: '', modelProfiles: [], routingProfiles: [],
                selectedModelProfileId: null, selectedRoutingProfileId: null,
                selectedEffort: 'off', thinking: false, canSend: false, sending: false,
                sendDisabledReason: '',
            },
        })
        expect(wrapper.find('[aria-label="Choose reasoning effort"]').exists()).toBe(false)
    })
})
