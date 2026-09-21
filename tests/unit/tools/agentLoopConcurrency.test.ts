import { describe, expect, it, vi } from 'vitest'
import { runTalosAgentLoop } from '@/lib/tools/agentLoop'
import type { TalosToolCall } from '@/stores/chat'

/**
 * Owner 2026-07-26: "con questo prompt è veramente incredibilmente lento
 * bisogna fare una ricerca web su come ottimizzare al massimo come fanno i
 * competitor (O MEGLIO) la velocità di elaborazione tool call".
 *
 * The research answered it first (2026-07-26, logged in the ledger). Anthropic
 * on their own Research product: "Our early agents executed sequential
 * searches, which was painfully slow" — parallel tool calling "cut research
 * time by up to 90% for complex queries". A 2026 measurement puts tool
 * EXECUTION at ~50% of wall clock on deep-research tasks (arXiv 2603.18897).
 *
 * TALOS ran the round with `for (const call of requested) await execute(call)`.
 * Five searches at ~1s each cost 5s to produce what one second of concurrency
 * would have. Nothing about that was ever a correctness requirement.
 */
function call(id: string, name = 'web_search'): TalosToolCall {
    return { id, name, arguments: { query: id } } as TalosToolCall
}

function deferred() {
    let resolve!: (value: { content: string; ok: boolean }) => void
    const promise = new Promise<{ content: string; ok: boolean }>((r) => { resolve = r })
    return { promise, resolve }
}

describe('a round of tool calls runs together, not in single file', () => {
    it('starts every call before any of them finishes', async () => {
        const gates = [deferred(), deferred(), deferred()]
        const started: string[] = []
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [call('a'), call('b'), call('c')] })
            .mockResolvedValue({ text: 'done' })

        const loop = runTalosAgentLoop([{ role: 'user', content: 'go' }], {
            complete,
            execute: async (entry) => {
                started.push(entry.id)
                return gates['abc'.indexOf(entry.id)]!.promise
            },
        })

        // Nothing has been allowed to finish yet.
        await Promise.resolve()
        await Promise.resolve()
        expect(started).toEqual(['a', 'b', 'c'])

        gates.forEach((gate, index) => gate.resolve({ content: `r${index}`, ok: true }))
        await loop
    })

    it('feeds the results back in the order the model asked, whatever finishes first', async () => {
        // The model matches results to calls by id, but a reordered array is
        // still a different conversation — and Anthropic's own docs warn that
        // malformed result batches "teach Claude to avoid parallel calls".
        const gates = [deferred(), deferred(), deferred()]
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [call('a'), call('b'), call('c')] })
            .mockResolvedValue({ text: 'done' })

        const loop = runTalosAgentLoop([{ role: 'user', content: 'go' }], {
            complete,
            execute: async (entry) => gates['abc'.indexOf(entry.id)]!.promise,
        })
        await Promise.resolve()
        // Finish backwards.
        gates[2]!.resolve({ content: 'third', ok: true })
        gates[0]!.resolve({ content: 'first', ok: true })
        gates[1]!.resolve({ content: 'second', ok: true })
        const outcome = await loop

        const turns = complete.mock.calls[1]![0] as Array<{ role: string; content: string; toolCallId?: string }>
        const toolTurns = turns.filter((turn) => turn.role === 'tool')
        expect(toolTurns.map((turn) => turn.toolCallId)).toEqual(['a', 'b', 'c'])
        expect(toolTurns.map((turn) => turn.content)).toEqual(['first', 'second', 'third'])
        expect(outcome.executed.map((entry) => entry.call.id)).toEqual(['a', 'b', 'c'])
    })

    it('holds the line at the call budget, and the same calls every time', async () => {
        // Which calls are refused must not depend on which happened to finish
        // first — a limit that moves with the network is not a limit.
        const complete = vi.fn()
            .mockResolvedValueOnce({
                text: '',
                toolCalls: [call('a'), call('b'), call('c'), call('d')],
            })
            .mockResolvedValue({ text: 'done' })
        const execute = vi.fn(async (entry: TalosToolCall) => ({
            content: entry.id,
            ok: true,
        }))

        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'go' }], {
            complete,
            execute,
            maxCalls: 2,
        })

        expect(outcome.executed.map((entry) => entry.call.id)).toEqual(['a', 'b'])
        expect(execute).toHaveBeenCalledTimes(2)
        const turns = complete.mock.calls[1]![0] as Array<{ role: string; content: string }>
        const refused = turns.filter((turn) => turn.role === 'tool' && turn.content.startsWith('Not run'))
        expect(refused).toHaveLength(2)
        expect(outcome.stoppedByLimit).toBe(true)
    })

    it('one call that throws does not lose the whole round', async () => {
        // Sequentially, a rejection propagated out of the loop and killed the
        // message. The other four results were already paid for.
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [call('a'), call('b')] })
            .mockResolvedValue({ text: 'done' })

        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'go' }], {
            complete,
            execute: async (entry) => {
                if (entry.id === 'a') throw new Error('boom')
                return { content: 'fine', ok: true }
            },
        })

        const turns = complete.mock.calls[1]![0] as Array<{ role: string; content: string; toolCallId?: string }>
        const toolTurns = turns.filter((turn) => turn.role === 'tool')
        expect(toolTurns).toHaveLength(2)
        expect(toolTurns[0]!.content).toContain('could not be run')
        expect(toolTurns[1]!.content).toBe('fine')
        expect(outcome.executed.find((entry) => entry.call.id === 'a')?.ok).toBe(false)
    })

    it('never runs more than the concurrency cap at once', async () => {
        // Chromium allows 6 sockets per host and the radio pays for every
        // burst; ten pages at once on a phone is not faster, it is just hotter.
        let running = 0
        let peak = 0
        const complete = vi.fn()
            .mockResolvedValueOnce({
                text: '',
                toolCalls: Array.from({ length: 10 }, (_, index) => call(`c${index}`)),
            })
            .mockResolvedValue({ text: 'done' })

        await runTalosAgentLoop([{ role: 'user', content: 'go' }], {
            complete,
            execute: async () => {
                running += 1
                peak = Math.max(peak, running)
                await Promise.resolve()
                running -= 1
                return { content: 'ok', ok: true }
            },
            maxCalls: 10,
        })

        expect(peak).toBeLessThanOrEqual(4)
        expect(peak).toBeGreaterThan(1)
    })
})
