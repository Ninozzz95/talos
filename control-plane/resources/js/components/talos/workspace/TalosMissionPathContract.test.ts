import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(new URL('../../../app.js', import.meta.url), 'utf8')
const workspaceSource = readFileSync(new URL('./TalosWorkspace.vue', import.meta.url), 'utf8')
const chatSurfaceSource = readFileSync(new URL('./TalosChatSurface.vue', import.meta.url), 'utf8')

describe('Mission Path environment and viewport gate', () => {
    it('passes the server-owned environment gate into the workspace', () => {
        expect(appSource).toContain("developmentMode: workspaceRoot.dataset.developmentMode === 'true'")
        expect(workspaceSource).toContain('developmentMode?: boolean')
    })

    it('requires development, a non-mobile viewport, and the user visibility preference', () => {
        expect(workspaceSource).toContain('resolveTalosMissionPathVisibility({')
        expect(workspaceSource).toContain('developmentMode: props.developmentMode')
        expect(workspaceSource).toContain('breakpoint: breakpoint.value')
        expect(workspaceSource).toContain('preferenceEnabled: workspaceAppearanceVisibility.value.chat_area.mission_path')
        expect(workspaceSource).toContain(':show-mission-path="showMissionPath"')
        expect(chatSurfaceSource).toContain('showMissionPath: boolean')
        expect(chatSurfaceSource).toContain('v-if="showMissionPath"')
    })
})
