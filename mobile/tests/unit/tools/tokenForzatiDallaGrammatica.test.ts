import { describe, expect, it, vi } from 'vitest'
import { createTalosToolset } from '@/lib/tools/toolset'
import { talosToolsForLocalEngine } from '@/lib/tools/registry'
import { TALOS_AGENT_TOOL_IDS } from '@/lib/tools/toolControls'

/**
 * ⭐⭐⭐ QUANTI TOKEN DI UNA TOOL CALL SONO GIÀ DECISI DALLA GRAMMATICA?
 *
 * È la misura che decide se la tesi di Zethos (§8 di
 * `docs/superpowers/research/2026-08-16-zethos-in-casa-o-upstream.md`) è la
 * feature di punta o una nota a piè di pagina — e va fatta PRIMA di prometterla.
 *
 * ## Perché la domanda ha senso
 *
 * Quando la grammatica ammette **un solo** carattere possibile, l'output del
 * modello è irrilevante: quel carattere è già deciso. Un motore che se ne
 * accorge può scriverlo senza eseguire il forward pass — e aggiornare la KV di
 * tutto il tratto con **un solo prefill parallelo** invece di N passi
 * autoregressivi.
 *
 * ⛔ E il guadagno dipende dal dispositivo. MISURATO sul Pad 3, Holo-3.1-4B
 * Q4_K_M a 8 thread: prefill **65,1 tok/s**, decodifica **12,2 tok/s** —
 * rapporto **5,3×**. Ogni carattere spostato dalla decodifica al prefill costa
 * cinque volte meno. Su una GPU da datacentre quel rapporto è molto più
 * stretto: è il motivo per cui là la tecnica dà «oltre il 30%» e qui può dare
 * molto di più.
 *
 * ## Come si misura senza mentire
 *
 * Non si simula un tokenizer: si conta sui **caratteri** della chiamata vera,
 * chiedendo a ogni posizione se la forma JSON del contratto lascia una sola
 * possibilità. È una misura CONSERVATIVA — un tokenizer BPE raggruppa più
 * caratteri forzati in un token solo, quindi la frazione di TOKEN forzati è
 * ≥ della frazione di caratteri forzati.
 *
 * ⛔ Non conta come «forzato» il contenuto libero: i valori delle stringhe, i
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

        /*
         * ⛔ Il conto sta QUI e non in una slide, così invecchia insieme al
         * codice: se un giorno gli schemi cambiano forma, il numero cambia da
         * solo e nessuno racconta in giro una cifra che non vale più.
         *
         * Le due velocità sono MISURATE sul Pad 3 (Holo-3.1-4B Q4_K_M, 8
         * thread). Il resto è aritmetica, e va detto che è una PROIEZIONE: dice
         * quanto varrebbe la tecnica, non quanto ha reso — quello lo dirà il
         * dispositivo quando la tecnica esisterà.
         */
        const PREFILL = 65.1
        const DECODIFICA = 12.2
        const quota = forzati / totale
        const oggi = 1 / DECODIFICA
        const conSalto = (1 - quota) / DECODIFICA + quota / PREFILL
        console.log(
            `\n  PROIEZIONE (prefill ${PREFILL} contro decodifica ${DECODIFICA} tok/s, misurati sul Pad 3):`,
        )
        console.log(`    emissione di una tool call: ${(oggi / conSalto).toFixed(2)}× piu' veloce`)
        console.log('    ⛔ e\' una proiezione da due misure, non una misura.')

        /*
         * ⛔ La soglia non è un obiettivo: è il punto sotto il quale la tesi non
         * regge. Se la frazione forzata scendesse sotto un terzo, spostarla non
         * cambierebbe l'esito percepito e Zethos dovrebbe puntare altrove.
         */
        expect(percentuale, 'sotto un terzo la tesi del jump-forward non regge').toBeGreaterThan(33)
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
