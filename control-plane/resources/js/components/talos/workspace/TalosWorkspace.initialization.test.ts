import { describe, expect, it } from 'vitest'
import workspaceSource from './TalosWorkspace.vue?raw'

describe('TalosWorkspace initialization order', () => {
    it('declares composer state before composer availability is created', () => {
        const stateIndex = workspaceSource.indexOf("const prompt = ref('')")
        const availabilityIndex = workspaceSource.indexOf('useTalosComposerAvailability(')

        expect(stateIndex).toBeGreaterThan(-1)
        expect(availabilityIndex).toBeGreaterThan(stateIndex)
    })

    it('keeps renderer and window runtimes gated until persisted workspace settings finish bootstrapping', () => {
        expect(workspaceSource).toContain('const workspaceRuntimeReady = ref(false)')
        expect(workspaceSource).toMatch(/try\s*{\s*await workspaceBootstrap\.initialize\(\)\s*}\s*finally\s*{\s*workspaceRuntimeReady\.value = true/)
        expect(workspaceSource).toContain('<TalosProceduralBackground v-if="workspaceRuntimeReady"')
    })
})
