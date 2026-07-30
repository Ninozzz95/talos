import { describe, expect, it, vi } from 'vitest'
import { createTalosSourceCardCapture } from '@/lib/search/sourceCardCapture'

/**
 * Slice 3 of the Library source cards: capture.
 *
 * Built as a standalone service with injected ports rather than as a step
 * inside the archive, because slice 6 — the retroactive backfill — needs to run
 * exactly this over links that were saved before any of it existed. One thing,
 * called from two places, instead of two things that drift.
 *
 * The rule that shapes every test here: capture is BEST-EFFORT and must never
 * affect the save. A link the user asked to keep is kept whether or not its
 * favicon could be fetched, so nothing in this file is allowed to throw.
 */
const NOW = Date.parse('2026-07-30T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

function ports(overrides: Record<string, unknown> = {}) {
    return {
        readPage: vi.fn(async () => ({
            status: 200,
            url: 'https://example.org/post',
            body: `
                <meta property="og:title" content="A post">
                <meta property="og:image" content="https://example.org/hero.png">
                <link rel="icon" href="/icon.png" sizes="64x64">
            `,
        })),
        readImage: vi.fn(async () => ({
            status: 200,
            url: 'https://example.org/icon.png',
            contentType: 'image/png',
            base64: 'AAECAw==',
        })),
        shrink: vi.fn(async (base64: string) => ({ base64, contentType: 'image/webp' })),
        exists: vi.fn(async () => false),
        read: vi.fn(async () => new TextEncoder().encode(String(NOW))),
        write: vi.fn(async () => {}),
        now: vi.fn(() => NOW),
        ...overrides,
    }
}

describe('createTalosSourceCardCapture', () => {
    it('captures the title, the icon and the preview, and writes both images', async () => {
        const seams = ports()
        const capture = createTalosSourceCardCapture(seams as never)

        const card = await capture.capture('https://example.org/post')

        expect(card).toMatchObject({
            url: 'https://example.org/post',
            title: 'A post',
            siteName: 'example.org',
        })
        expect(card?.iconPath).toMatch(/^talos-vault\/cards\/[0-9a-f]{32}-icon\.png$/)
        expect(card?.previewPath).toMatch(/-preview\.webp$/)
        expect(seams.write).toHaveBeenCalledTimes(2)
    })

    it('does not fetch anything for a card it already has', async () => {
        const seams = ports({ exists: vi.fn(async () => true) })
        const capture = createTalosSourceCardCapture(seams as never)

        await capture.capture('https://example.org/post')

        expect(seams.readPage).not.toHaveBeenCalled()
        expect(seams.readImage).not.toHaveBeenCalled()
    })

    /**
     * The whole point of best-effort. Every one of these used to be a way for a
     * failed favicon to take a saved link down with it.
     */
    it('returns null instead of throwing when the page cannot be read', async () => {
        const seams = ports({
            readPage: vi.fn(async () => { throw new Error('TALOS_WEB_URL_BLOCKED:address') }),
        })
        const capture = createTalosSourceCardCapture(seams as never)

        await expect(capture.capture('https://example.org/post')).resolves.toBeNull()
    })

    it('keeps the half it got when only one image fails', async () => {
        const seams = ports({
            readImage: vi.fn()
                .mockResolvedValueOnce({
                    status: 200, url: 'https://example.org/icon.png',
                    contentType: 'image/png', base64: 'AAECAw==',
                })
                .mockRejectedValueOnce(new Error('TALOS_WEB_NOT_AN_IMAGE')),
        })
        const capture = createTalosSourceCardCapture(seams as never)

        const card = await capture.capture('https://example.org/post')

        // The icon survived; the preview did not, and says so honestly.
        expect(card?.iconPath).toBeTruthy()
        expect(card?.previewPath).toBeNull()
        expect(seams.write).toHaveBeenCalledTimes(1)
    })

    it('still records the title when no image can be stored at all', async () => {
        const seams = ports({
            readImage: vi.fn(async () => { throw new Error('nope') }),
        })
        const capture = createTalosSourceCardCapture(seams as never)

        const card = await capture.capture('https://example.org/post')

        expect(card?.title).toBe('A post')
        expect(card?.iconPath).toBeNull()
        expect(card?.previewPath).toBeNull()
        // Nothing but the record of the failure itself, which is the point of
        // the mark: no card was stored, so no card must be claimed.
        expect(seams.write.mock.calls.map(([path]) => path))
            .toEqual([expect.stringMatching(/-miss\.txt$/)])
    })

    /**
     * The preview is an image from a site we do not control. Re-encoding it is
     * what strips whatever the original file was carrying, so a card is never
     * written from bytes that arrived untouched.
     */
    it('never writes the preview bytes it received, only re-encoded ones', async () => {
        const seams = ports({
            shrink: vi.fn(async () => ({ base64: 'UkVFTkNPREVE', contentType: 'image/webp' })),
        })
        const capture = createTalosSourceCardCapture(seams as never)

        await capture.capture('https://example.org/post')

        const preview = seams.write.mock.calls.find(([path]) => String(path).includes('-preview'))
        expect(preview?.[1]).toBe('UkVFTkNPREVE')
        expect(seams.shrink).toHaveBeenCalledOnce()
    })

    it('refuses a page whose own URL it cannot canonicalise', async () => {
        const capture = createTalosSourceCardCapture(ports() as never)

        await expect(capture.capture('not a url')).resolves.toBeNull()
    })
})

/**
 * "Already have it" is one question with one answer, asked by capture before it
 * fetches and by the backfill before it spends its budget. It lives here, once,
 * so the two can never disagree about what counts as settled.
 */
describe('knowing a url is settled', () => {
    /**
     * A favicon usually arrives as `.ico` or `.png`, and the stored extension
     * follows the content type. Looking only for `.png` — which is what the
     * first cut of the guard did — means every `.ico` site is re-fetched on
     * every pass forever, having stored a perfectly good icon each time.
     */
    it('finds an icon whatever image type the site served it as', async () => {
        for (const extension of ['png', 'ico', 'jpg', 'webp', 'gif']) {
            const seams = ports({
                exists: vi.fn(async (path: string) => path.endsWith(`-icon.${extension}`)),
            })
            const capture = createTalosSourceCardCapture(seams as never)

            await expect(capture.settled('https://example.org/post')).resolves.toBe(true)
        }
    })

    it('is not settled by a preview alone, because the icon is what is shown', async () => {
        const seams = ports({
            exists: vi.fn(async (path: string) => path.includes('-preview.')),
        })
        const capture = createTalosSourceCardCapture(seams as never)

        await expect(capture.settled('https://example.org/post')).resolves.toBe(false)
    })
})

/**
 * The negative half of the index.
 *
 * Without it, every link whose site is dead — or was merely unreachable while
 * the phone was offline — is a page fetch on every single Library open, forever.
 * With a permanent mark instead, the phone that happened to be in a lift when a
 * link was saved never gets that favicon at all. So the mark carries the time it
 * was made and stops counting after a week.
 */
describe('remembering that a capture failed', () => {
    it('marks a url whose page could not be read', async () => {
        const seams = ports({
            readPage: vi.fn(async () => { throw new Error('TALOS_WEB_URL_BLOCKED:address') }),
        })
        const capture = createTalosSourceCardCapture(seams as never)

        await capture.capture('https://example.org/post')

        const mark = seams.write.mock.calls.find(([path]) => String(path).endsWith('-miss.txt'))
        expect(mark).toBeTruthy()
        expect(atob(String(mark?.[1]))).toBe(String(NOW))
    })

    it('marks a url whose page was fine but whose icon was not', async () => {
        const seams = ports({
            readImage: vi.fn(async () => { throw new Error('TALOS_WEB_NOT_AN_IMAGE') }),
        })
        const capture = createTalosSourceCardCapture(seams as never)

        await capture.capture('https://example.org/post')

        expect(seams.write.mock.calls.some(([path]) => String(path).endsWith('-miss.txt'))).toBe(true)
    })

    it('does not mark a url whose icon it stored', async () => {
        const seams = ports()
        const capture = createTalosSourceCardCapture(seams as never)

        await capture.capture('https://example.org/post')

        expect(seams.write.mock.calls.some(([path]) => String(path).endsWith('-miss.txt'))).toBe(false)
    })

    it('does not fetch again while the mark is fresh', async () => {
        const seams = ports({
            exists: vi.fn(async (path: string) => path.endsWith('-miss.txt')),
            read: vi.fn(async () => new TextEncoder().encode(String(NOW - 2 * DAY))),
        })
        const capture = createTalosSourceCardCapture(seams as never)

        await expect(capture.settled('https://example.org/post')).resolves.toBe(true)
        await capture.capture('https://example.org/post')
        expect(seams.readPage).not.toHaveBeenCalled()
    })

    it('tries again once the mark is old enough', async () => {
        const seams = ports({
            exists: vi.fn(async (path: string) => path.endsWith('-miss.txt')),
            read: vi.fn(async () => new TextEncoder().encode(String(NOW - 8 * DAY))),
        })
        const capture = createTalosSourceCardCapture(seams as never)

        await expect(capture.settled('https://example.org/post')).resolves.toBe(false)
        await capture.capture('https://example.org/post')
        expect(seams.readPage).toHaveBeenCalledOnce()
    })

    it('treats a mark it cannot read as no mark at all', async () => {
        for (const read of [
            vi.fn(async () => { throw new Error('gone') }),
            vi.fn(async () => new TextEncoder().encode('not a number')),
            vi.fn(async () => new Uint8Array()),
        ]) {
            const seams = ports({
                exists: vi.fn(async (path: string) => path.endsWith('-miss.txt')),
                read,
            })
            const capture = createTalosSourceCardCapture(seams as never)

            await expect(capture.settled('https://example.org/post')).resolves.toBe(false)
        }
    })

    /** A mark is a courtesy to the network, never a reason to lose a link. */
    it('does not fail a capture because the mark could not be written', async () => {
        const seams = ports({
            readPage: vi.fn(async () => { throw new Error('TALOS_WEB_URL_BLOCKED:address') }),
            write: vi.fn(async () => { throw new Error('TALOS_ATTACHMENT_UNAVAILABLE') }),
        })
        const capture = createTalosSourceCardCapture(seams as never)

        await expect(capture.capture('https://example.org/post')).resolves.toBeNull()
    })
})
