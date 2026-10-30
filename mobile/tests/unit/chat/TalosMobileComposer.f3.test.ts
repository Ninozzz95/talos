// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
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
        global: { stubs: { teleport: true } },
        props: {
            prompt: '', modelProfiles: [profile], routingProfiles: [],
            selectedModelProfileId: profile.id, selectedRoutingProfileId: null,
            selectedEffort: 'off', thinking: false, canSend: true, sending: false,
            sendDisabledReason: '',
        },
    })
}

// owner 27/10/2026 (mockup approvato): il comando del livello è il cursore nel piede del foglio «Modello e ragionamento»; il chip lo dice
describe('TalosMobileComposer effort visibility (F3-T1)', () => {
    it('shows the effort control when the model has real effort levels', async () => {
        const wrapper = mountComposer(profileWith(['low', 'medium', 'high']))
        // owner 27/10/2026, forma unica: compatto a riposo, la riga sotto il campo c'è col fuoco (FORMA-01)
        await wrapper.get('[data-testid="talos-composer-prompt"]').trigger('focus')
        expect(wrapper.find('[data-testid="talos-composer-model-level"]').exists()).toBe(true)
        await wrapper.get('[data-testid="talos-composer-model-chip"]').trigger('click')
        await vi.dynamicImportSettled()
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-mobile-effort-slider"]').exists()).toBe(true))
    })

    it('hides the effort control entirely when the model only has off', async () => {
        const wrapper = mountComposer(profileWith(['off']))
        // owner 27/10/2026, forma unica: compatto a riposo, la riga sotto il campo c'è col fuoco (FORMA-01)
        await wrapper.get('[data-testid="talos-composer-prompt"]').trigger('focus')
        expect(wrapper.find('[data-testid="talos-composer-model-level"]').exists()).toBe(false)
        await wrapper.get('[data-testid="talos-composer-model-chip"]').trigger('click')
        await vi.dynamicImportSettled()
        expect(wrapper.find('[data-testid="talos-mobile-effort-slider"]').exists()).toBe(false)
    })

    it('hides the effort control when no model is selected', async () => {
        const wrapper = mount(TalosMobileComposer, {
            global: { stubs: { teleport: true } },
            props: {
                prompt: '', modelProfiles: [], routingProfiles: [],
                selectedModelProfileId: null, selectedRoutingProfileId: null,
                selectedEffort: 'off', thinking: false, canSend: false, sending: false,
                sendDisabledReason: '',
            },
        })
        // owner 27/10/2026, forma unica: compatto a riposo, la riga sotto il campo c'è col fuoco (FORMA-01)
        await wrapper.get('[data-testid="talos-composer-prompt"]').trigger('focus')
        await wrapper.get('[data-testid="talos-composer-model-chip"]').trigger('click')
        await vi.dynamicImportSettled()
        expect(wrapper.find('[data-testid="talos-mobile-effort-slider"]').exists()).toBe(false)
    })
})
