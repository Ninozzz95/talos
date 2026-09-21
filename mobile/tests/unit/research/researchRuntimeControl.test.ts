import { describe, expect, it } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { createTalosResearchRuntime } from '@/services/researchRuntime'
import { talosResearchSpent } from '@/lib/research/researchRun'
import type { TalosRunKeeper } from '@/services/longRunKeeper'

/**
 * Pausing, cancelling, renaming and removing a research — 2026-08-03.
 *
 * The research on long-running work is blunt about the platform: Android has no
 * pause. WorkManager runs ENQUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED/BLOCKED,
 * CANCELLED is terminal and cannot be resumed, and a product that wants a real
 * pause has to hold it in its own state. These tests hold the two words apart —
 * and hold the money, which is what makes the difference matter here.
 */
function clock(): () => string {
    let tick = 0
    return () => new Date(Date.UTC(2026, 7, 3, 0, 0, tick++)).toISOString()
}

function fakeKeeper(): TalosRunKeeper {
    return { engage: () => {}, describe: () => {}, release: () => {} }
}

const BRANCHES = [
    { id: 'b1', question: 'prezzi attuali', estimate: { tokens: 900, searches: 1, pages: 2 } },
    { id: 'b2', question: 'recensioni reali', estimate: { tokens: 900, searches: 1, pages: 2 } },
]

const ONE_SEARCH = { spend: { tokens: 500, searches: 1, pages: 0 }, resultRef: 'vault:x' }

function make(perform: Parameters<typeof createTalosResearchRuntime>[0]['perform']) {
    const repository = createMemoryChatRepository()
    const runtime = createTalosResearchRuntime({
        repository,
        keeper: () => fakeKeeper(),
        now: clock(),
        perform,
    })
    return { runtime, repository }
}

/** Start a run whose first step asks the runtime to stop, mid-flight. */
function stoppingDuringFirstStep(mode: 'pause' | 'cancel') {
    let runtime: ReturnType<typeof createTalosResearchRuntime>
    const calls = { performed: 0 }
    const made = make(async () => {
        calls.performed += 1
        if (calls.performed === 1) await runtime[mode]('run-1')
        return ONE_SEARCH
    })
    runtime = made.runtime
    return { ...made, calls }
}

const START = { id: 'run-1', sessionId: 's', question: 'quale tablet', depth: 'quick' as const }

describe('stopping a research that is running', () => {
    it('lets the paid-for step finish before it rests — drain, then checkpoint', async () => {
        const { runtime, repository, calls } = stoppingDuringFirstStep('pause')

        const run = await runtime.start({ ...START, branches: BRANCHES })

        expect(run.status).toBe('paused')
        // The step that was in flight is BANKED, not thrown away. The call was
        // already sent and already charged; discarding its answer to honour the
        // word "pause" faster would spend the person's money for nothing.
        expect(run.steps.filter((step) => step.state === 'done')).toHaveLength(1)
        expect(talosResearchSpent(run).searches).toBe(1)
        // And the second was never bought.
        expect(calls.performed).toBe(1)

        // The journal says what happened, in order — including the interval
        // between being asked to stop and being able to.
        const kinds = (await repository.readResearchJournal('run-1')).map((entry) => entry.kind)
        expect(kinds.slice(-3)).toEqual(['step_finished', 'run_pause_requested', 'run_paused'])
    })

    it('picks it up exactly where it stopped, and says so in the journal', async () => {
        const { runtime, repository, calls } = stoppingDuringFirstStep('pause')
        await runtime.start({ ...START, branches: BRANCHES })

        const back = await runtime.resume('run-1')

        expect(back.status).toBe('done')
        // Two searches in total, never three: the banked step is not re-bought.
        expect(calls.performed).toBe(2)
        expect(talosResearchSpent(back).searches).toBe(2)

        const kinds = (await repository.readResearchJournal('run-1')).map((entry) => entry.kind)
        expect(kinds).toContain('run_resumed')
        expect(kinds.indexOf('run_resumed')).toBeGreaterThan(kinds.indexOf('run_paused'))
    })

    it('cancels for good, and a cancelled research does not come back', async () => {
        const { runtime, calls } = stoppingDuringFirstStep('cancel')

        const run = await runtime.start({ ...START, branches: BRANCHES })
        expect(run.status).toBe('cancelled')
        // What was collected before the tap stays readable and stays paid for.
        expect(talosResearchSpent(run).searches).toBe(1)

        // This is the whole difference from pause: resuming buys nothing.
        const after = await runtime.resume('run-1')
        expect(after.status).toBe('cancelled')
        expect(calls.performed).toBe(1)
    })

    it('writes the pause itself when nobody is driving', async () => {
        // No driver means nothing in flight — this IS the safe point, and there
        // is no second writer to collide with over the journal's seq.
        //
        // The run has to be stopped WITHOUT being over, which is exactly what a
        // failed step leaves behind: the driver returns, the research still owes
        // its remaining branches, and nobody is holding it.
        const { runtime, repository } = make(async () => { throw new Error('rete assente') })
        await runtime.start({ ...START, branches: BRANCHES })

        const paused = await runtime.pause('run-1')

        expect(paused.status).toBe('paused')
        expect((await repository.readResearchJournal('run-1')).map((entry) => entry.kind))
            .toContain('run_paused')
    })

    it('does not let a stop outlive the run it was asked of', async () => {
        /**
         * The leak has one real door, and it is not the ordinary one: a step
         * that FAILS returns immediately, without passing the top-of-loop check
         * where a stop is consumed. The run is left owing work and not
         * terminal, so it is perfectly resumable — and the request the person
         * made about the previous attempt would be sitting there waiting to
         * stop the next one, before it bought anything at all.
         */
        let runtime: ReturnType<typeof createTalosResearchRuntime>
        let attempts = 0
        const made = make(async () => {
            attempts += 1
            if (attempts === 1) {
                await runtime.pause('run-1')
                throw new Error('rete assente')
            }
            return ONE_SEARCH
        })
        runtime = made.runtime

        const failed = await runtime.start({ ...START, branches: [BRANCHES[0]!] })
        expect(failed.steps[0]!.state).toBe('failed')
        expect(failed.status).not.toBe('paused')

        // Asked to continue, it continues.
        const back = await runtime.resume('run-1')
        expect(back.status).toBe('done')
        expect(attempts).toBe(2)
    })

    it('stops before the report is written, not after paying for it', async () => {
        // A pause asked during the last BRANCH must not go on to buy the
        // synthesis — the dearest step of the run.
        let runtime: ReturnType<typeof createTalosResearchRuntime>
        let wrote = false
        const made = createTalosResearchRuntime({
            repository: createMemoryChatRepository(),
            keeper: () => fakeKeeper(),
            now: clock(),
            perform: async () => {
                await runtime.pause('run-1')
                return ONE_SEARCH
            },
            synthesise: async () => { wrote = true; return ONE_SEARCH },
        })
        runtime = made

        const run = await made.start({ ...START, branches: [BRANCHES[0]!] })

        expect(run.status).toBe('paused')
        expect(wrote).toBe(false)
        // …and the gathering it did pay for is banked and resumable.
        expect(talosResearchSpent(run).searches).toBe(1)

        expect((await made.resume('run-1')).status).toBe('done')
        expect(wrote).toBe(true)
    })

    it('refuses to re-end a research that has already ended', async () => {
        // A notification action can arrive after the fact. It must not rewrite
        // the ending, and above all must not turn `done` into `paused`.
        const { runtime } = make(async () => ONE_SEARCH)
        const done = await runtime.start({ ...START, branches: [BRANCHES[0]!] })
        expect(done.status).toBe('done')

        expect((await runtime.cancel('run-1')).status).toBe('done')
    })
})

describe('renaming and removing a research', () => {
    it('changes the label and leaves the question that was paid for', async () => {
        const { runtime } = make(async () => ONE_SEARCH)
        await runtime.start({ ...START, branches: [BRANCHES[0]!] })

        const named = await runtime.rename('run-1', 'Tablet 2026')
        expect(named.title).toBe('Tablet 2026')
        // The fact survives: the plan, the export and the provenance lean on it.
        expect(named.question).toBe('quale tablet')

        expect((await runtime.rename('run-1', null)).title).toBeNull()
    })

    it('takes the dossiers with it, because a research IS its sources', async () => {
        const repository = createMemoryChatRepository()
        await repository.initialize()
        const dossier = await repository.createVaultFile({
            id: 'file-1',
            display_name: 'fonte.md',
            media_type: 'text/markdown',
            size_bytes: 10,
            private_uri: 'file:///fonte.md',
            trust: 'generated',
            sha256: null,
            extracted_text: 'testo',
            metadata_json: '{}',
        })

        const runtime = createTalosResearchRuntime({
            repository,
            keeper: () => fakeKeeper(),
            now: clock(),
            perform: async () => ({ spend: { tokens: 1, searches: 1, pages: 1 }, resultRef: dossier.id }),
        })
        await runtime.start({ ...START, branches: [BRANCHES[0]!] })

        const removed = await runtime.remove('run-1')

        expect(await repository.listResearchRuns()).toHaveLength(0)
        expect(await repository.readResearchJournal('run-1')).toHaveLength(0)
        // The page it fetched is revoked rather than left in the Library with
        // nothing left to say why it is there.
        expect(removed).toEqual(['file-1'])
        const files = await repository.listVaultFiles()
        expect(files.find((file) => file.id === 'file-1')).toBeUndefined()
    })

    it('refuses to delete a research this process is driving', async () => {
        // Deleting the journal from under the single writer would leave it
        // appending to a run that no longer exists — and would destroy the only
        // record that a step already sent to a provider had been paid for.
        let runtime: ReturnType<typeof createTalosResearchRuntime>
        let refusal: unknown = null
        const made = make(async () => {
            refusal = await runtime.remove('run-1').then(() => null, (error: unknown) => error)
            return ONE_SEARCH
        })
        runtime = made.runtime
        await runtime.start({ ...START, branches: [BRANCHES[0]!] })

        expect((refusal as Error | null)?.message).toBe('TALOS_RESEARCH_RUN_BUSY')
    })
})

describe('what a screen watching a run is told', () => {
    it('hears the report being written, not only the branches', async () => {
        /**
         * The synthesis is the LONGEST step, and it published nothing: the loop
         * reported only at its own top, so a screen sat frozen on the last
         * branch count for the whole minute the report took, then jumped to an
         * ending. Owner 2026-08-03: «nessuna progress bar». Half of that was
         * this — there was nothing to draw a bar from.
         */
        const seen: Array<{ done: number; total: number; status: string }> = []
        const runtime = createTalosResearchRuntime({
            repository: createMemoryChatRepository(),
            keeper: () => fakeKeeper(),
            now: clock(),
            perform: async () => ONE_SEARCH,
            synthesise: async () => ONE_SEARCH,
        })

        await runtime.start({ ...START, branches: [BRANCHES[0]!] }, (progress) => {
            seen.push({ done: progress.done, total: progress.total, status: progress.run.status })
        })

        // The denominator GROWS when the synthesis becomes a real step, and the
        // screen is told at that moment rather than discovering it at the end.
        expect(seen.some((entry) => entry.total === 1)).toBe(true)
        expect(seen.some((entry) => entry.total === 2 && entry.done === 1)).toBe(true)
        // And the finished state arrives as a report too.
        expect(seen.at(-1)).toMatchObject({ done: 2, total: 2, status: 'done' })
    })

    it('says so when a step fails, instead of leaving the last cheerful count', async () => {
        const seen: string[] = []
        const runtime = createTalosResearchRuntime({
            repository: createMemoryChatRepository(),
            keeper: () => fakeKeeper(),
            now: clock(),
            perform: async () => ONE_SEARCH,
            synthesise: async () => { throw new Error('il modello non ha tenuto il formato') },
        })

        await runtime.start({ ...START, branches: [BRANCHES[0]!] }, (progress) => {
            seen.push(progress.run.steps.map((step) => step.state).join(','))
        })

        // The last thing the screen hears includes the failure.
        expect(seen.at(-1)).toContain('failed')
    })
})
