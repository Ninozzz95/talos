import { describe, expect, it, vi } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { createTalosResearchRuntime } from '@/services/researchRuntime'
import { talosResearchSpent } from '@/lib/research/researchRun'
import type { TalosRunKeeper } from '@/services/longRunKeeper'

function clock(): () => string {
    let tick = 0
    return () => new Date(Date.UTC(2026, 7, 2, 0, 0, tick++)).toISOString()
}

function fakeKeeper() {
    const events: string[] = []
    const keeper: TalosRunKeeper = {
        engage: (text) => { events.push(`engage:${text}`) },
        describe: (text) => { events.push(`describe:${text}`) },
        release: () => { events.push('release') },
    }
    return { keeper, events }
}

const BRANCHES = [
    { id: 'b1', question: 'prezzi attuali', estimate: { tokens: 900, searches: 1, pages: 2 } },
    { id: 'b2', question: 'recensioni reali', estimate: { tokens: 900, searches: 1, pages: 2 } },
]

function make(perform: Parameters<typeof createTalosResearchRuntime>[0]['perform']) {
    const repository = createMemoryChatRepository()
    const held = fakeKeeper()
    const runtime = createTalosResearchRuntime({
        repository,
        keeper: () => held.keeper,
        now: clock(),
        perform,
    })
    return { runtime, repository, held }
}

const ONE_SEARCH = { spend: { tokens: 500, searches: 1, pages: 0 }, resultRef: 'vault:x' }

describe('a research run being driven', () => {
    it('writes every step to the journal as it happens, not at the end', async () => {
        const seen: number[] = []
        const { runtime, repository } = make(async () => {
            // Read the journal from INSIDE a step: what is on disk mid-run is
            // the only thing a killed process leaves behind, so it is the only
            // thing worth asserting on.
            seen.push((await repository.readResearchJournal('run-1')).length)
            return ONE_SEARCH
        })

        await runtime.start({ id: 'run-1', sessionId: 's', question: 'q', depth: 'quick', branches: BRANCHES })

        // Before the first step's work: started + plan + step_started = 3.
        // Before the second: the first step's completion is already down.
        expect(seen).toEqual([3, 5])
    })

    it('holds the service for the work and lets go on the way out', async () => {
        const { runtime, held } = make(async () => ONE_SEARCH)

        await runtime.start({ id: 'run-1', sessionId: 's', question: 'quale tablet', depth: 'quick', branches: BRANCHES })

        expect(held.events.filter((event) => event === 'release')).toHaveLength(1)
        expect(held.events[held.events.length - 1]).toBe('release')
        expect(held.events[0]).toBe('engage:1/2 · prezzi attuali')
    })

    it('lets go even when a step throws', async () => {
        const { runtime, held } = make(async () => { throw new Error('no network') })

        const run = await runtime.start({ id: 'run-1', sessionId: 's', question: 'q', depth: 'quick', branches: BRANCHES })

        expect(run.steps[0]!.state).toBe('failed')
        expect(held.events[held.events.length - 1]).toBe('release')
    })

    /**
     * THE test the phase exists for.
     *
     * The process dies mid-step. Nothing wrote "interrupted" — the thing that
     * would have written it is what died. On the way back up the run must
     * continue from the branch that was open and must NOT redo the branch that
     * finished, because that one was paid for.
     */
    it('resumes a run whose process was KILLED mid-step, without redoing what finished', async () => {
        const repository = createMemoryChatRepository()
        const now = clock()

        // The journal exactly as a killed process leaves it: b1 finished, b2
        // started and then nothing. No `step_failed`, because the thing that
        // would have written one is what died — that absence IS the scenario,
        // and driving a throwing `perform` would test the failure path instead.
        const journal = [
            { kind: 'run_started', at: now(), id: 'run-1', sessionId: 's', question: 'q', depth: 'deep', engine: 'device' },
            { kind: 'plan_approved', at: now(), branches: BRANCHES },
            { kind: 'step_started', at: now(), stepId: 'b1:search', branchId: 'b1', stepKind: 'search' },
            { kind: 'step_finished', at: now(), stepId: 'b1:search', spend: ONE_SEARCH.spend, resultRef: 'vault:b1' },
            { kind: 'step_started', at: now(), stepId: 'b2:search', branchId: 'b2', stepKind: 'search' },
        ]
        for (const [seq, event] of journal.entries()) {
            await repository.appendResearchEvent({
                run_id: 'run-1', seq, kind: event.kind, at: event.at, payload_json: JSON.stringify(event),
            })
        }

        const performed: string[] = []
        const revived = createTalosResearchRuntime({
            repository,
            keeper: () => fakeKeeper().keeper,
            now,
            perform: async (branch) => { performed.push(branch.id); return ONE_SEARCH },
        })
        const finished = await revived.resume('run-1')

        // b1 is never touched again: it was paid for. b2 is picked up.
        expect(performed).toEqual(['b2'])
        expect(finished.status).toBe('done')
        // Two attempts at b2 — the one that died, and this one. Evidence, and
        // the reason the idempotency key must NOT contain the attempt number.
        expect(finished.steps.find((step) => step.id === 'b2:search')?.attempts).toBe(2)
        expect(talosResearchSpent(finished)).toEqual({ tokens: 1000, searches: 2, pages: 0 })
    })

    it('names the runs that were left half-done, and forgets the ones that finished', async () => {
        const repository = createMemoryChatRepository()
        const now = clock()
        const build = (perform: () => Promise<typeof ONE_SEARCH>) => createTalosResearchRuntime({
            repository, keeper: () => fakeKeeper().keeper, now, perform,
        })

        await build(async () => ONE_SEARCH)
            .start({ id: 'run-done', sessionId: 's', question: 'finita', depth: 'quick', branches: BRANCHES })
        await build(async () => { throw new Error('KILLED') })
            .start({ id: 'run-open', sessionId: 's', question: 'a metà', depth: 'quick', branches: BRANCHES })

        const left = await build(async () => ONE_SEARCH).unfinished()

        expect(left.map((run) => run.id)).toEqual(['run-open'])
    })

    it('picks up a run that was killed during the synthesis, not just during a branch', async () => {
        const repository = createMemoryChatRepository()
        const now = clock()
        const wrote: string[] = []
        const build = (synthesise?: () => Promise<typeof ONE_SEARCH>) => createTalosResearchRuntime({
            repository,
            keeper: () => fakeKeeper().keeper,
            now,
            perform: async () => ONE_SEARCH,
            synthesise,
        })

        // Every branch finishes, then the process dies writing the report.
        await build(async () => { throw new Error('KILLED') })
            .start({ id: 'run-1', sessionId: 's', question: 'q', depth: 'quick', branches: BRANCHES })

        const left = await build(async () => ONE_SEARCH).unfinished()
        expect(left.map((run) => run.id)).toEqual(['run-1'])

        const finished = await build(async () => { wrote.push('report'); return ONE_SEARCH }).resume('run-1')

        // The gathering is not redone — only the report is written.
        expect(wrote).toEqual(['report'])
        expect(finished.status).toBe('done')
    })

    it('does nothing at all when asked to resume a run that is already complete', async () => {
        const perform = vi.fn(async () => ONE_SEARCH)
        const { runtime } = make(perform)

        await runtime.start({ id: 'run-1', sessionId: 's', question: 'q', depth: 'quick', branches: BRANCHES })
        const calls = perform.mock.calls.length
        await runtime.resume('run-1')

        expect(perform.mock.calls.length).toBe(calls)
    })
})
