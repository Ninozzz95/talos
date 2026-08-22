import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * ⛔⛔ QUELLO CHE STAI DICENDO ADESSO STA SOPRA QUELLO CHE TALOS HA DETTO PRIMA.
 *
 * ## La richiesta, alla lettera
 *
 * Owner 2026-08-15:
 *
 * > «le parole rilevate da TALOS assistente, se c'è la card della chat con
 * > TALOS, vengono messe **tra la barra di input e la risposta**. Se la card
 * > della risposta è stampata, le parole rilevate e anche i TOAST di fallimento
 * > o ricognizione vocale devono essere messe **sopra la card della risposta**.»
 *
 * ## Perché era sbagliato, e non è una questione di gusto
 *
 * `.scena` è una colonna con `justify-content: flex-end`: tutto è spinto verso
 * il basso, contro la pillola. Con la scia scritta DOPO la carta, le parole
 * finivano nei pochi pixel fra una carta alta e la pillola — il posto meno
 * guardato dello schermo, per l'unica cosa che cambia a ogni sillaba.
 *
 * ⇒ E lo stesso valeva per l'avviso: «Non ho sentito niente» compariva sotto una
 * risposta lunga, cioè fuori dallo sguardo di chi sta ancora parlando.
 *
 * ## ⛔ Un solo posto nel DOM, non due rami
 *
 * La stessa colonna che creava il difetto lo risolve: messi PRIMA della carta,
 * questi due le stanno sopra quando c'è, e scendono da soli verso la pillola
 * quando non c'è. Nessun `v-if` sulla posizione — un blocco che cambia posto a
 * seconda dello stato è peggio di uno fermo, perché l'occhio lo perde ogni volta.
 *
 * ⛔ Questo file guarda il SORGENTE: prova l'ORDINE, non l'aspetto. Che a
 * schermo si veda giusto lo dice il giro sul dispositivo.
 */

const RADICE = resolve(__dirname, '../../..')
const BARRA = 'src/components/barra/TalosBarraRoot.vue'

const sorgente = readFileSync(resolve(RADICE, BARRA), 'utf8')

/** Dove comincia il TEMPLATE: il commento in testa allo script non conta. */
const template = sorgente.slice(sorgente.indexOf('<template>'))

const posizioneDi = (frammento: string): number => {
    const dove = template.indexOf(frammento)
    expect(dove, `frammento non trovato nel template: ${frammento}`).toBeGreaterThan(-1)
    return dove
}

describe('⛔ le parole rilevate stanno SOPRA la carta della risposta', () => {
    it('la scia viene PRIMA della carta nel DOM', () => {
        const scia = posizioneDi('data-testid="talos-barra-scia"')
        const carta = posizioneDi('data-testid="talos-barra-carta"')
        expect(
            scia,
            'la scia è tornata sotto la carta: chi parla non vede più le proprie parole',
        ).toBeLessThan(carta)
    })

    it('anche l\'avviso viene PRIMA della carta', () => {
        const avviso = posizioneDi('class="errore" role="alert"')
        const carta = posizioneDi('data-testid="talos-barra-carta"')
        expect(
            avviso,
            '«Non ho sentito niente» è tornato sotto una risposta lunga',
        ).toBeLessThan(carta)
    })

    it('⛔ e stanno vicini: sono la stessa famiglia', () => {
        // Entrambi dicono com'è andato l'ascolto. Separarli rimetterebbe uno dei
        // due nel posto che l'owner ha nominato come sbagliato.
        const scia = posizioneDi('data-testid="talos-barra-scia"')
        const avviso = posizioneDi('class="errore" role="alert"')
        expect(Math.abs(avviso - scia)).toBeLessThan(400)
    })

    it('⛔ la posizione NON dipende da un ramo condizionale', () => {
        /*
         * Il difetto che questo controllo previene: «se c'è la carta mettila
         * sopra, se no sotto» sembra la lettura letterale della richiesta, ed è
         * la soluzione peggiore — due copie dello stesso elemento che possono
         * divergere, e un blocco che salta da un capo all'altro dello schermo.
         * La colonna `flex-end` fa già la cosa giusta con un elemento solo.
         */
        const quante = template.split('data-testid="talos-barra-scia"').length - 1
        expect(quante, 'la scia è stata duplicata in due rami').toBe(1)
    })

    it('la colonna che rende possibile tutto questo è ancora flex-end', () => {
        // Se `.scena` smettesse di spingere in basso, la scia senza carta
        // resterebbe appesa in cima allo schermo, lontanissima dalla pillola.
        const scena = sorgente.slice(sorgente.indexOf('.scena {'))
        expect(scena.slice(0, 400)).toMatch(/justify-content:\s*flex-end/)
        expect(scena.slice(0, 400)).toMatch(/flex-direction:\s*column/)
    })
})
