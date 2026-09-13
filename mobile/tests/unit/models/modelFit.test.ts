import { describe, expect, it } from 'vitest'
import {
    TALOS_STORAGE_RESERVE_BYTES,
    talosEstimatedCapacity,
    talosKvCacheBytes,
    talosMaxContextFor,
    talosModelFit,
    type TalosDeviceCapacity,
    type TalosKvCacheTypeOverride,
    type TalosModelShape,
} from '@/lib/models/fit'

/**
 * Slice 2 — "will this model actually run on THIS phone?", as arithmetic.
 *
 * Every competitor shows a list of file names and lets the reader guess. The
 * closest anyone comes is a rule of thumb against a table of RAM. TALOS already
 * measures the device, so the guess is computable — and the interesting half is
 * not the yes, it is the NO that arrives with a reason and a counter-offer.
 *
 * The numbers here come from the reference shapes the dossier worked through:
 * a 1B at Q4_K_M, and a 7B whose KV cache alone can exceed its weights.
 */
const GIB = 1024 ** 3
const MIB = 1024 ** 2

/** Llama-3.2-1B-Instruct-Q4_K_M: 16 layers, 8 KV heads, head_dim 64. */
const SMALL: TalosModelShape = {
    weightBytes: 770 * MIB,
    layers: 16,
    kvHeads: 8,
    headDim: 64,
    trainedContext: 131072,
    kvBytesPerElement: 2,
}

/** A 7B-shaped model: 32 layers, 8 KV heads, head_dim 128. */
const SEVEN_B: TalosModelShape = {
    weightBytes: 4.1 * GIB,
    layers: 32,
    kvHeads: 8,
    headDim: 128,
    trainedContext: 32768,
    kvBytesPerElement: 2,
}

/** A mid-range 2026 phone: 8 GB fitted, about 6 GB usable. */
const MIDRANGE: TalosDeviceCapacity = {
    totalRamBytes: 8 * GIB,
    availableRamBytes: 6 * GIB,
    lowMemoryThresholdBytes: 512 * MIB,
    freeStorageBytes: 20 * GIB,
    memoryBandwidthBytesPerSecond: 40 * GIB,
    thermal: 'none',
    abiSupported: true,
}

const fit = (
    model: Partial<TalosModelShape> = {},
    device: Partial<TalosDeviceCapacity> = {},
    context = 8192,
) => talosModelFit({
    model: { ...SMALL, ...model },
    device: { ...MIDRANGE, ...device },
    context,
    fileBytes: (model.weightBytes ?? SMALL.weightBytes) + 8 * MIB,
})

describe('the one capacity verdict used by every list', () => {
    const measured = {
        availableRamBytes: 6 * GIB,
        lowMemoryThresholdBytes: 512 * MIB,
        freeStorageBytes: 20 * GIB,
    }

    it('does not turn an unmeasured disk into a positive answer', () => {
        const verdict = talosEstimatedCapacity({
            fileBytes: 2 * GIB,
            workingBytes: 3 * GIB,
            device: { ...measured, freeStorageBytes: null },
        })

        expect(verdict).toMatchObject({
            state: 'unknown',
            reason: 'storage-measurement',
        })
    })

    it('names storage first when the file cannot land, even if RAM is also short', () => {
        const freeStorageBytes = 5.5 * GIB
        const verdict = talosEstimatedCapacity({
            fileBytes: 5 * GIB,
            workingBytes: 20 * GIB,
            device: { ...measured, freeStorageBytes },
        })

        expect(verdict).toEqual({
            state: 'storage-blocked',
            limit: 'storage',
            needsBytes: 5 * GIB + TALOS_STORAGE_RESERVE_BYTES,
            availableBytes: freeStorageBytes,
            missingBytes: 512 * MIB,
        })
    })

    it('names memory only after storage has passed', () => {
        const verdict = talosEstimatedCapacity({
            fileBytes: 2 * GIB,
            workingBytes: 6 * GIB,
            device: measured,
        })

        expect(verdict).toEqual({
            state: 'memory-blocked',
            limit: 'memory',
            needsBytes: 6 * GIB,
            availableBytes: 5.5 * GIB,
            missingBytes: 512 * MIB,
        })
    })

    it('keeps tight and fits as distinct known states', () => {
        expect(talosEstimatedCapacity({
            fileBytes: GIB,
            workingBytes: 5.25 * GIB,
            device: measured,
        })).toEqual({
            state: 'tight',
            limit: 'memory',
            needsBytes: 5.25 * GIB,
            availableBytes: 5.5 * GIB,
            missingBytes: 0,
        })

        expect(talosEstimatedCapacity({
            fileBytes: GIB,
            workingBytes: 4 * GIB,
            device: measured,
        })).toEqual({
            state: 'fits',
            limit: 'memory',
            needsBytes: 4 * GIB,
            availableBytes: 5.5 * GIB,
            missingBytes: 0,
        })
    })

    it('does not invent a verdict when model size or memory is unavailable', () => {
        expect(talosEstimatedCapacity({
            fileBytes: null,
            workingBytes: null,
            device: measured,
        })).toMatchObject({ state: 'unknown', reason: 'model-size' })

        expect(talosEstimatedCapacity({
            fileBytes: GIB,
            workingBytes: 2 * GIB,
            device: null,
        })).toMatchObject({ state: 'unknown', reason: 'memory-measurement' })
    })
})

describe('the KV cache, which is where the surprises live', () => {
    /**
     * Per LAYER, not a fraction of the model — the reason a 7B at long context
     * can need more cache than weights, which is the single fact that makes
     * "it is a 4 GB file so I need 4 GB" wrong.
     */
    it('is layers × kv heads × head dim × 2 × bytes per element × tokens', () => {
        // 32 × 8 × 128 × 2 (K and V) × 2 bytes × 8192 tokens
        expect(talosKvCacheBytes(SEVEN_B, 8192)).toBe(32 * 8 * 128 * 2 * 2 * 8192)
    })

    it('grows linearly with the context, so doubling the context doubles it', () => {
        expect(talosKvCacheBytes(SEVEN_B, 16384)).toBe(2 * talosKvCacheBytes(SEVEN_B, 8192))
    })

    /** Quantised KV is the first lever before refusing a model outright. */
    it('halves when the cache is kept at 8 bits instead of 16', () => {
        const half = talosKvCacheBytes({ ...SEVEN_B, kvBytesPerElement: 1 }, 8192)

        expect(half).toBe(talosKvCacheBytes(SEVEN_B, 8192) / 2)
    })
})

describe('a small model on an ordinary phone', () => {
    it('is comfortable, and says so with its arithmetic', () => {
        const verdict = fit()

        expect(verdict.band).toBe('comfortable')
        expect(verdict.deficitBytes).toBe(0)
        expect(verdict.kvCacheBytes).toBeGreaterThan(0)
        expect(verdict.residentBytes).toBeGreaterThan(SMALL.weightBytes)
    })

    it('predicts a speed rather than leaving the reader to guess', () => {
        expect(fit().tokensPerSecond).toBeGreaterThan(0)
    })

    /** No bandwidth figure for this chip is a fact, not a reason to invent one. */
    it('admits it cannot predict a speed when the chip is unknown', () => {
        expect(fit({}, { memoryBandwidthBytesPerSecond: null }).tokensPerSecond).toBeNull()
    })
})

describe('the refusals, each with the one reason that caused it', () => {
    it('refuses when the file will not fit on disk, counting the reserve', () => {
        const verdict = fit({}, { freeStorageBytes: 900 * MIB })

        expect(verdict.band).toBe('wont-run')
        expect(verdict.reason).toBe('storage')
    })

    it('refuses a build this phone cannot execute', () => {
        expect(fit({}, { abiSupported: false }).reason).toBe('unsupported')
    })

    /**
     * The cache alone can exceed a safe share of RAM long before the weights
     * do — and then the model is out of reach at THAT context, not at all.
     */
    it('refuses when the cache alone takes too much of the phone', () => {
        const verdict = fit(SEVEN_B, {}, 131072)

        expect(verdict.band).toBe('wont-run')
        expect(verdict.reason).toBe('context')
    })

    it('refuses when nothing is left to hold the weights', () => {
        const verdict = fit(SEVEN_B, { availableRamBytes: 1.2 * GIB })

        expect(verdict.band).toBe('wont-run')
        expect(['memory', 'context']).toContain(verdict.reason)
    })
})

describe('the counter-offer, which is the point of the whole calculation', () => {
    /**
     * A rejection that ends the conversation is a worse product than one that
     * says "not at 128k — but 8k fits". The context is the free variable, so
     * the maximum is computed even when the verdict is no.
     */
    it('says which context WOULD fit, even while refusing', () => {
        const verdict = fit(SEVEN_B, {}, 131072)

        expect(verdict.band).toBe('wont-run')
        expect(verdict.maxContext).toBeGreaterThan(0)
        expect(verdict.maxContext).toBeLessThan(131072)
    })

    it('never offers more context than the model was trained for', () => {
        expect(talosMaxContextFor(SMALL, MIDRANGE)).toBeLessThanOrEqual(SMALL.trainedContext)
    })

    it('offers a context that then actually passes', () => {
        const offered = talosMaxContextFor(SEVEN_B, MIDRANGE)

        expect(fit(SEVEN_B, {}, offered).band).not.toBe('wont-run')
    })
})

describe('when it runs but badly, the reason is named', () => {
    /**
     * A model too big to hold resident is re-read from flash every token. It
     * "works" — at a speed that makes it useless — and the honest thing is to
     * say which of the three costs dominates rather than showing a number.
     */
    it('blames storage paging when the weights do not stay resident', () => {
        const verdict = fit(SEVEN_B, { availableRamBytes: 3.2 * GIB }, 2048)

        expect(verdict.band).toBe('will-crawl')
        expect(verdict.reason).toBe('storage-paging')
        expect(verdict.deficitBytes).toBeGreaterThan(0)
    })

    it('blames bandwidth when the phone simply reads memory slowly', () => {
        const verdict = fit(SEVEN_B, { memoryBandwidthBytesPerSecond: 3 * GIB }, 2048)

        expect(verdict.band).toBe('will-crawl')
        expect(verdict.reason).toBe('bandwidth')
    })
})

describe('the phone as it is right now, not as a spec sheet', () => {
    /** A hot phone is slower, and a verdict that ignores that is a lie. */
    it('derates the prediction when the phone is already hot', () => {
        const cool = fit(SEVEN_B, {}, 2048).tokensPerSecond!
        const hot = fit(SEVEN_B, { thermal: 'severe' }, 2048).tokensPerSecond!

        expect(hot).toBeLessThan(cool)
    })

    it('will not call anything comfortable while the phone is hot', () => {
        expect(fit({}, { thermal: 'severe' }).band).not.toBe('comfortable')
    })

    /**
     * The device already told us once. Predicting the same crash again with a
     * cheerful verdict is the one thing this calculation must never do.
     */
    it('demotes a model this phone has already killed for memory', () => {
        const before = fit().band
        const after = fit({}, { previouslyKilledForMemory: true }).band

        expect(before).toBe('comfortable')
        expect(after).toBe('tight')
    })
})

/**
 * The counter-offer has to be an offer the app can honour.
 *
 * `talosMaxContextFor` budgeted against a share of TOTAL RAM minus two
 * overheads and nothing else — not the model's own weights, not the memory
 * actually available, not the threshold Android kills below, not the safety
 * margin. So on a phone refused for `memory` it named a context that
 * `talosModelFit` then refused all over again: "at 8192 it fits", tap it, and
 * it does not fit. An offer the app cannot honour is worse than no offer.
 *
 * Found by an adversarial review, 2026-08-01.
 */
describe('the counter-offer, which must survive being taken', () => {
    it('names a context the fit calculation then accepts', () => {
        // A phone whose weights fit but whose long-context cache does not,
        // which is the entire situation a counter-offer exists for.
        const refused = fit(SEVEN_B, {}, 32768)
        expect(refused.band).toBe('wont-run')

        const offered = refused.maxContext
        expect(offered).toBeGreaterThan(0)

        // THE assertion: take the offer, and it is honoured.
        expect(fit(SEVEN_B, {}, offered).band).not.toBe('wont-run')
    })

    /**
     * And when there is genuinely no context that works, it says zero rather
     * than naming one that cannot.
     */
    it('offers nothing on a phone that cannot hold the weights at all', () => {
        const tiny: Partial<TalosDeviceCapacity> = {
            totalRamBytes: 3 * GIB,
            availableRamBytes: 1 * GIB,
            lowMemoryThresholdBytes: 256 * MIB,
        }

        expect(talosMaxContextFor(SEVEN_B, { ...MIDRANGE, ...tiny })).toBe(0)
    })

    /** It never offers more than the model was trained for. */
    it('never exceeds the trained context', () => {
        expect(talosMaxContextFor(SEVEN_B, MIDRANGE))
            .toBeLessThanOrEqual(SEVEN_B.trainedContext)
    })
})

/**
 * The KV cache override — Model Lab, Blocco 1.
 *
 * The header's own `kvBytesPerElement` stays the default: `'auto'` (or
 * omitting the field) must be a complete no-op, byte for byte, against every
 * existing test above. Forcing a type only changes what the SAME arithmetic
 * is fed, never a second code path with its own rules.
 */
describe('kvCacheTypeOverride — forcing a KV type instead of trusting the header', () => {
    it('omitted or "auto" changes nothing at all', () => {
        const baseline = fit()
        const omitted = talosModelFit({
            model: SMALL, device: MIDRANGE, context: 8192, fileBytes: SMALL.weightBytes + 8 * MIB,
        })
        const explicit = talosModelFit({
            model: SMALL, device: MIDRANGE, context: 8192, fileBytes: SMALL.weightBytes + 8 * MIB,
            kvCacheTypeOverride: 'auto',
        })
        expect(omitted).toEqual(baseline)
        expect(explicit).toEqual(baseline)
    })

    it('forcing q8_0 on a header that said f16 halves the KV cache, not the weights', () => {
        const header = fit(undefined, undefined, 32768) // SMALL declares kvBytesPerElement: 2 (f16)
        const forced = talosModelFit({
            model: SMALL, device: MIDRANGE, context: 32768, fileBytes: SMALL.weightBytes + 8 * MIB,
            kvCacheTypeOverride: 'q8_0',
        })
        expect(forced.kvCacheBytes).toBeLessThan(header.kvCacheBytes)
        expect(forced.kvCacheBytes).toBeCloseTo(header.kvCacheBytes * (34 / 32) / 2, 0)
    })

    /** The AL-CONTRARIO case: forcing f16 when the header already said f16 is a true no-op. */
    it('forcing f16 on a header that already said f16 changes nothing', () => {
        const header = fit()
        const forced = talosModelFit({
            model: SMALL, device: MIDRANGE, context: 8192, fileBytes: SMALL.weightBytes + 8 * MIB,
            kvCacheTypeOverride: 'f16',
        })
        expect(forced).toEqual(header)
    })

    /**
     * The counter-offer must respect the override too — not just the verdict.
     * `talosMaxContextFor` reads `model.kvBytesPerElement` on its own; a fix
     * that only patched `talosKvCacheBytes` would leave this one lying.
     */
    it('a lighter forced cache also raises the counter-offer context, not only the verdict', () => {
        const heavy = talosMaxContextFor(SEVEN_B, MIDRANGE)
        const lightFit = talosModelFit({
            model: SEVEN_B, device: MIDRANGE, context: 8192, fileBytes: SEVEN_B.weightBytes + 8 * MIB,
            kvCacheTypeOverride: 'q8_0',
        })
        expect(lightFit.maxContext).toBeGreaterThan(heavy)
    })

    /** An unrecognised type (a stale persisted value) is never silent: it behaves as f16, provably. */
    it('an unrecognised override behaves exactly like f16, not like a crash or a silent zero', () => {
        const asF16 = talosModelFit({
            model: SMALL, device: MIDRANGE, context: 8192, fileBytes: SMALL.weightBytes + 8 * MIB,
            kvCacheTypeOverride: 'f16',
        })
        // A cast, not a literal the type union would accept: simulates a value
        // arriving from an untyped boundary (a persisted setting read back as a
        // plain string), the exact case the runtime fallback exists for —
        // TypeScript alone cannot stop a stale string valid in an older release.
        const corrupted = 'q4_0' as unknown as TalosKvCacheTypeOverride
        const unknown = talosModelFit({
            model: SMALL, device: MIDRANGE, context: 8192, fileBytes: SMALL.weightBytes + 8 * MIB,
            kvCacheTypeOverride: corrupted,
        })
        expect(unknown).toEqual(asF16)
    })
})
