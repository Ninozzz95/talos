// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function asset(name: string): string {
    return readFileSync(resolve(process.cwd(), 'public', 'harness-ui', name), 'utf8')
}

function mountStaticRuntime(): void {
    const parsed = new DOMParser().parseFromString(asset('index.html'), 'text/html')
    parsed.querySelectorAll('script').forEach((script) => script.remove())
    document.body.replaceChildren(...Array.from(parsed.body.childNodes))
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
        document.body.replaceChildren()
        document.body.className = ''
        document.documentElement.className = ''
    })

    it('HARNESS-EMBEDDED-HEIGHT-01 sizes the embedded app and workspace from their real host', () => {
        const css = asset('styles.css')

        expect(css).toMatch(/:host\(\.talos-embedded\)\s+\.app-shell\s*\{[^}]*height:\s*100%/s)
        expect(css).toMatch(/:host\(\.talos-embedded\)\s+\.workspace-shell\s*\{[^}]*height:\s*100%/s)
    })

    it('HARNESS-EMBEDDED-SAFE-AREA-01 does not consume the outer shell safe area twice', () => {
        const css = asset('styles.css')

        expect(css).toMatch(/:host\(\.talos-embedded\)\s+\.topbar\s*\{[^}]*padding-top:\s*0/s)
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

    it('HARNESS-COMPOSER-AFTER-SCROLL-01 scrolls the transcript without moving the composer', () => {
        const css = asset('styles.css')

        expect(css).toMatch(/\.chat-view\s*\{[^}]*overflow:\s*hidden/s)
        expect(css).toMatch(/\.chat-view\s+\.conversation\s*\{[^}]*height:\s*100%[^}]*overflow-y:\s*auto/s)
    })
})
