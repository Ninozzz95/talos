import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { TALOS_THEME_PRESETS } from '@/lib/talosThemes'

/**
 * F-10. The defect this test exists for was already shipped and invisible:
 * fifteen theme presets declared their own typeface, the code turned those
 * declarations into CSS variables, and three of the five families named —
 * Manrope, Sora, Source Serif 4 — were never loaded at all.
 *
 * So picking a theme that should have had an elegant serif quietly gave you the
 * system font. No error, no warning, nothing to notice. The feature had the
 * appearance of working, which is the worst state for a feature to be in.
 *
 * A declaration and a shipment are two different files, and nothing connected
 * them. This is that connection: the day someone gives a preset a beautiful
 * font without adding it to the bundle, this fails instead of the theme quietly
 * looking like every other theme.
 */
const MAIN = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf8')

/** "Source Serif 4" is shipped as `source-serif-4`; the mapping is mechanical. */
function fontsourcePackage(family: string): string {
    return family.toLowerCase().replace(/\s+/g, '-')
}

describe('every font a theme promises is a font the app ships', () => {
    const declared = [...new Set(
        TALOS_THEME_PRESETS.flatMap((preset) => [preset.fontUi, preset.fontMono]),
    )].filter(Boolean)

    it('declares at least a few, or this test is guarding nothing', () => {
        expect(declared.length).toBeGreaterThanOrEqual(3)
    })

    it.each(declared)('ships %s', (family) => {
        expect(MAIN).toContain(`@fontsource/${fontsourcePackage(family)}/`)
    })

    /**
     * The reverse direction is not an error — the brand mark uses Orbitron
     * without any preset naming it — so this only records what is loaded, to
     * make an unused weight visible in review rather than to fail the build.
     */
    it('loads only families that are actually referenced somewhere', () => {
        const loaded = [...MAIN.matchAll(/@fontsource\/([a-z0-9-]+)\//g)].map((m) => m[1])
        const style = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8')
        for (const pkg of new Set(loaded)) {
            const named = declared.some((family) => fontsourcePackage(family) === pkg)
            const inStyle = style.toLowerCase().includes(pkg.replace(/-/g, ' '))
            expect(named || inStyle, `${pkg} is loaded but nothing uses it`).toBe(true)
        }
    })
})
