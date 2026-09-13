import { describe, expect, it } from 'vitest'
import { talosPreferFewerThreads, talosScegliThread } from '@/lib/models/engineTuning'

/**
 * ⛔⛔⛔ MISURARE L'OTTIMO E POI IGNORARLO.
 *
 * Il tuner prova diversi numeri di thread e misura prefill e generazione. Poi,
 * per il prefill, faceva così:
 *
 * ```ts
 * const threadsBatch = talosPreferFewerThreads(misura.grid, 'prefill') === null
 *     ? misura.threadsBatch
 *     : Math.max(...misura.grid.filter((r) => r.prefill > 0).map((r) => r.threads))
 * ```
 *
 * Chiamava la funzione della misura **solo per vedere se fosse nulla**, e poi
 * ne buttava la risposta per prendere il numero di thread PIÙ ALTO fra quelli
 * provati.
 *
 * ## Perché non è un dettaglio
 *
 * Il commento accanto dice: «il prefill prende il massimo perché SCALA». È vero
 * quasi sempre — ma «quasi sempre» è il motivo per cui si misura. Su un
 * dispositivo dove 8 thread perdono contro 6 per contesa di memoria o per
 * temperatura, TALOS **osservava correttamente la regressione e poi sceglieva 8
 * lo stesso**.
 *
 * ⇒ Una misura che non può cambiare la decisione non è una misura: è una
 * cerimonia. E costa — ogni thread in più è calore, che si paga sulle risposte
 * lunghe, e un core che non resta all'interfaccia.
 *
 * Rilievo P1-1 del blueprint del motore locale.
 */

describe('la scelta segue la misura, anche quando la contraddice', () => {
    /*
     * La griglia del rilievo: il prefill migliore è a SEI thread, non a otto.
     * Otto è più alto e più lento — esattamente il caso che la vecchia riga
     * sceglieva.
     */
    const GRIGLIA = [
        { threads: 4, prefill: 180, decode: 25.0 },
        { threads: 6, prefill: 250, decode: 24.9 },
        { threads: 8, prefill: 210, decode: 23.5 },
    ]

    it('⛔ il prefill sceglie 6, MAI 8', () => {
        expect(talosPreferFewerThreads(GRIGLIA, 'prefill')).toBe(6)
    })

    it('⭐ e quando il prefill scala davvero, prende il numero alto', () => {
        // Il caso normale, che non deve rompersi: qui 8 vince davvero.
        expect(talosPreferFewerThreads([
            { threads: 4, prefill: 180, decode: 25 },
            { threads: 6, prefill: 240, decode: 24 },
            { threads: 8, prefill: 300, decode: 23 },
        ], 'prefill')).toBe(8)
    })

    it('⭐ a parità entro il 3% vince il più BASSO', () => {
        /*
         * ⛔ Una differenza sotto il 3% su un telefono è rumore: temperatura,
         * un'altra app che si sveglia, lo scheduler che sposta un thread.
         * Fissarla come vittoria significa scolpire una misura che domani
         * sarebbe l'opposto — e pagare calore per niente.
         */
        expect(talosPreferFewerThreads([
            { threads: 4, prefill: 295, decode: 25 },
            { threads: 8, prefill: 300, decode: 23 },
        ], 'prefill')).toBe(4)
    })

    it('⛔ e senza nessuna misura valida non inventa un numero', () => {
        expect(talosPreferFewerThreads([
            { threads: 4, prefill: 0, decode: 0 },
            { threads: 8, prefill: 0, decode: 0 },
        ], 'prefill')).toBeNull()
        // ⇒ `null` è la porta per cui chi chiama ricade sul valore che aveva:
        // non misurato non è «zero», e non è nemmeno «il massimo provato».
    })

    it('⭐ la generazione usa la stessa regola, e la usava già', () => {
        expect(talosPreferFewerThreads(GRIGLIA, 'decode')).toBe(4)
    })
})

describe('⛔⛔ e la SCELTA usa la regola invece di scavalcarla', () => {
    const misura = {
        threads: 8,
        threadsBatch: 8,
        prefillPerSecond: 210,
        decodePerSecond: 23.5,
        grid: [
            { threads: 4, prefill: 180, decode: 25.0 },
            { threads: 6, prefill: 250, decode: 24.9 },
            { threads: 8, prefill: 210, decode: 23.5 },
        ],
    }

    it('il prefill prende 6 — il MIGLIORE misurato, non il piu alto provato', () => {
        expect(talosScegliThread(misura).threadsBatch).toBe(6)
        /*
         * ⛔ Questa e la riga che il rilievo P1-1 ha trovato. Prima tornava 8,
         * perche prendeva `Math.max(threads)` fra le righe con prefill > 0 —
         * cioe il numero piu alto PROVATO, non quello che aveva vinto.
         */
    })

    it('⭐ e la generazione continua a prendere il piu basso a parita', () => {
        expect(talosScegliThread(misura).threads).toBe(4)
    })

    it('⛔ senza misure valide si ricade su cio che si aveva, non su un massimo', () => {
        const cieca = {
            ...misura,
            grid: [{ threads: 4, prefill: 0, decode: 0 }, { threads: 8, prefill: 0, decode: 0 }],
        }
        expect(talosScegliThread(cieca)).toEqual({ threads: 8, threadsBatch: 8 })
        // ⇒ «non misurato» non e «zero», e non e nemmeno «il massimo provato».
    })
})
