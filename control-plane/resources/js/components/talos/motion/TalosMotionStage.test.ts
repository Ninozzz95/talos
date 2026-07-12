// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { createDefaultTalosMotionV6Preferences } from '../../../motion-v6/defaults'
import { resolveTalosMotionRuntimePolicy } from '../../../motion-v6/runtimePolicy'
import type { SceneInput, SceneInstance, SceneRegistry } from '../../../motion-v6/sceneRegistry'
import TalosMotionStage from './TalosMotionStage.vue'

const apps: Array<ReturnType<typeof createApp>> = []
type MutableRecord = Record<string, unknown>

const palette = {
    background: '#101820', surface: '#18252f', surfaceRaised: '#20313d', text: '#f4f7f8', textMuted: '#aebbc2',
    border: '#49606c', accent: '#d49a52', accentStrong: '#f1b96f', accentSoft: '#5b4225', info: '#72b9d4',
    success: '#6fc69a', warning: '#e3b866', danger: '#dd7f7f', scrim: '#000000',
} as const

function input(viewport: SceneInput['viewport'] = { width: 800, height: 500, pixelRatio: 1 }): SceneInput {
    return {
        colorMode: 'dark',
        palette: { light: palette, dark: palette },
        viewport,
        seed: 1,
        logicalTimeMs: 0,
        deltaMs: 0,
        parameters: { speed: 100, intensity: 60, density: 80, depth: 50, trails: 20, contrast: 50, parallax: 30 },
        effectiveQuality: { tier: 'balanced', fpsCap: 30, dprCap: 1.25, densityScale: 1 },
    }
}

function fakeRegistry(calls: string[]): SceneRegistry {
    const make = (kind: 'complex' | 'simple' | 'static'): SceneInstance => ({
        kind,
        mount: () => calls.push(`${kind}:mount`),
        renderOrUpdate: () => calls.push(`${kind}:render`),
        resize: () => calls.push(`${kind}:resize`),
        pause: () => calls.push(`${kind}:pause`),
        resume: () => calls.push(`${kind}:resume`),
        dispose: () => calls.push(`${kind}:dispose`),
    })
    return {
        lookup: (id, kind) => id === 'forge' && kind === 'static' ? { id, kind, factory: () => make(kind), assets: [] } as never : null,
        create: (id, kind) => id === 'forge' && kind === 'static' ? make(kind) as never : null,
        snapshot: () => [{ id: 'forge', kind: 'static', factory: () => make('static'), assets: [] }] as never,
    }
}

function fallbackRegistry(calls: string[], creates: { complex?: () => SceneInstance; simple?: () => SceneInstance; static?: () => SceneInstance } = {}): SceneRegistry {
    const registrations = new Map(Object.entries(creates).map(([kind, factory]) => [kind, { id: 'forge', kind, factory, assets: [] }]))
    return {
        lookup: (id, kind) => id === 'forge' ? registrations.get(kind) as never ?? null : null,
        create: (id, kind) => id === 'forge' ? registrations.get(kind)?.factory(input()) as never ?? null : null,
        snapshot: () => [...registrations.values()] as never,
    }
}

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

describe('TalosMotionStage', () => {
    it('keeps the solid underlay mounted, exposes safe data attributes, and owns lifecycle cleanup', async () => {
        const calls: string[] = []
        const host = document.createElement('div')
        document.body.append(host)
        const app = createApp(TalosMotionStage, {
            registry: fakeRegistry(calls),
            requestedMode: 'static',
            effectiveMode: 'static',
            sceneId: 'forge',
            paused: false,
            input: input(),
        })
        apps.push(app)
        app.mount(host)
        await nextTick()

        const stage = host.firstElementChild as HTMLElement
        expect(stage.dataset.requestedMode).toBe('static')
        expect(stage.dataset.requested).toBe('static')
        expect(stage.dataset.effectiveMode).toBe('static')
        expect(stage.dataset.effective).toBe('static')
        expect(stage.dataset.reason).toBe('')
        expect(stage.dataset.status).toBe('active')
        expect(stage.dataset.activeKind).toBe('static')
        expect(stage.dataset.sceneId).toBe('forge')
        expect(stage.dataset.paused).toBe('false')
        expect(stage.querySelector('[data-talos-motion-solid-underlay]')).toBeTruthy()
        expect(stage.querySelector('[data-talos-motion-renderer-target]')).toBeTruthy()

        app.unmount()
        expect(calls).toContain('static:dispose')
    })

    it('fails closed with a solid surface when the registry prop is empty', async () => {
        const host = document.createElement('div')
        document.body.append(host)
        const app = createApp(TalosMotionStage, {
            registry: {
                lookup: () => null,
                create: () => null,
                snapshot: () => [],
            },
            requestedMode: 'complex',
            effectiveMode: 'complex',
            sceneId: 'forge',
            paused: false,
            input: input(),
        })
        apps.push(app)

        expect(() => app.mount(host)).not.toThrow()
        await nextTick()

        const stage = host.firstElementChild as HTMLElement
        expect(stage.dataset.status).toBe('solid-fallback')
        expect(stage.dataset.activeKind).toBe('')
        expect(stage.dataset.sceneId).toBe('')
        expect(stage.dataset.requestedSceneId).toBe('forge')
        expect(stage.dataset.solidFallback).toBe('true')
    })

    it('does not surface controller faults as Vue uncaught errors', async () => {
        const fault = vi.fn()
        const host = document.createElement('div')
        document.body.append(host)
        const app = createApp(TalosMotionStage, {
            registry: {
                lookup: () => { throw new Error('lookup') },
                create: () => { throw new Error('create') },
                snapshot: () => { throw new Error('snapshot') },
            },
            requestedMode: 'complex',
            effectiveMode: 'complex',
            sceneId: 'forge',
            paused: false,
            input: input(),
            onFault: fault,
        })
        apps.push(app)

        expect(() => app.mount(host)).not.toThrow()
        await nextTick()
        expect(fault).toHaveBeenCalled()
        expect((host.firstElementChild as HTMLElement).dataset.status).toBe('solid-fallback')
    })

    it('does not invoke hostile registry getters or proxy traps in prop validation', async () => {
        let getterReads = 0
        const hostile = {} as Record<string, unknown>
        for (const key of ['lookup', 'create', 'snapshot']) {
            Object.defineProperty(hostile, key, {
                configurable: true,
                enumerable: true,
                get: () => {
                    getterReads += 1
                    return () => null
                },
            })
        }
        const proxied = new Proxy(hostile, { ownKeys: () => { throw new Error('blocked') } })
        const host = document.createElement('div')
        document.body.append(host)
        const app = createApp(TalosMotionStage, {
            registry: proxied,
            requestedMode: 'complex',
            effectiveMode: 'complex',
            sceneId: 'forge',
            paused: false,
            input: input(),
        })
        apps.push(app)

        expect(() => app.mount(host)).not.toThrow()
        await nextTick()
        expect(getterReads).toBe(0)
        expect((host.firstElementChild as HTMLElement).dataset.status).toBe('solid-fallback')
    })

    it('rejects a revoked registry Proxy prop without Vue errors', async () => {
        const revocable = Proxy.revocable({ lookup: () => null, create: () => null, snapshot: () => [] }, {})
        revocable.revoke()
        const errors: unknown[] = []
        const host = document.createElement('div')
        document.body.append(host)
        const app = createApp(TalosMotionStage, {
            registry: revocable.proxy,
            requestedMode: 'complex',
            effectiveMode: 'complex',
            sceneId: 'forge',
            paused: false,
            input: input(),
        })
        app.config.errorHandler = (error) => errors.push(error)
        apps.push(app)

        expect(() => app.mount(host)).not.toThrow()
        await nextTick()
        expect(errors).toEqual([])
        expect((host.firstElementChild as HTMLElement).dataset.status).toBe('solid-fallback')
    })

    it('watches replacement input shallowly without reading a nested viewport getter', async () => {
        let viewportReads = 0
        const hostileInput = input() as MutableRecord
        Object.defineProperty(hostileInput, 'viewport', {
            configurable: true,
            enumerable: true,
            get: () => {
                viewportReads += 1
                throw new Error('viewport getter must not run')
            },
        })
        const errors: unknown[] = []
        const host = document.createElement('div')
        document.body.append(host)
        const app = createApp(TalosMotionStage, {
            registry: fakeRegistry([]),
            requestedMode: 'static',
            effectiveMode: 'static',
            sceneId: 'forge',
            paused: false,
            input: hostileInput,
        })
        app.config.errorHandler = (error) => errors.push(error)
        apps.push(app)

        expect(() => app.mount(host)).not.toThrow()
        await nextTick()
        expect(viewportReads).toBe(0)
        expect(errors).toEqual([])
    })

    it.each([true, false])('consumes policy paused=%s without interpreting document visibility', async (pauseWhenHidden) => {
        const calls: string[] = []
        const base = createDefaultTalosMotionV6Preferences()
        const decision = resolveTalosMotionRuntimePolicy(
            { ...base, mode: 'static', pause_when_hidden: pauseWhenHidden },
            {
                workspaceBackgroundAllowed: true,
                workspaceInterfaceMotionAllowed: true,
                prefersReducedMotion: false,
                documentHidden: true,
                saveData: false,
                rendererFault: false,
                failedEffectiveMode: null,
                frameP95Ms: 8,
                frameSampleSufficient: true,
            },
        )
        const host = document.createElement('div')
        document.body.append(host)
        const app = createApp(TalosMotionStage, {
            registry: fakeRegistry(calls),
            requestedMode: decision.requestedMode,
            effectiveMode: decision.effectiveMode,
            sceneId: 'forge',
            input: input(),
            backgroundEnabled: decision.backgroundEnabled,
            paused: decision.paused,
        })
        apps.push(app)
        app.mount(host)
        await nextTick()

        Object.defineProperty(document, 'hidden', { configurable: true, value: true })
        document.dispatchEvent(new Event('visibilitychange'))
        await nextTick()

        expect((host.firstElementChild as HTMLElement).dataset.paused).toBe(String(decision.paused))
        expect(calls.filter((call) => call === 'static:pause')).toHaveLength(pauseWhenHidden ? 1 : 0)
    })

    it('contains hostile ResizeObserver lifecycle and still disposes the controller', async () => {
        const modes = ['constructor', 'observe', 'callback', 'disconnect'] as const
        for (const mode of modes) {
            const calls: string[] = []
            let callback: (() => void) | null = null
            class HostileResizeObserver {
                constructor(next: () => void) {
                    if (mode === 'constructor') throw new Error('constructor')
                    callback = next
                }
                observe(target: Element) {
                    if (mode === 'observe') throw new Error('observe')
                    if (mode === 'callback') {
                        Object.defineProperty(target, 'getBoundingClientRect', { value: () => { throw new Error('rect') } })
                        callback?.()
                    }
                }
                disconnect() {
                    if (mode === 'disconnect') throw new Error('disconnect')
                }
            }
            vi.stubGlobal('ResizeObserver', HostileResizeObserver)
            const host = document.createElement('div')
            document.body.append(host)
            const app = createApp(TalosMotionStage, {
                registry: fakeRegistry(calls),
                requestedMode: 'static',
                effectiveMode: 'static',
                sceneId: 'forge',
                paused: false,
                input: input(),
            })
            apps.push(app)

            expect(() => app.mount(host)).not.toThrow()
            await nextTick()
            expect(() => app.unmount()).not.toThrow()
            expect(calls.filter((call) => call === 'static:dispose')).toHaveLength(1)
            apps.splice(apps.indexOf(app), 1)
            document.body.replaceChildren()
            vi.unstubAllGlobals()
        }
    })

    it('reuses the recovered renderer for reactive input updates', async () => {
        const calls: string[] = []
        const complexCreate = vi.fn(() => { throw new Error('complex') })
        const simpleCreate = vi.fn(() => ({
            kind: 'simple' as const,
            mount: () => calls.push('simple:mount'),
            renderOrUpdate: () => calls.push('simple:render'),
            resize: () => calls.push('simple:resize'),
            pause: () => calls.push('simple:pause'),
            resume: () => calls.push('simple:resume'),
            dispose: () => calls.push('simple:dispose'),
        }))
        const host = document.createElement('div')
        document.body.append(host)
        const currentInput = ref(input())
        const app = createApp(defineComponent({
            setup: () => () => h(TalosMotionStage, {
                registry: fallbackRegistry(calls, { complex: complexCreate, simple: simpleCreate }),
                requestedMode: 'complex',
                effectiveMode: 'complex',
                sceneId: 'forge',
                paused: false,
                input: currentInput.value,
            }),
        }))
        apps.push(app)
        app.mount(host)
        await nextTick()

        currentInput.value = input({ width: 900, height: 500, pixelRatio: 1 })
        await nextTick()

        expect(complexCreate).toHaveBeenCalledTimes(1)
        expect(simpleCreate).toHaveBeenCalledTimes(1)
        expect(calls.filter((call) => call === 'simple:render')).toHaveLength(2)
    })

    it('restores the measured renderer viewport after a reactive sentinel input update', async () => {
        const resize = vi.fn()
        const instance = (): SceneInstance => ({
            kind: 'static',
            mount: vi.fn(),
            renderOrUpdate: vi.fn(),
            resize,
            pause: vi.fn(),
            resume: vi.fn(),
            dispose: vi.fn(),
        })
        const registry: SceneRegistry = {
            lookup: (id, kind) => id === 'forge' && kind === 'static'
                ? { id, kind, factory: instance, assets: [] }
                : null,
            create: (id, kind) => id === 'forge' && kind === 'static' ? instance() : null,
            snapshot: () => [{ id: 'forge', kind: 'static', factory: instance, assets: [] }],
        }
        const host = document.createElement('div')
        document.body.append(host)
        const currentInput = ref(input())
        const app = createApp(defineComponent({
            setup: () => () => h(TalosMotionStage, {
                registry,
                requestedMode: 'static',
                effectiveMode: 'static',
                sceneId: 'forge',
                paused: false,
                input: currentInput.value,
            }),
        }))
        apps.push(app)
        app.mount(host)
        await nextTick()

        const target = host.querySelector('[data-talos-motion-renderer-target]') as HTMLElement
        Object.defineProperty(target, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({
                width: 640,
                height: 360,
                top: 0,
                right: 640,
                bottom: 360,
                left: 0,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }),
        })

        currentInput.value = input({ width: 1, height: 1, pixelRatio: 1 })
        await nextTick()

        expect(resize).toHaveBeenLastCalledWith({ width: 640, height: 360, pixelRatio: 1 })
    })
})
