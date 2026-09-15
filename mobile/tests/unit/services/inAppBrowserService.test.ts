import { describe, expect, it, vi } from 'vitest'
import {
    createTalosInAppBrowserService,
    openTalosLinkOnce,
} from '@/services/inAppBrowserService'

const oneShotNative = vi.hoisted(() => {
    const removed = vi.fn(async () => undefined)
    const plugin = {
        addListener: vi.fn(async () => ({ remove: removed })),
        openInWebView: vi.fn(async () => undefined),
        openInSystemBrowser: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
    }
    return { plugin, removed }
})

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => true },
}))
vi.mock('@capacitor/inappbrowser', () => ({
    InAppBrowser: oneShotNative.plugin,
    DefaultWebViewOptions: {},
    DefaultSystemBrowserOptions: { android: { showTitle: true } },
}))

function nativeHarness() {
    const listeners = new Map<string, (...args: unknown[]) => void>()
    const removed = vi.fn().mockResolvedValue(undefined)
    const plugin = {
        addListener: vi.fn(async (event: string, listener: (...args: unknown[]) => void) => {
            listeners.set(event, listener)
            return { remove: removed }
        }),
        openInWebView: vi.fn().mockResolvedValue(undefined),
        openInSystemBrowser: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
    }
    const load = vi.fn(async () => ({
        InAppBrowser: plugin,
        DefaultWebViewOptions: {
            showURL: false,
            showToolbar: false,
            showNavigationButtons: false,
            android: { isIsolated: false, allowZoom: false },
        },
        DefaultSystemBrowserOptions: { android: { showTitle: true } },
    }))
    return { listeners, load, plugin, removed }
}

describe('createTalosInAppBrowserService', () => {
    it("launches a one-shot Library link without immediately closing the user's browser", async () => {
        oneShotNative.plugin.addListener.mockClear()
        oneShotNative.plugin.openInWebView.mockClear()
        oneShotNative.plugin.openInSystemBrowser.mockClear()
        oneShotNative.plugin.close.mockClear()
        oneShotNative.removed.mockClear()

        await expect(openTalosLinkOnce('https://Example.com/source', 'system_browser'))
            .resolves.toBe(true)

        expect(oneShotNative.plugin.openInSystemBrowser).toHaveBeenCalledOnce()
        expect(oneShotNative.plugin.openInSystemBrowser).toHaveBeenCalledWith({
            url: 'https://example.com/source',
            options: { android: { showTitle: true } },
        })
        expect(oneShotNative.plugin.openInWebView).not.toHaveBeenCalled()
        expect(oneShotNative.plugin.close).not.toHaveBeenCalled()
        expect(oneShotNative.removed).toHaveBeenCalledTimes(3)
    })

    it('registers listeners before opening an isolated native WebView', async () => {
        const { listeners, load, plugin, removed } = nativeHarness()
        const events: unknown[] = []
        const service = createTalosInAppBrowserService({
            isNative: () => true,
            loadPlugin: load,
            onEvent: (event) => events.push(event),
        })

        await service.open('https://Example.com/path', 'isolated_webview')

        expect(plugin.addListener).toHaveBeenCalledTimes(3)
        expect(plugin.addListener.mock.invocationCallOrder.every(
            (order) => order < plugin.openInWebView.mock.invocationCallOrder[0]!,
        )).toBe(true)
        expect(plugin.openInWebView).toHaveBeenCalledWith({
            url: 'https://example.com/path',
            options: expect.objectContaining({
                showURL: true,
                showToolbar: true,
                showNavigationButtons: true,
                android: expect.objectContaining({
                    isIsolated: true,
                    allowZoom: true,
                    hardwareBack: true,
                    pauseMedia: true,
                }),
            }),
        })
        expect(events).toEqual([
            expect.objectContaining({ type: 'opening', url: 'https://example.com/path' }),
        ])

        listeners.get('browserPageLoaded')?.()
        listeners.get('browserPageNavigationCompleted')?.({ url: 'https://example.com/next' })
        listeners.get('browserClosed')?.()
        expect(events).toEqual([
            expect.objectContaining({ type: 'opening' }),
            expect.objectContaining({ type: 'loaded', url: 'https://example.com/path' }),
            expect.objectContaining({ type: 'navigated', url: 'https://example.com/next' }),
            expect.objectContaining({ type: 'closed', url: 'https://example.com/next' }),
        ])

        await service.dispose()
        expect(removed).toHaveBeenCalledTimes(3)
        expect(plugin.close).not.toHaveBeenCalled()
    })

    it('uses the official system-browser method without weakening its defaults', async () => {
        const { load, plugin } = nativeHarness()
        const service = createTalosInAppBrowserService({ isNative: () => true, loadPlugin: load })

        await service.open('https://example.com', 'system_browser')

        expect(plugin.openInSystemBrowser).toHaveBeenCalledWith({
            url: 'https://example.com/',
            options: { android: { showTitle: true } },
        })
        expect(plugin.openInWebView).not.toHaveBeenCalled()

        await service.dispose()
        expect(plugin.close).toHaveBeenCalledOnce()
    })

    it('rejects unsafe URLs before loading or calling the native plugin', async () => {
        const { load, plugin } = nativeHarness()
        const service = createTalosInAppBrowserService({ isNative: () => true, loadPlugin: load })

        await expect(service.open('https://user:pass@example.com', 'isolated_webview'))
            .rejects.toThrow('TALOS_BROWSER_URL_INVALID')
        expect(load).not.toHaveBeenCalled()
        expect(plugin.openInWebView).not.toHaveBeenCalled()
    })

    it('uses a user-initiated external tab on web without claiming capture evidence', async () => {
        const opened = { close: vi.fn() }
        const openExternal = vi.fn(() => opened)
        const events: unknown[] = []
        const service = createTalosInAppBrowserService({
            isNative: () => false,
            openExternal,
            onEvent: (event) => events.push(event),
        })

        await service.open('https://example.com', 'isolated_webview')
        expect(openExternal).toHaveBeenCalledWith('https://example.com/')
        expect(events).toEqual([
            expect.objectContaining({ type: 'opening', source: 'web_external' }),
            expect.objectContaining({ type: 'loaded', source: 'web_external' }),
        ])
        await service.close()
        expect(opened.close).toHaveBeenCalledOnce()
        expect(events.at(-1)).toEqual(expect.objectContaining({ type: 'closed' }))
    })

    it('emits one sanitized failure and removes listeners when native open fails', async () => {
        const { load, plugin, removed } = nativeHarness()
        plugin.openInWebView.mockRejectedValueOnce(new Error('native secret /token leaked'))
        const events: unknown[] = []
        const service = createTalosInAppBrowserService({
            isNative: () => true,
            loadPlugin: load,
            onEvent: (event) => events.push(event),
        })

        await expect(service.open('https://example.com', 'isolated_webview'))
            .rejects.toThrow('TALOS_IN_APP_BROWSER_OPEN_FAILED')
        expect(events.at(-1)).toEqual({
            type: 'failed',
            url: 'https://example.com/',
            source: 'native',
            message: 'The isolated browser could not be opened.',
        })
        expect(removed).toHaveBeenCalledTimes(3)
    })
})
