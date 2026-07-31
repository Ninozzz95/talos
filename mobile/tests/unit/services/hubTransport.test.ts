import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The transport that can see a redirect.
 *
 * This file exists because of a defect the whole unit suite certified as
 * working: the Hub client asked the WebView's `fetch` for `redirect: 'manual'`
 * and read the `location` header, which the Fetch standard makes impossible —
 * a manual redirect on a non-navigation request is an OPAQUE-REDIRECT filtered
 * response: status 0, empty headers, null body. The tests passed because they
 * handed the client `new Response(null, {status: 302, headers: {location}})`,
 * a shape `fetch` can never return.
 *
 * So the assertions here are about the two things that were wrong: the redirect
 * must survive to the caller, and the bytes must arrive as bytes.
 */
const plugin = vi.hoisted(() => ({
    request: vi.fn(async () => ({ status: 200, headers: {}, data: '', url: '' })),
    native: true,
}))

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => plugin.native },
    CapacitorHttp: { request: plugin.request },
}))

import { talosCreateHubTransport, talosDecodeHubBody } from '@/services/hubTransport'

beforeEach(() => {
    plugin.native = true
    plugin.request.mockReset().mockResolvedValue({ status: 200, headers: {}, data: '', url: '' })
})

describe('seeing the redirect', () => {
    /**
     * THE defect, stated as a requirement: a 302 arrives with its status and
     * its `location` intact, so the signed CDN address can be read.
     */
    it('hands back the 302 and its location instead of following it', async () => {
        plugin.request.mockResolvedValue({
            status: 302,
            headers: { Location: 'https://us.aws.cdn.hf.co/xet/abc?Expires=1', Date: 'Fri, 01 Aug 2026 10:00:00 GMT' },
            data: '',
            url: '',
        })
        const transport = talosCreateHubTransport()

        const response = await transport('https://huggingface.co/a/b/resolve/main/m.gguf', {
            redirect: 'manual',
        })

        expect(response.status).toBe(302)
        expect(response.headers.get('location')).toBe('https://us.aws.cdn.hf.co/xet/abc?Expires=1')
        expect(response.headers.get('date')).toBe('Fri, 01 Aug 2026 10:00:00 GMT')
    })

    /** The plugin follows redirects unless told; that instruction is the point. */
    it('tells the native layer not to follow the redirect', async () => {
        const transport = talosCreateHubTransport()

        await transport('https://huggingface.co/x', { redirect: 'manual' })

        expect(plugin.request).toHaveBeenCalledWith(
            expect.objectContaining({ disableRedirects: true }))
    })

    it('lets redirects be followed when nobody asked to see them', async () => {
        const transport = talosCreateHubTransport()

        await transport('https://huggingface.co/x')

        expect(plugin.request).toHaveBeenCalledWith(
            expect.objectContaining({ disableRedirects: false }))
    })

    /**
     * Header names arrive with whatever case the server sent. Reading the
     * object directly would miss `Location` while looking for `location`.
     */
    it('reads a header whatever case the server used', async () => {
        plugin.request.mockResolvedValue({
            status: 302, headers: { LOCATION: 'https://cdn/x' }, data: '', url: '',
        })
        const transport = talosCreateHubTransport()

        const response = await transport('https://huggingface.co/x', { redirect: 'manual' })

        expect(response.headers.get('location')).toBe('https://cdn/x')
    })
})

describe('the bytes', () => {
    /**
     * With `responseType: 'arraybuffer'` the Android plugin hands over BASE64
     * in a string — the option names what the caller wanted, not what crosses
     * the bridge. Getting this wrong does not throw: it yields a GGUF header of
     * the wrong bytes, which the parser rejects as "not a GGUF", blaming the
     * model for the transport.
     */
    it('decodes the base64 the native layer actually sends', () => {
        // "GGUF" as base64.
        const decoded = new Uint8Array(talosDecodeHubBody('R0dVRg=='))

        expect([...decoded]).toEqual([0x47, 0x47, 0x55, 0x46])
    })

    it('passes an ArrayBuffer through untouched', () => {
        const source = new Uint8Array([1, 2, 3]).buffer

        expect([...new Uint8Array(talosDecodeHubBody(source))]).toEqual([1, 2, 3])
    })

    it('copies a view without dragging its whole backing buffer along', () => {
        const view = new Uint8Array([9, 8, 7, 6, 5]).subarray(1, 4)

        expect([...new Uint8Array(talosDecodeHubBody(view))]).toEqual([8, 7, 6])
    })

    it('treats nothing as no bytes rather than throwing', () => {
        expect(talosDecodeHubBody('').byteLength).toBe(0)
        expect(talosDecodeHubBody(null).byteLength).toBe(0)
        expect(talosDecodeHubBody(undefined).byteLength).toBe(0)
    })

    it('carries a real body through to the caller', async () => {
        plugin.request.mockResolvedValue({ status: 200, headers: {}, data: 'R0dVRg==', url: '' })
        const transport = talosCreateHubTransport()

        const bytes = await (await transport('https://cdn/x')).arrayBuffer()

        expect([...new Uint8Array(bytes)]).toEqual([0x47, 0x47, 0x55, 0x46])
    })

    /** `Response` throws if a 204 or 304 is given a body. */
    it('does not try to give a bodiless status a body', async () => {
        plugin.request.mockResolvedValue({ status: 304, headers: {}, data: 'R0dVRg==', url: '' })
        const transport = talosCreateHubTransport()

        await expect(transport('https://cdn/x')).resolves.toMatchObject({ status: 304 })
    })
})

describe('off the phone', () => {
    /**
     * A browser has no plugin, and the dev harness and this suite run on the
     * real `fetch`. Routing through the native path there would fail rather
     * than degrade.
     */
    it('uses the ordinary fetch, and never the plugin', async () => {
        plugin.native = false
        const fetchSpy = vi.fn(async () => new Response('hi'))
        vi.stubGlobal('fetch', fetchSpy)

        const transport = talosCreateHubTransport()
        await transport('https://huggingface.co/x')

        expect(fetchSpy).toHaveBeenCalled()
        expect(plugin.request).not.toHaveBeenCalled()
        vi.unstubAllGlobals()
    })
})
