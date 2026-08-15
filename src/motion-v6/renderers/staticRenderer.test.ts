import { describe, expect, it, vi } from 'vitest'
import type { SceneInput } from '../sceneRegistry'
import { createSceneRegistry } from '../sceneRegistry'
import { TALOS_MOTION_SCENE_IDS } from '../contracts'
import { createTalosStaticSceneRegistrations } from '../scenes/simple'
import type { SimpleRendererPlatform } from './simpleRenderer'

const roles = ['background','surface','surface_muted','surface_elevated','text','text_muted','border','border_strong','accent','accent_text','secondary','success','warning','danger','info','focus'] as const
const palette = (color: string) => Object.fromEntries(roles.map((role) => [role, color])) as SceneInput['palette']['light']
const input = (): SceneInput => ({
    colorMode: 'dark',
    palette: { light: palette('#ffffff'), dark: palette('#101820') },
    viewport: { width: 1200, height: 800, pixelRatio: 1 },
    seed: 1, logicalTimeMs: 0, deltaMs: 0,
    parameters: { speed: 100, intensity: 65, density: 100, depth: 50, trails: 35, contrast: 60, parallax: 20 },
    effectiveQuality: { tier: 'balanced', fpsCap: 30, dprCap: 1.25, densityScale: 1 },
})

describe('Static Renderer V6', () => {
    it('registers all twelve scenes as draw-once static factories with no animation scheduler', () => {
        const calls: string[] = []
        const timer = vi.spyOn(globalThis, 'setTimeout')
        const platform: SimpleRendererPlatform = {
            createLayer: (id, role) => ({ id, role }),
            appendLayer: () => calls.push('append'),
            removeLayer: () => calls.push('remove'),
            applyStyle: () => calls.push('style'),
            animate: () => { calls.push('animate'); return { pause: () => {}, play: () => {}, cancel: () => {} } },
        }
        const registrations = createTalosStaticSceneRegistrations(platform)
        expect(registrations.map((entry) => `${entry.kind}:${entry.id}`)).toEqual(TALOS_MOTION_SCENE_IDS.map((id) => `static:${id}`))
        const registry = createSceneRegistry(registrations)
        for (const id of TALOS_MOTION_SCENE_IDS) {
            const scene = registry.create(id, 'static', input())!
            scene.mount({ kind: 'static', target: {} })
            scene.renderOrUpdate(input())
            scene.pause(); scene.resume(); scene.dispose()
        }
        expect(calls).not.toContain('animate')
        expect(timer).not.toHaveBeenCalled()
        timer.mockRestore()
    })
})
