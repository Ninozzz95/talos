import { describe, expect, it } from 'vitest'
import { talosTestoDaLeggere } from '@/services/speech'

/**
 * ⛔⛔ IL TTS DICEVA «CIAO MANO CHE SALUTA».
 *
 * Owner 2026-08-10, sentito sul Pad. Ogni emoji ha un NOME nel database
 * Unicode, e `TextToSpeech` legge quello: «Ciao 👋» diventa «Ciao mano che
 * saluta». I modelli chiudono quasi ogni risposta con un'emoji, quindi ogni
 * lettura finiva con una didascalia detta ad alta voce.
 *
 * ⛔ La trappola sta nel filtro sbagliato: `\p{Emoji}` comprende le CIFRE — 0-9
 * hanno quella proprietà per via dei tasti numerici — e toglierebbe i numeri
 * dalle risposte. Un filtro che cancella «2026» è peggio dell'emoji.
 */
describe('⛔ gli emoji non arrivano al motore vocale', () => {
    it('il caso sentito: «Ciao 👋» perde la mano e tiene il saluto', () => {
        expect(talosTestoDaLeggere('Ciao 👋')).toBe('Ciao')
    })

    it('anche quelle composte: famiglia, bandiere, tonalità della pelle', () => {
        expect(talosTestoDaLeggere('Ecco 👨‍👩‍👧 la famiglia')).toBe('Ecco la famiglia')
        expect(talosTestoDaLeggere('Italia 🇮🇹 e basta')).toBe('Italia e basta')
        expect(talosTestoDaLeggere('Bravo 👍🏽 davvero')).toBe('Bravo davvero')
    })

    it('⛔ I NUMERI RESTANO: è la trappola di «\\p{Emoji}»', () => {
        expect(talosTestoDaLeggere('Nel 2026 costa 3 euro')).toBe('Nel 2026 costa 3 euro')
        expect(talosTestoDaLeggere('Sono le 15:30 del 10/08')).toBe('Sono le 15:30 del 10/08')
    })

    it('e le lettere accentate e la punteggiatura non si toccano', () => {
        expect(talosTestoDaLeggere('Però è così, perché no?'))
            .toBe('Però è così, perché no?')
    })

    it('una risposta di soli emoji non diventa una frase vuota da leggere', () => {
        // `speak` rifiuta un testo vuoto con `empty`, che e' l'esito onesto:
        // meglio dire «non c'e' niente da leggere» che leggere il silenzio.
        expect(talosTestoDaLeggere('🎉🎉🎉')).toBe('')
    })

    it('e il resto del filtro continua a valere', () => {
        expect(talosTestoDaLeggere('**ok** 🚀 e `codice`')).toBe('ok e codice')
        expect(talosTestoDaLeggere('<think>penso 🤔</think>Detto.')).toBe('Detto.')
    })
})
