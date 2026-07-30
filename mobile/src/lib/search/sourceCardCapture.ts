import { talosUnfurlPage } from '@/lib/search/unfurl'
import {
    talosSourceCardMissPath,
    talosSourceCardPath,
    talosSourceCardTypes,
    type TalosSourceCardKind,
} from '@/lib/search/sourceCardStore'
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
    read(path: string): Promise<Uint8Array>
    write(path: string, base64: string): Promise<void>
    now(): number
}

export interface TalosSourceCardCapture {
    capture(url: string): Promise<TalosSourceCard | null>
    /** Whether this url needs no work: it has an icon, or a recent failed try. */
    settled(url: string): Promise<boolean>
}

/**
 * How long a failed attempt is believed.
 *
 * A week is short enough that a phone which happened to be offline gets its
 * favicon back on the next open a week later, and long enough that a site with
 * no favicon at all is not re-fetched every time the Library is opened. It is
 * the same shape as a browser's own favicon store, which keeps failures out of
 * the way for days rather than retrying them per page view.
 */
const RETRY_AFTER_A_MISS_MS = 7 * 24 * 60 * 60 * 1000

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

    /**
     * A failed try, written down. Never allowed to fail the capture with it: a
     * mark is a courtesy to the network, not a reason to lose anything.
     */
    async function markMissed(canonical: string): Promise<void> {
        try {
            await ports.write(await talosSourceCardMissPath(canonical), btoa(String(ports.now())))
        } catch {
            // Then the next pass tries again, which is the safe direction.
        }
    }

    async function missIsRecent(canonical: string): Promise<boolean> {
        const path = await talosSourceCardMissPath(canonical)
        if (!await ports.exists(path)) return false
        const at = Number.parseInt(new TextDecoder().decode(await ports.read(path)).trim(), 10)
        if (!Number.isFinite(at)) return false
        const age = ports.now() - at
        // A negative age is a mark from the future — a clock that moved — and
        // believing it would hide the site for a week for no reason.
        return age >= 0 && age < RETRY_AFTER_A_MISS_MS
    }

    /**
     * The presence of a file IS the index, so this is the whole state machine:
     * an icon means done, a recent mark means recently tried, anything else
     * means there is work. Both halves are asked here, once, so capture and the
     * backfill can never disagree about what counts as settled.
     */
    async function settled(url: string): Promise<boolean> {
        try {
            const canonical = new URL(url).toString()
            if (await missIsRecent(canonical)) return true
            for (const type of talosSourceCardTypes('icon')) {
                if (await ports.exists(await talosSourceCardPath(canonical, 'icon', type))) return true
            }
            return false
        } catch {
            // A store that cannot answer must not make everything look done.
            return false
        }
    }

    return {
        settled,

        async capture(url) {
            // Canonical first, and outside the try, so the failure path can
            // still write the mark. A URL that will not parse has no path at
            // all, and stays null.
            let canonical: string | null = null
            try {
                canonical = new URL(url).toString()
                if (await settled(canonical)) return null

                const page = await ports.readPage(canonical)
                const fields = talosUnfurlPage(page.url || canonical, page.body)

                const iconPath = await storeImage(canonical, fields.iconUrl, 'icon')
                const previewPath = fields.imageUrl
                    ? await storeImage(canonical, fields.imageUrl, 'preview')
                    : null

                // The icon is what the Library shows, so a page read that
                // yielded none is a miss even though nothing threw.
                if (!iconPath) await markMissed(canonical)

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
                if (canonical) await markMissed(canonical)
                return null
            }
        },
    }
}
