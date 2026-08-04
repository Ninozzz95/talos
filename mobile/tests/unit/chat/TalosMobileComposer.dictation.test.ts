// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

// F2-T5 — composer mic control: hidden when dictation is unavailable (honest),
// toggles listening with pressed state parity with the desktop composer.
const profiles: TalosMobileModelProfileView[] = [{
    id: 'profile-deepseek', provider: 'deepseek', model: 'deepseek-chat', display_name: 'DeepSeek Chat',
    status: 'healthy', has_secret: true, effort_levels: ['low'], supports_thinking: false,
    show_in_composer: true, capabilities: null, probe_ok: true,
}]

function mountComposer(overrides: Record<string, unknown> = {}) {
    return mount(TalosMobileComposer, {
        props: {
            prompt: '', modelProfiles: profiles, routingProfiles: [],
            selectedModelProfileId: 'profile-deepseek', selectedRoutingProfileId: null,
            selectedEffort: 'low', thinking: false, canSend: true, sending: false,
            sendDisabledReason: '',
            ...overrides,
        },
    })
}

describe('TalosMobileComposer dictation (F2-T5)', () => {
    it('hides the mic entirely when dictation is unsupported', () => {
        const wrapper = mountComposer()
        expect(wrapper.find('[aria-label="Dictate"]').exists()).toBe(false)
        expect(wrapper.find('[aria-label="Stop dictation"]').exists()).toBe(false)
    })

    it('shows the mic when supported and emits toggleDictation on tap', async () => {
        const wrapper = mountComposer({ dictationSupported: true })
        const mic = wrapper.get('button[aria-label="Dictate"]')
        expect(mic.attributes('aria-pressed')).toBe('false')
        await mic.trigger('click')
        expect(wrapper.emitted('toggleDictation')).toHaveLength(1)
    })

    it('mentre si detta il CAMPO SPARISCE: resta solo la barra', () => {
        /**
         * Owner 2026-08-04, con screenshot: «vorrei che il campo testo venisse
         * nascosto mentre registri, in modo che si veda solo la barra di
         * registrazione. Al momento si vedono entrambi e risulta ripetitivo.»
         *
         * Non e' solo estetica: nel campo non si scrive mentre si parla, quindi
         * occupava spazio senza offrire niente.
         */
        const fermo = mountComposer({ dictationSupported: true })
        expect(fermo.find('textarea').exists()).toBe(true)

        const wrapper = mountComposer({ dictationSupported: true, dictationListening: true })
        expect(wrapper.get('[data-testid="talos-dictation-live"]').exists()).toBe(true)
        expect(wrapper.find('textarea').exists()).toBe(false)
    })

    it('due comandi OPPOSTI agli estremi: uno butta, uno tiene', () => {
        /**
         * La forma viene dal riferimento passato dall'owner (Claude mobile).
         * Il ✕ non e' un secondo Stop: emette `discardDictation`, che rimette il
         * campo com'era prima di parlare. Due comandi che fanno la stessa cosa
         * sarebbero un comando che mente.
         */
        const wrapper = mountComposer({ dictationSupported: true, dictationListening: true })
        const pill = wrapper.get('[data-testid="talos-dictation-live"]')
        expect(pill.find('[data-testid="talos-mic-waveform"]').exists()).toBe(true)

        /*
         * L'icona, non solo il bottone.
         *
         * La prima versione di questo test guardava che i due bottoni ci
         * fossero, e passava: `X` e `Check` NON erano importati, Vue li rendeva
         * come elementi sconosciuti e i due cerchi erano vuoti sullo schermo.
         * L'ha preso uno screenshot dal dispositivo, non il typecheck.
         */
        for (const id of ['talos-dictation-discard', 'talos-dictation-keep']) {
            expect(pill.get(`[data-testid="${id}"]`).find('svg').exists(), id).toBe(true)
        }

        pill.get('[data-testid="talos-dictation-discard"]').trigger('click')
        pill.get('[data-testid="talos-dictation-keep"]').trigger('click')
        expect(wrapper.emitted('discardDictation')).toHaveLength(1)
        expect(wrapper.emitted('toggleDictation')).toHaveLength(1)
    })

    it('«In ascolto» resta per chi non vede, senza diventare una frase sullo schermo', () => {
        // L'onda lo dice gia' a chi guarda; il testo serve a chi non guarda.
        const wrapper = mountComposer({ dictationSupported: true, dictationListening: true })
        const stato = wrapper.get('[data-testid="talos-dictation-live"] [role="status"]')
        expect(stato.text()).toContain('Listening')
        expect(stato.classes()).toContain('sr-only')
    })
})
