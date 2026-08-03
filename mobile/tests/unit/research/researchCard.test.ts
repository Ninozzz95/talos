import { describe, expect, it } from 'vitest'
import {
    talosResearchBucketOf,
    talosResearchCardOf,
    talosResearchFilterCards,
    talosResearchNeedsAttention,
    talosResearchSolidity,
    type TalosResearchCard,
} from '@/lib/research/researchCard'
import type { TalosResearchRun, TalosResearchStatus } from '@/lib/research/researchRun'

function run(patch: Partial<TalosResearchRun> = {}): TalosResearchRun {
    return {
        id: 'run-1',
        sessionId: 'session-1',
        question: 'Quando è uscito il primo iPhone',
        depth: 'quick',
        engine: 'device',
        status: 'done' as TalosResearchStatus,
        plan: [{ id: 'b1', question: 'b1' }] as TalosResearchRun['plan'],
        steps: [
            { id: 'b1:search', branchId: 'b1', kind: 'search', state: 'done' },
            { id: 'synthesis', branchId: 'b1', kind: 'synthesise', state: 'done' },
        ] as unknown as TalosResearchRun['steps'],
        startedAt: '2026-08-03T08:00:00.000Z',
        updatedAt: '2026-08-03T08:05:00.000Z',
        ...patch,
    }
}

describe('what a research looks like before you open it', () => {
    /**
     * The station used to show `3/3 · done`. That is the machine's view. The
     * competitor research (2026-08-03) found all five products lead with volume
     * — "56 siti" — and none says whether the claims stood.
     */
    it('carries the balance when there is one, and does not wait for it', () => {
        const withoutReport = talosResearchCardOf(run(), { isRunning: false })
        expect(withoutReport.standing).toBeNull()
        expect(withoutReport.question).toBe('Quando è uscito il primo iPhone')

        const withReport = talosResearchCardOf(run(), {
            isRunning: false,
            standing: { total: 4, supported: 3, partial: 1, unsupported: 0, unchecked: 0 },
        })
        expect(withReport.standing?.supported).toBe(3)
    })

    it('asks the LIVE registry whether a run is running, never the journal', () => {
        // A run the journal calls unfinished may be in flight right now, and
        // calling it interrupted while it works is the exact lie this refactor
        // set out to remove.
        const working = run({ status: 'collecting' })
        expect(talosResearchBucketOf(working, true)).toBe('running')
        expect(talosResearchBucketOf(working, false)).toBe('unfinished')
    })

    it('puts every stopped-but-owing state in one bucket, and failure in its own', () => {
        for (const status of ['planning', 'collecting', 'synthesising', 'verifying', 'cancelled'] as const) {
            expect(talosResearchBucketOf(run({ status }), false)).toBe('unfinished')
        }
        expect(talosResearchBucketOf(run({ status: 'failed' }), false)).toBe('failed')
        expect(talosResearchBucketOf(run({ status: 'done' }), false)).toBe('done')
    })

    it('counts a partial claim as half, because that is what it is', () => {
        // Rounding partial up to supported is how a report ends up looking
        // stronger than it is — the failure the verification exists to prevent.
        expect(talosResearchSolidity({ total: 4, supported: 3, partial: 1, unsupported: 0, unchecked: 0 }))
            .toBeCloseTo(0.875)
        // "We could not check" is not a pass either.
        expect(talosResearchSolidity({ total: 2, supported: 1, partial: 0, unsupported: 0, unchecked: 1 }))
            .toBe(0.5)
        // A report that produced no claims has no solidity — and on the device
        // that rendered as a bare "%" with no number in front of it, which is
        // why the card asks for total > 0 before showing a percentage at all.
        expect(talosResearchSolidity({ total: 0, supported: 0, partial: 0, unsupported: 0, unchecked: 0 }))
            .toBeNull()
        expect(talosResearchSolidity(null)).toBeNull()
    })

    it('flags a report worth a second look, and leaves a solid one alone', () => {
        const card = (standing: TalosResearchCard['standing'], failedSteps = 0): TalosResearchCard =>
            ({ ...talosResearchCardOf(run(), { isRunning: false, standing }), failedSteps })

        expect(talosResearchNeedsAttention(card({ total: 4, supported: 4, partial: 0, unsupported: 0, unchecked: 0 })))
            .toBe(false)
        // One unsupported claim is enough: the source does not say it.
        expect(talosResearchNeedsAttention(card({ total: 4, supported: 3, partial: 0, unsupported: 1, unchecked: 0 })))
            .toBe(true)
        // Nothing unsupported, but it barely holds together.
        expect(talosResearchNeedsAttention(card({ total: 3, supported: 1, partial: 0, unsupported: 0, unchecked: 2 })))
            .toBe(true)
        // A branch that failed is worth saying even when the claims are fine.
        expect(talosResearchNeedsAttention(card({ total: 2, supported: 2, partial: 0, unsupported: 0, unchecked: 0 }, 1)))
            .toBe(true)
        // And a report nobody has read yet makes no claim either way.
        expect(talosResearchNeedsAttention(card(null))).toBe(false)
    })

    it('filters by bucket and by words, together', () => {
        const cards = [
            talosResearchCardOf(run({ id: 'a', question: 'iPhone' }), { isRunning: true }),
            talosResearchCardOf(run({ id: 'b', question: 'Monte Bianco' }), { isRunning: false }),
            talosResearchCardOf(run({ id: 'c', question: 'iPhone 2' , status: 'failed' }), { isRunning: false }),
        ]

        expect(talosResearchFilterCards(cards, 'all', '').map((card) => card.id)).toEqual(['a', 'b', 'c'])
        expect(talosResearchFilterCards(cards, 'running', '').map((card) => card.id)).toEqual(['a'])
        expect(talosResearchFilterCards(cards, 'all', 'iphone').map((card) => card.id)).toEqual(['a', 'c'])
        expect(talosResearchFilterCards(cards, 'failed', 'iphone').map((card) => card.id)).toEqual(['c'])
        // Whitespace is not a search.
        expect(talosResearchFilterCards(cards, 'all', '   ')).toHaveLength(3)
    })
})
