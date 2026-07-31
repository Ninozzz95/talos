import { parseTalosFileProvenance, type TalosFileOrigin } from '@/lib/files/provenance'
import type { TalosTranslate } from '@/i18n/contracts'

/**
 * What a file's origin card SAYS — decided here, rendered elsewhere.
 *
 * Owner decision P-07: «la scheda d'origine è una sezione sempre visibile nel
 * dettaglio del file». Always visible is the point: a card that appears only
 * when the news is good teaches people that its absence means nothing, and then
 * it means nothing when it is absent for a real reason.
 *
 * So there are three states and all three are stated out loud:
 *
 *   generated — a model made it, and which one
 *   uploaded  — the person brought it in themselves
 *   unknown   — the file predates the record, or came from a temporary chat
 *
 * The third is the one that matters most, and it is why this is a function and
 * not a template. "No record" must never render as an empty section that looks
 * like a bug, nor as a confident sentence that invents a history. It says it
 * does not know, which is true and useful.
 */
export interface TalosFileOriginCard {
    /** One line: who made it. */
    readonly title: string
    /** Facts under it, already ordered and already localised. Never empty. */
    readonly lines: readonly string[]
    /**
     * The chat it came from, ONLY while that chat still exists — the card
     * offers to open it, and an offer that cannot be honoured is worse than no
     * offer. Found by an adversarial review 2026-07-31: gated on the id alone,
     * the button outlived the chat, and tapping it closed the viewer, navigated
     * nowhere and flagged the whole chat store as persistence-failed.
     *
     * Resolved from the title, which is itself resolved from the live session
     * list: if we cannot name the chat, we cannot open it.
     */
    readonly originSessionId: string | null
    readonly kind: TalosFileOrigin | 'unknown'
}

/** A file's date, as a reader writes it rather than as a machine stores it. */
function readableDate(value: string, locale: string): string | null {
    const stamp = new Date(value)
    if (Number.isNaN(stamp.getTime())) return null
    try {
        return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(stamp)
    } catch {
        return stamp.toISOString().slice(0, 16).replace('T', ' ')
    }
}

export function talosFileOriginCard(input: {
    /** The raw `provenance` value out of the file's metadata bag. */
    provenance: unknown
    /** Title of the chat it came from, when that chat still exists. */
    originSessionTitle?: string | null
    translate: TalosTranslate
    locale: string
}): TalosFileOriginCard {
    const { translate: t, locale } = input
    const record = parseTalosFileProvenance(input.provenance)

    if (!record) {
        return {
            title: t('library.originUnknown'),
            // Two chats can produce this: an old file, or a temporary one. The
            // second is not a defect and the card refuses to imply it is.
            lines: [t('library.originUnknownWhy')],
            originSessionId: null,
            kind: 'unknown',
        }
    }

    /**
     * Values are composed AFTER translation, never interpolated into it.
     *
     * Found by an adversarial review 2026-07-31, and proven by running it: the
     * app sets vue-i18n's `escapeParameter`, so an interpolated value has its
     * `/` `'` `<` `>` `&` turned into HTML entities — and this card renders as
     * TEXT, so the entities are shown to the reader. Every OpenRouter model id
     * contains a slash (`anthropic/claude-sonnet-4.5`), and Italian chat titles
     * routinely contain an apostrophe, so the two lines a reader most wants
     * were the two that came out mangled.
     *
     * Escaping is right for a message that might be rendered as markup and
     * wrong for one that never is. Composing outside `t()` sidesteps the whole
     * question instead of turning the protection off globally.
     */
    const lines: string[] = []
    const made = readableDate(record.createdAt, locale)
    if (made) lines.push(`${t('library.originMadeOn')} ${made}`)
    if (record.modelVersion) lines.push(`${t('library.originVersion')} ${record.modelVersion}`)
    if (record.sourceUrl) lines.push(`${t('library.originSource')} ${record.sourceUrl}`)
    if (input.originSessionTitle) {
        lines.push(`${t('library.originFromChat')} “${input.originSessionTitle}”`)
    }
    // Never empty: a section with a heading and nothing under it reads as broken.
    if (lines.length === 0) lines.push(t('library.originNoDetail'))

    // Only a chat we could NAME is a chat we can open.
    const openableSessionId = input.originSessionTitle ? record.originSessionId : null

    if (record.origin !== 'generated') {
        return {
            title: record.origin === 'downloaded'
                ? t('library.originDownloaded')
                : t('library.originUploaded'),
            lines,
            originSessionId: openableSessionId,
            kind: record.origin,
        }
    }

    /**
     * «Made by TALOS» is not an answer to «made by what?». The model is the
     * fact a reader actually wants, and the provider is what makes it
     * checkable — two providers serve models with the same name.
     */
    const title = record.model
        ? `${t('library.originMadeBy')} ${record.model} · ${record.provider ?? t('library.originProviderUnknown')}`
        : t('library.originMadeByUnknownModel')

    return { title, lines, originSessionId: openableSessionId, kind: 'generated' }
}
