// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileStationOptionsSheet from '@/components/talos/ui/TalosMobileStationOptionsSheet.vue'

/**
 * Il foglio «Opzioni» delle stazioni (fase 6, owner 14/09/2026). A3-84 (25/09/2026): l'elenco delle chat ci porta
 * tre gruppi in più (Periodo, Contenuto, Modello) e un «Azzera» nell'intestazione (LibreChat PR #16246, 23/09/2026).
 * ⛔ Le quattro stazioni che lo usano già non passano niente di nuovo: per loro il foglio non cambia.
 */
const ORDINE = [{ value: 'a', label: 'Attività' }, { value: 't', label: 'Titolo' }]

function monta(extra: Record<string, unknown> = {}) {
    return mount(TalosMobileStationOptionsSheet, {
        attachTo: document.body,
        props: { title: 'Opzioni', testIdPrefix: 'prova', sortLabel: 'Ordina', sortOptions: ORDINE, sort: 'a', ...extra },
    })
}

afterEach(() => { document.body.innerHTML = '' })

describe('TalosMobileStationOptionsSheet', () => {
    it('OPZ-01 senza gruppi né azzera il foglio è quello di sempre', () => {
        const wrapper = monta()
        expect(document.querySelectorAll('[data-testid^="prova-group-"]').length).toBe(0)
        expect(document.querySelector('[data-testid="prova-options-reset"]')).toBeNull()
        wrapper.unmount()
    })

    it('OPZ-02 A3-84 ogni gruppo ha il suo titolo, le sue voci, e dice quale è scelta', async () => {
        const wrapper = monta({
            groups: [
                { id: 'periodo', label: 'Periodo', value: 'sempre', options: [{ value: 'sempre', label: 'Sempre' }, { value: 'oggi', label: 'Oggi' }] },
                { id: 'modello', label: 'Modello', value: 'glm', options: [{ value: '', label: 'Tutti' }, { value: 'glm', label: 'GLM 5.3' }] },
            ],
        })
        const periodo = document.querySelector('[data-testid="prova-group-periodo"]') as HTMLElement
        expect(periodo.querySelector('h3')?.textContent).toBe('Periodo')
        expect(document.querySelector('[data-testid="prova-periodo-oggi"]')?.getAttribute('aria-checked')).toBe('false')
        expect(document.querySelector('[data-testid="prova-modello-glm"]')?.getAttribute('aria-checked')).toBe('true')
        ;(document.querySelector('[data-testid="prova-periodo-oggi"]') as HTMLElement).click()
        await wrapper.vm.$nextTick()
        expect(wrapper.emitted('update:group')?.[0]).toEqual(['periodo', 'oggi'])
        wrapper.unmount()
    })

    it('OPZ-03 A3-84 «Azzera» sta nell\'intestazione, si vede solo se c\'è qualcosa da azzerare, e lo dice', async () => {
        const spento = monta({ resetLabel: 'Azzera', resettable: false })
        expect(document.querySelector('[data-testid="prova-options-reset"]')).toBeNull()
        spento.unmount()
        const acceso = monta({ resetLabel: 'Azzera', resettable: true })
        const pulsante = document.querySelector('[data-testid="prova-options-reset"]') as HTMLButtonElement
        expect(pulsante.closest('header')).not.toBeNull()
        expect(pulsante.textContent?.trim()).toBe('Azzera')
        pulsante.click()
        await acceso.vm.$nextTick()
        expect(acceso.emitted('reset')).toHaveLength(1)
        acceso.unmount()
    })
})
