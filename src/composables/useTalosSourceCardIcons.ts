import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

/**
 * The favicons of the sources currently on screen, read from disk.
 *
 * Captured once when the link was saved, so showing a real site mark costs no
 * network request at all. That is the whole reason the sources chip was limited
 * to letters before: fetching a favicon at display time is a request to every
 * site every time the surface is opened.
 *
 * Everything saved before capture existed has no card, which is what `backfill`
 * is for — and why it is a choice each caller makes rather than something this
 * does by default. The Library backfills: it is a screen about the links
 * themselves, opened deliberately. A chat does not: opening a conversation from
 * months ago must not reach out to every site it once cited, which is precisely
 * the beacon the letters existed to avoid. The two share one card store, so an
 * old chat's marks appear anyway, as the Library fills those cards in.
 *
 * A source with no card simply has no entry, and the component falls back to
 * its letter or its Globe. Absence is the normal case for a dead site or an
 * offline phone, and it must look deliberate rather than broken.
 */
export function useTalosSourceCardIcons(
    urls: Ref<readonly string[]>,
    options: { backfill?: boolean } = {},
) {
    const icons = ref<Record<string, string>>({})
    // Object URLs are revoked on the way out: a Library scrolled for a while
    // would otherwise hold every icon it ever showed.
    const created = new Set<string>()
    // Answered "no card" once. Without this, every recompute of the list —
    // every keystroke in the search box — re-probes the disk for every source
    // that has none, which is most of them on the first open.
    const absent = new Set<string>()
    const leaving = new AbortController()
    let sweeping = false

    /** Read the icons we have not answered for. Returns what is still missing. */
    async function hydrate(current: readonly string[]): Promise<string[]> {
        const missing = current.filter((url) => !icons.value[url] && !absent.has(url))
        if (missing.length > 0) {
            const { readTalosSourceCardImage } = await import('@/services/sourceCardService')
            for (const url of missing) {
                if (leaving.signal.aborted) break
                try {
                    const bytes = await readTalosSourceCardImage(url, 'icon')
                    if (!bytes) {
                        absent.add(url)
                        continue
                    }
                    // The service caches the bytes; the URL that points at them
                    // is made and revoked here, so a shared card never outlives
                    // the surface showing it.
                    const icon = URL.createObjectURL(bytes)
                    created.add(icon)
                    icons.value = { ...icons.value, [url]: icon }
                } catch {
                    // No card, no icon, no problem: the fallback is the honest mark.
                    absent.add(url)
                }
            }
        }
        return current.filter((url) => !icons.value[url])
    }

    // Nothing in here may reject: an unhandled rejection out of a watcher is a
    // console error on a surface whose entire contract is "best-effort".
    watch(urls, async (current) => {
        try {
            const missing = await hydrate(current)
            if (!options.backfill || missing.length === 0 || sweeping || leaving.signal.aborted) return

            sweeping = true
            try {
                const { backfillTalosSourceCards } = await import('@/services/sourceCardService')
                const report = await backfillTalosSourceCards(missing, leaving.signal)
                if (report.attempted.length === 0 || leaving.signal.aborted) return
                // Only what the pass touched. Re-reading the whole list here
                // would put back exactly the cost the budget exists to bound.
                for (const url of report.attempted) absent.delete(url)
                await hydrate(report.attempted)
            } finally {
                sweeping = false
            }
        } catch {
            // A backfill that cannot run leaves the fallback marks in place,
            // which is what they are there for.
        }
    }, { immediate: true, deep: false })

    onBeforeUnmount(() => {
        leaving.abort()
        for (const url of created) URL.revokeObjectURL(url)
        created.clear()
    })

    return { icons }
}
