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

    it('LOCAL-PARITY-NO-SPURIOUS-TOOL-09 does not execute a catalog-only call', async () => {
        const hidden = call('m1', 'memory_search', '{"query":"TALOS_TESTO_101"}')
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [hidden] })
            .mockResolvedValueOnce({ text: 'TALOS_TESTO_101' })
        const execute = vi.fn(async () => ({ content: 'should not be read', ok: true }))
        const preflight = vi.fn(async () => ({
            status: 'terminal' as const,
            outcome: {
                ok: false,
                senzaEffetto: true,
                content: 'The tool was not run because its schema was not requested.',
            },
        }))

        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'reply exactly' }], {
            complete,
            preflight,
            execute,
        })

        expect(preflight).toHaveBeenCalledWith(hidden)
        expect(execute).not.toHaveBeenCalled()
        expect(complete.mock.calls[1]![0]).toEqual(expect.arrayContaining([
            expect.objectContaining({
                role: 'tool',
                toolCallId: 'm1',
                content: expect.stringContaining('schema was not requested'),
            }),
        ]))
        expect(outcome.text).toBe('TALOS_TESTO_101')
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
        // One initial call, one per round, and ONE final request for an answer
        // after the model is told its tool budget is spent. That last one is the
        // difference between a blank bubble and a reply.
        expect(complete).toHaveBeenCalledTimes(TALOS_AGENT_MAX_ROUNDS + 2)
        expect(outcome.text).toBe('')
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

    it('keeps the preamble the user already watched being streamed', async () => {
        // Models routinely speak before calling ("Let me look that up…"). That
        // text is streamed to the screen, but only the LAST completion was
        // returned — so the moment the durable message replaced the stream, the
        // sentence the user had just read vanished.
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: 'Guardo nella tua Libreria.', toolCalls: [call('c1')] })
            .mockResolvedValueOnce({ text: 'La fattura è di 2196 euro.' })
        const execute = vi.fn(async () => ({ content: 'found', ok: true }))
        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'quanto devo?' }], { complete, execute })
        expect(outcome.text).toBe(['Guardo nella tua Libreria.', 'La fattura è di 2196 euro.'].join('\n\n'))
    })

    it('a silent tool round adds no blank lines to the answer', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [call('c1')] })
            .mockResolvedValueOnce({ text: 'Sono 2196 euro.' })
        const execute = vi.fn(async () => ({ content: 'found', ok: true }))
        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'quanto?' }], { complete, execute })
        expect(outcome.text).toBe('Sono 2196 euro.')
    })

    it('the ROUND bound tells the model and gets a real answer, never a blank bubble', async () => {
        // The docstring promised this for both bounds; it was true only for the
        // call bound. The round bound broke out and returned the tool-requesting
        // completion, whose text is legitimately empty — so the user watched
        // five rounds of tool chips and received an empty message.
        const complete = vi.fn(async () => ({ text: '', toolCalls: [call('c1')] }))
        complete.mockResolvedValue({ text: '', toolCalls: [call('c1')] })
        const execute = vi.fn(async () => ({ content: 'found', ok: true }))
        let lastTurns: ChatTurn[] = []
        const wrapped = vi.fn(async (turns: ChatTurn[]) => {
            lastTurns = turns
            return turns.filter((turn) => turn.role === 'tool').some((turn) => turn.content.includes('limit of'))
                ? { text: 'Con quello che ho: sono 2196 euro.' }
                : { text: '', toolCalls: [call('c1')] }
        })
        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'quanto?' }], { complete: wrapped, execute })
        expect(outcome.stoppedByLimit).toBe(true)
        expect(outcome.rounds).toBe(TALOS_AGENT_MAX_ROUNDS)
        expect(outcome.text).toBe('Con quello che ho: sono 2196 euro.')
        // Every call the model asked for is answered, or the next request is
        // invalid for every provider that checks call ids.
        expect(lastTurns.filter((turn) => turn.role === 'tool').at(-1)?.toolCallId).toBe('c1')
        expect(complete).not.toHaveBeenCalled()
    })
})

/**
 * ⛔⛔⛔ UN PREAMBOLO CHE ANNUNCIA CIÒ CHE NON È SUCCESSO SI TOGLIE.
 *
 * Visto sul Pad il 2026-08-14: «Sveglia delle 07:00 annullata.» detto PRIMA di
 * chiamare, mentre l'orologio contava quattro sveglie armate. La riga era falsa
 * nel momento in cui è stata scritta.
 *
 * ⛔ Il preambolo si tiene di regola — la persona l'ha già visto scorrere, e c'è
 * un test che lo custodisce. Ma quel test parte da un preambolo VERO. Quando
 * l'attrezzo dichiara di non aver avuto effetto, l'annuncio è una bugia per
 * costruzione: mostrare per sempre una frase falsa è peggio che vederne sparire
 * una vera.
 */
describe('preambolo e attrezzi senza effetto', () => {
    it('⛔⛔ il preambolo SPARISCE se il tool non ha avuto effetto', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: 'Sveglia annullata.', toolCalls: [call('c1')] })
            .mockResolvedValueOnce({ text: 'Ho mandato il comando: controlla la lista.' })
        const execute = vi.fn(async () => ({ content: 'asked', ok: true, senzaEffetto: true }))

        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'annulla' }], { complete, execute })

        expect(outcome.text).toBe('Ho mandato il comando: controlla la lista.')
    })

    /*
     * ⛔ IL VERSO CONTRARIO, ed è quello che protegge il test esistente: se
     * l'attrezzo ha fatto qualcosa, il preambolo RESTA — la persona l'ha visto
     * e racconta una cosa vera.
     */
    it('⛔ il preambolo RESTA se il tool ha fatto qualcosa', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: 'Guardo nella tua Libreria.', toolCalls: [call('c1')] })
            .mockResolvedValueOnce({ text: 'La fattura è di 2196 euro.' })
        const execute = vi.fn(async () => ({ content: 'found', ok: true }))

        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'quanto?' }], { complete, execute })

        expect(outcome.text).toBe(['Guardo nella tua Libreria.', 'La fattura è di 2196 euro.'].join('\n\n'))
    })
})
