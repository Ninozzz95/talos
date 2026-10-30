// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTalosI18n } from '@/i18n'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'
import { TALOS_MOBILE_PROVIDERS, talosMobileProviderLabel } from '@/lib/mobileProviders'
import TalosMobileProviderIcon from '@/components/models/TalosMobileProviderIcon.vue'
import TalosMobileComposerModelPicker from '@/components/chat/TalosMobileComposerModelPicker.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

/*
 * ⛔ Anomalia 3 di Marco (foto marco-15, 23/10; ledger `LEDGER-ANOMALIE-MARCO-3-4-5-7-2026-10-24.md`): i modelli locali del PC
 * (`modelliDelPc.ts`, fornitore `computer`) comparivano come «COMPUTER 4» con l'icona «?» e «Unknown provider» in inglese anche
 * con l'app in italiano. Desktop (3), 24/10: `computer` resta FUORI dai fornitori configurabili — è un gruppo, non una chiave.
 */
type Composer = { mergeLocaleMessage(locale: string, messages: object): void, locale: { value: string } }
async function lingua(l: 'en' | 'it') {
    const g = (await createTalosI18n()).global as unknown as Composer
    if (l === 'it') g.mergeLocaleMessage('it', TALOS_IT_MESSAGES)
    g.locale.value = l
}
afterEach(async () => { await lingua('en') })

const dalPc: TalosMobileModelProfileView = {
    id: 'pc:local:qwen3-4b', provider: 'computer' as TalosMobileModelProfileView['provider'], model: 'local:qwen3-4b', display_name: 'Qwen3 4B',
    status: 'untested', has_secret: true, effort_levels: [], supports_thinking: false, show_in_composer: true, capabilities: null, probe_ok: null,
}

describe('il fornitore `computer` (anomalia 3 di Marco)', () => {
    it('MARCO3-01 il nome: «On the computer» / «Sul computer»; uno sconosciuto passa per la lingua dell\'app', async () => {
        const { t } = { t: (await createTalosI18n()).global.t as (k: string) => string }
        expect(talosMobileProviderLabel('computer', t)).toBe('On the computer')
        expect(talosMobileProviderLabel('chissà', t)).toBe('Unknown provider')
        await lingua('it')
        expect(talosMobileProviderLabel('computer', t)).toBe('Sul computer')
        expect(talosMobileProviderLabel('chissà', t)).toBe('Fornitore sconosciuto')
        // AL CONTRARIO: un marchio resta il suo nome
        expect(talosMobileProviderLabel('openrouter', t)).toBe('OpenRouter')
    })

    it('MARCO3-02 l\'icona è il portatile, col nome per i lettori di schermo; `computer` resta fuori dai fornitori configurabili', async () => {
        await lingua('it')
        const w = mount(TalosMobileProviderIcon, { props: { provider: 'computer' } })
        expect(w.find('[data-provider-computer]').exists()).toBe(true)
        expect(w.find('[data-provider-fallback]').exists()).toBe(false)
        expect(w.attributes('aria-label')).toBe('Sul computer')
        expect(TALOS_MOBILE_PROVIDERS.some((p) => p.id === 'computer')).toBe(false)
        // AL CONTRARIO: uno sconosciuto tiene il punto di domanda
        expect(mount(TalosMobileProviderIcon, { props: { provider: 'chissà' } }).find('[data-provider-fallback]').exists()).toBe(true)
    })

    it('MARCO3-03 nel foglio del modello il gruppo dice «Sul computer», non l\'id grezzo', async () => {
        await lingua('it')
        const w = mount(TalosMobileComposerModelPicker, { props: { modelProfiles: [dalPc], selectedModelProfileId: dalPc.id } })
        const titolo = w.get('[data-testid="talos-model-group-computer"]').text()
        expect(titolo).toContain('Sul computer')
        expect(titolo.replace('Sul computer', '')).not.toContain('computer')
    })

    /*
     * ⛔ D-0145-4 (Desktop, prova dal vivo 25/10 notte, sessione del PC): sotto ogni modello ChatGPT del PC «mai provato» (anche luna 6
     * usato più volte) e l'id grezzo «chatgpt:gpt-6-luna» sotto il nome. Lo stato «untested» lo inventava il telefono
     * (`modelliDelPc.ts`: il dispositivo non prova niente sul PC) e l'id del PC non è una parola per la persona.
     */
    it('D0145-4 un modello del PC non dice «mai provato» né il suo id grezzo; il nome resta', async () => {
        await lingua('it')
        const luna: TalosMobileModelProfileView = {
            id: 'pc:chatgpt:gpt-6-luna', provider: 'chatgpt', model: 'chatgpt:gpt-6-luna', display_name: 'GPT-6 Luna',
            status: 'untested', has_secret: true, effort_levels: ['low', 'high'], supports_thinking: true, show_in_composer: true, capabilities: null, probe_ok: null,
        }
        const w = mount(TalosMobileComposerModelPicker, { props: { modelProfiles: [luna, dalPc], selectedModelProfileId: luna.id } })
        expect(w.text()).toContain('GPT-6 Luna')
        expect(w.text()).not.toContain('mai provato')
        expect(w.text()).not.toContain('chatgpt:gpt-6-luna')
        expect(w.text()).not.toContain('local:qwen3-4b')
    })

    /*
     * Il fratello di D-0145-4 (revisione del Desktop 26/10): il modello di una sessione del Codice che l'app non elenca più (fornitore
     * tolto, modello sparito: `profiloDelModelloR4`, ripiego in rete) aveva come NOME l'id grezzo e «mai provato» inventato.
     */
    it('D0145-4b un modello del Codice non più in elenco: nome leggibile, niente id grezzo né «mai provato»', async () => {
        await lingua('it')
        const { profiloDelModelloR4 } = await import('@/lib/harness/r4/modelloR4')
        const sparito = profiloDelModelloR4('openrouter:z-ai/glm-4.7', [])!
        const w = mount(TalosMobileComposerModelPicker, { props: { modelProfiles: [sparito], selectedModelProfileId: sparito.id } })
        expect(w.text()).toContain('z-ai/glm-4.7')
        expect(w.text()).not.toContain('openrouter:z-ai/glm-4.7')
        expect(w.text()).not.toContain('mai provato')
    })
})
