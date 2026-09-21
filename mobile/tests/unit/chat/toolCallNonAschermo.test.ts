import { describe, expect, it } from 'vitest'
import { talosCreateThinkSplitter, talosSplitFinalThink } from '@/lib/chat/thinkStream'

/**
 * ⛔ La sintassi interna di una chiamata non arriva MAI a schermo.
 *
 * VISTO sul Pad il 2026-08-08 con Qwen3-1.7B: dopo l'esecuzione del tool, nella
 * bolla comparivano cinque righe di `<tool_call> {...} </tool_call>`. Non è
 * ragionamento e non è una risposta: è il verso interno di una cosa già
 * successa, e viola la regola «mai un codice interno a schermo».
 */
describe('i blocchi <tool_call> si buttano', () => {
    it('TOOLCALL-01 spariscono dal testo finale, e non finiscono nel ragionamento', () => {
        const grezzo = 'Accendo.\n<tool_call> {"name": "device_torch", "arguments": {"on": true}} </tool_call>\nFatto.'
        const esito = talosSplitFinalThink(grezzo, null)
        expect(esito.text).not.toContain('tool_call')
        expect(esito.text).not.toContain('device_torch')
        expect(esito.reasoning).not.toContain('device_torch')
        expect(esito.text).toContain('Accendo.')
        expect(esito.text).toContain('Fatto.')
    })

    it('TOOLCALL-02 il ragionamento continua a funzionare, insieme alle chiamate', () => {
        const esito = talosSplitFinalThink(
            '<think>ci penso</think>Ecco.<tool_call>{"name":"x"}</tool_call> Finito.',
            null,
        )
        expect(esito.reasoning).toBe('ci penso')
        expect(esito.text).toBe('Ecco. Finito.')
    })

    it('TOOLCALL-03 il tag SPEZZATO fra due pezzi non passa a metà', () => {
        // Il caso che rende inutile un semplice replace: lo stream arriva a
        // pezzi arbitrari, e il marcatore cade fra due.
        const s = talosCreateThinkSplitter()
        let testo = ''
        for (const pezzo of ['Ecco <tool', '_call>{"name":"x"}</tool', '_call> fatto.']) {
            testo += s.push(pezzo).text
        }
        testo += s.flush().text
        expect(testo).toBe('Ecco  fatto.')
    })

    it('TOOLCALL-04 una chiamata TRONCATA non lascia mezza JSON a schermo', () => {
        const s = talosCreateThinkSplitter()
        let testo = s.push('Provo. <tool_call>{"name":"device_tor').text
        testo += s.flush().text
        expect(testo).toBe('Provo. ')
    })

    it('TOOLCALL-05 morde: senza il filtro, il testo grezzo conterrebbe il blocco', () => {
        // La prova che i casi sopra non sono veri per costruzione.
        const grezzo = 'A<tool_call>{"n":1}</tool_call>B'
        expect(grezzo).toContain('tool_call')
        expect(talosSplitFinalThink(grezzo, null).text).toBe('AB')
    })
})
