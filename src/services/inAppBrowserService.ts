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
    dispose(options?: TalosInAppBrowserDisposeOptions): Promise<void>
}

export interface TalosInAppBrowserDisposeOptions {
    /**
     * Defaults to true for an owned Browse session. A one-shot user navigation
     * releases TALOS listeners/references but leaves the accepted browser page
     * under browser/user ownership.
     */
    closeActive?: boolean
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

    async function dispose(disposeOptions: TalosInAppBrowserDisposeOptions = {}): Promise<void> {
        if (disposeOptions.closeActive !== false && !closed) await close()
        await removeListeners()
        plugin = null
        externalWindow = null
        currentUrl = null
        currentSource = null
        closed = true
    }

    return { open, close, dispose }
}

/**
 * Open one link and be done with it — a citation, a Library row, a source.
 *
 * The screens that do this have no browser session to keep: they want a page
 * shown and nothing left behind. Doing it by hand meant a service built, used
 * and disposed at every call site, with a `catch` everyone had to remember —
 * and a leaked webview is invisible until the app is slow.
 *
 * Isolated BY DEFAULT: a page TALOS opens on the user's behalf is not the
 * user's browser and must not borrow its cookies.
 *
 * Owner 2026-07-27: "i link non si aprono bene, dalla libreria intendo". That
 * default was wrong for HIS taps. An isolated webview carries no cookies and no
 * logins, so a page revisited from the Library arrives logged out, behind a
 * consent wall, or simply broken — while the same address in his own browser
 * opens fine. The distinction that matters is WHO is opening it: TALOS reading
 * a source stays isolated, the user going back to a page does not.
 */
export async function openTalosLinkOnce(
    url: string,
    presentation: TalosMobileBrowserPresentation = 'isolated_webview',
): Promise<boolean> {
    const browser = createTalosInAppBrowserService({ onEvent: () => {} })
    try {
        await browser.open(url, presentation)
        // Launch-and-release is not launch-and-close. Once the official browser
        // accepted this explicit tap, remove our JS callbacks and relinquish
        // ownership without dismissing the page the user is trying to read.
        await browser.dispose({ closeActive: false })
        return true
    } catch {
        // A link that will not open reports by staying put rather than by a dead
        // tap: the address is on screen and can be copied.
        await browser.dispose()
        return false
    }
}
