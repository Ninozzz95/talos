import { describe, expect, it } from 'vitest'
import { talosTestoDaLeggere } from '@/services/speech'

/**
 * ⛔⛔ IL TTS LEGGEVA ANCHE IL RAGIONAMENTO.
 *
 * Owner 2026-08-10: «il tts legge anche il blocco di ragionamento, deve solo
 * leggere la risposta».
 *
 * Non è estetica. Il ragionamento è lungo quanto la risposta o di più, è
 * scritto per la macchina e non per un orecchio, e spesso è in inglese mentre
 * la risposta è in italiano. Chi preme «leggi» si sente leggere il processo
 * invece del risultato: la funzione diventa inservibile.
 *
 * ⛔ E la difesa sta QUI e non nel componente: `talosTestoDaLeggere` è il collo
 * di bottiglia da cui passa ogni frase prima del motore, qualunque sia il
 * pulsante che l'ha chiesta. Metterla in un pulsante vuol dire dimenticarla nel
 * secondo.
 *
 * ⛔ NON RIPRODOTTO SUL DISPOSITIVO: la variante di prova era appena stata
 * reinstallata e non aveva più la chiave del provider, quindi non poteva
 * generare una risposta con ragionamento. Questa è una difesa sulle due cause
 * candidate, non una causa confermata — e va detto invece di lasciarlo credere.
 */
describe('⛔ si legge la risposta, non il ragionamento', () => {
    it('toglie un blocco <think> e tiene la risposta', () => {
        const t = talosTestoDaLeggere('<think>L utente chiede l ora. Devo calcolare.</think>Sono le tre.')
        expect(t).toBe('Sono le tre.')
    })

    it('toglie <thinking> in maiuscolo o minuscolo', () => {
        expect(talosTestoDaLeggere('<THINKING>ragiono</THINKING>Ciao.')).toBe('Ciao.')
        expect(talosTestoDaLeggere('<thinking>ragiono</thinking>Ciao.')).toBe('Ciao.')
    })

    it('⛔ un blocco APERTO e mai chiuso non si legge fino in fondo', () => {
        // Una risposta interrotta a metà del ragionamento: senza questa riga
        // la voce leggerebbe tutto il pensiero e poi il silenzio.
        const t = talosTestoDaLeggere('Ecco. <think>sto ancora pensando e non ho finito')
        expect(t).toBe('Ecco.')
    })

    it('un ragionamento in mezzo non porta via la risposta che lo segue', () => {
        const t = talosTestoDaLeggere('Prima parte. <think>calcolo</think> Seconda parte.')
        expect(t).toContain('Prima parte.')
        expect(t).toContain('Seconda parte.')
        expect(t).not.toContain('calcolo')
    })

    it('⛔ NON mangia una risposta che PARLA di ragionamento', () => {
        // Un filtro più largo — per parole tipo «Ragionamento:» — cancellerebbe
        // una risposta legittima. Si tolgono le etichette, non i concetti.
        const t = talosTestoDaLeggere('Il mio ragionamento è semplice: due più due fa quattro.')
        expect(t).toBe('Il mio ragionamento è semplice: due più due fa quattro.')
    })

    it('e continua a togliere il Markdown, che era il motivo originale', () => {
        expect(talosTestoDaLeggere('**ok** e `codice`')).toBe('ok e codice')
    })
})
