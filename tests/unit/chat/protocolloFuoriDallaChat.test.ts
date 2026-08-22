import { describe, expect, it } from 'vitest'
import { talosSenzaProtocolloDeiTool } from '@/lib/chat/localToolCalls'

/**
 * ⛔⛔ IL CATALOGO DEGLI STRUMENTI FINITO IN CHAT AL POSTO DELLA RISPOSTA.
 *
 * RIPRODOTTO sul Pad l'11 agosto: `unsloth/Qwen3-1.7B-GGUF` Q4_K_M, chat nuova,
 * una domanda di aritmetica in italiano — nessuno strumento serviva. Il testo
 * qui sotto e' quello VERO, copiato dallo schermo.
 *
 * ⛔ Quel formato non esiste nel nostro sorgente: e' il modello che continua il
 * proprio schema di chat. Ma le descrizioni dentro sono le NOSTRE, alla
 * lettera: sta ricopiando il catalogo invece di usarlo.
 */
const DALLO_SCHERMO = `<tools> </tools> <tools> </tools>
<tools> <tool_details> <tool_name>library_list</tool_name>
<tool_description>List, browse, count or filter every local Library file the user currently lets this chat access.</tool_description>
<tool_input>{}</tool_input> </tool_details>
<tool_details> <tool_name>library_search</tool_name>
<tool_description>Search the user's local uploaded and generated Library files.</tool_description>
<tool_input>{}</tool_input> </tool_details> </tools>`

describe('⛔ il protocollo degli strumenti non arriva allo schermo', () => {
    it('⭐ il testo VERO dell\'owner esce vuoto', () => {
        expect(talosSenzaProtocolloDeiTool(DALLO_SCHERMO)).toBe('')
    })

    it('⛔ e un blocco APERTO E MAI CHIUSO sparisce lo stesso', () => {
        // È il caso peggiore: una generazione tagliata a metà lascia
        // un'apertura orfana, ed è proprio lì che si vedrebbe la roba peggiore.
        const monco = 'Ecco:\n<tools> <tool_details> <tool_name>library_list</tool_name>'
        expect(talosSenzaProtocolloDeiTool(monco)).toBe('Ecco:')
    })

    it('la risposta VERA che sta attorno resta intera', () => {
        const misto = 'C = 2 kg.\n<tools> </tools>\nB = 6 kg, A = 12 kg.'
        expect(talosSenzaProtocolloDeiTool(misto)).toBe('C = 2 kg.\n\nB = 6 kg, A = 12 kg.')
    })

    it('⛔ e NON si mangia l\'HTML che una persona ha chiesto davvero', () => {
        /*
         * Si toglie un elenco chiuso — il vocabolario del protocollo — e non
         * «tutto ciò che sembra un tag». Chi chiede come si scrive un `<div>` o
         * incolla del codice deve riaverlo indietro com'era.
         */
        const codice = 'Si scrive così: <div class="x">ciao</div> e <input type="text">.'
        expect(talosSenzaProtocolloDeiTool(codice)).toBe(codice)
    })

    it('un testo senza nemmeno un minore torna identico, senza lavorare', () => {
        const pulito = 'A = 12 kg, B = 6 kg, C = 2 kg.'
        expect(talosSenzaProtocolloDeiTool(pulito)).toBe(pulito)
    })

    it('⛔ le righe vuote lasciate dietro non restano: una risposta che comincia a capo sembra rotta', () => {
        expect(talosSenzaProtocolloDeiTool('<tools></tools>\n\n\n\nEcco la risposta.'))
            .toBe('Ecco la risposta.')
    })
})

/**
 * ⛔⛔ E MENTRE SCRIVE, non solo alla fine.
 *
 * Il testo salvato lo ripulisce `talosSenzaProtocolloDeiTool`. Ma su un modello
 * locale la generazione dura decine di secondi, e quello e' quasi tutto il tempo
 * in cui qualcuno guarda: se il catalogo lampeggia mentre arriva, il difetto c'e'
 * lo stesso — e' la stessa lezione gia' pagata col `<think>`.
 *
 * Il separatore conosceva `<tool_call>` e non `<tools>`. Adesso li tratta uguale.
 */
describe('⛔ il catalogo non lampeggia nemmeno mentre arriva', () => {
    it('⭐ un blocco che arriva a pezzi non compare mai nel testo', async () => {
        const { talosCreateThinkSplitter } = await import('@/lib/chat/thinkStream')
        const s = talosCreateThinkSplitter()
        let visto = ''
        // ⛔ Il tag SPEZZATO fra due pezzi è il caso che conta: chi cercasse il
        // tag dentro ogni pezzo non lo troverebbe mai.
        for (const pezzo of ['C = 2 ', 'kg.\n<to', 'ols> <tool_name>x</tool_name>', ' </to', 'ols>\nB = 6 kg.']) {
            visto += s.push(pezzo).text
        }
        visto += s.flush().text
        expect(visto).not.toContain('tool_name')
        expect(visto).not.toContain('<tools')
        expect(visto.replace(/\s+/g, ' ').trim()).toBe('C = 2 kg. B = 6 kg.')
    })

    it('⛔ e una chiamata resta buttata come prima: le due aperture non si confondono', async () => {
        const { talosCreateThinkSplitter } = await import('@/lib/chat/thinkStream')
        const s = talosCreateThinkSplitter()
        const uscita = s.push('Fatto. <tool_call>{"name":"x"}</tool_call> Ecco.').text + s.flush().text
        expect(uscita).not.toContain('tool_call')
        expect(uscita).toContain('Fatto.')
        expect(uscita).toContain('Ecco.')
    })
})
