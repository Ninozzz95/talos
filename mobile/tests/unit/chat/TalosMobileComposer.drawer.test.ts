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

    it('the model chip opens the dedicated model & reasoning drawer', async () => {
        const wrapper = mountComposer({ drawerMode: true })
        await wrapper.get('[data-testid="talos-composer-model-chip"]').trigger('click')
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-model-drawer"]').exists()).toBe(true))
        expect(wrapper.find('[data-testid="talos-mobile-composer-model-picker"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-mobile-effort-picker"]').exists()).toBe(true)
    })
})

// Owner 2026-07-24 — immersive composer (compact→expand) and the "+" dropdown.
describe('composer immersive + plus-dropdown (owner 2026-07-24)', () => {
    it('immersive: the controls row is hidden when unfocused+empty, and returns on focus', async () => {
        const wrapper = mountComposer({ drawerMode: true, immersiveComposer: true, prompt: '' })
        // compact: no model chip row
        expect(wrapper.find('[data-testid="talos-composer-model-chip"]').exists()).toBe(false)
        await wrapper.get('textarea').trigger('focus')
        expect(wrapper.find('[data-testid="talos-composer-model-chip"]').exists()).toBe(true)
        await wrapper.get('textarea').trigger('blur')
        expect(wrapper.find('[data-testid="talos-composer-model-chip"]').exists()).toBe(false)
    })

    it('immersive: stays expanded when there is content (never collapses over a draft)', () => {
        const wrapper = mountComposer({ drawerMode: true, immersiveComposer: true, prompt: 'hello' })
        expect(wrapper.find('[data-testid="talos-composer-model-chip"]').exists()).toBe(true)
    })

    it('immersive OFF keeps the bar always visible', () => {
        const wrapper = mountComposer({ drawerMode: true, immersiveComposer: false, prompt: '' })
        expect(wrapper.find('[data-testid="talos-composer-model-chip"]').exists()).toBe(true)
    })

    it('plus-dropdown: "+" opens the anchored menu (not the drawer) and an item forwards its action', async () => {
        const wrapper = mountComposer({ drawerMode: true, plusDropdown: true })
        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        expect(wrapper.find('[data-testid="talos-composer-plus-menu"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-composer-drawer"]').exists()).toBe(false)
        await wrapper.get('[data-testid="talos-plus-menu-attach"]').trigger('click')
        expect(wrapper.emitted('attach')).toHaveLength(1)
        expect(wrapper.find('[data-testid="talos-composer-plus-menu"]').exists()).toBe(false)
    })

    it('plus-dropdown OFF: "+" opens the bottom drawer as before', async () => {
        const wrapper = mountComposer({ drawerMode: true, plusDropdown: false })
        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        expect(wrapper.find('[data-testid="talos-composer-plus-menu"]').exists()).toBe(false)
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-composer-drawer"]').exists()).toBe(true))
    })
})

// F4-#20 — the enhancer must never present a mute disabled control on touch
// (title tooltips do not exist there): the control stays tappable and a tap
// with missing prerequisites emits the REASON for the UI to surface.
describe('enhancer visible reason (F4-#20)', () => {
    it('drawer row stays tappable with an empty prompt and explains itself', async () => {
        const wrapper = mountComposer({ drawerMode: true })
        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-drawer-enhance"]').exists()).toBe(true))
        const row = wrapper.get('[data-testid="talos-drawer-enhance"]')
        expect(row.attributes('disabled')).toBeUndefined()
        expect(row.text()).toContain('Write a prompt first')
        await row.trigger('click')
        expect(wrapper.emitted('enhancePrompt')).toBeUndefined()
        const blocked = wrapper.emitted('enhanceBlocked')
        expect(blocked).toHaveLength(1)
        expect(String(blocked![0][0])).toContain('Write a prompt')
    })

    it('drawer row forwards the enhancement when a prompt exists', async () => {
        const wrapper = mountComposer({ drawerMode: true, prompt: 'Migliora questo testo' })
        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-drawer-enhance"]').exists()).toBe(true))
        await wrapper.get('[data-testid="talos-drawer-enhance"]').trigger('click')
        expect(wrapper.emitted('enhanceBlocked')).toBeUndefined()
        expect(wrapper.emitted('enhancePrompt')).toHaveLength(1)
    })

    it('classic wand stays tappable with an empty prompt and reports the reason', async () => {
        const wrapper = mountComposer({ drawerMode: false })
        const wand = wrapper.get('[aria-label="Improve prompt"]')
        expect(wand.attributes('disabled')).toBeUndefined()
        await wand.trigger('click')
        expect(wrapper.emitted('enhancePrompt')).toBeUndefined()
        expect(wrapper.emitted('enhanceBlocked')).toHaveLength(1)
    })

    it('classic wand reports the model reason when no model is callable', async () => {
        const wrapper = mountComposer({
            drawerMode: false, prompt: 'Testo', modelProfiles: [], selectedModelProfileId: null,
        })
        await wrapper.get('[aria-label="Improve prompt"]').trigger('click')
        const blocked = wrapper.emitted('enhanceBlocked')
        expect(blocked).toHaveLength(1)
        expect(String(blocked![0][0]).toLowerCase()).toContain('model')
    })
})
