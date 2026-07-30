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
        write: vi.fn(async () => {}),
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
        expect(seams.write).not.toHaveBeenCalled()
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
