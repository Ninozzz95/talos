import { describe, expect, it, vi } from 'vitest'
import { runTalosAgentLoop } from '@/lib/tools/agentLoop'
import type { ChatTurn, TalosToolCall } from '@/stores/chat'

/**
 * ⛔⛔ D-LOC-1 — una chiamata tagliata dal tetto di lunghezza non si esegue, e il turno non gira all'infinito.
 *
 * Owner, 2026-10-23, Spark-X2.5-4B sul Pad: «Si genera l html usando apposito tool». Ogni giro si fermava al tetto di 1024
 * token dentro l'HTML di `artifact_create` (`producedTokens 1024` nel registro), il giro dopo ripartiva, e così per venti
 * minuti, finché il turno non è stato fermato a mano.
 *
 * - Pi (`packages/agent/src/agent-loop.ts:264-270`, :478-503): a fine per `length` NESSUNA chiamata del messaggio parte;
 *   ognuna riceve un risultato d'errore che chiede di rifarla completa.
 * - Hermes (`agent/turn_tool_validation.py:182-200`): gli argomenti troncati non si eseguono, e il turno si chiude con un
 *   messaggio onesto.
 *
 * Qui: la prima volta come Pi, alla seconda nello stesso turno come Hermes. Su un modello locale ogni giro costa minuti.
 * Ledger: `.claude/ragionamento/LEDGER-ATTREZZI-LOCALI-NO-CHAT-TEMPLATE-2026-10-23.md`, «Fondamenta 1».
 */

function call(id: string, args = '{"title":"Barnes","html":"<html><body><div class=\\"hero\\">'): TalosToolCall {
    return { id, name: 'artifact_create', arguments: args }
}

describe('D-LOC-1 la chiamata tagliata dal tetto', () => {
    it('TRONC-01 a fine per lunghezza nessuna chiamata si esegue, e ognuna riceve un risultato che chiede di rifarla', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: 'Genero il sito.', toolCalls: [call('c1'), call('c2', '{"title":"x"}')], finishReason: 'length' })
            .mockResolvedValueOnce({ text: 'Va bene, lo scrivo più corto.' })
        const execute = vi.fn(async () => ({ content: 'created', ok: true }))

        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'Si genera l html usando apposito tool' }], { complete, execute })

        expect(execute).not.toHaveBeenCalled()
        const secondi = complete.mock.calls[1]![0] as ChatTurn[]
        const risultati = secondi.filter((turno) => turno.role === 'tool')
        expect(risultati.map((turno) => turno.toolCallId)).toEqual(['c1', 'c2'])
        for (const risultato of risultati) {
            expect(risultato.content).toMatch(/not (been )?(run|executed)/i)
            expect(risultato.content).toMatch(/output (token )?limit/i)
        }
        expect(outcome.executed).toEqual([])
        expect(outcome.chiamataTroncata).toBeFalsy()
    })

    it('TRONC-02 al secondo taglio nello stesso turno il ciclo si ferma, senza un altro giro del modello', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: 'Genero il sito.', toolCalls: [call('c1')], finishReason: 'length' })
            .mockResolvedValueOnce({ text: 'Riprovo.', toolCalls: [call('c2')], finishReason: 'length' })
            .mockResolvedValueOnce({ text: 'non dovrebbe arrivare' })
        const execute = vi.fn(async () => ({ content: 'created', ok: true }))

        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'Si genera l html usando apposito tool' }], { complete, execute })

        expect(complete).toHaveBeenCalledTimes(2)
        expect(execute).not.toHaveBeenCalled()
        expect(outcome.chiamataTroncata).toBe(true)
        expect(outcome.text).not.toContain('non dovrebbe arrivare')
        // Il testo che la persona ha già visto scorrere resta: si aggiunge il fatto, non si cancella il modello.
        expect(outcome.text).toContain('Genero il sito.')
        expect(outcome.text).toContain('Riprovo.')
    })

    it('TRONC-03 una risposta finita con chiamate le esegue come prima', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [call('c1', '{"title":"Barnes","html":"<b>ok</b>"}')], finishReason: 'tool_calls' })
            .mockResolvedValueOnce({ text: 'Fatto.' })
        const execute = vi.fn(async () => ({ content: 'created', ok: true }))

        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'crea' }], { complete, execute })

        expect(execute).toHaveBeenCalledTimes(1)
        expect(outcome.chiamataTroncata).toBeFalsy()
    })

    it('TRONC-04 vale per ogni nome dello stesso fatto: max_tokens di Anthropic e MAX_TOKENS di Gemini', async () => {
        for (const motivo of ['max_tokens', 'MAX_TOKENS']) {
            const complete = vi.fn()
                .mockResolvedValueOnce({ text: '', toolCalls: [call('c1')], finishReason: motivo })
                .mockResolvedValueOnce({ text: 'ok' })
            const execute = vi.fn(async () => ({ content: 'created', ok: true }))
            await runTalosAgentLoop([{ role: 'user', content: 'crea' }], { complete, execute })
            expect(execute).not.toHaveBeenCalled()
        }
    })
})
