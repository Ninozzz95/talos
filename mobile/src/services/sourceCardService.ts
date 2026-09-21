import { createTalosSourceCardCapture } from '@/lib/search/sourceCardCapture'
import {
    createTalosSourceCardQueue,
    type TalosSourceCardQueueReport,
} from '@/lib/search/sourceCardQueue'
import { readTalosSafeWebImage, readTalosSafeWebPage } from '@/services/safeWebRead'
import { createAttachmentFileStore } from '@/services/attachmentFileStore'
import { talosLogDeviceIssue } from '@/lib/talosDeviceLog'

/**
 * The production wiring for Library source cards: the real network boundary,
 * the real store, and a real re-encode.
 *
 * Everything here is assembly. The decisions — what to parse, what to refuse,
 * what to do when a site is dead — live in `sourceCardCapture` and are tested
 * there against their failure cases; this module only supplies the ports.
 */

const MAX_PREVIEW_EDGE = 320

/**
 * How many links one backfill pass may fetch.
 *
 * A Library with three hundred saved links must not fetch three hundred pages
 * because someone opened a screen. The rest is not lost: the next open picks up
 * where this one stopped, and what a pass left behind is written to the device
 * log rather than silently dropped.
 */
const BACKFILL_BUDGET = 12

/**
 * Re-encode a preview small.
 *
 * This is also what strips whatever the original file was carrying: the image
 * is DRAWN onto a fresh canvas and read back, so nothing of the source bytes —
 * metadata, trailing data, anything a decoder might have honoured — survives
 * into the store.
 *
 * It throws rather than falling back to the original bytes when it cannot do
 * that. A preview stored exactly as received would break the one guarantee this
 * function exists to provide, and no preview is better than an unchecked one.
 */
async function shrinkImage(
    base64: string,
    contentType: string,
): Promise<{ base64: string; contentType: string }> {
    const response = await fetch(`data:${contentType};base64,${base64}`)
    const bitmap = await createImageBitmap(await response.blob())
    try {
        const scale = Math.min(1, MAX_PREVIEW_EDGE / Math.max(bitmap.width, bitmap.height))
        const width = Math.max(1, Math.round(bitmap.width * scale))
        const height = Math.max(1, Math.round(bitmap.height * scale))
        const canvas = new OffscreenCanvas(width, height)
        const context = canvas.getContext('2d')
        if (!context) throw new Error('TALOS_SOURCE_CARD_NO_CANVAS')
        context.drawImage(bitmap, 0, 0, width, height)
        const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.75 })
        const buffer = new Uint8Array(await blob.arrayBuffer())
        let binary = ''
        const chunk = 32_768
        for (let index = 0; index < buffer.length; index += chunk) {
            binary += String.fromCharCode(...buffer.subarray(index, index + chunk))
        }
        return { base64: btoa(binary), contentType: 'image/webp' }
    } finally {
        bitmap.close()
    }
}

let store: ReturnType<typeof createAttachmentFileStore> | null = null

function fileStore(): ReturnType<typeof createAttachmentFileStore> {
    return (store ??= createAttachmentFileStore())
}

const capture = createTalosSourceCardCapture({
    readPage: (url) => readTalosSafeWebPage(url),
    readImage: (url) => readTalosSafeWebImage(url),
    shrink: shrinkImage,
    exists: (path) => fileStore().existsPrivate(path),
    read: (path) => fileStore().readPrivate(path),
    write: (path, base64) => fileStore().writePrivateBytes(path, base64),
    now: () => Date.now(),
})

const queue = createTalosSourceCardQueue({
    settled: (url) => capture.settled(url),
    capture: (url) => capture.capture(url),
    log: talosLogDeviceIssue,
})

/**
 * Capture cards for URLs that were just saved.
 *
 * Fire-and-forget by contract: the caller has already stored the link and is
 * not waiting. No budget — these are the handful of results of one search, and
 * the user just asked for them.
 */
export function captureTalosSourceCards(urls: readonly string[]): void {
    void queue.run(urls).then(
        (report) => forget(report.attempted),
        (error) => talosLogDeviceIssue('TALOS_SOURCE_CARD_BATCH', String(error).slice(0, 200)),
    )
}

/**
 * Capture the cards of links saved before any of this existed.
 *
 * The same runner as the save path, with the two things the Library needs: a
 * budget, because it is handed every link the user ever saved, and a signal,
 * because leaving the screen must abandon the pass rather than finish it into
 * nowhere.
 */
export async function backfillTalosSourceCards(
    urls: readonly string[],
    signal?: AbortSignal,
): Promise<TalosSourceCardQueueReport> {
    const report = await queue.run(urls, { budget: BACKFILL_BUDGET, signal })
    forget(report.attempted)
    return report
}

/**
 * What the disk already answered.
 *
 * A sources chip is mounted per message, so one chat asks for the same site's
 * favicon once per message that cites it — and every miss costs a probe of each
 * candidate extension. The bytes are cached rather than an object URL so the
 * lifetime stays where it belongs: each component makes its own URL and revokes
 * it, which is what stops a long-lived Library from holding every icon it ever
 * showed. Bounded, because a card is bytes and this is a phone.
 */
const cards = new Map<string, Blob | null>()
const MAX_REMEMBERED_CARDS = 300

function remember(key: string, value: Blob | null): void {
    if (cards.size >= MAX_REMEMBERED_CARDS) {
        const oldest = cards.keys().next().value
        if (oldest !== undefined) cards.delete(oldest)
    }
    cards.set(key, value)
}

/**
 * Forget what a capture may have changed.
 *
 * The cache remembers absence, which is the whole point — but a pass that just
 * fetched a card would otherwise be invisible behind its own "no card" answer,
 * and the Library would show Globes for icons sitting on disk until the app was
 * restarted. Every path that writes cards ends here.
 */
function forget(urls: readonly string[]): void {
    for (const url of urls) {
        cards.delete(`icon:${url}`)
        cards.delete(`preview:${url}`)
    }
}

/**
 * The bytes of a stored card image, or null when there are none.
 *
 * One kind per call rather than both: every candidate type is a separate file
 * to look for, so asking for a preview nobody is about to show doubles the disk
 * probing of a Library that is only rendering favicons.
 */
export async function readTalosSourceCardImage(
    url: string,
    kind: 'icon' | 'preview',
): Promise<Blob | null> {
    const key = `${kind}:${url}`
    const remembered = cards.get(key)
    if (remembered !== undefined) return remembered

    const { talosSourceCardPath, talosSourceCardTypes } = await import('@/lib/search/sourceCardStore')
    // The extension is part of the path, so each candidate type is a separate
    // file to look for — the same set the settled check uses, from the same
    // place, so a card that counts as present is a card that can be read.
    for (const type of talosSourceCardTypes(kind)) {
        try {
            const path = await talosSourceCardPath(url, kind, type)
            if (!await fileStore().existsPrivate(path)) continue
            const bytes = await fileStore().readPrivate(path)
            const blob = new Blob([bytes as BlobPart], { type })
            remember(key, blob)
            return blob
        } catch {
            // Try the next candidate; a missing card is not an error.
        }
    }
    remember(key, null)
    return null
}
