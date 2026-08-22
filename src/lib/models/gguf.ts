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

export interface TalosGgufHeader {
    architecture: string
    /** From the header, never from the file name. Null for a type we do not know. */
    quantisation: string | null
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
            const elementType = this.u32()
            const count = this.u64()
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
            return
        }
        // A type this parser has never seen has an unknown width, so the
        // position is no longer trustworthy. Better to stop than to continue
        // reading fields from wherever this happens to land.
        throw new Truncated(this.view.byteLength * 2)
    }

    value(type: number): number | string | null {
        switch (type) {
            case ValueType.UINT32:
            case ValueType.INT32:
                return this.u32()
            case ValueType.UINT64:
            case ValueType.INT64:
                return this.u64()
            case ValueType.STRING:
                return this.text()
            default:
                this.skipValue(type)
                return null
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

        const fields = new Map<string, number | string>()
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

        // Tensor infos are walked, not read: their sizes are implied by the
        // data that follows, and the only thing needed from them is where they
        // end.
        for (let index = 0; index < tensorCount; index += 1) {
            reader.text()
            const dimensions = reader.u32()
            reader.skip(dimensions * 8)
            reader.skip(4)
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
        const kvHeads = Number(fields.get(`${architecture}.attention.head_count_kv`) ?? heads)

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
        // A header missing these must never become a model with zero layers,
        // which would pass every fit check ever written.
        if (missing.length > 0) return { ok: false, reason: 'incomplete', missing }

        const fileType = Number(fields.get('general.file_type'))
        const quantisation = FILE_TYPES[fileType] ?? null

        return {
            ok: true,
            header: {
                architecture,
                quantisation,
                dataOffset,
                shape: {
                    weightBytes: Math.max(0, fileBytes - dataOffset),
                    layers,
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
