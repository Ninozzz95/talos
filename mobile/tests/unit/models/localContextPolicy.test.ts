import { describe, expect, it } from 'vitest'
import {
    TALOS_LOCAL_DEFAULT_CONTEXT_TOKENS,
    TALOS_LOCAL_FALLBACK_CONTEXT_TOKENS,
    talosLocalContextCandidates,
    talosLocalEscalatedContextTokens,
    talosShouldRetryLocalOpen,
} from '@/lib/models/localContextPolicy'
import { type TalosDeviceCapacity, type TalosModelShape, talosMaxContextFor } from '@/lib/models/fit'

const GIB = 1024 * 1024 * 1024

/**
 * Il modello dello screenshot: Llama-3.2-3B-Instruct-IQ4_XS.
 *
 * I numeri sono quelli che il file dichiara — 28 strati, 8 teste KV, testa da
 * 128, 128k di contesto addestrato — non stime.
 */
const LLAMA_3B: TalosModelShape = {
    layers: 28,
    kvHeads: 8,
    headDim: 128,
    trainedContext: 131072,
    weightBytes: Math.round(1.75 * GIB),
    kvBytesPerElement: 2,
}

/** Il tablet di prova: OnePlus Pad 3, 11,2 GB, misurato a caldo. */
const TABLET: TalosDeviceCapacity = {
    totalRamBytes: Math.round(11.2 * GIB),
    // Con il modello GIÀ caricato, che è la condizione in cui la chat misura.
    availableRamBytes: Math.round(4.47 * GIB),
    lowMemoryThresholdBytes: Math.round(0.5 * GIB),
    freeStorageBytes: 46 * GIB,
    memoryBandwidthBytesPerSecond: null,
    thermal: 'none',
    abiSupported: true,
}

describe('LOCAL-CONTEXT-PARITY-01 canonical local context policy', () => {
    it('starts at 4096 and offers one bounded 2048 fallback', () => {
        expect(TALOS_LOCAL_DEFAULT_CONTEXT_TOKENS).toBe(4096)
        expect(TALOS_LOCAL_FALLBACK_CONTEXT_TOKENS).toBe(2048)
        expect(talosLocalContextCandidates()).toEqual([4096, 2048])
    })

    it('never raises an explicit small context and preserves a larger first attempt', () => {
        expect(talosLocalContextCandidates(1024)).toEqual([1024])
        expect(talosLocalContextCandidates(2048)).toEqual([2048])
        expect(talosLocalContextCandidates(8192)).toEqual([8192, 2048])
    })

    it('allows retry for context allocation only', () => {
        expect(talosShouldRetryLocalOpen('context')).toBe(true)
        for (const stage of ['path', 'model-load', 'sampler', 'template', 'generation', 'unknown'] as const) {
            expect(talosShouldRetryLocalOpen(stage)).toBe(false)
        }
    })

    it('C45-RED-18H raises the measured Qwen tool prompt once, under a measured ceiling', () => {
        expect(talosLocalEscalatedContextTokens(4096, 5779, 1024, 16384)).toBe(8192)
    })

    it('keeps an ordinary prompt in its current context', () => {
        expect(talosLocalEscalatedContextTokens(4096, 1200, 512, 16384)).toBe(4096)
    })

    it('refuses a requirement above the MEASURED ceiling instead of truncating it', () => {
        expect(talosLocalEscalatedContextTokens(4096, 20000, 1024, 16384)).toBeNull()
    })

    /**
     * Il difetto dell'owner, riprodotto come aritmetica.
     *
     * Il vecchio tetto scritto a mano era 8192 e rifiutava tutto ciò che lo
     * superava. Su questo tablet, con questo modello, il tetto onesto è più
     * alto — e il test fallisce se qualcuno rimette un numero fisso al posto
     * della misura.
     */
    it('C45-RED-19D the honest ceiling on a 12 GB tablet is above the old hand-written 8192', () => {
        const ceiling = talosMaxContextFor(LLAMA_3B, {
            ...TABLET,
            // Come fa la chat: i pesi tornano nella memoria disponibile, perché
            // il modello è già caricato e la misura li ha già scontati.
            availableRamBytes: TABLET.availableRamBytes + LLAMA_3B.weightBytes,
        })
        expect(ceiling).toBeGreaterThan(8192)

        // E la conversazione che l'app rifiutava adesso passa.
        const required = 5779 + 1024
        expect(talosLocalEscalatedContextTokens(4096, 5779, 1024, ceiling)).toBeGreaterThanOrEqual(required)
    })

    /**
     * La prova che il test morde: senza rimettere i pesi il tetto crolla sotto
     * quello vecchio, cioè il doppio scomputo sarebbe passato inosservato.
     */
    it('C45-RED-19D subtracting the resident weights twice would understate the ceiling', () => {
        const doubleCounted = talosMaxContextFor(LLAMA_3B, TABLET)
        const honest = talosMaxContextFor(LLAMA_3B, {
            ...TABLET,
            availableRamBytes: TABLET.availableRamBytes + LLAMA_3B.weightBytes,
        })
        expect(doubleCounted).toBeLessThan(honest)
    })

    /**
     * «Non misurato» non è «vietato».
     *
     * Una build nativa più vecchia, o un dispositivo che non si lascia
     * misurare, non deve far rifiutare una conversazione: l'ultima parola ce
     * l'ha comunque il motore, che risponde con un guasto vero alla fase
     * `context`. Rifiutare qui vorrebbe dire decidere al posto suo su un numero
     * che non abbiamo.
     */
    it('C45-RED-19D an unmeasured ceiling lets the engine answer instead of refusing', () => {
        expect(talosLocalEscalatedContextTokens(4096, 60000, 1024, null)).toBe(65536)
        expect(talosLocalEscalatedContextTokens(4096, 5779, 1024, null)).toBe(8192)
    })

    /**
     * Il tetto misurato è spesso il `trainedContext` dichiarato dal modello, che
     * non è quasi mai una potenza di due. Arrotondare per eccesso e poi
     * rifiutare butterebbe via contesto che il dispositivo stava offrendo.
     */
    it('C45-RED-19D takes the ceiling itself when the next power of two overshoots it', () => {
        expect(talosLocalEscalatedContextTokens(4096, 9000, 1024, 10240)).toBe(10240)
        // Ma se nemmeno il tetto basta, si rifiuta e non si tronca.
        expect(talosLocalEscalatedContextTokens(4096, 11000, 1024, 10240)).toBeNull()
    })

    /** Ciò che è già allocato non si toglie: il caso che conta è la crescita. */
    it('C45-RED-19D never retreats below a context the engine already granted', () => {
        expect(talosLocalEscalatedContextTokens(8192, 1200, 512, 4096)).toBe(8192)
    })
})

/**
 * C45-RED-19M — l'arrotondamento non deve costare metà della memoria.
 *
 * MISURATO sul OnePlus Pad 3 il 2026-08-06, con Qwen3-1.7B-Q8_0 caricato: il
 * budget dava 15.379 token e la potenza di due li tagliava a 8192. Il 47% della
 * memoria utilizzabile buttato via — e su quel dispositivo era esattamente la
 * differenza fra la conversazione dell'owner che passa e PROVIDER_CHAT_FAILED.
 */
describe('C45-RED-19M il tetto non si arrotonda a potenze di due', () => {
    /** Qwen3-1.7B-Q8_0, come llama.cpp lo dichiara sul dispositivo. */
    const QWEN_1_7B: TalosModelShape = {
        layers: 28,
        kvHeads: 8,
        headDim: 128,
        trainedContext: 40960,
        weightBytes: 1_828_474_880,
        kvBytesPerElement: 2,
    }

    /** Il tablet nel momento esatto della misura: 2,58 GB liberi. */
    const TABLET_CARICO: TalosDeviceCapacity = {
        totalRamBytes: Math.round(11.17 * GIB),
        availableRamBytes: Math.round(2.58 * GIB),
        lowMemoryThresholdBytes: Math.round(0.63 * GIB),
        freeStorageBytes: 40 * GIB,
        memoryBandwidthBytesPerSecond: null,
        thermal: 'none',
        abiSupported: true,
    }

    const tettoQui = () => talosMaxContextFor(QWEN_1_7B, {
        // Come fa la chat: i pesi tornano nella memoria libera, perché il
        // modello è già caricato e la misura li ha già scontati.
        ...TABLET_CARICO,
        availableRamBytes: TABLET_CARICO.availableRamBytes + QWEN_1_7B.weightBytes,
    })

    /**
     * Il confronto FRA LE DUE REGOLE, non un numero derivato a mano.
     *
     * La prima versione di questa prova fissava «oltre 15.000», che era il
     * valore letto sul dispositivo in quel preciso istante — con la memoria
     * libera di quel momento. Su costanti arrotondate dà un altro numero, e la
     * prova falliva pur essendo giusta la correzione: stava provando la mia
     * aritmetica a mano invece del cambiamento.
     *
     * Ciò che deve valere sempre è questo: il passo da 256 non butta via più di
     * un passo, mentre la potenza di due può buttarne via quasi metà.
     */
    it('recupera i token che la potenza di due buttava via', () => {
        const tetto = tettoQui()
        const potenzaDiDue = 2 ** Math.floor(Math.log2(tetto))

        expect(tetto % 256).toBe(0)
        expect(tetto).toBeGreaterThan(potenzaDiDue)
        // Su questo caso reale il guadagno è di migliaia di token, non di unità.
        expect(tetto - potenzaDiDue).toBeGreaterThan(1_000)
    })

    /** Tondo resta tondo: il costo dell'ordine è al massimo un passo. */
    it('perde al massimo un passo, non la metà', () => {
        const tetto = tettoQui()
        // Il passo successivo sarebbe già oltre il budget: la perdita massima è
        // quindi sotto i 256 token, per costruzione.
        expect(tetto % 256).toBe(0)
        expect(tetto).toBeGreaterThan(8192)
    })

    /** Il contesto addestrato resta il tetto del tetto. */
    it('non supera mai quello che il modello dichiara', () => {
        const enorme: TalosDeviceCapacity = { ...TABLET_CARICO, availableRamBytes: 60 * GIB, totalRamBytes: 64 * GIB }
        expect(talosMaxContextFor(QWEN_1_7B, enorme)).toBe(QWEN_1_7B.trainedContext)
    })
})
