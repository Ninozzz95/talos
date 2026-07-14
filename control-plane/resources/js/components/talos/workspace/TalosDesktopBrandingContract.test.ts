import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

describe('TALOS desktop branding contract', () => {
    it('uses dedicated desktop treatments for the rail and empty-chat brand marks', () => {
        const rail = source('./TalosLeftRail.vue')
        const chat = source('./TalosChatSurface.vue')
        const css = source('../../../../css/app.css')

        expect(rail).toContain('talos-rail-brand-logo')
        expect(chat).toContain('talos-chat-empty-brand')
        expect(chat).toContain('talos-chat-brand-logo')
        expect(css).toMatch(/@media \(min-width: 1024px\)[\s\S]*?\.talos-rail-brand-logo\s*\{[\s\S]*?width:\s*3\.1rem;[\s\S]*?height:\s*3\.1rem;[\s\S]*?color:\s*color-mix\(in srgb, var\(--talos-accent\) 70%, var\(--talos-text\)\);/)
        expect(css).toMatch(/@media \(min-width: 1024px\)[\s\S]*?\.talos-chat-empty-brand\s*\{[\s\S]*?gap:\s*0\.125rem;/)
        expect(css).toMatch(/@media \(min-width: 1024px\)[\s\S]*?\.talos-chat-brand-logo\s*\{[\s\S]*?width:\s*5\.5rem;[\s\S]*?height:\s*5\.5rem;/)
    })
})
