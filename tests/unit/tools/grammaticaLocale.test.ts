/**
 * ⭐ La grammatica del motore locale deve COMPILARE — e per compilare non deve
 * chiedere al campionatore di contare i caratteri.
 *
 * ## Il difetto, col messaggio del parser in mano
 *
 * MISURATO sul Pad il 2026-08-08, con 46 tool offerti a Qwen3-1.7B. La GBNF che
 * llama.cpp costruisce dai nostri schemi pesa **55.871 byte** e non compila:
 *
 * ```
 * parse: error parsing grammar: number of rules that are going to be repeated
 * multiplied by the new repetition exceeds sane defaults, please reduce the
 * number of repetitions or rule complexity
 * ```
 *
 * `z.string().max(2000)` diventa `maxLength: 2000`, e la grammatica lo traduce
 * in una regola ripetuta fino a duemila volte. Per i campi di 46 tool, il tetto
 * del parser salta.
 *
 * E senza grammatica niente vincola la forma **né la fine** della chiamata:
 * cinque esecuzioni per una torcia sola, e `<tool_call>` leggibile in chat.
 *
 * ## ⛔ Cosa NON deve cambiare
 *
 * Tutto il resto. Stesso nome, stessa descrizione, stessi campi obbligatori,
 * stessi `enum`. La parità con i provider a chiave è un vincolo: un tool non può
 * avere due descrizioni a seconda di chi lo esegue. E la validazione resta a
 * Zod, all'esecuzione, dove è sempre stata.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineTalosTool } from '@/lib/tools/registry'
import {
    talosToolsForLocalEngine,
    talosToolsForOpenAi,
} from '@/lib/tools/registry'

const esempio = defineTalosTool({
    name: 'device_compose',
    title: 'Prepare a message',
    description: 'Prepare a call or a message.',
    action: 'write',
    input: z.object({
        kind: z.enum(['call', 'sms', 'share']),
        value: z.string().min(1).max(2000),
        text: z.string().max(2000).optional(),
        count: z.number().int().min(0).max(100).optional(),
        tags: z.array(z.string().max(80)).max(10).optional(),
    }),
    async run() {
        return { ok: true, content: 'ok' }
    },
}) as never

function testo(valore: unknown): string {
    return JSON.stringify(valore)
}

describe('gli schemi per il motore locale', () => {
    it('GRAMMATICA-01 non contengono NESSUNA clausola che si traduce in ripetizioni', () => {
        const locale = testo(talosToolsForLocalEngine([esempio]))

        for (const clausola of [
            'maxLength', 'minLength', 'maxItems', 'minItems', 'pattern',
            'maximum', 'minimum', 'exclusiveMaximum', 'exclusiveMinimum', 'multipleOf',
        ]) {
            expect(locale, clausola).not.toContain(clausola)
        }
    })

    it('GRAMMATICA-02 morde: la versione per i provider a chiave LE CONTIENE', () => {
        /*
         * La prova che il primo caso non passa per costruzione. Se un giorno
         * Zod smettesse di emettere `maxLength`, il primo test resterebbe verde
         * senza dimostrare piu' niente — e questo cadrebbe, dicendo perche'.
         */
        const chiave = testo(talosToolsForOpenAi([esempio]))
        expect(chiave).toContain('maxLength')
        expect(chiave).toContain('maximum')
    })

    it('GRAMMATICA-03 ⛔ tutto il resto resta IDENTICO: nomi, descrizioni, campi, enum', () => {
        const locale = talosToolsForLocalEngine([esempio])[0] as {
            function: { name: string, description: string, parameters: Record<string, unknown> }
        }
        const chiave = talosToolsForOpenAi([esempio])[0] as {
            function: { name: string, description: string, parameters: Record<string, unknown> }
        }

        expect(locale.function.name).toBe(chiave.function.name)
        expect(locale.function.description).toBe(chiave.function.description)
        // I campi obbligatori: e' cio' che dice al modello cosa DEVE scrivere.
        expect(locale.function.parameters.required).toEqual(chiave.function.parameters.required)
        // Gli enum: la parte di vincolo che serve davvero, e che non esplode.
        expect(testo(locale.function.parameters)).toContain('"call"')
        expect(testo(locale.function.parameters)).toContain('"sms"')
        // E i tipi.
        const proprieta = locale.function.parameters.properties as Record<string, { type?: string }>
        expect(proprieta.value?.type).toBe('string')
        expect(proprieta.count?.type).toBe('integer')
    })

    it('GRAMMATICA-04 lo schema locale è più PICCOLO, che è tutto il punto', () => {
        const locale = testo(talosToolsForLocalEngine([esempio]))
        const chiave = testo(talosToolsForOpenAi([esempio]))
        expect(locale.length).toBeLessThan(chiave.length)
    })
})
