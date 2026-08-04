import {
    talosEstimatedCapacity,
    type TalosCapacityVerdict,
    type TalosDeviceCapacity,
} from '@/lib/models/fit'

/**
 * The signed TALOS catalogue — M8.
 *
 * Three doors lead to a local model: this curated showcase, free search on
 * Hugging Face, and manual import. This is the first, and it exists for two
 * reasons that have nothing to do with taste.
 *
 * It answers "what should I run?" WITHOUT touching Hugging Face at all. Browsing
 * the Hub costs a request per screen against a limit that is per IP ADDRESS, and
 * a mobile carrier puts thousands of subscribers behind one — so a catalogue we
 * serve is what stops one user being throttled for traffic that was never
 * theirs. The Hub is then touched only to download, which is one file, rarely.
 *
 * And it carries `ram_working_bytes`, which is the number the fit calculation
 * actually needs and which otherwise costs a megabyte of header read per model.
 * A recommendation list can therefore be produced for a phone in milliseconds,
 * offline, from cache.
 *
 * IT IS UNTRUSTED UNTIL THE SIGNATURE VERIFIES. A downloaded list is network,
 * and the network does not get to decide what runs on somebody's phone.
 */

export interface TalosCatalogueEntry {
    id: string
    family: string
    displayName: string
    publisher: string
    license: string
    paramsB: number
    quantisation: string
    fileBytes: number
    sha256: string
    download: { kind: string; repo: string; file: string }
    // Readonly throughout: the store hands this out frozen and nothing here
    // mutates it, so the type says what is actually true rather than inviting
    // a caller to try.
    runtime: readonly string[]
    contextTokens: number
    /**
     * What generating actually costs, INCLUDING the KV cache at a typical
     * context — deliberately not the file size.
     *
     * Confusing the two is the mistake that makes someone download three
     * gigabytes for a model their phone cannot hold.
     */
    ramWorkingBytes: number
    /** Measurements taken on named hardware. Never a promise about this phone. */
    referenceSpeed: ReadonlyArray<{ soc: string; engine: string; tokensPerSecond: number }>
    tags: readonly string[]
    addedAt: string | null
    popularity: number
}

export interface TalosCatalogue {
    schemaVersion: number
    generatedAt: string
    entries: TalosCatalogueEntry[]
    /** Rows the document carried that could not be read. Reported, not hidden. */
    droppedEntries: number
}

export type TalosCatalogueRefusal =
    | 'unsigned'
    | 'unverified'
    | 'unsupported-schema'
    | 'malformed'

export type TalosCatalogueResult =
    | { ok: true; catalogue: TalosCatalogue }
    | { ok: false; reason: TalosCatalogueRefusal }

/** The only schema this build knows how to read. */
export const TALOS_CATALOGUE_SCHEMA = 1

/**
 * Verifies the document against a key this app already trusts.
 *
 * The signature is DETACHED, which departs deliberately from the sketch in the
 * spec: that drew it inside the document, and a document cannot sign itself
 * without a canonical form. You would have to agree, byte for byte and forever,
 * on key order and whitespace and number formatting — and any disagreement
 * reads as a forged catalogue rather than as a formatting difference. Serving
 * `catalogue.json.sig` beside `catalogue.json` signs exactly the bytes that
 * were fetched, and has nothing left to argue about.
 */
export type TalosCatalogueVerifier = (body: string, signature: string) => boolean

function text(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null
}

function positive(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function strings(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

/**
 * Read one row, or refuse it.
 *
 * Null for anything missing what a decision needs. A row with no
 * `ram_working_bytes` cannot be judged against a phone, and offering it anyway
 * would be offering a guess dressed as a catalogue entry.
 */
function entryOf(raw: Record<string, unknown>): TalosCatalogueEntry | null {
    const id = text(raw.id)
    const sha256 = text(raw.sha256)
    const fileBytes = positive(raw.file_bytes)
    const ramWorkingBytes = positive(raw.ram_working_bytes)
    const download = raw.download as Record<string, unknown> | undefined
    const repo = text(download?.repo)
    const file = text(download?.file)

    if (!id || !sha256 || !fileBytes || !ramWorkingBytes || !repo || !file) return null

    return {
        id,
        family: text(raw.family) ?? id,
        displayName: text(raw.display_name) ?? id,
        publisher: text(raw.publisher) ?? '',
        license: text(raw.license) ?? '',
        paramsB: typeof raw.params_b === 'number' ? raw.params_b : 0,
        quantisation: text(raw.quantization) ?? '',
        fileBytes,
        sha256,
        download: { kind: text(download?.kind) ?? 'huggingface', repo, file },
        runtime: strings(raw.runtime),
        contextTokens: positive(raw.context_tokens) ?? 0,
        ramWorkingBytes,
        referenceSpeed: Array.isArray(raw.reference_speed)
            ? (raw.reference_speed as Array<Record<string, unknown>>)
                .map((row) => ({
                    soc: text(row.soc) ?? '',
                    engine: text(row.engine) ?? '',
                    tokensPerSecond: typeof row.tokens_per_second === 'number' ? row.tokens_per_second : 0,
                }))
                .filter((row) => row.soc !== '' && row.tokensPerSecond > 0)
            : [],
        tags: strings(raw.tags),
        addedAt: text(raw.added_at),
        popularity: typeof raw.popularity === 'number' ? raw.popularity : 0,
    }
}

/**
 * Verify, then read. Never the other way round.
 *
 * @param verifier absent means nothing can be verified, which means the whole
 *     document is refused — fail CLOSED. An app that reads an unverifiable list
 *     "just this once" is an app with no signature requirement at all.
 */
export function talosReadCatalogue(
    raw: string,
    signature: string | null,
    verifier: TalosCatalogueVerifier | null,
): TalosCatalogueResult {
    let document: Record<string, unknown>
    try {
        document = JSON.parse(raw) as Record<string, unknown>
    } catch {
        return { ok: false, reason: 'malformed' }
    }
    if (!document || typeof document !== 'object' || Array.isArray(document)) {
        return { ok: false, reason: 'malformed' }
    }

    if (!text(signature)) return { ok: false, reason: 'unsigned' }
    if (!verifier || !verifier(raw, signature!)) return { ok: false, reason: 'unverified' }

    // Only after the signature. A version check on unverified bytes is a
    // decision taken on the network's say-so.
    if (document.schema_version !== TALOS_CATALOGUE_SCHEMA) {
        return { ok: false, reason: 'unsupported-schema' }
    }

    const rows = Array.isArray(document.models) ? document.models : null
    if (rows === null) return { ok: false, reason: 'malformed' }

    const entries: TalosCatalogueEntry[] = []
    let dropped = 0
    for (const row of rows) {
        const entry = row && typeof row === 'object' && !Array.isArray(row)
            ? entryOf(row as Record<string, unknown>)
            : null
        if (entry) entries.push(entry)
        // A malformed row inside a SIGNED document is a publishing mistake, not
        // an attack — the signature already vouched for the bytes. Dropping the
        // row keeps the rest usable; dropping the document would let one typo
        // take the catalogue off every phone at once.
        else dropped += 1
    }

    return {
        ok: true,
        catalogue: {
            schemaVersion: TALOS_CATALOGUE_SCHEMA,
            generatedAt: text(document.generated_at) ?? '',
            entries,
            droppedEntries: dropped,
        },
    }
}

/** A week. Past it the cache is still used and the screen says how old it is. */
export const TALOS_CATALOGUE_FRESH_MS = 7 * 24 * 60 * 60 * 1000

/**
 * How old the cached catalogue is, in whole days, or null if it cannot be told.
 *
 * The honest fallback the spec asks for: a stale catalogue is still a catalogue
 * — offline is the normal condition for this feature — but the screen has to be
 * able to say when it was last true rather than implying it is current.
 */
export function talosCatalogueAgeDays(generatedAt: string, now: Date): number | null {
    const generated = Date.parse(generatedAt)
    if (Number.isNaN(generated)) return null
    const age = now.getTime() - generated
    return age < 0 ? 0 : Math.floor(age / (24 * 60 * 60 * 1000))
}

export interface TalosCatalogueRecommendation {
    entry: TalosCatalogueEntry
    /** Whether this phone can hold it, judged from the catalogue's own figures. */
    fits: boolean
    /** How much memory would be left over, or how much is missing. */
    headroomBytes: number
    /**
     * Which wall, and by how much — memory or disk.
     *
     * This row used to compare the bare file size against free space while
     * `fit.ts` demanded a gigabyte of reserve on top, so a phone with 700 MiB of
     * slack was recommended a model the download policy then refused. One
     * function decides for both now.
     */
    capacity: TalosCapacityVerdict
}

/**
 * What to put in front of this phone, without asking Hugging Face anything.
 *
 * This is the whole point of carrying `ram_working_bytes`: the fit answer comes
 * from the catalogue, so a recommendation list is produced in milliseconds,
 * offline, from cache — where a Hub-only design would spend a megabyte of
 * header read per model to learn the same thing.
 *
 * Ordered: what fits, first, largest first — the biggest model a phone can
 * actually hold is the best one it can run, and burying it under three smaller
 * ones helps nobody. What does not fit follows, closest first, so the reader
 * can see how near they were.
 */
export function talosRecommendFromCatalogue(
    entries: readonly TalosCatalogueEntry[],
    device: TalosDeviceCapacity,
): TalosCatalogueRecommendation[] {
    const usable = device.availableRamBytes - device.lowMemoryThresholdBytes

    return entries
        .filter((entry) => device.abiSupported || entry.runtime.includes('webgpu'))
        .map((entry) => {
            const capacity = talosEstimatedCapacity({
                fileBytes: entry.fileBytes,
                workingBytes: entry.ramWorkingBytes,
                device,
            })
            return {
                entry,
                fits: capacity.state === 'fits' || capacity.state === 'tight',
                headroomBytes: usable - entry.ramWorkingBytes,
                capacity,
            }
        })
        .sort((left, right) => {
            if (left.fits !== right.fits) return left.fits ? -1 : 1
            return left.fits
                ? right.entry.ramWorkingBytes - left.entry.ramWorkingBytes
                : right.headroomBytes - left.headroomBytes
        })
}
