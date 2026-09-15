import { describe, expect, it } from 'vitest'
import { costruisciCatalogo, risolviSimbolo, ambitoEUnFile } from '@/lib/kernel/catalogo'

/**
 * ⛔⛔ La failure matrix, e ha DUE colonne. Una tabella che elenca solo i modi
 * di non sapere prova che il codice è paranoico, non che è corretto: un catalogo
 * che rispondesse `ignoto` a tutto la passerebbe in pieno. La seconda colonna è
 * quella che cattura il freno a mano.
 */

const PREZZO = 'export function conSconto(c) { return c }\n'
const cat = (file: Record<string, string | null>) =>
    costruisciCatalogo(Object.entries(file).map(([percorso, testo]) => ({ percorso, testo })))

describe('il catalogo dei simboli', () => {
    it('PRESENTE porta il testimone: dove l\'ha visto', async () => {
        const esito = risolviSimbolo(await cat({ 'src/prezzo.mjs': PREZZO }), 'conSconto', 'src/prezzo.mjs')
        expect(esito.stato).toBe('presente')
        expect(esito.fatto?.ambito).toBe('src/prezzo.mjs')
        expect(esito.fatto?.famiglia).toBe('symbol-declared')
    })

    it('⭐ ASSENTE solo con copertura COMPLETA su tutto l\'ambito', async () => {
        const esito = risolviSimbolo(await cat({ 'src/prezzo.mjs': PREZZO }), 'scontoFedelta', 'src/prezzo.mjs')
        expect(esito.stato).toBe('assente')
        expect(esito.stato === 'assente' && esito.copertura).toBe('completa')
    })

    it('⛔⛔ un file ROTTO nell\'ambito rende IGNOTO, non assente', async () => {
        const esito = risolviSimbolo(await cat({
            'src/prezzo.mjs': PREZZO,
            'src/mezzo.mjs': 'export function a( { return',
        }), 'scontoFedelta', 'src')
        expect(esito.stato).toBe('ignoto')
        expect(esito.stato === 'ignoto' && esito.perche).toContain('src/mezzo.mjs')
    })

    it('⛔ un file ILLEGGIBILE (testo null) rende IGNOTO', async () => {
        const esito = risolviSimbolo(await cat({
            'src/prezzo.mjs': PREZZO,
            'src/chiuso.mjs': null,
        }), 'scontoFedelta', 'src')
        expect(esito.stato).toBe('ignoto')
    })

    it('⛔ una lingua non supportata nell\'ambito rende IGNOTO', async () => {
        const esito = risolviSimbolo(await cat({
            'src/prezzo.mjs': PREZZO,
            'src/motore.py': 'def scontoFedelta(c): return c',
        }), 'scontoFedelta', 'src')
        expect(esito.stato).toBe('ignoto')
        // Il simbolo potrebbe essere proprio là dentro — e infatti c'è.
    })

    it('⭐⭐ la copertura è del PREDICATO PER QUELL\'AMBITO, non del catalogo', async () => {
        const catalogo = await cat({
            'src/prezzo.mjs': PREZZO,
            'altro/rotto.mjs': 'function ( {{{',
        })
        expect(risolviSimbolo(catalogo, 'scontoFedelta', 'src/prezzo.mjs').stato).toBe('assente')
        expect(risolviSimbolo(catalogo, 'scontoFedelta', 'altro').stato).toBe('ignoto')
        // Legare la copertura al catalogo intero renderebbe `assente`
        // irraggiungibile in qualunque progetto vero.
    })

    it('⭐ un FILE che non esiste è ASSENTE: dichiara zero, e sono tutti guardati', async () => {
        const esito = risolviSimbolo(await cat({ 'src/prezzo.mjs': PREZZO }), 'caricaListino', 'src/listino.mjs')
        expect(esito.stato).toBe('assente')
        // Senza questo, creare un simbolo in un file nuovo sarebbe sospeso — e il
        // kernel sarebbe un freno a mano al primo lavoro legittimo.
    })

    it('⛔ ma una CARTELLA che non esiste è IGNOTO', async () => {
        expect(risolviSimbolo(await cat({ 'src/prezzo.mjs': PREZZO }), 'x', 'altrove').stato).toBe('ignoto')
    })

    it('l\'ambito distingue file e cartella dall\'estensione', () => {
        expect(ambitoEUnFile('src/prezzo.mjs')).toBe(true)
        expect(ambitoEUnFile('src')).toBe(false)
        expect(ambitoEUnFile('src/')).toBe(false)
    })

    it('⛔ e la MENZIONE non conta come dichiarazione, neanche qui', async () => {
        const esito = risolviSimbolo(await cat({
            'src/prezzo.mjs': `${PREZZO}// scontoFedelta andrebbe qui\nexport const nota = "scontoFedelta"\n`,
        }), 'scontoFedelta', 'src/prezzo.mjs')
        expect(esito.stato).toBe('assente')
    })

    it('⭐ e trova il simbolo in QUALUNQUE file dell\'ambito', async () => {
        const esito = risolviSimbolo(await cat({
            'src/prezzo.mjs': PREZZO,
            'src/listino.mjs': 'export function caricaListino(t) { return t }',
        }), 'caricaListino', 'src')
        expect(esito.stato).toBe('presente')
        expect(esito.fatto?.ambito).toBe('src/listino.mjs')
    })
})

describe('i confini dell\'ambito', () => {
    it('⛔⛔ la cartella «src» NON include «srcvecchio» — il prefisso non è il confine', async () => {
        const catalogo = await cat({
            'src/prezzo.mjs': PREZZO,
            'srcvecchio/prezzo.mjs': 'export function scontoFedelta(c) { return c }',
        })
        const esito = risolviSimbolo(catalogo, 'scontoFedelta', 'src')
        expect(esito.stato).toBe('assente')
        // ⛔ Con un confronto per prefisso nudo, `scontoFedelta` risulterebbe
        // PRESENTE in `src` perché sta in una cartella che si chiama quasi
        // uguale. Il separatore fa parte del confine.
    })

    it('⛔ e nemmeno un FILE «src.mjs» finisce dentro la cartella «src»', async () => {
        const catalogo = await cat({
            'src/prezzo.mjs': PREZZO,
            'src.mjs': 'export function scontoFedelta(c) { return c }',
        })
        expect(risolviSimbolo(catalogo, 'scontoFedelta', 'src').stato).toBe('assente')
    })

    it('⭐ ma le sottocartelle profonde ci stanno dentro', async () => {
        const catalogo = await cat({ 'src/a/b/c/f.mjs': 'export function giu(c) { return c }' })
        expect(risolviSimbolo(catalogo, 'giu', 'src').stato).toBe('presente')
    })
})
