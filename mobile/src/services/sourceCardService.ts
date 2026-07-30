import { createTalosSourceCardCapture } from '@/lib/search/sourceCardCapture'
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
const MAX_CONCURRENT = 2

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
    write: (path, base64) => fileStore().writePrivateBytes(path, base64),
})

/**
 * Capture cards for URLs that were just saved.
 *
 * Fire-and-forget by contract: the caller has already stored the link and is
 * not waiting. Sequential in pairs rather than all at once — ten results would
 * otherwise mean twenty simultaneous requests from a phone, which is rude to
 * the sites and pointless for the user, who is reading the answer.
 */
export function captureTalosSourceCards(urls: readonly string[]): void {
    void (async () => {
        for (let index = 0; index < urls.length; index += MAX_CONCURRENT) {
            await Promise.all(
                urls.slice(index, index + MAX_CONCURRENT).map((url) => capture.capture(url)),
            )
        }
    })().catch((error) => {
        talosLogDeviceIssue('TALOS_SOURCE_CARD_BATCH', String(error).slice(0, 200))
    })
}

/** The stored card images for a URL, or nulls when it has none. */
export async function readTalosSourceCardImages(url: string): Promise<{
    icon: string | null
    preview: string | null
}> {
    const { talosSourceCardPath } = await import('@/lib/search/sourceCardStore')
    async function read(kind: 'icon' | 'preview'): Promise<string | null> {
        // The extension is part of the path, so each candidate type is a
        // separate file to look for. Icons are usually png or ico; a preview is
        // always the webp this module wrote.
        const types = kind === 'preview'
            ? ['image/webp']
            : ['image/png', 'image/x-icon', 'image/jpeg', 'image/webp', 'image/gif']
        for (const type of types) {
            try {
                const path = await talosSourceCardPath(url, kind, type)
                if (!await fileStore().existsPrivate(path)) continue
                const bytes = await fileStore().readPrivate(path)
                return URL.createObjectURL(new Blob([bytes as BlobPart], { type }))
            } catch {
                // Try the next candidate; a missing card is not an error.
            }
        }
        return null
    }
    return { icon: await read('icon'), preview: await read('preview') }
}
