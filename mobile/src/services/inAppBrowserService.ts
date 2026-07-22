import { Capacitor } from '@capacitor/core'
import type { TalosMobileBrowserPresentation } from '@/lib/browser/browserContracts'
import { normalizeTalosBrowserUrl } from '@/lib/browser/browserEvidence'

export type TalosInAppBrowserEventType = 'opening' | 'loaded' | 'navigated' | 'closed' | 'failed'
export type TalosInAppBrowserEventSource = 'native' | 'web_external'

export interface TalosInAppBrowserEvent {
    type: TalosInAppBrowserEventType
    url: string
    source: TalosInAppBrowserEventSource
    message?: string
}

interface BrowserListenerHandle {
    remove(): Promise<void>
}

interface TalosInAppBrowserPluginPort {
    addListener(event: string, listener: (...args: unknown[]) => void): Promise<BrowserListenerHandle>
    openInWebView(input: { url: string; options: Record<string, unknown> }): Promise<void>
    openInSystemBrowser(input: { url: string; options: Record<string, unknown> }): Promise<void>
    close(): Promise<void>
}

interface TalosInAppBrowserModule {
    InAppBrowser: TalosInAppBrowserPluginPort
    DefaultWebViewOptions: Record<string, unknown>
    DefaultSystemBrowserOptions: Record<string, unknown>
}

interface ExternalWindowHandle {
    close(): void
}

export interface TalosInAppBrowserServiceOptions {
    isNative?: () => boolean
    loadPlugin?: () => Promise<TalosInAppBrowserModule>
    openExternal?: (url: string) => ExternalWindowHandle | null
    onEvent?: (event: TalosInAppBrowserEvent) => void
}

export interface TalosInAppBrowserService {
    open(url: string, presentation: TalosMobileBrowserPresentation): Promise<void>
    close(): Promise<void>
    dispose(): Promise<void>
}

async function loadOfficialPlugin(): Promise<TalosInAppBrowserModule> {
    return await import('@capacitor/inappbrowser') as unknown as TalosInAppBrowserModule
}

function openExternalTab(url: string): ExternalWindowHandle | null {
    return window.open(url, '_blank', 'noopener,noreferrer')
}

export function createTalosInAppBrowserService(
    options: TalosInAppBrowserServiceOptions = {},
): TalosInAppBrowserService {
    const isNative = options.isNative ?? (() => Capacitor.isNativePlatform())
    const loadPlugin = options.loadPlugin ?? loadOfficialPlugin
    const openExternal = options.openExternal ?? openExternalTab
    const onEvent = options.onEvent ?? (() => undefined)
    let plugin: TalosInAppBrowserPluginPort | null = null
    let listeners: BrowserListenerHandle[] = []
    let externalWindow: ExternalWindowHandle | null = null
    let currentUrl: string | null = null
    let currentSource: TalosInAppBrowserEventSource | null = null
    let closed = true

    function publish(type: TalosInAppBrowserEventType, message?: string): void {
        if (!currentUrl || !currentSource) return
        onEvent({ type, url: currentUrl, source: currentSource, ...(message ? { message } : {}) })
    }

    async function removeListeners(): Promise<void> {
        const current = listeners
        listeners = []
        await Promise.all(current.map(async (handle) => {
            try {
                await handle.remove()
            } catch {
                // Listener cleanup must not mask the browser outcome.
            }
        }))
    }

    function publishClosed(): void {
        if (closed) return
        closed = true
        publish('closed')
    }

    async function registerListeners(port: TalosInAppBrowserPluginPort): Promise<void> {
        listeners = await Promise.all([
            port.addListener('browserClosed', () => publishClosed()),
            port.addListener('browserPageLoaded', () => publish('loaded')),
            port.addListener('browserPageNavigationCompleted', (...args: unknown[]) => {
                const data = args[0]
                if (data && typeof data === 'object' && typeof (data as { url?: unknown }).url === 'string') {
                    const normalized = normalizeTalosBrowserUrl((data as { url: string }).url)
                    if (normalized) currentUrl = normalized
                }
                publish('navigated')
            }),
        ])
    }

    async function open(url: string, presentation: TalosMobileBrowserPresentation): Promise<void> {
        const normalized = normalizeTalosBrowserUrl(url)
        if (!normalized) throw new Error('TALOS_BROWSER_URL_INVALID')
        if (!closed) await close()
        currentUrl = normalized
        closed = false

        if (!isNative()) {
            currentSource = 'web_external'
            publish('opening')
            externalWindow = openExternal(normalized)
            if (!externalWindow) {
                closed = true
                publish('failed', 'The browser blocked the new tab. Allow popups and retry.')
                throw new Error('TALOS_IN_APP_BROWSER_OPEN_FAILED')
            }
            publish('loaded')
            return
        }

        currentSource = 'native'
        const module = await loadPlugin()
        plugin = module.InAppBrowser
        try {
            await registerListeners(plugin)
            publish('opening')
            if (presentation === 'system_browser') {
                await plugin.openInSystemBrowser({
                    url: normalized,
                    options: { ...module.DefaultSystemBrowserOptions },
                })
                return
            }
            const defaultAndroid = module.DefaultWebViewOptions.android
            const android = defaultAndroid && typeof defaultAndroid === 'object'
                ? defaultAndroid as Record<string, unknown>
                : {}
            await plugin.openInWebView({
                url: normalized,
                options: {
                    ...module.DefaultWebViewOptions,
                    showURL: true,
                    showToolbar: true,
                    showNavigationButtons: true,
                    android: {
                        ...android,
                        isIsolated: true,
                        allowZoom: true,
                        hardwareBack: true,
                        pauseMedia: true,
                    },
                },
            })
        } catch {
            closed = true
            publish('failed', 'The isolated browser could not be opened.')
            await removeListeners()
            plugin = null
            throw new Error('TALOS_IN_APP_BROWSER_OPEN_FAILED')
        }
    }

    async function close(): Promise<void> {
        if (closed) return
        if (currentSource === 'web_external') {
            externalWindow?.close()
            externalWindow = null
            publishClosed()
            return
        }
        if (plugin) await plugin.close()
    }

    async function dispose(): Promise<void> {
        if (!closed) await close()
        await removeListeners()
        plugin = null
        externalWindow = null
        currentUrl = null
        currentSource = null
        closed = true
    }

    return { open, close, dispose }
}
