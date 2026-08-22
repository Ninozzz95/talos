import { describe, expect, it } from 'vitest'
import {
    talosResearchDuration,
    talosResearchElapsedSeconds,
    talosResearchOutline,
} from '@/lib/research/researchOutline'
import type { TalosResearchRun, TalosResearchStatus, TalosResearchStep } from '@/lib/research/researchRun'

/**
 * The document before it exists.
 *
 * The visual research of 2026-08-03 asked what to draw in the first half-second,
 * and found that none of the five products documents that moment at all. The
 * answer here is that we already know the shape: the plan was approved before a
 * penny was spent, and its branches are the report's sections.
 */
function step(over: Partial<TalosResearchStep>): TalosResearchStep {
    return {
        id: 'b1:search',
        branchId: 'b1',
        kind: 'search',
        state: 'done',
        attempts: 1,
        startedAt: '2026-08-03T10:00:00.000Z',
        finishedAt: '2026-08-03T10:01:00.000Z',
        spend: { tokens: 0, searches: 0, pages: 0 },
        resultRef: null,
        error: null,
        ...over,
    }
}

function run(patch: Partial<TalosResearchRun> = {}): TalosResearchRun {
    return {
        id: 'run-1',
        sessionId: 'chat-1',
        question: 'chi ha inventato la moka',
        depth: 'quick',
        engine: 'device',
        status: 'collecting' as TalosResearchStatus,
        title: null,
        plan: [
            { id: 'b1', question: 'chi la brevettò', estimate: { tokens: 1, searches: 1, pages: 1 } },
            { id: 'b2', question: 'in che anno', estimate: { tokens: 1, searches: 1, pages: 1 } },
        ],
        steps: [],
        startedAt: '2026-08-03T10:00:00.000Z',
        updatedAt: '2026-08-03T10:00:00.000Z',
        ...patch,
    }
}

describe('the sections a report will have, before it has any', () => {
    it('is the plan, in the plan’s order, from the very first frame', () => {
        // Nothing has run. There is still a document to draw, and it needs no
        // disk and no network — which is why the first frame cannot be late.
        expect(talosResearchOutline(run())).toEqual([
            { id: 'b1', question: 'chi la brevettò', state: 'pending' },
            { id: 'b2', question: 'in che anno', state: 'pending' },
        ])
    })

    it('keeps a section that has not started, rather than hiding it', () => {
        // Hiding them would make the document appear to grow out of nowhere,
        // and would take away the one thing the reader can judge early: scope.
        const partial = talosResearchOutline(run({
            steps: [step({ id: 'b1:search', branchId: 'b1', state: 'running' })],
        }))
        expect(partial.map((section) => section.state)).toEqual(['running', 'pending'])
    })

    it('shows a failed section as failed, not as missing', () => {
        const broken = talosResearchOutline(run({
            steps: [step({ id: 'b1:search', branchId: 'b1', state: 'failed', error: 'rete assente' })],
        }))
        expect(broken[0]!.state).toBe('failed')
    })
})

describe('how long it has been going', () => {
    it('measures from the run, never from when a screen opened', () => {
        // A research is watched from several places and outlives all of them.
        // A duration owned by a component restarts every time someone looks.
        const live = run({ startedAt: '2026-08-03T10:00:00.000Z' })
        expect(talosResearchElapsedSeconds(live, '2026-08-03T10:04:08.000Z')).toBe(248)
    })

    it('stops when the run stopped, and does not keep counting', () => {
        const over = run({
            status: 'done',
            startedAt: '2026-08-03T10:00:00.000Z',
            updatedAt: '2026-08-03T10:02:00.000Z',
            steps: [step({ finishedAt: '2026-08-03T10:02:00.000Z' })],
        })
        // Two hours later it still reads two minutes.
        expect(talosResearchElapsedSeconds(over, '2026-08-03T12:00:00.000Z')).toBe(120)
    })

    it('measures to the last step, not to the last time anything was written', () => {
        // `updatedAt` is stamped by every event the journal accepts, and a
        // rename is one of them. A research done in two minutes yesterday and
        // retitled today would read as if it had thought for a day.
        const renamed = run({
            status: 'done',
            title: 'La moka',
            startedAt: '2026-08-03T10:00:00.000Z',
            steps: [
                step({ finishedAt: '2026-08-03T10:01:00.000Z' }),
                step({ id: 'b2:search', branchId: 'b2', finishedAt: '2026-08-03T10:02:00.000Z' }),
            ],
            updatedAt: '2026-08-04T18:30:00.000Z',
        })
        expect(talosResearchElapsedSeconds(renamed, '2026-08-04T19:00:00.000Z')).toBe(120)
    })

    it('falls back to the journal when nothing ever finished', () => {
        // Cancelled before the first step reported: there is no better answer,
        // and zero would be a lie about a run that did occupy the machine.
        const stillborn = run({
            status: 'cancelled',
            startedAt: '2026-08-03T10:00:00.000Z',
            updatedAt: '2026-08-03T10:00:30.000Z',
            steps: [step({ state: 'failed', finishedAt: null })],
        })
        expect(talosResearchElapsedSeconds(stillborn, '2026-08-03T12:00:00.000Z')).toBe(30)
    })

    it('survives a timestamp it cannot read', () => {
        // A journal is read from storage; one bad row must not put NaN on screen.
        expect(talosResearchElapsedSeconds(run({ startedAt: 'boh' }), '2026-08-03T10:01:00.000Z')).toBe(0)
    })

    it('writes a duration a person can read at a glance', () => {
        expect(talosResearchDuration(38)).toBe('38 s')
        expect(talosResearchDuration(60)).toBe('1 min 00 s')
        // Padded, so the column does not jitter as the seconds tick.
        expect(talosResearchDuration(248)).toBe('4 min 08 s')
    })
})
