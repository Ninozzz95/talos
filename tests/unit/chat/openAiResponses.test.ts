import { describe, expect, it } from 'vitest'
import {
    talosOpenAiResponsesUsage,
    talosReadOpenAiResponse,
    talosReadOpenAiResponsesEvent,
} from '@/lib/chat/providers/openAiResponses'
import { talosToolsForOpenAiResponses } from '@/lib/tools/registry'
import { z } from 'zod'

/**
 * Le fixture sono RISPOSTE VERE, catturate interrogando l'API il 2026-08-03 con
 * la chiave dell'owner: la pagina delle docs rifiuta il fetch, quindi la fonte
 * e' stata l'endpoint stesso. Non sono inventate a somiglianza.
 */
const CHIAMATA = {
    id: 'fc_01cc32a849a67ad7016a70f40ee3b4819da5ff1ba19b932373',
    type: 'function_call',
    status: 'completed',
    arguments: '{"query":"batteria"}',
    call_id: 'call_BkUldrkRYHv7jKDgiDDsmT26',
    name: 'library_search',
}

const RAGIONAMENTO = {
    id: 'rs_01cc32a849a67ad7016a70f40e8b0c819da1ea844e8eeadb6a',
    type: 'reasoning',
    content: [],
    encrypted_content: 'gAAAAABqcPQPu7H85ZWhqHqqAOR8Miyoq',
}

const MESSAGGIO = {
    id: 'msg_011c5f40f8c92c13016a70f43bd2fc8191984189cd253dd7a0',
    type: 'message',
    status: 'completed',
    role: 'assistant',
    phase: 'final_answer',
    content: [{ type: 'output_text', annotations: [], logprobs: [], text: 'Il cielo è azzurro.' }],
}

describe('leggere output[], che e un array eterogeneo', () => {
    it('trova il testo DUE livelli sotto, non in choices[0]', () => {
        // `output[] → content[] → text`. La scorciatoia `output_text` nel JSON
        // grezzo non esiste: verificato sull'API, non supposto.
        const letta = talosReadOpenAiResponse({ output: [RAGIONAMENTO, MESSAGGIO], status: 'completed' })
        expect(letta.text).toBe('Il cielo è azzurro.')
        expect(letta.status).toBe('completed')
    })

    it('non tratta output[0] come se fosse il messaggio', () => {
        // Il primo elemento e' il ragionamento, non la risposta. Un lettore che
        // legge `output[0]` mostrerebbe una stringa cifrata all'utente.
        const letta = talosReadOpenAiResponse({ output: [RAGIONAMENTO] })
        expect(letta.text).toBe('')
    })

    it('prende call_id e NON id', () => {
        /**
         * L'elemento ne porta due: `id` vale `fc_…`, `call_id` vale `call_…`.
         * Il risultato del tool si riappaia alla richiesta attraverso il
         * secondo. Sbagliarlo non da' un errore — da' una conversazione in cui
         * il modello riceve la risposta giusta alla domanda sbagliata.
         */
        const letta = talosReadOpenAiResponse({ output: [RAGIONAMENTO, CHIAMATA] })
        expect(letta.toolCalls).toHaveLength(1)
        expect(letta.toolCalls[0]!.id).toBe('call_BkUldrkRYHv7jKDgiDDsmT26')
        expect(letta.toolCalls[0]!.id).not.toBe(CHIAMATA.id)
        expect(letta.toolCalls[0]!.arguments).toBe('{"query":"batteria"}')
    })

    it('CONSERVA ogni elemento per il giro dopo, cifrato compreso', () => {
        /**
         * Con `store:false` la conversazione la ricostruiamo noi a ogni
         * richiesta, e gli elementi `reasoning` portano un `encrypted_content`
         * opaco che va rimandato IDENTICO. Scartarli toglie al modello il
         * contesto del proprio ragionamento fra un turno e l'altro del ciclo
         * dei tool — un guasto che si vede solo alla seconda chiamata.
         */
        const output = [RAGIONAMENTO, CHIAMATA]
        const letta = talosReadOpenAiResponse({ output })
        expect(letta.replayItems).toEqual(output)
        expect(letta.replayItems[0]).toBe(RAGIONAMENTO)
    })

    it('legge il riepilogo del ragionamento quando c e', () => {
        // `reasoning.summary:"auto"` produce un riassunto leggibile. NON e' la
        // catena di pensiero: quella resta cifrata.
        const letta = talosReadOpenAiResponse({
            output: [{ ...RAGIONAMENTO, summary: [{ type: 'summary_text', text: 'Ho cercato in Libreria.' }] }],
        })
        expect(letta.reasoningSummaries).toEqual(['Ho cercato in Libreria.'])
    })

    it('non si rompe su un corpo che non ha output', () => {
        for (const body of [null, {}, { output: 'non un array' }]) {
            const letta = talosReadOpenAiResponse(body)
            expect(letta.text).toBe('')
            expect(letta.toolCalls).toEqual([])
        }
    })
})

describe('l uso, che qui si chiama in un altro modo', () => {
    it('rimappa i nomi, altrimenti la ricevuta direbbe zero', () => {
        const usage = talosOpenAiResponsesUsage({
            input_tokens: 73,
            output_tokens: 42,
            output_tokens_details: { reasoning_tokens: 20 },
            total_tokens: 115,
        })
        expect(usage).toEqual({
            prompt_tokens: 73, completion_tokens: 42, total_tokens: 115, reasoning_tokens: 20,
        })
    })

    it('dice null quando non sa, invece di inventare zero', () => {
        // Un messaggio incompleto o fallito puo' non avere uso. Zero direbbe
        // «non e' costato niente», che e' un'altra cosa.
        expect(talosOpenAiResponsesUsage(null)).toBeNull()
        expect(talosOpenAiResponsesUsage({})).toBeNull()
    })
})

describe('gli eventi dello streaming, che NON sono i chunk di oggi', () => {
    it('prende il testo da response.output_text.delta', () => {
        expect(talosReadOpenAiResponsesEvent({
            type: 'response.output_text.delta', delta: '1', item_id: 'msg_0d43', logprobs: [],
        })).toEqual({ kind: 'text', delta: '1' })
    })

    it('prende la chiamata INTERA da output_item.done, non dai delta', () => {
        // I delta degli argomenti arrivano a pezzi e senza `call_id`; l'elemento
        // finale la consegna completa. Ricomporla a mano sarebbe lavoro in piu'
        // e una fonte di errori in meno affidabile di quella che l'API da'.
        const letto = talosReadOpenAiResponsesEvent({
            type: 'response.output_item.done', output_index: 1, item: CHIAMATA,
        })
        expect(letto).toEqual({ kind: 'tool-call', call: {
            name: 'library_search',
            arguments: '{"query":"batteria"}',
            id: 'call_BkUldrkRYHv7jKDgiDDsmT26',
        } })
    })

    it('chiude su response.completed, con l uso dentro', () => {
        expect(talosReadOpenAiResponsesEvent({
            type: 'response.completed',
            response: { status: 'completed', usage: { input_tokens: 19, output_tokens: 19, total_tokens: 38 } },
        })).toEqual({ kind: 'done', usage: { prompt_tokens: 19, completion_tokens: 19, total_tokens: 38 } })
    })

    it('IGNORA un evento che non conosce invece di rompersi', () => {
        /**
         * OpenAI considera l'aggiunta di nuovi tipi di evento una modifica
         * retrocompatibile: un parser esaustivo che lancia su ignoto
         * romperebbe la chat il giorno in cui ne pubblicano uno.
         */
        for (const type of [
            'response.created', 'response.in_progress', 'response.content_part.added',
            'response.function_call_arguments.delta', 'response.qualcosa.che.non.esiste.ancora',
        ]) {
            expect(talosReadOpenAiResponsesEvent({ type })).toEqual({ kind: 'ignore' })
        }
        expect(talosReadOpenAiResponsesEvent(null)).toEqual({ kind: 'ignore' })
    })
})

describe('i tool, nella forma piatta che questo endpoint vuole', () => {
    it('mette name e parameters IN CIMA, non sotto function', () => {
        const [tool] = talosToolsForOpenAiResponses([{
            name: 'library_search',
            description: 'Cerca file.',
            // Lo schema e' zod, come per ogni tool vero: passa dallo STESSO
            // `schemaOf` della forma annidata, cosi' un tool non ha due
            // descrizioni a seconda dell'endpoint che lo riceve.
            input: z.object({ query: z.string() }),
        } as never]) as Array<Record<string, unknown>>
        expect(tool.type).toBe('function')
        expect(tool.name).toBe('library_search')
        expect(tool.parameters).toBeDefined()
        // La differenza che rompe un porting fatto a memoria.
        expect(tool.function).toBeUndefined()
    })
})
