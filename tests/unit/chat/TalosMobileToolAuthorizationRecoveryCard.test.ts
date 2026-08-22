// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileToolAuthorizationRecoveryCard
    from '@/components/chat/TalosMobileToolAuthorizationRecoveryCard.vue'

function mountCard(busy = false) {
    return mount(TalosMobileToolAuthorizationRecoveryCard, {
        props: {
            sessionTitle: 'Quarterly planning',
            tools: [{
                tool: 'document_create',
                actions: ['write'],
            }],
            recoveryCount: 1,
            busy,
        },
        global: { stubs: { Teleport: true } },
    })
}

describe('TalosMobileToolAuthorizationRecoveryCard', () => {
    it('TOOL-AUTH-25 explains uncertainty without becoming modal', () => {
        const wrapper = mountCard()
        const card = wrapper.get('[data-testid="talos-tool-recovery"]')

        expect(card.attributes('role')).toBe('dialog')
        expect(card.attributes('aria-modal')).toBeUndefined()
        expect(card.classes()).not.toContain('bg-black/50')
        expect(wrapper.text()).toContain('Quarterly planning')
        expect(wrapper.text()).toContain('Create a document')
        expect(wrapper.text()).toContain('Retrying may repeat an action')
        wrapper.unmount()
    })

    it('TOOL-AUTH-25 exposes explicit retry, cancel, and later outcomes', async () => {
        const wrapper = mountCard()

        await wrapper.get('[data-testid="talos-tool-recovery-retry"]').trigger('click')
        await wrapper.get('[data-testid="talos-tool-recovery-cancel"]').trigger('click')
        await wrapper.get('[data-testid="talos-tool-recovery-later"]').trigger('click')

        expect(wrapper.emitted('retry')).toHaveLength(1)
        expect(wrapper.emitted('cancel')).toHaveLength(1)
        expect(wrapper.emitted('later')).toHaveLength(1)
        wrapper.unmount()
    })

    /**
     * ⛔⭐ Una richiesta CADUTA non è una ripresa a metà.
     *
     * Sulla ripresa il pericolo è rifare un'azione già fatta — da lì l'avviso
     * sul duplicato e il pulsante «Riprova». Su una caduta non c'è niente da
     * riprendere e niente che possa essere già successo: nessuno strumento è
     * mai partito. «Riprova» sarebbe un pulsante che non può funzionare, e
     * l'avviso sul duplicato una paura inventata.
     */
    it('⛔ una richiesta CADUTA dice il motivo e non offre di riprovare', () => {
        const wrapper = mount(TalosMobileToolAuthorizationRecoveryCard, {
            props: {
                sessionTitle: 'Quarterly planning',
                tools: [],
                recoveryCount: 1,
                busy: false,
                error: 'TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID',
            },
            global: { stubs: { Teleport: true } },
        })

        expect(wrapper.find('[data-testid="talos-tool-recovery-retry"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-tool-recovery-warning"]').exists()).toBe(false)
        expect(wrapper.get('[data-testid="talos-tool-recovery-reason"]').text())
            .toContain('TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID')
        expect(wrapper.text()).toContain('A permission request was dropped')
        // ⭐ Dice anche che il telefono NON è stato toccato: è la domanda vera
        // di chi legge «una richiesta è caduta».
        expect(wrapper.text()).toContain('nothing to undo')
        expect(wrapper.find('[data-testid="talos-tool-recovery-unknown-tools"]').exists()).toBe(true)

        // Resta un modo per chiuderla, ed è l'unico pulsante d'azione.
        void wrapper.get('[data-testid="talos-tool-recovery-cancel"]').trigger('click')
        wrapper.unmount()
    })

    it('prevents duplicate recovery actions while one is running', () => {
        const wrapper = mountCard(true)

        expect(wrapper.get('[data-testid="talos-tool-recovery-retry"]').attributes('disabled'))
            .toBeDefined()
        expect(wrapper.get('[data-testid="talos-tool-recovery-cancel"]').attributes('disabled'))
            .toBeDefined()
        wrapper.unmount()
    })
})
