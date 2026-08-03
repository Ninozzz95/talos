import { describe, expect, it } from 'vitest'
import { talosNormaliseLocalToolCalls } from '@/lib/chat/localToolCalls'

/**
 * Misurato sul tablet il 2026-08-03 con qwen2.5-3b: la chiamata torna corretta
 * — nome giusto, argomenti giusti — e con `id` VUOTO, perche' il formato Hermes
 * che Qwen usa non ne prevede uno.
 */
describe('le chiamate di un modello locale', () => {
    it('da un identificativo a chi non lo emette', () => {
        // Il risultato di un tool viene riappaiato alla richiesta ATTRAVERSO
        // quell'identificativo: due chiamate con id vuoto sono due risultati
        // che non si sa a chi appartengono, e il modello riceverebbe la
        // risposta sbagliata alla domanda sbagliata.
        const calls = talosNormaliseLocalToolCalls([
            { name: 'library_search', arguments: '{"query":"batteria"}', id: '' },
            { name: 'memory_search', arguments: '{"query":"talos"}' },
        ])
        expect(calls.map((call) => call.id)).toEqual(['local_0', 'local_1'])
        expect(new Set(calls.map((call) => call.id)).size).toBe(2)
    })

    it('rispetta quello che il modello ha gia dato', () => {
        const calls = talosNormaliseLocalToolCalls([
            { name: 'x', arguments: '{}', id: 'call_abc' },
        ])
        expect(calls[0]!.id).toBe('call_abc')
    })

    it('non inventa niente quando non c e niente', () => {
        expect(talosNormaliseLocalToolCalls(undefined)).toEqual([])
        expect(talosNormaliseLocalToolCalls([])).toEqual([])
    })

    it('lascia gli argomenti intatti, che sono JSON e non testo', () => {
        const calls = talosNormaliseLocalToolCalls([
            { name: 'x', arguments: '{"query": "batteria"}', id: '' },
        ])
        expect(calls[0]!.arguments).toBe('{"query": "batteria"}')
    })
})
