import type { TalosModelShape } from '@/lib/models/fit'

/**
 * What a model says about itself.
 *
 * Every app in this category shows a file name and a size and lets the reader
 * guess: `…Q4_K_M.gguf`, 2.4 GB, good luck. The name is a convention written by
 * whoever uploaded the file and is regularly wrong. The header is the model —
 * layers, KV heads, trained context — and it is the only place the numbers that
 * decide whether a phone can hold it actually live.
 *
 * Read over a Range request against the CDN, which costs about a megabyte and
 * answers a question no competitor asks.
 *
 * Pure: bytes in, verdict out. Nothing here reaches the network, so every rule
 * below is provable against headers assembled byte by byte.
 */

/**
 * How much to ask for first.
 *
 * The tokeniser lives in the header as arrays of a hundred thousand strings, so
 * a header is routinely hundreds of kilobytes and occasionally more. Asking for
 * a megabyte covers essentially all of them in one request; the parser still
 * says how much more it needs when it does not.
 */
export const TALOS_GGUF_FIRST_READ_BYTES = 1024 * 1024

const MAGIC = 0x46554747 // "GGUF", little-endian
const SUPPORTED_VERSIONS = new Set([2, 3])

/** GGUF value types, in the order the format defines them. */
const ValueType = {
    UINT8: 0,
    INT8: 1,
    UINT16: 2,
    INT16: 3,
    UINT32: 4,
    INT32: 5,
    FLOAT32: 6,
    BOOL: 7,
    STRING: 8,
    ARRAY: 9,
    UINT64: 10,
    INT64: 11,
    FLOAT64: 12,
} as const

/**
 * The widths that let a value be stepped over without being read.
 *
 * Getting one wrong does not fail — it reads the NEXT key from the middle of a
 * value and produces a header full of plausible nonsense.
 */
const FIXED_WIDTH: Record<number, number> = {
    [ValueType.UINT8]: 1,
    [ValueType.INT8]: 1,
    [ValueType.BOOL]: 1,
    [ValueType.UINT16]: 2,
    [ValueType.INT16]: 2,
    [ValueType.UINT32]: 4,
    [ValueType.INT32]: 4,
    [ValueType.FLOAT32]: 4,
    [ValueType.UINT64]: 8,
    [ValueType.INT64]: 8,
    [ValueType.FLOAT64]: 8,
}

/**
 * `general.file_type`, which is the model's own statement of its quantisation
 * and outranks the suffix in its name.
 *
 * A format enumeration rather than a list of products: it is append-only and
 * an unknown value simply reads as unknown, which is why it can live here while
 * a table of chips could not.
 */
/**
 * ⛔ Un solo vocabolario dei formati, non due che un giorno divergono.
 *
 * Lo legge chi esamina un GGUF su Hugging Face **e** chi decide su quale
 * motore aprirlo sul telefono (`talosLocalModelQuantisation`). Due tabelle
 * copiate sarebbero due risposte alla stessa domanda, ed e' il difetto che
 * questo progetto ha gia' pagato altrove.
 */
export function talosQuantisationOfFileType(fileType: number): string | null {
    return FILE_TYPES[fileType] ?? null
}

const FILE_TYPES: Record<number, string> = {
    0: 'F32',
    1: 'F16',
    2: 'Q4_0',
    3: 'Q4_1',
    7: 'Q8_0',
    8: 'Q5_0',
    9: 'Q5_1',
    10: 'Q2_K',
    11: 'Q3_K_S',
    12: 'Q3_K_M',
    13: 'Q3_K_L',
    14: 'Q4_K_S',
    15: 'Q4_K_M',
    16: 'Q5_K_S',
    17: 'Q5_K_M',
    18: 'Q6_K',
    19: 'IQ2_XXS',
    20: 'IQ2_XS',
    21: 'Q2_K_S',
    22: 'IQ3_XS',
    23: 'IQ3_XXS',
    24: 'IQ1_S',
    25: 'IQ4_NL',
    26: 'IQ3_S',
    27: 'IQ3_M',
    28: 'IQ2_S',
    29: 'IQ2_M',
    30: 'IQ4_XS',
    31: 'IQ1_M',
    32: 'BF16',
}

/**
 * `ggml_type`, from `ggml/include/ggml.h` in the vendored submodule —
 * verified against the pinned source, not the general `general.file_type`
 * enum above (a DIFFERENT vocabulary: `file_type` names a whole model's
 * quantisation RECIPE, like `Q4_K_M`, which mixes several per-tensor types;
 * a tensor itself is only ever one plain `Q4_K`, never `_M`/`_S`/`_L`).
 *
 * P2-6 (quant-aware model metadata): "4-bit" is not a performance profile —
 * a tensor histogram is the only honest way to say what a model actually
 * contains, because a mixed recipe can dispatch to very different kernels
 * per tensor. Numbers with no name below fall back to `unknown-<n>` rather
 * than being dropped — a format this actively developed adds types faster
 * than any app tracks them, and a model is still readable without one.
 */
const GGML_TYPE_NAMES: Record<number, string> = {
    0: 'F32', 1: 'F16', 2: 'Q4_0', 3: 'Q4_1', 6: 'Q5_0', 7: 'Q5_1', 8: 'Q8_0', 9: 'Q8_1',
    10: 'Q2_K', 11: 'Q3_K', 12: 'Q4_K', 13: 'Q5_K', 14: 'Q6_K', 15: 'Q8_K',
    16: 'IQ2_XXS', 17: 'IQ2_XS', 18: 'IQ3_XXS', 19: 'IQ1_S', 20: 'IQ4_NL', 21: 'IQ3_S',
    22: 'IQ2_S', 23: 'IQ4_XS', 24: 'I8', 25: 'I16', 26: 'I32', 27: 'I64', 28: 'F64',
    29: 'IQ1_M', 30: 'BF16', 34: 'TQ1_0', 35: 'TQ2_0', 39: 'MXFP4', 40: 'NVFP4',
    41: 'Q1_0', 42: 'Q2_0',
}

export interface TalosGgufHeader {
    architecture: string
    /** From the header, never from the file name. Null for a type we do not know. */
    quantisation: string | null
    /**
     * `general.quantization_version` — the GGML_QUANT_VERSION the file was
     * produced against (2, at the time of writing). `null` when the field is
     * absent, which is a real and common case, not a parse failure.
     */
    quantizationVersion: number | null
    /**
     * The sum of every tensor's element count — computed here because GGUF
     * carries no direct `general.parameter_count` key (verified against the
     * vendored `gguf-py`: `total_params` is always a CALLER-supplied number
     * in every writer/metadata path, never a stored field). `null` only if
     * no tensor could be read at all, which the `incomplete` case above
     * already rules out for anything that reaches this point.
     */
    parameterCount: number | null
    /**
     * How many tensors carry each `ggml_type` — see {@link GGML_TYPE_NAMES}.
     * A build that "enables" a faster kernel path is not evidence that path
     * is actually used on THIS model; a histogram is.
     */
    tensorTypeHistogram: Readonly<Record<string, number>>
    /** Where the weights begin: everything past this is tensor data. */
    dataOffset: number
    shape: TalosModelShape
}

export type TalosGgufFailure =
    | { ok: false; reason: 'not-gguf' }
    | { ok: false; reason: 'unsupported-version'; version: number }
    | { ok: false; reason: 'truncated'; needBytes: number }
    | { ok: false; reason: 'incomplete'; missing: string[] }
    /**
     * A valid GGUF that is not a model — an importance matrix, most often.
     *
     * Kept apart from `incomplete` because the two need opposite words. An
     * incomplete header is a model we failed to understand; this is a file that
     * was never a model, and telling the reader "the header does not say what I
     * need" is true and useless. `general.type` says what it is; the format has
     * carried that key since GGUFv3 and llama.cpp writes `model` on models.
     */
    | { ok: false; reason: 'not-a-model'; kind: string }

export type TalosGgufResult = { ok: true; header: TalosGgufHeader } | TalosGgufFailure

/**
 * How much room to leave on an extrapolated header size.
 *
 * The average of the tokens read so far is a sample, and the tail of a
 * vocabulary is usually longer than its head — rare words are long words. A
 * fifteen percent margin costs nothing (the request is capped anyway) and saves
 * the round trip that a one-percent shortfall would cost.
 */
const ARRAY_ESTIMATE_SLACK = 1.15

/**
 * Quanti elementi di un array numerico vale la pena LEGGERE invece di scavalcare.
 *
 * ⛔ Il tetto non e' prudenza generica, e' la differenza fra due cose che
 * stanno nello stesso file: le chiavi **per-strato** hanno un elemento per
 * strato — trenta su `LFM2.5-2.6B`, poche centinaia sui modelli piu' profondi
 * che esistano — mentre `tokenizer.ggml.tokens` ne ha **128.000** e
 * `tokenizer.ggml.merges` **293.320** (contati sul file vero, Pad, 2026-09-10).
 *
 * Mille lascia un margine di trenta volte sopra il caso che ci serve e resta
 * due ordini di grandezza sotto il vocabolario. Sopra il tetto si scavalca e si
 * risponde `null`: **«non lo so»**, mai un array troncato.
 */
const TALOS_GGUF_MAX_READ_ARRAY = 1024

/** Thrown internally the moment a read would run past the bytes we were given. */
class Truncated extends Error {
    readonly needBytes: number

    constructor(needBytes: number) {
        super('truncated')
        this.needBytes = needBytes
    }
}

class Reader {
    private at = 0
    private readonly view: DataView

    constructor(view: DataView) {
        this.view = view
    }

    get offset(): number {
        return this.at
    }

    private need(bytes: number): void {
        if (this.at + bytes > this.view.byteLength) {
            // Ask for what would have been read plus room to continue, rather
            // than one byte at a time: a header short by a tokeniser array
            // would otherwise take thousands of round trips to discover.
            throw new Truncated(Math.max(this.at + bytes, this.view.byteLength * 2))
        }
    }

    u32(): number {
        this.need(4)
        const value = this.view.getUint32(this.at, true)
        this.at += 4
        return value
    }

    u64(): number {
        this.need(8)
        const value = Number(this.view.getBigUint64(this.at, true))
        this.at += 8
        return value
    }

    skip(bytes: number): void {
        this.need(bytes)
        this.at += bytes
    }

    text(): string {
        const length = this.u64()
        this.need(length)
        const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.at, length)
        this.at += length
        return new TextDecoder().decode(bytes)
    }

    /** Step over a value without reading it — see {@link FIXED_WIDTH}. */
    skipValue(type: number): void {
        const width = FIXED_WIDTH[type]
        if (width !== undefined) {
            this.skip(width)
            return
        }
        if (type === ValueType.STRING) {
            this.skip(this.u64())
            return
        }
        if (type === ValueType.ARRAY) {
            this.skipArrayBody(this.u32(), this.u64())
            return
        }
        // A type this parser has never seen has an unknown width, so the
        // position is no longer trustworthy. Better to stop than to continue
        // reading fields from wherever this happens to land.
        throw new Truncated(this.view.byteLength * 2)
    }

    /**
     * Scavalca il corpo di un array, con intestazione GIÀ letta.
     *
     * ⛔ Estratto da `skipValue` il 2026-09-10 perché ora ha **due** chiamanti:
     * chi scavalca e chi ha provato a leggere e ha rinunciato
     * ({@link Reader.shortNumericArray}). Se restassero due copie, un domani
     * ne verrebbe corretta una sola — e la seconda lascerebbe la posizione a
     * metà di un array, cioè leggerebbe i campi successivi da un punto
     * qualunque del file, in silenzio.
     */
    private skipArrayBody(elementType: number, count: number): void {
        const elementWidth = FIXED_WIDTH[elementType]
        if (elementWidth !== undefined) {
            this.skip(elementWidth * count)
            return
        }
        // Strings are variable-length, so the only way past a hundred
        // thousand tokens is to walk them.
        //
        // And when the walk runs out of bytes, THIS is the one place in the
        // parser that can do better than guessing. It knows how many
        // strings there are and how long the ones it has read turned out to
        // be: the remainder is arithmetic, not a doubling. The alternative
        // was measured on a real file — a header of 10.969.337 bytes that
        // three doublings from one mebibyte never reached, stopping at
        // eight under a ceiling of thirty-two that was never approached.
        const start = this.at
        for (let index = 0; index < count; index += 1) {
            try {
                this.skip(this.u64())
            } catch (stopped) {
                // Nothing read yet means nothing to average: doubling is
                // still the honest answer there.
                if (!(stopped instanceof Truncated) || index === 0) throw stopped
                const perItem = (this.at - start) / index
                const estimate = Math.ceil(start + perItem * count * ARRAY_ESTIMATE_SLACK)
                throw new Truncated(Math.max(estimate, this.view.byteLength + 1))
            }
        }
    }

    value(type: number): number | string | readonly number[] | null {
        switch (type) {
            case ValueType.UINT32:
            case ValueType.INT32:
                return this.u32()
            case ValueType.UINT64:
            case ValueType.INT64:
                return this.u64()
            case ValueType.STRING:
                return this.text()
            case ValueType.ARRAY:
                return this.shortNumericArray()
            default:
                this.skipValue(type)
                return null
        }
    }

    /**
     * ⭐⭐⭐ Un array CORTO di numeri si LEGGE; tutto il resto si scavalca.
     *
     * ## Perché è nato: una sovrastima di CINQUE VOLTE, misurata
     *
     * Le architetture ibride pubblicano `attention.head_count_kv` come **array
     * per-strato**, non come scalare: su `LFM2.5-2.6B`, letto dal Pad il
     * 2026-09-10 dai metadati del file stesso,
     * `arr[i32,30] = [0, 0, 8, 0, 0, 8, 0, 0, 0, 8, 0, 0, …]` — zero dove lo
     * strato è ricorrente, 8 dove c'è attenzione vera.
     *
     * Questo lettore scavalcava **ogni** array, quindi quella chiave tornava
     * `undefined` e il conto ripiegava su `attention.head_count` = **32**,
     * moltiplicato per **tutti e 30** gli strati:
     *
     *     30 × 32 × 64 × 2 × 2  =  245.760 byte/token   ← quello che dicevamo
     *      6 ×  8 × 64 × 2 × 2  =   12.288 byte/token   ← quello vero
     *
     * **Venti volte.** ⛔ Questo numero l'ho sbagliato due volte scrivendolo a
     * mano («cinque volte») prima che `ggufIbridi.test.ts` lo smentisse. Sbaglia dalla parte prudente — rifiuta contesti che il
     * telefono reggerebbe — ma nel catalogo Hugging Face un modello ibrido
     * appariva molto più pesante di com'è, e nessuno poteva accorgersene.
     *
     * ## Perché un TETTO, e perché così basso
     *
     * Nello stesso file c'è `tokenizer.ggml.tokens`, **128.000 stringhe**, e
     * `tokenizer.ggml.merges`, **293.320**. Leggere gli array senza un tetto
     * vorrebbe dire tenere in memoria l'intero vocabolario per ricavarne una
     * moltiplicazione. Gli array che ci servono hanno **un elemento per
     * strato**: qualche decina, mai più di qualche centinaio.
     *
     * ⇒ Sopra il tetto si scavalca **esattamente come prima**, e chi legge
     * riceve `null`, cioè «non lo so» — mai un array troncato, che sarebbe una
     * risposta e sarebbe sbagliata.
     *
     * ## La forma, alla fonte
     *
     * `[tipo elemento: u32][conteggio: u64][elementi]` —
     * https://github.com/ggml-org/ggml/blob/master/docs/gguf.md (letto il
     * 2026-09-10). L'array per-strato di LFM2 è documentato anche in
     * https://github.com/ggml-org/llama.cpp/issues/16278 (letto il 2026-09-10).
     */
    private shortNumericArray(): readonly number[] | null {
        const elementType = this.u32()
        const count = this.u64()
        const width = FIXED_WIDTH[elementType]
        if (width === undefined || count > TALOS_GGUF_MAX_READ_ARRAY) {
            this.skipArrayBody(elementType, count)
            return null
        }
        const numbers: number[] = []
        for (let index = 0; index < count; index += 1) {
            this.need(width)
            numbers.push(this.numberOfWidth(elementType, width))
        }
        return numbers
    }

    /**
     * ⛔ Solo i tipi che servono a una geometria. Un `FLOAT64` o un `BOOL`
     * dentro una chiave per-strato non è un caso che esista oggi, e inventargli
     * una lettura vorrebbe dire scrivere codice che nessuna misura ha mai
     * attraversato. Si scavalca e si dice «non lo so».
     */
    private numberOfWidth(elementType: number, width: number): number {
        const at = this.at
        this.at += width
        switch (elementType) {
            case ValueType.UINT8: return this.view.getUint8(at)
            case ValueType.INT8: return this.view.getInt8(at)
            case ValueType.UINT16: return this.view.getUint16(at, true)
            case ValueType.INT16: return this.view.getInt16(at, true)
            case ValueType.UINT32: return this.view.getUint32(at, true)
            case ValueType.INT32: return this.view.getInt32(at, true)
            case ValueType.FLOAT32: return this.view.getFloat32(at, true)
            case ValueType.UINT64: return Number(this.view.getBigUint64(at, true))
            case ValueType.INT64: return Number(this.view.getBigInt64(at, true))
            case ValueType.FLOAT64: return this.view.getFloat64(at, true)
            default: return Number.NaN
        }
    }
}

/**
 * Read the header.
 *
 * @param bytes the first slice of the file — see {@link TALOS_GGUF_FIRST_READ_BYTES}
 * @param fileBytes the whole file's length, from the Hub's paths-info answer.
 *     Needed because the weights are measured as everything past the header:
 *     using the file size alone would count metadata as weights, and for a
 *     shard of a split model it would mean nothing at all.
 */
export function talosReadGgufHeader(bytes: ArrayBuffer, fileBytes: number): TalosGgufResult {
    const view = new DataView(bytes)
    if (view.byteLength < 24) return { ok: false, reason: 'truncated', needBytes: 24 }
    if (view.getUint32(0, true) !== MAGIC) return { ok: false, reason: 'not-gguf' }

    const version = view.getUint32(4, true)
    if (!SUPPORTED_VERSIONS.has(version)) return { ok: false, reason: 'unsupported-version', version }

    const reader = new Reader(view)
    reader.skip(8)

    try {
        const tensorCount = reader.u64()
        const fieldCount = reader.u64()

        const fields = new Map<string, number | string | readonly number[]>()
        for (let index = 0; index < fieldCount; index += 1) {
            const key = reader.text()
            const type = reader.u32()
            const value = reader.value(type)
            if (value !== null) fields.set(key, value)
        }

        // Asked before the tensor walk and before any model field is read: a
        // file that is not a model has none of them, and reporting the absence
        // of `block_count` on an importance matrix is a true sentence about the
        // wrong question.
        const declaredType = String(fields.get('general.type') ?? 'model')
        if (declaredType !== 'model') return { ok: false, reason: 'not-a-model', kind: declaredType }

        /**
         * Tensor infos are walked, not skipped whole: P2-6 needs the element
         * count (for `parameterCount`) and the per-tensor `ggml_type` (for
         * `tensorTypeHistogram`), so both are read now instead of stepped
         * over. Only the trailing offset (8 bytes) is still skipped — it is
         * where the tensor's DATA begins, not metadata, and nothing here
         * needs it. Names are still discarded: no consumer keys anything by
         * per-tensor name today, and keeping them would grow this map with
         * every layer of every model for zero use.
         */
        const tensorTypeHistogram: Record<string, number> = {}
        let parameterCount = 0
        for (let index = 0; index < tensorCount; index += 1) {
            reader.text()
            const dimensions = reader.u32()
            let elements = 1
            for (let dimension = 0; dimension < dimensions; dimension += 1) elements *= reader.u64()
            parameterCount += elements
            const tensorType = reader.u32()
            const typeName = GGML_TYPE_NAMES[tensorType] ?? `unknown-${tensorType}`
            tensorTypeHistogram[typeName] = (tensorTypeHistogram[typeName] ?? 0) + 1
            reader.skip(8)
        }

        const architecture = String(fields.get('general.architecture') ?? '')
        const alignment = Number(fields.get('general.alignment') ?? 32)
        const dataOffset = Math.ceil(reader.offset / alignment) * alignment

        const layers = Number(fields.get(`${architecture}.block_count`))
        const trainedContext = Number(fields.get(`${architecture}.context_length`))
        const embedding = Number(fields.get(`${architecture}.embedding_length`))
        const heads = Number(fields.get(`${architecture}.attention.head_count`))
        // Grouped-query attention: a model with 8 KV heads instead of 32 has a
        // KV cache four times smaller, and assuming the head count refuses
        // models that fit comfortably. Falls back to the head count for the
        // older architectures that genuinely have no separate figure.
        const dichiarateKv = fields.get(`${architecture}.attention.head_count_kv`)
        /**
         * ⭐⭐⭐ LE ARCHITETTURE IBRIDE, e i due numeri che cambiano insieme.
         *
         * Quando `head_count_kv` e' un **array per-strato** — `LFM2.5-2.6B`:
         * `[0, 0, 8, 0, 0, 8, 0, …]` su trenta strati, letto dal Pad il
         * 2026-09-10 — gli zeri sono strati **ricorrenti**, che una cache KV non
         * ce l'hanno affatto. Contarli vorrebbe dire fatturare memoria che non
         * esiste.
         *
         * ⇒ Due letture dallo stesso array, e devono restare coerenti:
         *   - **quanti strati** hanno davvero una cache (gli elementi `> 0`);
         *   - **quante teste**, cioe' il **massimo** fra quelli — non la media:
         *     sovrastimare abbassa il tetto del contesto (errore innocuo),
         *     sottostimarlo lo **alza** e fa aprire modelli che non ci stanno.
         *
         * ⛔ E' la STESSA regola che il nativo applica sul dispositivo
         * (`talos_geometria_kv_di` in `talos_llama_jni.cpp`): due risposte
         * diverse alla stessa domanda sarebbero due schermate che si
         * contraddicono, e nessun modo di sapere quale mente.
         *
         * ⛔ Un modello **interamente** ricorrente (Mamba, RWKV) qui conta zero
         * strati con KV, e cade nel controllo `missing` piu' sotto: e'
         * deliberato. Per quelle architetture un «byte per token» non descrive
         * la memoria, e uno zero renderebbe il tetto del contesto infinito.
         */
        const perStrato = Array.isArray(dichiarateKv) ? dichiarateKv.filter((n) => n > 0) : null
        const kvHeads = perStrato !== null
            ? Math.max(0, ...perStrato)
            : Number(dichiarateKv ?? heads)
        /**
         * Gli strati che pesano sulla cache. Per un transformer sono tutti, e
         * questa riga vale `block_count` come e' sempre valso.
         */
        const kvLayers = perStrato !== null ? perStrato.length : layers

        /**
         * The head dimension, from the model's own word where it gives one.
         *
         * `embedding_length / head_count` is only true when the head dimension
         * is tied to the hidden size, and a growing number of architectures
         * decouple them — Qwen3, DeepSeek and Gemma all publish
         * `attention.key_length`, and for those the derived figure is simply
         * wrong. It feeds the KV cache calculation, so it decides whether a
         * model is offered at all: a phone that could hold it is told it cannot,
         * or worse. Found by an adversarial review, 2026-08-01.
         */
        const declaredHeadDim = Number(fields.get(`${architecture}.attention.key_length`))
        const headDim = Number.isFinite(declaredHeadDim) && declaredHeadDim > 0
            ? declaredHeadDim
            : Math.floor(embedding / heads)

        const missing: string[] = []
        if (!architecture) missing.push('general.architecture')
        if (!Number.isFinite(layers) || layers <= 0) missing.push('block_count')
        if (!Number.isFinite(trainedContext) || trainedContext <= 0) missing.push('context_length')
        if (!Number.isFinite(embedding) || embedding <= 0) missing.push('embedding_length')
        if (!Number.isFinite(heads) || heads <= 0) missing.push('attention.head_count')
        if (!Number.isFinite(kvHeads) || kvHeads <= 0) missing.push('attention.head_count_kv')
        // ⛔ Zero strati con cache = nessun modello di cui sappiamo dire il peso
        // per token. Vedi il commento sugli ibridi sopra: e' un rifiuto voluto.
        if (!Number.isFinite(kvLayers) || kvLayers <= 0) missing.push('attention.head_count_kv')
        // A header missing these must never become a model with zero layers,
        // which would pass every fit check ever written.
        if (missing.length > 0) return { ok: false, reason: 'incomplete', missing }

        const fileType = Number(fields.get('general.file_type'))
        const quantisation = talosQuantisationOfFileType(fileType)

        const declaredQuantVersion = Number(fields.get('general.quantization_version'))
        const quantizationVersion = Number.isFinite(declaredQuantVersion) ? declaredQuantVersion : null

        return {
            ok: true,
            header: {
                architecture,
                quantisation,
                quantizationVersion,
                // No tensor read at all is not "a model with zero parameters" —
                // it is a number this header cannot honestly give.
                parameterCount: tensorCount > 0 ? parameterCount : null,
                tensorTypeHistogram,
                dataOffset,
                shape: {
                    weightBytes: Math.max(0, fileBytes - dataOffset),
                    // ⛔ Gli strati che hanno una CACHE, non la profondita' del
                    // modello: `layers` qui entra solo nella moltiplicazione
                    // della KV (`talosKvBytesPerTokenOf`), e su un ibrido le due
                    // cose sono numeri diversi. Stessa scelta del nativo.
                    layers: kvLayers,
                    kvHeads,
                    headDim,
                    trainedContext,
                    // f16 unless the file says otherwise; quantising the KV
                    // cache is a runtime choice, not something the model states.
                    kvBytesPerElement: 2,
                },
            },
        }
    } catch (stopped) {
        if (stopped instanceof Truncated) {
            return { ok: false, reason: 'truncated', needBytes: stopped.needBytes }
        }
        throw stopped
    }
}
