import type { TalosModelFit, TalosModelBand, TalosModelFitReason } from '@/lib/models/fit'

/**
 * What the download centre says, decided apart from how it looks.
 *
 * Two reasons this is not inside the component. The verdicts are the product —
 * "runs comfortably", "does not fit in memory", "at 8k tokens it fits" — and a
 * sentence that is wrong is worse than a layout that is ugly, so they are
 * proved. And the same wording is what a chat tool will hand the model when
 * someone asks in words instead of tapping, which means it cannot live in a
 * template.
 */

/**
 * Keys, never sentences. The screen localises them, and returning English from
 * here would be a second, silent copy of the strings.
 */
const BANDS: Record<TalosModelBand, string> = {
    comfortable: 'localModels.bandComfortable',
    tight: 'localModels.bandTight',
    'will-crawl': 'localModels.bandCrawl',
    'wont-run': 'localModels.bandWontRun',
}

const REASONS: Record<TalosModelFitReason, string | null> = {
    // "It fits" needs no explanation; a sentence here would be noise.
    fits: null,
    storage: 'localModels.reasonStorage',
    unsupported: 'localModels.reasonUnsupported',
    context: 'localModels.reasonContext',
    memory: 'localModels.reasonMemory',
    'storage-paging': 'localModels.reasonPaging',
    bandwidth: 'localModels.reasonBandwidth',
    hot: 'localModels.reasonHot',
    'previously-killed': 'localModels.reasonKilled',
}

export interface TalosFitVerdict {
    bandKey: string
    reasonKey: string | null
    /** Rounded for reading: nobody needs three decimal places of tokens a second. */
    tokensPerSecond: number | null
    /**
     * The counter-offer, when there is one worth making.
     *
     * A refusal that ends the conversation is a worse product than one that
     * moves it: "not at 128k — at 8k it fits" is something a person can act on.
     * Only offered when it is genuinely smaller than what was asked for AND
     * large enough to be useful.
     */
    counterOfferContext: number | null
    tone: 'good' | 'warn' | 'bad'
}

/** Below this a context is not a counter-offer, it is a consolation prize. */
const USEFUL_CONTEXT = 1024

export function talosFitVerdict(fit: TalosModelFit, askedContext: number): TalosFitVerdict {
    const counterOffer = fit.band === 'wont-run'
        && fit.maxContext >= USEFUL_CONTEXT
        && fit.maxContext < askedContext
        ? fit.maxContext
        : null

    return {
        bandKey: BANDS[fit.band],
        reasonKey: REASONS[fit.reason],
        tokensPerSecond: fit.tokensPerSecond === null ? null : Math.round(fit.tokensPerSecond * 10) / 10,
        counterOfferContext: counterOffer,
        tone: fit.band === 'comfortable' ? 'good' : (fit.band === 'wont-run' ? 'bad' : 'warn'),
    }
}

/**
 * Sizes, in the units the reader thinks in.
 *
 * Binary units, because that is what both Android and the Hub report and a
 * "2.7 GB" file that Android calls 2.5 GB makes the app look wrong about the
 * one number the user can check.
 */
export function talosFormatBytes(bytes: number): string {
    if (bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`
    const units = ['KB', 'MB', 'GB', 'TB']
    let value = bytes / 1024
    let unit = 0
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024
        unit += 1
    }
    // One decimal below ten, none above: "9.4 GB" is informative, "947.3 MB" is
    // three digits of noise.
    return `${value < 10 ? Math.round(value * 10) / 10 : Math.round(value)} ${units[unit]}`
}

/**
 * What must be said before a download is offered.
 *
 * Warnings, not blocks. The only thing actually refused is a set the repository
 * is missing pieces of; everything else is the user's decision to make about
 * their own phone, which they can only make if they are told.
 */
export interface TalosSetWarnings {
    /** Cannot work at all: two of three shards is not a small model. */
    incomplete: { missing: number; total: number } | null
    /** No checksum published: the one download we cannot prove. */
    unverifiable: boolean
    /** Hugging Face's own verdict on the file. */
    flagged: string | null
}

export function talosSetWarnings(set: {
    incomplete: boolean
    expectedShards: number
    foundShards: number
    /** Readonly because the store hands out frozen state and this only reads. */
    sha256: readonly (string | null)[]
    security: string | null
}): TalosSetWarnings {
    return {
        incomplete: set.incomplete
            ? { missing: set.expectedShards - set.foundShards, total: set.expectedShards }
            : null,
        unverifiable: set.sha256.some((hash) => hash === null),
        // Anything that is not an explicit clean verdict is worth showing. The
        // Hub says "safe" when it has scanned and found nothing; silence means
        // it has not looked, which is not the same and is not a warning either.
        flagged: set.security !== null && set.security !== 'safe' ? set.security : null,
    }
}
