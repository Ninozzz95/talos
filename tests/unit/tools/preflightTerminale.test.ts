import { describe, expect, it, vi } from 'vitest'
import { runTalosAgentLoop } from '@/lib/tools/agentLoop'
import type { ChatTurn, TalosToolCall } from '@/stores/chat'

/**
 * ⛔⛔⛔ UNA CHIAMATA GIÀ TERMINALE NON DEVE ENTRARE NEL PIANO.
 *
 * `preflightTalosToolExecution()` sa già rispondere `terminal` — tool spento,
 * argomenti invalidi, permesso negato, e da oggi premessa assente. Ma il
 * contratto del ciclo conosce solo `ready` e `authorization_required`, e chi lo
 * implementa appiattisce tutto il resto a `ready`.
 *
 * ⇒ Una chiamata epistemicamente impossibile:
 *   1. entra nel piano;
 *   2. viene mostrata alla persona come un passo eseguibile;
 *   3. diventa errore solo dopo, dentro l'esecuzione.
 *
 * Per il contratto epistemico non è accettabile: una premessa assente non deve
 * comparire nemmeno come passo approvabile.
 */

const turni: ChatTurn[] = [{ role: 'user', content: 'fai le due cose' }]
const chiamata = (id: string, name: string): TalosToolCall =>
    ({ id, name, arguments: '{"x":1}' } as TalosToolCall)

describe('il preflight terminale', () => {
    it('⛔⛔ una chiamata TERMINALE non arriva a execute', async () => {
        const execute = vi.fn(async () => ({ ok: true, content: 'non deve girare' }))
        const outcome = await runTalosAgentLoop(turni, {
            complete: vi.fn(async () => ({
                text: 'ecco', finishReason: 'tool_calls', toolCalls: [chiamata('A', 'coding_edit')],
            })),
            execute,
            preflight: async () => ({
                status: 'terminal',
                outcome: { ok: false, content: 'Not run: la premessa non regge.' },
            }),
        } as never)

        expect(execute).not.toHaveBeenCalled()
        expect(outcome.suspension).toBeUndefined()
    })

    it('⛔⛔ e NON entra nel piano che la persona approva', async () => {
        const visti: string[][] = []
        await runTalosAgentLoop(turni, {
            complete: vi.fn(async () => ({
                text: 'ecco',
                finishReason: 'tool_calls',
                toolCalls: [chiamata('A', 'coding_edit'), chiamata('B', 'library_search')],
            })),
            execute: vi.fn(async () => ({ ok: true, content: 'ok' })),
            preflight: async (call: TalosToolCall) => (call.id === 'A'
                ? { status: 'terminal', outcome: { ok: false, content: 'Not run: assente.' } }
                : { status: 'ready' }),
            plan: async (calls: readonly TalosToolCall[]) => {
                visti.push(calls.map((c) => c.id))
                return { admitted: calls.map((c) => c.id), cancelled: false }
            },
        } as never)

        /*
         * ⛔ Solo i giri con qualcosa dentro: il ciclo chiama il piano anche nei
         * giri successivi a mani vuote, ed è comportamento preesistente — non va
         * confuso con ciò che questa correzione cambia. (Vale la pena guardarlo
         * a parte: un piano chiesto su zero chiamate è lavoro per niente.)
         */
        expect(visti.filter((giro) => giro.length > 0)).toEqual([['B']])
    })

    it('⭐ ma un fratello da autorizzare tiene la barriera: nessuno parte, nemmeno il terminale', async () => {
        const execute = vi.fn(async () => ({ ok: true, content: 'ok' }))
        const outcome = await runTalosAgentLoop(turni, {
            complete: vi.fn(async () => ({
                text: 'ecco',
                finishReason: 'tool_calls',
                toolCalls: [chiamata('A', 'coding_edit'), chiamata('B', 'document_create')],
            })),
            execute,
            preflight: async (call: TalosToolCall) => (call.id === 'A'
                ? { status: 'terminal', outcome: { ok: false, content: 'Not run: assente.' } }
                : { status: 'authorization_required', request: { callId: call.id } }),
        } as never)

        expect(execute).not.toHaveBeenCalled()
        expect(outcome.suspension).toBeDefined()
        // Al resume si ricalcola tutto con lo stato fresco: un terminale è il
        // risultato DI QUEL preflight, non una sentenza da persistere.
    })
})
