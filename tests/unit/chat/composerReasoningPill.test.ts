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

describe('the reasoning state on the model pill', () => {
    it('shows a themed brain, and keeps the words for a tablet', () => {
        const wrapper = mountComposer({ thinking: true })

        const icon = wrapper.get('[data-testid="talos-composer-reasoning-icon"]')
        // Themed, not a grey glyph: it is the one thing left on a phone.
        expect(icon.classes().join(' ')).toContain('talos-accent')
        /**
         * Owner 2026-07-30: the first cut used BrainCircuit while the reasoning
         * block in the thread had used plain Brain since it was written. One
         * meaning wearing two icons is how a product stops looking designed —
         * and at 14px the circuit version is a smudge, not a brain.
         */
        expect(icon.classes()).toContain('lucide-brain')

        const words = wrapper.get('[data-testid="talos-composer-reasoning-label"]')
        expect(words.classes()).toContain('hidden')
        expect(words.classes()).toContain('md:inline')
        expect(words.text()).toBe('Thinking')
    })

    it('says "thinking" rather than an effort level when thinking is on', () => {
        const wrapper = mountComposer({ thinking: true })

        expect(wrapper.get('[data-testid="talos-composer-reasoning-label"]').text()).toBe('Thinking')
        expect(wrapper.find('[data-testid="talos-composer-reasoning-icon"]').exists()).toBe(true)
    })

    /**
     * The failure this prevents: on a phone the brain is the ONLY signal that
     * reasoning is on, and an icon with `aria-hidden` inside a button whose
     * aria-label ignores it means a screen reader user is told nothing at all.
     */
    it('carries the reasoning state in the accessible name, not only in pixels', () => {
        const off = mountComposer({ selectedEffort: 'off', thinking: false })
        const on = mountComposer({ selectedEffort: 'high', thinking: false })

        const chipOf = (w: ReturnType<typeof mountComposer>) =>
            w.get('[data-testid="talos-composer-model-chip"]').attributes('aria-label') ?? ''

        expect(chipOf(on)).toContain('High')
        expect(chipOf(off)).not.toContain('High')
        // The model is still the subject of the button; reasoning is an addition.
        expect(chipOf(on)).toContain('Claude Opus')
    })

    /**
     * Owner 2026-07-30: «l'icona cervello non si disattiva se ragionamento
     * esteso viene disattivato».
     *
     * The cause was inherited, not introduced: `effort` defaults to 'high' and
     * rarely returns to 'off', so a condition of "thinking OR effort" was true
     * almost always and the light never went out. A light that never goes out
     * is not an indicator. The icon follows the switch the user flips; the
     * words still report the effort, which is a real dial of its own.
     */
    it('puts the brain out when extended thinking is switched off', () => {
        const on = mountComposer({ thinking: true, selectedEffort: 'high' })
        expect(on.find('[data-testid="talos-composer-reasoning-icon"]').exists()).toBe(true)

        const off = mountComposer({ thinking: false, selectedEffort: 'high' })
        expect(off.find('[data-testid="talos-composer-reasoning-icon"]').exists()).toBe(false)
        // The effort is still worth reading on a tablet — it just is not a brain.
        expect(off.get('[data-testid="talos-composer-reasoning-label"]').text()).toBe('High')
    })

    it('shows nothing at all when reasoning is off', () => {
        const wrapper = mountComposer({ selectedEffort: 'off', thinking: false })

        expect(wrapper.find('[data-testid="talos-composer-reasoning-icon"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-composer-reasoning-label"]').exists()).toBe(false)
    })
})
