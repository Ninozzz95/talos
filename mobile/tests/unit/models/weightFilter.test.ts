/**
 * Il filtro di peso: scegliere la taglia, non subirla.
 *
 * Owner 2026-08-05: «mettere un filtro di peso per i modelli locali, così filtro
 * solo i pesi (tipo 4 miliardi o 5 miliardi) che vuole utente».
 *
 * ## Perche' fasce e non un cursore
 *
 * RICERCATO 2026-08-05: Hugging Face stesso filtra per parametri, e lo fa con un
 * intervallo (`num_parameters=min:0,max:12B`) piu' delle fasce di comodo —
 * <1B, 6B, 12B, 32B, 128B, >500B. Quelle fasce pero' sono pensate per un
 * desktop: su un telefono **32B, 128B e 500B sono la stessa risposta**, cioe'
 * no. Tre quarti del controllo servirebbero a niente.
 *
 * Quindi fasce, ma tagliate dove le famiglie si separano DAVVERO su un telefono:
 * 1, 4, 8, 16 miliardi. Un 4B e un 5B finiscono in fasce diverse, che e'
 * esattamente la distinzione che l'owner ha chiesto.
 *
 * ## «Non lo so» non e' «non passa»
 *
 * Stessa dottrina degli altri filtri: una riga di cui non si conoscono i
 * parametri non viene esclusa. Verrebbe nascosta per un dato mancante, non per
 * una sua caratteristica, e chi guarda non avrebbe modo di capire perche' e'
 * sparita.
 */
import { describe, expect, it } from 'vitest'
import {
    TALOS_WEIGHT_BANDS,
    talosModelParametersB,
    talosModelPassesWeightBand,
} from '@/lib/models/weightFilter'

const B = 1e9

describe('il filtro di peso', () => {
    it('legge i parametri VERI del Hub quando ci sono', () => {
        // `expand[]=gguf` restituisce `total`: parametri esatti, non dedotti.
        expect(talosModelParametersB({ id: 'chi/se-ne-frega', gguf: { parameters: 3.8 * B } }))
            .toBeCloseTo(3.8, 2)
    })

    it('ripiega sul NOME solo quando il Hub non ha letto il file', () => {
        expect(talosModelParametersB({ id: 'Qwen/Qwen3-Coder-30B-A3B-Instruct', gguf: null }))
            .toBeCloseTo(30, 1)
        // Senza parametri nel nome non si inventa: null, e la riga non si esclude.
        expect(talosModelParametersB({ id: 'tizio/modello-senza-taglia', gguf: null })).toBeNull()
    })

    it('separa 4B e 5B, che è la distinzione chiesta dall`owner', () => {
        const quattro = { id: 'x/m-4B', gguf: { parameters: 4 * B } }
        const cinque = { id: 'x/m-5B', gguf: { parameters: 5 * B } }
        expect(talosModelPassesWeightBand(quattro, '1-4')).toBe(true)
        expect(talosModelPassesWeightBand(cinque, '1-4')).toBe(false)
        expect(talosModelPassesWeightBand(cinque, '4-8')).toBe(true)
        expect(talosModelPassesWeightBand(quattro, '4-8')).toBe(false)
    })

    it('copre ogni taglia senza buchi né sovrapposizioni', () => {
        /*
         * Un modello deve cadere in ESATTAMENTE una fascia. Un buco lo
         * renderebbe irraggiungibile da ogni filtro; una sovrapposizione lo
         * farebbe comparire in due, e chi guarda smetterebbe di fidarsi del
         * conteggio.
         */
        for (const miliardi of [0.35, 0.6, 1, 1.5, 3, 3.8, 4, 4.1, 7, 8, 9, 14, 16, 30, 70, 700]) {
            const modello = { id: `x/m-${miliardi}`, gguf: { parameters: miliardi * B } }
            const passate = TALOS_WEIGHT_BANDS.filter((b) => talosModelPassesWeightBand(modello, b))
            expect(passate, `${miliardi}B è finito in ${passate.length} fasce`).toHaveLength(1)
        }
    })

    it('una riga di taglia ignota NON viene nascosta da nessuna fascia', () => {
        const ignoto = { id: 'tizio/modello-senza-taglia', gguf: null }
        for (const banda of TALOS_WEIGHT_BANDS) {
            expect(talosModelPassesWeightBand(ignoto, banda)).toBe(true)
        }
    })

    it('le fasce sono ordinate dalla più piccola alla più grande', () => {
        // L'ordine è l'interfaccia: un elenco a caso costringe a leggerlo tutto.
        expect([...TALOS_WEIGHT_BANDS]).toEqual(['fino-1', '1-4', '4-8', '8-16', 'oltre-16'])
    })
})
