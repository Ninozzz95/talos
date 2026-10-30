// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { TALOS_THEME_PRESETS, talosThemeModeVariantStyle } from '@/lib/talosThemes'
import { conPuntinoDelPiano } from '@/lib/puntinoDelPiano'
import { talosContrastRatio } from '@/lib/talosContrast'

/**
 * ⛔ Revisione del blocco 9, I-R1 (Desktop, 27/10/2026): il puntino «chi paga» del piano ChatGPT (D-0147-UI-2) quasi non si vedeva. Nello
 * scuro il verde era quasi bianco; nel chiaro lo stato «al limite» (l'accento) stava sotto 3:1 in 11 temi su 14. È un contrasto non
 * testuale (WCAG 2.2, 1.4.11, 3:1 contro i colori accanto): qui si misura in OGNI tema e in tutti e due i modi, contro le superfici su cui
 * il puntino sta (la pillola del modello nel compositore, la riga del piano nel selettore).
 */
const SUPERFICI = ['--talos-composer-bg', '--talos-composer-surface', '--talos-panel'] as const

describe('il puntino del piano si vede in ogni tema', () => {
    for (const preset of TALOS_THEME_PRESETS) {
        for (const modo of ['light', 'dark'] as const) {
            it(`PALLINO-01 ${preset.id} ${modo}: attivo e al limite reggono 3:1 su ogni superficie, e non sono lo stesso colore`, () => {
                const stile = conPuntinoDelPiano(talosThemeModeVariantStyle(preset.id, modo), modo)
                const attivo = stile['--talos-plan-dot']
                const limite = stile['--talos-plan-dot-limit']
                expect(attivo, 'manca --talos-plan-dot').toBeTruthy()
                expect(limite, 'manca --talos-plan-dot-limit').toBeTruthy()
                for (const superficie of SUPERFICI) {
                    expect(talosContrastRatio(attivo, stile[superficie]), `attivo su ${superficie}`).toBeGreaterThanOrEqual(3)
                    expect(talosContrastRatio(limite, stile[superficie]), `limite su ${superficie}`).toBeGreaterThanOrEqual(3)
                }
                expect(attivo.toLowerCase()).not.toBe(limite.toLowerCase())
            })
        }
    }
})

describe('il tema scrive i colori del puntino', () => {
    it('PALLINO-02 applyTalosTheme mette --talos-plan-dot e --talos-plan-dot-limit sulla radice, come le altre variabili', async () => {
        const { applyTalosTheme } = await import('@/stores/theme')
        const radice = document.createElement('div')
        applyTalosTheme('calm', 'light', radice)
        expect(radice.style.getPropertyValue('--talos-plan-dot')).not.toBe('')
        expect(radice.style.getPropertyValue('--talos-plan-dot-limit')).not.toBe('')
    })
})
