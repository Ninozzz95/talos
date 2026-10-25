import { describe, expect, it, vi } from 'vitest'
import { runTalosAgentLoop } from '@/lib/tools/agentLoop'
import type { TalosToolCall } from '@/stores/chat'

/**
 * ⛔⛔ RIP-01..03 — fondamenta 4 (owner 2026-10-23, «fondamenta prima»): la guardia contro le chiamate ripetute.
 *
 * Una chiamata identica a una già fatta non riparte (`agentLoop.ts`, «Already done in this message…»). Su un modello locale
 * ogni giro costa minuti, quindi un modello che insiste non deve poter consumare i giri: la guardia va tenuta.
 *
 * Hermes (`agent/tool_guardrails.py:30-48`, :270-300): avviso alla terza chiamata identica, stop dopo qualche giro senza
 * progresso (`no_progress_block_after = 5`, pensato per i server). TALOS ce l'ha GIÀ, e più stretta, dal 2026-08-09
 * («IL GIRO A VUOTO», `agentLoop.ts`): il primo giro fatto SOLO di ripetizioni toglie gli strumenti al giro dopo, e il
 * modello può soltanto rispondere. Questi test la CARATTERIZZANO (regola dell'owner: ciò che funziona è un contratto); il
 * giro infinito visto dal vivo veniva dai tagli al tetto, curati dalla fondamenta 1.
 */

const cerca: TalosToolCall = { id: 'c1', name: 'library_search', arguments: '{"query":"fattura"}' }
const uguale = (id: string): TalosToolCall => ({ ...cerca, id, arguments: '{ "query": "fattura" }' })

describe('RIP la guardia contro le chiamate ripetute', () => {
    it('RIP-01 al primo giro di sole ripetizioni il giro dopo è senza strumenti, e il modello risponde', async () => {
        const complete = vi.fn(async (_turns: unknown, opzioni?: { senzaStrumenti?: boolean }) => (
            opzioni?.senzaStrumenti
                ? { text: 'La fattura è di 2196 euro.' }
                : { text: '', toolCalls: [uguale(`c${complete.mock.calls.length}`)] }
        ))
        const execute = vi.fn(async () => ({ content: 'found: fattura 2196', ok: true }))

        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'quanto devo?' }], { complete, execute })

        expect(execute).toHaveBeenCalledTimes(1)
        // il primo giro, la ripetizione (rifiutata), la risposta senza strumenti: mai un quarto giro
        expect(complete).toHaveBeenCalledTimes(3)
        expect(complete.mock.calls.at(-1)?.[1]).toEqual({ senzaStrumenti: true })
        expect(outcome.text).toContain('2196')
    })

    it('RIP-02 la ripetizione non riparte: riceve «Already done… Use the earlier result»', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [cerca] })
            .mockResolvedValueOnce({ text: '', toolCalls: [uguale('c2')] })
            .mockResolvedValueOnce({ text: 'La fattura è di 2196 euro.' })
        const execute = vi.fn(async () => ({ content: 'found: fattura 2196', ok: true }))

        await runTalosAgentLoop([{ role: 'user', content: 'quanto devo?' }], { complete, execute })

        expect(execute).toHaveBeenCalledTimes(1)
        const ultimi = complete.mock.calls[2]![0] as Array<{ role: string, toolCallId?: string, content?: string }>
        expect(ultimi.find((t) => t.role === 'tool' && t.toolCallId === 'c2')?.content).toMatch(/Already done/)
    })

    it('RIP-03 un giro con una chiamata NUOVA accanto alla ripetizione non conta come giro senza progresso', async () => {
        const nuova = (id: string, q: string): TalosToolCall => ({ id, name: 'library_search', arguments: JSON.stringify({ query: q }) })
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [cerca] })
            .mockResolvedValueOnce({ text: '', toolCalls: [uguale('c2'), nuova('c3', 'contratto')] })
            .mockResolvedValueOnce({ text: '', toolCalls: [uguale('c4'), nuova('c5', 'bolletta')] })
            .mockResolvedValueOnce({ text: 'Ecco tutto.' })
        const execute = vi.fn(async () => ({ content: 'found', ok: true }))

        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'cerca' }], { complete, execute })

        expect(execute).toHaveBeenCalledTimes(3)
        expect(outcome.text).toBe('Ecco tutto.')
        expect(outcome.stoppedByLimit).toBe(false)
    })
})
