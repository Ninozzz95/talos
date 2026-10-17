import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
    CONCESSI_DAL_LIVELLO_R4, GRUPPI_SENZA_CHIEDERE_R4, LIVELLI_PERMESSO_R4, LIVELLO_DELLA_POLITICA_R4, riassuntoSenzaChiedereR4, tonoPermessoR4,
} from '@/lib/harness/r4/permessiR4'
import { etichettaPermessoR4 } from '@/lib/harness/r4/approvazioniR4'

/**
 * ⛔ K3 piano (ledger `LEDGER-K3-PIANO-2026-10-17.md`): la pillola del permesso nel piede del compositore dice ciò che dice il chip
 * del desktop r4 @ 701c6c0d2 (`chat-foot.js` `riassuntoSenzaChiedere`, `tonoPermesso`, `etichettaPermesso`). Golden calcolato dal
 * codice vero: 7 permessi × 10 mappe per attrezzo × Normale/Piano, in italiano e in inglese.
 */
const golden = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'piano-golden-701c6c0d2.json'), 'utf8'))
const LINGUE = ['it', 'en'] as const

describe('la pillola del permesso come il chip del desktop @ 701c6c0d2', () => {
    it('PERM-00 le tabelle sono quelle del desktop (gruppi, livelli concessi, politica → livello)', () => {
        expect(GRUPPI_SENZA_CHIEDERE_R4).toEqual(golden.costanti.GRUPPI_SENZA_CHIEDERE)
        expect(Object.fromEntries(Object.entries(CONCESSI_DAL_LIVELLO_R4).map(([k, v]) => [k, typeof v === 'string' ? v : [...v]]))).toEqual(golden.costanti.CONCESSI_DAL_LIVELLO)
        expect(LIVELLO_DELLA_POLITICA_R4).toEqual(golden.costanti.LIVELLO_DELLA_POLITICA)
    })

    it('PERM-01 `riassuntoSenzaChiedereR4` = `riassuntoSenzaChiedere`, riga per riga, Normale e Piano', () => {
        for (const lingua of LINGUE) {
            for (const r of golden.chip[lingua].righe) {
                const { permesso, mappa, modalitaOperativa, ...atteso } = r
                expect(riassuntoSenzaChiedereR4(permesso, mappa, { modalitaOperativa }, lingua), `${lingua} ${modalitaOperativa} ${permesso} ${JSON.stringify(mappa)}`).toEqual(atteso)
            }
        }
    })

    it('PERM-02 il tono del rischio e il nome della politica', () => {
        const permessi = ['Read only', 'Workspace write', 'On request', 'Full access', 'Research', 'Strano', null]
        expect(permessi.map((p) => tonoPermessoR4(p))).toEqual(golden.toni)
        for (const lingua of LINGUE) expect(permessi.map((p) => etichettaPermessoR4(p, lingua)), lingua).toEqual(golden.chip[lingua].etichette)
    })

    it('PERM-03 le quattro righe del foglio, nell\'ordine del desktop, con «Scrive nel progetto» consigliato', () => {
        expect(LIVELLI_PERMESSO_R4.map((l) => l.valore)).toEqual(['Read only', 'Workspace write', 'On request', 'Full access'])
        expect(LIVELLI_PERMESSO_R4.filter((l) => l.consigliato).map((l) => l.valore)).toEqual(['Workspace write'])
    })
})
