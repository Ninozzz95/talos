import { describe, expect, it } from 'vitest'
import { talosTestoEUnaChiamataMancata } from '@/lib/chat/providers/localAdapter'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'
import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'

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

/**
 * ⭐⭐⭐ LA CATENA INTERA - perche' la funzione da sola non basta.
 *
 * Il segnale nasce nell'adattatore, attraversa `TalosMobileCompletionResult`,
 * `TalosAgentCompletion`, `ChatCompletionResult`, e diventa una frase nel
 * controller. ⛔⛔ Quattro tipi, e il contratto di `providerContracts` porta
 * scritto addosso il difetto gia' pagato: *uno spread passa il typecheck
 * anche quando il tipo non dichiara il campo, e il valore muore in silenzio
 * al ponte successivo*.
 *
 * ⇒ Se qualcuno toglie una delle copie, il typecheck resta verde e la
 * persona torna a vedere JSON. Questi test guardano che la catena esista.
 */
describe('TOOL-CALL-MISSED — la catena dal motore alla frase', () => {
    it('il campo e dichiarato in TUTTI e quattro i contratti', async () => {
        const sorgenti = await Promise.all([
            'src/lib/chat/providerContracts.ts',
            'src/lib/tools/agentLoop.ts',
            'src/stores/chat.ts',
        ].map((f) => readFile(resolve(process.cwd(), f), 'utf8')))
        for (const testo of sorgenti) expect(testo).toContain('toolCallMissed?: boolean')
    })

    it('e viene COPIATO dove il typecheck non se ne accorgerebbe', async () => {
        const completion = await readFile(
            resolve(process.cwd(), 'src/lib/chat/chatCompletion.ts'), 'utf8')
        expect(completion).toContain('toolCallMissed: result.toolCallMissed')
    })

    it('il controller lo traduce PRIMA della risposta vuota dopo gli strumenti', async () => {
        /*
         * ⛔ L'ordine conta: la risposta vuota parla di strumenti ESEGUITI,
         * questa di uno che non c'era. Invertirli manderebbe la persona a
         * cercare un guasto dove non c'e'.
         */
        const controller = await readFile(
            resolve(process.cwd(), 'src/stores/chatController.ts'), 'utf8')
        const iMancata = controller.indexOf("deps.translate('chat.toolCallMissed')")
        const iVuota = controller.indexOf("deps.translate('chat.emptyAnswerAfterTools'")
        expect(iMancata).toBeGreaterThan(0)
        expect(iVuota).toBeGreaterThan(0)
        expect(iMancata).toBeLessThan(iVuota)
    })

    it('la frase esiste nelle DUE lingue e dice cosa fare', () => {
        for (const dizionario of [TALOS_IT_MESSAGES, TALOS_EN_MESSAGES]) {
            const frase = (dizionario as { chat: Record<string, string> }).chat.toolCallMissed
            expect(frase).toBeTypeOf('string')
            expect(frase.length).toBeGreaterThan(40)
            // ⛔ Deve mandare da qualche parte: un avviso senza rimedio e un vicolo.
            expect(frase).toMatch(/Doctor|Diagnostica/)
        }
    })
})
