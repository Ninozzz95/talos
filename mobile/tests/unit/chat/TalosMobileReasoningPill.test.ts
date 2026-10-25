// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createTalosI18n } from '@/i18n'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'
import { useSettingsStore, __resetSettingsStoreForTests } from '@/stores/settings'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

/*
 * ⭐ J3 (24/10/2026) — la pillola del ragionamento nel compositore (owner; mockup `MOCKUP-PILLOLA-RAGIONAMENTO-2026-10-24.html`;
 * parità col desktop 79ac6dc46 + c6d1cbff2). Montata dentro il compositore vero, come la vedono Chat e Codice.
 */
type Composer = { mergeLocaleMessage(locale: string, messages: object): void, locale: { value: string } }
async function lingua(l: 'en' | 'it') {
    const g = (await createTalosI18n()).global as unknown as Composer
    if (l === 'it') g.mergeLocaleMessage('it', TALOS_IT_MESSAGES)
    g.locale.value = l
}

const profilo = (p: Partial<TalosMobileModelProfileView> = {}): TalosMobileModelProfileView => ({
    id: 'openrouter:gpt-6-luna', provider: 'openrouter', model: 'openai/gpt-6-luna', display_name: 'GPT-6-Luna', status: 'healthy',
    has_secret: true, effort_levels: ['low', 'medium', 'high', 'xhigh', 'max'], supports_thinking: true, thinking_toggle: true,
    show_in_composer: true, capabilities: null, probe_ok: true, ...p,
})

let w: VueWrapper | null = null
afterEach(async () => {
    w?.unmount()
    w = null
    document.body.innerHTML = ''
    __resetSettingsStoreForTests()
    await lingua('en')
})

function smonta() { w?.unmount(); w = null }
async function compositore({ profilo: scelto, ...props }: Record<string, unknown> = {}) {
    const p = (scelto as TalosMobileModelProfileView | undefined) ?? profilo()
    w = mount(TalosMobileComposer, {
        attachTo: document.body,
        global: { stubs: { teleport: true } },
        props: {
            prompt: '', modelProfiles: [p], selectedModelProfileId: p.id, selectedEffort: 'high', thinking: false,
            canSend: true, sending: false, docked: true, ...props,
        },
    })
    await flushPromises()
    return w
}
const pillola = (v: VueWrapper) => v.find('[data-testid="talos-composer-reasoning-pill"]')
async function apriFoglio(v: VueWrapper) {
    await v.get('[data-testid="talos-composer-model-chip"]').trigger('click')
    for (let i = 0; i < 3; i++) { await flushPromises(); await vi.dynamicImportSettled() }
}
async function apri(v: VueWrapper) {
    await pillola(v).trigger('click')
    for (let i = 0; i < 6; i++) { await flushPromises(); await vi.dynamicImportSettled() }
}
const attivo = () => document.activeElement as HTMLElement | null

describe('la pillola del ragionamento (J3)', () => {
    it('PILL-01 accanto alla pillola del modello: cervello, livello, ▾; nome accessibile «Reasoning level: High»', async () => {
        const v = await compositore()
        const fila = v.get('[data-testid="talos-composer-tools"]').element.children
        const indici = [...fila].map((e) => e.getAttribute('data-testid'))
        expect(indici.indexOf('talos-composer-reasoning-pill')).toBe(indici.indexOf('talos-composer-model-chip') + 1)
        expect(pillola(v).get('[data-testid="talos-composer-reasoning-pill-label"]').text()).toBe('High')
        expect(pillola(v).attributes('aria-label')).toBe('Reasoning level: High')
        expect(pillola(v).attributes('aria-haspopup')).toBe('menu')
        expect(pillola(v).findAll('svg')).toHaveLength(2)
    })

    it('PILL-AUTO-01 senza una scelta la pillola dice «Auto»; suggerimento e nome accessibile dicono «Automatic» / «Automatico»', async () => {
        const v = await compositore({ selectedEffort: null })
        expect(pillola(v).get('[data-testid="talos-composer-reasoning-pill-label"]').text()).toBe('Auto')
        expect(pillola(v).attributes('aria-label')).toBe('Reasoning level: Automatic')
        expect(pillola(v).attributes('title')).toBe('Reasoning level: Automatic')
        await lingua('it')
        await nextTick()
        expect(pillola(v).get('[data-testid="talos-composer-reasoning-pill-label"]').text()).toBe('Auto')
        expect(pillola(v).attributes('aria-label')).toBe('Livello di ragionamento: Automatico')
    })

    it('PILL-MAX-IT il livello più alto si chiama «Max» anche in italiano, nella pillola e nel menu', async () => {
        await lingua('it')
        const v = await compositore({ selectedEffort: 'max' })
        expect(pillola(v).get('[data-testid="talos-composer-reasoning-pill-label"]').text()).toBe('Max')
        await apri(v)
        expect(v.findAll('[data-testid="talos-reasoning-level"]').map((b) => b.text())).toEqual(['Disattivato', 'Basso', 'Medio', 'Alto', 'Molto alto', 'Max'])
    })

    it('PILL-MENU-01 aperto: «Reasoning» + modello; una riga intera per livello col ✓ su quello inviato; il fuoco sulla scelta', async () => {
        const v = await compositore({ selectedEffort: 'xhigh' })
        await apri(v)
        const menu = v.get('[data-testid="talos-reasoning-menu"]')
        expect(menu.attributes('role')).toBe('menu')
        expect(menu.get('.talos-reasoning-menu__testa').text()).toContain('Reasoning')
        expect(menu.get('[data-testid="talos-reasoning-menu-model"]').text()).toBe('GPT-6-Luna')
        const righe = menu.findAll('[data-testid="talos-reasoning-level"]')
        expect(righe.map((r) => r.attributes('data-livello'))).toEqual(['off', 'low', 'medium', 'high', 'xhigh', 'max'])
        expect(righe.every((r) => r.attributes('role') === 'menuitemradio' && r.classes().includes('talos-reasoning-menu__voce'))).toBe(true)
        expect(righe.filter((r) => r.attributes('aria-checked') === 'true').map((r) => r.attributes('data-livello'))).toEqual(['xhigh'])
        expect(attivo()?.getAttribute('data-livello')).toBe('xhigh')
        expect(pillola(v).attributes('aria-expanded')).toBe('true')
        // una riga intera ≥ 44 px (la regola del menu) e nessun cursore da nessuna parte
        const { readFileSync } = await import('node:fs')
        const { resolve } = await import('node:path')
        const sorgente = readFileSync(resolve(__dirname, '..', '..', '..', 'src', 'components', 'chat', 'TalosMobileReasoningMenu.vue'), 'utf8')
        expect(sorgente).toMatch(/\.talos-reasoning-menu__voce \{[^}]*min-height: 44px;/u)
        expect(document.querySelector('[data-testid="talos-mobile-effort-slider"], [role="slider"]')).toBeNull()
    })

    // J3-bis (owner «Come il desktop», A14): nel menu «Mostra ragionamento», SOLO VISTA; «Ragionamento esteso» esce dal menu
    it('PILL-MENU-02 «Mostra ragionamento» è una riga-interruttore di sola vista: cambia la preferenza e il menu RESTA aperto', async () => {
        const v = await compositore()
        await apri(v)
        expect(v.find('[data-testid="talos-reasoning-thinking"]').exists()).toBe(false)
        const leva = v.get('[data-testid="talos-reasoning-show"]')
        expect(leva.attributes('role')).toBe('menuitemcheckbox')
        expect(leva.text()).toContain('Show reasoning')
        expect(leva.attributes('aria-checked')).toBe('true')
        await leva.trigger('click')
        await flushPromises()
        expect(useSettingsStore().state.shell.show_reasoning).toBe(false)
        expect(v.get('[data-testid="talos-reasoning-show"]').attributes('aria-checked')).toBe('false')
        expect(v.emitted('selectThinking')).toBeUndefined()
        expect(v.emitted('selectEffort')).toBeUndefined()
        expect(v.find('[data-testid="talos-reasoning-menu"]').exists()).toBe(true)
    })

    it('PILL-THINK-01 «Ragionamento esteso» segue il livello: un livello acceso lo accende, «Off» lo spegne', async () => {
        const v = await compositore({ thinking: false })
        await apri(v)
        await v.get('[data-testid="talos-reasoning-level"][data-livello="medium"]').trigger('click')
        await flushPromises()
        expect(v.emitted('selectEffort')).toEqual([['medium']])
        expect(v.emitted('selectThinking')).toEqual([[true]])
        await v.setProps({ thinking: true, selectedEffort: 'medium' })
        await apri(v)
        await v.get('[data-testid="talos-reasoning-level"][data-livello="off"]').trigger('click')
        await flushPromises()
        expect(v.emitted('selectThinking')).toEqual([[true], [false]])
        // AL CONTRARIO: dove il fornitore non ha l'interruttore, niente
        smonta()
        const senza = await compositore({ profilo: profilo({ thinking_toggle: false, supports_thinking: false }) })
        await apri(senza)
        await senza.get('[data-testid="talos-reasoning-level"][data-livello="medium"]').trigger('click')
        expect(senza.emitted('selectThinking')).toBeUndefined()
    })

    // J3-bis (Desktop): col dito il fuoco NON va al campo (aprirebbe la tastiera) e resta sulla pillola; con mouse, penna o tastiera
    // torna al campo come sul desktop
    it('PILL-FUOCO-01 col mouse dopo una scelta il menu si chiude, il livello parte e il fuoco torna al compositore', async () => {
        const v = await compositore()
        await apri(v)
        const riga = v.get('[data-testid="talos-reasoning-level"][data-livello="low"]')
        await riga.trigger('pointerdown', { pointerType: 'mouse' })
        await riga.trigger('click')
        await flushPromises()
        expect(v.emitted('selectEffort')).toEqual([['low']])
        expect(v.find('[data-testid="talos-reasoning-menu"]').exists()).toBe(false)
        expect(attivo()).toBe(v.get('[data-testid="talos-composer-prompt"]').element)
    })

    it('PILL-FUOCO-02 col DITO il fuoco resta sulla pillola (niente tastiera che si apre)', async () => {
        const v = await compositore()
        await apri(v)
        const riga = v.get('[data-testid="talos-reasoning-level"][data-livello="low"]')
        await riga.trigger('pointerdown', { pointerType: 'touch' })
        await riga.trigger('click')
        await flushPromises()
        expect(v.emitted('selectEffort')).toEqual([['low']])
        expect(attivo()).toBe(pillola(v).element)
        expect(attivo()).not.toBe(v.get('[data-testid="talos-composer-prompt"]').element)
    })

    it('PILL-FUOCO-03 con la tastiera (Invio su una riga) il fuoco torna al compositore, anche dopo un tocco precedente', async () => {
        const v = await compositore()
        await apri(v)
        await v.get('[data-testid="talos-reasoning-level"][data-livello="medium"]').trigger('pointerdown', { pointerType: 'touch' })
        const menu = v.get('[data-testid="talos-reasoning-menu"]')
        await menu.trigger('keydown', { key: 'ArrowDown' })
        await menu.trigger('keydown', { key: 'Enter' })
        await flushPromises()
        expect(v.emitted('selectEffort')).toHaveLength(1)
        expect(attivo()).toBe(v.get('[data-testid="talos-composer-prompt"]').element)
    })

    it('PILL-TASTI-01 ↓/↑/Home/Fine si muovono; Esc chiude e torna alla pillola, senza scegliere', async () => {
        const v = await compositore({ selectedEffort: 'medium' })
        await apri(v)
        const menu = v.get('[data-testid="talos-reasoning-menu"]')
        await menu.trigger('keydown', { key: 'ArrowDown' })
        expect(attivo()?.getAttribute('data-livello')).toBe('high')
        await menu.trigger('keydown', { key: 'End' })
        expect(attivo()?.getAttribute('data-testid')).toBe('talos-reasoning-show')
        await menu.trigger('keydown', { key: 'Home' })
        expect(attivo()?.getAttribute('data-livello')).toBe('off')
        await menu.trigger('keydown', { key: 'Escape' })
        await flushPromises()
        expect(v.find('[data-testid="talos-reasoning-menu"]').exists()).toBe(false)
        expect(attivo()).toBe(pillola(v).element)
        expect(v.emitted('selectEffort')).toBeUndefined()
    })

    it('REV5-P1 il catalogo arriva col menu aperto: i livelli si ridisegnano, il fuoco resta nel menu ed Esc chiude ancora', async () => {
        const v = await compositore({ profilo: profilo({ effort_levels: ['low', 'medium', 'high'] }), selectedEffort: 'high' })
        await apri(v)
        expect(attivo()?.getAttribute('data-livello')).toBe('high')
        // 1. arrivano più livelli: la voce col fuoco resta la stessa
        await v.setProps({ modelProfiles: [profilo()] })
        await flushPromises()
        expect(v.findAll('[data-testid="talos-reasoning-level"]')).toHaveLength(6)
        expect(attivo()?.getAttribute('data-livello')).toBe('high')
        // 2. la voce col fuoco sparisce: il fuoco va alla stessa posizione, dentro il menu
        await v.setProps({ modelProfiles: [profilo({ effort_levels: ['low', 'medium'] })], selectedEffort: 'medium' })
        await flushPromises()
        const menu = v.get('[data-testid="talos-reasoning-menu"]').element
        expect(menu.contains(attivo())).toBe(true)
        attivo()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await flushPromises()
        expect(v.find('[data-testid="talos-reasoning-menu"]').exists()).toBe(false)
        expect(attivo()).toBe(pillola(v).element)
    })

    it('PILL-NASCOSTA-01 il modello non riceve un livello: la pillola non c’è; il foglio «Model» dice perché e tiene «Ragionamento esteso»', async () => {
        const locale = profilo({ id: 'local:qwen', provider: 'local', model: '/x/qwen.gguf', display_name: 'Qwen3.5 2B', effort_levels: ['low', 'medium', 'high'] })
        const v = await compositore({ profilo: locale })
        expect(pillola(v).exists()).toBe(false)
        await apriFoglio(v)
        const foglio = v.get('[data-testid="talos-model-drawer"]')
        expect(foglio.text()).toContain('Model')
        expect(foglio.text()).not.toContain('Model & reasoning')
        expect(foglio.get('[data-testid="talos-model-sheet-reasoning-note"]').text()).toBe('This model receives no reasoning level: the provider decides.')
        expect(foglio.find('[data-testid="talos-mobile-thinking-toggle"]').exists()).toBe(true)
        expect(foglio.find('[data-testid="talos-mobile-effort-slider"]').exists()).toBe(false)
        expect(foglio.find('[data-testid="talos-mobile-effort-picker"]').exists()).toBe(false)
        // J3-bis: per i modelli senza pillola «Mostra ragionamento» sta nel foglio (decisione 3 dell'owner)
        const mostra = foglio.get('[data-testid="talos-model-sheet-show-reasoning"]')
        expect(foglio.text()).toContain('Show reasoning')
        await mostra.trigger('click')
        await flushPromises()
        expect(useSettingsStore().state.shell.show_reasoning).toBe(false)
    })

    it('PILL-FOGLIO-01 AL CONTRARIO: con la pillola il foglio «Model» non ha né cursore né interruttore né riga', async () => {
        const v = await compositore()
        await apriFoglio(v)
        const foglio = v.get('[data-testid="talos-model-drawer"]')
        expect(foglio.find('[data-testid="talos-model-sheet-reasoning"]').exists()).toBe(false)
        expect(foglio.find('[data-testid="talos-model-sheet-show-reasoning"]').exists()).toBe(false)
        expect(foglio.find('[data-testid="talos-mobile-effort-slider"]').exists()).toBe(false)
    })

    it('PILL-A9-01 la riga A9 nei quattro casi (scelto ≠ inviato, non lo riceve, senza scelta, nessun livello)', async () => {
        const filo = { none: null, low: 'low', medium: 'high', high: 'high', xhigh: 'xhigh', max: 'max', auto: 'high' }
        const casi: Array<[string | null, string]> = [
            ['medium', 'You chose “Medium”: this model receives “High”.'],
            ['off', 'You chose “Off”: this model does not take it, the provider decides.'],
            [null, 'With no choice, this model receives “High”.'],
        ]
        for (const [scelto, frase] of casi) {
            const v = await compositore({ selectedEffort: scelto, reasoningWire: filo })
            await apri(v)
            expect(v.get('[data-testid="talos-reasoning-note"]').text()).toBe(frase)
            // il suggerimento della pillola la ripete (Hermes `reasoning-pill.tsx:55-60`)
            expect(pillola(v).attributes('title')).toContain(frase)
            smonta()
        }
        // senza scelta e con «auto» del filo: nessun ✓
        const auto = await compositore({ selectedEffort: null, reasoningWire: filo })
        await apri(auto)
        expect(auto.findAll('[aria-checked="true"][role="menuitemradio"]')).toHaveLength(0)
        smonta()
        // il quarto: nessun livello ⇒ niente pillola, la riga nel foglio del modello
        const nessuno = await compositore({ profilo: profilo({ effort_levels: [] }), reasoningWire: filo })
        expect(pillola(nessuno).exists()).toBe(false)
        await apriFoglio(nessuno)
        expect(nessuno.get('[data-testid="talos-model-sheet-reasoning-note"]').text()).toBe('This model receives no reasoning level: the provider decides.')
        // AL CONTRARIO: un livello che parte com'è non porta la riga
        smonta()
        const uguale = await compositore({ selectedEffort: 'high', reasoningWire: filo })
        await apri(uguale)
        expect(uguale.find('[data-testid="talos-reasoning-note"]').exists()).toBe(false)
    })

    it('PILL-A9-02 le frasi in italiano, con le virgolette basse', async () => {
        await lingua('it')
        const v = await compositore({ selectedEffort: 'medium', reasoningWire: { low: 'low', medium: 'high', high: 'high' } })
        await apri(v)
        expect(v.get('[data-testid="talos-reasoning-note"]').text()).toBe('Hai scelto «Medio»: questo modello riceve «Alto».')
    })

    it('PILL-CODICE-01 dove l’interruttore è lo stesso livello (`thinkingSeparate` falso, il Codice) una scelta non lo tocca', async () => {
        const v = await compositore({ thinkingSeparate: false })
        await apri(v)
        expect(v.find('[data-testid="talos-reasoning-thinking"]').exists()).toBe(false)
        await v.get('[data-testid="talos-reasoning-level"][data-livello="low"]').trigger('click')
        expect(v.emitted('selectThinking')).toBeUndefined()
    })

    it('PILL-SR-01 la pillola del modello non ripete più la parola del ragionamento (la dice la pillola sua)', async () => {
        const v = await compositore({ thinking: true })
        expect(v.find('[data-testid="talos-composer-reasoning-label"]').exists()).toBe(false)
        expect(v.get('[data-testid="talos-composer-model-chip"]').attributes('aria-label')).toBe('Choose model profile: GPT-6-Luna')
    })
})
