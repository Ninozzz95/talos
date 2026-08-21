import { describe, expect, it } from 'vitest'
import { talosTrattieniLeChiamate, haFormaDiChiamata } from '@/lib/chat/trattieniLeChiamate'

/** Fa scorrere un testo a pezzetti, come fa il motore. */
function scorri(testo: string, pezzo = 7): string {
    const t = talosTrattieniLeChiamate()
    let visto = ''
    for (let i = 0; i < testo.length; i += pezzo) visto += t.push(testo.slice(i, i + pezzo))
    return visto + t.flush()
}

/**
 * ⭐⭐⭐ Il JSON che scorreva a schermo MENTRE il modello elaborava.
 *
 * ⛔⛔ Fotografato dall'owner il 2026-08-21 con Gemma 3 4B: non nella
 * risposta finale - li' era gia' filtrato - ma **durante**. Ogni verifica che
 * guarda il testo finito e cieca a questo difetto.
 */
describe('TRATTIENI-CHIAMATE — quello che scorre, non quello che resta', () => {
    it('⛔⛔ il caso vero: la chiamata non arriva MAI a schermo', () => {
        const visto = scorri('{"name":"library_list","arguments":{"origin":"all"}}')
        expect(visto).toBe('')
    })

    it('⛔ e nemmeno spezzata in mille pezzetti da un token alla volta', () => {
        expect(scorri('{"name":"device_status"}', 1)).toBe('')
    })

    /*
     * ⛔⛔ IL VERSO CONTRARIO, ed e la meta che conta: trattenere una risposta
     * vera vorrebbe dire mangiarla. Meglio mostrare un JSON che perdere parole.
     */
    it('⛔ una risposta NORMALE esce tutta, e subito', () => {
        expect(scorri('Ciao! Come posso aiutarti?')).toBe('Ciao! Come posso aiutarti?')
    })

    it('⛔ un oggetto DATI non e una chiamata e si mostra', () => {
        const dati = '{"name":"Antonino","citta":"Catania"}'
        expect(scorri(dati)).toBe(dati)
    })

    it('⛔ il testo PRIMA e DOPO la chiamata non si perde', () => {
        const visto = scorri('Ecco: {"name":"x"} fatto.')
        expect(visto).toBe('Ecco:  fatto.')
    })

    it('⛔ una graffa dentro una STRINGA non apre niente', () => {
        const frase = 'Scrivi { per aprire'
        expect(scorri(frase)).toBe(frase)
    })

    /*
     * ⛔⛔ IL TETTO: senza, un modello che apre una graffa e parla a lungo
     * lascerebbe lo schermo FERMO, e uno schermo fermo per chi guarda e
     * un'app bloccata. Meglio un JSON che sembrare morti.
     */
    it('⛔⛔ e oltre il tetto si mostra comunque: mai lo schermo fermo', () => {
        const lunghissimo = '{' + 'a'.repeat(5_000)
        expect(scorri(lunghissimo).length).toBeGreaterThan(4_000)
    })

    it('⛔ e una coda non chiusa a fine risposta e TESTO, non una chiamata', () => {
        expect(scorri('{"name":"tronc')).toBe('{"name":"tronc')
    })

    it('haFormaDiChiamata e stretta: name stringa e nient altro di estraneo', () => {
        expect(haFormaDiChiamata('{"name":"x"}')).toBe(true)
        expect(haFormaDiChiamata('{"name":"x","arguments":{}}')).toBe(true)
        expect(haFormaDiChiamata('{"name":""}')).toBe(false)
        expect(haFormaDiChiamata('{"name":"x","altro":1}')).toBe(false)
        expect(haFormaDiChiamata('[]')).toBe(false)
    })
})
