/**
 * «Questo modello parla la tua lingua?»
 *
 * Nato da un caso vero, 2026-08-05: l'owner ha scaricato
 * `hyperclovax-seed-text-instruct-1.5b` — il modello coreano di NAVER — e gli
 * ha parlato italiano. Ne e' uscito italiano di forma ma non di sostanza («il
 * tiziano», «ti prossio», «technicala») con **자연** che scappava in mezzo a una
 * frase.
 *
 * Il motore aveva funzionato perfettamente. Era il MODELLO a essere sbagliato
 * per la lingua, e **niente glielo aveva detto** — prima di scaricare due
 * gigabyte.
 *
 * ## Il dato c'e' gia', e non lo usavamo
 *
 * MISURATO sull'API del Hub lo stesso giorno:
 *
 *     Llama-3.2-1B   →  language: ["en","de","fr","it","pt","hi","es","th"]
 *     HyperCLOVAX    →  nessuna dichiarazione
 *
 * ## Tre stati, non due
 *
 * Un booleano mentirebbe. «Non dichiara» **non e'** «non la parla»: e' l'assenza
 * di una dichiarazione, ed e' la stessa dottrina del filtro di peso e di «Ci
 * sta» — «non lo so» non e' «no».
 *
 * L'unico stato che merita un avviso e' quello di mezzo: il modello dichiara le
 * sue lingue, e la tua non c'e'. Li' si sa, e tacere sarebbe una scelta.
 */
import { describe, expect, it } from 'vitest'
import { talosModelSpeaks } from '@/lib/models/modelLanguages'

describe('questo modello parla la mia lingua?', () => {
    it('conferma quando la lingua è dichiarata', () => {
        expect(talosModelSpeaks(['en', 'de', 'fr', 'it', 'pt'], 'it')).toBe('yes')
    })

    it('AVVISA quando dichiara altre lingue e la tua non c`è', () => {
        // È l'unico caso in cui si sa qualcosa di utile e negativo.
        expect(talosModelSpeaks(['ko', 'en'], 'it')).toBe('no')
    })

    it('dice «non si sa» quando il modello non dichiara niente', () => {
        // Il caso di HyperCLOVAX. Non è «non la parla»: è che non lo dice.
        expect(talosModelSpeaks([], 'it')).toBe('unknown')
        expect(talosModelSpeaks(null, 'it')).toBe('unknown')
        expect(talosModelSpeaks(undefined, 'it')).toBe('unknown')
    })

    it('accetta le varianti regionali senza farne una lingua diversa', () => {
        // `pt-BR` è portoghese. Trattarlo come lingua ignota manderebbe un
        // avviso sbagliato a mezzo Brasile.
        expect(talosModelSpeaks(['en', 'pt-BR'], 'pt')).toBe('yes')
        expect(talosModelSpeaks(['zh-Hans'], 'zh')).toBe('yes')
    })

    it('non si fa ingannare da maiuscole o spazi', () => {
        expect(talosModelSpeaks([' IT ', 'EN'], 'it')).toBe('yes')
    })

    it('«multilingual» dichiarato non basta a dire di sì', () => {
        /*
         * Alcune schede mettono `multilingual` fra le lingue. È un'etichetta,
         * non un elenco: prometterla come «sì, parla l'italiano» sarebbe
         * inventare. Resta «non si sa», che è la verità.
         */
        expect(talosModelSpeaks(['multilingual'], 'it')).toBe('unknown')
    })
})
