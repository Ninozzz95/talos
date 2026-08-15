// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest'
import { parseTalosMobileDesignTokens } from '@talos-mobile/design-tokens'
import { applyTalosMobileDesignTokens } from '@/theme/applyDesignTokens'
import identity from '@/theme/telemetry.identity.json'

const tokens = parseTalosMobileDesignTokens(identity)

describe('talos-shell scope (identical-to-desktop token vocabulary)', () => {
    let el: HTMLElement
    beforeEach(() => {
        el = document.createElement('div')
    })

    it('marks the target with the talos-shell class so --talos-* tokens are in scope', () => {
        applyTalosMobileDesignTokens(tokens, 'dark', el)
        expect(el.classList.contains('talos-shell')).toBe(true)
    })

    it('exposes the theme preset as data-theme-preset (matches the vendored CSS selector)', () => {
        applyTalosMobileDesignTokens(tokens, 'dark', el)
        expect(el.getAttribute('data-theme-preset')).toBe('telemetry')
    })

    it('exposes the resolved mode as data-theme-mode', () => {
        applyTalosMobileDesignTokens(tokens, 'dark', el)
        expect(el.getAttribute('data-theme-mode')).toBe('dark')
        applyTalosMobileDesignTokens(tokens, 'light', el)
        expect(el.getAttribute('data-theme-mode')).toBe('light')
    })
})
