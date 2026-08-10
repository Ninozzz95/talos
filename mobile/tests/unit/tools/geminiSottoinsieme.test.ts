import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineTalosTool, talosToolsForGemini } from '@/lib/tools/registry'

/**
 * ⛔⛔ GEMINI RIFIUTAVA L'INTERA CONVERSAZIONE PER UNA CHIAVE DI TROPPO.
 *
 * MISURATO sul telefono dell'owner il 2026-08-10, HTTP 400 di gemini-2.5-flash:
 *
 * ```
 *   Invalid JSON payload received. Unknown name "additionalProperties"
 *   at 'tools[0].function_declarations[9].parameters': Cannot find field.
 * ```
 *
 * Non un tool: TUTTA la chiamata. La chat con Gemini era inutilizzabile.
 *
 * ⛔ E la causa non è «ci siamo dimenticati additionalProperties»: è che il
 * filtro era una lista di ECCEZIONI. Ha retto finché nessuno schema ha prodotto
 * una chiave nuova; poi ne è arrivata una e il muro è caduto. L'elenco dei
 * rifiutati da Gemini è lungo e cresce — `$schema`, `$defs`, `$ref`, `$id`,
 * `default`, `title`, `examples`, `propertyNames`… — e inseguirlo significa
 * aspettare il prossimo 400 in produzione.
 *
 * ⇒ Adesso si tiene ciò che è AMMESSO. Questi casi provano la differenza.
 */

const schema = z.object({
    testo: z.string().describe('un testo'),
    quanti: z.number().int().min(1).max(5).optional(),
    tipo: z.enum(['a', 'b']),
})

const strumento = defineTalosTool({
    name: 'prova_gemini',
    title: 'Prova',
    description: 'Uno strumento di prova.',
    action: 'read',
    input: schema,
    async run() { return { ok: true, content: '' } },
}) as never

function chiaviProfonde(node: unknown, viste: Set<string> = new Set()): Set<string> {
    if (Array.isArray(node)) { for (const v of node) chiaviProfonde(v, viste); return viste }
    if (node === null || typeof node !== 'object') return viste
    for (const [k, v] of Object.entries(node)) {
        viste.add(k)
        chiaviProfonde(v, viste)
    }
    return viste
}

describe('⛔ lo schema per Gemini contiene SOLO il suo sottoinsieme', () => {
    it('il caso che ha rotto tutto: nessun «additionalProperties» esce di qui', () => {
        const parametri = (talosToolsForGemini([strumento])[0] as {
            functionDeclarations: Array<{ parameters: unknown }>
        }).functionDeclarations[0]!.parameters
        expect(chiaviProfonde(parametri).has('additionalProperties')).toBe(false)
    })

    it('⛔ e nemmeno le altre che Gemini rifiuta, oggi e domani', () => {
        const parametri = (talosToolsForGemini([strumento])[0] as {
            functionDeclarations: Array<{ parameters: unknown }>
        }).functionDeclarations[0]!.parameters
        const chiavi = chiaviProfonde(parametri)
        for (const vietata of [
            '$schema', '$defs', '$ref', '$id', '$comment',
            'default', 'title', 'examples', 'propertyNames', 'const',
            'additionalProperties', 'exclusiveMinimum', 'exclusiveMaximum',
            'minimum', 'maximum', 'oneOf', 'allOf', 'not', 'format',
        ]) {
            expect(chiavi.has(vietata), `«${vietata}» non deve arrivare a Gemini`).toBe(false)
        }
    })

    it('⛔ ma lo schema resta UTILE: tipi, descrizioni e valori ammessi ci sono', () => {
        // Un filtro che svuota lo schema non è una cura: il modello smette di
        // sapere cosa passare. Questo caso impedisce di «risolvere» cancellando.
        const parametri = (talosToolsForGemini([strumento])[0] as {
            functionDeclarations: Array<{ parameters: unknown }>
        }).functionDeclarations[0]!.parameters as Record<string, unknown>
        expect(parametri.type).toBe('object')
        const proprieta = parametri.properties as Record<string, Record<string, unknown>>
        expect(proprieta.testo!.type).toBe('string')
        expect(proprieta.testo!.description).toBe('un testo')
        expect(proprieta.tipo!.enum).toEqual(['a', 'b'])
        expect(parametri.required).toContain('testo')
    })

    it('senza strumenti non manda un contenitore vuoto', () => {
        expect(talosToolsForGemini([])).toEqual([])
    })
})
