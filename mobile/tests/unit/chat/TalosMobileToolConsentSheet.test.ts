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

    it('TOOL-AUTH-18 exposes deny, allow once, always allow, and later as distinct outcomes', async () => {
        const wrapper = mountCard()

        await wrapper.get('[data-testid="talos-tool-consent-deny"]').trigger('click')
        await wrapper.get('[data-testid="talos-tool-consent-allow-once"]').trigger('click')
        await wrapper.get('[data-testid="talos-tool-consent-always"]').trigger('click')
        await wrapper.get('[data-testid="talos-tool-consent-later"]').trigger('click')

        expect(wrapper.emitted('deny')).toHaveLength(1)
        expect(wrapper.emitted('allowOnce')).toHaveLength(1)
        expect(wrapper.emitted('alwaysAllow')).toHaveLength(1)
        expect(wrapper.emitted('later')).toHaveLength(1)
        wrapper.unmount()
    })

    it('hides permanent authorization for a force-confirmed action', () => {
        const wrapper = mountCard(false)
        expect(wrapper.find('[data-testid="talos-tool-consent-always"]').exists()).toBe(false)
        wrapper.unmount()
    })
})
