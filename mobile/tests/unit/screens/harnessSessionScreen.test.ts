// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { Capacitor } from '@capacitor/core'

const keyboardMock = vi.hoisted(() => ({
    listeners: new Map<string, (...args: unknown[]) => void>(),
    removers: new Map<string, ReturnType<typeof vi.fn>>(),
}))
vi.mock('@capacitor/keyboard', () => ({
    Keyboard: {
        addListener: vi.fn(async (eventName: string, listener: (...args: unknown[]) => void) => {
            const remove = vi.fn()
            keyboardMock.listeners.set(eventName, listener)
            keyboardMock.removers.set(eventName, remove)
            return { remove }
        }),
    },
}))

// Harness UI (24/8): NOT a trampoline anymore — `useRoute` is mocked directly
// (rather than mounted under a real router) because the only thing this
// screen reads from it is `params.id`, kept purely for diagnosis — see the
// component's opening comment for why it moved off `window.location.assign`.
const mockState = vi.hoisted(() => ({ params: { id: 'refactor-auth-flow' } as Record<string, string> }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: mockState.params }) }))

import HarnessSessionScreen from '@/screens/HarnessSessionScreen.vue'

const FAKE_MOCKUP_HTML = '<!doctype html><html><head></head><body>'
    + '<svg class="icon-sprite" aria-hidden="true"><symbol id="i-test" viewBox="0 0 24 24"></symbol></svg>'
    + '<div id="app" class="app-shell">stub sessions/chat/inspector</div>'
    + '<script src="app.js"></script>'
    + '</body></html>'

/** app.js never really runs under jsdom (no script execution configured) —
 * this simulates the ONE contract HarnessSessionScreen.vue depends on it
 * for: the load event that resolves `mountMockup()`'s awaited promise. */
async function resolveScriptLoad(host: HTMLElement): Promise<void> {
    await flushPromises()
    const script = host.shadowRoot?.querySelector('script')
    script?.dispatchEvent(new Event('load'))
    await flushPromises()
}

describe('HarnessSessionScreen (24/8) — shadow root inside the SPA, not a trampoline out of it', () => {
    beforeEach(() => {
        mockState.params = { id: 'refactor-auth-flow' }
        keyboardMock.listeners.clear()
        keyboardMock.removers.clear()
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...window.location, assign: vi.fn() },
        })
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            if (String(input).endsWith('/harness-ui/index.html')) return new Response(FAKE_MOCKUP_HTML, { status: 200 })
            return new Response('', { status: 404 })
        }))
    })

    afterEach(() => {
        delete (window as unknown as { __talosHarnessRoot?: unknown }).__talosHarnessRoot
        delete (window as unknown as { __talosHarnessHost?: unknown }).__talosHarnessHost
        delete (window as unknown as { __talosHarnessDestroy?: unknown }).__talosHarnessDestroy
        delete (window as unknown as { __talosHarnessUiRuntime?: unknown }).__talosHarnessUiRuntime
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('mounts the mockup into a shadow root on the host element — never a top-level navigation', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        const w = mount(HarnessSessionScreen)
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        await resolveScriptLoad(host)

        expect(window.location.assign).not.toHaveBeenCalled()
        expect(host.shadowRoot).not.toBeNull()
        expect(host.shadowRoot?.querySelector('.icon-sprite')).not.toBeNull()
        const link = host.shadowRoot?.querySelector('link[rel="stylesheet"]')
        expect(link?.getAttribute('href')).toBe('/harness-ui/styles.css')
        expect(host.shadowRoot?.querySelector('script')?.getAttribute('src')).toBe('/harness-ui/app.js')
        // the fetched document's own trailing <script> must NOT have been
        // carried over verbatim — a second, tracked one replaces it.
        expect(host.shadowRoot?.querySelectorAll('script').length).toBe(1)
        expect(w.find('[data-testid="talos-harness-session-opening"]').exists()).toBe(false)
        expect(w.find('[data-testid="talos-harness-session-error"]').exists()).toBe(false)
    })

    it('shows an honest "not available" state and never fetches when the plugin is absent (release build)', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(false)
        const w = mount(HarnessSessionScreen)
        await flushPromises()
        expect(window.fetch).not.toHaveBeenCalled()
        expect(window.location.assign).not.toHaveBeenCalled()
        expect(w.find('[data-testid="talos-harness-session-unavailable"]').exists()).toBe(true)
    })

    it('shows an honest load-failed state when the fetch fails, instead of a silent blank host', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
        const w = mount(HarnessSessionScreen)
        await flushPromises()
        expect(w.find('[data-testid="talos-harness-session-error"]').exists()).toBe(true)
        expect(window.location.assign).not.toHaveBeenCalled()
    })

    it('carries the tapped session id through as a diagnostic data attribute', () => {
        mockState.params = { id: 'audit-api-permissions' }
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        const w = mount(HarnessSessionScreen)
        expect(w.get('[data-testid="talos-harness-session-screen"]').attributes('data-harness-session-id')).toBe('audit-api-permissions')
    })

    it('calls the destroyer contract on unmount, so window-level listeners cannot outlive the screen', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        const w = mount(HarnessSessionScreen)
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        await resolveScriptLoad(host)

        // app.js never really executes under jsdom; stand in for the
        // destroyer it would have installed by the time 'load' fired.
        const destroy = vi.fn()
        ;(window as unknown as { __talosHarnessDestroy?: () => void }).__talosHarnessDestroy = destroy
        ;(window as unknown as { __talosHarnessRoot?: unknown }).__talosHarnessRoot = host.shadowRoot

        w.unmount()

        expect(destroy).toHaveBeenCalledTimes(1)
        expect((window as unknown as { __talosHarnessRoot?: unknown }).__talosHarnessRoot).toBeUndefined()
    })

    it('HARNESS-KEYBOARD-NATIVE-RESIZE-01 forwards native show/hide and removes both listeners', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        const setKeyboardOpen = vi.fn()
        ;(window as unknown as {
            __talosHarnessUiRuntime?: { setKeyboardOpen(open: boolean): void }
        }).__talosHarnessUiRuntime = { setKeyboardOpen }

        const w = mount(HarnessSessionScreen)
        await flushPromises()

        expect([...keyboardMock.listeners.keys()].sort()).toEqual([
            'keyboardWillHide',
            'keyboardWillShow',
        ])

        keyboardMock.listeners.get('keyboardWillShow')?.({ keyboardHeight: 320 })
        keyboardMock.listeners.get('keyboardWillHide')?.()
        expect(setKeyboardOpen).toHaveBeenNthCalledWith(1, true)
        expect(setKeyboardOpen).toHaveBeenNthCalledWith(2, false)

        w.unmount()
        await flushPromises()
        expect(keyboardMock.removers.get('keyboardWillShow')).toHaveBeenCalledTimes(1)
        expect(keyboardMock.removers.get('keyboardWillHide')).toHaveBeenCalledTimes(1)
    })
})
