/**
 * The origin record of a Library file: where it came from, and what made it.
 *
 * Owner's request, family B: every file should carry its date, the model that
 * made it and enough detail that a model in ANOTHER chat can trace it back.
 *
 * The field names are not mine. IPTC Photo Metadata 2025.1 (November 2025)
 * added exactly the four properties this needs — AI System Used, AI System
 * Version Used, AI Prompt Information, AI Prompt Writer Name — beside
 * DigitalSourceType, whose value for machine-made images is
 * `trainedAlgorithmicMedia`. Mapping onto a standard that exists beats
 * inventing a private vocabulary nothing else can read: an image exported from
 * TALOS is legible to Chrome, to Google Search, and to whatever comes next.
 *
 * Typed rather than loose keys in the metadata bag (owner decision D-04). The
 * bag is untyped JSON and has already caused one defect where writing a field
 * erased its neighbours; a record with a shape cannot do that, and a corrupt
 * one is REFUSED rather than defaulted — a confident wrong history is worse
 * than no history.
 */
export type TalosFileOrigin = 'uploaded' | 'generated' | 'downloaded'

export interface TalosFileProvenance {
    schema: 1
    origin: TalosFileOrigin
    /** The device's clock when the file was stored. */
    createdAt: string
    /** The model that made it. Null for anything the user brought in. */
    model: string | null
    provider: string | null
    modelVersion: string | null
    /** The chat it came from, so the Library can group and a model can ask. */
    originSessionId: string | null
    /**
     * A REFERENCE to the message that carried the prompt, never a copy of it
     * (P-05). A copy would be a second body of personal text to encrypt twice,
     * delete twice and forget twice. A reference dies with the chat, which is
     * what a reader expects when they delete a conversation.
     */
    promptMessageId: string | null
    /** The tool that produced it, when a tool did. */
    toolName: string | null
    /** Where it was fetched from, for a downloaded page or image. */
    sourceUrl: string | null
    /** 64-bit perceptual fingerprint, for re-linking a re-encoded copy. */
    perceptualHash: string | null
    /** What a C2PA seal said, when the file carried one. Null means none. */
    seal: 'valid' | 'broken' | null
}

const ORIGINS: readonly string[] = ['uploaded', 'generated', 'downloaded']
const SEALS: readonly string[] = ['valid', 'broken']

/** IPTC's controlled value for something a trained model produced. */
const TRAINED_ALGORITHMIC_MEDIA =
    'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia'

function text(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value : null
}

/**
 * Read a record out of the metadata bag.
 *
 * Anything unrecognised is not a record. Inventing defaults for a corrupt one
 * would produce a history stated with confidence and wrong in detail, which is
 * the one outcome this feature must never produce.
 */
export function parseTalosFileProvenance(value: unknown): TalosFileProvenance | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    if (record.schema !== 1) return null
    if (typeof record.origin !== 'string' || !ORIGINS.includes(record.origin)) return null
    const createdAt = text(record.createdAt)
    if (!createdAt) return null
    const seal = typeof record.seal === 'string' && SEALS.includes(record.seal)
        ? record.seal as 'valid' | 'broken'
        : null
    return {
        schema: 1,
        origin: record.origin as TalosFileOrigin,
        createdAt,
        model: text(record.model),
        provider: text(record.provider),
        modelVersion: text(record.modelVersion),
        originSessionId: text(record.originSessionId),
        promptMessageId: text(record.promptMessageId),
        toolName: text(record.toolName),
        sourceUrl: text(record.sourceUrl),
        perceptualHash: text(record.perceptualHash),
        seal,
    }
}

/**
 * What travels INSIDE an exported file — and only that.
 *
 * Owner decision D-02: the model and the date, nothing else. The prompt is
 * often the most personal thing about a generated image, and a file is handed
 * to people; once it has left it cannot be recalled. The chat id goes nowhere
 * either — it would be a thread back to a conversation the recipient has no
 * business knowing exists.
 *
 * Null for anything the user brought in themselves. Stamping an uploaded photo
 * as machine-made would be a lie told by us, in their file, to whoever they
 * send it to.
 */
export function talosProvenanceForExport(
    record: TalosFileProvenance,
): Record<string, string> | null {
    if (record.origin !== 'generated') return null
    const fields: Record<string, string> = {
        'Iptc4xmpExt:DigitalSourceType': TRAINED_ALGORITHMIC_MEDIA,
        'xmp:CreateDate': record.createdAt,
    }
    if (record.model) fields['Iptc4xmpExt:AISystemUsed'] = record.model
    if (record.modelVersion) fields['Iptc4xmpExt:AISystemVersionUsed'] = record.modelVersion
    return fields
}
