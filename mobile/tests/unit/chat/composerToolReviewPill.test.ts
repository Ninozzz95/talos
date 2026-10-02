// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

/**
 * ⛔⛔ A3-OSS-2 (Pad, 01/10/2026): «Controlla azioni degli strumenti (1)», fisso in basso a destra, copriva
 * «Interrompi risposta». Owner 01/10: «pillola accanto alla pill selettore modello»; e a riposo «Riga visibile se
 * c'è da rispondere» — un permesso in attesa non sparisce mai dalla vista.
 */
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
            drawerMode: true, immersiveComposer: true,
            ...overrides,
        },
    })
}

describe('A3-OSS-2 — la pillola «Controlla azioni» sta accanto al selettore del modello', () => {
    it('OSS2-01 a riposo, con una richiesta da controllare, la riga c\'è e la pillola segue il selettore', () => {
        const wrapper = mountComposer({ toolReviewCount: 1 })
        const chip = wrapper.get('[data-testid="talos-composer-model-chip"]')
        const pillola = wrapper.get('[data-testid="talos-composer-tool-review"]')
        expect(chip.element.nextElementSibling).toBe(pillola.element)
        expect(pillola.text()).toBe('Review tool actions (1)')
        expect(wrapper.get('[data-talos-composer-compact]').attributes('data-talos-composer-compact')).toBe('false')
    })

    it('OSS2-02 toccarla chiede di riaprire la richiesta', async () => {
        const wrapper = mountComposer({ toolReviewCount: 2 })
        await wrapper.get('[data-testid="talos-composer-tool-review"]').trigger('click')
        expect(wrapper.emitted('reviewTools')).toHaveLength(1)
    })

    it('OSS2-03 senza richieste il compositore a riposo resta compatto, come prima', () => {
        const wrapper = mountComposer({ toolReviewCount: 0 })
        expect(wrapper.find('[data-testid="talos-composer-tool-review"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-composer-model-chip"]').exists()).toBe(false)
        expect(wrapper.get('[data-talos-composer-compact]').attributes('data-talos-composer-compact')).toBe('true')
    })
})
