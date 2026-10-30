// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

const CONSUMI = 'https://chatgpt.com/settings/usage'
const servizi = vi.hoisted(() => ({
    stato: vi.fn(async () => ({ collegato: true, email: 'x@y.z', pianoAbilitato: true, scadeAlle: null, accessoInCorso: false, consumi: 'https://chatgpt.com/settings/usage' })),
    riassunto: vi.fn(() => ({ ore5: { richieste: 2, token: 26_400 }, giorni7: { richieste: 1, token: 900 } })),
    apri: vi.fn(async () => true),
}))
vi.mock('@/services/chatgptAccesso', () => ({ talosChatgpt: () => ({ stato: servizi.stato }) }))
vi.mock('@/services/chatgptConsumi', () => ({ talosConsumiChatgpt: () => ({ riassunto: servizi.riassunto }) }))
vi.mock('@/services/inAppBrowserService', () => ({ openTalosLinkOnce: servizi.apri }))

import TalosMobileChatgptRigaPiano from '@/components/chat/TalosMobileChatgptRigaPiano.vue'
import TalosMobileComposerModelPicker from '@/components/chat/TalosMobileComposerModelPicker.vue'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

/**
 * ⛔ D-0147-UI-2 (owner 27/10/2026, foto dal telefono; mockup `mobile/mockup/ui2` APPROVATO: «approvato»). Sul TELEFONO la pastiglia
 * «● Piano» mandava il compositore su TRE righe a 360/375/393 dp (regola del 24/10: mai oltre due). Lo stato del piano va nel
 * selettore dei modelli, prima riga del gruppo ChatGPT; sulla pillola del modello resta un puntino «chi paga». Ricerca: OpenAI SIWC
 * («near the composer or model selector»), t3code mobile `ChatGptSharingStatus.tsx:7-38`.
 */
const profilo = (provider: TalosMobileModelProfileView['provider'], model: string, nome: string): TalosMobileModelProfileView => ({
    id: `${provider}:${model}`, provider, model, display_name: nome, status: 'healthy', has_secret: true,
    effort_levels: ['low', 'medium', 'high'], supports_thinking: true, show_in_composer: true, capabilities: null, probe_ok: true,
})
const PROFILI = [profilo('chatgpt', 'gpt-6.1-terra', 'GPT-6.1 Terra'), profilo('chatgpt', 'gpt-6-luna', 'GPT-6 Luna'), profilo('openrouter', 'z/glm', 'GLM')]
let w: VueWrapper | null = null
afterEach(() => { w?.unmount(); w = null; vi.clearAllMocks() })

describe('D-0147-UI-2 — il piano ChatGPT nel selettore dei modelli (telefono)', () => {
    it('UI2-01 la pillola del modello porta il puntino «chi paga» e lo dice a parole; senza piano niente', async () => {
        const monta = (piano: unknown) => mount(TalosMobileComposer, {
            global: { stubs: { teleport: true } },
            props: {
                prompt: '', modelProfiles: PROFILI, routingProfiles: [], selectedModelProfileId: 'chatgpt:gpt-6.1-terra', selectedRoutingProfileId: null,
                selectedEffort: 'medium', thinking: false, canSend: true, sending: false, sendDisabledReason: '', dictationSupported: true,
                pianoChatgpt: piano,
            },
        })
        w = monta('attivo')
        // owner 27/10/2026, forma unica: compatto a riposo, la riga sotto il campo c'è col fuoco (FORMA-01)
        await w.get('[data-testid="talos-composer-prompt"]').trigger('focus')
        const puntino = w.get('[data-testid="talos-composer-model-plan-dot"]')
        expect(puntino.attributes('data-stato')).toBe('attivo')
        expect(puntino.attributes('aria-hidden')).toBe('true')
        // I-R1 (revisione del blocco 9): il colore che regge 3:1 in ogni tema (`pallinoDelPiano.test.ts`), mai il verde di stato
        expect(puntino.attributes('style')).toContain('var(--talos-plan-dot)')
        expect(puntino.attributes('style')).not.toContain('box-shadow')
        expect(w.get('[data-testid="talos-composer-model-chip"]').attributes('aria-label')).toContain('ChatGPT plan')
        w.unmount()
        w = monta('limite')
        await w.get('[data-testid="talos-composer-prompt"]').trigger('focus')
        expect(w.get('[data-testid="talos-composer-model-plan-dot"]').attributes('data-stato')).toBe('limite')
        expect(w.get('[data-testid="talos-composer-model-plan-dot"]').attributes('style')).toContain('var(--talos-plan-dot-limit)')
        // revisione del blocco 10, F-R2: i due stati avevano la stessa luminosità; il limite si riconosce anche dalla FORMA (anello vuoto)
        expect(w.get('[data-testid="talos-composer-model-plan-dot"]').attributes('style')).toContain('box-shadow: inset 0 0 0 2px var(--talos-plan-dot-limit)')
        expect(w.get('[data-testid="talos-composer-model-plan-dot"]').attributes('style')).not.toContain('background')
        expect(w.get('[data-testid="talos-composer-model-chip"]').attributes('aria-label')).toContain('Usage limit reached')
        w.unmount()
        w = monta(null)
        await w.get('[data-testid="talos-composer-prompt"]').trigger('focus')
        expect(w.find('[data-testid="talos-composer-model-plan-dot"]').exists()).toBe(false)
        expect(w.get('[data-testid="talos-composer-model-chip"]').attributes('aria-label')).not.toContain('ChatGPT plan')
    })

    it('UI2-02 la riga del piano è la prima del gruppo ChatGPT, solo lì; senza piano non c\'è', async () => {
        w = mount(TalosMobileComposerModelPicker, { props: { modelProfiles: PROFILI, selectedModelProfileId: 'chatgpt:gpt-6.1-terra', pianoChatgpt: 'attivo' }, attachTo: document.body })
        await flushPromises()
        const gruppo = w.get('[data-model-group="chatgpt"]')
        const righe = gruppo.findAll('[data-testid="talos-chatgpt-plan-row"]')
        expect(righe).toHaveLength(1)
        // prima di ogni modello del gruppo
        const contenuto = gruppo.get('[data-testid="talos-chatgpt-plan-row"]').element
        const primoModello = gruppo.get('[data-testid="talos-mobile-model-option"]').element
        expect(contenuto.compareDocumentPosition(primoModello) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(w.get('[data-model-group="openrouter"]').find('[data-testid="talos-chatgpt-plan-row"]').exists()).toBe(false)
        w.unmount()
        w = mount(TalosMobileComposerModelPicker, { props: { modelProfiles: PROFILI, selectedModelProfileId: 'chatgpt:gpt-6.1-terra' }, attachTo: document.body })
        await flushPromises()
        expect(w.find('[data-testid="talos-chatgpt-plan-row"]').exists()).toBe(false)
    })

    it('UI2-03 la riga si apre sul posto: account, due finestre contate da TALOS, la nota e «Manage usage»', async () => {
        w = mount(TalosMobileChatgptRigaPiano, { attachTo: document.body })
        await flushPromises()
        const tasto = w.get('[data-testid="talos-chatgpt-plan-row-toggle"]')
        expect(w.get('[data-testid="talos-chatgpt-plan-row-dot"]').attributes('style')).toContain('var(--talos-plan-dot)')
        expect(tasto.classes()).toContain('min-h-touch')
        expect(tasto.attributes('aria-expanded')).toBe('false')
        expect(tasto.text()).toContain('You’re using your ChatGPT plan')
        expect(tasto.text()).toContain('x@y.z')
        expect(w.find('[data-testid="talos-chatgpt-plan-row-usage-5h"]').exists()).toBe(false)
        await tasto.trigger('click')
        await flushPromises()
        expect(tasto.attributes('aria-expanded')).toBe('true')
        expect(w.get('[data-testid="talos-chatgpt-plan-row-usage-5h"]').text()).toBe('2 requests · 26.4K tokens')
        expect(w.get('[data-testid="talos-chatgpt-plan-row-usage-7d"]').text()).toBe('1 request · 900 tokens')
        expect(w.get('[data-testid="talos-chatgpt-plan-row-note"]').text()).toContain('Counted by TALOS on this device')
        await w.get('[data-testid="talos-chatgpt-plan-row-manage"]').trigger('click')
        expect(servizi.apri).toHaveBeenCalledWith(CONSUMI, 'system_browser')
    })

    it('UI2-04 al limite la riga lo dice e «Manage usage» è l\'azione principale, senza aprire niente', async () => {
        w = mount(TalosMobileChatgptRigaPiano, { props: { alLimite: true }, attachTo: document.body })
        await flushPromises()
        expect(w.text()).toContain('Usage limit reached')
        expect(w.text()).toContain('x@y.z')
        expect(w.get('[data-testid="talos-chatgpt-plan-row-dot"]').attributes('style')).toContain('box-shadow: inset 0 0 0 2px var(--talos-plan-dot-limit)')
        const gestisci = w.get('[data-testid="talos-chatgpt-plan-row-manage"]')
        expect(gestisci.attributes('data-primaria')).toBe('true')
        await gestisci.trigger('click')
        expect(servizi.apri).toHaveBeenCalledWith(CONSUMI, 'system_browser')
        // niente da aprire: non c'è il tasto che espande
        expect(w.find('[data-testid="talos-chatgpt-plan-row-toggle"]').attributes('aria-expanded')).toBeUndefined()
    })
})
