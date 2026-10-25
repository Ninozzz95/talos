// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

/**
 * Owner 2026-07-26: «nella pill modello nel chat composer per i dispositivi in
 * portrait mode tipo telefonini se il reasoning è abilitato mostra un icona
 * brain tematizzata non il testo ragionamento, per i tablet e dispositivi più
 * larghi puoi mostrare anche il testo».
 *
 * The same shape the Library chip beside it already uses (owner 2026-07-29):
 * the icon is always there, the words wait for room. `md:` is 768px, which is
 * exactly TALOS_TABLET_WIDTH_MEDIA_QUERY, so the visual breakpoint and the app's
 * own definition of a tablet cannot drift apart.
 *
 * The accessible name is the part that is easy to get wrong. The button carries
 * an `aria-label`, and an aria-label REPLACES the element's text — so the
 * reasoning state was never announced even while it was visible. Hiding it from
 * the eye as well would make it invisible twice, so the name has to carry it.
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
            // The pill with the model name and the reasoning state only exists in
            // drawer mode, expanded: the classic bar has two icon-only buttons
            // instead and the immersive bar has none. Enumerated before writing
            // this, so the test pins the one surface the request is about.
            drawerMode: true,
            ...overrides,
        },
    })
}

/*
 * ⛔ J3-bis (25/10/2026, Desktop): la parola del ragionamento in `sr-only` sulla pillola del modello (owner 12/09) ripeteva ciò che
 * ora dice la pillola del ragionamento, col suo nome accessibile. I significati da proteggere restano gli stessi — lo stato si legge
 * anche senza vederlo, cambia quando cambia, e la chip «Ragiona» non torna — e si sono spostati sulla pillola sua.
 */
const ragionamento = (w: ReturnType<typeof mountComposer>) => w.find('[data-testid="talos-composer-reasoning-pill"]')

describe('the reasoning state on its own pill (J3-bis)', () => {
    it('lo stato del ragionamento vive sulla pillola sua; la pillola del modello non lo ripete e la chip non torna', () => {
        const wrapper = mountComposer({ thinking: true })
        expect(wrapper.find('[data-testid="talos-composer-thinking"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-composer-reasoning-label"]').exists()).toBe(false)
        expect(ragionamento(wrapper).text()).toContain('High')
    })

    it('carries the reasoning state in the accessible name, not only in pixels', () => {
        const on = mountComposer({ selectedEffort: 'high', thinking: false })
        const off = mountComposer({ selectedEffort: 'off', thinking: false })
        expect(ragionamento(on).attributes('aria-label')).toContain('High')
        expect(ragionamento(off).attributes('aria-label')).toContain('Off')
        // the model chip is about the model
        expect(on.get('[data-testid="talos-composer-model-chip"]').attributes('aria-label')).toContain('Claude Opus')
        expect(on.get('[data-testid="talos-composer-model-chip"]').attributes('aria-label')).not.toContain('High')
    })

    it('la riga del ragionamento CAMBIA quando cambia il livello', () => {
        expect(ragionamento(mountComposer({ selectedEffort: 'high' })).text()).toContain('High')
        expect(ragionamento(mountComposer({ selectedEffort: 'low' })).text()).toContain('Low')
    })
})
