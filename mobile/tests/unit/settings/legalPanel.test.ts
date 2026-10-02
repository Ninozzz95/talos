// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import TalosMobileSettingsLegalPanel from '@/components/talos/settings/TalosMobileSettingsLegalPanel.vue'
import { TALOS_MOBILE_SETTINGS_TABS } from '@/components/talos/settings/settingsTabs'

/**
 * ⛔ Note legali complete (owner, 01/10/2026) e PKLA Qualcomm 3.8: l'avviso
 * del software Qualcomm, le sue condizioni leggibili, e la licenza vera di ogni
 * componente spedito — nativi, Android, interfaccia.
 */
describe('Note legali', () => {
    async function monta() {
        const vista = mount(TalosMobileSettingsLegalPanel)
        await flushPromises()
        await new Promise((r) => setTimeout(r, 0))
        await flushPromises()
        return vista
    }

    it('LEG-01 la scheda esiste nelle Impostazioni', () => {
        expect(TALOS_MOBILE_SETTINGS_TABS.some((tab) => tab.id === 'legal')).toBe(true)
    })

    it('LEG-02 l\'avviso Qualcomm c\'è, e le condizioni approvate si leggono', async () => {
        const vista = await monta()
        expect(vista.find('[data-testid="talos-legal-qualcomm"]').text()).toMatch(/Qualcomm Technologies International/)
        await vista.find('[data-testid="talos-legal-qualcomm-terms-toggle"]').trigger('click')
        expect(vista.find('[data-testid="talos-legal-qualcomm-terms"]').text())
            .toMatch(/Leggi sull'esportazione\.|Export laws\./)
    })

    it('LEG-03 i componenti nativi con la licenza vera, anche quando non è permissiva', async () => {
        const vista = await monta()
        const nativi = vista.find('[data-testid="talos-legal-native"]').text()
        expect(nativi).toContain('llama.cpp')
        expect(nativi).toContain('Node.js')
        // Una licenza non chiarita si dice tale, non si arrotonda a «permissiva».
        expect(nativi).toContain('(da confermare)')
    })

    it('LEG-04 le librerie Android e dell\'interfaccia, dagli elenchi generati', async () => {
        const vista = await monta()
        await vi_waitFor(() => vista.find('[data-testid="talos-legal-npm"]').exists())
        expect(vista.find('[data-testid="talos-legal-android"]').text()).toMatch(/androidx/)
        expect(vista.find('[data-testid="talos-legal-npm"]').text()).toMatch(/vue@/)
    })
})

async function vi_waitFor(condizione: () => boolean): Promise<void> {
    for (let i = 0; i < 50; i += 1) {
        if (condizione()) return
        await new Promise((r) => setTimeout(r, 10))
        await flushPromises()
    }
    throw new Error('condizione mai vera')
}
