import { describe, expect, it } from 'vitest'
import {
    TALOS_TYPEWRITER_DEFAULTS,
    talosNextRevealCount,
    talosSafeRevealSlice,
} from '@/lib/typewriterPacing'

/**
 * Owner 2026-07-25: "vorrei che rendessi molto più fluido il rendering del
 * messaggio progressivo, è troppo scattante… ogni lettera stampata in modo
 * fluido con animazione leggera ma super fluida."
 *
 * The jitter came from rendering at the pace chunks ARRIVE. Web research
 * (AI SDK smoothStream, flowtoken, the ChatGPT/Claude buffering pattern) is
 * unanimous: decouple arrival from reveal and pace the reveal yourself. These
 * tests pin the pacing maths — the part that decides whether it feels smooth.
 */
describe('talosNextRevealCount', () => {
    it('reveals nothing more once it has caught up with the buffer', () => {
        expect(talosNextRevealCount(120, 120, 16)).toBe(120)
        expect(talosNextRevealCount(120, 90, 16)).toBe(90)
    })

    it('advances by the elapsed frame time, not by the chunk size', () => {
        // A 16ms frame at the floor speed reveals a small, predictable slice —
        // that constant cadence IS the smoothness. (Measured inside the lag cap,
        // where the pacing owns the reveal.)
        const oneFrame = talosNextRevealCount(0, 200, 16)
        const twoFrames = talosNextRevealCount(0, 200, 32)
        expect(twoFrames - oneFrame).toBeCloseTo(oneFrame, 5)
    })

    it('accelerates when the buffer grows, so it never falls visibly behind', () => {
        const small = talosNextRevealCount(0, 40, 16)
        const large = talosNextRevealCount(0, 4_000, 16)
        expect(large).toBeGreaterThan(small)
    })

    it('never exceeds the ceiling within the lag cap — typing, not a flash', () => {
        const total = 300
        const step = talosNextRevealCount(0, total, 16)
        expect(step).toBeLessThanOrEqual((TALOS_TYPEWRITER_DEFAULTS.maxCharsPerSecond * 16) / 1000 + 1e-6)
    })

    it('SF-MAJOR: never trails the stream by more than the lag cap', () => {
        // A provider that returns 20k characters in ONE shot used to leave
        // thousands unrevealed when the message committed — the rest appeared
        // instantly, which is the snap the pacing exists to remove.
        const total = 20_000
        const after = talosNextRevealCount(0, total, 16)
        expect(total - after).toBeLessThan(TALOS_TYPEWRITER_DEFAULTS.maxLagChars)
        let revealed = 0
        let elapsed = 0
        while (revealed < total && elapsed < 3_000) {
            revealed = talosNextRevealCount(revealed, total, 16)
            elapsed += 16
        }
        expect(revealed).toBe(total)
        // The whole burst is on screen in about a second — typed, never snapped.
        expect(elapsed).toBeLessThan(1_200)
    })

    it('drains a realistic buffer inside the catch-up window', () => {
        let revealed = 0
        const total = 600
        let elapsed = 0
        while (revealed < total && elapsed < 5_000) {
            revealed = talosNextRevealCount(revealed, total, 16)
            elapsed += 16
        }
        expect(revealed).toBe(total)
        // A 600-char burst lands in roughly a second: visibly typed, yet faster
        // than the ~50-100 tokens/s a user sees in ChatGPT, so the pacing never
        // becomes the bottleneck — it only removes the jumps.
        expect(elapsed).toBeGreaterThan(250)
        expect(elapsed).toBeLessThan(1_500)
    })

    it('is inert against nonsense input instead of throwing', () => {
        expect(talosNextRevealCount(Number.NaN, 100, 16)).toBeGreaterThanOrEqual(0)
        expect(talosNextRevealCount(-5, 100, 16)).toBeGreaterThanOrEqual(0)
        expect(talosNextRevealCount(10, 100, -16)).toBe(10)
    })
})

describe('talosSafeRevealSlice', () => {
    it('never splits a surrogate pair — half an emoji is a visible defect', () => {
        const text = 'ok 👍 done'
        const cutInsidePair = text.indexOf('👍') + 1
        expect(talosSafeRevealSlice(text, cutInsidePair)).toBe(text.slice(0, text.indexOf('👍')))
    })

    it('slices normally elsewhere and clamps out-of-range counts', () => {
        expect(talosSafeRevealSlice('abcdef', 3)).toBe('abc')
        expect(talosSafeRevealSlice('abcdef', 99)).toBe('abcdef')
        expect(talosSafeRevealSlice('abcdef', -1)).toBe('')
    })
})
