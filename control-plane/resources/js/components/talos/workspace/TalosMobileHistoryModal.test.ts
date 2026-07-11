import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./TalosLeftRail.vue', import.meta.url), 'utf8')

describe('TalosLeftRail mobile chat history modal', () => {
    it('declares a modal dialog with focus management and background isolation', () => {
        expect(source).toContain(":role=\"mobileOpen ? 'dialog' : undefined\"")
        expect(source).toContain(":aria-modal=\"mobileOpen ? 'true' : undefined\"")
        expect(source).toContain('data-testid="talos-mobile-history-dialog"')
        expect(source).toContain('focusableElements')
        expect(source).toContain("event.key !== 'Tab'")
        expect(source).toContain("event.key === 'Escape'")
        expect(source).toContain("background.setAttribute('inert', '')")
        expect(source).toContain('returnFocusTarget.focus()')
    })
})
