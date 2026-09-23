import { describe, expect, it } from 'vitest'
import { talosModelShapeOf } from '@/services/localEngine'
import { talosKvCacheBytes, type TalosModelShape } from '@/lib/models/fit'
import { talosKvBytesPerTokenOf } from '@/lib/models/engineDiagnostics'

/**
 * ⛔⛔⛔ UN MODELLO IBRIDO NON HA LA KV SU TUTTI GLI STRATI — e per un giorno
 * intero questo si è tradotto in «non so niente di questo modello».
 *
 * ## Il fatto, misurato sul Pad il 2026-09-10
 *
 * Con `LFM2.5-2.6B-Q4_0` la chat metteva **31 s** al primo token e riusava **0
 * token su 2.847**. Con gemma3 — un transformer — **3,1 s** e **2.933 su
 * 3.257**. La differenza non era il motore: era che gemma aveva un prefisso
 * congelato su disco e LFM2 no, perché `congelaSePossibile()` esce senza dire
 * niente quando la forma del modello è nulla.
 *
 * E la forma era nulla perché `kvHeads` valeva **0**.
 *
 * ## La catena, provata alla fonte (sottomodulo pinnato, letto il 2026-09-10)
 *
 * LFM2 è ibrido: `lfm2.attention.head_count_kv` è un array **per-strato**
 * (`arr[i32,30] = [0, 0, 8, 0, 0, 8, 0, 0, 0, 8, 0, 0, …]`, letto dal logcat del
 * dispositivo e confermato da https://github.com/ggml-org/llama.cpp/issues/16278).
 * llama.cpp usa proprio quello per decidere chi è ricorrente
 * (`src/models/lfm2.cpp:9-11`: `is_recr_impl[il] = n_head_kv(il) == 0`).
 * Ma l'API pubblica `llama_model_n_head_kv(model)` è `hparams.n_head_kv()`
 * (`src/llama-model.cpp:2545`) con `il = 0` predefinito
 * (`src/llama-hparams.h:342`) ⇒ legge lo strato **0**, che su LFM2 è una
 * convoluzione ⇒ risponde **0**.
 *
 * ## Che cosa sorvegliano queste prove
 *
 * Due regressioni opposte, ognuna con la sua direzione d'errore:
 *
 *  - **rifiutare di nuovo una forma ibrida legittima** ⇒ niente tetto e niente
 *    prefisso congelato, cioè i 31 secondi di nuovo;
 *  - **tornare a contare TUTTI gli strati** ⇒ su LFM2 un costo per token
 *    **cinque volte** più alto del vero, e un contesto tagliato senza motivo.
 *
 * ⛔ E la terza, la più pericolosa, che va nella direzione contraria: uno zero
 * NON si ammorbidisce con un ripiego a 1. Uno zero che arriva fin qui significa
 * che *nessuno* strato ha una cache — un modello interamente ricorrente — e
 * fingere «1» renderebbe il tetto del contesto quasi infinito.
 */

/**
 * La forma che il ponte manda per `LFM2.5-2.6B-Q4_0` DOPO la cura.
 *
 * `layers` non sono i 30 blocchi: sono i soli strati con `head_count_kv > 0`.
 * Il conteggio vero lo fa il nativo leggendo l'array del GGUF
 * (`talos_geometria_kv_di()` in `talos_llama_jni.cpp`); sei è il numero di
 * strati di attenzione di questa taglia, e qui serve solo come esempio di una
 * geometria in cui gli strati con cache sono MENO dei blocchi.
 */
const LFM2_IBRIDO = {
    layers: 6,
    kvHeads: 8,
    headDim: 64,
    trainedContext: 128_000,
    weightBytes: 1_863_907_840,
} as const

/** Quanti blocchi ha davvero il modello — il numero da NON usare nel conto. */
const LFM2_BLOCCHI = 30

describe('la forma di un modello ibrido attraversa il confine', () => {
    /**
     * ⛔ Il rosso che questa prova produce è esattamente il difetto del 10/09:
     * forma nulla ⇒ nessun prefisso congelato ⇒ 31 s al primo token.
     */
    it('una forma con MENO strati con cache che blocchi viene accettata', () => {
        const forma = talosModelShapeOf(LFM2_IBRIDO)
        expect(forma).not.toBeNull()
        expect(forma?.layers).toBe(6)
        expect(forma?.kvHeads).toBe(8)
        expect(forma?.headDim).toBe(64)
    })

    /**
     * La direzione contraria, e va provata: se lo zero passasse, il tetto del
     * contesto salirebbe invece di sparire — e un tetto sbagliato risponde al
     * posto del dispositivo, mentre un tetto assente lo lascia rispondere.
     */
    it('ma zero teste KV resta un rifiuto, non un uno di comodo', () => {
        expect(talosModelShapeOf({ ...LFM2_IBRIDO, kvHeads: 0 })).toBeNull()
        expect(talosModelShapeOf({ ...LFM2_IBRIDO, layers: 0 })).toBeNull()
    })

    /** Un transformer non cambia di una virgola: gli strati con cache sono tutti. */
    it('un transformer resta com era', () => {
        const gemma = { layers: 34, kvHeads: 4, headDim: 256, trainedContext: 131_072, weightBytes: 3_338_000_000 }
        expect(talosModelShapeOf(gemma)?.layers).toBe(34)
    })
})

describe('il costo per token conta gli strati CON cache', () => {
    const forma = talosModelShapeOf(LFM2_IBRIDO) as TalosModelShape

    /**
     * 6 × 8 × 64 × 2 (K e V) × 2 (f16) = **12.288 byte per token**.
     * Contando tutti i 30 blocchi verrebbero 61.440: cinque volte tanto, cioè
     * **201 MB in più a 4.096 token**, tolti al contesto offerto per niente.
     */
    it('per LFM2 sono 12 KiB per token, non 60', () => {
        expect(talosKvBytesPerTokenOf(forma)).toBe(12_288)
        expect(talosKvBytesPerTokenOf(forma)).not.toBe(LFM2_BLOCCHI * 8 * 64 * 2 * 2)
    })

    /** Le due strade — diagnostica e tetto di contesto — devono dire lo stesso. */
    it('e il tetto di contesto usa lo stesso numero', () => {
        expect(talosKvCacheBytes(forma, 4_096)).toBe(12_288 * 4_096)
        expect(talosKvCacheBytes(forma, 1)).toBe(talosKvBytesPerTokenOf(forma))
    })

    /**
     * ⛔ Il verso contrario del conteggio: se qualcuno rimettesse i blocchi al
     * posto degli strati con cache, il numero salirebbe di **5×**. Questa riga
     * fissa il fattore, così la regressione si legge come un rapporto e non
     * come «un numero diverso».
     */
    it('rimettere i blocchi al posto degli strati con cache costa 5×', () => {
        const conTuttiIBlocchi = { ...forma, layers: LFM2_BLOCCHI }
        expect(talosKvBytesPerTokenOf(conTuttiIBlocchi) / talosKvBytesPerTokenOf(forma)).toBe(5)
    })
})
