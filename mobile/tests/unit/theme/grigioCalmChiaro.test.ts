/**
 * GRIGIO-CALM-01/02 — owner 28/10/2026: «B più leggera + grigio un filo più scuro». Col Calm B il testo secondario in CHIARO scendeva a
 * 4,09:1 nel caso peggiore (misura del Mobile, telefono in orizzontale). Il Desktop ha scurito il grigio secondario del Calm chiaro da
 * #62646a a #5a5c62 (`temi.css`, `--talos-muted`, commit 10e6f7adb); qui lo stesso valore, identico, sul token equivalente. Calm scuro e
 * gli altri temi invariati.
 */
import { describe, expect, it } from 'vitest'
import { talosThemeModeVariantStyle } from '@/lib/talosThemes'

describe('GRIGIO-CALM il grigio secondario del Calm chiaro, come il desktop', () => {
    it('GRIGIO-CALM-01 Calm chiaro: --talos-muted è #5a5c62 (5,97:1 sul fondo #f1f2f4)', () => {
        expect(talosThemeModeVariantStyle('calm', 'light')['--talos-muted']).toBe('#5a5c62')
    })

    it('GRIGIO-CALM-02 Calm scuro e gli altri temi chiari non cambiano', () => {
        expect(talosThemeModeVariantStyle('calm', 'dark')['--talos-muted']).not.toBe('#5a5c62')
        expect(talosThemeModeVariantStyle('paper', 'light')['--talos-muted']).not.toBe('#5a5c62')
    })
})
