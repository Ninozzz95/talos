import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8')

function balancedBlock(source: string, marker: string, from = 0): string {
    const markerAt = source.indexOf(marker, from)
    if (markerAt < 0) throw new Error(`Missing CSS marker: ${marker}`)
    const openAt = source.indexOf('{', markerAt + marker.length)
    if (openAt < 0) throw new Error(`Missing CSS block for: ${marker}`)
    let depth = 0
    for (let index = openAt; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1
        if (source[index] === '}') {
            depth -= 1
            if (depth === 0) return source.slice(openAt + 1, index)
        }
    }
    throw new Error(`Unclosed CSS block for: ${marker}`)
}

function allBalancedBlocks(source: string, marker: string): string[] {
    const blocks: string[] = []
    let cursor = 0
    for (;;) {
        const markerAt = source.indexOf(marker, cursor)
        if (markerAt < 0) return blocks
        const block = balancedBlock(source, marker, markerAt)
        blocks.push(block)
        const openAt = source.indexOf('{', markerAt + marker.length)
        cursor = openAt + block.length + 2
    }
}

describe('streaming motion CSS contracts', () => {
    it('P10c RED: typewriter ink is compositor-safe and never animates blur', () => {
        const ink = balancedBlock(css, '@keyframes talosStreamInk')
        expect(ink).toContain('opacity: 0')
        expect(ink).toContain('opacity: 1')
        expect(ink).not.toMatch(/\bfilter\s*:/)
        expect(ink).not.toMatch(/\bblur\s*\(/)
        expect(ink).not.toMatch(/\b(?:top|left|width|height|margin|padding)\s*:/)
    })

    it('P10c RED: reduced motion disables every streaming glyph and activity animation', () => {
        const reduced = allBalancedBlocks(css, '@media (prefers-reduced-motion: reduce)').join('\n')

        expect(reduced).not.toMatch(/\.talos-stream-char--fade\s*\{[^}]*animation\s*:\s*talosStreamFade/s)
        expect(reduced).not.toMatch(/\.talos-trace-live\s*\{[^}]*animation\s*:\s*talosPulse/s)
        expect(reduced).toMatch(/\.talos-stream-char\s*,\s*\.talos-stream-char--fade\s*\{[^}]*animation\s*:\s*none/s)
        expect(reduced).toMatch(/\.talos-trace-live\s*,\s*\.talos-typing-pulse\s*\{[^}]*animation\s*:\s*none/s)
        expect(reduced).toMatch(/\.talos-stream-caret\s*\{[^}]*animation\s*:\s*none/s)
    })

    it('P10c RED: defines the fade keyframes exactly once', () => {
        expect(css.match(/@keyframes\s+talosStreamFade\b/g)).toHaveLength(1)
        const fade = balancedBlock(css, '@keyframes talosStreamFade')
        expect(fade).not.toMatch(/\bfilter\s*:/)
        expect(fade).not.toMatch(/\btransform\s*:/)
    })

    it('P10c RED: the fade modifier wins over the base ink animation in the cascade', () => {
        const baseAt = css.indexOf('.talos-stream-char {')
        const fadeAt = css.indexOf('.talos-stream-char--fade {')
        expect(baseAt).toBeGreaterThanOrEqual(0)
        expect(fadeAt).toBeGreaterThan(baseAt)
    })
})
