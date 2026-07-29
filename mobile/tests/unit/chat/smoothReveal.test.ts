import { describe, expect, it } from 'vitest'
import { createTalosSmoothReveal } from '@/lib/chat/smoothReveal'
import { splitGraphemes } from 'unicode-segmenter/grapheme'

function graphemeBoundaries(text: string): Set<number> {
    const boundaries = new Set<number>([0])
    let offset = 0
    for (const grapheme of splitGraphemes(text)) {
        offset += grapheme.length
        boundaries.add(offset)
    }
    return boundaries
}

/**
 * Owner 2026-07-26: "l'animazione di rendering della risposta non è smooth.
 * Claude la fa in maniera fantastica questa cosa."
 *
 * The research (2026-07-27, logged) found what every credible implementation
 * does: DECOUPLE the render cadence from the network cadence. SSE chunks arrive
 * in lumps — half a word, then three sentences, then two seconds of nothing —
 * and no fade can make a lump look smooth. TALOS was rendering at network
 * cadence, so the fade was dissolving lumps.
 *
 * This is the buffer. It holds what has arrived and hands out what should be
 * VISIBLE at a given instant, at a rate that adapts to how fast the text is
 * actually coming — the shape Convex published, which is the only public
 * implementation that adapts rather than running at a fixed delay.
 */
describe('pacing text that arrives in lumps', () => {
    it('shows nothing before the first tick, and never more than has arrived', () => {
        const reveal = createTalosSmoothReveal()
        reveal.arrive('Il fatturato annuale', 0)
        expect(reveal.visible()).toBe('')

        const shown = reveal.tick(1_000)
        expect(shown.length).toBeGreaterThan(0)
        expect('Il fatturato annuale').toContain(shown.trim())
    })

    it('reveals on word boundaries, never mid-word', () => {
        // The animation unit is a word: it is what every reference
        // implementation chose, and it is 5.5x fewer DOM nodes than per-letter.
        const reveal = createTalosSmoothReveal({ initialCharsPerSec: 40 })
        reveal.arrive('Il fatturato annuale supera i due milioni', 0)

        for (const at of [100, 200, 300, 400, 500]) {
            const shown = reveal.tick(at)
            if (shown === '') continue
            // Whatever is on screen ends at a word boundary.
            expect(shown).toMatch(/(^|\s)$|^\S+(\s\S+)*\s$|^[\S\s]*\s$/)
        }
    })

    it('never reveals a partial first spaced-language word', () => {
        const reveal = createTalosSmoothReveal({
            initialCharsPerSec: 1_000,
            minCharsPerSec: 1_000,
            maxCharsPerSec: 1_000,
        })
        reveal.arrive('renderiz', 0)

        expect(reveal.tick(1_000)).toBe('')

        reveal.arrive('renderizza ', 1_100)
        expect(reveal.tick(1_200)).toBe('renderizza ')
    })

    it('holds the partial next word across provider chunks', () => {
        const reveal = createTalosSmoothReveal({
            initialCharsPerSec: 1_000,
            minCharsPerSec: 1_000,
            maxCharsPerSec: 1_000,
        })
        reveal.arrive('fine ', 0)
        expect(reveal.tick(100)).toBe('fine ')

        reveal.arrive('fine par', 200)
        expect(reveal.tick(300)).toBe('fine ')

        reveal.arrive('fine parola ', 400)
        expect(reveal.tick(500)).toBe('fine parola ')
    })

    it('catches up when the model is faster than the reveal', () => {
        // A fixed rate falls behind for the whole answer and the lag never
        // recovers — the documented failure of a non-adaptive smoother.
        const reveal = createTalosSmoothReveal({ initialCharsPerSec: 60 })
        const long = 'parola '.repeat(400)

        reveal.arrive(long.slice(0, 500), 0)
        reveal.tick(100)
        reveal.arrive(long.slice(0, 1_500), 200)
        reveal.tick(200)
        reveal.arrive(long, 400)

        let shown = ''
        for (let at = 500; at <= 4_000; at += 40) shown = reveal.tick(at)
        // Within a few seconds it must have closed the gap, not still be
        // trickling out at the rate it started with.
        expect(shown.length).toBeGreaterThan(long.length * 0.9)
    })

    it('never runs away faster than a reader can follow', () => {
        // Hard flush off, so this measures the RATE and not the dump rule.
        const reveal = createTalosSmoothReveal({
            maxCharsPerSec: 1_200,
            backlogHardFlush: Number.POSITIVE_INFINITY,
        })
        reveal.arrive('x'.repeat(100_000), 0)
        const shown = reveal.tick(1_000)
        expect(shown.length).toBeLessThanOrEqual(1_300)
    })

    it('hands over everything the moment the answer is finished', () => {
        // The published smoother gets this wrong: its word rule needs trailing
        // whitespace, so the LAST word can never be emitted, and it has no
        // flush at all. A truncated answer is worse than an unpaced one.
        const reveal = createTalosSmoothReveal({ initialCharsPerSec: 10 })
        reveal.arrive('Una risposta intera che deve arrivare tutta', 0)
        reveal.tick(50)
        expect(reveal.finish()).toBe('Una risposta intera che deve arrivare tutta')
        expect(reveal.visible()).toBe('Una risposta intera che deve arrivare tutta')
    })

    it('hands over everything when the user hits Stop', () => {
        const reveal = createTalosSmoothReveal({ initialCharsPerSec: 10 })
        reveal.arrive('Interrotta a metà', 0)
        expect(reveal.abort()).toBe('Interrotta a metà')
    })

    it('dumps a backlog rather than making someone watch it type', () => {
        // Scrolled away, came back: 4,000 characters must not type themselves
        // out. The fade is a feature until it becomes a wait.
        const reveal = createTalosSmoothReveal({ backlogHardFlush: 1_500 })
        const backlog = 'parola '.repeat(600)
        reveal.arrive(backlog, 0)
        expect(reveal.tick(40)).toBe(backlog)
    })

    it('keeps every visible prefix on a UAX #29 extended grapheme boundary', () => {
        const cases: Array<{ grapheme: string; targetCodeUnits: number }> = [
            { grapheme: '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}', targetCodeUnits: 2 },
            { grapheme: '\u{1F1EE}\u{1F1F9}', targetCodeUnits: 2 },
            { grapheme: 'e\u0301', targetCodeUnits: 1 },
            { grapheme: '1\uFE0F\u20E3', targetCodeUnits: 2 },
            { grapheme: '\u0915\u094D\u0937', targetCodeUnits: 2 },
        ]

        for (const { grapheme, targetCodeUnits } of cases) {
            const full = `${grapheme} `
            const reveal = createTalosSmoothReveal({
                initialCharsPerSec: targetCodeUnits,
                minCharsPerSec: targetCodeUnits,
                maxCharsPerSec: targetCodeUnits,
                firstStepMs: 1_000,
            })
            reveal.arrive(full, 0)

            const shown = reveal.tick(0)
            expect(
                graphemeBoundaries(full).has(shown.length),
                `unsafe boundary ${shown.length} for ${JSON.stringify(grapheme)}`,
            ).toBe(true)
            expect(reveal.finish()).toBe(full)
        }
    })

    it('keeps the trailing grapheme provisional across provider chunks', () => {
        const reveal = createTalosSmoothReveal({
            initialCharsPerSec: 1_000,
            minCharsPerSec: 1_000,
            maxCharsPerSec: 1_000,
        })

        reveal.arrive('\u4F60', 0)
        expect(reveal.tick(100)).toBe('')

        const extended = '\u4F60\u0301\u597D'
        reveal.arrive(extended, 200)
        const shown = reveal.tick(300)
        expect(graphemeBoundaries(extended).has(shown.length)).toBe(true)
        expect(shown).toBe('\u4F60\u0301')
    })

    it('continues progressively for scripts without whitespace word separators', () => {
        const full = '你好世界欢迎使用塔洛斯'
        const reveal = createTalosSmoothReveal({
            initialCharsPerSec: 25,
            minCharsPerSec: 25,
            maxCharsPerSec: 25,
            firstStepMs: 40,
        })
        reveal.arrive(full, 0)

        const first = reveal.tick(40)
        const second = reveal.tick(80)
        expect(first.length).toBeGreaterThan(0)
        expect(second.length).toBeGreaterThan(first.length)
        expect(second.length).toBeLessThan(full.length)
        expect(graphemeBoundaries(full).has(first.length)).toBe(true)
        expect(graphemeBoundaries(full).has(second.length)).toBe(true)
    })

    it('reveals instantly when motion is unwelcome', () => {
        // Reduced motion means BOTH: no fade AND no pacing. Text marching
        // across the screen is itself the animation.
        const reveal = createTalosSmoothReveal({ paced: false })
        reveal.arrive('Tutto subito, senza ritmo imposto', 0)
        expect(reveal.tick(0)).toBe('Tutto subito, senza ritmo imposto')
    })

    it('starts over cleanly for the next answer', () => {
        const reveal = createTalosSmoothReveal()
        reveal.arrive('prima risposta', 0)
        reveal.tick(500)
        reveal.reset()
        expect(reveal.visible()).toBe('')
        reveal.arrive('seconda', 0)
        expect(reveal.visible()).toBe('')
    })
})
