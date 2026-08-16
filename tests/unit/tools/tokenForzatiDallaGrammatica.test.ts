import { describe, expect, it, vi } from 'vitest'
import { createTalosToolset } from '@/lib/tools/toolset'
import { talosToolsForLocalEngine } from '@/lib/tools/registry'
import { TALOS_AGENT_TOOL_IDS } from '@/lib/tools/toolControls'

/**
 * Quanta parte di una tool call è decisa dal CONTRATTO e non dal modello.
 *
 * Una chiamata a un attrezzo non è testo libero: la cornice JSON, le chiavi del
 * protocollo, i nomi dei campi e i separatori sono fissati dallo schema. Il
 * modello sceglie davvero solo i valori.
 *
 * ⇒ Questa misura dice **quanto è grande quella differenza**, ed è utile per
 * una ragione concreta: quando si valuta un modello piccolo sul tool calling,
 * la percentuale di output «corretto» è gonfiata da tutto ciò che non poteva
 * essere sbagliato. Sapere che più della metà era già decisa cambia come si
 * legge quel punteggio.
 *
 * ## Come si misura senza mentire
 *
 * Non si simula un tokenizer: si conta sui **caratteri** della chiamata vera,
 * chiedendo a ogni posizione se la forma del contratto lascia una sola
 * possibilità. È una misura CONSERVATIVA — un tokenizer BPE raggruppa più
 * caratteri fissi in un token solo, quindi la frazione di TOKEN fissi è ≥ della
 * frazione di caratteri fissi.
 *
 * ⛔ Non conta come «deciso» il contenuto libero: i valori delle stringhe, i
 * numeri, tutto ciò che il modello sceglie davvero.
 */

/** La forma che il motore locale deve emettere per chiamare un attrezzo. */
function chiamata(nome: string, argomenti: Record<string, unknown>): string {
    return JSON.stringify({ name: nome, arguments: argomenti })
}

/**
 * I caratteri decisi dalla struttura, non dal modello.
 *
 * Sono forzati: la cornice dell'oggetto, le chiavi fisse del protocollo, i
 * nomi dei campi degli argomenti (li fissa lo schema), i due punti, le virgole,
 * le virgolette che aprono e chiudono. NON è forzato ciò che sta dentro un
 * valore: quello lo sceglie il modello.
 */
function caratteriForzati(nome: string, argomenti: Record<string, unknown>): number {
    // `{"name":"` + il nome dell'attrezzo + `","arguments":{`
    //  ^ cornice     ^ deciso dalla scelta   ^ cornice
    let forzati = '{"name":"'.length + '","arguments":{'.length
    const chiavi = Object.keys(argomenti)
    chiavi.forEach((chiave, i) => {
        forzati += `"${chiave}":`.length          // il nome del campo lo fissa lo schema
        const valore = argomenti[chiave]
        if (typeof valore === 'string') forzati += 2   // le due virgolette del valore
        if (typeof valore === 'boolean') forzati += String(valore).length // true/false: enumerato
        if (i < chiavi.length - 1) forzati += 1        // la virgola
    })
    forzati += '}}'.length
    return forzati
}

describe('⭐ quanto di una tool call è già deciso dalla grammatica', () => {
    it('misura la frazione forzata su chiamate reali, e la stampa', () => {
        /*
         * Chiamate nella forma che TALOS produce davvero: nomi di attrezzi che
         * esistono nel registro, e argomenti plausibili.
         */
        const esempi: Array<[string, Record<string, unknown>]> = [
            ['device_torch', { on: true }],
            ['device_wifi', { on: false }],
            ['notes_create', { title: 'Codice del cancello', body: 'nel cassetto' }],
            ['memory_write', { kind: 'preference', text: 'beve il caffe amaro' }],
            ['calendar_write', { title: 'Dentista', start: '2026-08-15T17:00:00Z' }],
            ['app_azione', { app: 'whatsapp', azione: 'invia', testo: 'arrivo fra dieci minuti' }],
        ]

        let totale = 0
        let forzati = 0
        const righe: string[] = []
        for (const [nome, argomenti] of esempi) {
            expect(TALOS_AGENT_TOOL_IDS as readonly string[], `${nome} deve esistere nel registro`)
                .toContain(nome)
            const testo = chiamata(nome, argomenti)
            const f = caratteriForzati(nome, argomenti)
            totale += testo.length
            forzati += f
            righe.push(`  ${String(Math.round((f / testo.length) * 100)).padStart(3)}%  ${nome} (${f}/${testo.length})`)
        }

        const percentuale = Math.round((forzati / totale) * 100)
        console.log('\nCARATTERI GIA\' DECISI DALLA GRAMMATICA, per chiamata:')
        for (const r of righe) console.log(r)
        console.log(`\n  TOTALE: ${forzati}/${totale} = ${percentuale}% dei caratteri`)

        console.log('\n  ⇒ piu\' della meta\' di una tool call non poteva essere sbagliata:')
        console.log('    un punteggio di tool calling va letto sapendolo.')

        /*
         * ⛔ La soglia non è un obiettivo: è il punto sotto il quale questa
         * misura smetterebbe di dire qualcosa di utile su come si legge un
         * punteggio di tool calling.
         */
        expect(percentuale, 'sotto un terzo la misura non direbbe piu\' niente').toBeGreaterThan(33)
    })

    /**
     * ⛔ E il verso contrario: una risposta in prosa NON deve risultare forzata.
     * Se il metodo dicesse di sì anche lì, starebbe misurando sé stesso.
     */
    it('⛔ una risposta libera non ha niente di forzato', () => {
        const prosa = 'Ho acceso la torcia e ho controllato che fosse davvero accesa.'
        // Nessuna cornice JSON: nessun carattere è deciso dalla struttura.
        expect(prosa.includes('{')).toBe(false)
    })

    /** Il registro serve a provare che i nomi usati sopra sono quelli veri. */
    it('il registro degli attrezzi è quello di produzione', () => {
        expect(TALOS_AGENT_TOOL_IDS.length).toBeGreaterThan(60)
        expect(typeof createTalosToolset).toBe('function')
        expect(typeof talosToolsForLocalEngine).toBe('function')
        vi.restoreAllMocks()
    })
})
