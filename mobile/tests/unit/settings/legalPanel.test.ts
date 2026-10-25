// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import TalosMobileSettingsLegalPanel from '@/components/talos/settings/TalosMobileSettingsLegalPanel.vue'
import { TALOS_MOBILE_SETTINGS_TABS } from '@/components/talos/settings/settingsTabs'
import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'
import { TALOS_NATIVE_COMPONENTS } from '@/lib/legal/nativeComponents'

const chiave = (catalogo: unknown, percorso = ''): string => String(percorso.split('.')
    .reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), catalogo))

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
        // il trasporto del controllo remoto, compilato da noi (`jniLibs/PROVENIENZA-IROH.md`, 20/10/2026)
        expect(nativi).toContain('iroh')
        // Una licenza non chiarita si dice tale, non si arrotonda a «permissiva»: chiave del catalogo, in inglese E in italiano
        // (N1-bis, 25/10/2026), e a schermo la frase della lingua attiva.
        const voce = TALOS_NATIVE_COMPONENTS.find((v) => v.name.startsWith('openWakeWord'))
        const en = chiave(TALOS_EN_MESSAGES, voce?.licenseKey)
        const it = chiave(TALOS_IT_MESSAGES, voce?.licenseKey)
        expect(en).toMatch(/to be confirmed/u)
        expect(it).toMatch(/da confermare/u)
        expect([en, it].some((frase) => nativi.includes(frase))).toBe(true)
    })

    it('LEG-04 le librerie Android e dell\'interfaccia, dagli elenchi generati', async () => {
        const vista = await monta()
        await vi_waitFor(() => vista.find('[data-testid="talos-legal-npm"]').exists())
        expect(vista.find('[data-testid="talos-legal-android"]').text()).toMatch(/androidx/)
        expect(vista.find('[data-testid="talos-legal-npm"]').text()).toMatch(/vue@/)
    })

    it('LEG-05 lo scanner del QR (ML Kit di Google): le Note legali dicono delle metriche d’uso che Google riceve', async () => {
        const vista = await monta()
        await vi_waitFor(() => vista.find('[data-testid="talos-legal-android"]').exists())
        expect(vista.get('[data-testid="talos-legal-mlkit"]').text()).toMatch(/ML Kit/)
    })

    it('LEG-06 (N1) i nativi e le librerie Android mostrano il testo completo nello stesso blocco richiudibile delle voci npm', async () => {
        const vista = await monta()
        await vi_waitFor(() => vista.find('[data-testid="talos-legal-android"]').exists())
        await vista.get('[data-testid="talos-legal-native-toggle-iroh (iroh-ffi)"]').trigger('click')
        const iroh = vista.get('[data-testid="talos-legal-native-text-iroh (iroh-ffi)"]').text()
        expect(iroh).toContain('Copyright 2025 N0, INC.')
        expect(iroh).toContain('rustls 0.23.46')
        await vista.get('[data-testid="talos-legal-android-toggle-androidx.activity:activity"]').trigger('click')
        expect(vista.get('[data-testid="talos-legal-android-text-androidx.activity:activity"]').text()).toMatch(/Apache License\s+Version 2\.0/)
        // un blocco aperto alla volta, come per npm
        expect(vista.find('[data-testid="talos-legal-native-text-iroh (iroh-ffi)"]').exists()).toBe(false)
        // condizioni di Google: niente testo da ridistribuire, l'indirizzo dove si leggono
        await vista.get('[data-testid="talos-legal-android-toggle-com.google.mlkit:common"]').trigger('click')
        expect(vista.get('[data-testid="talos-legal-android-text-com.google.mlkit:common"]').text()).toContain('developers.google.com/ml-kit/terms')
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
