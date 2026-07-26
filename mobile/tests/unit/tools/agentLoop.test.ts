import { describe, expect, it, vi } from 'vitest'
import {
    TALOS_AGENT_MAX_CALLS,
    TALOS_AGENT_MAX_ROUNDS,
    runTalosAgentLoop,
} from '@/lib/tools/agentLoop'
import type { ChatTurn, TalosToolCall } from '@/stores/chat'

function call(id: string, name = 'library_search', args = '{"query":"x"}'): TalosToolCall {
    return { id, name, arguments: args }
}

describe('agent loop', () => {
    it('no tool calls: one round trip, nothing executed', async () => {
        const complete = vi.fn(async () => ({ text: 'Ecco la risposta.' }))
        const execute = vi.fn(async () => ({ content: '', ok: true }))
        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'ciao' }], { complete, execute })
        expect(complete).toHaveBeenCalledTimes(1)
        expect(execute).not.toHaveBeenCalled()
        expect(outcome).toMatchObject({ text: 'Ecco la risposta.', rounds: 0, stoppedByLimit: false })
    })

    it('runs the requested tool and feeds the result back as a tool turn', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [call('c1')] })
            .mockResolvedValueOnce({ text: 'La fattura è di 2196 euro.' })
        const execute = vi.fn(async () => ({ content: 'found: fattura 2196', ok: true }))
        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'quanto devo?' }], { complete, execute })

        expect(execute).toHaveBeenCalledWith(call('c1'))
        const secondTurns = complete.mock.calls[1]![0] as ChatTurn[]
        // The assistant turn that ASKED must travel with the request, or the
        // provider rejects the result that follows it.
        expect(secondTurns[1]).toMatchObject({ role: 'assistant', toolCalls: [call('c1')] })
        expect(secondTurns[2]).toMatchObject({ role: 'tool', toolCallId: 'c1', content: 'found: fattura 2196' })
        expect(outcome.text).toBe('La fattura è di 2196 euro.')
        expect(outcome.executed).toEqual([{ call: call('c1'), ok: true }])
        expect(outcome.rounds).toBe(1)
    })

    it('a failed tool still answers the model, so it can recover instead of hanging', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [call('c1')] })
            .mockResolvedValueOnce({ text: 'Non ho trovato il documento.' })
        const execute = vi.fn(async () => ({ content: 'The tool failed: storage unavailable', ok: false }))
        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'cerca' }], { complete, execute })
        const secondTurns = complete.mock.calls[1]![0] as ChatTurn[]
        expect(secondTurns.at(-1)).toMatchObject({ role: 'tool', content: expect.stringContaining('storage unavailable') })
        expect(outcome.executed).toEqual([{ call: call('c1'), ok: false }])
    })

    it('chains rounds while the model keeps asking', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [call('c1')] })
            .mockResolvedValueOnce({ text: '', toolCalls: [call('c2', 'library_read')] })
            .mockResolvedValueOnce({ text: 'Il deposito è due mensilità.' })
        const execute = vi.fn(async () => ({ content: 'ok', ok: true }))
        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'deposito?' }], { complete, execute })
        expect(outcome.rounds).toBe(2)
        expect(outcome.executed.map((entry) => entry.call.id)).toEqual(['c1', 'c2'])
        expect(outcome.text).toBe('Il deposito è due mensilità.')
    })

    it('stops at the round limit instead of ping-ponging forever', async () => {
        const complete = vi.fn(async () => ({ text: '', toolCalls: [call('loop')] }))
        const execute = vi.fn(async () => ({ content: 'again', ok: true }))
        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'vai' }], { complete, execute })
        expect(outcome.rounds).toBe(TALOS_AGENT_MAX_ROUNDS)
        expect(outcome.stoppedByLimit).toBe(true)
        // One initial call plus one per round: the loop cannot outrun its bound.
        expect(complete).toHaveBeenCalledTimes(TALOS_AGENT_MAX_ROUNDS + 1)
    })

    it('caps calls WITHIN a round and tells the model, instead of dropping call ids', async () => {
        const many = Array.from({ length: TALOS_AGENT_MAX_CALLS + 3 }, (_, index) => call(`c${index}`))
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: many })
            .mockResolvedValueOnce({ text: 'Basta così.' })
        const execute = vi.fn(async () => ({ content: 'ok', ok: true }))
        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'tutto' }], { complete, execute })

        expect(execute).toHaveBeenCalledTimes(TALOS_AGENT_MAX_CALLS)
        expect(outcome.stoppedByLimit).toBe(true)
        const secondTurns = complete.mock.calls[1]![0] as ChatTurn[]
        const toolTurns = secondTurns.filter((turn) => turn.role === 'tool')
        // EVERY requested id is answered — an unanswered call id makes the next
        // request invalid for providers that check.
        expect(toolTurns).toHaveLength(many.length)
        expect(toolTurns.at(-1)?.content).toMatch(/limit of 12 tool calls/i)
    })

    it('announces each round so the interface can show what is running', async () => {
        const onToolRound = vi.fn()
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [call('c1'), call('c2', 'time_now', '{}')] })
            .mockResolvedValueOnce({ text: 'fatto' })
        await runTalosAgentLoop([{ role: 'user', content: 'x' }], {
            complete,
            execute: async () => ({ content: 'ok', ok: true }),
            onToolRound,
        })
        expect(onToolRound).toHaveBeenCalledTimes(1)
        expect(onToolRound.mock.calls[0]![0]).toHaveLength(2)
    })

    it('a provider error propagates — the loop must not swallow a failed turn', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [call('c1')] })
            .mockRejectedValueOnce(new Error('provider exploded'))
        await expect(runTalosAgentLoop([{ role: 'user', content: 'x' }], {
            complete,
            execute: async () => ({ content: 'ok', ok: true }),
        })).rejects.toThrow(/provider exploded/)
    })
})
