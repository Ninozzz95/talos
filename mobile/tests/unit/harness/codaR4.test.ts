import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { azioneCodaR4, statoCodaR4, testoVoceCodaR4, vociDellaStrisciaR4 } from '@/lib/harness/r4/codaR4'

/*
 * ⛔ K3-C Accoda (ledger `LEDGER-K3-ACCODA-2026-10-16.md`; owner 16/10: la striscia della chat, «Modifica» riporta nel compositore).
 * Il golden è calcolato dalle funzioni VERE di `components/coda-messaggi.js` del desktop r4 @ 2161afb32 (`normalizzaStatoCoda`,
 * `descriviCoda`, col vero `lingua.js`; scratchpad `doctor/golden-coda.mjs`).
 */
const golden = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'coda-golden-701c6c0d2.json'), 'utf8'))
const PERSONA = new Set(['persona', 'personaConBolla', 'personaLunga'])
const LINGUE = ['it', 'en'] as const

describe('la coda del Codice su r4 (K3-C Accoda)', () => {
    it('CODA-01 le voci di sistema con la frase intera del desktop (agente, sottofondo, Workflow, dialogo fra agenti), it e en', () => {
        for (const lingua of LINGUE) {
            for (const [nome, voce] of Object.entries(golden.voci as Record<string, Record<string, unknown>>)) {
                if (PERSONA.has(nome)) continue
                expect(testoVoceCodaR4(voce, { sessioneId: golden.sessione, lingua }), `${lingua} ${nome}`).toBe(golden[lingua].voci[nome].intero)
            }
        }
    })

    it('CODA-02 le voci della persona come nella striscia della chat: il testo scritto (la frase della persona, non i file allegati)', () => {
        expect(testoVoceCodaR4(golden.voci.persona, { sessioneId: null, lingua: 'it' })).toBe('Controlla anche i test')
        expect(testoVoceCodaR4(golden.voci.personaConBolla, { sessioneId: null, lingua: 'it' })).toBe('Leggi questo file')
        expect(testoVoceCodaR4(golden.voci.personaLunga, { sessioneId: null, lingua: 'en' })).toBe(golden.voci.personaLunga.testo)
    })

    it('CODA-03 lo stato da `talos.coda` come il desktop (voci vuote scartate, pausa solo con voci) e le voci della striscia', () => {
        for (const [nome, valore] of Object.entries(golden.normali as Record<string, unknown>)) {
            expect(statoCodaR4(valore), nome).toEqual(golden.it.normali[nome])
        }
        const voci = vociDellaStrisciaR4({ voci: [golden.voci.persona, golden.voci.delega, golden.voci.sfondoRiuscito, { testo: 'senza id' }], inPausa: false },
            { sessioneId: golden.sessione, lingua: 'it', ora: '2026-10-16T12:00:00.000Z' })
        expect(voci).toEqual([
            { id: 'v1', testo: 'Controlla anche i test', creataAlle: '2026-10-16T12:00:00.000Z', modificabile: true },
            { id: 'v4', testo: golden.it.voci.delega.intero, creataAlle: '2026-10-16T12:00:00.000Z', modificabile: false },
            { id: 'v7', testo: golden.it.voci.sfondoRiuscito.intero, creataAlle: '2026-10-16T12:00:00.000Z', modificabile: false },
        ])
    })

    it('CODA-04 l\'azione per voce: «Indirizza ora» a giro vivo, «Invia ora» a giro fermo (il desktop non distingue «ferma e riparti»)', () => {
        expect(azioneCodaR4(true)).toBe('indirizza')
        expect(azioneCodaR4(false)).toBe('invia-ora')
    })
})
