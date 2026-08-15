/**
 * A publication date, written the way a person writes one.
 *
 * Three places printed the raw value the search engine handed back —
 * `2023-12-10T08:00:33+01:00` — the report page, the source page and the chat's
 * sources chip. That is the machine's own notation, and on the very surface
 * owner 2026-08-03 called «termini molto tecnici» it was the last thing that
 * belonged there.
 *
 * The time of day goes: no source is more trustworthy for having been published
 * at 08:00:33, and the seconds were never information.
 */

/** `2023-12-10`, with or without a time after it. Anything else is left alone. */
const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})/

export function talosPublishedOn(value: string, locale: string): string {
    const parts = CALENDAR_DAY.exec(value)
    if (!parts) return value

    const year = Number(parts[1])
    const month = Number(parts[2])
    const day = Number(parts[3])

    /**
     * Built from the STRING's own year-month-day rather than parsed as an
     * instant. `new Date('2023-12-10')` is UTC midnight, which in any timezone
     * behind UTC renders as the ninth — and an article published late on the
     * tenth in Rome was published on the tenth, whatever the reader's clock
     * says. The publisher's date is the fact; the reader's timezone is not.
     */
    const stamp = new Date(year, month - 1, day)

    // A rolled-over date is a wrong one: `2023-13-45` would silently become
    // February 2024 rather than being reported as the nonsense it is.
    if (stamp.getFullYear() !== year || stamp.getMonth() !== month - 1 || stamp.getDate() !== day) return value

    return new Intl.DateTimeFormat(locale === 'it' ? 'it-IT' : 'en-US', { dateStyle: 'long' }).format(stamp)
}
