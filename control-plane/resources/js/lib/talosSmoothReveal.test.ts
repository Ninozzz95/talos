import { describe, expect, it } from 'vitest'
import { createTalosSmoothReveal } from './talosSmoothReveal'

describe('createTalosSmoothReveal', () => {
    it('decouples visible text from lumpy network arrivals without exceeding the canonical text', () => {
        const reveal = createTalosSmoothReveal()
        const complete = 'The annual revenue is above two million.'
        reveal.arrive(complete, 0)

        expect(reveal.visible()).toBe('')
        const first = reveal.tick(40)
        expect(first.length).toBeGreaterThan(0)
        expect(complete.startsWith(first)).toBe(true)
    })

    it('uses whole-word boundaries after the opening fragment', () => {
        const reveal = createTalosSmoothReveal({ initialCharsPerSec: 40 })
        reveal.arrive('One complete sentence arrives in a single network chunk', 0)

        for (const at of [100, 200, 300, 400, 500]) {
            const visible = reveal.tick(at)
            if (visible.includes(' ')) expect(visible).toMatch(/\s$/)
        }
    })

    it('keeps accumulating reveal budget while waiting at a whole-word boundary', () => {
        const reveal = createTalosSmoothReveal({ initialCharsPerSec: 150 })
        reveal.arrive('Partial response ', 0)

        expect(reveal.tick(40)).toBe('Partia')
        expect(reveal.tick(80)).toBe('Partial ')
        expect(reveal.tick(120)).toBe('Partial response ')
    })

    it('adapts to a faster model and closes accumulated lag', () => {
        const reveal = createTalosSmoothReveal({ initialCharsPerSec: 60 })
        const complete = 'word '.repeat(400)

        reveal.arrive(complete.slice(0, 500), 0)
        reveal.tick(100)
        reveal.arrive(complete.slice(0, 1_500), 200)
        reveal.tick(200)
        reveal.arrive(complete, 400)

        let visible = ''
        for (let at = 500; at <= 4_000; at += 40) visible = reveal.tick(at)
        expect(visible.length).toBeGreaterThan(complete.length * 0.9)
    })

    it('caps reveal speed when hard flush is disabled', () => {
        const reveal = createTalosSmoothReveal({
            maxCharsPerSec: 1_200,
            backlogHardFlush: Number.POSITIVE_INFINITY,
        })
        reveal.arrive('x'.repeat(100_000), 0)

        expect(reveal.tick(1_000).length).toBeLessThanOrEqual(1_300)
    })

    it('flushes the terminal remainder and a user-stopped remainder', () => {
        const completed = createTalosSmoothReveal({ initialCharsPerSec: 10 })
        completed.arrive('The final word must remain visible', 0)
        completed.tick(40)
        expect(completed.finish()).toBe('The final word must remain visible')

        const stopped = createTalosSmoothReveal({ initialCharsPerSec: 10 })
        stopped.arrive('Partial but canonical provider output', 0)
        expect(stopped.abort()).toBe('Partial but canonical provider output')
    })

    it('flushes an excessive backlog rather than making the user wait', () => {
        const reveal = createTalosSmoothReveal({ backlogHardFlush: 1_500 })
        reveal.arrive('y'.repeat(4_000), 0)

        expect(reveal.tick(40)).toHaveLength(4_000)
    })

    it('never splits surrogate pairs or joined emoji sequences', () => {
        const reveal = createTalosSmoothReveal({ initialCharsPerSec: 4 })
        const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}'
        reveal.arrive(`hello ${family} done`, 0)

        for (let at = 40; at <= 4_000; at += 40) {
            expect(reveal.tick(at)).not.toMatch(/[\uD800-\uDBFF]$/)
        }
    })

    it('reveals immediately for reduced motion and resets cleanly', () => {
        const reveal = createTalosSmoothReveal({ paced: false })
        reveal.arrive('Visible without imposed motion', 0)
        expect(reveal.tick(0)).toBe('Visible without imposed motion')

        reveal.reset()
        expect(reveal.visible()).toBe('')
    })
})
