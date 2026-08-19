import { describe, expect, it } from 'vitest'
import { conversationOf } from '@/lib/chat/providers/localAdapter'

/**
 * ⛔⛔ GEMMA-RUOLI-ALTERNATI-01 — un modello installato che NON PARTE.
 *
 * ## Misurato sul Pad il 2026-08-19
 *
 * Selezionato `gemma-3-4b-it-Q4_K_M`, domanda «Dove mi trovo adesso?». In chat,
 * al posto della risposta:
 *
 * ```
 *   Errore di esecuzione
 *   CHAT_EXECUTION_FAILED · TALOS_LLAMA_NO_CHAT_TEMPLATE
 * ```
 *
 * E nel registro del motore la ragione vera:
 *
 * ```
 *   template di chat non applicabile: Unable to generate parser for this template
 *   While executing CallExpression at line 19, column 27 in source:
 *     {{ raise_exception("Conversation roles must alternate user...
 *   Error: Jinja Exception: Conversation roles must alternate user/assistant/user/assistant/...
 * ```
 *
 * ## Perché non è colpa del modello
 *
 * Ricerca del 2026-08-19: i template della famiglia Gemma (come Mixtral e
 * Devstral) **verificano l'alternanza** e sollevano un'eccezione se due turni
 * dello stesso ruolo si toccano — «after the optional system message,
 * conversation roles must alternate user and assistant». La raccomandazione
 * upstream è una sola: **fondere i messaggi dal lato del client**.
 *
 * TALOS non lo faceva: passava la conversazione così com'era. Basta un reinvio,
 * una risposta annullata o due domande di fila perché due turni dello stesso
 * ruolo finiscano adiacenti — e il modello smette di funzionare del tutto, con
 * un codice tecnico in faccia alla persona.
 *
 * ⛔ I turni `tool` NON si fondono e non rompono l'alternanza: i template che la
 * pretendono fanno eccezione esplicita per chiamate e risultati, e il loro
 * `tool_call_id` è un'identità che non si può sommare.
 */

const RICHIESTA = {
    model: { id: 'm', provider: 'local', displayName: 'm' },
    effort: 'low',
    thinking: false,
} as never

describe('GEMMA-RUOLI-ALTERNATI-01 la conversazione arriva sempre alternata', () => {
    it('fonde due turni utente consecutivi', () => {
        const messaggi = conversationOf({
            ...RICHIESTA,
            turns: [
                { role: 'user', content: 'Dove mi trovo adesso?' },
                { role: 'user', content: 'Dimmi le coordinate' },
            ],
        } as never)

        expect(messaggi.map((m) => m.role)).toEqual(['user'])
        expect(messaggi[0]!.content).toContain('Dove mi trovo adesso?')
        expect(messaggi[0]!.content).toContain('Dimmi le coordinate')
    })

    it('fonde due risposte consecutive dell\'assistente', () => {
        const messaggi = conversationOf({
            ...RICHIESTA,
            turns: [
                { role: 'user', content: 'Ciao' },
                { role: 'assistant', content: 'Ciao!' },
                { role: 'assistant', content: 'Come posso aiutarti?' },
                { role: 'user', content: 'Bene' },
            ],
        } as never)

        expect(messaggi.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
        expect(messaggi[1]!.content).toContain('Ciao!')
        expect(messaggi[1]!.content).toContain('Come posso aiutarti?')
    })

    it('il messaggio di sistema resta in testa e non viene fuso con l\'utente', () => {
        const messaggi = conversationOf({
            ...RICHIESTA,
            system: 'Sei TALOS.',
            turns: [{ role: 'user', content: 'Ciao' }],
        } as never)

        expect(messaggi.map((m) => m.role)).toEqual(['system', 'user'])
    })

    it('⛔ NON fonde i turni tool: la loro identità non si somma', () => {
        const messaggi = conversationOf({
            ...RICHIESTA,
            turns: [
                { role: 'user', content: 'Accendi la torcia e dimmi dove sono' },
                {
                    role: 'assistant',
                    content: '',
                    toolCalls: [
                        { id: 'c1', name: 'device_torch', arguments: '{"on":true}' },
                        { id: 'c2', name: 'device_location', arguments: '{}' },
                    ],
                },
                { role: 'tool', content: 'Torch on.', toolCallId: 'c1', toolName: 'device_torch' },
                { role: 'tool', content: 'Latitude 1, longitude 2', toolCallId: 'c2', toolName: 'device_location' },
            ],
        } as never)

        expect(messaggi.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'tool'])
        expect(messaggi[2]!.tool_call_id).toBe('c1')
        expect(messaggi[3]!.tool_call_id).toBe('c2')
    })

    it('una risposta assistente con chiamate non assorbe il testo di quella dopo', () => {
        const messaggi = conversationOf({
            ...RICHIESTA,
            turns: [
                { role: 'user', content: 'Cerca' },
                { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'web_search', arguments: '{}' }] },
                { role: 'tool', content: 'due risultati', toolCallId: 'c1', toolName: 'web_search' },
                { role: 'assistant', content: 'Ecco cosa ho trovato.' },
            ],
        } as never)

        expect(messaggi.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])
    })
})
