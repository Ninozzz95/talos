// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
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
    it('hides the mic entirely when dictation is unsupported', async () => {
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

    it('mentre si detta il CAMPO SPARISCE: resta solo la barra', async () => {
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
        expect(wrapper.find('textarea').exists()).toBe(false)
        /*
         * ⛔ QUI NON SI GUARDA DENTRO LA BARRA, e non è una rinuncia.
         *
         * Dal 2026-08-10 la barra è un componente caricato al bisogno — sta
         * fuori dal grafo d'avvio perché chi scrive a tastiera non deve pagarla
         * (misurato: 601.684 byte su un tetto di 600.000). Da qui dentro non è
         * ancora risolta al momento del montaggio, e un'asserzione su di lei
         * proverebbe soltanto che una promessa non si è risolta.
         *
         * I suoi tre comandi, la trascrizione viva e lo stato per chi non vede
         * si provano dove vivono: `tests/unit/chat/barraDettatura.test.ts`.
         * Qui resta la responsabilità del COMPOSITORE: mentre si detta, il
         * campo sparisce.
         */
    })

})
