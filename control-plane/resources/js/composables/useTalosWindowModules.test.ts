import { defineComponent, effectScope } from 'vue'
import { describe, expect, it } from 'vitest'
import { useTalosWindowModules } from './useTalosWindowModules'
import {
    TALOS_WINDOW_IDS,
    TALOS_WINDOW_REGISTRY,
    type TalosWindowDescriptor,
    type TalosWindowId,
} from '../lib/talosWindowRegistry'

function registryWith(loader: TalosWindowDescriptor['loader']) {
    return Object.fromEntries(TALOS_WINDOW_IDS.map((id) => [id, {
        ...TALOS_WINDOW_REGISTRY[id],
        loader,
    }])) as Record<TalosWindowId, TalosWindowDescriptor>
}

describe('useTalosWindowModules', () => {
    it('owns validated section selection and descriptor defaults', () => {
        const component = defineComponent({ name: 'WindowModule' })
        const scope = effectScope()
        const modules = scope.run(() => useTalosWindowModules(registryWith(async () => ({ default: component }))))!

        expect(modules.activeSectionFor('model_lab')).toBe('models')
        modules.setActiveWindowSection('model_lab', 'cookbook')
        expect(modules.activeSectionFor('model_lab')).toBe('cookbook')
        modules.setActiveWindowSection('model_lab', 'missing')
        expect(modules.activeSectionFor('model_lab')).toBe('cookbook')
        scope.stop()
    })

    it('loads, caches, reports failures, and retries module boundaries', async () => {
        const component = defineComponent({ name: 'WindowModule' })
        let attempts = 0
        const scope = effectScope()
        const modules = scope.run(() => useTalosWindowModules(registryWith(async () => {
            attempts += 1
            if (attempts === 1) throw new Error('Chunk unavailable')
            return { default: component }
        })))!

        await expect(modules.requestWindowModule('runtime')).rejects.toThrow('Chunk unavailable')
        expect(modules.windowLoadStates.value.runtime.status).toBe('error')
        expect(modules.windowModuleErrorMessage('runtime')).toBe('Chunk unavailable')

        await modules.requestWindowModule('runtime', true)
        expect(modules.windowLoadStates.value.runtime.status).toBe('success')
        expect(modules.windowModuleComponent('runtime')).toBe(component)
        await modules.requestWindowModule('runtime')
        expect(attempts).toBe(2)
        scope.stop()
    })
})
