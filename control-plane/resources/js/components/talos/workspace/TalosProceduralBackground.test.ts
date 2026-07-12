// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import type { SceneInput, SceneInstance, SceneRegistry } from '../../../motion-v6/sceneRegistry'
import TalosProceduralBackground from './TalosProceduralBackground.vue'

const roles = ['background','surface','surface_muted','surface_elevated','text','text_muted','border','border_strong','accent','accent_text','secondary','success','warning','danger','info','focus'] as const
const palette = Object.fromEntries(roles.map((role) => [role, '#101820'])) as SceneInput['palette']['light']
const input: SceneInput = {
    colorMode: 'dark', palette: { light: palette, dark: palette }, viewport: { width: 800, height: 500, pixelRatio: 1 },
    seed: 1, logicalTimeMs: 0, deltaMs: 0,
    parameters: { speed: 100, intensity: 65, density: 100, depth: 50, trails: 35, contrast: 60, parallax: 20 },
    effectiveQuality: { tier: 'balanced', fpsCap: 30, dprCap: 1.25, densityScale: 1 },
}

function registry(calls: string[]): SceneRegistry {
    const instance: SceneInstance<'simple'> = {
        kind: 'simple', mount: () => calls.push('mount'), renderOrUpdate: () => calls.push('render'), resize: () => {},
        pause: () => calls.push('pause'), resume: () => calls.push('resume'), dispose: () => calls.push('dispose'),
    }
    return {
        lookup: (_id, kind) => kind === 'simple' ? ({ id: 'forge', kind: 'simple', factory: () => instance, assets: [] } as never) : null,
        create: (_id, kind) => kind === 'simple' ? instance as never : null,
        snapshot: () => [{ id: 'forge', kind: 'simple', factory: () => instance, assets: [] }],
    }
}

describe('TalosProceduralBackground V6 cutover', () => {
    afterEach(() => {
        vi.useRealTimers()
        document.body.replaceChildren()
    })

    it('owns the V6 Stage and no longer imports the legacy procedural canvas runtime', () => {
        const source = readFileSync(resolve(process.cwd(), 'resources/js/components/talos/workspace/TalosProceduralBackground.vue'), 'utf8')
        expect(source).toContain('TalosMotionStage')
        expect(source).toContain('createTalosBrowserProductSceneRegistry')
        expect(source).not.toContain('useTalosProceduralCanvas')
        expect(source).not.toContain('talos-dag-node')
        const workspace = readFileSync(resolve(process.cwd(), 'resources/js/components/talos/workspace/TalosWorkspace.vue'), 'utf8')
        expect(workspace).toContain("defineAsyncComponent(() => import('./TalosProceduralBackground.vue'))")
        expect(workspace).not.toContain("import TalosProceduralBackground from './TalosProceduralBackground.vue'")
    })

    it('mounts the selected renderer and removes the stage completely when background is disabled', async () => {
        const calls: string[] = []
        const enabled = ref(true)
        const root = document.createElement('div')
        document.body.append(root)
        const app = createApp(defineComponent({
            setup: () => () => h(TalosProceduralBackground, {
                registry: registry(calls), requestedMode: 'simple', effectiveMode: 'simple', sceneId: 'forge', input,
                backgroundEnabled: enabled.value, paused: false,
            }),
        }))
        app.mount(root)
        await nextTick()
        expect(root.querySelector('[data-talos-motion-stage]')).not.toBeNull()
        expect(calls).toEqual(expect.arrayContaining(['mount', 'render']))
        enabled.value = false
        await nextTick()
        expect(root.querySelector('[data-talos-motion-stage]')).toBeNull()
        expect(calls).toContain('dispose')
        app.unmount()
    })

    it('forwards Stage renderer faults as bounded runtime signals', async () => {
        const onRendererFault = vi.fn()
        const invalidRegistry: SceneRegistry = {
            lookup: (_id, kind) => ({ id: 'forge', kind, factory: () => null as never, assets: [] }) as never,
            create: () => null,
            snapshot: () => [{ id: 'forge', kind: 'complex', factory: () => null as never, assets: [] }],
        }
        const root = document.createElement('div')
        document.body.append(root)
        const app = createApp(defineComponent({
            setup: () => () => h(TalosProceduralBackground, {
                registry: invalidRegistry, requestedMode: 'complex', effectiveMode: 'complex', sceneId: 'forge', input,
                backgroundEnabled: true, paused: false, runtimeReason: 'requested', degradationStage: 0,
                onRendererFault,
            }),
        }))

        app.mount(root)
        await nextTick()
        expect(onRendererFault).toHaveBeenCalledWith(expect.objectContaining({
            effectiveMode: 'complex',
            reason: expect.any(String),
        }))
        app.unmount()
    })

    it('runs recovery probes only for a visible degraded fallback and tears them down when disabled', async () => {
        vi.useFakeTimers()
        const backgroundEnabled = ref(true)
        const paused = ref(false)
        const onStableWindow = vi.fn()
        const root = document.createElement('div')
        document.body.append(root)
        const app = createApp(defineComponent({
            setup: () => () => h(TalosProceduralBackground, {
                registry: registry([]), requestedMode: 'adaptive', effectiveMode: 'simple', sceneId: 'forge', input,
                backgroundEnabled: backgroundEnabled.value, paused: paused.value,
                runtimeReason: 'performance_degraded', degradationStage: 4, onStableWindow,
            }),
        }))

        app.mount(root)
        await nextTick()
        vi.advanceTimersByTime(1_000)
        expect(onStableWindow).toHaveBeenCalledTimes(1)
        expect(onStableWindow).toHaveBeenLastCalledWith(expect.objectContaining({ eventLoopDelayMs: expect.any(Number) }))

        paused.value = true
        await nextTick()
        vi.advanceTimersByTime(2_000)
        expect(onStableWindow).toHaveBeenCalledTimes(1)

        paused.value = false
        backgroundEnabled.value = false
        await nextTick()
        vi.advanceTimersByTime(2_000)
        expect(onStableWindow).toHaveBeenCalledTimes(1)
        app.unmount()
    })

    it('does not retain a recovery timer after the runtime circuit breaker locks', async () => {
        vi.useFakeTimers()
        const recoveryLocked = ref(false)
        const onStableWindow = vi.fn()
        const root = document.createElement('div')
        document.body.append(root)
        const app = createApp(defineComponent({
            setup: () => () => h(TalosProceduralBackground, {
                registry: registry([]), requestedMode: 'adaptive', effectiveMode: 'simple', sceneId: 'forge', input,
                backgroundEnabled: true, paused: false, runtimeReason: 'performance_degraded', degradationStage: 4,
                recoveryLocked: recoveryLocked.value, onStableWindow,
            }),
        }))

        app.mount(root)
        await nextTick()
        vi.advanceTimersByTime(1_000)
        expect(onStableWindow).toHaveBeenCalledTimes(1)
        recoveryLocked.value = true
        await nextTick()
        vi.advanceTimersByTime(3_000)
        expect(onStableWindow).toHaveBeenCalledTimes(1)
        app.unmount()
    })
})
