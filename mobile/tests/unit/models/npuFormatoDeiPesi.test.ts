import { describe, expect, it } from 'vitest'

import {
    talosNpuAcceptsQuantisation,
    talosLocalBackendOptions,
} from '@/lib/models/localBackendChoice'

/**
 * ⭐⭐⭐ IL FORMATO DEI PESI DECIDE SE L'NPU HA SENSO — misurato, non dedotto.
 *
 * ## Il numero che ha reso necessarie queste prove
 *
 * Banco dell'11/09/2026 sul Pad dell'owner. Stesso modello, stesso giorno,
 * stesso telefono; cambia **solo il formato**:
 *
 * ```
 *   Qwen3-4B-Instruct  Q4_0     NPU  lettura 1126 t/s   scrittura 14,0
 *   Qwen3-4B-Instruct  Q4_K_M   NPU  lettura   55,7     scrittura  5,0
 *                               GPU  lettura  206       scrittura 16,7
 * ```
 *
 * ⛔ **Venti volte** piu' lenta in lettura, e **quattro volte sotto la GPU**:
 * accendere l'NPU su un Q4_K_M rende l'app peggiore di non avere l'NPU. E il
 * catalogo e' **14 Q4_K_M contro 7 Q4_0** — la regola sbagliata farebbe danno
 * su due modelli su tre.
 *
 * ## ⛔ Perche' queste prove guardano il verso NEGATIVO
 *
 * Il difetto naturale qui e' l'ottimismo: un formato sconosciuto trattato come
 * «probabilmente va bene», o `null` trattato come «vedremo». Su questo campo
 * l'ottimismo costa **il quadruplo della velocita'**, mentre sbagliare
 * nell'altro verso costa «gira sulla GPU come ieri». ⇒ Tutto cio' che non e'
 * un formato misurato vale **no**.
 */

const GPU = { registry: 'OpenCL', name: 'QUALCOMM Adreno(TM) 830', canOffload: true }
// ⛔ Il REGISTRY e `HTP`, il DISPOSITIVO e `HTP0`: sono due nomi diversi, e
// il motore li usa in due posti diversi. Scriverli uguali qui faceva fallire
// FMT-07 con un difetto che non stava nel codice ma nella fixture.
const NPU = { registry: 'HTP', name: 'Hexagon', canOffload: true }

function hexagonDi(quantisation: string | null) {
    return talosLocalBackendOptions([GPU, NPU], quantisation)
        .find((opzione) => opzione.kind === 'hexagon')
}

describe('NPU — i formati che sa mangiare', () => {
    it('FMT-01 i tre misurati passano', () => {
        for (const formato of ['Q4_0', 'Q8_0', 'MXFP4']) {
            expect(talosNpuAcceptsQuantisation(formato)).toBe(true)
        }
    })

    /**
     * ⛔ IL TEST CHE MORDE, e porta il numero con se': su questo formato
     * l'NPU ha misurato 55,7 t/s contro i 206 della GPU.
     */
    it('FMT-02 Q4_K_M NON passa — e questo e il caso di due modelli su tre', () => {
        expect(talosNpuAcceptsQuantisation('Q4_K_M')).toBe(false)
    })

    it('FMT-03 nemmeno gli altri K, che sono la stessa famiglia', () => {
        for (const formato of ['Q4_K_S', 'Q5_K_M', 'Q6_K', 'Q2_K', 'IQ4_XS']) {
            expect(talosNpuAcceptsQuantisation(formato)).toBe(false)
        }
    })

    /**
     * ⛔ «Non lo so» non e' un permesso. Un ponte che non risponde, un file
     * senza `general.file_type`, un modello nuovo: tutti `null`, e tutti no.
     */
    it('FMT-04 null e undefined valgono NO, non «vedremo»', () => {
        expect(talosNpuAcceptsQuantisation(null)).toBe(false)
        expect(talosNpuAcceptsQuantisation(undefined)).toBe(false)
        expect(talosNpuAcceptsQuantisation('')).toBe(false)
    })

    /**
     * ⛔ E un formato che ancora non esiste deve fallire dal lato sicuro: entra
     * nel dispositivo — il vincolo dell'owner e' che TALOS faccia girare
     * qualunque modello di Hugging Face — ma non sull'NPU finche' qualcuno non
     * lo misura.
     */
    it('FMT-05 un formato mai visto NON viene promosso', () => {
        expect(talosNpuAcceptsQuantisation('Q3_XL_FUTURO')).toBe(false)
    })

    it('FMT-06 il confronto non e case-sensitive: q4_0 e Q4_0', () => {
        expect(talosNpuAcceptsQuantisation('q4_0')).toBe(true)
    })
})

describe('SCELTA — l’NPU sparisce dalle opzioni quando il formato non e il suo', () => {
    it('FMT-07 su Q4_0 Hexagon e disponibile', () => {
        expect(hexagonDi('Q4_0')?.available).toBe(true)
    })

    it('FMT-08 su Q4_K_M NON e disponibile, pur essendo nel telefono', () => {
        expect(hexagonDi('Q4_K_M')?.available).toBe(false)
    })

    /**
     * ⛔⛔ LA DIFFERENZA CHE L'INTERFACCIA DEVE POTER DIRE.
     *
     * «Il telefono non ce l'ha» e «ce l'ha, ma su questo modello andrebbe venti
     * volte piu' piano» portano a due azioni opposte: nel primo caso non c'e'
     * niente da fare, nel secondo basta scaricare lo stesso modello in Q4_0.
     * I `registries` sono cio' che distingue i due — pieni nel secondo caso,
     * vuoti nel primo. Se qualcuno li svuotasse «per pulizia», la riga a
     * schermo direbbe la frase sbagliata e questa prova cade.
     */
    it('FMT-09 i due «non disponibile» restano DISTINGUIBILI', () => {
        const formatoSbagliato = hexagonDi('Q4_K_M')
        const assenteDalTelefono = talosLocalBackendOptions([GPU], 'Q4_0')
            .find((opzione) => opzione.kind === 'hexagon')

        expect(formatoSbagliato?.available).toBe(false)
        expect(assenteDalTelefono?.available).toBe(false)
        // ⛔ Stesso `available`, causa diversa: i registry lo dicono.
        expect(formatoSbagliato?.registries.length).toBeGreaterThan(0)
        expect(assenteDalTelefono?.registries.length).toBe(0)
    })

    /**
     * ⛔ AL CONTRARIO: il formato non deve toccare la GPU. Se qualcuno un
     * giorno applicasse il filtro a tutti gli acceleratori, un Q4_K_M
     * resterebbe senza NIENTE — e quello e' il formato di due modelli su tre.
     */
    it('FMT-10 la GPU resta disponibile su qualunque formato', () => {
        for (const formato of ['Q4_0', 'Q4_K_M', null]) {
            const gpu = talosLocalBackendOptions([GPU, NPU], formato)
                .find((opzione) => opzione.kind === 'gpu')
            expect(gpu?.available).toBe(true)
        }
    })

    it('FMT-11 e la CPU e sempre il pavimento, qualunque cosa succeda', () => {
        const cpu = talosLocalBackendOptions([], 'Q4_K_M')
            .find((opzione) => opzione.kind === 'cpu')
        expect(cpu?.available).toBe(true)
    })
})

/**
 * ⭐⭐⭐ IL DISPOSITIVO E' UN NOME, NON UNA FAMIGLIA.
 *
 * Visto sullo schermo del Pad l'11/09/2026, sotto la scelta Hexagon:
 *
 * ```
 *   adesso gira su Hexagon · GPU
 * ```
 *
 * Due motori diversi nella stessa frase — e proprio nella riga che e' il nostro
 * differenziatore contro PocketPal: loro mostrano cosa hai **scelto**, noi
 * mostriamo cosa sta girando **davvero**.
 *
 * La causa: il nome del DISPOSITIVO (`HTP0`) passava dentro
 * `talosBackendKindOfRegistry`, che si aspetta un REGISTRY (`HTP`). `HTP0` non
 * combacia, e la funzione ripiega su `'gpu'` — un ripiego giusto per il suo
 * scopo, sbagliato per questa domanda.
 *
 * ⛔ Finche' i motori spediti erano due il ripiego era corretto **per caso**:
 * qualunque dispositivo di offload ERA la GPU. L'NPU non ha introdotto il
 * difetto, l'ha reso visibile.
 */
describe('IN USO — il nome del dispositivo non si traduce in famiglia', () => {
    it('FMT-12 il mappatore dei REGISTRY non sa leggere un nome di DISPOSITIVO', async () => {
        const { talosBackendKindOfRegistry } = await import('@/lib/models/localBackendChoice')
        // Il registry, che e' cio' per cui la funzione esiste.
        expect(talosBackendKindOfRegistry('HTP')).toBe('hexagon')
        // ⛔ Il dispositivo: ripiega su 'gpu', ed e' da qui che nasceva
        // «adesso gira su Hexagon · GPU».
        expect(talosBackendKindOfRegistry('HTP0')).toBe('gpu')
    })

    /**
     * ⛔⛔ IL TEST CHE MORDE: la scheda non deve piu' chiamare quel mappatore
     * sul dispositivo. Se qualcuno lo rimettesse, la riga tornerebbe a
     * contraddirsi senza che nient'altro diventi rosso.
     */
    it('FMT-13 la scheda stampa il dispositivo verbatim, non una seconda famiglia', async () => {
        const { readFileSync } = await import('node:fs')
        const { resolve } = await import('node:path')
        const sorgente = readFileSync(resolve(
            process.cwd(), 'src/components/talos/models/TalosMobileModelLabHub.vue',
        ), 'utf8')
        expect(sorgente).toContain(': fatti.backendDevice')
        expect(sorgente).not.toContain('talosBackendKindOfRegistry(fatti.backendDevice)')
    })
})
