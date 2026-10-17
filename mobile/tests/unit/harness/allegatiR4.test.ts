import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
    CARATTERI_PER_ALLEGATO_R4, FRASI_SOLO_IMMAGINE_R4, MASSIMO_FILE_R4, bollaDaConsegnaR4, bollaDaInviareR4, bollaPerLaRigiocataR4,
    conMenzioneR4, controllaImmagineR4, costoDelFileR4, testoAllegabileR4, testoPerIlModelloR4,
} from '@/lib/harness/r4/allegatiR4'

/**
 * ⛔ K3-C Allegati, A1 (ledger `LEDGER-K3-ALLEGATI-2026-10-16.md`): «Allega alla chat» come il desktop r4 @ 2161afb32
 * (`allegaFileAllaChat`, `legacy/app.js:20218`): `${campo.replace(/@[^\s]*$/, '')}@${percorso} `.
 */
describe('la menzione di un file nel campo (K3-C Allegati A1)', () => {
    it('ALL-01 come il desktop: si aggiunge in fondo con uno spazio; un @ lasciato a metà in fondo si sostituisce', () => {
        expect(conMenzioneR4('', 'src/app.mjs')).toBe('@src/app.mjs ')
        expect(conMenzioneR4('Guarda ', 'src/app.mjs')).toBe('Guarda @src/app.mjs ')
        expect(conMenzioneR4('Guarda @sr', 'src/app.mjs')).toBe('Guarda @src/app.mjs ')
        expect(conMenzioneR4('Guarda @', 'NOTA.md')).toBe('Guarda @NOTA.md ')
        // due file di seguito
        expect(conMenzioneR4(conMenzioneR4('', 'a.md'), 'b.md')).toBe('@a.md @b.md ')
        // un @ in mezzo non si tocca
        expect(conMenzioneR4('scrivi a @mario e poi', 'x.md')).toBe('scrivi a @mario e poi@x.md ')
    })
})

/**
 * ⛔ K3-C Allegati A2/A3: la bolla della persona e il testo per il modello, sul golden calcolato dal codice VERO del desktop r4 @ 2161afb32
 * (`bolla-della-persona.js` importata dal pin; `testoConAllegati`, `perIlModello`, `TETTO_TESTO_ALLEGATO` estratti da `legacy/app.js`).
 */
const golden = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'allegati-golden-701c6c0d2.json'), 'utf8'))

describe('la bolla della persona e il testo per il modello (K3-C Allegati A2/A3)', () => {
    it('ALL-02 il testo per il modello, sempre in inglese: intestazione, una riga per file, il contenuto dei file di testo entro il tetto', () => {
        for (const c of golden.casiTesto) expect(testoPerIlModelloR4(c.testo, c.allegati)).toBe(c.atteso)
    })

    it('ALL-03 la bolla da inviare: solo quando ciò che si vede è diverso da ciò che parte; le immagini non entrano nei chip', () => {
        for (const c of golden.casiBolla) expect(bollaDaInviareR4(c.mostra, c.perIlModello, c.allegati)).toEqual(c.atteso)
    })

    it('ALL-04 la rigiocata: la bolla conservata, o quella ricostruita dal testo per il modello (IT ed EN); le immagini nei chip', () => {
        for (const c of golden.casiConsegna) expect(bollaDaConsegnaR4(c.consegna)).toEqual(c.atteso)
        for (const c of golden.casiRigiocata) expect(bollaPerLaRigiocataR4(c)).toEqual(c.atteso)
        expect([...FRASI_SOLO_IMMAGINE_R4]).toEqual(golden.frasiSoloImmagine)
    })

    it('ALL-05 un\'immagine si allega solo PNG, JPEG o WebP fino a 5 MiB (come `allegaFile` del desktop)', () => {
        expect(controllaImmagineR4('image/jpeg', 5 * 1024 * 1024)).toBeNull()
        expect(controllaImmagineR4('image/png', 1)).toBeNull()
        expect(controllaImmagineR4('image/webp', 1)).toBeNull()
        expect(controllaImmagineR4('image/heic', 1)).toBe('formato')
        expect(controllaImmagineR4('image/gif', 1)).toBe('formato')
        expect(controllaImmagineR4('image/jpeg', 5 * 1024 * 1024 + 1)).toBe('grande')
    })
})

/**
 * ⛔ K3-C Allegati A3 (ledger `LEDGER-K3-ALLEGATI-2026-10-16.md`; owner 16/10, chip «Come il desktop»): il golden calcolato dal codice
 * VERO del desktop r4 @ 2161afb32 (`allegati-file-golden-701c6c0d2.json`): `èTestoAllegabile` di `legacy/app.js` e il costo del chip
 * (`stimaTokenTesto` + `etichettaCosto` di `components/allegati.js`), in italiano e in inglese.
 */
const goldenFile = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'allegati-file-golden-701c6c0d2.json'), 'utf8'))
describe('i file dal telefono (K3-C Allegati A3)', () => {
    it('ALL-06 quali file viaggiano col loro testo: come `èTestoAllegabile` del desktop, caso per caso', () => {
        for (const caso of goldenFile.testo) expect([caso.nome, caso.tipo, testoAllegabileR4(caso.nome, caso.tipo)]).toEqual([caso.nome, caso.tipo, caso.testo])
        expect(MASSIMO_FILE_R4).toBe(25 * 1024 * 1024)
        expect(CARATTERI_PER_ALLEGATO_R4).toBe(200_000)
    })

    it('ALL-07 il costo del chip: «~N token» dai caratteri, vuoto senza; nella lingua scelta', () => {
        for (const caso of goldenFile.costo.it) expect([caso.caratteri, costoDelFileR4(caso.caratteri, 'it')]).toEqual([caso.caratteri, caso.etichetta])
        for (const caso of goldenFile.costo.en) expect([caso.caratteri, costoDelFileR4(caso.caratteri, 'en-US')]).toEqual([caso.caratteri, caso.etichetta])
        expect(costoDelFileR4(undefined, 'it')).toBe('')
    })
})
