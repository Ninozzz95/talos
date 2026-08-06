import { describe, expect, it } from 'vitest'
import { talosCreateThinkSplitter, talosSplitFinalThink } from '@/lib/chat/thinkStream'

/** Manda una risposta a pezzi e raccoglie le due metà. */
function attraverso(pezzi: readonly string[]) {
    const splitter = talosCreateThinkSplitter()
    let text = ''
    let reasoning = ''
    for (const pezzo of pezzi) {
        const fetta = splitter.push(pezzo)
        text += fetta.text
        reasoning += fetta.reasoning
    }
    const fine = splitter.flush()
    return { text: text + fine.text, reasoning: reasoning + fine.reasoning }
}

/**
 * C45-RED-19N — il ragionamento si separa MENTRE arriva.
 *
 * Visto sul tablet il 2026-08-06 con Qwen3-1.7B-Q8_0: la bolla mostrava
 * `<think> Okay, the user wants me to…` per tutta la generazione. Sul lato
 * nativo la separazione avviene a risposta finita — e su un modello locale
 * quel «finita» arriva dopo decine di secondi, cioè dopo quasi tutto il tempo
 * in cui qualcuno sta guardando.
 */
describe('C45-RED-19N think splitter', () => {
    it('manda il ragionamento nel suo cassetto e il resto nella bolla', () => {
        expect(attraverso(['<think>rifletto</think>PRONTO'])).toEqual({
            text: 'PRONTO',
            reasoning: 'rifletto',
        })
    })

    /**
     * Il caso vero: uno stream arriva a pezzi arbitrari e il tag cade in mezzo.
     * Chi cercasse il marcatore dentro ogni pezzo non lo troverebbe mai, e
     * lascerebbe passare mezzo tag — testo MUTILATO, che è peggio di sporco.
     */
    it('regge un tag spezzato fra due pezzi', () => {
        expect(attraverso(['<thi', 'nk>rifle', 'tto</thi', 'nk>PRON', 'TO'])).toEqual({
            text: 'PRONTO',
            reasoning: 'rifletto',
        })
    })

    it('regge un tag spezzato carattere per carattere', () => {
        const pezzi = '<think>ragiono</think>ecco'.split('')
        expect(attraverso(pezzi)).toEqual({ text: 'ecco', reasoning: 'ragiono' })
    })

    /** Una risposta senza ragionamento passa intatta, senza latenza aggiunta. */
    it('lascia passare il testo che non ha tag', () => {
        expect(attraverso(['Ciao', ' mondo'])).toEqual({ text: 'Ciao mondo', reasoning: '' })
    })

    /**
     * La coda trattenuta va RILASCIATA alla fine. Senza `flush`, una risposta
     * che finisce con un carattere ambiguo perderebbe quel pezzo — e sparirebbe
     * in silenzio, che è il modo peggiore di sbagliare.
     */
    it('non mangia la coda quando la risposta finisce con un carattere ambiguo', () => {
        expect(attraverso(['fatto <'])).toEqual({ text: 'fatto <', reasoning: '' })
        expect(attraverso(['a</thin'])).toEqual({ text: 'a</thin', reasoning: '' })
    })

    /** Un ragionamento mai chiuso resta ragionamento: non invade la risposta. */
    it('un blocco aperto e mai chiuso non finisce nella bolla', () => {
        expect(attraverso(['<think>sto pensando e poi il modello si ferma'])).toEqual({
            text: '',
            reasoning: 'sto pensando e poi il modello si ferma',
        })
    })

    /** Più blocchi in una risposta sola: succede con i modelli che ragionano a tratti. */
    it('regge più blocchi alternati', () => {
        expect(attraverso(['<think>uno</think>A<think>due</think>B'])).toEqual({
            text: 'AB',
            reasoning: 'unodue',
        })
    })

    /**
     * Ciò che esce PEZZO PER PEZZO deve essere già pulito: è il punto di tutto.
     * Se il testo si pulisse solo alla fine, la bolla mostrerebbe il marcatore
     * per tutto il tempo — cioè il difetto di partenza.
     */
    it('non emette mai il marcatore in nessun pezzo intermedio', () => {
        const splitter = talosCreateThinkSplitter()
        const pezzi = ['<thi', 'nk>rag', 'iono</th', 'ink>ris', 'posta']
        for (const pezzo of pezzi) {
            const fetta = splitter.push(pezzo)
            expect(fetta.text).not.toMatch(/<|>/)
        }
    })
})

/**
 * Il testo FINALE, che è quello che finisce nel database e che si rilegge
 * riaprendo la chat — cioè per sempre.
 *
 * Visto sul OnePlus Pad 3 il 2026-08-06 con **Qwen3-MoE-6x0.6B**: la sezione
 * «Ragionamento» cominciava con `<think> Okay, let's look at the user's last
 * message…`. Lo streaming era già stato corretto quella mattina; questo era il
 * punto scoperto, perché il risultato finale arriva da `common_chat_parse` sul
 * lato nativo e non passava dal separatore.
 */
describe('il testo finale, non solo lo stream', () => {
    it('toglie il marcatore che il ponte nativo si è lasciato dietro', () => {
        expect(talosSplitFinalThink('PRONTO', "<think> Okay, let's look…"))
            .toEqual({ text: 'PRONTO', reasoning: " Okay, let's look…" })
    })

    it('separa un blocco rimasto dentro il testo, non solo dentro il ragionamento', () => {
        expect(talosSplitFinalThink('<think>rifletto</think>ecco', null))
            .toEqual({ text: 'ecco', reasoning: 'rifletto' })
    })

    /**
     * Un blocco aperto e mai chiuso non deve finire nella bolla: è il caso in
     * cui una `replace` dei due tag fallirebbe, e il motivo per cui qui si riusa
     * lo stesso separatore dello stream invece di scrivere una regola nuova.
     */
    it('un blocco aperto e mai chiuso resta ragionamento', () => {
        expect(talosSplitFinalThink('<think>sto pensando', null))
            .toEqual({ text: '', reasoning: 'sto pensando' })
    })

    /** Il ragionamento nativo non si perde nemmeno per una riga. */
    it('non butta via il testo che stava fuori dal blocco, nel canale ragionamento', () => {
        const esito = talosSplitFinalThink('', 'prima<think>dentro</think>dopo')
        expect(esito.text).toBe('')
        expect(esito.reasoning).toContain('dentro')
        expect(esito.reasoning).toContain('prima')
        expect(esito.reasoning).toContain('dopo')
    })

    it('una risposta pulita resta identica', () => {
        expect(talosSplitFinalThink('Ciao', 'ragiono'))
            .toEqual({ text: 'Ciao', reasoning: 'ragiono' })
    })

    it('regge testo e ragionamento assenti', () => {
        expect(talosSplitFinalThink(null, undefined)).toEqual({ text: '', reasoning: '' })
    })
})

