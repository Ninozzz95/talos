import { describe, expect, it } from 'vitest'
import { TALOS_THEME_PRESETS, talosThemeModeVariantStyle, talosThemeNormalTextContrast } from '@/lib/talosThemes'
import { talosCanonicalOpaqueColor, talosContrastRatio } from '@/lib/talosContrast'

/*
 * ⛔ Dal Pad, 26/10/2026 (tema «calm» scuro, lista del Codice): «Le sessioni non si sono caricate: …» era BIANCO. `--talos-danger`
 * era il colore leggibile SOPRA `--talos-danger-soft` (`talosReadableForeground` fra #7f1d1d e #fee2e2): nel tema scuro il rosa
 * quasi bianco #fee2e2, e ~143 righe d'errore lo usano da sole sul fondo della pagina. Cura scelta col Desktop: nel tema scuro un
 * ROSSO che regga 4,5:1 sia sul fondo sia sul rosa tenue dei chip; il rosa pallido solo se nessun rosso ci riesce.
 * `--talos-chat-error-text` resta il testo sul riempimento d'errore della chat.
 */
/** Tinta (gradi) e croma (max − min dei canali, 0..1): la croma dice quanto colore c'è; #fee2e2 è «rosso» al 100% di saturazione
 * HSL ma ha croma 0,11 e si legge bianco. */
function tinta(colore: string, style: Record<string, string>): { h: number; croma: number } {
    const hex = talosCanonicalOpaqueColor(colore, style)!
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const d = max - min
    if (d === 0) return { h: 0, croma: 0 }
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    return { h: (h * 60 + 360) % 360, croma: d }
}

describe('il testo di pericolo nel tema scuro', () => {
    for (const preset of TALOS_THEME_PRESETS) {
        it(`PER-SCURO ${preset.id}: rosso, ≥ 4,5:1 sul fondo, sul pannello e sul rosa tenue dei chip`, () => {
            const style = talosThemeModeVariantStyle(preset.id, 'dark')
            const danger = style['--talos-danger']!
            for (const fondo of ['--talos-background', '--talos-panel', '--talos-danger-soft']) {
                expect(talosContrastRatio(danger, style[fondo]!, style), `${preset.id} ${fondo}`).toBeGreaterThanOrEqual(4.5)
            }
            const { h, croma } = tinta(danger, style)
            expect(h <= 20 || h >= 340, `${preset.id} tinta ${h}`).toBe(true)
            expect(croma, `${preset.id} croma di ${danger}`).toBeGreaterThanOrEqual(0.3)
            // le coppie del tema (`talosContrast.ts` è portato e fissato: fondo e pannello li misura questo test)
            expect(talosThemeNormalTextContrast(preset.id, 'dark').errors).toEqual([])
        })
    }

    it('PER-SCURO-02 il testo sul riempimento d\'errore della chat non cambia', () => {
        expect(talosThemeModeVariantStyle('calm', 'dark')['--talos-chat-error-text']).toBe('#fee2e2')
    })

    it('PER-CHIARO il tema chiaro resta com\'era', () => {
        for (const preset of TALOS_THEME_PRESETS) {
            const style = talosThemeModeVariantStyle(preset.id, 'light')
            expect(style['--talos-danger']).toBe('#7f1d1d')
            expect(talosThemeNormalTextContrast(preset.id, 'light').errors).toEqual([])
        }
    })
})
