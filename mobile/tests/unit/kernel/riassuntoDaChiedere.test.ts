import { describe, expect, it } from 'vitest'
import * as kernel from '@/lib/kernel/compattazione'

/*
 * Telefono 0.1.48 — il giro dopo i tre revisori (giudice v1535 e v1536): le regole pure della decisione, coi confini che i mutanti
 * vivi dei revisori (A, B, C) lasciavano scoperti. Un caso per mutante, con l'uguaglianza esatta dove il mutante cambia un confine.
 */
const {
    attesoInTokenVeri, kValido, pavimentoOltreLaFinestra, rapportoDellaRichiesta, riassuntoAtteso, riassuntoDaChiedere, spazioMinimoDelRiassunto,
    stimaDegliAttrezziDelPc, FATTORE_K_MASSIMO,
} = kernel
const scambi = (n: number) => Array.from({ length: n }, (_, i) => [{ role: 'user', content: `domanda ${i}` }, { role: 'assistant', content: 'r'.repeat(1_624) }]).flat()

describe('Telefono 0.1.48 — k della richiesta intera (R1)', () => {
    it('KR-01 kValido del PC: fra 1 e 4, 1 se non è un numero', () => {
        expect(FATTORE_K_MASSIMO).toBe(4)
        expect([kValido(0.4), kValido(1), kValido(2.5), kValido(9), kValido(null), kValido(Number.NaN), kValido('2')]).toEqual([1, 1, 2.5, 4, 1, 1, 1])
    })

    it('KR-02 il rapporto della richiesta intera: token veri sulla stima del PC, null senza una misura', () => {
        expect(rapportoDellaRichiesta(1_000, 400)).toBe(2.5)
        expect(rapportoDellaRichiesta(400, 1_000)).toBe(0.4)
        for (const [t, s] of [[0, 400], [400, 0], [null, 400], [400, undefined], [-1, 400], [Number.NaN, 1]]) expect(rapportoDellaRichiesta(t, s)).toBeNull()
    })

    it('KR-03 l\'atteso in token veri: per il rapporto sotto 1, kValido sopra, 1 senza misura (il ripiego, B1)', () => {
        expect(attesoInTokenVeri(400, 2.5)).toBe(1_000)
        expect(attesoInTokenVeri(400, 9)).toBe(1_600)
        expect(attesoInTokenVeri(400, 0.4)).toBe(160)
        expect(attesoInTokenVeri(400, null)).toBe(400)
        expect(attesoInTokenVeri(401, 0.5)).toBe(201)
    })

    // Giudice v1543/v1547: sotto 1 il rapporto vale com'è, ma mai sotto 1/FATTORE_K_MASSIMO (0,25), simmetrico al tetto di 4.
    it('KR-08 un rapporto rotto (0,01) finisce sul pavimento di 0,25: atteso 100 su 400', () => {
        expect(attesoInTokenVeri(400, 0.01)).toBe(100)
        expect(attesoInTokenVeri(400, 0.25)).toBe(100)
        expect(attesoInTokenVeri(400, 0.26)).toBe(104)
    })
})

describe('Telefono 0.1.48 — prima della chiamata (punti 7-8, v1536)', () => {
    it('KR-04 sotto la finestra: pavimento + atteso uguale al massimo chiede; uno in più è «niente» (B3, C5)', () => {
        expect(riassuntoDaChiedere({ pavimento: 2_329, atteso: 400, massimo: 2_729, oltreLaFinestra: false })).toEqual({ chiedi: true, spazio: null })
        expect(riassuntoDaChiedere({ pavimento: 2_330, atteso: 400, massimo: 2_729, oltreLaFinestra: false })).toEqual({ chiedi: false, spazio: null })
        expect(riassuntoDaChiedere({ pavimento: 2_329, atteso: 400, massimo: 2_729.5, oltreLaFinestra: false }).chiedi).toBe(true)
    })

    it('KR-05 oltre la finestra: lo spazio libero è il tetto, e sotto il minimo è «niente»', () => {
        const pad = { finestraToken: 2_816, soglia: null }
        expect(spazioMinimoDelRiassunto(pad)).toBe(140)
        expect(spazioMinimoDelRiassunto({ finestraToken: 8_000 })).toBe(400)
        expect(spazioMinimoDelRiassunto({})).toBe(400)
        expect(spazioMinimoDelRiassunto({ soglia: 1_500 })).toBe(100)
        expect(riassuntoDaChiedere({ pavimento: 1_550, atteso: 400, massimo: 1_791, oltreLaFinestra: true, ...pad })).toEqual({ chiedi: true, spazio: 241 })
        expect(riassuntoDaChiedere({ pavimento: 1_651, atteso: 400, massimo: 1_791, oltreLaFinestra: true, ...pad })).toEqual({ chiedi: true, spazio: 140 })
        expect(riassuntoDaChiedere({ pavimento: 1_652, atteso: 400, massimo: 1_791, oltreLaFinestra: true, ...pad })).toEqual({ chiedi: false, spazio: 139 })
        expect(riassuntoDaChiedere({ pavimento: 1_652.5, atteso: 0, massimo: 1_791.9, oltreLaFinestra: true, ...pad }).spazio).toBe(139)
        expect(riassuntoDaChiedere({ pavimento: 2_000, atteso: 400, massimo: 1_791, oltreLaFinestra: true, ...pad })).toEqual({ chiedi: false, spazio: -209 })
    })

    it('KR-06 F6 del PC con l\'uguaglianza esatta: pavimento + atteso uguale alla finestra non entra (C6, A)', () => {
        const mezzo = scambi(3)
        expect(riassuntoAtteso(mezzo, { finestraToken: 2_816 })).toBe(400)
        expect(pavimentoOltreLaFinestra({ pavimentoConCornice: 2_416, mezzo, finestraToken: 2_816 })).toBe(2_816)
        expect(pavimentoOltreLaFinestra({ pavimentoConCornice: 2_415, mezzo, finestraToken: 2_816 })).toBeNull()
        expect(pavimentoOltreLaFinestra({ pavimentoConCornice: 2_415, mezzo, finestraToken: 2_816, scarto: 1 })).toBe(2_816)
    })

    it('KR-07 gli schemi degli attrezzi con la stima del PC', () => {
        const attrezzi = [{ type: 'function', function: { name: 'notes_list', description: 'd'.repeat(400) } }]
        expect(stimaDegliAttrezziDelPc(attrezzi)).toBe(Math.ceil(JSON.stringify(attrezzi).length / 4))
        expect([stimaDegliAttrezziDelPc([]), stimaDegliAttrezziDelPc(null), stimaDegliAttrezziDelPc('x')]).toEqual([0, 0, 0])
    })
})
