// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileReasoningBlock from '@/components/chat/TalosMobileReasoningBlock.vue'
import { useSettingsStore, __resetSettingsStoreForTests } from '@/stores/settings'

/*
 * J3-bis (owner «Come il desktop», decisione A14 dell'08/10): «Mostra ragionamento» è SOLO VISTA. Spento, il blocco del ragionamento
 * (anche nelle chat vecchie) dice solo che il modello sta ragionando o ha ragionato, e il testo non si apre mai. Di serie è acceso.
 */
afterEach(() => { __resetSettingsStoreForTests(); document.body.innerHTML = '' })

describe('«Mostra ragionamento» (J3-bis)', () => {
    it('MOSTRA-01 di serie acceso: il blocco si apre e il testo c’è', () => {
        expect(useSettingsStore().state.shell.show_reasoning).toBe(true)
        const w = mount(TalosMobileReasoningBlock, { props: { reasoning: 'Penso ai casi limite.' } })
        expect(w.find('details').exists()).toBe(true)
        expect(w.get('[data-testid="talos-reasoning-text"]').text()).toBe('Penso ai casi limite.')
    })

    it('MOSTRA-02 spento: resta solo la riga («Reasoning» / «Reasoning…» col tempo), il testo non si apre mai', async () => {
        await useSettingsStore().setShell({ show_reasoning: false })
        const fatto = mount(TalosMobileReasoningBlock, { props: { reasoning: 'Penso ai casi limite.' } })
        expect(fatto.find('[data-testid="talos-reasoning-block"]').exists()).toBe(true)
        expect(fatto.find('details').exists()).toBe(false)
        expect(fatto.find('[data-testid="talos-reasoning-text"]').exists()).toBe(false)
        expect(fatto.text()).not.toContain('Penso ai casi limite.')
        expect(fatto.text()).toContain('Reasoning')
        const vivo = mount(TalosMobileReasoningBlock, { props: { reasoning: 'Penso…', live: true } })
        expect(vivo.text()).toContain('Reasoning…')
        expect(vivo.find('details').exists()).toBe(false)
        expect(vivo.text()).not.toContain('Penso…')
    })

    it('MOSTRA-03 la preferenza si salva e torna; un valore storto è «acceso» (il predefinito del desktop)', async () => {
        await useSettingsStore().setShell({ show_reasoning: false })
        await flushPromises()
        expect(useSettingsStore().state.shell.show_reasoning).toBe(false)
        await useSettingsStore().setShell({ show_reasoning: 'boh' as never })
        expect(useSettingsStore().state.shell.show_reasoning).toBe(true)
    })
})
