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
            ...overrides,
        },
    })
}

describe('A3-OSS-2 — la pillola «Controlla azioni» sta accanto al selettore del modello', () => {
    /*
     * ⭐ Owner 27/10/2026 («Approvato», mockup v7): «Controlla azioni» non sta più nella fila accanto al chip (a 393 dp schiacciava il
     * nome del modello) ma in una riga SUA in cima al compositore, a riposo e aperto. Resta vero A3-OSS-2: un permesso in attesa non
     * sparisce mai dalla vista, e non copre «Interrompi risposta».
     */
    it('OSS2-01 a riposo, con una richiesta da controllare, la riga sta in cima, prima del campo, fuori dalla fila', () => {
        const wrapper = mountComposer({ toolReviewCount: 1 })
        const pillola = wrapper.get('[data-testid="talos-composer-tool-review"]')
        const campo = wrapper.get('[data-testid="talos-composer-prompt"]')
        expect(pillola.element.compareDocumentPosition(campo.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(pillola.element.closest('[data-testid="talos-composer-tools"]')).toBeNull()
        expect(pillola.text()).toBe('Review tool actions (1)')
        // il compositore resta a riposo: la riga si vede senza aprirlo
        expect(wrapper.get('[data-talos-composer-compact]').attributes('data-talos-composer-compact')).toBe('true')
        // e non è sotto Ferma: durante il giro Ferma resta nella riga del campo, la richiesta sopra
        expect(wrapper.find('[data-testid="talos-composer-action"]').element.closest('.talos-composer-field-row')).not.toBeNull()
    })

    it('OSS2-02 toccarla chiede di riaprire la richiesta', async () => {
        const wrapper = mountComposer({ toolReviewCount: 2 })
        await wrapper.get('[data-testid="talos-composer-tool-review"]').trigger('click')
        expect(wrapper.emitted('reviewTools')).toHaveLength(1)
    })

    it('OSS2-03 senza richieste niente riga, e il compositore a riposo resta compatto, come prima', () => {
        const wrapper = mountComposer({ toolReviewCount: 0 })
        expect(wrapper.find('[data-testid="talos-composer-tool-review"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-composer-model-chip"]').exists()).toBe(false)
        expect(wrapper.get('[data-talos-composer-compact]').attributes('data-talos-composer-compact')).toBe('true')
    })
})
