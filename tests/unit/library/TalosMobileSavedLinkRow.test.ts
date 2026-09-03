// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileSavedLinkRow from '@/components/talos/library/TalosMobileSavedLinkRow.vue'

const row = {
    fileId: 'source-1',
    url: 'https://example.com/research',
    title: 'Primary research',
    host: 'example.com',
    savedAt: '2026-07-28T10:00:00.000Z',
}

describe('TalosMobileSavedLinkRow', () => {
    it('LINK-PARITY-01 renders title, host, date and two independent 48px actions', () => {
        const wrapper = mount(TalosMobileSavedLinkRow, {
            props: {
                row,
                savedAtLabel: 'today',
                copyTestId: 'copy',
                browserTestId: 'browser',
            },
        })

        expect(wrapper.attributes('data-talos-saved-link-row')).toBeDefined()
        expect(wrapper.text()).toContain('Primary research')
        expect(wrapper.text()).toContain('example.com')
        expect(wrapper.text()).toContain('today')
        expect(wrapper.get('[data-testid="copy"]').classes()).toContain('min-h-14')
        expect(wrapper.get('[data-testid="browser"]').classes()).toContain('min-h-12')
        expect(wrapper.get('[data-testid="browser"]').classes()).toContain('min-w-12')
        /*
         * ⛔⛔⛔ 3/9, stessa forma trovata dal vivo in HarnessScreen.vue
         * (ledger §67): `line-clamp-2` imposta da sé `display:-webkit-box`
         * — una `block` esplicita nella STESSA lista di classi vince nella
         * cascata Tailwind e lo sovrascrive, disattivando il clamp (il
         * titolo tornava a mostrarsi per intero, mai troncato a 2 righe).
         * jsdom non ha un motore di layout: non può provare il rendering
         * reale, solo impedire che questa stessa forma di conflitto torni.
         */
        expect(wrapper.get('.line-clamp-2').classes()).not.toContain('block')
    })

    it('LINK-PARITY-02 emits copy and browser destinations independently', async () => {
        const wrapper = mount(TalosMobileSavedLinkRow, {
            props: {
                row,
                savedAtLabel: 'today',
                copyTestId: 'copy',
                browserTestId: 'browser',
            },
        })

        await wrapper.get('[data-testid="copy"]').trigger('click')
        expect(wrapper.emitted('openCopy')).toEqual([[]])
        expect(wrapper.emitted('openBrowser')).toBeUndefined()

        await wrapper.get('[data-testid="browser"]').trigger('click')
        expect(wrapper.emitted('openBrowser')).toEqual([[]])
    })
})
