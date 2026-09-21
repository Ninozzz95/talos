import { describe, expect, it } from 'vitest'
import { talosReadGgufHeader, TALOS_GGUF_FIRST_READ_BYTES } from '@/lib/models/gguf'

/**
 * Reading what a model says about itself, from real bytes.
 *
 * Every app in this category shows the file name and lets the reader guess:
 * `…Q4_K_M.gguf` and a size. The name is a hint written by whoever uploaded the
 * file and is regularly wrong; the header is the model. Layers, KV heads and
 * trained context are what decide whether a phone can hold it, and they are
 * only here.
 *
 * The fixtures below are assembled byte by byte rather than mocked, because a
 * parser tested against its own idea of the format is a parser that agrees with
 * itself and nothing else.
 */

const enum Type {
    UINT32 = 4,
    FLOAT32 = 6,
    STRING = 8,
    ARRAY = 9,
    UINT64 = 10,
}

class Writer {
    private parts: Uint8Array[] = []

    u32(value: number): this {
        const bytes = new Uint8Array(4)
        new DataView(bytes.buffer).setUint32(0, value, true)
        this.parts.push(bytes)
        return this
    }

    u64(value: number): this {
        const bytes = new Uint8Array(8)
        new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true)
        this.parts.push(bytes)
        return this
    }

    f32(value: number): this {
        const bytes = new Uint8Array(4)
        new DataView(bytes.buffer).setFloat32(0, value, true)
        this.parts.push(bytes)
        return this
    }

    raw(bytes: Uint8Array): this {
        this.parts.push(bytes)
        return this
    }

    text(value: string): this {
        const encoded = new TextEncoder().encode(value)
        return this.u64(encoded.length).raw(encoded)
    }

    build(): ArrayBuffer {
        const total = this.parts.reduce((sum, part) => sum + part.length, 0)
        const out = new Uint8Array(total)
        let at = 0
        for (const part of this.parts) {
            out.set(part, at)
            at += part.length
        }
        return out.buffer
    }
}

interface Field {
    key: string
    type: Type
    value?: number | string
    /** For Type.ARRAY of strings — the shape a tokeniser actually has. */
    values?: string[]
}

function gguf(options: {
    fields: Field[]
    /** `type` is the `ggml_type` (see GGML_TYPE_NAMES) — defaults to 12, Q4_K. */
    tensors?: Array<{ name: string; dims: number[]; type?: number }>
    magic?: string
    version?: number
    truncateTo?: number
}): ArrayBuffer {
    const tensors = options.tensors ?? [{ name: 'token_embd.weight', dims: [4096, 32000] }]
    const writer = new Writer()
    writer.raw(new TextEncoder().encode(options.magic ?? 'GGUF'))
    writer.u32(options.version ?? 3)
    writer.u64(tensors.length)
    writer.u64(options.fields.length)

    for (const field of options.fields) {
        writer.text(field.key)
        writer.u32(field.type)
        if (field.type === Type.STRING) writer.text(String(field.value))
        else if (field.type === Type.UINT64) writer.u64(Number(field.value))
        else if (field.type === Type.FLOAT32) writer.f32(Number(field.value))
        else if (field.type === Type.ARRAY) {
            writer.u32(Type.STRING)
            writer.u64((field.values ?? []).length)
            for (const value of field.values ?? []) writer.text(value)
        }
        else writer.u32(Number(field.value))
    }

    for (const tensor of tensors) {
        writer.text(tensor.name)
        writer.u32(tensor.dims.length)
        for (const dimension of tensor.dims) writer.u64(dimension)
        writer.u32(tensor.type ?? 12) // ggml type — P2-6 reads this now, see gguf.ts
        writer.u64(0)
    }

    const built = writer.build()
    return options.truncateTo === undefined ? built : built.slice(0, options.truncateTo)
}

const LLAMA: Field[] = [
    { key: 'general.architecture', type: Type.STRING, value: 'llama' },
    { key: 'general.file_type', type: Type.UINT32, value: 15 },
    { key: 'llama.block_count', type: Type.UINT32, value: 32 },
    { key: 'llama.context_length', type: Type.UINT32, value: 131_072 },
    { key: 'llama.embedding_length', type: Type.UINT32, value: 4096 },
    { key: 'llama.attention.head_count', type: Type.UINT32, value: 32 },
    { key: 'llama.attention.head_count_kv', type: Type.UINT32, value: 8 },
]

describe('reading a GGUF header', () => {
    it('reads what the model says about itself, not what the file name claims', () => {
        const result = talosReadGgufHeader(gguf({ fields: LLAMA }), 4_000_000_000)

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.header.architecture).toBe('llama')
        expect(result.header.shape.layers).toBe(32)
        expect(result.header.shape.trainedContext).toBe(131_072)
        expect(result.header.shape.kvHeads).toBe(8)
    })

    /**
     * Grouped-query attention is why this matters. Eight KV heads instead of
     * thirty-two is a KV cache four times smaller, and an app that assumes the
     * head count refuses models that fit comfortably.
     */
    it('derives the head dimension from the embedding, not from the KV heads', () => {
        const result = talosReadGgufHeader(gguf({ fields: LLAMA }), 4_000_000_000)

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.header.shape.headDim).toBe(128)
    })

    /**
     * The model's own word about its head dimension, where it gives one.
     *
     * `embedding_length / head_count` is only true when the head dimension is
     * tied to the hidden size, and Qwen3, DeepSeek and Gemma all decouple them
     * and publish `attention.key_length`. It feeds the KV cache, so it decides
     * whether a model is offered at all: derived, it told a phone that could
     * hold the model that it could not. Found by an adversarial review,
     * 2026-08-01.
     */
    it('takes the head dimension the model declares over the one it could derive', () => {
        const declared = [
            ...LLAMA,
            { key: 'llama.attention.key_length', type: Type.UINT32, value: 256 },
        ]

        const result = talosReadGgufHeader(gguf({ fields: declared }), 4_000_000_000)

        expect(result.ok).toBe(true)
        if (!result.ok) return
        // 4096 / 32 would be 128. The model says 256, and the model wins.
        expect(result.header.shape.headDim).toBe(256)
    })

    it('still derives one when the model declares none', () => {
        const result = talosReadGgufHeader(gguf({ fields: LLAMA }), 4_000_000_000)

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.header.shape.headDim).toBe(128)
    })

    /**
     * THE reason the header is read at all. `general.file_type` is the model's
     * own statement of its quantisation; the suffix in the file name is a
     * convention that whoever uploaded it may not have followed.
     */
    it('takes the quantisation from the header, which is authoritative', () => {
        const result = talosReadGgufHeader(gguf({ fields: LLAMA }), 4_000_000_000)

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.header.quantisation).toBe('Q4_K_M')
    })

    /**
     * The weights are everything after the header, exactly. Using the file size
     * would count the metadata as weights, and for a split model it would mean
     * nothing at all — a shard is a fraction of a model, not a small model.
     */
    it('measures the weights as the file beyond the header', () => {
        const bytes = gguf({ fields: LLAMA })
        const result = talosReadGgufHeader(bytes, 4_000_000_000)

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.header.dataOffset).toBeGreaterThan(0)
        expect(result.header.shape.weightBytes).toBe(4_000_000_000 - result.header.dataOffset)
    })

    /**
     * A header can be larger than the first read — hundreds of tensors, long
     * names. Asking for more bytes is the correct answer; guessing from a
     * truncated header would report a model with no layers.
     */
    it('asks for more bytes rather than parsing half a header', () => {
        const whole = gguf({ fields: LLAMA })
        const result = talosReadGgufHeader(whole.slice(0, 40), 4_000_000_000)

        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.reason).toBe('truncated')
        expect(result.needBytes).toBeGreaterThan(40)
    })

    it('refuses a file that is not a GGUF at all', () => {
        const result = talosReadGgufHeader(gguf({ fields: LLAMA, magic: 'ZIP ' }), 1000)

        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.reason).toBe('not-gguf')
    })

    /**
     * A version we have never seen may have moved the fields we read. Refusing
     * is recoverable — the download centre says it cannot check this model —
     * while parsing it anyway produces confident numbers about the wrong bytes.
     */
    it('refuses a version it was not written against', () => {
        const result = talosReadGgufHeader(gguf({ fields: LLAMA, version: 99 }), 1000)

        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.reason).toBe('unsupported-version')
    })

    /**
     * Architectures name their own keys. A model whose keys are not where llama
     * puts them must not silently become a model with zero layers, which would
     * pass every fit check ever written.
     */
    it('refuses a header missing what the fit calculation needs', () => {
        const result = talosReadGgufHeader(
            gguf({ fields: LLAMA.filter((field) => !field.key.endsWith('block_count')) }),
            4_000_000_000,
        )

        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.reason).toBe('incomplete')
    })

    /** Another architecture, keys under its own name, read the same way. */
    it('follows the architecture rather than assuming llama', () => {
        const qwen: Field[] = [
            { key: 'general.architecture', type: Type.STRING, value: 'qwen3' },
            { key: 'general.file_type', type: Type.UINT32, value: 7 },
            { key: 'qwen3.block_count', type: Type.UINT32, value: 36 },
            { key: 'qwen3.context_length', type: Type.UINT32, value: 40_960 },
            { key: 'qwen3.embedding_length', type: Type.UINT32, value: 2560 },
            { key: 'qwen3.attention.head_count', type: Type.UINT32, value: 32 },
            { key: 'qwen3.attention.head_count_kv', type: Type.UINT32, value: 8 },
        ]

        const result = talosReadGgufHeader(gguf({ fields: qwen }), 2_000_000_000)

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.header.architecture).toBe('qwen3')
        expect(result.header.shape.layers).toBe(36)
        expect(result.header.quantisation).toBe('Q8_0')
    })

    /**
     * Values of every width appear in real headers, and a parser that mis-steps
     * over one reads the NEXT key from the middle of a value — which does not
     * fail, it produces nonsense.
     */
    it('steps over value types it does not care about without losing its place', () => {
        const noisy: Field[] = [
            { key: 'general.architecture', type: Type.STRING, value: 'llama' },
            { key: 'general.name', type: Type.STRING, value: 'A model with a long name' },
            { key: 'general.quantization_version', type: Type.UINT32, value: 2 },
            { key: 'llama.rope.freq_base', type: Type.FLOAT32, value: 500_000 },
            { key: 'llama.something.huge', type: Type.UINT64, value: 9_000_000_000 },
            ...LLAMA.slice(1),
        ]

        const result = talosReadGgufHeader(gguf({ fields: noisy }), 4_000_000_000)

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.header.shape.layers).toBe(32)
        expect(result.header.shape.kvHeads).toBe(8)
    })

    /**
     * The tokeniser lives in the header as arrays of a hundred thousand
     * strings, which is why the first read is measured in megabytes and why
     * stepping over an array without reading it matters.
     */
    it('steps over a large array without reading all of it', () => {
        const writer = new Writer()
        writer.raw(new TextEncoder().encode('GGUF')).u32(3).u64(1).u64(LLAMA.length + 1)
        writer.text('tokenizer.ggml.tokens').u32(Type.ARRAY).u32(Type.STRING).u64(3)
        writer.text('a').text('bb').text('ccc')
        for (const field of LLAMA) {
            writer.text(field.key).u32(field.type)
            if (field.type === Type.STRING) writer.text(String(field.value))
            else writer.u32(Number(field.value))
        }
        writer.text('token_embd.weight').u32(2).u64(4096).u64(32_000).u32(12).u64(0)

        const result = talosReadGgufHeader(writer.build(), 4_000_000_000)

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.header.shape.layers).toBe(32)
    })

    /** Big enough that a header almost never needs a second request. */
    it('reads enough on the first request to cover an ordinary header', () => {
        expect(TALOS_GGUF_FIRST_READ_BYTES).toBeGreaterThanOrEqual(1024 * 1024)
    })
})

describe('P2-6 — quant-aware metadata: parameter count and tensor type histogram', () => {
    /**
     * No GGUF metadata key carries this directly — verified against the
     * vendored `gguf-py` (`total_params` is a caller-supplied argument in
     * every writer/metadata function, never a stored field). The only
     * honest source is summing every tensor's own element count.
     */
    it('sums element counts across every tensor, not just the first', () => {
        const result = talosReadGgufHeader(gguf({
            fields: LLAMA,
            tensors: [
                { name: 'token_embd.weight', dims: [4096, 32000], type: 0 },
                { name: 'blk.0.attn_norm.weight', dims: [128, 128], type: 1 },
            ],
        }), 4_000_000_000)

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.header.parameterCount).toBe(4096 * 32000 + 128 * 128)
    })

    /** AL CONTRARIO — a header with fields but zero tensors reports `null`, not a silent 0. */
    it('reports null, not zero, when no tensor exists to sum', () => {
        const result = talosReadGgufHeader(gguf({ fields: LLAMA, tensors: [] }), 4_000_000_000)

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.header.parameterCount).toBeNull()
        expect(result.header.tensorTypeHistogram).toEqual({})
    })

    /**
     * `file_type` (`Q4_K_M`) names a whole model's recipe; a single tensor is
     * only ever one plain `ggml_type` (`Q4_K`, never `_M`). Different
     * vocabularies, and the histogram must use the tensor one.
     */
    it('names each tensor by its OWN ggml_type, not the model file_type', () => {
        const result = talosReadGgufHeader(gguf({
            fields: LLAMA, // general.file_type = 15 -> "Q4_K_M"
            tensors: [
                { name: 'a', dims: [4], type: 12 }, // Q4_K
                { name: 'b', dims: [4], type: 12 }, // Q4_K
                { name: 'c', dims: [4], type: 1 },  // F16
            ],
        }), 4_000_000_000)

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.header.tensorTypeHistogram).toEqual({ Q4_K: 2, F16: 1 })
    })

    /**
     * The format adds `ggml_type` values faster than any app can track them
     * (MXFP4/NVFP4 arrived in the same window this header parser was
     * written). A type this table has never seen must not sink the whole
     * model — it degrades to a labelled unknown, same principle as the
     * value-type stepper above refusing to guess a width it has never seen.
     */
    it('AL CONTRARIO — an unrecognised ggml_type degrades to a label, never a refusal', () => {
        const result = talosReadGgufHeader(gguf({
            fields: LLAMA,
            tensors: [{ name: 'token_embd.weight', dims: [4096, 32000], type: 99 }],
        }), 4_000_000_000)

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.header.tensorTypeHistogram).toEqual({ 'unknown-99': 1 })
        // The element count is still real — an unrecognised TYPE says nothing about SIZE.
        expect(result.header.parameterCount).toBe(4096 * 32000)
    })

    it('reads general.quantization_version when the header declares it', () => {
        const withVersion = [
            ...LLAMA,
            { key: 'general.quantization_version', type: Type.UINT32, value: 2 },
        ]
        const result = talosReadGgufHeader(gguf({ fields: withVersion }), 4_000_000_000)

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.header.quantizationVersion).toBe(2)
    })

    /** AL CONTRARIO — most real headers omit it; absence must read as unmeasured, not as 0. */
    it('reports null, not zero, when quantization_version is absent', () => {
        const result = talosReadGgufHeader(gguf({ fields: LLAMA }), 4_000_000_000)

        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.header.quantizationVersion).toBeNull()
    })
})

describe('an intestazione that does not fit the first read', () => {
    /**
     * The defect the owner hit on a train, 2026-08-02.
     *
     * `mradermacher/Holo-3.1-4B-i1-GGUF` carries a **10.969.337-byte** header:
     * merges 5,09 MB, tokens 4,85 MB, token_type 0,99 MB. The reader asks for
     * one mebibyte, and when it falls short it GUESSES — "twice what I was
     * given" — so three attempts reach 8 MiB and stop, two megabytes short,
     * under a ceiling of 32 that was never approached.
     *
     * The parser is walking a string array when it runs out. It knows how many
     * strings there are and how long the ones it has read were: that is a
     * measurement, not a guess, and it converges in one more request instead of
     * five.
     */
    it('estimates from the tokeniser it is walking instead of blindly doubling', () => {
        const tokens = Array.from({ length: 4000 }, (_, index) => `token_${index}_padding_padding`)
        const full = gguf({ fields: [...LLAMA, { key: 'tokenizer.ggml.tokens', type: Type.ARRAY, values: tokens }] })
        const window = 4096

        const result = talosReadGgufHeader(full.slice(0, window), 4_000_000_000)

        expect(result.ok).toBe(false)
        if (result.ok || result.reason !== 'truncated') throw new Error('atteso troncamento')
        // Blind doubling would ask for 8.192 bytes — about 3% of what is needed.
        // The estimate has to land in the right order of magnitude, or the loop
        // gives up before it arrives.
        expect(result.needBytes).toBeGreaterThan(full.byteLength * 0.8)
    })

    it('still asks for more when it has nothing to extrapolate from', () => {
        // Truncated before a single string of the array was read: there is no
        // average yet, and inventing one would be worse than doubling.
        const result = talosReadGgufHeader(gguf({ fields: LLAMA }).slice(0, 30), 4_000_000_000)

        expect(result.ok).toBe(false)
        if (result.ok || result.reason !== 'truncated') throw new Error('atteso troncamento')
        expect(result.needBytes).toBeGreaterThan(30)
    })
})

describe('a file that is not a model', () => {
    /**
     * Also from the train: `Holo-3.1-4B.imatrix` was offered with a Download
     * button and a fit verdict. It IS a valid GGUF — version 3, 496 tensors —
     * but it carries four keys and none of them is a model's:
     * `general.type='imatrix'`, `imatrix.datasets`, `imatrix.chunk_count`,
     * `imatrix.chunk_size`. It is the importance matrix used to QUANTISE a
     * model, not a model.
     *
     * Saying "the header does not tell me what I need" is true and useless. The
     * reader has to say what the thing is.
     */
    it('recognises an importance matrix instead of calling it an unreadable model', () => {
        const result = talosReadGgufHeader(gguf({
            fields: [
                { key: 'general.type', type: Type.STRING, value: 'imatrix' },
                { key: 'imatrix.chunk_count', type: Type.UINT32, value: 319 },
            ],
        }), 3_626_464)

        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.reason).toBe('not-a-model')
        if (result.reason !== 'not-a-model') return
        expect(result.kind).toBe('imatrix')
    })

    it('does not mistake a real model for one, however it labels itself', () => {
        // Real models carry `general.type = 'model'` — the Qwen on the tablet
        // does. A missing key must not become a refusal either.
        const labelled = talosReadGgufHeader(gguf({
            fields: [{ key: 'general.type', type: Type.STRING, value: 'model' }, ...LLAMA],
        }), 4_000_000_000)
        const unlabelled = talosReadGgufHeader(gguf({ fields: LLAMA }), 4_000_000_000)

        expect(labelled.ok).toBe(true)
        expect(unlabelled.ok).toBe(true)
    })
})
