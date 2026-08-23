import { describe, expect, it } from 'vitest'
import { TALOS_MOTION_SCENE_IDS } from '../../contracts'
import type { SceneInput } from '../../sceneRegistry'
import { COMPLEX_PRIMITIVE_BUDGET } from '../../renderers/complexRenderer'
import { createSceneRegistry } from '../../sceneRegistry'
import { TALOS_COMPLEX_SCENE_DEFINITIONS, createTalosComplexSceneRegistrations } from './index'

const roles = ['background','surface','surface_muted','surface_elevated','text','text_muted','border','border_strong','accent','accent_text','secondary','success','warning','danger','info','focus'] as const
const palette = (base: string, accent: string) => Object.fromEntries(roles.map((role, index) => [role, index >= 8 ? accent : base])) as SceneInput['palette']['light']

function input(tier: 'low'|'balanced'|'high' = 'balanced', colorMode: 'light'|'dark' = 'dark', width = 1200): SceneInput {
    return {
        colorMode,
        palette: { light: palette('#f8fafc', '#2563eb'), dark: palette('#101820', '#d49a52') },
        viewport: { width, height: width < 600 ? 720 : 800, pixelRatio: 1 },
        seed: 137,
        logicalTimeMs: 0,
        deltaMs: 0,
        parameters: { speed: 100, intensity: 65, density: 100, depth: 50, trails: 35, contrast: 60, parallax: 20 },
        effectiveQuality: { tier, fpsCap: tier === 'high' ? 45 : tier === 'low' ? 20 : 30, dprCap: tier === 'high' ? 1.5 : tier === 'low' ? 1 : 1.25, densityScale: tier === 'high' ? 1.25 : tier === 'low' ? 0.55 : 1 },
    }
}

function recorder() {
    const calls: string[] = []
    const value = (name: string, args: unknown[]) => calls.push(`${name}:${args.map((item) => typeof item === 'number' ? Number(item.toFixed(3)) : item).join(',')}`)
    const context = {
        clearRect: (...args: number[]) => value('clearRect', args),
        beginPath: () => value('beginPath', []),
        moveTo: (...args: number[]) => value('moveTo', args),
        lineTo: (...args: number[]) => value('lineTo', args),
        closePath: () => value('closePath', []),
        stroke: () => value('stroke', []),
        fill: () => value('fill', []),
        fillRect: (...args: number[]) => value('fillRect', args),
        strokeRect: (...args: number[]) => value('strokeRect', args),
        save: () => value('save', []),
        restore: () => value('restore', []),
        setLineDash: (args: number[]) => value('setLineDash', args),
        arc: (...args: number[]) => value('arc', args),
        quadraticCurveTo: (...args: number[]) => value('quadraticCurveTo', args),
        bezierCurveTo: (...args: number[]) => value('bezierCurveTo', args),
        translate: (...args: number[]) => value('translate', args),
        rotate: (...args: number[]) => value('rotate', args),
        createLinearGradient: (...args: number[]) => {
            value('createLinearGradient', args)
            return { addColorStop: (offset: number, color: string) => value('addColorStop', [offset, color]) }
        },
        createRadialGradient: (...args: number[]) => {
            value('createRadialGradient', args)
            return { addColorStop: (offset: number, color: string) => value('addColorStop', [offset, color]) }
        },
        globalAlpha: 1,
        lineWidth: 1,
        strokeStyle: '',
        fillStyle: '',
        shadowBlur: 0,
        shadowColor: '',
    }
    return { calls, context }
}

function prepared(scene: (typeof TALOS_COMPLEX_SCENE_DEFINITIONS)[number], value = input()) {
    const state = scene.createState(value.seed)
    const result = scene.prepare({ state, input: value, invalidations: ['seed', 'viewport', 'palette', 'parameters', 'quality'] })
    return { state, result }
}

function draw(scene: (typeof TALOS_COMPLEX_SCENE_DEFINITIONS)[number], value = input(), advance = false): string[] {
    const { state, result } = prepared(scene, value)
    if (advance) scene.update({ state, geometry: result.geometry, input: value, logicalTimeMs: 100, stepMs: 1000 / value.effectiveQuality.fpsCap })
    const output = recorder()
    scene.draw({ context: output.context, state, geometry: result.geometry, input: value, logicalTimeMs: advance ? 100 : 0, stepMs: advance ? 1000 / value.effectiveQuality.fpsCap : 0 })
    return output.calls
}

function platform() {
    const callbacks: Array<() => void> = []
    const context = recorder().context
    return {
        scheduler: {
            now: () => 0,
            requestFrame: (callback: () => void) => { callbacks.push(callback); return callback },
            cancelFrame: (callback: unknown) => { const index = callbacks.indexOf(callback as () => void); if (index >= 0) callbacks.splice(index, 1) },
        },
        createSurface: (id: string) => ({ id }),
        appendSurface: () => {},
        resizeSurface: () => {},
        getContext: () => context,
        removeSurface: () => {},
    }
}

describe('TALOS V6 Complex scene library', () => {
    it('contains exactly one scene for every preset and registry-ready factory', () => {
        expect(TALOS_COMPLEX_SCENE_DEFINITIONS.map((scene) => scene.id)).toEqual(TALOS_MOTION_SCENE_IDS)
        expect(new Set(TALOS_COMPLEX_SCENE_DEFINITIONS.map((scene) => scene.draw)).size).toBe(14)
        const registrations = createTalosComplexSceneRegistrations(platform())
        expect(registrations.map((entry) => `${entry.kind}:${entry.id}`)).toEqual(TALOS_MOTION_SCENE_IDS.map((id) => `complex:${id}`))
        expect(createSceneRegistry(registrations).snapshot()).toHaveLength(14)
    })

    it.each(TALOS_COMPLEX_SCENE_DEFINITIONS)('$id produces deterministic seed/state and static frame output', (scene) => {
        expect(scene.createState(137)).toEqual(scene.createState(137))
        expect(draw(scene)).toEqual(draw(scene))
    })

    it.each(TALOS_COMPLEX_SCENE_DEFINITIONS)('$id changes temporal output after a fixed update', (scene) => {
        expect(draw(scene, input(), true)).not.toEqual(draw(scene, input(), false))
    })

    it.each(TALOS_COMPLEX_SCENE_DEFINITIONS)('$id maps active light/dark palette and all bounded parameters', (scene) => {
        const light = JSON.stringify(prepared(scene, input('balanced', 'light')).result.geometry)
        const dark = JSON.stringify(prepared(scene, input('balanced', 'dark')).result.geometry)
        expect(light).toContain('#2563eb')
        expect(dark).toContain('#d49a52')
        expect(light).not.toBe(dark)
        const baseline = JSON.stringify(prepared(scene).result.geometry)
        for (const key of ['speed', 'intensity', 'density', 'depth', 'trails', 'contrast', 'parallax'] as const) {
            const changed = input()
            changed.parameters[key] = key === 'speed' ? 150 : 10
            expect(JSON.stringify(prepared(scene, changed).result.geometry), `${scene.id}:${key}`).not.toBe(baseline)
        }
    })

    it.each(TALOS_COMPLEX_SCENE_DEFINITIONS)('$id respects every tier primitive budget and mobile viewport', (scene) => {
        for (const tier of ['low', 'balanced', 'high'] as const) {
            const desktop = prepared(scene, input(tier, 'dark', 1200)).result
            const mobile = prepared(scene, input(tier, 'dark', 390)).result
            expect(desktop.primitiveCount).toBeGreaterThan(0)
            expect(desktop.primitiveCount).toBeGreaterThanOrEqual(24)
            expect(desktop.primitiveCount).toBeLessThanOrEqual(COMPLEX_PRIMITIVE_BUDGET[tier])
            expect(JSON.stringify(mobile.geometry)).not.toBe(JSON.stringify(desktop.geometry))
        }
    })

    it.each(TALOS_COMPLEX_SCENE_DEFINITIONS)('$id renders a composed field instead of a four-glyph placeholder', (scene) => {
        const calls = draw(scene)
        expect(calls.length).toBeGreaterThanOrEqual(80)
        expect(calls.some((call) => /^(arc|quadraticCurveTo|bezierCurveTo|createLinearGradient|createRadialGradient):/.test(call))).toBe(true)
    })

    it('distinguishes all scenes by rendered operation fingerprint', () => {
        const fingerprints = TALOS_COMPLEX_SCENE_DEFINITIONS.map((scene) => draw(scene).map((call) => call.split(':')[0]).join('|'))
        expect(new Set(fingerprints).size).toBe(14)
    })
})
