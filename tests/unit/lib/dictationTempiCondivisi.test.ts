import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ⛔⛔ NESSUNA SCHERMATA DECIDE DA SÉ I TEMPI DELL'ASCOLTO.
 *
 * ## Il difetto che questo file rende impossibile
 *
 * 11 agosto 2026, due volte nella stessa giornata. Prima `silenceMillis` non
 * arrivava affatto al ponte e il microfono si chiudeva dopo 2000 ms — il default
 * del motore. Poi la cura arrivava alla barra e **non** alla chat: stesso
 * microfono, due comportamenti, a seconda di dove lo premevi. Nessuna delle due
 * era rotta; erano solo diverse, ed è per questo che nessuno se ne accorgeva.
 *
 * La causa, tutte e due le volte: **più di un posto che decide lo stesso
 * numero**. Adesso il numero vive dove viene applicato — in
 * `TalosDictationPlugin.kt` — perché c'è un terzo posto che apre il microfono
 * (`TalosOrecchioAnticipato`, in `onCreate`) e che nasce prima del JavaScript.
 *
 * ⛔ Quindi la regola che si difende qui è: nessuna superficie web ripete quei
 * numeri. Chi ne volesse di diversi deve dichiararlo, e allora questo test si
 * accorge del cambiamento invece di lasciarlo passare in silenzio.
 */

const RADICE = resolve(__dirname, '../../..')

const SUPERFICI = [
    { nome: 'la barra dell’assistente', file: 'src/components/barra/TalosBarraRoot.vue' },
    { nome: 'la chat a schermo intero', file: 'src/screens/ChatScreen.vue' },
] as const

describe('⛔ i tempi dell’ascolto hanno UNA sola sorgente', () => {
    for (const superficie of SUPERFICI) {
        it(`⭐ ${superficie.nome} non dichiara tempi propri`, () => {
            const sorgente = readFileSync(resolve(RADICE, superficie.file), 'utf8')
            // ⛔ Si guarda il PASSAGGIO dell'opzione, non la parola: i commenti
            // che raccontano la storia del difetto la nominano, ed è giusto.
            expect(sorgente).not.toMatch(/^\s*silenceMillis:/m)
            expect(sorgente).not.toMatch(/^\s*minimumMillis:/m)
        })
    }

    it('⛔ e il nativo li dichiara UNA volta, sopra la moda dei 1500 ms', () => {
        const kotlin = readFileSync(
            resolve(RADICE, 'android/app/src/main/java/ai/talos/agent/TalosDictationPlugin.kt'),
            'utf8',
        )
        const pausa = /TALOS_PAUSA_FINE_FRASE_MS = ([\d_]+)/.exec(kotlin)
        const attesa = /TALOS_ATTESA_INIZIO_MS = ([\d_]+)/.exec(kotlin)
        expect(pausa).not.toBeNull()
        expect(attesa).not.toBeNull()
        const ms = (m: RegExpExecArray | null): number => Number(m![1].replace(/_/g, ''))
        /*
         * Le pause dentro un turno di parlato spontaneo si addensano intorno a
         * 150, 500 e 1500 ms (Heldner & Edlund, tre corpora, tre lingue). Una
         * soglia piantata sulla moda dei 1500 taglia a metà il gruppo più
         * numeroso di «sto pensando, non ho finito» — il difetto segnalato
         * dall'owner: «non faccio in tempo a finire di parlare che invia».
         */
        expect(ms(pausa)).toBeGreaterThan(1_500)
        expect(ms(pausa)).toBeLessThanOrEqual(3_000)
        // Aspettare che tu cominci non è la stessa cosa che capire che hai finito.
        expect(ms(attesa)).toBeGreaterThan(ms(pausa))
    })
})
