import { describe, expect, it } from 'vitest'
import {
    TALOS_SOGLIA_APERTURA,
    talosOffsetDelTrascinamento,
    talosTrascinamentoApre,
} from '@/lib/barra/trascinamento'

/**
 * ⛔ IL GESTO DECIDE SE LA PERSONA ESCE DALL'APP CHE STAVA USANDO.
 *
 * Sbagliarlo per eccesso apre TALOS a schermo pieno a chi stava solo scorrendo
 * la risposta — cioè il difetto che l'owner ha bocciato all'inizio di tutto il
 * compito («potrei farlo con un tap»). Sbagliarlo per difetto rende il gesto una
 * cosa che «a volte non funziona», che è peggio di non averlo.
 *
 * Per questo metà di questi casi sono NEGATIVI, e c'è il verso contrario: un
 * trascinamento verso il BASSO non deve mai aprire niente.
 */
describe('⛔ la maniglia: quando il gesto apre e quando no', () => {
    it('apre da SOPRA la soglia in su, compresa la soglia esatta', () => {
        expect(talosTrascinamentoApre(TALOS_SOGLIA_APERTURA)).toBe(true)
        expect(talosTrascinamentoApre(TALOS_SOGLIA_APERTURA + 1)).toBe(true)
        expect(talosTrascinamentoApre(400)).toBe(true)
    })

    it('⛔ NON apre sotto la soglia — chi scorre la risposta resta dov\'è', () => {
        expect(talosTrascinamentoApre(TALOS_SOGLIA_APERTURA - 1)).toBe(false)
        expect(talosTrascinamentoApre(10)).toBe(false)
        expect(talosTrascinamentoApre(0)).toBe(false)
    })

    it('⛔ IL VERSO CONTRARIO: trascinare in BASSO non apre mai', () => {
        // Non è un doppione dello zero: un'implementazione che usasse il valore
        // assoluto passerebbe tutti i casi sopra e aprirebbe TALOS a chi ha
        // tirato la carta verso il basso.
        expect(talosTrascinamentoApre(-10)).toBe(false)
        expect(talosTrascinamentoApre(-400)).toBe(false)
    })
})

describe('⛔ la maniglia: quanto la carta segue il dito', () => {
    it('fino alla soglia segue il dito UNO A UNO', () => {
        expect(talosOffsetDelTrascinamento(0)).toBe(0)
        expect(talosOffsetDelTrascinamento(20)).toBe(20)
        expect(talosOffsetDelTrascinamento(TALOS_SOGLIA_APERTURA)).toBe(TALOS_SOGLIA_APERTURA)
    })

    it('oltre la soglia SMORZA, e non torna mai indietro', () => {
        const alSoglia = talosOffsetDelTrascinamento(TALOS_SOGLIA_APERTURA)
        const oltre = talosOffsetDelTrascinamento(TALOS_SOGLIA_APERTURA + 100)
        // Sale ancora — la carta non si inchioda, o il gesto sembrerebbe finito…
        expect(oltre).toBeGreaterThan(alSoglia)
        // …ma molto meno di quanto è salito il dito: è il modo in cui la
        // superficie dice «ho capito, puoi lasciare» senza scriverlo.
        expect(oltre).toBeLessThan(alSoglia + 100)
    })

    it('⛔ verso il basso la carta NON si muove', () => {
        // Una carta che scende senza che succeda niente è una promessa non
        // mantenuta: meglio ferma.
        expect(talosOffsetDelTrascinamento(-1)).toBe(0)
        expect(talosOffsetDelTrascinamento(-200)).toBe(0)
    })

    it('la soglia è la STESSA per il movimento e per l\'apertura', () => {
        // ⛔ Due costanti separate si sarebbero scollate al primo ritocco, e il
        // difetto sarebbe stato invisibile: la carta si sarebbe smorzata in un
        // punto e aperta in un altro, cioè un gesto che «a volte» non parte.
        const appena = TALOS_SOGLIA_APERTURA
        expect(talosOffsetDelTrascinamento(appena)).toBe(appena)
        expect(talosTrascinamentoApre(appena)).toBe(true)
    })
})
