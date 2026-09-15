import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { SceneRegistryError, createSceneRegistry, type SceneInput } from '../sceneRegistry'
import {
    SimpleRendererError,
    createDomSimpleRendererPlatform,
    createSimpleSceneFactory,
    type SimpleRendererPlatform,
    type SimpleSceneDefinition,
} from './simpleRenderer'

const roles = ['background','surface','surface_muted','surface_elevated','text','text_muted','border','border_strong','accent','accent_text','secondary','success','warning','danger','info','focus'] as const
const palette = (color: string) => Object.fromEntries(roles.map((role) => [role, color])) as SceneInput['palette']['light']

function input(tier: 'low'|'balanced'|'high' = 'balanced'): SceneInput {
    return {
        colorMode: 'dark',
        palette: { light: palette('#ffffff'), dark: palette('#101010') },
        viewport: { width: 1200, height: 800, pixelRatio: 1 },
        seed: 7, logicalTimeMs: 0, deltaMs: 0,
        parameters: { speed: 100, intensity: 65, density: 100, depth: 50, trails: 35, contrast: 60, parallax: 20 },
        effectiveQuality: { tier, fpsCap: 30, dprCap: 1.25, densityScale: 1 },
    }
}

function harness() {
    const calls: string[] = []
    const animations: Array<{ pause: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> }> = []
    const platform: SimpleRendererPlatform = {
        createLayer: (id, role) => ({ id, role }),
        appendLayer: (_target, layer) => calls.push(`append:${layer.id}`),
        removeLayer: (layer) => calls.push(`remove:${layer.id}`),
        applyStyle: (layer, style) => calls.push(`style:${layer.id}:${style.transform}:${style.opacity}`),
        animate: (layer) => {
            calls.push(`animate:${layer.id}`)
            const animation = { pause: vi.fn(), play: vi.fn(), cancel: vi.fn() }
            animations.push(animation)
            return animation
        },
    }
    return { platform, calls, animations }
}

function definition(count = 2): SimpleSceneDefinition {
    return {
        id: 'forge',
        resolve: (value) => Array.from({ length: count }, (_, index) => ({
            id: `layer-${index}`,
            role: index ? 'trace' : 'grid',
            style: { transform: `translate3d(${index * 10}px, 0, 0)`, opacity: 0.5, variables: { '--talos-v6-accent': value.palette.dark.accent } },
            motion: {
                keyframes: [
                    { transform: 'translate3d(0, 0, 0)', opacity: 0.35 },
                    { transform: 'translate3d(10px, 0, 0)', opacity: 0.75 },
                ],
                durationMs: 1000,
                easing: 'linear',
                iterations: Infinity,
            },
        })),
    }
}

function createMounted(scene = definition(), animated = true) {
    const h = harness()
    const factory = createSimpleSceneFactory(scene, h.platform, { animated })
    const registry = createSceneRegistry([{ id: 'forge', kind: 'simple', factory, assets: [] }])
    const instance = registry.create('forge', 'simple', input())!
    instance.mount({ kind: 'simple', target: {} })
    instance.renderOrUpdate(input())
    return { ...h, instance }
}

function expectRenderFailure(action: () => unknown, rendererCause = true): void {
    try {
        action()
        throw new Error('Expected render failure.')
    } catch (error) {
        expect(error).toBeInstanceOf(SceneRegistryError)
        expect((error as SceneRegistryError).code).toBe('render_failed')
        if (rendererCause) expect((error as SceneRegistryError).cause).toBeInstanceOf(SimpleRendererError)
    }
}

describe('Simple Renderer V6', () => {
    it('rejects malformed definitions and platforms before creating a factory', () => {
        expect(() => createSimpleSceneFactory({ id: '', resolve: () => [] }, harness().platform)).toThrow(SimpleRendererError)
        expect(() => createSimpleSceneFactory(definition(), { ...harness().platform, animate: null } as never)).toThrow(SimpleRendererError)
    })

    it('rejects an empty recipe so the stage can fail closed instead of rendering blank', () => {
        const h = harness()
        const registry = createSceneRegistry([{ id: 'forge', kind: 'simple', factory: createSimpleSceneFactory(definition(0), h.platform), assets: [] }])
        const scene = registry.create('forge', 'simple', input())!
        scene.mount({ kind: 'simple', target: {} })
        expectRenderFailure(() => scene.renderOrUpdate(input()))
        expect(h.calls).toEqual([])
    })

    it.each([['low', 12], ['balanced', 24], ['high', 36]] as const)('enforces the %s layer budget', (tier, limit) => {
        const h = harness()
        const registry = createSceneRegistry([{ id: 'forge', kind: 'simple', factory: createSimpleSceneFactory(definition(limit + 1), h.platform), assets: [] }])
        const scene = registry.create('forge', 'simple', input(tier))!
        scene.mount({ kind: 'simple', target: {} })
        expectRenderFailure(() => scene.renderOrUpdate(input(tier)))
        expect(h.calls).toEqual([])
    })

    it('creates bounded layers and WAAPI timelines without a frame loop', () => {
        const raf = vi.spyOn(globalThis, 'setTimeout')
        const { calls } = createMounted()
        expect(calls).toContain('append:layer-0')
        expect(calls).toContain('animate:layer-0')
        expect(raf).not.toHaveBeenCalled()
        raf.mockRestore()
    })

    it.each(['top', 'left', 'width', 'height', 'background', 'filter'])('rejects animated property %s', (property) => {
        const bad = definition(1)
        bad.resolve = () => [{
            id: 'bad', role: 'bad', style: { transform: 'none', opacity: 1, variables: {} },
            motion: { keyframes: [{ transform: 'none', opacity: 1, [property]: '1px' } as never], durationMs: 100, easing: 'linear', iterations: 1 },
        }]
        const h = harness()
        const registry = createSceneRegistry([{ id:'forge', kind:'simple', factory:createSimpleSceneFactory(bad,h.platform), assets:[] }])
        const scene = registry.create('forge','simple',input())!
        scene.mount({kind:'simple',target:{}})
        expectRenderFailure(() => scene.renderOrUpdate(input()))
    })

    it('freezes static mode and performs no animation', () => {
        const timer = vi.spyOn(globalThis, 'setTimeout')
        const raf = vi.fn()
        vi.stubGlobal('requestAnimationFrame', raf)
        const { calls, instance } = createMounted(definition(), false)
        expect(calls.some((call) => call.startsWith('animate:'))).toBe(false)
        instance.renderOrUpdate({ ...input(), logicalTimeMs: 50 })
        expect(calls.some((call) => call.startsWith('animate:'))).toBe(false)
        expect(timer).not.toHaveBeenCalled()
        expect(raf).not.toHaveBeenCalled()
        timer.mockRestore()
        vi.unstubAllGlobals()
    })

    it('pauses, resumes, updates, resizes and cleans up exact-once', () => {
        const { instance, animations, calls } = createMounted()
        instance.pause(); instance.pause(); instance.resume(); instance.resume()
        expect(animations.every((animation) => animation.pause.mock.calls.length === 1)).toBe(true)
        expect(animations.every((animation) => animation.play.mock.calls.length === 1)).toBe(true)
        const changed = input(); changed.parameters.intensity = 20; changed.palette.dark.accent = '#ff0000'
        instance.renderOrUpdate(changed)
        instance.resize({ width: 640, height: 480, pixelRatio: 1 })
        instance.dispose(); instance.dispose()
        expect(animations.every((animation) => animation.cancel.mock.calls.length === 1)).toBe(true)
        expect(calls.filter((call) => call.startsWith('remove:'))).toHaveLength(2)
    })

    it('keeps equivalent WAAPI timelines alive across repeated resize notifications', () => {
        const { instance, animations, calls } = createMounted()
        const initialAnimationCount = animations.length
        const initialAnimateCalls = calls.filter((call) => call.startsWith('animate:')).length

        instance.resize({ width: 1200, height: 800, pixelRatio: 2 })
        instance.resize({ width: 1200, height: 800, pixelRatio: 2 })

        expect(animations).toHaveLength(initialAnimationCount)
        expect(calls.filter((call) => call.startsWith('animate:'))).toHaveLength(initialAnimateCalls)
        expect(animations.every((animation) => animation.cancel.mock.calls.length === 0)).toBe(true)
        instance.dispose()
    })

    it('re-resolves palette, parameters and viewport without reading layout', () => {
        const layoutRead = vi.fn(() => { throw new Error('layout read') })
        const sceneDefinition: SimpleSceneDefinition = {
            id: 'forge',
            resolve: (value) => [{
                id: 'reactive',
                role: 'grid',
                style: {
                    transform: `translate3d(${value.viewport.width}px, 0, 0)`,
                    opacity: value.parameters.intensity / 100,
                    variables: { '--talos-v6-accent': value.palette.dark.accent },
                },
            }],
        }
        const h = harness()
        const registry = createSceneRegistry([{ id: 'forge', kind: 'simple', factory: createSimpleSceneFactory(sceneDefinition, h.platform), assets: [] }])
        const scene = registry.create('forge', 'simple', input())!
        scene.mount({ kind: 'simple', target: { getBoundingClientRect: layoutRead } })
        scene.renderOrUpdate(input())
        const changed = input()
        changed.parameters.intensity = 20
        changed.palette.dark.accent = '#ff0000'
        scene.renderOrUpdate(changed)
        scene.resize({ width: 640, height: 480, pixelRatio: 1 })
        expect(layoutRead).not.toHaveBeenCalled()
        expect(h.calls).toContain('style:reactive:translate3d(640px, 0, 0):0.2')
    })

    it('ships isolated CSS with an explicit reduced-motion fail-safe', () => {
        const simpleRendererCss = readFileSync('src/css/talos-motion-v6-simple.css', 'utf8')
        expect(simpleRendererCss).toContain('[data-talos-motion-stage] .talos-v6-simple-layer')
        expect(simpleRendererCss).toContain('@media (prefers-reduced-motion: reduce)')
        expect(simpleRendererCss).toContain('animation: none !important')
        expect(simpleRendererCss).toContain('transition: none !important')
    })

    it('recreates a layer whose stable ID changes semantic role', () => {
        let role = 'grid'
        const sceneDefinition: SimpleSceneDefinition = {
            id: 'forge',
            resolve: () => [{ id: 'stable', role, style: { transform: 'none', opacity: 1 } }],
        }
        const { instance, calls } = createMounted(sceneDefinition)
        role = 'trace'
        instance.renderOrUpdate(input())
        expect(calls).toEqual([
            'append:stable', 'style:stable:none:1',
            'remove:stable', 'append:stable', 'style:stable:none:1',
        ])
    })

    it('provides a real DOM and WAAPI adapter with stale variable cleanup', () => {
        const calls: string[] = []
        const styleValues = new Map<string, string>()
        const element = {
            className: '',
            dataset: {} as Record<string, string>,
            style: {
                setProperty: (name: string, value: string) => { styleValues.set(name, value); calls.push(`set:${name}:${value}`) },
                removeProperty: (name: string) => { styleValues.delete(name); calls.push(`remove-var:${name}`) },
            },
            animate: vi.fn(() => ({ pause: vi.fn(), play: vi.fn(), cancel: vi.fn() })),
            remove: vi.fn(() => calls.push('remove-element')),
        }
        const documentLike = { createElement: vi.fn(() => element) }
        const target = { appendChild: vi.fn(() => calls.push('append-child')) }
        const platform = createDomSimpleRendererPlatform(documentLike as never)
        const handle = platform.createLayer('layer', 'grid')
        platform.appendLayer(target, handle)
        platform.applyStyle(handle, { transform: 'translate3d(1px, 0, 0)', opacity: 0.5, variables: { '--talos-v6-accent': '#fff' } })
        platform.applyStyle(handle, { transform: 'none', opacity: 1, variables: {} })
        const animation = platform.animate(handle, [{ transform: 'none', opacity: 1 }], { durationMs: 100, easing: 'linear', iterations: 1 })
        animation.pause(); animation.play(); animation.cancel(); platform.removeLayer(handle)

        expect(element.className).toBe('talos-v6-simple-layer')
        expect(element.dataset.talosMotionLayerId).toBe('layer')
        expect(element.dataset.talosMotionLayerRole).toBe('grid')
        expect(target.appendChild).toHaveBeenCalledWith(element)
        expect(calls).toContain('remove-var:--talos-v6-accent')
        expect(element.animate).toHaveBeenCalledWith(
            [{ transform: 'none', opacity: 1 }],
            { duration: 100, easing: 'linear', iterations: 1, fill: 'both' },
        )
        expect(element.remove).toHaveBeenCalledOnce()
    })

    it('rejects duplicate layers, unsafe variables and hostile recipe output before DOM writes', () => {
        const cases: SimpleSceneDefinition[] = [
            { id:'forge', resolve: () => [definition(1).resolve(input())[0], definition(1).resolve(input())[0]] },
            { id:'forge', resolve: () => [{ ...definition(1).resolve(input())[0], style:{ transform:'none', opacity:1, variables:{ '--bad':'url(https://x)' } } }] },
            { id:'forge', resolve: () => new Proxy([], { ownKeys: () => { throw new Error('blocked') } }) as never },
            { id:'forge', resolve: () => [{ ...definition(1).resolve(input())[0], style:{ transform:'none', opacity:1, variables:new Proxy({}, { ownKeys: () => { throw new Error('blocked') } }) } }] },
        ]
        for (const current of cases) {
            const h = harness()
            const registry = createSceneRegistry([{id:'forge',kind:'simple',factory:createSimpleSceneFactory(current,h.platform),assets:[]}])
            const scene = registry.create('forge','simple',input())!
            scene.mount({kind:'simple',target:{}})
            expectRenderFailure(() => scene.renderOrUpdate(input()))
            expect(h.calls).toEqual([])
        }
    })

    it('retains partial append ownership so fault cleanup removes the layer', () => {
        const h = harness()
        const platform = {
            ...h.platform,
            appendLayer: (_target: unknown, layer: { id: string }) => { h.calls.push(`append:${layer.id}`); throw new Error('append failed') },
        } as SimpleRendererPlatform
        const registry = createSceneRegistry([{ id:'forge', kind:'simple', factory:createSimpleSceneFactory(definition(1), platform), assets:[] }])
        const scene = registry.create('forge','simple',input())!
        scene.mount({kind:'simple',target:{}})
        expectRenderFailure(() => scene.renderOrUpdate(input()), false)
        scene.dispose()
        expect(h.calls).toEqual(['append:layer-0', 'remove:layer-0'])
    })
})
