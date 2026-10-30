// @vitest-environment jsdom

/**
 * ⛔ «Stop anche a chat ferma» (owner 29/10/2026 sera; scheda `mockup/ferma-tutto/pezzi/SCHEDA-DI-CONSEGNA.md`, voce 7 e G7 scelta (a);
 * ledger `LEDGER-FERMA-TUTTO-MOBILE-2026-10-29.md`, riga 13): a chat FERMA con agenti al lavoro lo Stop resta al posto dell'Invio a campo
 * vuoto e si chiama «Ferma i N agenti» / «Ferma l'agente»; appena si scrive torna l'Invio; il microfono resta acceso. Senza agenti, e
 * nella Chat che la prop non la passa, il compositore è quello di sempre.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import TalosMobileComposerExpanded from '@/components/chat/TalosMobileComposerExpanded.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

let wrapper: VueWrapper | null = null
afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
})

const modelProfiles: TalosMobileModelProfileView[] = [{
    id: 'profile-deepseek', provider: 'deepseek', model: 'deepseek-chat', display_name: 'DeepSeek Chat', status: 'healthy', has_secret: true,
    effort_levels: ['low', 'medium', 'high'], supports_thinking: true, show_in_composer: true, capabilities: { vision: true }, probe_ok: true,
}]

function mountComposer(overrides: Record<string, unknown> = {}): VueWrapper {
    wrapper = mount(TalosMobileComposer, {
        attachTo: document.body,
        global: { stubs: { teleport: true } },
        props: {
            prompt: '', modelProfiles, selectedModelProfileId: 'profile-deepseek', selectedEffort: 'medium', thinking: false,
            canSend: true, sending: false, sendDisabledReason: '', dictationSupported: true, ...overrides,
        },
    })
    return wrapper
}
const azione = (w: VueWrapper) => w.get('[data-testid="talos-composer-action"]')

describe('COMP-AGENTI — lo Stop a chat ferma con agenti al lavoro', () => {
    it('COMP-AGENTI-01 campo vuoto, chat ferma, 2 agenti: lo Stop al posto dell’Invio, acceso; il tocco emette `stop`', async () => {
        const w = mountComposer({ agentiDaFermare: 2 })
        expect(azione(w).attributes('data-talos-action')).toBe('stop')
        expect(azione(w).attributes('disabled')).toBeUndefined()
        await azione(w).trigger('click')
        expect(w.emitted('stop')).toEqual([[]])
        expect(w.emitted('send')).toBeUndefined()
    })

    it('COMP-AGENTI-02 appena si scrive torna l’Invio; senza agenti (o nella Chat, senza la prop) l’Invio di sempre', async () => {
        const w = mountComposer({ agentiDaFermare: 2 })
        await w.setProps({ prompt: 'Poi aggiorna il README' })
        expect(azione(w).attributes('data-talos-action')).toBe('send')
        await w.setProps({ prompt: '' })
        expect(azione(w).attributes('data-talos-action')).toBe('stop')
        await w.setProps({ agentiDaFermare: 0 })
        expect(azione(w).attributes('data-talos-action')).toBe('send')
        wrapper?.unmount()
        const chat = mountComposer()
        expect(azione(chat).attributes('data-talos-action')).toBe('send')
        expect(azione(chat).attributes('disabled')).toBeDefined()
    })

    it('COMP-AGENTI-03 il nome dice chi si ferma: «Stop the 2 agents», «Stop the agent»; a giro vivo resta «Stop response»', async () => {
        const w = mountComposer({ agentiDaFermare: 2 })
        expect(azione(w).attributes('aria-label')).toBe('Stop the 2 agents')
        await w.setProps({ agentiDaFermare: 1 })
        expect(azione(w).attributes('aria-label')).toBe('Stop the agent')
        await w.setProps({ sending: true })
        expect(azione(w).attributes('aria-label')).toBe('Stop response')
    })

    it('COMP-AGENTI-04 il microfono resta acceso a chat ferma con agenti (a giro vivo si spegne, come oggi)', async () => {
        const w = mountComposer({ agentiDaFermare: 2 })
        expect(w.get('[data-testid="talos-composer-mic"]').attributes('disabled')).toBeUndefined()
        await w.setProps({ sending: true })
        expect(w.get('[data-testid="talos-composer-mic"]').attributes('disabled')).toBeDefined()
    })

    it('COMP-AGENTI-05 il compositore a schermo intero ha la stessa regola: Stop a campo vuoto con agenti, Invio col testo', async () => {
        wrapper = mount(TalosMobileComposerExpanded, { attachTo: document.body, props: { prompt: '', sending: false, canSubmit: false, agentiDaFermare: 2 } })
        const tasto = () => document.querySelector<HTMLButtonElement>('[data-testid="talos-composer-expanded-action"]')!
        expect(tasto().getAttribute('aria-label')).toBe('Stop the 2 agents')
        expect(tasto().disabled).toBe(false)
        tasto().click()
        expect(wrapper.emitted('stop')).toEqual([[]])
        await wrapper.setProps({ prompt: 'Altro', canSubmit: true })
        expect(tasto().getAttribute('aria-label')).toBe('Send message')
        tasto().click()
        expect(wrapper.emitted('send')).toEqual([[]])
    })
})
