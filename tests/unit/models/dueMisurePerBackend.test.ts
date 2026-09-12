import { describe, expect, it } from 'vitest'

import { talosBackendKindOfRegistry } from '@/lib/models/localBackendChoice'
import {
    talosEstimatedLatencyMs,
    talosSelectBestProfile,
    talosStimaTokenDiRisposta,
    type TalosProfileForSelection,
} from '@/lib/models/localProfileSelector'

/**
 * ⭐⭐⭐ D-53 — DUE MISURE PER BACKEND, e la scelta segue la forma del lavoro.
 *
 * ## I numeri, dal banco sul Pad dell'owner (11/09/2026)
 *
 * `LFM2.5-2.6B-Q4_0`, `llama-bench`, tre motori nella stessa invocazione:
 *
 * ```
 *              lettura (pp512)   scrittura (tg32)   apertura
 *   CPU              181             24,2            3.100 ms
 *   GPU (OpenCL)     445             25,9           18.000 ms   ← caricamento dei buffer, §5
 *   NPU (Hexagon)   1621             15,4            2.800 ms
 * ```
 *
 * Chi vince la lettura perde la scrittura. Con un numero solo (`ttftMs` su un
 * prompt fisso) il selettore non poteva vederlo: trattava la lettura come un
 * costo costante, e un costo costante non distingue dieci token da tremila.
 *
 * ⛔ Nessun nome di modello entra nella decisione: questi sono i numeri di
 * QUEL file su QUESTO telefono, e la formula è la stessa per qualunque GGUF.
 * È ciò che «motore ottimizzato a livello universale» vuol dire (owner, 11/09).
 */

function profilo(over: Partial<TalosProfileForSelection>): TalosProfileForSelection {
    return {
        backendRegistry: 'CPU',
        backendDevice: null,
        outcome: 'CORRECT',
        ttftMs: 25_000,
        decodeTokPerSec: 24.2,
        prefillTokPerSec: 181,
        openMs: 3_100,
        ...over,
    }
}

const CPU = profilo({})
const GPU = profilo({
    backendRegistry: 'OpenCL', backendDevice: 'GPUOpenCL',
    ttftMs: 8_500, decodeTokPerSec: 25.9, prefillTokPerSec: 445, openMs: 18_000,
})
const NPU = profilo({
    backendRegistry: 'HTP', backendDevice: 'HTP0',
    ttftMs: 2_000, decodeTokPerSec: 15.4, prefillTokPerSec: 1621, openMs: 2_800,
})

describe('D-53 — la stima a tre termini: apertura + lettura + scrittura', () => {
    it('DM-01 con la velocità di lettura, il prompt pesa quanto è lungo', () => {
        // NPU, 3.000 token da leggere, 64 da scrivere, motore da aprire:
        //   2.800 + 3000/1621*1000 + 64/15,4*1000 = 2.800 + 1.850,7 + 4.155,8
        const stima = talosEstimatedLatencyMs(NPU, 64, false, 3000)!
        expect(stima).toBeCloseTo(2_800 + 1_850.7 + 4_155.8, 0)
    })

    /**
     * ⛔ AL CONTRARIO — un profilo VECCHIO, senza velocità di lettura, deve
     * dare esattamente il numero di prima: nessun profilo già registrato
     * viene bocciato per un campo che non poteva avere.
     */
    it('DM-02 senza velocità di lettura la formula resta quella di prima, al millisecondo', () => {
        const vecchio = profilo({ prefillTokPerSec: null, openMs: null, ttftMs: 5_000, decodeTokPerSec: 10 })
        expect(talosEstimatedLatencyMs(vecchio, 100, false, 3000)).toBe(5_000 + 10_000)
        expect(talosEstimatedLatencyMs(vecchio, 100, true, 3000)).toBe(10_000)
    })

    it('DM-03 senza i token da leggere la formula resta quella di prima, anche su un profilo nuovo', () => {
        expect(talosEstimatedLatencyMs(NPU, 100, false)).toBe(2_000 + (100 / 15.4) * 1000)
    })

    /**
     * ⛔ Apertura non misurata ma lettura sì: si paga `ttftMs`, che contiene
     * un'apertura vera. Pessimista, mai ottimista.
     */
    it('DM-04 apertura non misurata: si paga ttftMs, non zero', () => {
        const senzaApertura = profilo({ openMs: null, ttftMs: 25_000, prefillTokPerSec: 181 })
        expect(talosEstimatedLatencyMs(senzaApertura, 0, false, 181)).toBe(25_000 + 1_000)
    })
})

describe('D-53 — la scelta cambia con la forma del lavoro, stessi tre profili', () => {
    /**
     * ⭐ IL CASO DELLA CHAT: tremila token di istruzioni e storia, una
     * risposta breve. La lettura è tutto: vince chi legge.
     */
    it('DM-05 contesto lungo, risposta breve → l’NPU', () => {
        const scelto = talosSelectBestProfile([CPU, GPU, NPU], null, 64, 3000)
        expect(scelto?.backendRegistry).toBe('HTP')
    })

    /**
     * ⭐ IL CASO DELLA STORIA: pochi token da leggere, mille da scrivere. La
     * scrittura è tutto, e l'apertura della GPU (18 s) NON si ammortizza
     * contro un'NPU che apre in 2,8 s: vince la CPU, che apre in 3,1 s e
     * scrive quasi come la GPU.
     *   CPU: 3.100 +  200/181*1000 + 1024/24,2*1000 = 3.100 + 1.105 + 42.314 = 46.519
     *   GPU: 18.000 + 200/445*1000 + 1024/25,9*1000 = 18.000 + 449 + 39.537 = 57.986
     *   NPU: 2.800 + 200/1621*1000 + 1024/15,4*1000 = 2.800 + 123 + 66.494 = 69.417
     */
    it('DM-06 prompt corto, risposta lunga, tutto da aprire → la CPU, perché la GPU non ammortizza l’apertura', () => {
        const scelto = talosSelectBestProfile([CPU, GPU, NPU], null, 1024, 200)
        expect(scelto?.backendRegistry).toBe('CPU')
    })

    /**
     * ⭐ E se la GPU è GIÀ aperta, la sua apertura vale zero e vince lei
     * sulla risposta lunga — CR-12 applicato alla forma del lavoro.
     */
    it('DM-07 stessa risposta lunga, ma la GPU è già aperta → la GPU', () => {
        const scelto = talosSelectBestProfile([CPU, GPU, NPU], 'OpenCL', 1024, 200)
        expect(scelto?.backendRegistry).toBe('OpenCL')
    })

    /**
     * ⛔ Il vecchio metro, a confronto: con `MAX_TOKENS` fisso e senza i token
     * da leggere, la domanda breve col contesto lungo NON sceglieva l'NPU.
     * Questo test documenta il difetto che D-53 chiude.
     */
    it('DM-08 col metro vecchio (1.024 token attesi, lettura come costo fisso) l’NPU non vinceva il caso della chat', () => {
        const vecchi = [CPU, GPU, NPU].map((p) => profilo({ ...p, prefillTokPerSec: null, openMs: null }))
        const scelto = talosSelectBestProfile(vecchi, null, 1024)
        expect(scelto?.backendRegistry).not.toBe('HTP')
    })
})

describe('D-53 — quanti token ci si aspetta di scrivere', () => {
    it('DM-09 la mediana delle ultime risposte, caratteri su quattro', () => {
        const risposte = ['a'.repeat(400), 'b'.repeat(800), 'c'.repeat(1200)]
        expect(talosStimaTokenDiRisposta(risposte, 256, 1024)).toBe(200)
    })

    it('DM-10 senza risposte si usa il ripiego, dentro i limiti', () => {
        expect(talosStimaTokenDiRisposta([], 256, 1024)).toBe(256)
        expect(talosStimaTokenDiRisposta([], 5000, 1024)).toBe(1024)
    })

    /** ⛔ Una chat di monosillabi non stima zero: il pavimento è 32. */
    it('DM-11 pavimento a 32 e tetto al massimo della generazione', () => {
        expect(talosStimaTokenDiRisposta(['sì', 'no', 'ok'], 256, 1024)).toBe(32)
        expect(talosStimaTokenDiRisposta(['x'.repeat(40_000)], 256, 1024)).toBe(1024)
    })

    it('DM-12 guarda solo le ultime cinque risposte', () => {
        const vecchieLunghe = Array.from({ length: 5 }, () => 'v'.repeat(4000))
        const recentiBrevi = Array.from({ length: 5 }, () => 'r'.repeat(200))
        expect(talosStimaTokenDiRisposta([...vecchieLunghe, ...recentiBrevi], 256, 1024)).toBe(50)
    })
})

describe('D-53 — il profilo dell NPU si chiama «hexagon», non «HTP»', () => {
    /**
     * ⛔⛔ IL DIFETTO TROVATO END-TO-END sul Pad, 11/09/2026 20:12: profili
     * misurati, selettore acceso, e la chat ha aperto su `GPUOpenCL` coi
     * numeri dell'NPU — perché il sondaggio scrive la FAMIGLIA («hexagon») e
     * il mappatore conosceva solo il registry («HTP»). 3,0 s alla prima
     * parola dove ne bastavano 0,3.
     */
    it('DM-13 «hexagon» (la famiglia scritta dal sondaggio) e «HTP» (il registry del motore) sono la stessa cosa', () => {
        expect(talosBackendKindOfRegistry('hexagon')).toBe('hexagon')
        expect(talosBackendKindOfRegistry('HTP')).toBe('hexagon')
        expect(talosBackendKindOfRegistry('cpu')).toBe('cpu')
        expect(talosBackendKindOfRegistry('opencl')).toBe('gpu')
    })

    it('DM-14 con i profili come li scrive il sondaggio, il caso della chat sceglie l’NPU', () => {
        // Le TRE righe del sondaggio del 11/09 alle 19:57, su Qwen3 4B — non
        // una CPU presa da un altro banco: qui la CPU legge a 31,8 e scrive a 6.
        const comeScritti = [
            profilo({ backendRegistry: 'cpu', ttftMs: 94_520, decodeTokPerSec: 5.99, prefillTokPerSec: 31.8, openMs: 2_985 }),
            profilo({ backendRegistry: 'opencl', backendDevice: 'GPUOpenCL', ttftMs: 19_516, decodeTokPerSec: 10, prefillTokPerSec: 154.9, openMs: 31_490 }),
            profilo({ backendRegistry: 'hexagon', backendDevice: 'HTP0', ttftMs: 4_005, decodeTokPerSec: 10, prefillTokPerSec: 856.5, openMs: 3_000 }),
        ]
        const scelto = talosSelectBestProfile(comeScritti, null, 256, 2803)
        expect(talosBackendKindOfRegistry(scelto!.backendRegistry)).toBe('hexagon')
    })
})
