import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./TalosChatSurface.vue', import.meta.url), 'utf8')

describe('TalosChatSurface message style (sections vs bubbles)', () => {
    it('accepts a messageStyle preference defaulting to sections', () => {
        expect(source).toMatch(/messageStyle\?:\s*TalosMessageStyle/)
        expect(source).toMatch(/messageStyle:\s*'sections'/)
    })

    it('renders assistant answers as full-width sections when the preference is sections', () => {
        expect(source).toContain('function messageSurfaceClass(message')
        expect(source).toMatch(/props\.messageStyle === 'sections'/)
        expect(source).toContain('talos-message-section')
        expect(source).toContain(':class="messageSurfaceClass(message)"')
        expect(source).toContain(':data-message-style="messageStyle"')
    })

    it('keeps the assistant bubble surface for the bubbles fallback', () => {
        // The non-sections branch keeps the current bubble (bg + border).
        expect(source).toMatch(/bg-\[var\(--talos-assistant\)\]/)
    })

    it('collapses long user messages behind an Expand/Reduce control without truncating', () => {
        expect(source).toContain('function userMessageIsLong(message')
        expect(source).toContain('function userMessageCollapsed(message')
        expect(source).toContain('toggleUserMessageExpanded')
        expect(source).toContain('data-testid="talos-user-message-toggle"')
        expect(source).toMatch(/userMessageCollapsed\(message\) \? 'Expand' : 'Reduce'/)
    })
})
