// @vitest-environment jsdom

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    applyTalosFontScale,
    parseTalosFontScale,
    talosFontScaleFactor,
    TALOS_DEFAULT_FONT_SCALE,
} from '@/lib/talosFontScale'
import { TALOS_FONT_SCALE_OPTIONS } from '@/lib/talosFontScaleOptions'

// Owner 2026-07-25: "il font size DEVE impattare anche il font dei menù e di
// tutto il sistema non solo chat." The scale reaches the whole UI only because
// every text token resolves through `--talos-ui-scale`; these tests defend both
// halves — the variable, and the absence of sizes that bypass it.
describe('talosFontScale', () => {
    it('parses fail-safe: garbage reads as the default, never as an unusable factor', () => {
        expect(parseTalosFontScale('large')).toBe('large')
        expect(parseTalosFontScale('enormous')).toBe(TALOS_DEFAULT_FONT_SCALE)
        expect(parseTalosFontScale(null)).toBe(TALOS_DEFAULT_FONT_SCALE)
        expect(parseTalosFontScale(0)).toBe(TALOS_DEFAULT_FONT_SCALE)
        expect(talosFontScaleFactor(parseTalosFontScale(undefined)))
            .toBe(talosFontScaleFactor(TALOS_DEFAULT_FONT_SCALE))
    })

    it('every offered option maps to a distinct, monotonically growing factor', () => {
        const factors = TALOS_FONT_SCALE_OPTIONS.map((option) => talosFontScaleFactor(option.value))
        expect(new Set(factors).size).toBe(factors.length)
        expect(talosFontScaleFactor('xsmall')).toBeLessThan(talosFontScaleFactor('small'))
        expect([...factors].sort((a, b) => a - b)).toEqual(factors)
        expect(factors.every((factor) => factor > 0)).toBe(true)
    })

    it('writes the multiplier every --text-* token reads', () => {
        const root = document.createElement('div')
        applyTalosFontScale('xlarge', root)
        expect(root.style.getPropertyValue('--talos-ui-scale')).toBe('1.3')
        applyTalosFontScale('default', root)
        expect(root.style.getPropertyValue('--talos-ui-scale')).toBe('1')
    })

    it('is inert instead of throwing when there is no target element', () => {
        expect(() => applyTalosFontScale('large', null)).not.toThrow()
    })

    it('style.css scales every text token through the runtime variable', () => {
        const css = readFileSync(join(process.cwd(), 'src/style.css'), 'utf-8')
        for (const token of ['3xs', '2xs', 'xs', 'xsm', 'sm', 'md', 'base', 'lg', 'xl', '2xl', '3xl', '4xl']) {
            expect(css).toMatch(new RegExp(`--text-${token}: calc\\([0-9.]+rem \\* var\\(--talos-ui-scale`))
        }
    })

    it('nothing sets an absolute text size outside the scale — that is how it shipped broken', () => {
        // SF: the first version of this guard looked for `px` only, so eight
        // live surfaces using `text-[0.6875rem]` sailed through it. Absolute is
        // absolute: px, rem and pt all bypass --talos-ui-scale. `em` is
        // relative and therefore allowed.
        const ABSOLUTE_UTILITY = /text-\[[0-9.]+(px|rem|pt)\]/
        const ABSOLUTE_DECLARATION = /font-size:\s*[0-9.]+(px|rem|pt)/
        // Tailwind ships 5xl..9xl too; every step must be redefined or the top
        // of the ramp freezes (the tablet empty-state wordmark did).
        const UNSCALED_TOKEN = new RegExp(String.raw`\btext-(5xl|6xl|7xl|8xl|9xl)\b`)
        const css = readFileSync(join(process.cwd(), 'src/style.css'), 'utf-8')
        const offenders: string[] = []
        const walk = (dir: string): void => {
            for (const entry of readdirSync(dir)) {
                const path = join(dir, entry)
                if (statSync(path).isDirectory()) { walk(path); continue }
                if (!/\.(vue|ts|css)$/.test(entry)) continue
                const source = readFileSync(path, 'utf-8')
                // Vendored upstream (hash-pinned) may keep its arbitrary sizes:
                // style.css redefines those emitted classes instead — asserted
                // separately below. The boot logo paints before any preference
                // is readable, so it is fixed on purpose.
                const exempt = path.endsWith('TalosBootLogo.vue')
                    || path.endsWith('style.css')
                    || path.includes(`${sep}components${sep}ui${sep}`)
                if (exempt) continue
                if (ABSOLUTE_UTILITY.test(source) || ABSOLUTE_DECLARATION.test(source)) offenders.push(path)
                const unscaled = source.match(UNSCALED_TOKEN)
                if (unscaled && !new RegExp(`--text-${unscaled[1]}: calc`).test(css)) offenders.push(path)
            }
        }
        walk(join(process.cwd(), 'src'))
        expect(offenders).toEqual([])
    })

    it('the vendored shadcn button size is scaled by class override, not by editing upstream', () => {
        const button = readFileSync(join(process.cwd(), 'src/components/ui/button/index.ts'), 'utf-8')
        const css = readFileSync(join(process.cwd(), 'src/style.css'), 'utf-8')
        for (const size of button.match(/text-\[[0-9.]+rem\]/g) ?? []) {
            const value = size.slice(6, -1)
            expect(css, `${size} must be redefined against --talos-ui-scale`)
                .toContain(`font-size: calc(${value} * var(--talos-ui-scale, 1))`)
        }
    })

    it('boot applies the remembered scale synchronously, before the first frame', async () => {
        const { applyTalosFontScale: apply, readRememberedTalosFontScale } =
            await import('@/lib/talosFontScale')
        apply('large')
        // The persisted setting arrives over an async bridge; the mirror is what
        // makes the first paint correct instead of a flash at the default.
        expect(readRememberedTalosFontScale()).toBe('large')
    })
})
