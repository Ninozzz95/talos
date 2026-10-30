// @vitest-environment jsdom
/**
 * PIEDE-01..08 — il piede «ragionamento» del foglio «Modello e ragionamento» (mockup approvato dall'owner il 27/10/2026, versione 6;
 * posti della versione 7 approvati dal Desktop: occhio senza testo, nota A9 solo quando c'è). Una riga: cervello · slider · livello.
 * Le voci e il livello vengono dalla regola del desktop portata col J3 (`statoPillolaRagionamento`), NON dalla scala del telefono:
 * così restano «Auto» e la nota A9 su ciò che parte davvero.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import TalosMobileEffortPicker from '@/components/chat/TalosMobileEffortPicker.vue'
import type { ProfiloDellaPillola } from '@/lib/chat/statoPillolaRagionamento'
import { useSettingsStore, __resetSettingsStoreForTests } from '@/stores/settings'

let wrapper: VueWrapper | null = null
afterEach(() => { wrapper?.unmount(); wrapper = null; __resetSettingsStoreForTests(); document.body.innerHTML = '' })

const luna: ProfiloDellaPillola = { provider: 'chatgpt', effort_levels: ['off', 'low', 'medium', 'high', 'xhigh'] } as ProfiloDellaPillola
const locale: ProfiloDellaPillola = { provider: 'local', effort_levels: [] } as ProfiloDellaPillola

function monta(props: Record<string, unknown>) {
    wrapper = mount(TalosMobileEffortPicker, {
        attachTo: document.body,
        props: { profile: luna, selectedEffort: 'high', wire: null, thinking: true, supportsThinking: true, thinkingSeparate: true, ...props },
    })
    return wrapper
}
const livello = (w: VueWrapper) => w.get('[data-testid="talos-mobile-effort-selected"]').text()
const pollice = (w: VueWrapper) => w.get('[data-testid="talos-mobile-effort-slider-thumb"]')

describe('PIEDE il ragionamento in una riga', () => {
    // ⛔ D3 (Pad 28/10/2026): col modello del telefono il piede diceva due volte la stessa cosa, e la seconda («decide il fornitore») era
    // falsa per un motore locale. Ora una frase sola; la nota A9 resta per i modelli in rete senza livelli.
    it('PIEDE-09 motore del telefono: una frase sola, senza la nota «decide il fornitore»; in rete la nota resta', () => {
        const w = monta({ profile: locale, selectedEffort: null, supportsThinking: false })
        expect(w.text()).toContain('This model runs without a reasoning setting.')
        expect(w.find('[data-testid="talos-mobile-effort-note"]').exists()).toBe(false)
        w.unmount()
        const rete = monta({ profile: { provider: 'openrouter', effort_levels: [] } as ProfiloDellaPillola, selectedEffort: null, supportsThinking: false })
        expect(rete.get('[data-testid="talos-mobile-effort-note"]').text()).toBe('This model receives no reasoning level: the provider decides.')
    })

    it('PIEDE-01 una riga: lo slider con le voci J3 del modello e il livello scelto accanto, senza nomi sotto la pista', () => {
        const w = monta({})
        expect(w.find('[data-testid="talos-mobile-effort-slider"]').exists()).toBe(true)
        expect(livello(w)).toBe('High')
        expect(pollice(w).attributes('aria-valuetext')).toBe('High')
        expect(w.findAll('.talos-segmented-slider__label')).toHaveLength(0)
        // le voci sono quelle del modello (off compreso), non una scala inventata
        expect(pollice(w).attributes('aria-valuemax')).toBe('4')
        // il pollice ha il suo nome per chi ascolta lo schermo (vue-tsc: la prop è `ariaLabel`, non l'attributo)
        expect(pollice(w).attributes('aria-label')).toBe('Reasoning effort levels')
    })

    it('PIEDE-02 senza una scelta dice «Auto»; col filo A9 il pollice sta vuoto sul livello che parte e la nota lo dice', () => {
        // la mappa del filo come la dà r4 (forma presa dai test del J3, TalosMobileReasoningPill.test.ts:257)
        const w = monta({ selectedEffort: null, wire: { none: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', auto: 'medium' } })
        expect(livello(w)).toBe('Auto')
        expect(w.get('[data-testid="talos-mobile-effort-slider"]').classes()).toContain('talos-segmented-slider--vuoto')
        // lo span del livello è aria-hidden: a chi ascolta lo schermo «Auto» lo dice il pollice (Desktop, revisione del blocco 2)
        expect(pollice(w).attributes('aria-valuetext')).toBe('Automatic · Medium')
        expect(w.get('[data-testid="talos-mobile-effort-note"]').text()).toContain('Medium')
    })

    it('PIEDE-03 la nota A9 c\'è SOLO quando c\'è qualcosa da dire', () => {
        const w = monta({})
        expect(w.find('[data-testid="talos-mobile-effort-note"]').exists()).toBe(false)
    })

    it('PIEDE-04 un livello scelto col dito parte; nella Chat il ragionamento esteso lo segue, spento con «Off»', async () => {
        const w = monta({})
        await pollice(w).trigger('keydown', { key: 'Home' })
        expect(w.emitted('selectEffort')?.at(-1)).toEqual(['off'])
        expect(w.emitted('selectThinking')?.at(-1)).toEqual([false])
    })

    it('PIEDE-05 nel Codice (`thinkingSeparate` falso) il livello basta: nessun ragionamento esteso a parte', async () => {
        const w = monta({ thinkingSeparate: false })
        await pollice(w).trigger('keydown', { key: 'Home' })
        expect(w.emitted('selectEffort')?.at(-1)).toEqual(['off'])
        expect(w.emitted('selectThinking')).toBeUndefined()
    })

    it('PIEDE-06 un modello senza livelli (sul dispositivo): niente slider, «Ragionamento esteso» col suo interruttore', async () => {
        const w = monta({ profile: locale, selectedEffort: null })
        expect(w.find('[data-testid="talos-mobile-effort-slider"]').exists()).toBe(false)
        const interruttore = w.get('[data-testid="talos-mobile-thinking-toggle"]')
        await interruttore.trigger('click')
        expect(w.emitted('selectThinking')?.at(-1)).toEqual([false])
    })

    it('PIEDE-07 l\'occhio «Mostra ragionamento» è un interruttore senza testo a schermo, col nome per chi ascolta', async () => {
        const w = monta({})
        const settings = useSettingsStore()
        const occhio = w.get('[data-testid="talos-mobile-show-reasoning"]')
        expect(occhio.attributes('role')).toBe('switch')
        expect(occhio.attributes('aria-label')).toBe('Show reasoning')
        expect(occhio.text()).toBe('')
        expect(occhio.attributes('aria-checked')).toBe(String(settings.state.shell.show_reasoning !== false))
        await occhio.trigger('click')
        await flushPromises()
        expect(settings.state.shell.show_reasoning).toBe(false)
    })

    it('PIEDE-08 nessun profilo: il piede non disegna niente', () => {
        const w = monta({ profile: null })
        expect(w.find('[data-testid="talos-mobile-effort-picker"]').exists()).toBe(false)
    })
})
