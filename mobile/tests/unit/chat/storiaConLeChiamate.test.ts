import { describe, expect, it } from 'vitest'
import type { ChatTurn } from '@/stores/chat'
import {
    TALOS_ESITO_NON_CONSERVATO,
    talosChiamateSalvate,
    talosStoriaConLeChiamate,
} from '@/lib/chat/storiaConLeChiamate'

/**
 * Il difetto vero, misurato sul Pad il 2026-08-13: dopo un invio WhatsApp
 * riuscito, TALOS diceva «Messaggio inviato ad Antonino Rizzo» **senza chiamare
 * niente** — perché la sua risposta riuscita gli tornava indietro come puro
 * testo. Tre volte di fila, dalla chat e dalla barra.
 */
const CHIAMATA = { id: 'toolu_01', name: 'app_azione', arguments: '{"app":"whatsapp"}' }

describe('talosChiamateSalvate', () => {
    it('rende le chiamate salvate nei metadati', () => {
        expect(talosChiamateSalvate({ tool_calls: [CHIAMATA] })).toEqual([CHIAMATA])
    })

    it('rende vuoto quando non c’è niente da rendere', () => {
        expect(talosChiamateSalvate(undefined)).toEqual([])
        expect(talosChiamateSalvate({})).toEqual([])
        expect(talosChiamateSalvate({ tool_calls: 'app_azione' })).toEqual([])
        expect(talosChiamateSalvate({ tool_calls: [] })).toEqual([])
    })

    /*
     * ⛔ TUTTO O NIENTE. Una chiamata senza `id` diventerebbe un `tool_result`
     * orfano, cioè un 400 al primo messaggio dopo — su una sessione che la
     * persona aveva già. Il caso arriva dai backup e dalle importazioni, dove
     * `metadata` è un sacco aperto.
     */
    /*
     * ⛔⛔ LA SECONDA FORMA, e senza di lei la cura non curava NIENTE.
     *
     * Misurato sul Pad: con la sola prima forma il tool continuava a non
     * partire. Causa: `tool_calls` è l'ULTIMA risposta del modello, e dopo un
     * giro dell'agente riuscito è vuota — cioè proprio i turni che AGISCONO,
     * quelli che insegnavano a mentire, non lasciavano traccia lì.
     */
    it('legge le chiamate AVVENUTE, che è il caso di un giro riuscito', () => {
        expect(talosChiamateSalvate({
            tool_calls_done: [{ name: 'app_azione', arguments: '{"app":"whatsapp"}' }],
        }, 'm7')).toEqual([
            { id: 'm7-0', name: 'app_azione', arguments: '{"app":"whatsapp"}' },
        ])
    })

    it('conia id DIVERSI per messaggi diversi, o la richiesta è invalida', () => {
        const uno = talosChiamateSalvate({ tool_calls_done: [{ name: 'a', arguments: '{}' }] }, 'm1')
        const due = talosChiamateSalvate({ tool_calls_done: [{ name: 'a', arguments: '{}' }] }, 'm2')
        expect(uno[0]!.id).not.toBe(due[0]!.id)
    })

    /*
     * ⛔ LA TERZA FORMA: le conversazioni che la persona AVEVA GIÀ. Senza,
     * una sessione già avvelenata resterebbe avvelenata per sempre.
     */
    it('ricade su `actions_done` per le sessioni scritte prima della cura', () => {
        expect(talosChiamateSalvate({ actions_done: [{ tool: 'app_azione' }] }, 'm3')).toEqual([
            { id: 'm3-a0', name: 'app_azione', arguments: '{}' },
        ])
    })

    it('preferisce la forma più ricca quando ci sono entrambe', () => {
        const chiamate = talosChiamateSalvate({
            tool_calls_done: [{ name: 'app_azione', arguments: '{"testo":"ciao"}' }],
            actions_done: [{ tool: 'app_azione' }],
        }, 'm4')
        expect(chiamate).toHaveLength(1)
        expect(chiamate[0]!.arguments).toBe('{"testo":"ciao"}')
    })

    it('scarta TUTTE le chiamate se anche una sola è malformata', () => {
        expect(talosChiamateSalvate({ tool_calls: [CHIAMATA, { name: 'x', arguments: '{}' }] }))
            .toEqual([])
        expect(talosChiamateSalvate({ tool_calls: [CHIAMATA, { id: '', name: 'x', arguments: '{}' }] }))
            .toEqual([])
        expect(talosChiamateSalvate({ tool_calls: [{ id: 'a', name: 'b', arguments: 42 }] }))
            .toEqual([])
    })
})

describe('talosStoriaConLeChiamate', () => {
    /*
     * ⛔ È QUESTO il test che morde: senza la cura, la storia che il modello
     * riceve contiene la frase «Messaggio inviato» e NESSUNA chiamata — ed è
     * esattamente ciò che gli insegnava a rispondere con una frase.
     */
    it('infila il risultato SUBITO dopo l’assistente che ha chiamato', () => {
        const storia: ChatTurn[] = [
            { role: 'user', content: 'manda un whatsapp ad Antonino Rizzo che dice occhio aperto' },
            { role: 'assistant', content: 'Messaggio inviato.', toolCalls: [CHIAMATA] },
            { role: 'user', content: 'manda un whatsapp ad Antonino Rizzo che dice occhio spento' },
        ]
        const esito = talosStoriaConLeChiamate(storia)
        expect(esito.map((turno) => turno.role)).toEqual(['user', 'assistant', 'tool', 'user'])
        expect(esito[2]).toEqual({
            role: 'tool',
            content: TALOS_ESITO_NON_CONSERVATO,
            toolCallId: 'toolu_01',
            toolName: 'app_azione',
        })
    })

    it('rende un risultato PER OGNI chiamata, nell’ordine del modello', () => {
        const due = [CHIAMATA, { id: 'toolu_02', name: 'device_torch', arguments: '{}' }]
        const esito = talosStoriaConLeChiamate([
            { role: 'assistant', content: 'Fatto.', toolCalls: due },
        ])
        expect(esito.map((turno) => turno.toolCallId)).toEqual([undefined, 'toolu_01', 'toolu_02'])
    })

    it('non tocca una storia senza chiamate', () => {
        const storia: ChatTurn[] = [
            { role: 'user', content: 'ciao' },
            { role: 'assistant', content: 'ciao a te' },
        ]
        expect(talosStoriaConLeChiamate(storia)).toEqual(storia)
    })

    /*
     * ⛔ L'esito segnaposto deve dire di RICHIAMARE. Senza quella riga,
     * «risultato non conservato» è un invito a inventare — cioè il difetto di
     * partenza con un'altra faccia.
     */
    it('l’esito segnaposto dice di richiamare, non di ricordare', () => {
        expect(TALOS_ESITO_NON_CONSERVATO).toMatch(/call the tool again/i)
        expect(TALOS_ESITO_NON_CONSERVATO).toMatch(/do not restate or invent/i)
    })
})
