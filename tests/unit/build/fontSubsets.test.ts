import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Fonts are imported per SUBSET, never as a whole family.
 *
 * `@font-face` blocks are render-blocking CSS whether or not the font file is
 * ever fetched. Importing whole families shipped Cyrillic, Greek and Vietnamese
 * for six typefaces — 38 KB of the initial stylesheet, a quarter of the entire
 * budget, for scripts this app does not speak. Narrowing to latin and latin-ext
 * took the initial CSS from 157,578 bytes to 126,283 and turned a red gate
 * green.
 *
 * The one-line import that undoes it reads perfectly natural, which is why this
 * exists: `@fontsource/manrope/500.css` looks like exactly what you want and
 * quietly costs 7 KB of first paint.
 */
const MAIN = 'src/main.ts'

/** The families that publish subsets beyond latin. The others cannot regress. */
const MULTI_SUBSET_FAMILIES = ['jetbrains-mono', 'manrope', 'source-serif-4'] as const

function mainSource(): string {
    return readFileSync(resolve(process.cwd(), MAIN), 'utf8')
}

describe('font imports', () => {
    it.each(MULTI_SUBSET_FAMILIES)('imports %s per subset, never the whole family', (family) => {
        const imports = [...mainSource().matchAll(
            new RegExp(`@fontsource/${family}/([\\w-]+)\\.css`, 'g'),
        )].map(([, file]) => file!)

        expect(imports.length, `${family} is not imported at all`).toBeGreaterThan(0)
        for (const file of imports) {
            expect(file, `${family}/${file}.css pulls every subset`).toMatch(/^latin(-ext)?-\d+$/)
        }
    })

    /**
     * English and Italian both live in latin; latin-ext covers names from the
     * rest of Europe. Anything beyond that is a script the interface has no
     * words in, and the phone's own fonts cover it.
     */
    it('asks for no script the app does not speak', () => {
        const source = mainSource()

        for (const subset of ['cyrillic', 'greek', 'vietnamese', 'hebrew', 'arabic']) {
            expect(source, `${subset} is not a language this app ships`).not.toContain(`/${subset}`)
        }
    })

    /**
     * Every weight still arrives in both subsets. Dropping latin-ext by
     * accident is the quiet version of this bug: it looks fine in English and
     * loses the theme font on a Polish or Turkish name.
     */
    it.each(MULTI_SUBSET_FAMILIES)('keeps latin-ext beside latin for every %s weight', (family) => {
        const imports = [...mainSource().matchAll(
            new RegExp(`@fontsource/${family}/latin(-ext)?-(\\d+)\\.css`, 'g'),
        )]
        const weights = new Set(imports.map(([, , weight]) => weight!))

        expect(weights.size).toBeGreaterThan(0)
        for (const weight of weights) {
            const forWeight = imports.filter(([, , candidate]) => candidate === weight)
            expect(forWeight.map(([, ext]) => ext ?? '').sort(), `${family} ${weight}`)
                .toEqual(['', '-ext'])
        }
    })
})
