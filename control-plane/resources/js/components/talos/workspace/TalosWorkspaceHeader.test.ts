import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const headerSource = readFileSync(new URL('./TalosWorkspaceHeader.vue', import.meta.url), 'utf8')
const workspaceSource = readFileSync(new URL('./TalosWorkspace.vue', import.meta.url), 'utf8')

describe('TalosWorkspaceHeader', () => {
    it('keeps the header operational without duplicating TALOS branding', () => {
        expect(headerSource).toContain('data-testid="talos-workspace-header"')
        expect(headerSource).toContain('justify-between')
        expect(headerSource).toContain('aria-label="Open navigation menu"')
        expect(headerSource).toMatch(/class="lg:hidden"[\s\S]{0,120}aria-label="Open navigation menu"/)
        expect(headerSource).not.toContain('talos-header-brand')
        expect(headerSource).not.toContain('talos-short-logo')
        expect(headerSource).not.toContain('workspaceSubtitle')
        expect(headerSource).not.toMatch(/>TALOS<\/h1>/)

        expect(workspaceSource).not.toContain(':logo-url="talosShortLogoUrl" :workspace-subtitle="workspaceSubtitle"')
        expect(workspaceSource).not.toContain('const workspaceSubtitle = computed')
    })

    it('owns the message scale controls instead of overlaying them on the chat surface', () => {
        expect(headerSource).toContain("import TalosMessageScaleControls from './TalosMessageScaleControls.vue'")
        expect(headerSource).toContain('<TalosMessageScaleControls')
        expect(headerSource).toContain('messageScale: number')
        expect(headerSource).toContain(':message-scale="messageScale"')
        expect(headerSource).not.toContain('TalosChatBubbleScale')
        expect(headerSource).toContain("decreaseMessageScale: []")
        expect(headerSource).toContain("increaseMessageScale: []")
        expect(headerSource).toContain("resetMessageScale: []")

        expect(workspaceSource).not.toContain("import TalosMessageScaleControls from './TalosMessageScaleControls.vue'")
        expect(workspaceSource).not.toMatch(/<div class="relative z-10[^>]*><TalosMessageScaleControls/)
        expect(workspaceSource).toContain('@decrease-message-scale="decrementMessageScale"')
        expect(workspaceSource).toContain('@increase-message-scale="incrementMessageScale"')
        expect(workspaceSource).toContain('@reset-message-scale="resetMessageScale"')
    })
})
