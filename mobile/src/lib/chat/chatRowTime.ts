/**
 * Extracted out of `ChatsScreen.vue` (28/8) so `HarnessScreen.vue` — the
 * same "grouped-by-date session row" grammar, now with real Codice
 * sessions instead of a hardcoded demo array — reuses the identical
 * formatting instead of a second hand-written copy that could drift.
 *
 * Kept pure (locale/labels passed in, no `useTalosI18n()` import) so both
 * screens can pass their OWN `t()`/`locale` without this module depending
 * on Vue at all.
 */

/**
 * ⛔⛔ SIDEBAR-PIATTA-01's fix, generalized: inside a bucket, RELATIVE time
 * ("8 h fa") stops distinguishing rows the moment two of them fall in
 * different buckets but the same relative distance — the bucket already
 * says the DAY, so the row says the TIME instead ("00:12" vs "23:47").
 * Older buckets (a month, "last 30 days") show the date instead of a time
 * that would repeat across dozens of rows.
 */
export function chatRowWhenInBucket(
    bucket: string,
    iso: string | null | undefined,
    locale: string,
    fallback: (iso: string) => string,
): string {
    if (!iso) return ''
    const data = new Date(iso)
    if (Number.isNaN(data.getTime())) return fallback(iso)
    const soloOra = bucket === 'today' || bucket === 'yesterday'
    return new Intl.DateTimeFormat(locale, soloOra
        ? { hour: '2-digit', minute: '2-digit' }
        : { day: 'numeric', month: 'short' }).format(data)
}

/** A bucket's own heading: "Today"/"Yesterday" verbatim, a written month otherwise. */
export function chatRowBucketTitle(
    gruppo: { bucket: string; monthKey: string | null },
    locale: string,
    bucketLabel: (bucket: string) => string,
): string {
    if (!gruppo.monthKey) return bucketLabel(gruppo.bucket)
    const [anno, mese] = gruppo.monthKey.split('-')
    const data = new Date(Number(anno), Number(mese) - 1, 1)
    const scritto = new Intl.DateTimeFormat(locale, {
        month: 'long',
        ...(data.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
    }).format(data)
    return scritto.charAt(0).toUpperCase() + scritto.slice(1)
}
