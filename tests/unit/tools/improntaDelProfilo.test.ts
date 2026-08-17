import { describe, expect, it } from 'vitest'
import {
    talosCacheSopravvissuta,
    talosImprontaDeiByte,
    talosProfiloCompilato,
} from '@/lib/tools/improntaDelProfilo'
import type { TalosToolDefinition } from '@/lib/tools/registry'

/**
 * ⭐⭐⭐ L'IMPRONTA DEL PROFILO — e cosa deve NON nascondere.
 *
 * La cache dei prompt combacia per prefisso esatto, e gli attrezzi stanno
 * davanti a tutto: attrezzi → sistema → messaggi. Un byte diverso lì e muore
 * l'intera conversazione in cache. Due casi raccontati in giro valgono da soli
 * questo file: un serializzatore che ordinava le chiavi in modo diverso fra due
 * richieste, e un attrezzo cambiato a meta' sessione che ha bruciato 20.000
 * token.
 *
 * ⛔ Il test che conta davvero e' il terzo: stessi attrezzi, stesso ordine,
 * chiavi serializzate in ordine diverso. Un'impronta «intelligente» che
 * canonicalizza direbbe «tutto uguale» — e nasconderebbe il difetto per cui
 * esiste. Qui si pretende che l'impronta CAMBI.
 */
function attrezzo(nome: string, azione: 'read' | 'write' | 'outbound') {
    return { name: nome, action: azione } as unknown as TalosToolDefinition<never>
}

const DEFINIZIONI = [
    attrezzo('time_now', 'read'),
    attrezzo('memory_search', 'read'),
    attrezzo('send_message', 'outbound'),
    attrezzo('set_alarm', 'write'),
]

/** La forma che esce davvero da `talosAttrezziAnthropicAGradi`. */
function filo(differiti: readonly string[] = ['send_message', 'set_alarm']) {
    const riga = (nome: string) => ({
        name: nome,
        description: `descrizione di ${nome}`,
        input_schema: { type: 'object', properties: {} },
        ...(differiti.includes(nome) ? { defer_loading: true } : {}),
    })
    return [
        { type: 'tool_search_tool_bm25_20251119', name: 'tool_search_tool_bm25' },
        ...differiti.map(riga),
        ...['time_now', 'memory_search'].filter((n) => !differiti.includes(n)).map(riga),
    ]
}

describe('che cosa dice un profilo di se stesso', () => {
    it('conta i poteri, e NON attribuisce un potere a cio che non e nostro', () => {
        const profilo = talosProfiloCompilato('anthropic/a-gradi', filo(), DEFINIZIONI)
        expect(profilo.attrezzi).toContain('tool_search_tool_bm25')
        /*
         * ⛔ La ricerca degli attrezzi e' di Anthropic. Contarla come `read`
         * per comodita' falserebbe il totale che questa riga esiste per dire:
         * quanti poteri stiamo mettendo davanti al modello.
         */
        expect(profilo.poteri.read + profilo.poteri.write + profilo.poteri.outbound)
            .toBe(DEFINIZIONI.length)
        expect(profilo.poteri).toEqual({ read: 2, write: 1, outbound: 1 })
        expect(profilo.differiti).toEqual(['send_message', 'set_alarm'])
        expect(profilo.tokenStimati).toBeGreaterThan(0)
        expect(profilo.byteSchema).toBe(JSON.stringify(filo()).length)
    })
})

describe('la cache del prefisso', () => {
    it('sopravvive quando non e cambiato niente', () => {
        const prima = talosProfiloCompilato('a', filo(), DEFINIZIONI)
        const dopo = talosProfiloCompilato('a', filo(), DEFINIZIONI)
        expect(dopo.impronta).toBe(prima.impronta)
        expect(talosCacheSopravvissuta(prima, dopo).sopravvive).toBe(true)
    })

    it('al PRIMO messaggio non grida al lupo', () => {
        const dopo = talosProfiloCompilato('a', filo(), DEFINIZIONI)
        // Non c'era nessun prefisso da perdere: chiamarlo «cache morta»
        // sarebbe un falso allarme a ogni conversazione nuova.
        expect(talosCacheSopravvissuta(null, dopo).sopravvive).toBe(true)
    })

    it('muore quando un permesso toglie un attrezzo, e DICE quale', () => {
        const prima = talosProfiloCompilato('a', filo(), DEFINIZIONI)
        const senzaInvio = filo().filter((r) => (r as { name?: string }).name !== 'send_message')
        const dopo = talosProfiloCompilato('a', senzaInvio, DEFINIZIONI)
        const esito = talosCacheSopravvissuta(prima, dopo)
        expect(esito.sopravvive).toBe(false)
        expect(esito.perche).toContain('send_message')
    })

    it('⛔ muore anche a parita di attrezzi, se cambia l ORDINE DELLE CHIAVI', () => {
        /*
         * Questo e' il test che giustifica la scelta di non canonicalizzare.
         * Stessi attrezzi, stesso ordine, stesso contenuto: cambia solo
         * l'ordine in cui le chiavi finiscono nel JSON — che e' esattamente il
         * difetto raccontato di un serializzatore incoerente. Il fornitore non
         * vede una forma equivalente: vede i byte, e quei byte sono diversi.
         *
         * Se questa asserzione cadesse, avremmo scritto uno strumento che
         * rassicura mentre la cache brucia.
         */
        const prima = talosProfiloCompilato('a', filo(), DEFINIZIONI)
        const chiaviGirate = filo().map((r) => {
            const riga = r as Record<string, unknown>
            if (!('description' in riga)) return riga
            // stesse coppie, inserite in un ordine diverso
            return {
                input_schema: riga.input_schema,
                name: riga.name,
                description: riga.description,
                ...('defer_loading' in riga ? { defer_loading: riga.defer_loading } : {}),
            }
        })
        const dopo = talosProfiloCompilato('a', chiaviGirate, DEFINIZIONI)
        expect(dopo.impronta).not.toBe(prima.impronta)
        const esito = talosCacheSopravvissuta(prima, dopo)
        expect(esito.sopravvive).toBe(false)
        expect(esito.perche).toMatch(/serializzazione|contenuto/)
    })

    it('muore se cambia l ordine degli attrezzi, e lo dice', () => {
        const prima = talosProfiloCompilato('a', filo(), DEFINIZIONI)
        const girati = [...filo()].reverse()
        const dopo = talosProfiloCompilato('a', girati, DEFINIZIONI)
        const esito = talosCacheSopravvissuta(prima, dopo)
        expect(esito.sopravvive).toBe(false)
        expect(esito.perche).toContain('ORDINE')
    })

    it('muore se cambia una DESCRIZIONE, che e il caso piu silenzioso di tutti', () => {
        const prima = talosProfiloCompilato('a', filo(), DEFINIZIONI)
        const ritoccati = filo().map((r) => {
            const riga = r as Record<string, unknown>
            return riga.name === 'time_now'
                ? { ...riga, description: 'una parola in piu' }
                : riga
        })
        const dopo = talosProfiloCompilato('a', ritoccati, DEFINIZIONI)
        expect(talosCacheSopravvissuta(prima, dopo).sopravvive).toBe(false)
    })
})

describe('l impronta come funzione', () => {
    it('e stabile, e distingue un solo carattere', () => {
        expect(talosImprontaDeiByte('ciao')).toBe(talosImprontaDeiByte('ciao'))
        expect(talosImprontaDeiByte('ciao')).not.toBe(talosImprontaDeiByte('ciap'))
        // Otto cifre esadecimali, sempre: una lunghezza variabile renderebbe
        // illeggibili i log affiancati.
        expect(talosImprontaDeiByte('')).toMatch(/^[0-9a-f]{8}$/)
        expect(talosImprontaDeiByte('x'.repeat(10_000))).toMatch(/^[0-9a-f]{8}$/)
    })
})
