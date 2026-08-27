// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function asset(name: string): string {
    return readFileSync(resolve(process.cwd(), 'public', 'harness-ui', name), 'utf8')
}

const originalElementAnimate = Element.prototype.animate

function mountStaticRuntime(): void {
    const parsed = new DOMParser().parseFromString(asset('index.html'), 'text/html')
    parsed.querySelectorAll('script').forEach((script) => script.remove())
    document.body.replaceChildren(...Array.from(parsed.body.childNodes))
    document.querySelectorAll<HTMLDialogElement>('dialog').forEach((dialog) => {
        dialog.show ??= () => { dialog.setAttribute('open', '') }
        dialog.close ??= () => { dialog.removeAttribute('open') }
    })
    ;(window as unknown as { __talosHarnessRoot?: ParentNode }).__talosHarnessRoot = document
    ;(window as unknown as { __talosHarnessHost?: HTMLElement }).__talosHarnessHost = document.documentElement
    window.eval(asset('app.js'))
}

describe('Harness UI embedded host and keyboard runtime', () => {
    beforeEach(() => {
        document.body.className = ''
    })

    afterEach(() => {
        ;(window as unknown as { __talosHarnessDestroy?: () => void }).__talosHarnessDestroy?.()
        delete (window as unknown as { __talosHarnessRoot?: unknown }).__talosHarnessRoot
        delete (window as unknown as { __talosHarnessHost?: unknown }).__talosHarnessHost
        delete (window as unknown as { __talosHarnessUiRuntime?: unknown }).__talosHarnessUiRuntime
        delete (window as unknown as { __talosHarnessHostPermissionChange?: unknown }).__talosHarnessHostPermissionChange
        document.body.replaceChildren()
        document.body.className = ''
        document.documentElement.className = ''
        document.documentElement.style.removeProperty('--talos-motion-duration-surface-exit')
        Object.defineProperty(Element.prototype, 'animate', {
            configurable: true,
            value: originalElementAnimate,
        })
        vi.unstubAllGlobals()
    })

    it('HARNESS-EMBEDDED-HEIGHT-01 sizes the embedded app and workspace from their real host', () => {
        const css = asset('styles.css')

        expect(css).toMatch(/:host\(\.talos-embedded\)\s+\.app-shell\s*\{[^}]*height:\s*100%/s)
        expect(css).toMatch(/:host\(\.talos-embedded\)\s+\.workspace-shell\s*\{[^}]*height:\s*100%/s)
    })

    it('CODE-SINGLE-SAFE-AREA-02 lets the session-first topbar own the safe area after outer chrome is removed', () => {
        const css = asset('styles.css')

        expect(css).toMatch(/:host\(\.talos-embedded\)\s+\.topbar\s*\{[^}]*padding-top:\s*env\(safe-area-inset-top\)/s)
    })

    it.each([
        ['portrait', 392, 872],
        ['landscape', 872, 392],
    ])('HARNESS-KEYBOARD-%s-01 keeps native keyboard state across viewport resize', (_name, width, height) => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
        mountStaticRuntime()

        const composer = document.querySelector<HTMLTextAreaElement>('#composerInput')
        const runtime = (window as unknown as {
            __talosHarnessUiRuntime?: { setKeyboardOpen?(open: boolean): void }
        }).__talosHarnessUiRuntime
        expect(runtime?.setKeyboardOpen).toBeTypeOf('function')

        composer?.focus()
        runtime?.setKeyboardOpen?.(true)
        window.dispatchEvent(new Event('resize'))
        expect(document.body.classList.contains('keyboard-open')).toBe(true)

        runtime?.setKeyboardOpen?.(false)
        expect(document.body.classList.contains('keyboard-open')).toBe(false)
        expect(document.activeElement).not.toBe(composer)
    })

    it('HARNESS-BOTTOM-NAV-END-01 clears keyboard state when the embedded runtime is destroyed', () => {
        mountStaticRuntime()
        const runtime = (window as unknown as {
            __talosHarnessUiRuntime?: { setKeyboardOpen?(open: boolean): void }
        }).__talosHarnessUiRuntime

        expect(runtime?.setKeyboardOpen).toBeTypeOf('function')
        runtime?.setKeyboardOpen?.(true)
        ;(window as unknown as { __talosHarnessDestroy?: () => void }).__talosHarnessDestroy?.()

        expect(document.body.classList.contains('keyboard-open')).toBe(false)
    })

    it('HARNESS-WIDE-SHORT-HOST-01 derives compact landscape from the real embedded host', () => {
        let height = 297
        document.documentElement.classList.add('talos-embedded')
        vi.spyOn(document.documentElement, 'getBoundingClientRect').mockImplementation(() => ({
            width: 872,
            height,
            top: 0,
            right: 872,
            bottom: height,
            left: 0,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        }))

        mountStaticRuntime()
        expect(document.documentElement.classList.contains('talos-embedded-wide-short')).toBe(true)

        height = 700
        window.dispatchEvent(new Event('resize'))
        expect(document.documentElement.classList.contains('talos-embedded-wide-short')).toBe(false)
    })

    it('HARNESS-COMPOSER-BOTTOM-01 gives wide-short a visible nav and compact keyboard composer', () => {
        const css = asset('styles.css')

        expect(css).toMatch(/:host\(\.talos-embedded-wide-short\)\s+\.mobile-nav\s*\{[^}]*display:\s*grid/s)
        expect(css).toMatch(/:host\(\.talos-embedded-wide-short\):host-context\(body\.keyboard-open\)\s+\.composer-wrap\s*\{[^}]*bottom:\s*0/s)
    })

    it('CODE-PALETTE-LANDSCAPE-01 keeps the command dialog inside the short embedded host', () => {
        const css = asset('styles.css')

        expect(css).toMatch(
            /:host\(\.talos-embedded-wide-short\)\s+\.command-dialog\s*\{[^}]*margin-top:\s*8px[^}]*max-height:\s*calc\(100dvh\s*-\s*40px\)/s,
        )
        expect(css).toMatch(
            /:host\(\.talos-embedded-wide-short\)\s+\.command-results\s*\{[^}]*max-height:\s*calc\(100dvh\s*-\s*140px\)/s,
        )
    })

    it('CODE-TOAST-WIDE-SHORT-01 keeps action feedback below the run strip and clear of controls', () => {
        const css = asset('styles.css')

        expect(css).toMatch(
            /:host\(\.talos-embedded-wide-short\)\s+\.toast-region\s*\{[^}]*top:\s*calc\(52px\s*\+\s*env\(safe-area-inset-top\)\s*\+\s*var\(--wide-short-run-h\)\s*\+\s*var\(--wide-short-toast-gap\)\)[^}]*right:\s*8px[^}]*bottom:\s*auto/s,
        )
    })

    it('CODE-REVIEW-WIDE-SHORT-01 does not add a desktop-sized empty tail after a short diff', () => {
        const css = asset('styles.css')

        expect(css).toMatch(
            /:host\(\.talos-embedded-wide-short\)\s+\.diff-panel\s+pre\s*\{[^}]*min-height:\s*min\(180px,\s*calc\(100dvh\s*-\s*180px\)\)/s,
        )
    })

    it('CODE-SETTINGS-REACHABLE-01 reaches Code settings through the existing control sheet', () => {
        mountStaticRuntime()

        document.querySelector<HTMLButtonElement>('[data-command="control"]')?.click()
        const sheet = document.querySelector<HTMLDialogElement>('#sheetDialog')
        const settings = sheet?.querySelector<HTMLButtonElement>('[data-control-action="settings"]')

        expect(sheet?.open).toBe(true)
        expect(settings?.textContent).toContain('Impostazioni Codice')

        settings?.click()

        expect(sheet?.open).toBe(false)
        expect(document.querySelector('[data-view="settings"]')?.classList.contains('active')).toBe(true)
    })

    it('CODE-COMPOSER-AUTONOMY-SHEET-01 opens the original policy sheet and reports its selection to Vue', () => {
        const permissionChanged = vi.fn()
        ;(window as unknown as {
            __talosHarnessHostPermissionChange?: (permission: string) => void
        }).__talosHarnessHostPermissionChange = permissionChanged
        mountStaticRuntime()
        const runtime = (window as unknown as {
            __talosHarnessUiRuntime?: { announceComposerAction?(action: string): boolean }
        }).__talosHarnessUiRuntime

        expect(runtime?.announceComposerAction?.('permissions')).toBe(true)
        const sheet = document.querySelector<HTMLDialogElement>('#sheetDialog')
        expect(sheet?.open).toBe(true)
        const fullAccess = [...(sheet?.querySelectorAll<HTMLButtonElement>('[data-permission-choice]') ?? [])]
            .find((button) => button.dataset.permissionChoice === 'Full access')
        expect(fullAccess).toBeDefined()

        fullAccess?.click()
        expect(permissionChanged).toHaveBeenCalledWith('Full access')
        expect(sheet?.open).toBe(false)
    })

    it('CODE-MODE-STATE-TRUTH-01 never leaves Chat selected while another surface is visible', () => {
        mountStaticRuntime()

        document.querySelector<HTMLElement>('#commandPaletteBtn')?.click()
        document.querySelector<HTMLButtonElement>('[data-command="browser"]')?.click()

        expect(document.querySelector('[data-view="browser"]')?.classList.contains('active')).toBe(true)
        expect([...document.querySelectorAll('.mode-tab')].every((tab) => !tab.classList.contains('active'))).toBe(true)
        expect([...document.querySelectorAll('.mode-tab')].every((tab) => tab.getAttribute('aria-pressed') === 'false')).toBe(true)

        document.querySelector<HTMLButtonElement>('[data-mode="chat"]')?.click()

        expect(document.querySelector('[data-view="chat"]')?.classList.contains('active')).toBe(true)
        expect(document.querySelector('[data-mode="chat"]')?.classList.contains('active')).toBe(true)
        expect(document.querySelector('[data-mode="chat"]')?.getAttribute('aria-pressed')).toBe('true')
    })

    it('HARNESS-COMPOSER-AFTER-SCROLL-01 scrolls the transcript without moving the composer', () => {
        const css = asset('styles.css')

        expect(css).toMatch(/\.chat-view\s*\{[^}]*overflow:\s*hidden/s)
        expect(css).toMatch(/\.chat-view\s+\.conversation\s*\{[^}]*height:\s*100%[^}]*overflow-y:\s*auto/s)
    })

    it('CODE-TOPBAR-ENTER-ALWAYS-01 hides on downward content scroll, returns upward and detaches on destroy', () => {
        document.documentElement.classList.add('talos-embedded')
        mountStaticRuntime()
        const conversation = document.querySelector<HTMLElement>('.conversation')
        const topbar = document.querySelector<HTMLElement>('.topbar')
        expect(conversation).not.toBeNull()
        expect(topbar).not.toBeNull()

        if (!conversation || !topbar) return
        conversation.scrollTop = 48
        conversation.dispatchEvent(new Event('scroll'))
        expect(topbar.classList.contains('is-scroll-hidden')).toBe(true)

        conversation.scrollTop = 36
        conversation.dispatchEvent(new Event('scroll'))
        expect(topbar.classList.contains('is-scroll-hidden')).toBe(false)

        conversation.scrollTop = 64
        conversation.dispatchEvent(new Event('scroll'))
        expect(topbar.classList.contains('is-scroll-hidden')).toBe(true)
        document.querySelector<HTMLButtonElement>('[data-mobile-view="browser"]')?.click()
        expect(topbar.classList.contains('is-scroll-hidden')).toBe(false)

        ;(window as unknown as { __talosHarnessDestroy?: () => void }).__talosHarnessDestroy?.()
        conversation.scrollTop = 96
        conversation.dispatchEvent(new Event('scroll'))
        expect(topbar.classList.contains('is-scroll-hidden')).toBe(false)
    })

    it('CODE-TOPBAR-NO-FLAP-01 ignores the layout clamp at the new bottom but still returns on a real upward scroll', () => {
        document.documentElement.classList.add('talos-embedded')
        mountStaticRuntime()
        const conversation = document.querySelector<HTMLElement>('.conversation')
        const topbar = document.querySelector<HTMLElement>('.topbar')
        expect(conversation).not.toBeNull()
        expect(topbar).not.toBeNull()

        if (!conversation || !topbar) return
        Object.defineProperties(conversation, {
            scrollHeight: { configurable: true, value: 1_000 },
            clientHeight: { configurable: true, value: 300 },
        })

        conversation.scrollTop = 650
        conversation.dispatchEvent(new Event('scroll'))
        expect(topbar.classList.contains('is-scroll-hidden')).toBe(true)

        // Collapsing the topbar gives the transcript 64px more room. Near the
        // end, the browser clamps scrollTop to the new maximum (636): that
        // negative delta is layout feedback, not a finger reversing direction.
        Object.defineProperty(conversation, 'clientHeight', { configurable: true, value: 364 })
        conversation.scrollTop = 636
        conversation.dispatchEvent(new Event('scroll'))
        expect(topbar.classList.contains('is-scroll-hidden')).toBe(true)

        // A real upward gesture leaves the maximum instead, so the header must
        // return immediately and exactly once.
        conversation.scrollTop = 600
        conversation.dispatchEvent(new Event('scroll'))
        expect(topbar.classList.contains('is-scroll-hidden')).toBe(false)
    })

    it.each([
        ['refactor-auth-flow', 'Refactor auth flow'],
        ['audit-api-permissions', 'Audit API permissions'],
        ['fix-mobile-composer', 'Fix mobile composer'],
        ['prepare-release-notes', 'Prepare release notes'],
        ['investigate-flaky-tests', 'Investigate flaky tests'],
    ])('HARNESS-ROUTE-SESSION-SYNC-01 selects %s through the public runtime', (id, title) => {
        mountStaticRuntime()
        const runtime = (window as unknown as {
            __talosHarnessUiRuntime?: { selectSession?(selection: { id: string; title: string }): void }
        }).__talosHarnessUiRuntime

        expect(runtime?.selectSession).toBeTypeOf('function')
        runtime?.selectSession?.({ id, title })

        expect(document.querySelector('#sessionTitle')?.textContent).toBe(title)
        expect(document.querySelector('.session-item.active')?.getAttribute('data-session-id')).toBe(id)
        const synchronizedLabels = [...document.querySelectorAll('[data-current-session-title]')]
        expect(synchronizedLabels.length).toBeGreaterThan(0)
        expect(synchronizedLabels.every((label) => label.textContent === title)).toBe(true)
    })

    it('CODE-PRODUCT-NAME-01 renders every visible static product reference as Codice', () => {
        const parsed = new DOMParser().parseFromString(asset('index.html'), 'text/html')
        mountStaticRuntime()

        expect(parsed.title).toContain('Codice')
        expect(document.body.textContent).not.toMatch(/Harness/i)
        expect(document.querySelector('[aria-label*="Harness" i]')).toBeNull()
    })

    it('HARNESS-PALETTE-BACK-01 consumes only the Back that actually closes a transient layer', () => {
        mountStaticRuntime()
        const runtime = (window as unknown as {
            __talosHarnessUiRuntime?: { dismissTransientLayers?(): boolean }
        }).__talosHarnessUiRuntime

        document.querySelector<HTMLElement>('#commandPaletteBtn')?.click()
        expect(document.querySelector<HTMLDialogElement>('#commandDialog')?.open).toBe(true)
        expect(runtime?.dismissTransientLayers?.()).toBe(true)
        expect(document.querySelector<HTMLDialogElement>('#commandDialog')?.open).toBe(false)
        expect(runtime?.dismissTransientLayers?.()).toBe(false)
    })

    it('HARNESS-MIC-HONEST-01 answers the microphone control without pretending to record', () => {
        mountStaticRuntime()
        const microphone = document.querySelector<HTMLButtonElement>('.composer-mic')

        microphone?.click()

        expect(microphone?.getAttribute('aria-pressed')).not.toBe('true')
        expect(document.querySelector('#toastRegion')?.textContent).toContain('Voce demo non collegata')
    })

    it('CODE-MOTION-EXIT-01 removes approval feedback only after its exit animation finishes', async () => {
        let finishAnimation: (() => void) | undefined
        const cancel = vi.fn()
        const animate = vi.fn(() => ({
            cancel,
            finished: new Promise<void>((resolve) => { finishAnimation = resolve }),
        }))
        Object.defineProperty(Element.prototype, 'animate', {
            configurable: true,
            value: animate,
        })
        document.documentElement.style.setProperty('--talos-motion-duration-surface-exit', '120ms')
        mountStaticRuntime()

        const deny = document.querySelector<HTMLButtonElement>('[data-deny]')
        const card = deny?.closest('.approval-card')
        deny?.click()

        expect(animate).toHaveBeenCalled()
        expect(card?.isConnected).toBe(true)
        finishAnimation?.()
        await Promise.resolve()
        await Promise.resolve()
        expect(card?.isConnected).toBe(false)
    })

    it('CODE-MOTION-REDUCED-01 removes immediately when the app motion token is zero', () => {
        const animate = vi.fn()
        Object.defineProperty(Element.prototype, 'animate', {
            configurable: true,
            value: animate,
        })
        document.documentElement.style.setProperty('--talos-motion-duration-surface-exit', '0ms')
        mountStaticRuntime()

        const deny = document.querySelector<HTMLButtonElement>('[data-deny]')
        const card = deny?.closest('.approval-card')
        deny?.click()

        expect(animate).not.toHaveBeenCalled()
        expect(card?.isConnected).toBe(false)
    })

    it('CODE-COMPOSER-DEMO-SEND-01 accepts the shared Vue composer through the runtime without a network request', () => {
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        mountStaticRuntime()
        const runtime = (window as unknown as {
            __talosHarnessUiRuntime?: { submitPrompt?(text: string): boolean }
        }).__talosHarnessUiRuntime

        expect(runtime?.submitPrompt?.('Prompt from the real composer')).toBe(true)
        const userMessages = document.querySelectorAll('.user-message')
        expect(userMessages.item(userMessages.length - 1).textContent)
            .toContain('Prompt from the real composer')
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('CODE-COMPOSER-DEMO-SEND-01 "!"/"!!" switch to the terminal view and, without an active real session, refuse honestly instead of faking success', () => {
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        mountStaticRuntime()
        const runtime = (window as unknown as {
            __talosHarnessUiRuntime?: { submitPrompt?(text: string): boolean }
        }).__talosHarnessUiRuntime

        expect(runtime?.submitPrompt?.('!! pwd')).toBe(true)
        expect(document.querySelector('[data-view="terminal"]')?.classList.contains('active')).toBe(true)
        expect(document.querySelector('#toastRegion')?.textContent).toContain('Nessuna sessione reale attiva')
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('HARNESS-BOARD-MOBILE-HONESTY-01 never calls a local backend from the embedded mobile demo', async () => {
        document.documentElement.classList.add('talos-embedded')
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        mountStaticRuntime()

        document.querySelector<HTMLElement>('[data-mode="dashboard"]')?.click()
        await Promise.resolve()

        expect(fetchMock).not.toHaveBeenCalled()
        expect(document.querySelector('[data-connection-state]')?.textContent).toBe('Demo UI · non collegato')
        expect(document.querySelector('#campaignReadMeta')?.textContent).toContain('backend mobile')
    })

    it('HARNESS-ALL-CONTROLS-01 leaves no decorative or inert element exposed as an enabled button', () => {
        mountStaticRuntime()
        const handled = [
            '[type="submit"]', '[data-close-panel]', '[data-open-view]', '[data-open-panel]',
            '[data-open-sheet]', '[data-mode]', '[data-mobile-view]', '[data-message-action]',
            '[data-copy-message]', '[data-collapse-target]', '[data-tool-detail]', '[data-browser-action]',
            '[data-automation-action]', '[data-review-action]', '[data-review-file]', '[data-session-action]',
            '[data-control-action]', '[data-command]', '[data-approve]', '[data-allow-session]', '[data-deny]',
            '[data-action]', '[data-demo-action]', '[data-file-entry]', '[role="tab"]', '.session-item',
            '#overlayBackdrop', '#newSessionBtn', '#sessionsCollapseBtn', '#sessionTitleButton',
            '#runStateToggle', '.stop-run', '#commandPaletteBtn', '#capabilityBtn', '#manageCapabilitiesBtn',
            '#closeSheet', '#closeCommand', '#cancelQueued', '.composer-mic', '#queueToggle',
            '#approveAllDiffs', '#harnessDialogBackdrop',
        ].join(',')
        const inert = [...document.querySelectorAll<HTMLButtonElement>('button:not([disabled])')]
            .filter((button) => !button.matches(handled))
            .map((button) => button.textContent?.trim().replace(/\s+/g, ' ') || button.getAttribute('aria-label'))

        expect(inert).toEqual([])
    })
})
