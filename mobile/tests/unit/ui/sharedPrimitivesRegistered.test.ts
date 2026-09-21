/**
 * The gate for a bug that shipped past every other gate.
 *
 * On 2026-08-02 the motion switches were converted to the shared
 * TalosThemedSwitch and the import was not added to the panel. `vue-tsc` said
 * nothing, `npm run build` said nothing and produced a bundle — because Vue
 * resolves components by name at RUNTIME, so an unimported component is not a
 * compile error, it is a warning printed while rendering and a hole in the page
 * where a control should be. It was caught only because a screen test happened
 * to look for that control.
 *
 * So the check is here, applied to every file at once: if a template mentions
 * one of the shared primitives, the same file must import it. A grep is enough,
 * and a grep is the right size — the failure it prevents is a missing control on
 * a settings screen nobody opened during review.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'src')
const PRIMITIVES = ['TalosThemedSelect', 'TalosThemedSwitch']

function everyVueFile(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) return everyVueFile(full)
        return full.endsWith('.vue') ? [full] : []
    })
}

describe('shared UI primitives', () => {
    it('are imported by every file that uses them', () => {
        const missing: string[] = []

        for (const file of everyVueFile(SRC)) {
            const source = readFileSync(file, 'utf8')
            // The primitive's own file defines it rather than using it.
            if (PRIMITIVES.some((name) => file.endsWith(`${name}.vue`))) continue

            for (const name of PRIMITIVES) {
                const used = new RegExp(`<${name}[\\s/>]`).test(source)
                // Both spellings count: the plain default import, and the
                // combined `import X, { type XItem } from …` that several
                // callers use. Missing the second form made this check fail on
                // two files that were correct.
                const imported = new RegExp(`import\\s+${name}\\s*(,[^\\n]*)?\\s*from`).test(source)
                if (used && !imported) missing.push(`${file.slice(SRC.length + 1)} uses <${name}> without importing it`)
            }
        }

        expect(missing).toEqual([])
    })
})
