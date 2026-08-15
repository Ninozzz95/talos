/**
 * "Will this model actually run on THIS phone?" — as arithmetic.
 *
 * Every app in this category shows a list of file names — `…Q4_K_M.gguf`,
 * `…Q5_K_M.gguf` — and lets the reader guess. The best of them answers with a
 * rule of thumb against a table of RAM. TALOS already measures the device, so
 * the guess is computable.
 *
 * The interesting half is not the yes. It is the NO that arrives with the one
 * reason that caused it and a counter-offer: not "this model does not fit", but
 * "not at 128k — at 8k it fits, with 1.1 GB to spare". A rejection that ends
 * the conversation is a worse product than one that moves it.
 *
 * Pure on purpose: no I/O, no platform calls. The measurements arrive as
 * numbers and the whole verdict is testable without a device.
 */

const MIB = 1024 ** 2

/** What the GGUF header says. Read from the first ~1 KiB over a Range request. */
export interface TalosModelShape {
    /**
     * The sum of the tensor index — NEVER the file size, which includes
     * metadata and, for a split model, means nothing at all.
     */
    weightBytes: number
    layers: number
    /** Grouped-query attention: the KV heads, which are fewer than the heads. */
    kvHeads: number
    headDim: number
    trainedContext: number
    /** 2 for f16, 1 for q8_0 — quantised KV is the first lever before refusing. */
    kvBytesPerElement: number
}

export type TalosThermalState = 'none' | 'light' | 'moderate' | 'severe' | 'critical'

/** What the device says about itself, right now — not what the spec sheet says. */
export interface TalosDeviceCapacity {
    totalRamBytes: number
    availableRamBytes: number
    /** Below this Android starts killing; it is not free memory. */
    lowMemoryThresholdBytes: number
    /**
     * What the platform would free up for us — larger than free space, because
     * it counts caches it would drop.
     *
     * `null` means the question could not be ASKED, which is not the same as an
     * answer of zero and must never be read as one. A device whose
     * `StorageManager` refuses would otherwise have every model on the Hub
     * refused for lack of space, on a measurement nobody took.
     */
    freeStorageBytes: number | null
    /** Null when this chip is not in the table: then no speed is predicted. */
    memoryBandwidthBytesPerSecond: number | null
    thermal: TalosThermalState | null
    abiSupported: boolean
    /** This phone has already killed this model once. It gets one band less. */
    previouslyKilledForMemory?: boolean
}

export type TalosModelBand = 'comfortable' | 'tight' | 'will-crawl' | 'wont-run'

/**
 * Machine-readable, never a sentence: the card localises it, and the same code
 * is what a chat tool returns so the model can explain the refusal in words.
 */
export type TalosModelFitReason =
    | 'fits'
    | 'storage'
    | 'unsupported'
    | 'context'
    | 'memory'
    | 'storage-paging'
    | 'bandwidth'
    | 'hot'
    | 'previously-killed'

export interface TalosModelFit {
    band: TalosModelBand
    reason: TalosModelFitReason
    kvCacheBytes: number
    /** The incompressible ask: cache + compute + overhead + runtime. */
    requiredBytes: number
    /** What is left to hold the weights in memory. */
    residentBytes: number
    /** Weight bytes that will be re-read from flash every token. */
    deficitBytes: number
    tokensPerSecond: number | null
    /** The counter-offer: the largest context that would pass here. */
    maxContext: number
}

/**
 * Storage kept free so the encrypted database and its journal have room — and
 * so the phone can still take a photo after a four-gigabyte download.
 *
 * Exported because the native transfer plan reserves the SAME number, and very
 * nearly did not: it kept 256 MiB while this kept 1 GiB, so a user with 700 MiB
 * of slack would have been told the model does not fit by this gate and had it
 * downloaded anyway by the job. `downloadPolicy.cases.json` holds the number and
 * both suites assert it.
 */
export const TALOS_STORAGE_RESERVE_BYTES = 1024 * MIB
const STORAGE_RESERVE = TALOS_STORAGE_RESERVE_BYTES

/**
 * Below this much left over, "it runs" becomes "only just".
 *
 * 512 MiB: under it Android starts closing background processes under load, and
 * TALOS holding an open model is the first candidate. Telling someone it fits
 * when they are about to lose the app mid-generation is a half-truth.
 *
 * Exported because the browse list, the variant list and the catalogue all draw
 * the same amber, and three copies of one number are three numbers waiting to
 * disagree — which is precisely how the storage gate came to exist in one place
 * and be missing from four others.
 */
export const TALOS_TIGHT_HEADROOM_BYTES = 512 * MIB

/**
 * How many bytes short of landing this file is — the DISK question, which is
 * never the memory one.
 *
 * Zero means it lands: either there is room, or there is no measurement and we
 * decline to invent one. Positive is the number a person can act on, because
 * unlike memory, storage is something they can go and free.
 *
 * Every caller goes through here so the reserve is applied once. It very nearly
 * was not: the catalogue compared the bare file size against free space while
 * this file demanded a gigabyte on top, so a phone with 700 MiB of slack was
 * offered a model that the download policy then refused.
 */
export function talosStorageShortfall(
    fileBytes: number,
    freeStorageBytes: number | null,
): number {
    if (freeStorageBytes === null) return 0
    return Math.max(0, fileBytes + STORAGE_RESERVE - freeStorageBytes)
}
/** llama.cpp's own scratch, plus what the app costs while it runs. */
const COMPUTE_OVERHEAD = 320 * MIB
const RUNTIME_OVERHEAD = 64 * MIB
/** Headroom above Android's low-memory threshold, so we are not the last straw. */
const SAFETY_MARGIN = 256 * MIB
/** Above this share of total RAM the phone starts evicting everything else. */
const SAFE_SHARE = 0.45
const COMFORTABLE_SHARE = 0.30
/** Memory reads never reach the theoretical figure. */
const BANDWIDTH_EFFICIENCY = 0.7
/** Flash is roughly an order of magnitude slower than RAM for this pattern. */
const FLASH_BYTES_PER_SECOND = 1.5 * 1024 * MIB

const THERMAL_DERATING: Record<TalosThermalState, number> = {
    none: 1, light: 0.95, moderate: 0.75, severe: 0.5, critical: 0.25,
}

/**
 * Per LAYER, and both K and V.
 *
 * This is the fact that makes "it is a 4 GB file so I need 4 GB" wrong: at a
 * long context a 7B model's cache can exceed its own weights, so the same file
 * is comfortable at 4k and impossible at 128k.
 */
export function talosKvCacheBytes(model: TalosModelShape, context: number): number {
    return model.layers * model.kvHeads * model.headDim * 2 * model.kvBytesPerElement * context
}

function kvBytesPerToken(model: TalosModelShape): number {
    return model.layers * model.kvHeads * model.headDim * 2 * model.kvBytesPerElement
}

/**
 * The counter-offer, computed even when the answer is no.
 *
 * The context is the free variable in the whole calculation, so a model that
 * cannot run at the asked-for context can almost always run at some smaller
 * one — and saying which turns a dead end into a choice.
 */
export function talosMaxContextFor(
    model: TalosModelShape,
    device: TalosDeviceCapacity,
): number {
    /**
     * Budgeted against the memory a model would ACTUALLY have.
     *
     * This used to take a share of total RAM minus the two overheads, and
     * nothing else — it ignored the model's own weights, the memory currently
     * available, the threshold Android kills below, and the safety margin. So
     * on a phone refused for `memory` the counter-offer named a context that
     * `talosModelFit` then refused all over again: an offer the app could not
     * honour, which is worse than saying nothing. Found by an adversarial
     * review, 2026-08-01.
     *
     * Both ceilings apply. The RAM share is what the phone can spare at all;
     * the resident figure is what is left once this model's weights are in
     * memory, and the smaller of the two is the honest one.
     */
    const share = SAFE_SHARE * device.totalRamBytes - COMPUTE_OVERHEAD - RUNTIME_OVERHEAD
    const resident = device.availableRamBytes
        - device.lowMemoryThresholdBytes
        - SAFETY_MARGIN
        - COMPUTE_OVERHEAD
        - RUNTIME_OVERHEAD
        - model.weightBytes
    const budget = Math.min(share, resident)
    if (budget <= 0) return 0
    const raw = Math.floor(budget / kvBytesPerToken(model))
    /**
     * Arrotondato a un multiplo di 256, NON a una potenza di due.
     *
     * ## Quanto costava la vecchia regola
     *
     * MISURATO sul OnePlus Pad 3 il 2026-08-06, con Qwen3-1.7B-Q8_0 caricato:
     * il budget dava **15.379 token**, e la potenza di due li tagliava a
     * **8192**. Quarantasette per cento della memoria utilizzabile buttato via —
     * e su quel dispositivo, in quel momento, era esattamente la differenza fra
     * la conversazione dell'owner che passa e `PROVIDER_CHAT_FAILED`.
     *
     * Il commento che c'era diceva: «un contesto di 6143 è un numero che non ha
     * scelto nessuno, e ogni motore fa padding comunque». La prima metà è vera,
     * la seconda non giustifica il salto: llama.cpp non pretende potenze di due,
     * e il padding riguarda i batch, non `n_ctx`.
     *
     * 256 tiene la cifra tonda — 15.360 invece di 15.379 — e costa al massimo
     * 255 token invece di quasi la metà. La tidiness si paga con lo 0,2%, non
     * con il 47%.
     */
    const PASSO = 256
    const stepped = Math.floor(raw / PASSO) * PASSO
    return Math.max(0, Math.min(stepped, model.trainedContext))
}

function demote(band: TalosModelBand): TalosModelBand {
    if (band === 'comfortable') return 'tight'
    if (band === 'tight') return 'will-crawl'
    return band
}

/**
 * Which of the two walls this model hits, when the answer must be given from a
 * size alone.
 *
 * ## Why this exists beside `talosModelFit`
 *
 * `talosModelFit` is the full answer and needs a GGUF header — layers, KV
 * heads, head dimension — which costs a ranged read per model. A list of twenty
 * browsed rows cannot pay that, so it answers from the file size and says so.
 *
 * It lives HERE, next to the full calculation, because the thing that matters
 * about it is that the two agree: same reserve, same tight threshold, same gate
 * ORDER. When it lived in the module that guesses sizes from names, it quietly
 * grew a different answer — it judged memory only, so a phone with no room left
 * was told a model "runs well" right up until the download refused it.
 *
 * ## Storage first, and it is a different question
 *
 * Disk and memory fail differently and are repaired differently: space can be
 * freed, memory cannot. A phone that is nearly full is the ordinary case where
 * disk decides — and answering "won't run here" there sends someone to look for
 * a smaller model when what they needed was to delete some videos.
 *
 * Disk is binary on purpose: there is no "tight" for storage, because the
 * reserve IS the margin. Memory has bands because a model can run and still be
 * a bad idea; a file either lands or it does not.
 */
export type TalosCapacityState =
    | 'unknown'
    | 'fits'
    | 'tight'
    | 'memory-blocked'
    | 'storage-blocked'

export type TalosCapacityUnknownReason =
    | 'model-size'
    | 'memory-measurement'
    | 'storage-measurement'

interface TalosCapacityUnknownVerdict {
    state: 'unknown'
    reason: TalosCapacityUnknownReason
}

interface TalosCapacityKnownVerdict {
    state: Exclude<TalosCapacityState, 'unknown'>
    /** Which wall decided. The two are fixed by different actions. */
    limit: 'memory' | 'storage'
    /** What the DECIDING constraint asks for — so a bar draws the real ratio. */
    needsBytes: number
    /** What the deciding constraint has. Never mixed with the other one's. */
    availableBytes: number
    /** How much is missing, in the deciding constraint's units. Zero when it fits. */
    missingBytes: number
}

export type TalosCapacityVerdict =
    | TalosCapacityUnknownVerdict
    | TalosCapacityKnownVerdict

export function talosEstimatedCapacity(input: {
    /** Bytes on disk. */
    fileBytes: number | null
    /** Weights plus cache and buffers: what it costs to USE, not to keep. */
    workingBytes: number | null
    device: Pick<TalosDeviceCapacity,
        'availableRamBytes' | 'lowMemoryThresholdBytes' | 'freeStorageBytes'> | null
}): TalosCapacityVerdict {
    if (
        input.fileBytes === null
        || input.workingBytes === null
        || !Number.isFinite(input.fileBytes)
        || !Number.isFinite(input.workingBytes)
        || input.fileBytes <= 0
        || input.workingBytes <= 0
    ) {
        return { state: 'unknown', reason: 'model-size' }
    }

    const { device } = input
    if (device === null) return { state: 'unknown', reason: 'memory-measurement' }
    if (
        device.freeStorageBytes === null
        || !Number.isFinite(device.freeStorageBytes)
        || device.freeStorageBytes <= 0
    ) {
        return { state: 'unknown', reason: 'storage-measurement' }
    }

    const shortfall = talosStorageShortfall(input.fileBytes, device.freeStorageBytes)
    if (shortfall > 0) {
        return {
            state: 'storage-blocked',
            limit: 'storage',
            needsBytes: input.fileBytes + STORAGE_RESERVE,
            availableBytes: device.freeStorageBytes,
            missingBytes: shortfall,
        }
    }

    if (
        !Number.isFinite(device.availableRamBytes)
        || !Number.isFinite(device.lowMemoryThresholdBytes)
        || device.availableRamBytes <= 0
        || device.lowMemoryThresholdBytes < 0
    ) {
        return { state: 'unknown', reason: 'memory-measurement' }
    }

    /*
     * Minus the threshold Android kills below, which is the same subtraction
     * the full calculation makes. Raw available memory counts bytes the system
     * will take back the moment anything else needs them, and a verdict built
     * on those is optimistic exactly when the phone is busy — which is when
     * someone is most likely to be reading this list.
     */
    const usable = device.availableRamBytes - device.lowMemoryThresholdBytes
    const headroom = usable - input.workingBytes
    return {
        state: headroom < 0
            ? 'memory-blocked'
            : (headroom < TALOS_TIGHT_HEADROOM_BYTES ? 'tight' : 'fits'),
        limit: 'memory',
        needsBytes: input.workingBytes,
        availableBytes: Math.max(0, usable),
        missingBytes: Math.max(0, -headroom),
    }
}

export function talosModelFit(input: {
    model: TalosModelShape
    device: TalosDeviceCapacity
    context: number
    /** The size on disk, which is a storage question and never a memory one. */
    fileBytes: number
}): TalosModelFit {
    const { model, device, context } = input

    const kvCacheBytes = talosKvCacheBytes(model, context)
    const requiredBytes = kvCacheBytes + COMPUTE_OVERHEAD + RUNTIME_OVERHEAD
    const residentBytes = device.availableRamBytes
        - device.lowMemoryThresholdBytes
        - requiredBytes
        - SAFETY_MARGIN
    const deficitBytes = Math.max(0, model.weightBytes - residentBytes)
    const maxContext = talosMaxContextFor(model, device)

    const derating = THERMAL_DERATING[device.thermal ?? 'none']
    const bandwidth = device.memoryBandwidthBytesPerSecond
    const readSeconds = bandwidth === null ? null : (
        (model.weightBytes - deficitBytes) / (BANDWIDTH_EFFICIENCY * bandwidth)
        + deficitBytes / FLASH_BYTES_PER_SECOND
        + kvCacheBytes / (BANDWIDTH_EFFICIENCY * bandwidth)
    )
    const tokensPerSecond = readSeconds === null || readSeconds <= 0
        ? null
        : (1 / readSeconds) * derating

    const refuse = (reason: TalosModelFitReason): TalosModelFit => ({
        band: 'wont-run',
        reason,
        kvCacheBytes,
        requiredBytes,
        residentBytes,
        deficitBytes,
        tokensPerSecond,
        maxContext,
    })

    // The gates, in order: the first failure wins and names itself. Order
    // matters — telling someone their RAM is short when the file will not even
    // fit on disk sends them to fix the wrong thing.
    //
    // An unmeasured disk skips the gate rather than failing it: refusing on
    // evidence we do not have is the one answer that is wrong in both
    // directions, because it is unfixable by the person reading it.
    if (talosStorageShortfall(input.fileBytes, device.freeStorageBytes) > 0) return refuse('storage')
    if (!device.abiSupported) return refuse('unsupported')
    if (requiredBytes > SAFE_SHARE * device.totalRamBytes) return refuse('context')
    if (residentBytes <= 0) return refuse('memory')

    /**
     * The dominant term names the cause, mechanically. Showing a number without
     * a cause leaves the reader with nothing to act on; "your phone reads
     * memory slowly" and "this model does not fit in memory and is being read
     * from storage every token" lead to different, correct decisions.
     */
    const slow = tokensPerSecond !== null && tokensPerSecond < 4
    if (deficitBytes > 0) {
        return {
            band: 'will-crawl',
            reason: 'storage-paging',
            kvCacheBytes,
            requiredBytes,
            residentBytes,
            deficitBytes,
            tokensPerSecond,
            maxContext,
        }
    }
    if (slow) {
        const cacheShare = bandwidth === null ? 0 : kvCacheBytes / (BANDWIDTH_EFFICIENCY * bandwidth)
        const weightShare = bandwidth === null ? 0 : model.weightBytes / (BANDWIDTH_EFFICIENCY * bandwidth)
        return {
            band: 'will-crawl',
            reason: cacheShare > weightShare ? 'context' : 'bandwidth',
            kvCacheBytes,
            requiredBytes,
            residentBytes,
            deficitBytes,
            tokensPerSecond,
            maxContext,
        }
    }

    const hot = (device.thermal ?? 'none') !== 'none' && (device.thermal ?? 'none') !== 'light'
    const roomy = residentBytes >= model.weightBytes + 512 * MIB
        && requiredBytes <= COMFORTABLE_SHARE * device.totalRamBytes
        && (tokensPerSecond === null || tokensPerSecond >= 8)
        && !hot

    const band = device.previouslyKilledForMemory
        ? demote(roomy ? 'comfortable' : 'tight')
        : (roomy ? 'comfortable' : 'tight')

    return {
        band,
        reason: device.previouslyKilledForMemory ? 'previously-killed' : (hot ? 'hot' : 'fits'),
        kvCacheBytes,
        requiredBytes,
        residentBytes,
        deficitBytes,
        tokensPerSecond,
        maxContext,
    }
}
