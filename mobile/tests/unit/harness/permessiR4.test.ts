import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
    CONCESSI_DAL_LIVELLO_R4, GRUPPI_SENZA_CHIEDERE_R4, LIVELLI_PERMESSO_R4, LIVELLO_DELLA_POLITICA_R4, chipDelPermessoR4, riassuntoSenzaChiedereR4, tonoPermessoR4,
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

/**
 * J3 (24/10/2026; owner, decisione confermata dal Desktop): nel compositore il NOME BREVE del livello, come il desktop
 * `chipDelPermesso` (`chat-foot.js` @ c6d1cbff2); la frase di C1 apre il suggerimento. Gli stessi casi di CHIP-BREVE-01/02/03.
 */
describe('il nome breve del permesso nel compositore (desktop c6d1cbff2)', () => {
    it('CHIP-BREVE-01 nome breve del livello; la frase di C1 apre il suggerimento, seguita da quello di prima', () => {
        const c = chipDelPermessoR4('Workspace write', {}, {}, 'it')
        expect(c.testo).toBe('Scrive nel progetto')
        expect(c.suggerimento).toBe(`Senza chiedere: file, comandi, documenti\n${riassuntoSenzaChiedereR4('Workspace write', {}, {}, 'it').suggerimento}`)
        expect(chipDelPermessoR4('Full access', {}, {}, 'it').testo).toBe('Accesso pieno')
        expect(chipDelPermessoR4('On request', {}, {}, 'it').testo).toBe('Chiede prima')
        expect(chipDelPermessoR4('Full access', {}, {}, 'en').testo).toBe(etichettaPermessoR4('Full access', 'en'))
    })
    it('CHIP-BREVE-02 le eccezioni per attrezzo restano a schermo (un «sempre» su Solo lettura non si nasconde)', () => {
        const c = chipDelPermessoR4('Read only', { scrivi: 'sempre' }, {}, 'it')
        expect(c.testo).toBe('Solo lettura · 1 eccezione')
        expect(c.suggerimento.startsWith('Senza chiedere: file (solo scrittura)\n'), c.suggerimento).toBe(true)
        expect(chipDelPermessoR4('Full access', { shell: 'chiedi', prova: 'chiedi' }, {}, 'it').testo).toBe('Accesso pieno · 2 eccezioni')
        expect(chipDelPermessoR4('Workspace write', { delega_sottotask: 'chiedi' }, {}, 'it').testo, 'la Coordinazione non è un’eccezione').toBe('Scrive nel progetto')
    })
    it('CHIP-BREVE-03 AL CONTRARIO: dove la frase di C1 è già il nome, il suggerimento non la ripete; il Piano resta com’era', () => {
        const ro = chipDelPermessoR4('Read only', {}, {}, 'it')
        expect(ro.testo).toBe('Solo lettura')
        expect(ro.suggerimento).toBe(riassuntoSenzaChiedereR4('Read only', {}, {}, 'it').suggerimento)
        const piano = chipDelPermessoR4('Full access', {}, { modalitaOperativa: 'piano' }, 'it')
        expect(piano).toEqual({ testo: 'Piano: solo lettura', suggerimento: riassuntoSenzaChiedereR4('Full access', {}, { modalitaOperativa: 'piano' }, 'it').suggerimento })
    })
})
