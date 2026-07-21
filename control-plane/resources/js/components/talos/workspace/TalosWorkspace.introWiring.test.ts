import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workspaceSource = readFileSync(new URL('./TalosWorkspace.vue', import.meta.url), 'utf8')
const appJsSource = readFileSync(new URL('../../../app.js', import.meta.url), 'utf8')
const apiMocksSource = readFileSync(new URL('../../../../../tests/e2e/helpers/talosApiMocks.ts', import.meta.url), 'utf8')

describe('TalosWorkspace INTRO-1 wiring contract', () => {
    it('loads TalosIntroModal only through a gated async chunk, never synchronously', () => {
        expect(workspaceSource).not.toMatch(/import TalosIntroModal from/)
        expect(workspaceSource).toContain("defineAsyncComponent(() => import('./TalosIntroModal.vue'))")
        expect(workspaceSource).toMatch(/<TalosIntroModal[^>]*v-if="introOpen"/)
        expect(workspaceSource).toMatch(/<TalosIntroModal[^>]*:links="publicLinks"/)
        expect(workspaceSource).toMatch(/<TalosIntroModal[^>]*@close="handleIntroClose"/)
    })

    it('feeds useTalosIntroState from workspace gates including the blocking overlay set', () => {
        expect(workspaceSource).toContain('useTalosIntroState(')
        expect(workspaceSource).toContain('settingsLoadState: workspaceSettingsLoadState')
        expect(workspaceSource).toContain('commandPaletteOpen.value || exportDialogOpen.value || Boolean(pendingDeleteSession.value)')
        expect(workspaceSource).toContain("label: 'Retry'")
    })

    it('closes the settings window before replaying the intro and focuses the composer after close', () => {
        expect(workspaceSource).toContain('@replay-intro="handleIntroReplayRequest"')
        expect(workspaceSource).toContain("closeWindow('settings')")
        expect(workspaceSource).toContain('ref="composerDock"')
        expect(workspaceSource).toContain('composerDock.value?.focusPrompt()')
    })

    it('bridges the blade public link attributes through the parser into a workspace prop', () => {
        expect(appJsSource).toContain('parseTalosPublicLinks')
        expect(appJsSource).toContain('talosAvmDeepDiveUrl')
        expect(appJsSource).toContain('talosPatreonUrl')
        expect(appJsSource).toContain('talosKofiUrl')
        expect(workspaceSource).toMatch(/publicLinks\?: TalosPublicLinks/)
    })

    it('keeps the E2E corpus intro-complete so existing journeys never meet the modal', () => {
        expect(apiMocksSource).toMatch(/onboarding:\s*\{\s*intro_version:\s*1,\s*intro_outcome:\s*'completed'\s*\}/)
    })
})
