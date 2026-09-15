import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'

/**
 * Object-URL thumbnails for a list of vault files.
 *
 * Lifted out of the Library screen when the per-chat gallery (owner,
 * 2026-07-26) needed the same tiles. It looks like three lines of glue and is
 * not: it carries a race guard for overlapping loads — typing in the search box
 * re-runs the watcher before the previous previews resolve — and it revokes
 * every URL it created, including the loser of a race. A second hand-rolled
 * copy of this in the gallery would leak blobs on a screen the user opens
 * repeatedly, which on a phone is the kind of bug that reads as "the app got
 * slow after a while".
 *
 * Images only, and only for files the vault reports as available: asking for a
 * preview of a failed upload spends a bridge round trip to be told no.
 */
export function useTalosVaultThumbnails(
    files: Ref<readonly TalosLocalVaultFile[]>,
    previewUrl: (fileId: string) => Promise<string | null>,
) {
    const thumbs = ref<Record<string, string>>({})
    const loading = new Set<string>()
    /**
     * SF-MAJOR: the release below can only revoke URLs that already LANDED. A
     * preview resolving after the component is gone created a blob nobody would
     * ever free — and closing a gallery before its images finish is the normal
     * mobile gesture, so this stranded one blob per in-flight image, every time.
     * Exactly the failure this file claims to exist to prevent.
     */
    let disposed = false

    watch(files, async (current) => {
        if (disposed) return
        for (const file of current) {
            if (!file.media_type.startsWith('image/')) continue
            if (file.status !== 'available') continue
            if (thumbs.value[file.id] || loading.has(file.id)) continue
            loading.add(file.id)
            const url = await previewUrl(file.id).catch(() => null)
            loading.delete(file.id)
            if (!url) continue
            if (disposed) { URL.revokeObjectURL(url); return }
            if (thumbs.value[file.id]) {
                // Lost the race against another run — free the loser rather
                // than overwrite the reference and strand the blob.
                URL.revokeObjectURL(url)
                continue
            }
            thumbs.value = { ...thumbs.value, [file.id]: url }
        }
    }, { immediate: true })

    function releaseTalosThumbnails(): void {
        for (const url of Object.values(thumbs.value)) URL.revokeObjectURL(url)
        thumbs.value = {}
    }

    onBeforeUnmount(() => {
        disposed = true
        releaseTalosThumbnails()
    })

    return { thumbs, releaseTalosThumbnails }
}
