import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

// F3-T4bis (owner #13, Claude screenshots): drawer mode = minimal bar
// ("+" / model chip / mic) with the tool controls in an organized bottom
// drawer. Classic mode stays byte-identical when the toggle is off.
const profile: TalosMobileModelProfileView = {
    id: 'profile-claude', provider: 'anthropic', model: 'claude-opus', display_name: 'Claude Opus',
    status: 'healthy', has_secret: true, effort_levels: ['low', 'medium', 'high'], supports_thinking: true,
    show_in_composer: true, capabilities: null, probe_ok: true,
}

function mountComposer(overrides: Record<string, unknown> = {}) {
    return mount(TalosMobileComposer, {
        global: { stubs: { teleport: true } },
        props: {
            prompt: '', modelProfiles: [profile], routingProfiles: [],
            selectedModelProfileId: profile.id, selectedRoutingProfileId: null,
            selectedEffort: 'high', thinking: false, canSend: true, sending: false,
            sendDisabledReason: '', dictationSupported: true,
            ...overrides,
        },
    })
}

describe('composer drawer mode (F3-T4bis)', () => {
    it('renders the minimal bar: add-to-chat, model chip, mic — no inline tool row', () => {
        const wrapper = mountComposer({ drawerMode: true })
        expect(wrapper.find('[aria-label="Add to chat"]').exists()).toBe(true)
        const chip = wrapper.get('[data-testid="talos-composer-model-chip"]')
        expect(chip.text()).toContain('Claude Opus')
        expect(chip.text()).toContain('High')
        expect(wrapper.find('[aria-label="Dictate"]').exists()).toBe(true)
        for (const gone of ['Choose reasoning effort', 'Attach a file', 'Improve prompt', 'Toggle extended thinking']) {
            expect(wrapper.find(`[aria-label="${gone}"]`).exists()).toBe(false)
        }
    })

    it('keeps the classic bar untouched when the toggle is off', () => {
        const wrapper = mountComposer({ drawerMode: false })
        expect(wrapper.find('[aria-label="Add to chat"]').exists()).toBe(false)
        expect(wrapper.find('[aria-label="Attach a file"]').exists()).toBe(true)
        expect(wrapper.find('[aria-label="Choose reasoning effort"]').exists()).toBe(true)
    })

    it('opens the organized drawer from "+" and forwards the tool actions', async () => {
        const wrapper = mountComposer({ drawerMode: true })
        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-composer-drawer"]').exists()).toBe(true))
        const drawer = wrapper.get('[data-testid="talos-composer-drawer"]')
        expect(drawer.text()).toContain('Add to chat')
        await drawer.get('[data-testid="talos-drawer-attach"]').trigger('click')
        expect(wrapper.emitted('attach')).toHaveLength(1)
        // the attach tile closes the drawer (single-shot action)
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-composer-drawer"]').exists()).toBe(false))
    })

    it('toggles browse mode from the drawer switch without closing it', async () => {
        const wrapper = mountComposer({ drawerMode: true })
        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-composer-drawer"]').exists()).toBe(true))
        await wrapper.get('[data-testid="talos-drawer-browse"]').trigger('click')
        expect(wrapper.emitted('toggleBrowse')).toEqual([[true]])
        expect(wrapper.find('[data-testid="talos-composer-drawer"]').exists()).toBe(true)
    })

    it('the model chip opens the existing model picker', async () => {
        const wrapper = mountComposer({ drawerMode: true })
        await wrapper.get('[data-testid="talos-composer-model-chip"]').trigger('click')
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-mobile-composer-model-picker"]').exists()).toBe(true))
    })
})
