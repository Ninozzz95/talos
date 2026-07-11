import { describe, expect, it } from 'vitest'
import workspaceSource from './TalosWorkspace.vue?raw'

describe('TalosWorkspace initialization order', () => {
    it('declares composer state before composer availability is created', () => {
        const stateIndex = workspaceSource.indexOf("const prompt = ref('')")
        const availabilityIndex = workspaceSource.indexOf('useTalosComposerAvailability(')

        expect(stateIndex).toBeGreaterThan(-1)
        expect(availabilityIndex).toBeGreaterThan(stateIndex)
    })
})
