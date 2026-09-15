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

/**
 * ⛔⛔ TALOS HA PRONUNCIATO «device_screen_drive».
 *
 * MISURATO sul Pad l'11 agosto con una sonda sul ponte nativo
 * (`Capacitor.nativePromise` → `["TalosSpeech","speak",{text}]`), durante una
 * corsa del pilota. Catturato, in ordine:
 *
 *     "device_screen_drive"                 ⛔ il nome INTERNO, ad alta voce
 *     "Ok, vado alla schermata iniziale"    ✅ la voce del pilota
 *
 * La lettura segue il testo in streaming, e in quell'istante lo stream del
 * provider portava il nome del tool nel canale di testo. È la famiglia di
 * `nessunNomeInterno`, stavolta all'orecchio.
 */
describe('⛔ un nome interno non si pronuncia', () => {
    it('il caso catturato: la riga col solo id non arriva al motore', () => {
        const { pronte } = talosFrasiDaLeggere('device_screen_drive\n', 0, true)
        expect(pronte).toEqual([])
    })

    it('e vale per qualunque id del catalogo, anche fra virgolette', () => {
        expect(talosFrasiDaLeggere('"device_torch"\n', 0, true).pronte).toEqual([])
        expect(talosFrasiDaLeggere('library_list.\n', 0, true).pronte).toEqual([])
    })

    it('⛔ ma una FRASE che contiene il nome si dice comunque', () => {
        // Togliere una parola in mezzo lascerebbe un buco che si sente. Quel
        // che conta è non leggere una riga che è SOLO un identificativo.
        const { pronte } = talosFrasiDaLeggere('Ho usato device_torch per accenderla.\n', 0, true)
        expect(pronte).toEqual(['Ho usato device_torch per accenderla.'])
    })

    it('⛔ e una parola normale col trattino basso NON viene zittita', () => {
        // Il criterio è stretto di proposito: solo ciò che combacia con un id
        // del catalogo. Un filtro generico mangerebbe nomi di file e codice.
        const { pronte } = talosFrasiDaLeggere('vecchio_nome_file\n', 0, true)
        expect(pronte).toEqual(['vecchio_nome_file'])
    })
})
