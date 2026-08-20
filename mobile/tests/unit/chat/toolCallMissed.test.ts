import { describe, expect, it } from 'vitest'
import { talosTestoEUnaChiamataMancata } from '@/lib/chat/providers/localAdapter'

/**
 * ⭐⭐⭐ «Ciao» e un JSON in faccia alla persona.
 *
 * ⛔⛔ Misurato sul Pad il 2026-08-21 con Gemma 3 4B: la persona scrive
 * "Ciao", aspetta **37 secondi**, e legge in chat
 *
 *     {"name":"library_list"}
 *
 * come se fosse la risposta dell'assistente.
 *
 * ⇒ Un JSON con forma di chiamata non e' ne' una chiamata ne' una risposta.
 * Questi test tengono fermo il confine: cosa si riconosce come chiamata
 * mancata, e - piu' importante - cosa NON si riconosce, perche' un falso
 * positivo qui cancellerebbe una risposta legittima.
 */
describe('TOOL-CALL-MISSED — il JSON che non deve arrivare alla persona', () => {
    it('riconosce il caso vero, misurato sul Pad', () => {
        expect(talosTestoEUnaChiamataMancata('{"name":"library_list"}')).toBe(true)
    })

    it('riconosce anche con argomenti, spazi e a capo intorno', () => {
        expect(talosTestoEUnaChiamataMancata(
            "  " + String.fromCharCode(10) + '{"name":"device_torch","arguments":{"on":true}}' + String.fromCharCode(10) + " ")).toBe(true)
        expect(talosTestoEUnaChiamataMancata(
            '{"name":"x","parameters":{},"id":"1"}')).toBe(true)
    })

    /*
     * ⛔⛔ IL VERSO CONTRARIO, ed e' la meta che conta: un falso positivo qui
     * CANCELLA una risposta vera e la sostituisce con un avviso. Meglio
     * lasciar passare un JSON che zittire l'assistente.
     */
    it("⛔ NON tocca una risposta che PARLA e cita un JSON", () => {
        expect(talosTestoEUnaChiamataMancata(
            'Per chiamarlo scrivi {"name":"x"} nel messaggio.')).toBe(false)
    })

    it("⛔ NON tocca un oggetto DATI che per caso ha un campo name", () => {
        expect(talosTestoEUnaChiamataMancata(
            '{"name":"Antonino","citta":"Catania"}')).toBe(false)
    })

    it("⛔ ne un elenco, ne un JSON rotto, ne il vuoto", () => {
        expect(talosTestoEUnaChiamataMancata('[{"name":"x"}]')).toBe(false)
        expect(talosTestoEUnaChiamataMancata('{"name":')).toBe(false)
        expect(talosTestoEUnaChiamataMancata('')).toBe(false)
        expect(talosTestoEUnaChiamataMancata('{}')).toBe(false)
        expect(talosTestoEUnaChiamataMancata('{"name":""}')).toBe(false)
    })
})
