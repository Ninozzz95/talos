import { beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
    platform: 'web',
    read: vi.fn(),
    registerPlugin: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
    Capacitor: {
        getPlatform: () => native.platform,
    },
    registerPlugin: native.registerPlugin,
}))

import { readTalosSafeWebPage } from '@/services/safeWebRead'

describe('safe native web-read bridge', () => {
    beforeEach(() => {
        native.platform = 'web'
        native.read.mockReset()
        native.registerPlugin.mockReset()
        native.registerPlugin.mockReturnValue({ read: native.read })
    })

    it('SAFE-WEB-01 fails closed off Android without registering an unsafe fallback', async () => {
        await expect(readTalosSafeWebPage('https://example.org/article'))
            .rejects.toThrow('TALOS_SAFE_WEB_READ_UNAVAILABLE')
        expect(native.registerPlugin).not.toHaveBeenCalled()
        expect(native.read).not.toHaveBeenCalled()
    })

    it('SAFE-WEB-02 invokes only the TalosSafeWeb Android plugin', async () => {
        native.platform = 'android'
        native.read.mockResolvedValue({
            status: 200,
            url: 'https://www.example.org/final',
            body: '<html><body>safe</body></html>',
        })

        await expect(readTalosSafeWebPage('https://example.org/start')).resolves.toEqual({
            status: 200,
            url: 'https://www.example.org/final',
            body: '<html><body>safe</body></html>',
        })
        expect(native.registerPlugin).toHaveBeenCalledWith('TalosSafeWeb')
        expect(native.read).toHaveBeenCalledWith({ url: 'https://example.org/start' })
    })

    it('fails closed when the native response shape is incomplete', async () => {
        native.platform = 'android'
        native.read.mockResolvedValue({ status: 200, url: 'https://example.org' })

        await expect(readTalosSafeWebPage('https://example.org'))
            .rejects.toThrow('TALOS_SAFE_WEB_RESPONSE_INVALID')
    })
})

