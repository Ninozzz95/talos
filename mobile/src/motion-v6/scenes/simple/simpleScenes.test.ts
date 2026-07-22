import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TALOS_MOTION_SCENE_IDS } from '../../contracts'
import type { SceneInput } from '../../sceneRegistry'
import { SIMPLE_LAYER_BUDGET, createSimpleSceneFactory } from '../../renderers/simpleRenderer'
import { createSceneRegistry } from '../../sceneRegistry'
import { TALOS_SIMPLE_SCENE_DEFINITIONS, createTalosSimpleSceneRegistrations } from './index'

const roles = ['background','surface','surface_muted','surface_elevated','text','text_muted','border','border_strong','accent','accent_text','secondary','success','warning','danger','info','focus'] as const
const palette = (base: string, accent: string) => Object.fromEntries(roles.map((role, index) => [role, index >= 8 ? accent : base])) as SceneInput['palette']['light']

function input(colorMode: 'light'|'dark' = 'dark', width = 1200): SceneInput {
    return {
        colorMode,
        palette: { light: palette('#f8fafc', '#2563eb'), dark: palette('#101820', '#d49a52') },
        viewport: { width, height: width < 600 ? 720 : 800, pixelRatio: 1 },
        seed: 17,
        logicalTimeMs: 0,
        deltaMs: 0,
        parameters: { speed: 100, intensity: 65, density: 100, depth: 50, trails: 35, contrast: 60, parallax: 20 },
        effectiveQuality: { tier: 'low', fpsCap: 20, dprCap: 1, densityScale: 0.55 },
    }
}

function geometryFingerprint(layers: ReturnType<(typeof TALOS_SIMPLE_SCENE_DEFINITIONS)[number]['resolve']>): string {
    return JSON.stringify(layers.map((layer) => ({ id: layer.id, role: layer.role, transform: layer.style.transform, frames: layer.motion?.keyframes.map((frame) => frame.transform) })))
}

function platform() {
    const calls: string[] = []
    return {
        calls,
        adapter: {
            createLayer: (id: string, role: string) => ({ id, role }),
            appendLayer: () => calls.push('append'),
            removeLayer: () => calls.push('remove'),
            applyStyle: () => calls.push('style'),
            animate: () => { calls.push('animate'); return { pause: () => {}, play: () => {}, cancel: () => {} } },
        },
    }
}

describe('TALOS V6 Simple scene library', () => {
    it('contains exactly one independently addressable scene for every preset', () => {
        expect(TALOS_SIMPLE_SCENE_DEFINITIONS.map((scene) => scene.id)).toEqual(TALOS_MOTION_SCENE_IDS)
        expect(new Set(TALOS_SIMPLE_SCENE_DEFINITIONS.map((scene) => scene.resolve)).size).toBe(14)
    })

    it('creates a complete registry-ready factory set without a parallel scene map', () => {
        const h = platform()
        const registrations = createTalosSimpleSceneRegistrations(h.adapter)
        expect(registrations.map((entry) => `${entry.kind}:${entry.id}`)).toEqual(TALOS_MOTION_SCENE_IDS.map((id) => `simple:${id}`))
        const registry = createSceneRegistry(registrations)
        for (const id of TALOS_MOTION_SCENE_IDS) {
            const instance = registry.create(id, 'simple', input())!
            instance.mount({ kind: 'simple', target: {} })
            instance.renderOrUpdate(input())
            instance.dispose()
        }
        expect(registry.snapshot()).toHaveLength(14)
    })

    it.each(TALOS_SIMPLE_SCENE_DEFINITIONS)('$id stays inside the low-tier budget and has moving transform/opacity keyframes', (scene) => {
        const layers = scene.resolve(input())
        expect(layers.length).toBeGreaterThanOrEqual(7)
        expect(layers.length).toBeLessThanOrEqual(SIMPLE_LAYER_BUDGET.low)
        expect(new Set(layers.map((layer) => layer.id)).size).toBe(layers.length)
        expect(new Set(layers.map((layer) => layer.role)).size).toBeGreaterThanOrEqual(7)
        expect(layers.some((layer) => {
            const variables = layer.style.variables ?? {}
            return Number.parseFloat(variables['--talos-v6-w'] ?? '0') >= 60
                && Number.parseFloat(variables['--talos-v6-h'] ?? '0') >= 35
        })).toBe(true)
        expect(layers.some((layer) => layer.motion && JSON.stringify(layer.motion.keyframes[0]) !== JSON.stringify(layer.motion.keyframes.at(-1)))).toBe(true)
    })

    it('distinguishes every scene by geometry and temporal grammar rather than palette', () => {
        const fingerprints = TALOS_SIMPLE_SCENE_DEFINITIONS.map((scene) => geometryFingerprint(scene.resolve(input())))
        expect(new Set(fingerprints).size).toBe(14)
    })

    it.each(TALOS_SIMPLE_SCENE_DEFINITIONS)('$id resolves the active light/dark palette deterministically', (scene) => {
        const light = JSON.stringify(scene.resolve(input('light')))
        const dark = JSON.stringify(scene.resolve(input('dark')))
        expect(light).toContain('#2563eb')
        expect(dark).toContain('#d49a52')
        expect(light).not.toBe(dark)
    })

    it.each(TALOS_SIMPLE_SCENE_DEFINITIONS)('$id connects every bounded customization parameter to output', (scene) => {
        const baseline = JSON.stringify(scene.resolve(input()))
        for (const key of ['speed', 'intensity', 'density', 'depth', 'trails', 'contrast', 'parallax'] as const) {
            const changed = input()
            changed.parameters[key] = key === 'speed' ? 150 : 10
            expect(JSON.stringify(scene.resolve(changed)), `${scene.id}:${key}`).not.toBe(baseline)
        }
    })

    it.each(TALOS_SIMPLE_SCENE_DEFINITIONS)('$id adapts geometry for mobile without changing stable layer identity', (scene) => {
        const desktop = scene.resolve(input('dark', 1200))
        const mobile = scene.resolve(input('dark', 390))
        expect(mobile.map((layer) => layer.id)).toEqual(desktop.map((layer) => layer.id))
        expect(geometryFingerprint(mobile)).not.toBe(geometryFingerprint(desktop))
    })

    it.each(TALOS_SIMPLE_SCENE_DEFINITIONS)('$id freezes through the real static renderer path', (scene) => {
        const h = platform()
        const registry = createSceneRegistry([{ id: scene.id, kind: 'simple', factory: createSimpleSceneFactory(scene, h.adapter, { animated: false }), assets: [] }])
        const instance = registry.create(scene.id, 'simple', input())!
        instance.mount({ kind: 'simple', target: {} })
        instance.renderOrUpdate(input())
        expect(h.calls).not.toContain('animate')
    })

    it('ships CSS ownership for every emitted semantic role and avoids decorative orb roles', () => {
        const css = readFileSync('src/css/talos-motion-v6-simple.css', 'utf8')
        const emittedRoles = new Set(TALOS_SIMPLE_SCENE_DEFINITIONS.flatMap((scene) => scene.resolve(input()).map((layer) => layer.role)))
        for (const role of emittedRoles) expect(css).toContain(`[data-talos-motion-layer-role="${role}"]`)
        expect([...emittedRoles].some((role) => /orb|bokeh/i.test(role))).toBe(false)
    })

    it('encodes Ember incident state with shape and role, not color alone', () => {
        const ember = TALOS_SIMPLE_SCENE_DEFINITIONS.find((scene) => scene.id === 'ember')!
        expect(ember.resolve(input()).map((layer) => layer.role)).toEqual(expect.arrayContaining(['ember-incident-cross', 'ember-recovery-track']))
    })

    it('keeps semantic markers compact instead of rendering viewport-scale squares', () => {
        const markerRole = /(node|checkpoint|cursor|hypothesis-mark|queue-mark|waypoint|focus-mark|status-mark|concept-mark|revision-mark|state-mark)$/
        for (const scene of TALOS_SIMPLE_SCENE_DEFINITIONS) {
            for (const layer of scene.resolve(input()).filter((candidate) => markerRole.test(candidate.role))) {
                const variables = layer.style.variables ?? {}
                expect(Number.parseFloat(variables['--talos-v6-w'] ?? '100'), layer.role).toBeLessThanOrEqual(4)
                expect(Number.parseFloat(variables['--talos-v6-h'] ?? '100'), layer.role).toBeLessThanOrEqual(6)
            }
        }
    })
})
