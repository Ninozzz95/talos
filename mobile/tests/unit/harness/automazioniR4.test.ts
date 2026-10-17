import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
    ATTREZZI_CON_CARTA_R4, ATTREZZI_FORNITORI_CON_CARTA_R4, avvisoInParoleR4, bloccoCartaAutomazioneR4, bloccoCartaFornitoriR4, eCartaAutomazioneR4,
    eCartaFornitoriR4, minacciaInParoleR4, notaDelTelefonoR4, parolePianificazioneR4, testiCartaAutomazioneR4, testiCartaFornitoriR4, valoreInParoleR4,
    cartaModificabileR4,
} from '@/lib/harness/r4/automazioniR4'
import { nomeModelloUmanoR4 } from '@/lib/harness/r4/modelloR4'
import { CHIAVE_COORDINAZIONE_R4, TETTO_AVVII_DA_SOLO_R4, coordinazioneAccesaNellaCatenaR4, catenaDellaSessioneR4 } from '@/lib/harness/r4/coordinazioneR4'

/**
 * ⛔ K3 automazioni, fornitori e Coordinazione (ledger `LEDGER-K3-AUTOMAZIONI-FORNITORI-COORDINAZIONE-2026-10-17.md`). Golden calcolato
 * dal codice VERO del desktop r4 @ 701c6c0d2 in jsdom (`automazioni-golden-701c6c0d2.json`, generatore `scratchpad/mcp-auto/
 * golden-automazioni.mjs`): `automazione-carta.js`, `fornitori-carta.js`, `automazioni-v2.js`, `chat-foot.js` (`nomeModelloUmano`),
 * `coordinazione.js`, sulle 9 azioni VERE di un flusso registrato col fornitore finto più 12 sintetiche. Date in UTC.
 */
process.env.TZ = 'UTC'
const golden = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'automazioni-golden-701c6c0d2.json'), 'utf8'))
const LINGUE = ['it', 'en'] as const

describe('le carte delle automazioni e dei fornitori come il desktop @ 701c6c0d2', () => {
    it('AUT-00 il golden è del pin, e le costanti sono le sue', () => {
        expect(golden.origine.commit).toBe('701c6c0d2d711879b53aa21bddad5a06d33538e7')
        expect(ATTREZZI_CON_CARTA_R4).toEqual(golden.costanti.ATTREZZI_CON_CARTA)
        expect(ATTREZZI_FORNITORI_CON_CARTA_R4).toEqual(golden.costanti.ATTREZZI_FORNITORI_CON_CARTA)
        expect(CHIAVE_COORDINAZIONE_R4).toBe(golden.costanti.CHIAVE_COORDINAZIONE)
        expect(TETTO_AVVII_DA_SOLO_R4).toBe(golden.costanti.TETTO_AVVII_DA_SOLO)
    })

    it('AUT-01 per ogni azione: quale carta, se si modifica, le parole e il blocco, in italiano e in inglese', () => {
        for (const lingua of LINGUE) {
            golden.azioni.forEach((azione: unknown, i: number) => {
                const atteso = golden.carte[lingua][i]
                const auto = eCartaAutomazioneR4(azione)
                const forn = eCartaFornitoriR4(azione)
                expect({ auto, forn }, `${lingua} ${i}`).toEqual({ auto: atteso.auto, forn: atteso.forn })
                if (!auto && !forn) return
                const testi = auto ? testiCartaAutomazioneR4(azione, lingua) : testiCartaFornitoriR4(azione, lingua)
                const blocco = auto ? bloccoCartaAutomazioneR4(azione, lingua) : bloccoCartaFornitoriR4(azione, lingua)
                expect({ modificabile: auto ? cartaModificabileR4(azione) : false, testi: { nota: '', ...testi }, blocco }, `${lingua} ${i}`)
                    .toEqual({ modificabile: atteso.modificabile, testi: atteso.testi, blocco: atteso.blocco })
            })
        }
    })

    it('AUT-02 le parole: pianificazioni, minacce, ciò che va oltre la chat, i valori dei campi', () => {
        for (const lingua of LINGUE) {
            const p = golden.parole[lingua]
            expect(golden.pianificazioni.map((x: unknown) => parolePianificazioneR4(x, lingua)), lingua).toEqual(p.pianificazioni)
            expect(golden.minacce.map((x: string) => minacciaInParoleR4(x, lingua)), lingua).toEqual(p.minacce)
            expect(golden.oltre.map((x: unknown) => avvisoInParoleR4(x, lingua)), lingua).toEqual(p.oltre)
            expect(p.valori.map((v: { campo: string; valore: unknown }) => valoreInParoleR4(v.campo, v.valore, lingua)), lingua).toEqual(p.valori.map((v: { testo: string }) => v.testo))
        }
    })

    it('AUT-03 il nome umano di un modello (mai l\'id grezzo a schermo)', () => {
        for (const lingua of LINGUE) expect(golden.modelli.map((m: unknown) => nomeModelloUmanoR4(m, lingua)), lingua).toEqual(golden.nomiModelli[lingua])
    })

    it('AUT-04 Coordinazione: accesa solo se ogni anello la eredita o è «sempre» e la conversazione principale è «sempre»', () => {
        expect(golden.catene.map((c: unknown) => coordinazioneAccesaNellaCatenaR4(c))).toEqual(golden.coordinazione)
    })

    it('AUT-05 la catena di una sessione (`catenaCoordinazioneDella`, `legacy/app.js`): prima le scelte vive della sessione aperta, poi i padri dall’elenco; un anello che manca o un giro in tondo, nessuna catena', () => {
        const voci = [
            { sessionId: 'p', permessiPerAttrezzo: { delega_sottotask: 'sempre' } },
            { sessionId: 'f', padreId: 'p', permessiPerAttrezzo: {} },
            { sessionId: 'n', padreId: 'f' },
            { sessionId: 'orfana', padreId: 'manca' },
            { sessionId: 'a', padreId: 'b' }, { sessionId: 'b', padreId: 'a' },
        ]
        const vive = { delega_sottotask: 'chiedi' }
        expect(catenaDellaSessioneR4('p', voci, vive)).toEqual({ delega: false, scelte: [vive] })
        expect(catenaDellaSessioneR4('n', voci, vive)).toEqual({ delega: true, scelte: [vive, {}, { delega_sottotask: 'sempre' }] })
        expect(catenaDellaSessioneR4('orfana', voci, vive)).toEqual({ delega: true, scelte: null })
        expect(catenaDellaSessioneR4('a', voci, vive)).toEqual({ delega: true, scelte: null })
        expect(catenaDellaSessioneR4('sconosciuta', voci, vive)).toEqual({ delega: false, scelte: [vive] })
    })

    it('AUT-06 la riga del telefono: solo dove si pianifica (crea, modifica, riprendi), mai per «esegui ora» né per i fornitori', () => {
        expect(golden.azioni.map((a: { tipo?: string } | null) => notaDelTelefonoR4(a))).toEqual(golden.azioni.map((a: { tipo?: string } | null) => ['automation_create', 'automation_update', 'automation_resume'].includes(a?.tipo ?? '')))
    })
})
