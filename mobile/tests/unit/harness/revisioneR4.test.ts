import { describe, expect, it } from 'vitest'
import golden from '../../fixtures/r4/revisione-golden-701c6c0d2.json'
import { applicaEventoPannelloR4, creaPannelloR4, type FileR4 } from '@/lib/harness/r4/pannelloR4'
import { calcolaDiffRigheR4, RIGHE_MASSIME_DIFF_R4 } from '@/lib/harness/r4/diffRigheR4'
import {
    avvisoSimboliR4, etichettaFileReviewR4, numeroSchedaRevisioneR4, riassuntoReviewR4, sottotitoloFileR4, suggerimentoFileR4, testaDiffR4, testoCopiatiR4, testoDiffCompletoR4,
    testoDiffDiUnFileR4, testoRevisioneR4,
} from '@/lib/harness/r4/revisioneR4'

/*
 * ⛔ K3 Revisione (ledger `LEDGER-K3-REVISIONE-2026-10-17.md`): il golden viene dal codice VERO del desktop r4 @ 701c6c0d2, eseguito
 * in jsdom (`scratchpad/revisione/golden-revisione.mjs`): `review.js` e, per testo, `calcolaDiffRighe`, `formattaRigheConNumero`,
 * `simboliSpariti`, `testoDiffDiUnFile` e la voce di `updateRealReview` di `legacy/app.js`. Le prime cinque scritture sono di un flusso
 * registrato con r4 vero; le altre coprono i rami che il flusso non tocca. Il file oltre il tetto è compattato nel golden.
 */
type Golden = typeof golden
const LUNGO = Array.from({ length: 1501 }, (_, i) => `riga ${i}`).join('\n')
const corto = <T>(righe: T[]) => ({ lunghezza: righe.length, testa: righe.slice(0, 3), coda: righe.slice(-3) })
const perConfronto = (path: string, righe: unknown[]) => (path === 'lungo.txt' ? corto(righe) : righe)

/** Le scritture del golden come eventi di r4: i RunStarted che servono a quel giro, poi lo StateDelta. */
function eventi(g: Golden): Record<string, unknown>[] {
    const lista: Record<string, unknown>[] = []
    let giri = 0
    for (const s of g.scritture) {
        while (giri < s.giro) { lista.push({ type: 'RunStarted', input: {} }); giri += 1 }
        const op = s.delta[0] as Record<string, unknown>
        const delta = op.path === '/file/lungo.txt' ? [{ ...op, prima: LUNGO, value: `${LUNGO}\nfine` }] : s.delta
        lista.push({ type: 'StateDelta', delta })
    }
    return lista
}
const file = (): FileR4[] => eventi(golden).reduce((p, e) => applicaEventoPannelloR4(p, e), creaPannelloR4()).file

describe('la Revisione come il desktop r4 @ 701c6c0d2 (K3)', () => {
    it('REV-00 il tetto del diff e la sua uscita', () => {
        expect(RIGHE_MASSIME_DIFF_R4).toBe(golden.tetto)
        expect(calcolaDiffRigheR4(LUNGO, LUNGO)).toBeNull()
        expect(calcolaDiffRigheR4('a\n', 'a\nb\n')).toEqual([['ctx', 'a'], ['add', 'b']])
    })

    it('REV-01 ogni file scritto: righe numerate, giro, nuovo, diff vero, simboli spariti, conteggi', () => {
        const visti = file()
        expect(visti.map((f) => f.path)).toEqual(golden.voci.map((v) => v.path))
        for (const [i, v] of golden.voci.entries()) {
            const f = visti[i]
            expect({ path: f.path, giro: f.giro, nuovo: f.nuovo, diffVero: f.diffVero, simboliPersi: f.simboliPersi }, v.path)
                .toEqual({ path: v.path, giro: v.giro, nuovo: v.nuovo, diffVero: v.diffVero, simboliPersi: v.simboliPersi })
            expect(perConfronto(f.path, f.code), v.path).toEqual(v.code)
            expect({ aggiunte: f.aggiunte, rimozioni: f.rimozioni }, v.path).toEqual(golden.it.voci[i].conta)
        }
    })

    it('REV-05 il numero sulla scheda «Review»: i file scritti, niente mentre la storia si carica', () => {
        const visti = file()
        expect(numeroSchedaRevisioneR4(visti, true)).toBe(visti.length)
        expect(numeroSchedaRevisioneR4(visti, false)).toBeNull()
        expect(numeroSchedaRevisioneR4([], true)).toBe(0)
    })

    for (const lingua of ['it', 'en'] as const) {
        it(`REV-02 riassunti, sottotitoli, suggerimenti, etichette delle linguette (${lingua})`, () => {
            const visti = file()
            const g = golden[lingua]
            expect(riassuntoReviewR4(visti, lingua)).toBe(g.riassunto)
            expect(riassuntoReviewR4([], lingua)).toBe(g.riassuntoVuoto)
            expect(riassuntoReviewR4(visti.slice(0, 1), lingua)).toBe(g.riassuntoUno)
            for (const [i, v] of g.voci.entries()) {
                expect(sottotitoloFileR4(visti[i], lingua), v.path).toBe(v.sottotitolo)
                expect(suggerimentoFileR4(visti[i], lingua), v.path).toBe(v.suggerimento)
                expect(etichettaFileReviewR4(visti[i], visti), v.path).toBe(v.etichetta)
            }
        })

        it(`REV-03 la testa del diff, le righe e l'avviso dei simboli; il vuoto (${lingua})`, () => {
            const visti = file()
            const g = golden[lingua]
            for (const [i, v] of g.voci.entries()) {
                expect(testaDiffR4(visti[i], lingua), v.path).toEqual(v.card.testa)
                expect(perConfronto(v.path, visti[i].code), v.path).toEqual(v.card.righe)
                expect(avvisoSimboliR4(visti[i], lingua), v.path).toEqual(v.card.avviso)
            }
            expect(testoRevisioneR4('varie.review.noFilesYet', lingua)).toBe(g.vuota.righe[0][1])
        })

        it(`REV-04 il testo copiato di un file e di tutti, le parole del menu e dei toast (${lingua})`, () => {
            const visti = file()
            const g = golden[lingua]
            for (const [i, v] of g.voci.entries()) {
                const testo = testoDiffDiUnFileR4(visti[i], lingua)
                expect(v.path === 'lungo.txt' ? corto(testo.split('\n')) : testo, v.path).toEqual(v.copia)
            }
            expect(testoDiffCompletoR4(visti, lingua)).toBe(visti.map((f) => testoDiffDiUnFileR4(f, lingua)).join('\n'))
            expect({
                label: testoRevisioneR4('varie.review.menu.label', lingua), apri: testoRevisioneR4('varie.review.menu.open', lingua),
                copiaPercorso: testoRevisioneR4('varie.review.menu.copyPath', lingua), copiaDiff: testoRevisioneR4('varie.review.menu.copyDiff', lingua),
            }).toEqual(g.menu)
            expect([1, 2, 5].map((n) => testoCopiatiR4(n, lingua))).toEqual(g.copiati)
        })
    }
})
