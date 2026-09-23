import { describe, expect, it } from 'vitest'
import { talosOpenRouterCandidates, talosResolveRunCost, type TalosModelPrice } from '@/lib/chat/runCost'
import type { TalosRunRecord } from '@/lib/chat/runDetails'

/**
 * Owner 2026-09-13 — il costo in «Dettagli esecuzione»: vero da OpenRouter, gratis in
 * locale, stima marcata per i diretti col listino OpenRouter, «non comunicato» altrimenti.
 */
function run(overrides: Partial<TalosRunRecord>): TalosRunRecord {
    return {
        v: 1, provider: 'openrouter', model: 'z-ai/glm-5.3-flash', rounds: 1,
        tokens: { input: 1000, output: 200, reasoning: null, cached: null },
        reportedCostUsd: null, reportedCostRounds: 0, callIds: [],
        startedAt: '2026-09-13T22:00:00.000Z', firstChunkMs: 300, totalMs: 2000,
        ...overrides,
    }
}
const listino = (voci: Record<string, TalosModelPrice>) => ({ date: '2026-09-13', prices: new Map(Object.entries(voci)) })

describe('talosOpenRouterCandidates', () => {
    it('Anthropic: prefisso, versione col punto e data tolta', () => {
        expect(talosOpenRouterCandidates('anthropic', 'claude-fable-5-1')).toContain('anthropic/claude-fable-5.1')
        expect(talosOpenRouterCandidates('anthropic', 'claude-haiku-4-5-20251001')).toContain('anthropic/claude-haiku-4.5')
    })
    it('Gemini diventa google/, OpenRouter resta com\'e\', un fornitore sconosciuto non cerca niente', () => {
        expect(talosOpenRouterCandidates('gemini', 'gemini-3.8-flash')).toEqual(['google/gemini-3.8-flash'])
        expect(talosOpenRouterCandidates('openrouter', 'z-ai/glm-5.3-flash')).toEqual(['z-ai/glm-5.3-flash'])
        expect(talosOpenRouterCandidates('ollama', 'llama3')).toEqual([])
    })
})

describe('talosResolveRunCost', () => {
    it('OpenRouter con il costo di OGNI passaggio: vero', () => {
        expect(talosResolveRunCost(run({ rounds: 2, reportedCostUsd: 0.0004, reportedCostRounds: 2 }), null))
            .toEqual({ kind: 'real', usd: 0.0004 })
    })

    /** ⛔ Un costo di due passaggi su tre non è il costo del giro: non si mostra come vero. */
    it('OpenRouter con un passaggio senza costo e senza listino: non comunicato', () => {
        expect(talosResolveRunCost(run({ rounds: 3, reportedCostUsd: 0.0004, reportedCostRounds: 2 }), null))
            .toEqual({ kind: 'unknown' })
    })

    it('il motore locale: gratis', () => {
        expect(talosResolveRunCost(run({ provider: 'local', model: 'qwen' }), null)).toEqual({ kind: 'free' })
    })

    it('fornitore diretto col prezzo nel listino: stima, con la data del listino', () => {
        const cost = talosResolveRunCost(
            run({ provider: 'anthropic', model: 'claude-fable-5-1', tokens: { input: 1000, output: 200, reasoning: null, cached: null } }),
            listino({ 'anthropic/claude-fable-5.1': { prompt: 0.00001, completion: 0.00005, cacheRead: 0.00000025 } }),
        )
        expect(cost.kind).toBe('estimate')
        expect(cost.kind === 'estimate' && cost.usd).toBeCloseTo(1000 * 0.00001 + 200 * 0.00005, 12)
        expect(cost.kind === 'estimate' && cost.priceListDate).toBe('2026-09-13')
    })

    it('la cache: dentro l\'input per OpenAI/Gemini, fuori per Anthropic', () => {
        const prezzi = { prompt: 0.000001, completion: 0.000002, cacheRead: 0.0000001 }
        const gemini = talosResolveRunCost(run({ provider: 'gemini', model: 'gemini-3.8-flash', tokens: { input: 1000, output: 0, reasoning: null, cached: 400 } }),
            listino({ 'google/gemini-3.8-flash': prezzi }))
        expect(gemini.kind === 'estimate' && gemini.usd).toBeCloseTo(600 * 0.000001 + 400 * 0.0000001, 12)
        const anthropic = talosResolveRunCost(run({ provider: 'anthropic', model: 'claude-fable-5-1', tokens: { input: 1000, output: 0, reasoning: null, cached: 400 } }),
            listino({ 'anthropic/claude-fable-5.1': prezzi }))
        expect(anthropic.kind === 'estimate' && anthropic.usd).toBeCloseTo(1000 * 0.000001 + 400 * 0.0000001, 12)
    })

    /** ⛔ Il verso contrario: un modello che il listino non ha non prende il prezzo di un altro. */
    it('modello assente dal listino, token mancanti o listino assente: non comunicato', () => {
        const altro = listino({ 'anthropic/claude-opus-5': { prompt: 1, completion: 1, cacheRead: null } })
        expect(talosResolveRunCost(run({ provider: 'anthropic', model: 'claude-fable-5-1' }), altro)).toEqual({ kind: 'unknown' })
        expect(talosResolveRunCost(run({ provider: 'anthropic', model: 'claude-opus-5', tokens: { input: null, output: 10, reasoning: null, cached: null } }), altro))
            .toEqual({ kind: 'unknown' })
        expect(talosResolveRunCost(run({ provider: 'openai', model: 'gpt-5' }), null)).toEqual({ kind: 'unknown' })
    })
})
