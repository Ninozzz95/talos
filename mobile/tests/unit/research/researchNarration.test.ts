import { describe, expect, it } from 'vitest'
import { talosResearchNarration, talosResearchStepTitle } from '@/lib/research/researchNarration'
import type { TalosResearchRun, TalosResearchStatus, TalosResearchStep } from '@/lib/research/researchRun'

/**
 * The page has to say WHAT it is doing, not how much of it.
 *
 * Owner 2026-08-03 on the previous page: «non c'è un progresso di quello che si
 * sta facendo … dei termini molto tecnici». Every case below is the same
 * assertion in a different situation — that the sentence names the branch
 * question, which is the only human name a step has.
 */
function step(over: Partial<TalosResearchStep> = {}): TalosResearchStep {
    return {
        id: 'b1:search',
        branchId: 'b1',
        kind: 'search',
        state: 'running',
        attempts: 1,
        startedAt: '2026-08-03T10:00:00.000Z',
        finishedAt: null,
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

describe('what the research is doing, in a sentence', () => {
    it('names the branch it is searching, not the step id', () => {
        // «sto cercando le fonti su «chi la brevettò»» — the question is on the
        // branch, approved before any money was spent, so this costs nothing.
        expect(talosResearchNarration(run({ steps: [step()] }), true))
            .toEqual({ key: 'research.say.searching', params: { question: 'chi la brevettò' } })
    })

    it('follows the running step to the second branch, not the first', () => {
        // A sentence that always names branch one would read as true for the
        // whole run and be wrong for most of it.
        const later = run({
            steps: [
                step({ id: 'b1:search', state: 'done', resultRef: 'file-1' }),
                step({ id: 'b2:search', branchId: 'b2' }),
            ],
        })
        expect(talosResearchNarration(later, true).params).toEqual({ question: 'in che anno' })
    })

    it('tells reading a page apart from searching for one', () => {
        expect(talosResearchNarration(run({ steps: [step({ kind: 'read' })] }), true).key)
            .toBe('research.say.reading')
    })

    it('says it is writing once the synthesis is the running step', () => {
        const writing = run({
            status: 'synthesising',
            steps: [step({ id: 'synthesis', branchId: 'synthesis', kind: 'synthesise' })],
        })
        // No branch question here, and none is invented.
        expect(talosResearchNarration(writing, true)).toEqual({ key: 'research.say.writing', params: {} })
    })

    it('says what it is ABOUT to do in the gap between two steps', () => {
        // The engine has already decided; the gap is milliseconds. Going silent
        // in the one frame a person is most likely to be watching is worse.
        const between = run({ steps: [step({ state: 'done', resultRef: 'file-1' })] })
        expect(talosResearchNarration(between, true))
            .toEqual({ key: 'research.say.searching', params: { question: 'in che anno' } })
    })

    it('says it is writing when every branch is done and nothing is running', () => {
        const collected = run({
            steps: [
                step({ id: 'b1:search', state: 'done', resultRef: 'file-1' }),
                step({ id: 'b2:search', branchId: 'b2', state: 'done', resultRef: 'file-2' }),
            ],
        })
        expect(talosResearchNarration(collected, true).key).toBe('research.say.writing')
    })

    it('does not claim to be searching when nobody is driving the run', () => {
        // The journal still reads `collecting` after the app was killed. A page
        // that says «sto cercando» about that is a lie you can watch for an hour.
        const abandoned = run({ steps: [step({ state: 'interrupted' })] })
        expect(talosResearchNarration(abandoned, false))
            .toEqual({ key: 'research.say.stoppedAt', params: { question: 'chi la brevettò' } })
        // And with somebody driving it, the same run is searching again.
        expect(talosResearchNarration(abandoned, true).key).toBe('research.say.searching')
    })

    it('says where a paused run will pick up', () => {
        const rested = run({
            status: 'paused',
            steps: [step({ id: 'b1:search', state: 'done', resultRef: 'file-1' })],
        })
        expect(talosResearchNarration(rested, true))
            .toEqual({ key: 'research.say.pausedAt', params: { question: 'in che anno' } })
    })

    it('does not call a run paused while it is still finishing a step', () => {
        // «Drain then checkpoint»: a step already paid for is allowed to finish
        // and commit. The gap can be a minute of somebody staring at a button
        // they already pressed, and «in pausa» there is the page's word against
        // the spinner's.
        const asked = run({ status: 'pause_requested', steps: [step()] })
        expect(talosResearchNarration(asked, true)).toEqual({ key: 'research.say.pausing', params: {} })
    })

    it('tells the endings apart', () => {
        // «annullata» and «si è fermata per un errore» are two different things
        // to do next, and the page used to say one word for both.
        expect(talosResearchNarration(run({ status: 'cancelled' }), false).key).toBe('research.cancelledHere')
        expect(talosResearchNarration(run({ status: 'failed' }), false).key).toBe('research.say.failed')
    })

    it('does not announce a report that was never written', () => {
        // Owner 2026-08-03: a run ended, the page said «conclusa», and there
        // was nothing to read. Same status, entirely different situation — and
        // the hours it cost were spent looking for a bug in the wrong place.
        const written = step({
            id: 'synthesis', branchId: 'synthesis', kind: 'synthesise', state: 'done', resultRef: 'file-report',
        })
        expect(talosResearchNarration(run({ status: 'done', steps: [written] }), false).key)
            .toBe('research.say.done')
        expect(talosResearchNarration(run({ status: 'done', steps: [] }), false).key)
            .toBe('research.doneNoReport')
        // A synthesis that ran and failed left no report either.
        expect(talosResearchNarration(run({ status: 'done', steps: [{ ...written, state: 'failed', resultRef: null }] }), false).key)
            .toBe('research.doneNoReport')
    })

    it('does not go looking for work a terminal run no longer owes', () => {
        // A cancelled run has outstanding branches on paper. Naming one would
        // promise it is going to be picked up.
        expect(talosResearchNarration(run({ status: 'cancelled' }), false).params).toEqual({})
    })

    it('says it is planning only while there is no plan', () => {
        expect(talosResearchNarration(run({ plan: [] }), true).key).toBe('research.say.planning')
    })

    it('never leaves a placeholder unfilled when a branch has gone missing', () => {
        // A step pointing at a branch the plan does not have would otherwise
        // render the literal text `{question}` on screen.
        const orphan = run({ steps: [step({ branchId: 'ghost' })] })
        const said = talosResearchNarration(orphan, true)
        expect(said.key).toBe('research.say.collecting')
        expect(said.params).toEqual({})
    })
})

describe('the name a step carries in the record', () => {
    it('is what the step was for, never the engine’s own identifier', () => {
        // `b1:search` is useful to exactly one reader, and he wrote it.
        expect(talosResearchStepTitle(run(), step()))
            .toEqual({ key: 'research.stepTitle.search', params: { question: 'chi la brevettò' } })
        expect(talosResearchStepTitle(run(), step({ kind: 'read' })).key).toBe('research.stepTitle.read')
    })

    it('names the two steps that belong to no branch without a question', () => {
        const writing = step({ id: 'synthesis', branchId: 'synthesis', kind: 'synthesise' })
        expect(talosResearchStepTitle(run(), writing)).toEqual({ key: 'research.stepTitle.write', params: {} })
        expect(talosResearchStepTitle(run(), step({ kind: 'verify' })).key).toBe('research.stepTitle.verify')
    })

    it('falls back to a plain name rather than printing an empty quotation', () => {
        expect(talosResearchStepTitle(run(), step({ branchId: 'ghost' })).key)
            .toBe('research.stepTitle.searchPlain')
        expect(talosResearchStepTitle(run(), step({ branchId: 'ghost', kind: 'read' })).key)
            .toBe('research.stepTitle.readPlain')
    })
})
