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

    it('CODE-THEME-ALIASES-01 adapts every semantic surface to the canonical TALOS token vocabulary', () => {
        const css = harnessAsset('styles.css')

        expect(css).toMatch(/:root,\s*:host\s*\{/)
        expect(css).toMatch(/--bg:\s*var\(--talos-background,\s*#1e1f22\)/)
        expect(css).toMatch(/--surface:\s*var\(--talos-panel,\s*#25262a\)/)
        expect(css).toMatch(/--text:\s*var\(--talos-text,\s*#f3f0e9\)/)
        expect(css).toMatch(/--muted:\s*var\(--talos-muted,\s*#9c9da2\)/)
        expect(css).toMatch(/--line:\s*var\(--talos-border,\s*#36373b\)/)
        expect(css).toMatch(/--accent:\s*var\(--talos-accent,\s*#c08b3c\)/)
        expect(css).toMatch(/--success:\s*var\(--talos-success,\s*#77a884\)/)
        expect(css).toMatch(/--danger:\s*var\(--talos-danger,\s*#d87d72\)/)
        expect(css).toMatch(/--font-ui:\s*var\(--talos-font-ui,/)
        expect(css).toMatch(/--font-mono:\s*var\(--talos-font-mono,/)
    })

    it('CODE-THEME-CHROME-01 keeps fixed Calm colors inside the standalone fallback adapter only', () => {
        const css = harnessAsset('styles.css')
        const withoutHostAdapter = css.replace(/:host\s*\{[^}]*\}/s, '')

        expect(withoutHostAdapter).not.toMatch(/#(?:1e1f22|17181b|25262a|2b2c30|313237|34353a|f3f0e9|d6d2ca|9c9da2|777980|36373b|4a4b50|c08b3c|d7a554|77a884|d87d72|7f9fc4|d8a650)\b/i)
        expect(withoutHostAdapter).not.toMatch(/rgba?\(192\s*,\s*139\s*,\s*60/i)
        expect(withoutHostAdapter).not.toMatch(/rgba?\(255\s*,\s*255\s*,\s*255/i)
    })

    it('CODE-THEME-COPY-TRUTH-01 never labels a live TALOS theme as Calm', () => {
        const html = harnessAsset('index.html')
        const js = harnessAsset('app.js')

        expect(html).not.toMatch(/\bCalm\b/)
        expect(js).not.toMatch(/Standard Calm/)
        expect(html).toContain('Tema TALOS')
        expect(html).toContain('Token colore')
    })

    it('CODE-BG-CONTINUITY-01 reveals the one TALOS scene only in embedded mode', () => {
        const css = harnessAsset('styles.css')

        expect(css).toMatch(/:host\(\.talos-embedded\)\s*\{[^}]*background:\s*transparent/s)
        expect(css).toMatch(/:host\(\.talos-embedded\)\s+\.app-shell\s*\{[^}]*background:\s*transparent/s)
        expect(css).toMatch(/:root,\s*:host\s*\{[^}]*background:\s*var\(--bg\)/s)
        expect(css.match(/TalosMobileBackground/g) ?? []).toHaveLength(0)
    })

    it('CODE-MOBILE-SCROLLBAR-HIDDEN-01 removes every embedded scrollbar and its gutter without disabling scroll', () => {
        const css = harnessAsset('styles.css')

        expect(css).not.toMatch(/\.view-pane\s*,[^}]*scrollbar-gutter:\s*stable/s)
        expect(css).toMatch(/\.chat-view\s+\.conversation\s*\{[^}]*scrollbar-gutter:\s*stable/s)
        expect(css).toMatch(/:host\(\.talos-embedded\)\s+\*\s*\{[^}]*scrollbar-width:\s*none[^}]*scrollbar-gutter:\s*auto/s)
        expect(css).toMatch(/:host\(\.talos-embedded\)\s+\*::\-webkit-scrollbar\s*\{[^}]*display:\s*none[^}]*width:\s*0[^}]*height:\s*0/s)
        expect(css).toMatch(/\.chat-view\s+\.conversation\s*\{[^}]*overflow-y:\s*auto/s)
    })

    it('CODE-CONTENT-INSET-SYMMETRY-01 keeps the embedded mobile content 12px from both edges', () => {
        const css = harnessAsset('styles.css')

        expect(css).toMatch(/@media\s*\(max-width:\s*780px\)[\s\S]*?\.conversation\s*\{[^}]*width:\s*auto[^}]*margin:\s*0\s+12px/s)
        expect(css).toMatch(/:host\(\.talos-embedded-wide-short\)\s+\.conversation\s*\{[^}]*margin:\s*0\s+12px/s)
    })

    it('CODE-TOPBAR-MOTION-01 collapses the embedded session header with TALOS motion tokens', () => {
        const css = harnessAsset('styles.css')

        expect(css).toMatch(/:host\(\.talos-embedded\)\s+\.topbar\s*\{[^}]*transition:[^}]*var\(--motion-disclosure\)[^}]*var\(--motion-ease\)/s)
        expect(css).toMatch(/:host\(\.talos-embedded\)\s+\.topbar\.is-scroll-hidden\s*\{[^}]*min-height:\s*env\(safe-area-inset-top\)[^}]*max-height:\s*env\(safe-area-inset-top\)[^}]*opacity:\s*0[^}]*pointer-events:\s*none/s)
    })

    it('CODE-MOTION-TOKENS-01 adapts motion to the canonical TALOS interaction contract', () => {
        const css = harnessAsset('styles.css')

        for (const token of [
            'surface-enter', 'surface-exit', 'disclosure', 'popover',
            'tab-change', 'composer-expand', 'composer-collapse',
            'message-insert', 'activity-progress', 'success-confirm',
        ]) expect(css).toContain(`var(--talos-motion-duration-${token},`)
        expect(css).toContain('var(--talos-motion-ease,')
        expect(css).toContain('var(--talos-motion-ease-exit,')
        expect(css).not.toMatch(/(?:transition|animation)[^;{}]*(?:\.14s|\.16s|\.18s|\.22s|\.24s|1\.2s|1\.1s)/)
    })

    it('CODE-MOTION-SURFACES-01 assigns canonical motion to every interactive surface family', () => {
        const css = harnessAsset('styles.css')

        for (const selector of [
            '.view-pane.motion-enter', '.sessions-panel', '.inspector-panel',
            '.overlay-backdrop', '.command-dialog', '.sheet-dialog', '.toast',
            '.harness-dialog-backdrop.motion-enter',
            '.message.motion-enter', '.tool-inline-detail', '.queued-message',
            '.approval-card.motion-exit', '.composer', '.mobile-nav',
            '.campaign-run-detail', '.inspector-section.motion-enter',
        ]) expect(css).toContain(selector)
    })

    it('CODE-MOTION-EXIT-01 keeps disappearing nodes alive through a cancellable exit animation', () => {
        const js = harnessAsset('app.js')

        expect(js).toContain('function animateExit(')
        expect(js).toContain('motionAnimations.add(animation)')
        expect(js).toContain('animation.finished.then(finish, finish)')
        expect(js).toContain('function cancelMotionAnimations()')
        expect(js).toContain('cancelMotionAnimations();')
    })

    it('CODE-MOTION-REDUCED-01 settles synchronously when TALOS resolves motion to zero', () => {
        const js = harnessAsset('app.js')
        const css = harnessAsset('styles.css')

        expect(js).toMatch(/if\s*\(duration\s*<=\s*0\s*\|\|\s*typeof\s+element\.animate\s*!==\s*'function'\)/)
        expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
        expect(css).toContain(':host-context(body.reduce-motion)')
    })

    it('CODE-COMPOSER-SINGLE-SOURCE-01 removes the static clone only from the embedded accessibility tree', () => {
        const css = harnessAsset('styles.css')

        expect(css).toMatch(/:host\(\.talos-embedded\)\s+\.composer-wrap\s*\{[^}]*display:\s*none/s)
        expect(css).not.toMatch(/:root\s+\.composer-wrap\s*\{[^}]*display:\s*none/s)
    })

    it('CODE-COMPOSER-CLEARANCE-01 lets the real expanding composer own transcript clearance', () => {
        const css = harnessAsset('styles.css')

        expect(css).toMatch(/:host\(\.talos-embedded\)\s+\.conversation\s*\{[^}]*padding-bottom:\s*var\(--talos-code-composer-clearance/s)
        expect(css).toMatch(/:host\(\.talos-embedded\)\s+\.conversation\s*\{[^}]*scroll-padding-bottom:\s*var\(--talos-code-composer-clearance/s)
    })

})
