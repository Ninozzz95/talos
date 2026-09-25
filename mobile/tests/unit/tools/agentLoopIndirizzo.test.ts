import { describe, expect, it, vi } from 'vitest'
import { runTalosAgentLoop } from '@/lib/tools/agentLoop'
import type { TalosToolCall } from '@/stores/chat'

/**
 * ⭐ B3 «Indirizza» con attrezzi (D-B3-02) — il punto sicuro è dopo i risultati degli attrezzi e prima della chiamata
 * successiva al modello (`agentLoop.ts`, `state.turns = [...]` → `persistBeforeModel` → `deps.complete`). Lì, se la
 * persona ha chiesto di indirizzare, il ciclo si chiude PULITO: nessun attrezzo rieseguito, nessuna chiamata a metà,
 * il lavoro fatto resta. Poi la voce parte come turno nuovo (Codex `turn/steer`, Hermes #12116, LibreChat #14220).
 */
function call(id: string, name = 'library_search', args = '{"query":"x"}'): TalosToolCall {
    return { id, name, arguments: args }
}

describe('agent loop — chiusura al punto sicuro per un indirizzo', () => {
    it('LOOP-STEER-01 richiesto dopo il primo giro: niente seconda chiamata al modello, il lavoro fatto resta', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: 'Cerco nella Libreria.', toolCalls: [call('c1')] })
            .mockResolvedValueOnce({ text: 'non deve arrivare' })
        const execute = vi.fn(async () => ({ content: 'trovato', ok: true }))
        const onBeforeModelCheckpoint = vi.fn()
        const chiudiAlPuntoSicuro = vi.fn(() => true)
        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'cerca' }], {
            complete, execute, onBeforeModelCheckpoint, chiudiAlPuntoSicuro,
        })
        expect(complete).toHaveBeenCalledTimes(1)
        expect(execute).toHaveBeenCalledTimes(1)
        expect(onBeforeModelCheckpoint).not.toHaveBeenCalled()
        expect(outcome).toMatchObject({
            text: 'Cerco nella Libreria.',
            executed: [{ call: call('c1'), ok: true }],
            rounds: 1,
            stoppedByLimit: false,
            chiusoPerIndirizzo: true,
        })
        expect(outcome.toolCalls ?? []).toEqual([])
    })

    it('LOOP-STEER-02 al contrario: senza richiesta il ciclo va avanti come sempre', async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [call('c1')] })
            .mockResolvedValueOnce({ text: 'Risposta finale.' })
        const execute = vi.fn(async () => ({ content: 'trovato', ok: true }))
        const chiudiAlPuntoSicuro = vi.fn(() => false)
        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'cerca' }], { complete, execute, chiudiAlPuntoSicuro })
        expect(complete).toHaveBeenCalledTimes(2)
        expect(chiudiAlPuntoSicuro).toHaveBeenCalledTimes(1)
        expect(outcome.text).toBe('Risposta finale.')
        expect(outcome.chiusoPerIndirizzo).toBeFalsy()
    })

    it('LOOP-STEER-03 al contrario: una risposta senza attrezzi non chiede mai il punto sicuro', async () => {
        const complete = vi.fn(async () => ({ text: 'Subito.' }))
        const chiudiAlPuntoSicuro = vi.fn(() => true)
        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'ciao' }], {
            complete, execute: vi.fn(), chiudiAlPuntoSicuro,
        })
        expect(chiudiAlPuntoSicuro).not.toHaveBeenCalled()
        expect(outcome.text).toBe('Subito.')
    })
})
