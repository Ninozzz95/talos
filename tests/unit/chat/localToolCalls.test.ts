import { describe, expect, it } from 'vitest'
import { talosNormaliseLocalToolCalls, talosRecuperaChiamateNude } from '@/lib/chat/localToolCalls'

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

/**
 * ⛔ RIPRODOTTO SUL PAD tre volte il 2026-08-09, Qwen3-1.7B, chat nuova.
 *
 * A «accendi la torcia» TALOS rispondeva in chat, testuale:
 * `{"name": "device_torch", "arguments": {"on": true}}` — l'oggetto nudo, senza
 * il tag `<tool_call>`. Nessuna scheda di consenso, nessuna esecuzione, torcia
 * spenta. Con Claude Sonnet 5 la stessa frase faceva comparire la scheda in
 * OTTO secondi: la divergenza fra i due motori era esattamente questa.
 */
describe('la chiamata che il modello locale scrive a parole', () => {
    const OFFERTI = new Set([
        'device_torch', 'library_search', 'tool_details',
        'library_list', 'notes_list', 'tasks_list',
    ])

    it('promuove l oggetto nudo, ESATTAMENTE quello visto sul Pad', () => {
        const esito = talosRecuperaChiamateNude(
            '{"name": "device_torch", "arguments": {"on": true}}',
            OFFERTI,
        )
        // L'esito che conta non e' «ha analizzato»: e' che a valle arrivi una
        // CHIAMATA, con lo stesso nome e gli stessi argomenti che il modello
        // voleva — ed e' quella che poi passa dal cancello dei permessi.
        expect(esito.calls).toEqual([
            { name: 'device_torch', arguments: '{"on":true}' },
        ])
        // E che il JSON non resti anche a schermo: sarebbe la stessa risposta
        // assurda di prima, con in piu' l'azione.
        expect(esito.text).toBe('')
    })

    it('la prende anche in mezzo alla prosa, e lascia la prosa', () => {
        const esito = talosRecuperaChiamateNude(
            'Va bene, accendo. {"name": "device_torch", "arguments": {"on": true}} Fatto.',
            OFFERTI,
        )
        expect(esito.calls).toHaveLength(1)
        expect(esito.text).toBe('Va bene, accendo.  Fatto.'.trim())
    })

    it('⛔ NON promuove uno strumento che non abbiamo offerto', () => {
        // Il cancello e' il nome, non la forma. Un oggetto che nomina qualcosa
        // che non e' sul tavolo resta prosa, e resta VISIBILE.
        const esito = talosRecuperaChiamateNude(
            '{"name": "device_wipe", "arguments": {"tutto": true}}',
            OFFERTI,
        )
        expect(esito.calls).toEqual([])
        expect(esito.text).toContain('device_wipe')
    })

    it('⛔ non tocca niente quando il parser aveva gia trovato la chiamata', () => {
        // Il chiamante passa di qui solo con zero chiamate; ma se il testo non
        // contiene nessun candidato, la risposta deve tornare IDENTICA — anche
        // la spaziatura, perche' e' cio' che finisce nel database.
        const prosa = '  Ho acceso la torcia.  '
        expect(talosRecuperaChiamateNude(prosa, OFFERTI)).toEqual({ calls: [], text: prosa })
    })

    it('regge una graffa dentro una stringa, che e il caso dei messaggi', () => {
        // Contare le graffe senza attraversare le stringhe troncherebbe
        // l'oggetto a meta' proprio sulle chiamate piu' interessanti: il corpo
        // di un messaggio, il titolo di una nota.
        const esito = talosRecuperaChiamateNude(
            '{"name": "library_search", "arguments": {"query": "una } dentro"}}',
            OFFERTI,
        )
        expect(esito.calls).toEqual([
            { name: 'library_search', arguments: '{"query":"una } dentro"}' },
        ])
    })

    it('accetta `parameters`, che e la parola di altri template locali', () => {
        const esito = talosRecuperaChiamateNude(
            '{"name": "device_torch", "parameters": {"on": false}}',
            OFFERTI,
        )
        expect(esito.calls).toEqual([
            { name: 'device_torch', arguments: '{"on":false}' },
        ])
    })

    it('⛔ scarta un oggetto ricco: sono dati, non una chiamata', () => {
        const esito = talosRecuperaChiamateNude(
            '{"name": "device_torch", "arguments": {}, "id": "x", "extra": 1, "altro": 2}',
            OFFERTI,
        )
        expect(esito.calls).toEqual([])
    })

    it('⛔ senza strumenti offerti non promuove NIENTE', () => {
        const testo = '{"name": "device_torch", "arguments": {"on": true}}'
        expect(talosRecuperaChiamateNude(testo, new Set())).toEqual({ calls: [], text: testo })
    })

    it('prende due chiamate nello stesso testo', () => {
        const esito = talosRecuperaChiamateNude(
            '{"name":"device_torch","arguments":{"on":true}}\n{"name":"library_search","arguments":{"query":"x"}}',
            OFFERTI,
        )
        expect(esito.calls.map((call) => call.name))
            .toEqual(['device_torch', 'library_search'])
    })

    it('promuove la riga tool_details che i modelli piccoli emettono senza JSON', () => {
        const esito = talosRecuperaChiamateNude(
            'tool_details: library_list, notes_list, tasks_list',
            OFFERTI,
        )
        expect(esito.calls).toEqual([
            {
                name: 'tool_details',
                arguments: '{"names":["library_list","notes_list","tasks_list"]}',
            },
        ])
        expect(esito.text).toBe('')
    })

    it('non promuove la riga se contiene uno strumento non offerto', () => {
        const esito = talosRecuperaChiamateNude(
            'tool_details: library_list, secret_tool',
            OFFERTI,
        )
        expect(esito.calls).toEqual([])
        expect(esito.text).toContain('tool_details')
    })
})
