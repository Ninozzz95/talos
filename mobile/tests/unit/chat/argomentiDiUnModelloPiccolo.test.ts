import { describe, expect, it } from 'vitest'
import {
    talosArgomentiDiUnModelloPiccolo,
    talosSenzaRaffica,
} from '@/lib/chat/argomentiDiUnModelloPiccolo'

/**
 * ⛔⛔ Llama-3.2-3B, un «Ciao», e quattro chiamate in fila che non servivano.
 *
 * Owner 2026-08-11, screenshot dal Pad. Nel riquadro tecnico:
 *
 *   {"name": "tool_details", "parameters": {"names": "['library_list', …]"}}
 *   {"name": "tool_details", "parameters": {"names": "['library_list', 'time_now', 'device_status']"}}
 *   …
 *
 * ⇒ Due difetti: la raffica (14 secondi buttati) e `names` come STRINGA con
 * dentro una lista in stile Python. I casi qui sotto usano quelle stringhe.
 */
describe('⛔ gli argomenti che scrive un modello piccolo', () => {
    it('il caso dello schermo: una lista Python dentro una stringa diventa un elenco', () => {
        const letto = talosArgomentiDiUnModelloPiccolo(
            '{"names": "[\'library_list\', \'time_now\', \'device_status\']"}',
        )
        expect(JSON.parse(letto!)).toEqual({
            names: ['library_list', 'time_now', 'device_status'],
        })
    })

    it('e la stessa cosa scritta bene resta bene', () => {
        const letto = talosArgomentiDiUnModelloPiccolo('{"names": ["library_list", "time_now"]}')
        expect(JSON.parse(letto!)).toEqual({ names: ['library_list', 'time_now'] })
    })

    it('l\'oggetto intero in stile Python si raddrizza, costanti comprese', () => {
        const letto = talosArgomentiDiUnModelloPiccolo("{'on': True, 'quando': None, 'giu': False}")
        expect(JSON.parse(letto!)).toEqual({ on: true, quando: null, giu: false })
    })

    it('⛔ ma un APOSTROFO in un testo vero non diventa un delimitatore', () => {
        /*
         * «l'ora», «un'app»: convertire gli apici lì dentro produrrebbe una
         * chiamata storta, e a valle una chiamata storta è indistinguibile da
         * una giusta. Meglio rinunciare a riparare.
         */
        const letto = talosArgomentiDiUnModelloPiccolo('{"testo": "dimmi l\'ora, apri un\'app"}')
        expect(JSON.parse(letto!)).toEqual({ testo: "dimmi l'ora, apri un'app" })
    })

    it('⛔ e ciò che non si capisce resta un NO', () => {
        expect(talosArgomentiDiUnModelloPiccolo('non sono argomenti')).toBeNull()
        expect(talosArgomentiDiUnModelloPiccolo('["a","b"]')).toBeNull()
        expect(talosArgomentiDiUnModelloPiccolo('')).toBeNull()
        expect(talosArgomentiDiUnModelloPiccolo('{"rotto": ')).toBeNull()
    })

    it('una stringa che SEMBRA un elenco ma non lo è resta una stringa', () => {
        const letto = talosArgomentiDiUnModelloPiccolo('{"q": "[non chiuso"}')
        expect(JSON.parse(letto!)).toEqual({ q: '[non chiuso' })
    })
})

describe('⭐ la raffica si riduce', () => {
    const c = (name: string, args: string) => ({ name, arguments: args })

    it('quattro chiamate IDENTICHE diventano una', () => {
        const ridotte = talosSenzaRaffica([
            c('tool_details', '{"names":["a"]}'),
            c('tool_details', '{"names":["a"]}'),
            c('tool_details', '{"names":["a"]}'),
            c('tool_details', '{"names":["a"]}'),
        ])
        expect(ridotte).toHaveLength(1)
    })

    it('⛔ ma due domande DIVERSE restano due: cancellarne una mutila la risposta', () => {
        const ridotte = talosSenzaRaffica([
            c('library_list', '{"filtro":"note"}'),
            c('library_list', '{"filtro":"immagini"}'),
        ])
        expect(ridotte).toHaveLength(2)
    })

    it('e il TETTO ferma il caso dell\'owner, dove gli argomenti cambiavano ogni giro', () => {
        // È questa la difesa che morde su quello screenshot: quattro liste
        // diverse, nessun doppione, e il modello che gira a vuoto.
        const ridotte = talosSenzaRaffica([
            c('tool_details', '{"names":["a","b","c"]}'),
            c('tool_details', '{"names":["a","b"]}'),
            c('tool_details', '{"names":["a"]}'),
            c('tool_details', '{"names":[]}'),
        ])
        expect(ridotte).toHaveLength(3)
        expect(ridotte[0]!.arguments).toContain('"a","b","c"')
    })
})

/**
 * ⛔⛔ LA STRADA VERA: il testo esatto dello schermo dell'owner, dall'inizio.
 *
 * I casi qui sopra provano i due pezzi; questo prova che la RISPOSTA di
 * Llama-3.2-3B — quattro chiamate concatenate senza separatore, `parameters`
 * invece di `arguments`, `names` come stringa Python — attraversa il recupero e
 * ne esce eseguibile e ridotta.
 */
describe('⛔ la risposta VERA di Llama-3.2-3B', () => {
    const RISPOSTA = '{"name": "tool_details", "parameters": {"names": "[\'library_list\', '
        + '\'device_status\', \'web_search\', \'time_now\']"}}'
        + '{"name": "tool_details", "parameters": {"names": "[\'library_list\', \'time_now\', '
        + '\'device_status\']"}}'
        + '{"name": "tool_details", "parameters": {"names": "[\\"library_list\\", \\"time_now\\"]"}}'
        + '{"name": "tool_details", "parameters": {"names": "[\'library_list\']"}}'

    it('quattro chiamate diventano tre, e gli argomenti sono elenchi VERI', async () => {
        const { talosRecuperaChiamateNude } = await import('@/lib/chat/localToolCalls')
        const esito = talosRecuperaChiamateNude(RISPOSTA, new Set(['tool_details']))

        // Il tetto ferma il modello che gira a vuoto.
        expect(esito.calls).toHaveLength(3)
        // ⛔ E `names` è un ARRAY, non più una riga di testo che il tool non
        // sa leggere: era questo a far sembrare che funzionasse.
        expect(JSON.parse(esito.calls[0]!.arguments)).toEqual({
            names: ['library_list', 'device_status', 'web_search', 'time_now'],
        })
        expect(JSON.parse(esito.calls[2]!.arguments)).toEqual({
            names: ['library_list', 'time_now'],
        })
        // E il grezzo non resta a schermo come prosa.
        expect(esito.text).toBe('')
    })
})
