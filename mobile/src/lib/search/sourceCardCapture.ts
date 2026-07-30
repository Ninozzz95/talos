import { talosUnfurlPage } from '@/lib/search/unfurl'
import { talosSourceCardPath, type TalosSourceCardKind } from '@/lib/search/sourceCardStore'
import { talosLogDeviceIssue } from '@/lib/talosDeviceLog'

/**
 * Capture a Library source card: title, site, favicon, preview — once, at save
 * time, so nothing is fetched when the card is later shown.
 *
 * That timing is the whole feature. Competitors unfurl a link through a cloud
 * service that sees the URL, and fetch the preview live so it rots when the
 * site changes or dies. TALOS captures through its own safe-web boundary and
 * renders from local bytes forever. It is also what makes favicons acceptable
 * in the sources chip: fetching one at DISPLAY time would be a request to every
 * site every time a chat is opened, while fetching at save time makes no
 * request the search had not already made.
 *
 * A standalone service with injected ports, because the retroactive backfill
 * needs to run exactly this over links saved before any of it existed. One
 * thing called from two places rather than two that drift.
 *
 * Every path here is best-effort. A link the user asked to keep is kept whether
 * or not its favicon could be fetched, so nothing in this file may throw.
 */

export interface TalosSourceCard {
    url: string
    title: string
    siteName: string
    iconPath: string | null
    previewPath: string | null
}

export interface TalosSourceCardPorts {
    readPage(url: string): Promise<{ status: number; url: string; body: string }>
    readImage(url: string): Promise<{ contentType: string; base64: string }>
    /** Re-encode small. Also what strips whatever the original file carried. */
    shrink(base64: string, contentType: string): Promise<{ base64: string; contentType: string }>
    exists(path: string): Promise<boolean>
    write(path: string, base64: string): Promise<void>
}

export interface TalosSourceCardCapture {
    capture(url: string): Promise<TalosSourceCard | null>
}

export function createTalosSourceCardCapture(
    ports: TalosSourceCardPorts,
): TalosSourceCardCapture {
    /**
     * Fetch one image and store it, or give up quietly.
     *
     * The preview is re-encoded before it is written: it comes from a site we
     * do not control, and re-drawing it is what guarantees nothing of the
     * original file survives into the store. The icon is small and is written
     * as fetched.
     */
    async function storeImage(
        pageUrl: string,
        imageUrl: string,
        kind: TalosSourceCardKind,
    ): Promise<string | null> {
        try {
            const fetched = await ports.readImage(imageUrl)
            const stored = kind === 'preview'
                ? await ports.shrink(fetched.base64, fetched.contentType)
                : fetched
            const path = await talosSourceCardPath(pageUrl, kind, stored.contentType)
            await ports.write(path, stored.base64)
            return path
        } catch {
            // A missing favicon is not a failed save. The card degrades to the
            // letter placeholder and the link is kept either way.
            return null
        }
    }

    return {
        async capture(url) {
            try {
                // Canonical first: everything downstream keys on it, and a URL
                // that will not parse has no card and no path.
                const canonical = new URL(url).toString()

                // A card already on disk is the index. Nothing is re-fetched.
                const settled = await ports.exists(
                    await talosSourceCardPath(canonical, 'icon', 'image/png'),
                )
                if (settled) return null

                const page = await ports.readPage(canonical)
                const fields = talosUnfurlPage(page.url || canonical, page.body)

                const iconPath = await storeImage(canonical, fields.iconUrl, 'icon')
                const previewPath = fields.imageUrl
                    ? await storeImage(canonical, fields.imageUrl, 'preview')
                    : null

                return {
                    url: canonical,
                    title: fields.title,
                    siteName: fields.siteName,
                    iconPath,
                    previewPath,
                }
            } catch (error) {
                // Recorded rather than swallowed: a site that consistently
                // refuses is worth seeing in the Doctor, and this is the
                // instrument that makes an unpredicted failure describe itself.
                talosLogDeviceIssue('TALOS_SOURCE_CARD', String(error).slice(0, 200))
                return null
            }
        },
    }
}
