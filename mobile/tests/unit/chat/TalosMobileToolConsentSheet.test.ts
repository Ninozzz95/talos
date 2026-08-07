// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileToolConsentSheet from '@/components/chat/TalosMobileToolConsentSheet.vue'

function mountCard(allowPersistent = true) {
    return mount(TalosMobileToolConsentSheet, {
        props: {
            title: 'Create a document',
            description: 'Writes a real file to the encrypted Library.',
            input: { title: 'Q2', body: 'x'.repeat(5_000) },
            actions: ['write'],
            sessionTitle: 'Quarterly planning',
            pendingCount: 2,
            allowPersistent,
        },
        global: { stubs: { Teleport: true } },
    })
}

describe('TalosMobileToolConsentSheet', () => {
    it('TOOL-AUTH-18 is a non-modal card without backdrop or focus trap', () => {
        const wrapper = mountCard()
        const card = wrapper.get('[data-testid="talos-tool-consent"]')

        expect(card.attributes('role')).toBe('dialog')
        expect(card.attributes('aria-modal')).toBeUndefined()
        expect(card.classes()).not.toContain('bg-black/50')
        expect(wrapper.text()).toContain('Quarterly planning')
        expect(wrapper.text()).toContain('2')
        expect(wrapper.get('[data-testid="talos-tool-consent-input"]').text().length)
            .toBeLessThan(4_500)
        wrapper.unmount()
    })

    it('TOOL-AUTH-18 expone tre scelte distinte, piu il rimandare', async () => {
        const wrapper = mountCard()

        await wrapper.get('[data-testid="talos-tool-consent-deny"]').trigger('click')
        await wrapper.get('[data-testid="talos-tool-consent-allow-once"]').trigger('click')
        await wrapper.get('[data-testid="talos-tool-consent-always"]').trigger('click')
        await wrapper.get('[data-testid="talos-tool-consent-later"]').trigger('click')

        expect(wrapper.emitted('deny')).toHaveLength(1)
        /*
         * ⛔ «Consenti» emette `allowTurn`, non `allowOnce`.
         *
         * Owner 2026-08-07: «qual è la differenza tra "consenti una volta" e
         * "per questa richiesta"? Non possiamo unirli?» — sì, ed erano due
         * perché noi distinguiamo la chiamata dal messaggio. Chi legge pensa al
         * messaggio che ha appena scritto.
         */
        expect(wrapper.emitted('allowTurn')).toHaveLength(1)
        expect(wrapper.emitted('allowOnce')).toBeUndefined()
        expect(wrapper.emitted('alwaysAllow')).toHaveLength(1)
        expect(wrapper.emitted('later')).toHaveLength(1)
        wrapper.unmount()
    })

    it('e dice a voce quanto dura un si, invece di lasciarlo dedurre', () => {
        // «Consenti» da solo si legge come «per sempre» a chi non ha mai visto
        // questa scheda, e chi lo scopre dopo non si fida piu'.
        const wrapper = mountCard()
        expect(wrapper.text()).toContain('covers this message')
        wrapper.unmount()
    })

    it('hides permanent authorization for a force-confirmed action', () => {
        const wrapper = mountCard(false)
        expect(wrapper.find('[data-testid="talos-tool-consent-always"]').exists()).toBe(false)
        wrapper.unmount()
    })
})
