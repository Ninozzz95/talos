// @vitest-environment node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function harnessAsset(name: string): string {
    return readFileSync(resolve(process.cwd(), 'public', 'harness-ui', name), 'utf8')
}

describe('Harness UI static asset contract', () => {
    it('HARNESS-NATIVE-TOP-LAYER-HITTEST-01 keeps embedded dialogs below global navigation', () => {
        const html = harnessAsset('index.html')
        const css = harnessAsset('styles.css')
        const js = harnessAsset('app.js')

        expect(html).toContain('id="harnessDialogBackdrop"')
        expect(css).toContain('.harness-dialog-backdrop')
        expect(js).not.toContain('.showModal(')
        expect(js).toContain('showEmbeddedDialog(commandDialog)')
        expect(js).toContain('showEmbeddedDialog(sheetDialog)')
        expect(html).toContain('id="i-arrow-left"')
        expect(html).toContain('class="embedded-session-back-icon"')
        expect(css).toContain(':host(.talos-embedded) .embedded-session-back-icon')
        expect(js).toContain('__talosHarnessHostBack')
    })

    it('HARNESS-COMMAND-FILTER-01 lets the hidden attribute win over the command button layout', () => {
        const css = harnessAsset('styles.css')

        expect(css).toMatch(/\.command-results\s+button\[hidden\]\s*\{[^}]*display:\s*none\s*!important/s)
    })

    it('HARNESS-NESTED-SCROLL-TRAP-01 contains horizontal diff scroll without trapping vertical transcript gestures', () => {
        const css = harnessAsset('styles.css')

        expect(css).toMatch(/\.inline-diff\s+pre\s*\{[^}]*overscroll-behavior-x:\s*contain/s)
        expect(css).toMatch(/\.inline-diff\s+pre\s*\{[^}]*overscroll-behavior-y:\s*auto/s)
    })

    it('CODE-SINGLE-SAFE-AREA-01 gives the embedded session topbar the one safe area no longer owned by sheet chrome', () => {
        const css = harnessAsset('styles.css')

        expect(css).toMatch(/:host\(\.talos-embedded\)\s+\.topbar\s*\{[^}]*padding-top:\s*env\(safe-area-inset-top\)/s)
    })

    it('HARNESS-DEMO-BADGE-NO-COLLISION-01 keeps demo disclosure in layout flow instead of over content', () => {
        const css = harnessAsset('styles.css')

        expect(css).toMatch(/\.demo-surface-badge\s*\{[^}]*position:\s*static/s)
        expect(css).toMatch(/\.queued-message\s*>\s*\.demo-surface-badge\s*\{[^}]*flex-basis:\s*100%/s)
        expect(css).toMatch(/\.approval-card\s*>\s*\.demo-surface-badge\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s)
    })

    it('CODE-TERMINAL-DEMO-TRUTH-01 never claims that a real PTY is active', () => {
        const html = harnessAsset('index.html')

        expect(html).toContain('pty demo')
        expect(html).not.toContain('pty attiva')
    })

    it('CODE-TOAST-NO-CONTROL-OVERLAP-01 keeps wide-short feedback above the fixed composer', () => {
        const css = harnessAsset('styles.css')

        expect(css).toMatch(/:host\(\.talos-embedded-wide-short\)\s*\{[^}]*--wide-short-composer-h:\s*72px[^}]*--wide-short-run-h:\s*49px[^}]*--wide-short-toast-gap:\s*8px/s)
        expect(css).toMatch(/:host\(\.talos-embedded-wide-short\)\s+\.toast-region\s*\{[^}]*top:\s*calc\(52px \+ env\(safe-area-inset-top\) \+ var\(--wide-short-run-h\) \+ var\(--wide-short-toast-gap\)\)[^}]*bottom:\s*auto[^}]*width:\s*min\(380px,\s*calc\(100vw - 24px\)\)/s)
        expect(css).toMatch(/:host\(\.talos-embedded-wide-short\)\s+\.toast\s*\{[^}]*display:\s*flex[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*overflow:\s*hidden/s)
        expect(css).toMatch(/:host\(\.talos-embedded-wide-short\)\s+\.toast\s+span\s*\{[^}]*min-width:\s*0[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s)
        expect(css).toMatch(/:host\(\.talos-embedded-wide-short\):host-context\(body\.keyboard-open\)\s+\.toast-region\s*\{[^}]*bottom:\s*calc\(var\(--wide-short-composer-h\) \+ var\(--wide-short-toast-gap\)\)/s)
    })

    it('CODE-WIDE-SHORT-SCROLL-01 leaves the end of every non-chat surface above mobile navigation', () => {
        const css = harnessAsset('styles.css')

        expect(css).toMatch(/:host\(\.talos-embedded-wide-short\)\s+\.view-pane:not\(\.chat-view\)\s*\{[^}]*padding-bottom:\s*var\(--mobile-nav-h\)[^}]*scroll-padding-bottom:\s*var\(--mobile-nav-h\)/s)
        expect(css).toMatch(/:host\(\.talos-embedded-wide-short\)\s+\.browser-shell\s*\{[^}]*padding-bottom:\s*0/s)
    })

})
