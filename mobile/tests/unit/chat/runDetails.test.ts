import { describe, expect, it } from 'vitest'
import { createTalosRunMeter, talosReadRunRecord, talosRunTokens } from '@/lib/chat/runDetails'

/**
 * Owner 2026-09-13 — «Dettagli esecuzione»: token e costo, tempi. I dati del giro si
 * sommano su tutti i passaggi del ciclo, e ciò che il fornitore non manda resta ASSENTE.
 */
describe('talosRunTokens', () => {
    it('legge i nomi di OpenAI/OpenRouter, Anthropic e Gemini', () => {
        expect(talosRunTokens({ prompt_tokens: 40, completion_tokens: 7, reasoning_tokens: 3, cached_tokens: 12 }))
            .toEqual({ input: 40, output: 7, reasoning: 3, cached: 12 })
        expect(talosRunTokens({ input_tokens: 30, output_tokens: 9, cache_read_input_tokens: 5 }))
            .toEqual({ input: 30, output: 9, reasoning: null, cached: 5 })
        expect(talosRunTokens({ promptTokenCount: 20, candidatesTokenCount: 5, thoughtsTokenCount: 2 }))
            .toEqual({ input: 20, output: 5, reasoning: 2, cached: null })
    })

    /** ⛔ Il verso contrario: un conteggio che non c'è non diventa zero. */
    it('un uso assente o senza un campo lascia null, non 0', () => {
        expect(talosRunTokens(null)).toEqual({ input: null, output: null, reasoning: null, cached: null })
        expect(talosRunTokens({ promptTokenCount: 20, candidatesTokenCount: 5 }).reasoning).toBeNull()
    })
})

describe('createTalosRunMeter', () => {
    const orologio = (tempi: number[]) => { let i = 0; return () => tempi[Math.min(i++, tempi.length - 1)]! }

    it('somma i passaggi, tiene il primo pezzo e la durata, e gli id senza doppioni', () => {
        // L'orologio si legge tre volte: all'avvio, al PRIMO pezzo, alla fine. Il secondo
        // `firstChunk()` esce prima di leggerlo — e' proprio cio' che lo rende innocuo.
        const meter = createTalosRunMeter({ clock: orologio([1000, 1400, 3200]), nowIso: () => '2026-09-13T22:00:00.000Z' })
        meter.firstChunk()
        meter.firstChunk() // il secondo non sposta il primo
        meter.add({ prompt_tokens: 40, completion_tokens: 7, cost: 0.00001 }, 'gen-1')
        meter.add({ prompt_tokens: 60, completion_tokens: 20, cost: 0.00002 }, 'gen-1')
        const run = meter.finish({ provider: 'openrouter', model: 'z-ai/glm-5.3-flash' })
        expect(run).toMatchObject({
            v: 1, provider: 'openrouter', model: 'z-ai/glm-5.3-flash', rounds: 2,
            tokens: { input: 100, output: 27, reasoning: null, cached: null },
            reportedCostRounds: 2, callIds: ['gen-1'], startedAt: '2026-09-13T22:00:00.000Z',
            firstChunkMs: 400, totalMs: 2200,
        })
        expect(run.reportedCostUsd).toBeCloseTo(0.00003, 10)
    })

    /** ⛔ Un costo riportato da due passaggi su tre non è il costo del giro: si vede dal conteggio. */
    it('un passaggio senza costo lascia il conteggio dei costi sotto quello dei passaggi', () => {
        const meter = createTalosRunMeter({ clock: () => 0 })
        meter.add({ prompt_tokens: 1, completion_tokens: 1, cost: 0.001 })
        meter.add({ prompt_tokens: 1, completion_tokens: 1 })
        const run = meter.finish({ provider: 'openrouter', model: 'm' })
        expect(run.rounds).toBe(2)
        expect(run.reportedCostRounds).toBe(1)
        expect(run.firstChunkMs).toBeNull()
    })
})

describe('talosReadRunRecord', () => {
    it('rilegge un run salvato e rifiuta una forma che non torna', () => {
        const run = createTalosRunMeter({ clock: () => 5 }).finish({ provider: 'local', model: 'qwen' })
        expect(talosReadRunRecord({ run })).toEqual(run)
        expect(talosReadRunRecord({ run: { ...run, v: 2 } })).toBeNull()
        expect(talosReadRunRecord({ run: { ...run, tokens: { input: -1, output: null, reasoning: null, cached: null } } })).toBeNull()
        expect(talosReadRunRecord({})).toBeNull()
    })
})
