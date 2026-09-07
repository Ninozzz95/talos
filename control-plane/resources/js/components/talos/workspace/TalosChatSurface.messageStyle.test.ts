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
        expect(source).toMatch(/\.talos-message-bubble\.talos-message-section\s*\{[^}]*max-width:\s*none;/s)
    })

    it('keeps the assistant bubble surface for the bubbles fallback', () => {
        // The non-sections branch keeps the current bubble (bg + border).
        expect(source).toMatch(/bg-\[var\(--talos-assistant\)\]/)
    })

    it('carries the canonical numeric message scale through rendered message diagnostics', () => {
        expect(source).toContain('messageScale: number')
        expect(source).toContain(':data-message-scale="messageScale"')
        expect(source).not.toContain('TalosChatBubbleScale')
        expect(source).not.toContain('data-bubble-scale')
    })

    it('collapses long user messages behind an Expand/Reduce control without truncating', () => {
        expect(source).toContain('function userMessageIsLong(message')
        expect(source).toContain('function userMessageCollapsed(message')
        expect(source).toContain('toggleUserMessageExpanded')
        expect(source).toContain('data-testid="talos-user-message-toggle"')
        expect(source).toMatch(/userMessageCollapsed\(message\) \? 'Expand' : 'Reduce'/)
    })

    it('uses a semantic contrast-safe color for message metadata without composited opacity', () => {
        expect(source).toContain('talos-message-meta mt-1 flex max-w-full flex-wrap items-center gap-2 px-1 text-[var(--talos-muted)]')
        expect(source).not.toContain('talos-message-meta mt-1 flex max-w-full flex-wrap items-center gap-2 px-1 opacity-80')
    })
})
