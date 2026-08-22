import { describe, expect, it, vi } from 'vitest'
import { runTalosAgentLoop } from '@/lib/tools/agentLoop'
import type { TalosToolCall } from '@/stores/chat'

/**
 * ⭐⭐⭐ I BLOCCHI DEL FORNITORE DEVONO SOPRAVVIVERE A TUTTI I GIRI.
 *
 * La ricerca degli attrezzi lato server di Anthropic produce `server_tool_use`
 * e `tool_search_tool_result`, e la documentazione li pretende indietro
 * **immutati**. Ma accadono al PRIMO giro — è così che il modello scopre quale
 * strumento gli serve — e all'ultimo non ci sono più.
 *
 * ⛔ `outcomeOf` fa lo spread dell'ULTIMA completion. Per ogni altro campo va
 * bene; per questi voleva dire perderli sempre, perché quando la corsa finisce
 * la ricerca è avvenuta due giri prima. Il typecheck non poteva vederlo: un
 * campo opzionale non copiato resta `undefined` ed è perfettamente valido.
 *
 * ⇒ Questi test seguono il dato, non i tipi.
 */
function call(id: string, name = 'torch', args = '{"on":true}'): TalosToolCall {
    return { id, name, arguments: args }
}

const cerca = { type: 'server_tool_use', id: 'srv_1', name: 'tool_search_tool_bm25', input: { q: 'torcia' } }
const esito = { type: 'tool_search_tool_result', tool_use_id: 'srv_1', content: [] }

describe('i blocchi del fornitore attraverso i giri', () => {
    it('⛔ nascono al PRIMO giro e arrivano in fondo, anche se l ultimo non ne ha', async () => {
        const complete = vi.fn()
            // Giro 1: il modello cerca lo strumento e poi lo chiama.
            .mockResolvedValueOnce({ text: '', toolCalls: [call('c1')], providerBlocks: [cerca, esito] })
            // Giro 2: risponde, e qui di blocchi non ce n'è più.
            .mockResolvedValueOnce({ text: 'Accesa.' })
        const execute = vi.fn(async () => ({ content: 'ok', ok: true }))

        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'accendi la torcia' }], { complete, execute })

        expect(outcome.text).toBe('Accesa.')
        // ⛔ L'atteso è scritto a mano: i due blocchi del primo giro, in ordine.
        expect(outcome.providerBlocks).toEqual([cerca, esito])
    })

    it('li ACCUMULA quando più giri ne producono, nell ordine in cui sono arrivati', async () => {
        const secondaCerca = { type: 'server_tool_use', id: 'srv_2', name: 'tool_search_tool_bm25', input: { q: 'wifi' } }
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [call('c1')], providerBlocks: [cerca] })
            .mockResolvedValueOnce({ text: '', toolCalls: [call('c2', 'wifi')], providerBlocks: [secondaCerca] })
            .mockResolvedValueOnce({ text: 'Fatto tutto.' })
        const execute = vi.fn(async () => ({ content: 'ok', ok: true }))

        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'torcia e wifi' }], { complete, execute })

        expect(outcome.providerBlocks).toEqual([cerca, secondaCerca])
    })

    it('⛔ AL CONTRARIO: se nessun giro ne produce, l esito NON porta un elenco vuoto', async () => {
        /*
         * Un `[]` sembra innocuo e non lo è: viene salvato nei metadati del
         * messaggio, riletto domani, e da lì in poi ogni chat porta un campo
         * che non dice niente. «Assente» e «vuoto» devono restare due cose
         * diverse, come per ogni altro dato di questo progetto.
         */
        const complete = vi.fn()
            .mockResolvedValueOnce({ text: '', toolCalls: [call('c1')] })
            .mockResolvedValueOnce({ text: 'Accesa.' })
        const execute = vi.fn(async () => ({ content: 'ok', ok: true }))

        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'accendi' }], { complete, execute })

        expect(outcome.providerBlocks).toBeUndefined()
    })

    it('⛔ e senza nessuna chiamata, una risposta secca resta pulita', async () => {
        const complete = vi.fn(async () => ({ text: 'Sono le 9.' }))
        const execute = vi.fn(async () => ({ content: '', ok: true }))
        const outcome = await runTalosAgentLoop([{ role: 'user', content: 'che ore sono' }], { complete, execute })
        expect(outcome.providerBlocks).toBeUndefined()
        expect(execute).not.toHaveBeenCalled()
    })
})
