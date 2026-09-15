import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({ readBytes: vi.fn() }))
const platform = vi.hoisted(() => ({ value: 'android' }))

vi.mock('@capacitor/core', () => ({
    Capacitor: { getPlatform: () => platform.value },
    registerPlugin: () => bridge,
}))

const { readTalosSafeWebImage } = await import('@/services/safeWebRead')

beforeEach(() => {
    bridge.readBytes.mockReset()
    platform.value = 'android'
})

/**
 * Slice 2 of the Library source cards. The JS side of the byte path: it is the
 * last place a malformed native payload can be caught before bytes reach the
 * store, so it validates rather than trusts.
 */
describe('readTalosSafeWebImage', () => {
    it('returns the bytes and the image type the boundary vouched for', async () => {
        bridge.readBytes.mockResolvedValue({
            status: 200,
            url: 'https://example.org/icon.png',
            contentType: 'image/png',
            base64: 'AAECAw==',
        })

        await expect(readTalosSafeWebImage('https://example.org/icon.png')).resolves.toEqual({
            status: 200,
            url: 'https://example.org/icon.png',
            contentType: 'image/png',
            base64: 'AAECAw==',
        })
    })

    it('refuses a payload that is not the shape the native side promised', async () => {
        for (const bad of [
            null,
            {},
            { status: 200, url: '', contentType: 'image/png', base64: 'AA' },
            { status: '200', url: 'https://x/i.png', contentType: 'image/png', base64: 'AA' },
            { status: 200, url: 'https://x/i.png', contentType: 'image/png' },
        ]) {
            bridge.readBytes.mockResolvedValue(bad)
            await expect(readTalosSafeWebImage('https://example.org/icon.png'))
                .rejects.toThrow('TALOS_SAFE_WEB_RESPONSE_INVALID')
        }
    })

    it('refuses a content type that is not an image, even if native let it past', async () => {
        // Defence in depth: the boundary already checks, and so does this. A
        // document arriving where an image is expected is refused twice.
        bridge.readBytes.mockResolvedValue({
            status: 200,
            url: 'https://example.org/icon.png',
            contentType: 'text/html',
            base64: 'AA',
        })

        await expect(readTalosSafeWebImage('https://example.org/icon.png'))
            .rejects.toThrow('TALOS_SAFE_WEB_NOT_AN_IMAGE')
    })

    /**
     * The same closed door as the page reader. A browser could re-resolve the
     * host after validation, so there is no honest fallback to offer.
     */
    it('fails closed off Android rather than pretending to offer the boundary', async () => {
        platform.value = 'web'

        await expect(readTalosSafeWebImage('https://example.org/icon.png'))
            .rejects.toThrow('TALOS_SAFE_WEB_READ_UNAVAILABLE')
        expect(bridge.readBytes).not.toHaveBeenCalled()
    })
})
