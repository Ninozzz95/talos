import { describe, expect, it } from 'vitest'
import {
    talosFitVerdict,
    talosFormatBytes,
    talosModelInitials,
    talosSetWarnings,
} from '@/lib/models/presentation'
import type { TalosModelFit } from '@/lib/models/fit'
// Aliased so the Italian locale cannot shadow vitest's own `it`.
import { TALOS_EN_MESSAGES as english } from '@/i18n/locales/en'
import { TALOS_IT_MESSAGES as italian } from '@/i18n/locales/it'

/**
 * What the screen says.
 *
 * A sentence that is wrong is worse than a layout that is ugly: the verdicts
 * here are the product, and one of them is the difference between someone
 * spending four gigabytes of their data allowance well and spending it on a
 * model their phone cannot open.
 */
function fit(over: Partial<TalosModelFit> = {}): TalosModelFit {
    return {
        band: 'comfortable',
        reason: 'fits',
        kvCacheBytes: 500_000_000,
        requiredBytes: 900_000_000,
        residentBytes: 3_000_000_000,
        deficitBytes: 0,
        tokensPerSecond: 13.77,
        maxContext: 32_768,
        ...over,
    }
}

describe('the verdict', () => {
    it('names the band and says nothing more when it simply fits', () => {
        const verdict = talosFitVerdict(fit(), 4096)

        expect(verdict.bandKey).toBe('localModels.bandComfortable')
        expect(verdict.reasonKey).toBeNull()
        expect(verdict.tone).toBe('good')
    })

    it('names the one cause that produced a refusal', () => {
        const verdict = talosFitVerdict(fit({ band: 'wont-run', reason: 'memory' }), 4096)

        expect(verdict.bandKey).toBe('localModels.bandWontRun')
        expect(verdict.reasonKey).toBe('localModels.reasonMemory')
        expect(verdict.tone).toBe('bad')
    })

    /**
     * THE reason the fit calculation was written the way it was. A refusal that
     * ends the conversation is a worse product than one that moves it: "not at
     * 128k — at 8k it fits" is something a person can act on.
     */
    it('offers a smaller context when refusing, if one would work', () => {
        const verdict = talosFitVerdict(fit({ band: 'wont-run', reason: 'context', maxContext: 8192 }), 131_072)

        expect(verdict.counterOfferContext).toBe(8192)
    })

    it('makes no counter-offer that is not actually smaller', () => {
        const verdict = talosFitVerdict(fit({ band: 'wont-run', reason: 'memory', maxContext: 8192 }), 4096)

        expect(verdict.counterOfferContext).toBeNull()
    })

    /** A context of two hundred tokens is not an offer, it is a consolation prize. */
    it('makes no counter-offer too small to be worth taking', () => {
        const verdict = talosFitVerdict(fit({ band: 'wont-run', reason: 'memory', maxContext: 256 }), 4096)

        expect(verdict.counterOfferContext).toBeNull()
    })

    it('never counter-offers on a model that already runs', () => {
        expect(talosFitVerdict(fit({ band: 'tight', maxContext: 2048 }), 4096).counterOfferContext).toBeNull()
    })

    it('rounds the speed to something a person would read aloud', () => {
        expect(talosFitVerdict(fit({ tokensPerSecond: 13.7712 }), 4096).tokensPerSecond).toBe(13.8)
    })

    /** No bandwidth measurement means no speed claim — not a zero. */
    it('says nothing about speed when the phone could not be measured', () => {
        expect(talosFitVerdict(fit({ tokensPerSecond: null }), 4096).tokensPerSecond).toBeNull()
    })

    /**
     * Every band and every reason the calculation can produce has to have
     * something to say. A missing key renders as the key itself, in front of
     * the user, which is how a screen tells someone `localModels.reasonHot`.
     */
    it('has words for every verdict the calculation can reach', () => {
        const bands = ['comfortable', 'tight', 'will-crawl', 'wont-run'] as const
        const reasons = [
            'fits', 'storage', 'unsupported', 'context', 'memory',
            'storage-paging', 'bandwidth', 'hot', 'previously-killed',
        ] as const

        for (const band of bands) {
            for (const reason of reasons) {
                const verdict = talosFitVerdict(fit({ band, reason }), 4096)
                const keys = [verdict.bandKey, verdict.reasonKey].filter((key): key is string => key !== null)
                for (const key of keys) {
                    const leaf = key.split('.')[1]!
                    expect(english.localModels, `en is missing ${key}`).toHaveProperty(leaf)
                    expect(italian.localModels, `it is missing ${key}`).toHaveProperty(leaf)
                }
            }
        }
    })
})

/**
 * The app sets vue-i18n's `escapeParameter`, so an interpolated value has its
 * `/` and `'` replaced with entities. A repository id is `unsloth/Qwen3-4B-GGUF`
 * and an Android refusal is a free-form sentence — put either through a
 * placeholder and the user reads `unsloth&#47;Qwen3-4B-GGUF`.
 *
 * This has already happened once in this codebase. These keys are composed
 * outside `t()`, and this is what stops someone quietly adding the placeholder
 * back because it reads more naturally in the file.
 */
describe('the strings that must never interpolate', () => {
    const MUST_NOT_INTERPOLATE = [
        'open', 'downloading', 'unreadable', 'refused', 'flagged',
    ] as const

    it.each(MUST_NOT_INTERPOLATE)('%s carries no placeholder, in either language', (key) => {
        expect(english.localModels[key]).not.toMatch(/\{/)
        expect(italian.localModels[key]).not.toMatch(/\{/)
    })

    it('is the same set of keys in both languages', () => {
        expect(Object.keys(italian.localModels).sort()).toEqual(Object.keys(english.localModels).sort())
    })
})

/**
 * A tile of initials rather than a logo. The publishers are dozens and they
 * change, so any set of images shipped in the APK would be a set that ages —
 * the same reason there is no list of publishers anywhere in this app.
 */
describe('the mark that stands for a model', () => {
    it('reads a family name the way a person would abbreviate it', () => {
        expect(talosModelInitials('gemma-3n')).toBe('G3n')
        expect(talosModelInitials('qwen3')).toBe('Q3')
        expect(talosModelInitials('llama-3.2')).toBe('L32')
    })

    it('copes with a name that has no digits at all', () => {
        expect(talosModelInitials('mistral')).toBe('M')
    })

    /** Never empty, and never longer than the tile it has to sit in. */
    it('always produces something that fits', () => {
        expect(talosModelInitials('')).toBe('··')
        expect(talosModelInitials('---')).toBe('··')
        expect(talosModelInitials('some-extremely-long-family-name-2026').length)
            .toBeLessThanOrEqual(3)
    })
})

describe('sizes', () => {
    /**
     * Binary units, because Android and the Hub both use them. A "2.7 GB" file
     * that the phone's own storage screen calls 2.5 GB makes the app look wrong
     * about the one number the user can independently check.
     */
    it('agrees with what the phone will call the same file', () => {
        expect(talosFormatBytes(2.5 * 1024 ** 3)).toBe('2.5 GB')
        expect(talosFormatBytes(1024 ** 3)).toBe('1 GB')
        expect(talosFormatBytes(512 * 1024 ** 2)).toBe('512 MB')
    })

    it('drops the decimal once it stops carrying information', () => {
        expect(talosFormatBytes(9.44 * 1024 ** 3)).toBe('9.4 GB')
        expect(talosFormatBytes(14.44 * 1024 ** 3)).toBe('14 GB')
    })

    it('says something sane about nothing at all', () => {
        expect(talosFormatBytes(0)).toBe('0 B')
        expect(talosFormatBytes(-5)).toBe('0 B')
    })
})

describe('what has to be said before offering a download', () => {
    const clean = {
        incomplete: false,
        expectedShards: 1,
        foundShards: 1,
        sha256: ['a'.repeat(64)],
        security: 'safe',
    }

    it('has nothing to warn about a whole, hashed, scanned model', () => {
        expect(talosSetWarnings(clean)).toEqual({ incomplete: null, unverifiable: false, flagged: null })
    })

    it('says exactly how many pieces are missing', () => {
        const warnings = talosSetWarnings({
            ...clean, incomplete: true, expectedShards: 3, foundShards: 1,
        })

        expect(warnings.incomplete).toEqual({ missing: 2, total: 3 })
    })

    /** One unhashed piece makes the whole download unprovable. */
    it('warns when any piece publishes no checksum', () => {
        expect(talosSetWarnings({ ...clean, sha256: ['a'.repeat(64), null] }).unverifiable).toBe(true)
    })

    /**
     * The Hub says "safe" when it has scanned and found nothing. Silence means
     * it has not looked — which is not the same thing, and is not a warning
     * either, so it must not become one.
     */
    it('tells a clean verdict from no verdict at all', () => {
        expect(talosSetWarnings({ ...clean, security: 'safe' }).flagged).toBeNull()
        expect(talosSetWarnings({ ...clean, security: null }).flagged).toBeNull()
        expect(talosSetWarnings({ ...clean, security: 'unsafe' }).flagged).toBe('unsafe')
    })
})

/**
 * C45-RED-19P — nessuna velocità per un modello che non parte.
 *
 * Visto guardando una riga il 2026-08-06: «Memoria insufficiente · circa 13,8
 * token/secondo». I due pezzi si contraddicono, e insieme suggeriscono che il
 * modello quasi vada — mentre non parte affatto.
 *
 * Una stima di velocità è una previsione su un'esecuzione: se l'esecuzione non
 * può avvenire, la previsione non è imprecisa, è priva di oggetto.
 */
describe('C45-RED-19P la velocità non si promette a chi non parte', () => {
    const fit = (band: string) => ({
        band,
        reason: 'memory',
        tokensPerSecond: 13.84,
        maxContext: 4096,
    }) as never

    it('tace la velocità quando il modello non gira', () => {
        expect(talosFitVerdict(fit('wont-run'), 8192).tokensPerSecond).toBeNull()
    })

    it('la dice quando il modello gira davvero', () => {
        expect(talosFitVerdict(fit('comfortable'), 8192).tokensPerSecond).toBe(13.8)
        expect(talosFitVerdict(fit('will-crawl'), 8192).tokensPerSecond).toBe(13.8)
    })
})
