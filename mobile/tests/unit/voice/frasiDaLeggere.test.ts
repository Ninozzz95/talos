import { describe, expect, it } from 'vitest'
import { talosFrasiDaLeggere } from '@/lib/voice/frasiDaLeggere'

/**
 * ⛔⛔ LA VOCE PARTIVA A RISPOSTA FINITA.
 *
 * Owner 2026-08-10: «il TTS deve partire di pari passo con il rendering della
 * risposta». Oggi si aspetta la fine, e quando la voce comincia la risposta è
 * già stata letta con gli occhi: la lettura arriva quando non serve più.
 *
 * ⇒ Si legge per FRASI COMPLETE. Questi casi fissano cosa vuol dire
 * «completa», ed è la parte che sbaglierebbe una regola ingenua.
 */
describe('⛔ si legge per frasi, mentre la risposta arriva', () => {
    it('una frase chiusa si può dire; il resto aspetta', () => {
        const r = talosFrasiDaLeggere('Ciao Melo. Sto ancora scriv', 0, false)
        expect(r.pronte).toEqual(['Ciao Melo.'])
        expect(r.resto).toBe(' Sto ancora scriv')
    })

    it('⛔ «dott.» e «3.14» NON sono fini di frase', () => {
        // Una regola che taglia su ogni punto fa dire «dott» con la voce che
        // scende e poi riparte: il difetto suona peggio del silenzio.
        expect(talosFrasiDaLeggere('Il dott. Rossi arriva alle 3.14 di notte', 0, false).pronte)
            .toEqual([])
        expect(talosFrasiDaLeggere('Il dott. Rossi arriva. Poi va via', 0, false).pronte)
            .toEqual(['Il dott. Rossi arriva.'])
    })

    it('un a capo chiude comunque: gli elenchi non hanno punti', () => {
        const r = talosFrasiDaLeggere('Prima riga\nSeconda riga', 0, false)
        expect(r.pronte).toEqual(['Prima riga'])
    })

    it('⛔ non si ripete ciò che è già stato detto', () => {
        const testo = 'Uno. Due. Tre.'
        const primo = talosFrasiDaLeggere(testo, 0, false)
        const giaDette = testo.length - primo.resto.length
        const secondo = talosFrasiDaLeggere(testo + ' Quattro.', giaDette, false)
        expect(secondo.pronte.join(' ')).not.toContain('Uno.')
    })

    it('a flusso FINITO si dice anche l\'ultimo pezzo, anche senza punto', () => {
        const r = talosFrasiDaLeggere('Ciao. E questa non ha il punto', 0, true)
        expect(r.pronte).toEqual(['Ciao.', 'E questa non ha il punto'])
        expect(r.resto).toBe('')
    })

    it('⛔ mentre arriva, l\'ultimo pezzo NON si dice: è quasi sempre monco', () => {
        const r = talosFrasiDaLeggere('Ciao. E questa non ha il pu', 0, false)
        expect(r.pronte).toEqual(['Ciao.'])
        expect(r.resto).toContain('E questa non ha il pu')
    })

    it('⛔ una risposta senza punteggiatura non resta muta per sempre', () => {
        // Un elenco, del codice, una lingua senza punti: oltre il tetto si dice
        // quello che c'è. Meglio una frase tagliata male che il silenzio.
        const lungo = 'parola '.repeat(700)
        const r = talosFrasiDaLeggere(lungo, 0, false)
        expect(r.pronte.length).toBe(1)
        expect(r.resto).toBe('')
    })

    it('niente di nuovo, niente da dire', () => {
        expect(talosFrasiDaLeggere('Ciao.', 5, false)).toEqual({ pronte: [], resto: '' })
    })
})
