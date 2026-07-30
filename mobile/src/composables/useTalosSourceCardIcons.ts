import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import type { TalosSavedLinkRow } from '@/lib/vaultLibrary'

/**
 * The favicons of the links currently on screen, read from disk.
 *
 * Captured once when the link was saved, so showing a real site mark here costs
 * no network request at all — which is the whole reason the sources chip was
 * limited to letters before: fetching a favicon at display time is a request to
 * every site every time the surface is opened.
 *
 * A link with no stored card simply has no entry, and the component falls back
 * to the Globe. Absence is the normal case for anything saved before capture
 * existed, and it must look deliberate rather than broken.
 */
export function useTalosSourceCardIcons(rows: Ref<readonly TalosSavedLinkRow[]>) {
    const icons = ref<Record<string, string>>({})
    // Object URLs are revoked on the way out: a Library scrolled for a while
    // would otherwise hold every icon it ever showed.
    const created = new Set<string>()

    function release(): void {
        for (const url of created) URL.revokeObjectURL(url)
        created.clear()
    }

    watch(rows, async (current) => {
        const missing = current.filter((row) => !icons.value[row.url])
        if (missing.length === 0) return
        const { readTalosSourceCardImages } = await import('@/services/sourceCardService')
        for (const row of missing) {
            try {
                const { icon } = await readTalosSourceCardImages(row.url)
                if (!icon) continue
                created.add(icon)
                icons.value = { ...icons.value, [row.url]: icon }
            } catch {
                // No card, no icon, no problem: the Globe is the honest mark.
            }
        }
    }, { immediate: true, deep: false })

    onBeforeUnmount(release)

    return { icons }
}
