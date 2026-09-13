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
    it('mantiene il microfono disabilitato e spiega quando la dettatura non è disponibile', async () => {
        const wrapper = mountComposer()
        expect(wrapper.get('[aria-label="Dictate"]').attributes('disabled')).toBeDefined()
        expect(wrapper.get('[data-testid="talos-composer-mic-reason"]').text()).toContain('not available')
        expect(wrapper.find('[aria-label="Stop dictation"]').exists()).toBe(false)
    })

    it('shows the mic when supported and emits toggleDictation on tap', async () => {
        const wrapper = mountComposer({ dictationSupported: true })
        const mic = wrapper.get('button[aria-label="Dictate"]')
        /**
         * ⛔⛔ 2026-09-13, misurato sul Pad con `uiautomator dump`: con
         * `aria-pressed` addosso questo pulsante arrivava nell'albero di
         * accessibilita' come ToggleButton **senza nome** (desc vuota, testo
         * vuoto), perche' dentro ha solo un'icona. Chi usa il lettore di
         * schermo sentiva «pulsante di attivazione» e nient'altro, mentre il
         * «+» accanto — che non ha aria-pressed — il nome ce l'ha.
         *
         * Quindi qui non si prova piu' lo stato premuto, che per giunta era
         * morto (la riga del campo sparisce mentre si detta): si prova che il
         * comando abbia un NOME e che non si presenti come interruttore.
         */
        expect(mic.attributes('aria-pressed')).toBeUndefined()
        expect(mic.attributes('aria-label')).toBe('Dictate')
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

/**
 * Owner 2026-09-13, dal Pad: invio dinamico, solo microfono o invio a seconda
 * del testo immesso, «come il vecchio composer», e accanto al campo.
 *
 * Torna quindi la forma del 2026-07-25: UN comando a destra del campo, che
 * cambia faccia. Il secondo microfono che accodava (owner 2026-08-27) non c'e'
 * piu' — con del testo scritto il comando e' Invia, e la dettatura accoda
 * ancora da sola (useTalosMobileDictation, capturedBase) quando parte a
 * campo vuoto.
 */
describe('TalosMobileComposer — un solo comando dinamico accanto al campo (owner 2026-09-13)', () => {
    it('a campo vuoto il comando e il microfono, e il secondo microfono non esiste piu', async () => {
        const wrapper = mountComposer({ dictationSupported: true, prompt: '' })
        expect(wrapper.find('[data-testid="talos-composer-append-mic"]').exists()).toBe(false)
        const action = wrapper.get('[data-testid="talos-composer-action"]')
        expect(action.attributes('aria-label')).toBe('Dictate')
        expect(action.attributes('disabled')).toBeUndefined()
    })

    it('con del testo scritto lo stesso comando diventa Invia', async () => {
        const wrapper = mountComposer({ dictationSupported: true, prompt: 'ciao TALOS' })
        expect(wrapper.get('[data-testid="talos-composer-action"]').attributes('aria-label')).toBe('Send message')
        expect(wrapper.find('button[aria-label="Dictate"]').exists()).toBe(false)
    })

    it('a campo vuoto il tocco avvia la dettatura, stesso evento di prima', async () => {
        const wrapper = mountComposer({ dictationSupported: true, prompt: '' })
        await wrapper.get('[data-testid="talos-composer-action"]').trigger('click')
        expect(wrapper.emitted('toggleDictation')).toHaveLength(1)
    })

    it('senza dettatura disponibile il microfono resta, spento e con la sua ragione', async () => {
        const wrapper = mountComposer({ dictationSupported: false, prompt: '' })
        const action = wrapper.get('[data-testid="talos-composer-action"]')
        expect(action.attributes('aria-label')).toBe('Dictate')
        expect(action.attributes('disabled')).toBeDefined()
        expect(wrapper.get('[data-testid="talos-composer-mic-reason"]').text()).toContain('not available')
    })

    it('mentre risponde il comando ferma, anche col campo pieno', async () => {
        const wrapper = mountComposer({ dictationSupported: true, prompt: 'ciao TALOS', sending: true })
        const action = wrapper.get('[data-testid="talos-composer-action"]')
        expect(action.attributes('aria-label')).toBe('Stop response')
        await action.trigger('click')
        expect(wrapper.emitted('stop')).toHaveLength(1)
    })
})
