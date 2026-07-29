import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const layerSource = readFileSync(new URL('./TalosWindowLayer.vue', import.meta.url), 'utf8')
const contextSource = readFileSync(new URL('../../../lib/talosWindowModuleContext.ts', import.meta.url), 'utf8')

describe('TalosWindowLayer module context intro replay contract', () => {
    it('declares replayIntro on the module context type', () => {
        expect(contextSource).toContain('replayIntro: () => void')
    })

    it('bridges the module context replayIntro callback to a layer emit', () => {
        expect(layerSource).toContain("replayIntro: () => emit('replayIntro')")
        expect(layerSource).toMatch(/replayIntro: \[\]/)
    })

    it('carries the authenticated settings owner fence into lazy modules', () => {
        expect(contextSource).toContain('settingsOwnerKey: string | null')
        expect(layerSource).toContain('settingsOwnerKey: string | null')
        expect(layerSource).toContain('settingsOwnerKey: props.settingsOwnerKey')
    })

    it('bridges Library attachment requests through one governed layer emit', () => {
        expect(contextSource).toContain('attachLibraryFile: (fileId: string) => void')
        expect(layerSource).toContain("attachLibraryFile: (fileId) => emit('attachLibraryFile', fileId)")
        expect(layerSource).toMatch(/attachLibraryFile: \[fileId: string\]/)
    })

    it('exposes the latest owned window-section request to lazy modules', () => {
        expect(contextSource).toContain('requestedWindowSection: string | null')
        expect(contextSource).toContain('requestedWindowSectionRevision: number')
        expect(layerSource).toContain('requestedWindowSection: props.requestedWindowSections?.[id] ?? null')
        expect(layerSource).toContain('requestedWindowSectionRevision: props.requestedWindowSections?.[id]')
    })
})
