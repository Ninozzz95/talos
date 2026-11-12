import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as telefono from '@/lib/kernel/compattazione'
import { COSTANTI, MEZZI, argomentiDelCaso, casiDellaParita } from './paritaRiassuntoAtteso.casi.mjs'

/*
 * Telefono 0.1.48, giudice v1523 (11/11/2026 18:47, opzione (a)): «niente da guadagnare» si decide con la regola del PC,
 * `harness-ui/src/kernel/compattazione-desktop.mjs:307` (`RIASSUNTO_ATTESO_MINIMO_TOKEN = 400`) e `:331-357` (`conRiassuntoVero`,
 * `medianaRiassunti`, `riassuntoAtteso`, `guadagnoAtteso`; sopra la finestra `:366-370` `pavimentoOltreLaFinestra`), con la stima
 * del PC (`stimaConPezzi` `:403-414`, `talosHarness.mjs:269-288`), portata INTERA. Prova di parità: stessi ingressi, stessi numeri
 * del PC; se divergono è rossa.
 * ⛔ LANE-01 (owner 25/09/2026): il mobile non legge file delle altre lane, nemmeno in un test. I numeri del PC stanno quindi in
 * `paritaRiassuntoAtteso.pc.json`, scritti dal modulo VERO del PC sugli stessi casi (`paritaRiassuntoAtteso.casi.mjs`), con la
 * fonte: file, commit e impronta sha256. Si rigenerano col generatore che sta FUORI dal pacchetto del telefono, nella lane del PC:
 * `node harness-ui/scripts/genera-parita-pc.mjs` dalla radice del repo (scritto lì il commit del PC registrato, `fb6bbcb6c`); se il
 * PC cambia queste funzioni, l'impronta cambia e la linea unica rigenera e riprova.
 */
type Caso = { funzione: string, m?: number, argomenti: unknown[] }
const casi = casiDellaParita() as Caso[]
const delPc = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/unit/kernel/paritaRiassuntoAtteso.pc.json'), 'utf8')) as {
    fonte: { file: string, commit: string, sha256: string, modificatoNelWorktree: boolean, stima: { file: string, commit: string, sha256: string, modificatoNelWorktree: boolean } }
    costanti: Record<string, number>
    casi: number
    risultati: unknown[]
}

describe('Telefono 0.1.48 — la regola del PC per «niente da guadagnare» (giudice v1523), prova di parità', () => {
    it('PAR-00 i numeri del PC vengono dal file del PC a un commit, senza modifiche locali, sugli stessi casi', () => {
        // Il file del PC si nomina solo qui sotto per la coda: LANE-01 vieta i percorsi delle altre lane nelle stringhe.
        expect(delPc.fonte.file.endsWith('/kernel/compattazione-desktop.mjs')).toBe(true)
        expect(delPc.fonte.commit).toMatch(/^[0-9a-f]{40}$/)
        expect(delPc.fonte.sha256).toMatch(/^[0-9a-f]{64}$/)
        expect(delPc.fonte.modificatoNelWorktree).toBe(false)
        // Giro dopo i revisori (giudice v1535, punto 4): l'impronta copre anche il file della stima del PC.
        expect(delPc.fonte.stima.file.endsWith('/kernel/talosHarness.mjs')).toBe(true)
        expect(delPc.fonte.stima.sha256).toMatch(/^[0-9a-f]{64}$/)
        expect(delPc.fonte.stima.modificatoNelWorktree).toBe(false)
        expect(delPc.casi).toBe(casi.length)
        expect(delPc.risultati).toHaveLength(casi.length)
    })

    it('PAR-01 le costanti sono quelle del PC', () => {
        const delTelefono = Object.fromEntries(COSTANTI.map((k: string) => [k, (telefono as unknown as Record<string, number>)[k]]))
        expect(delTelefono).toEqual(delPc.costanti)
    })

    it('PAR-02 stessi numeri del PC su ogni caso (stima del tratto, mediana, ultime nove, riassunto atteso, guadagno atteso, pavimento oltre la finestra)', () => {
        const funzioni: Record<string, (...a: never[]) => unknown> = {
            stimaConPezzi: telefono.stimaConPezziDelPc as never,
            medianaRiassunti: telefono.medianaRiassunti as never,
            conRiassuntoVero: telefono.conRiassuntoVero as never,
            riassuntoAtteso: telefono.riassuntoAtteso as never,
            guadagnoAtteso: telefono.guadagnoAtteso as never,
            pavimentoOltreLaFinestra: telefono.pavimentoOltreLaFinestra as never,
            stimaDegliAttrezzi: telefono.stimaDegliAttrezziDelPc as never,
        }
        const diversi = casi.flatMap((caso, i) => {
            const delTelefono = funzioni[caso.funzione]!(...(argomentiDelCaso(caso) as never[]))
            return JSON.stringify(delTelefono) === JSON.stringify(delPc.risultati[i]) ? [] : [{ i, funzione: caso.funzione, m: caso.m, delTelefono, delPc: delPc.risultati[i] }]
        })
        expect(casi.length).toBeGreaterThan(10_000)
        expect(diversi.slice(0, 3)).toEqual([])
        expect(diversi).toHaveLength(0)
    })

    it('PAR-03 il minimo di 400 decide i 6 scambi del Tester: atteso 400, non un quinto del tratto', () => {
        const i = casi.findIndex((c) => c.funzione === 'riassuntoAtteso' && c.m === 3
            && JSON.stringify(c.argomenti[1]) === JSON.stringify({ finestraToken: 2_816, soglia: null, mediana: null }))
        expect(i).toBeGreaterThanOrEqual(0)
        expect(delPc.risultati[i]).toBe(400)
        expect(telefono.riassuntoAtteso(MEZZI[3] as never, { finestraToken: 2_816 })).toBe(400)
    })
})
