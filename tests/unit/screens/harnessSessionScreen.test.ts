// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { compileStyle, parse } from '@vue/compiler-sfc'
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
const mockState = vi.hoisted(() => ({
    params: { id: 'refactor-auth-flow' } as Record<string, string>,
    routerPush: vi.fn(),
}))
vi.mock('vue-router', () => ({
    useRoute: () => ({ params: mockState.params }),
    useRouter: () => ({ push: mockState.routerPush }),
}))

import HarnessSessionScreen from '@/screens/HarnessSessionScreen.vue'
import { HARNESS_DEMO_SESSIONS } from '@/lib/harnessDemoSessions'
import {
    __resetTalosOverlayBackForTests,
    handleTalosOverlayBack,
    talosOverlayBackActive,
} from '@/composables/useTalosOverlayBack'

const FAKE_MOCKUP_HTML = '<!doctype html><html><head></head><body>'
    + '<svg class="icon-sprite" aria-hidden="true"><symbol id="i-test" viewBox="0 0 24 24"></symbol></svg>'
    + '<div id="app" class="app-shell"><main class="workspace-shell">stub chat</main>'
    + '<aside class="inspector-panel">stub inspector</aside></div>'
    + '<script src="app.js"></script>'
    + '</body></html>'

function fixedRect(left: number, right: number, top = 0, bottom = 800): DOMRect {
    return {
        x: left,
        y: top,
        top,
        right,
        bottom,
        left,
        width: right - left,
        height: bottom - top,
        toJSON: () => ({}),
    }
}

/** app.js never really runs under jsdom (no script execution configured) —
 * this simulates the ONE contract HarnessSessionScreen.vue depends on it
 * for: the load event that resolves `mountMockup()`'s awaited promise. */
async function resolveScriptLoad(host: HTMLElement): Promise<void> {
    await flushPromises()
    ;(window as unknown as {
        __talosHarnessUiRuntime?: { selectSession(selection: { id: string; title: string }): void }
    }).__talosHarnessUiRuntime ??= { selectSession: vi.fn() }
    const script = host.shadowRoot?.querySelector('script')
    script?.dispatchEvent(new Event('load'))
    await flushPromises()
}

describe('HarnessSessionScreen (24/8) — shadow root inside the SPA, not a trampoline out of it', () => {
    beforeEach(() => {
        __resetTalosOverlayBackForTests()
        mockState.params = { id: 'refactor-auth-flow' }
        mockState.routerPush.mockReset()
        keyboardMock.listeners.clear()
        keyboardMock.removers.clear()
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { ...window.location, assign: vi.fn() },
        })
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = new URL(String(input), 'https://localhost')
            if (url.pathname === '/harness-ui/index.html') return new Response(FAKE_MOCKUP_HTML, { status: 200 })
            return new Response('', { status: 404 })
        }))
    })

    afterEach(() => {
        __resetTalosOverlayBackForTests()
        delete (window as unknown as { __talosHarnessRoot?: unknown }).__talosHarnessRoot
        delete (window as unknown as { __talosHarnessHost?: unknown }).__talosHarnessHost
        delete (window as unknown as { __talosHarnessDestroy?: unknown }).__talosHarnessDestroy
        delete (window as unknown as { __talosHarnessUiRuntime?: unknown }).__talosHarnessUiRuntime
        delete (window as unknown as { __talosHarnessHostBack?: unknown }).__talosHarnessHostBack
        delete (window as unknown as { __talosHarnessHostPermissionChange?: unknown }).__talosHarnessHostPermissionChange
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
        expect(window.fetch).toHaveBeenCalledWith('/harness-ui/index.html?build=dev', { cache: 'no-cache' })
        expect(link?.getAttribute('href')).toBe('/harness-ui/styles.css?build=dev')
        expect(host.shadowRoot?.querySelector('script')?.getAttribute('src')).toBe('/harness-ui/app.js?build=dev')
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

    it('CODE-MOBILE-GUTTER-01 uses the Code surface as the single owner of horizontal gutters', () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        const w = mount(HarnessSessionScreen)
        const body = w.get('[data-testid="mobile-screen-body"]')

        expect(body.classes()).toContain('p-0')
        expect(body.classes()).not.toContain('px-4')
    })

    it('CODE-COMPOSER-SINGLE-SOURCE-01 mounts the exact chat composer instead of a rewritten Code clone', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        const w = mount(HarnessSessionScreen)
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        await resolveScriptLoad(host)

        expect(w.get('[data-testid="talos-mobile-composer"]').exists()).toBe(true)
        const source = await import('@/screens/HarnessSessionScreen.vue?raw')
        expect(source.default).toContain("import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'")
        expect(source.default).not.toContain('useChatController')
    })

    it('CODE-COMPOSER-AUTONOMY-PILL-01 keeps the mockup policy selector beside the model in the shared composer', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        const announceComposerAction = vi.fn(() => true)
        ;(window as unknown as {
            __talosHarnessUiRuntime?: {
                selectSession(): void
                announceComposerAction(action: string): boolean
            }
        }).__talosHarnessUiRuntime = { selectSession: vi.fn(), announceComposerAction }

        const w = mount(HarnessSessionScreen)
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        await resolveScriptLoad(host)

        const composer = w.get('[data-testid="talos-mobile-composer"]')
        await composer.get('textarea').trigger('focus')
        const autonomy = composer.get('[data-testid="talos-code-autonomy-chip"]')
        expect(autonomy.text()).toContain('Workspace write')

        await autonomy.trigger('click')
        expect(announceComposerAction).toHaveBeenCalledWith('permissions')

        ;(window as unknown as {
            __talosHarnessHostPermissionChange?: (permission: string) => void
        }).__talosHarnessHostPermissionChange?.('Full access')
        await flushPromises()
        expect(autonomy.text()).toContain('Full access')
    })

    it('CODE-COMPOSER-DEMO-SEND-01 forwards a local prompt to Code and clears the shared component', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        const submitPrompt = vi.fn(() => true)
        ;(window as unknown as {
            __talosHarnessUiRuntime?: { selectSession(): void, submitPrompt(text: string): boolean }
        }).__talosHarnessUiRuntime = { selectSession: vi.fn(), submitPrompt }
        const w = mount(HarnessSessionScreen)
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        await resolveScriptLoad(host)

        const composer = w.get('[data-testid="talos-mobile-composer"]')
        await composer.get('textarea').setValue('Local Code prompt')
        await composer.get('[data-testid="talos-composer-action"]').trigger('click')

        expect(submitPrompt).toHaveBeenCalledWith('Local Code prompt')
        expect((composer.get('textarea').element as HTMLTextAreaElement).value).toBe('')
    })

    it('CODE-COMPOSER-KEYBOARD-01 compiles the keyboard selector onto the composer instead of body', async () => {
        const source = await import('@/screens/HarnessSessionScreen.vue?raw')
        const { descriptor } = parse(source.default, { filename: 'HarnessSessionScreen.vue' })
        const style = descriptor.styles.find((candidate) => candidate.scoped)
        expect(style).toBeDefined()

        const compiled = compileStyle({
            filename: 'HarnessSessionScreen.vue',
            id: 'data-v-code-keyboard',
            scoped: true,
            source: style?.content ?? '',
        })

        expect(compiled.errors).toHaveLength(0)
        expect(compiled.code).toMatch(/body\.keyboard-open\s+\.talos-code-composer-dock(?:\[[^\]]+\])?\s*\{[^}]*bottom:\s*0/s)
        expect(compiled.code).not.toMatch(/body\.keyboard-open\s*\{[^}]*bottom:\s*0/s)
    })

    it('CODE-COMPOSER-TABLET-RAIL-01 anchors the dock once inside the already-offset tool surface', async () => {
        const source = await import('@/screens/HarnessSessionScreen.vue?raw')
        const { descriptor } = parse(source.default, { filename: 'HarnessSessionScreen.vue' })
        const style = descriptor.styles.find((candidate) => candidate.scoped)
        expect(style).toBeDefined()

        const dockRule = style?.content.match(/\.talos-code-composer-dock\s*\{([^}]*)\}/s)?.[1] ?? ''
        expect(dockRule).toContain('position: absolute')
        expect(dockRule).toContain('left: 0')
        expect(dockRule).not.toContain('--talos-tablet-rail')
    })

    it('CODE-COMPOSER-MAX-WIDTH-01 caps and centers the shared composer when both rails collapse', async () => {
        const source = await import('@/screens/HarnessSessionScreen.vue?raw')
        const { descriptor } = parse(source.default, { filename: 'HarnessSessionScreen.vue' })
        const style = descriptor.styles.find((candidate) => candidate.scoped)
        expect(style).toBeDefined()

        const compiled = compileStyle({
            filename: 'HarnessSessionScreen.vue',
            id: 'data-v-code-composer-width',
            scoped: true,
            source: style?.content ?? '',
        })

        expect(compiled.errors).toHaveLength(0)
        const composerRule = compiled.code.match(/\.talos-code-composer-dock[^}]*\[data-testid="talos-mobile-composer"\][^{]*\{([^}]*)\}/s)?.[1] ?? ''
        expect(composerRule).toContain('width: calc(100% - 1.5rem)')
        expect(composerRule).toContain('max-width: 920px')
        expect(composerRule).toContain('margin-inline: auto')
        expect(composerRule).toContain('box-sizing: border-box')
    })

    it('CODE-COMPOSER-CONTEXT-RAIL-01 stops at the live workspace edge and follows Context collapse', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        let resizeCallback: ResizeObserverCallback | null = null
        vi.stubGlobal('ResizeObserver', class {
            constructor(callback: ResizeObserverCallback) { resizeCallback = callback }
            observe(): void {}
            unobserve(): void {}
            disconnect(): void {}
        })

        const w = mount(HarnessSessionScreen)
        await flushPromises()
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        const dock = w.get('[data-testid="talos-code-composer-dock"]').element as HTMLElement
        const workspace = host.shadowRoot?.querySelector<HTMLElement>('.workspace-shell')
        expect(workspace).not.toBeNull()

        let workspaceRect = fixedRect(0, 860)
        vi.spyOn(host, 'getBoundingClientRect').mockImplementation(() => fixedRect(0, 1200))
        vi.spyOn(workspace as HTMLElement, 'getBoundingClientRect').mockImplementation(() => workspaceRect)
        await resolveScriptLoad(host)

        expect(dock.style.right).toBe('340px')
        expect(dock.style.left).toBe('0px')

        workspaceRect = fixedRect(0, 1200)
        resizeCallback?.([], {} as ResizeObserver)
        await flushPromises()
        expect(dock.style.right).toBe('0px')
    })

    it.each(HARNESS_DEMO_SESSIONS)(
        'HARNESS-ROUTE-SESSION-SYNC-01 forwards route $id to the mounted mockup runtime',
        async (session) => {
            mockState.params = { id: session.id }
            vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
            const selectSession = vi.fn()
            const w = mount(HarnessSessionScreen)
            const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement

            await flushPromises()
            ;(window as unknown as {
                __talosHarnessUiRuntime?: { selectSession(selection: { id: string; title: string }): void }
            }).__talosHarnessUiRuntime = { selectSession }
            host.shadowRoot?.querySelector('script')?.dispatchEvent(new Event('load'))
            await flushPromises()

            expect(selectSession).toHaveBeenCalledWith({ id: session.id, title: session.title })
        },
    )

    it('HARNESS-UNKNOWN-SESSION-01 shows an explicit state without loading the static runtime', async () => {
        mockState.params = { id: 'not-a-demo-session' }
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)

        const w = mount(HarnessSessionScreen)
        await flushPromises()

        expect(w.find('[data-testid="talos-harness-session-unknown"]').exists()).toBe(true)
        expect(w.find('[data-testid="talos-harness-session-host"]').exists()).toBe(false)
        expect(window.fetch).not.toHaveBeenCalled()
    })

    it('HARNESS-UNKNOWN-SESSION-VISUAL-01 offers the TALOS empty-state action back to the list', async () => {
        mockState.params = { id: 'not-a-demo-session' }
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)

        const w = mount(HarnessSessionScreen)
        await w.get('[data-testid="talos-harness-session-unknown-back"]').trigger('click')

        expect(w.get('[data-testid="talos-harness-session-unknown-title"]').text()).not.toBe('')
        expect(w.get('[data-testid="talos-harness-session-unknown-back"]').text()).toBe('Back to Code')
        expect(mockState.routerPush).toHaveBeenCalledWith({ name: 'harness' })
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

    it('HARNESS-PALETTE-BACK-02 registers only an open Code layer in the shared TALOS back stack', () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        let open = true
        const dismissTransientLayers = vi.fn(() => {
            if (!open) return false
            open = false
            return true
        })
        ;(window as unknown as {
            __talosHarnessUiRuntime?: {
                dismissTransientLayers: () => boolean
                transientLayersActive: () => boolean
            }
        }).__talosHarnessUiRuntime = {
            dismissTransientLayers,
            transientLayersActive: () => open,
        }

        const w = mount(HarnessSessionScreen)
        expect(talosOverlayBackActive()).toBe(true)
        expect(handleTalosOverlayBack()).toBe(true)
        expect(dismissTransientLayers).toHaveBeenCalledTimes(1)
        expect(talosOverlayBackActive()).toBe(false)
        w.unmount()
    })

    it('CODE-PHONE-UP-01 exposes one host-owned return to the Code list and removes it on unmount', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        const w = mount(HarnessSessionScreen)
        const host = w.get('[data-testid="talos-harness-session-host"]').element as HTMLElement
        await resolveScriptLoad(host)

        const hostBack = (window as unknown as { __talosHarnessHostBack?: () => void })
            .__talosHarnessHostBack
        expect(hostBack).toBeTypeOf('function')
        hostBack?.()
        expect(mockState.routerPush).toHaveBeenCalledWith({ name: 'harness' })

        w.unmount()
        expect((window as unknown as { __talosHarnessHostBack?: unknown }).__talosHarnessHostBack)
            .toBeUndefined()
    })
})
