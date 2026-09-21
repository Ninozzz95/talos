import { describe, expect, it } from 'vitest'
import {
    TALOS_DEFAULT_THEME,
    TALOS_THEME_IDS,
    TALOS_THEME_PRESETS,
    isTalosThemeId,
    talosThemeModeVariantStyle,
} from '@/lib/talosThemes'
import { talosContrastRatio } from '@/lib/talosContrast'

// F1-T2 — the `calm` preset (owner ribrand-soft): warm quiet default, gold as
// sparing signature, no navy. Legacy presets stay intact and selectable.
describe('calm preset (F1-T2)', () => {
    it('registers calm as a valid theme id and keeps all 13 legacy ids', () => {
        expect(isTalosThemeId('calm')).toBe(true)
        for (const legacy of ['forge', 'paper', 'terminal', 'aurora', 'glacier', 'ember', 'atlas', 'noir', 'signal', 'violet', 'claudius', 'basicus', 'telemetry']) {
            expect(TALOS_THEME_IDS).toContain(legacy)
        }
    })

    it('is the default theme (ribrand soft flips the default, legacy stays selectable)', () => {
        expect(TALOS_DEFAULT_THEME).toBe('calm')
    })

    it('has a calm seed: NEUTRAL GREY background (R1 owner directive), no procedural effect, soft radius', () => {
        const calm = TALOS_THEME_PRESETS.find((preset) => preset.id === 'calm')!
        expect(calm).toBeTruthy()
        expect(calm.defaultEffect).toBe('none')
        expect(calm.defaultRadius).toBe('soft')
        expect(calm.defaultMotion).toBe('subtle')
        // R1 (owner 2026-07-24): "BG di tema calm piu grigio" — near-neutral
        // channels (no warm brown, no telemetry navy: tight channel spread).
        const bg = calm.preview.background
        const [r, g, b] = [bg.slice(1, 3), bg.slice(3, 5), bg.slice(5, 7)].map((h) => parseInt(h, 16))
        expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(8)
    })

    it('derives full variant sets for both modes with AA text contrast', () => {
        for (const mode of ['light', 'dark'] as const) {
            const vars = talosThemeModeVariantStyle('calm', mode)
            expect(Object.keys(vars).length).toBeGreaterThan(40)
            expect(vars['--talos-background']).toBeTruthy()
            expect(vars['--talos-accent']).toBeTruthy()
            const contrast = talosContrastRatio(vars['--talos-text'], vars['--talos-background'])
            expect(contrast).toBeGreaterThanOrEqual(4.5)
        }
    })

    it('keeps legacy telemetry derivation byte-stable (no regression on the 13)', () => {
        const vars = talosThemeModeVariantStyle('telemetry', 'dark')
        expect(vars['--talos-background']).toBe('#0b0f11')
    })
})
