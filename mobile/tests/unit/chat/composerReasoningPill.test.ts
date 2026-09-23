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
    /**
     * ⛔ Owner 2026-09-13, dal Pad: «devi eliminare il pulsante ragiona
     * completamente, tanto ce l'abbiamo nel drawer del modello». Questo caso
     * proteggeva il cervello DENTRO quella chip; la chip non c'e' piu', e con
     * lei il testid dell'icona. Non l'ho cancellato: il significato da
     * proteggere e' rimasto lo stesso e si e' spostato — lo stato del
     * ragionamento si legge sulla PILLOLA DEL MODELLO, e la chip non deve
     * tornare a doppiarlo.
     */
    it('lo stato del ragionamento vive sulla pillola del modello, e la chip non torna', () => {
        const wrapper = mountComposer({ thinking: true })

        expect(wrapper.find('[data-testid="talos-composer-thinking"]').exists()).toBe(false)

        const words = wrapper.get('[data-testid="talos-composer-reasoning-label"]')
        expect(words.classes()).not.toContain('hidden')
        expect(words.text()).toBe('Thinking')
        // ⛔ Resta per chi ascolta lo schermo: l'occhio lo legge nel foglio del modello.
        expect(words.classes()).toContain('sr-only')
    })

    it('says "thinking" rather than an effort level when thinking is on', () => {
        const wrapper = mountComposer({ thinking: true })

        expect(wrapper.get('[data-testid="talos-composer-reasoning-label"]').text()).toBe('Thinking')
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
    /**
     * ⛔ 2026-09-13: il cervello non c'e' piu' — la chip che lo conteneva e'
     * stata tolta su ordine dell'owner perche' doppiava il drawer del modello.
     * Il difetto che questo caso previene NON e' sparito con l'icona: era «un
     * indicatore che non si spegne non e' un indicatore». Adesso l'indicatore
     * e' la riga leggibile sulla pillola, e deve cambiare con l'interruttore.
     */
    it('la riga del ragionamento CAMBIA quando il pensiero esteso si spegne', () => {
        const on = mountComposer({ thinking: true, selectedEffort: 'high' })
        expect(on.get('[data-testid="talos-composer-reasoning-label"]').text()).toBe('Thinking')

        const off = mountComposer({ thinking: false, selectedEffort: 'high' })
        // Lo sforzo resta una manopola sua e vale la pena leggerlo: non e' un cervello.
        expect(off.get('[data-testid="talos-composer-reasoning-label"]').text()).toBe('High')
    })

    it('shows nothing at all when reasoning is off', () => {
        const wrapper = mountComposer({ selectedEffort: 'off', thinking: false })

        expect(wrapper.find('[data-testid="talos-composer-reasoning-label"]').exists()).toBe(false)
    })
})
