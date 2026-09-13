import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createDefaultTalosMotionV6Preferences } from '../defaults'
import {
    TALOS_INTERACTION_INTENTS,
    TALOS_INTERACTION_INTENT_CATEGORIES,
    type TalosInteractionIntent,
} from './intents'
import {
    createDefaultInteractionProfile,
    resolveTalosInteractionMotion,
} from './resolver'
import {
    createDomInteractionMotionPlatform,
    createInteractionMotionController,
    type InteractionAnimationHandle,
    type InteractionMotionPlatform,
} from './controller'

function resolved(intent: TalosInteractionIntent, overrides: Record<string, unknown> = {}) {
    const preferences = createDefaultTalosMotionV6Preferences()
    return resolveTalosInteractionMotion({
        intent,
        profile: createDefaultInteractionProfile(),
        interfaceEnabled: true,
        reducedMotion: false,
        preferences: preferences.interface,
        ...overrides,
    })
}

function harness() {
    const calls: string[] = []
    const callbacks: Array<() => void> = []
    const handles: InteractionAnimationHandle[] = []
    const platform: InteractionMotionPlatform = {
        animate: (_target, _frames, _options, complete) => {
            callbacks.push(complete)
            const handle = { cancel: vi.fn(() => calls.push('cancel')) }
            handles.push(handle)
            calls.push('animate')
            return handle
        },
        applyFinal: (_target, style) => calls.push(`final:${style.transform}:${style.opacity}`),
        captureFocus: () => { calls.push('capture-focus'); return { id: 'focus' } },
        restoreFocus: () => calls.push('restore-focus'),
    }
    return { platform, calls, callbacks, handles }
}

describe('Interaction Motion Kernel V6', () => {
    it('defines the complete semantic intent catalog and category ownership', () => {
        expect(TALOS_INTERACTION_INTENTS).toEqual([
            'window-open', 'window-close', 'window-minimize', 'window-restore', 'window-focus',
            'sidebar-open', 'sidebar-close', 'disclosure-open', 'disclosure-close', 'tab-change',
            'menu-open', 'menu-close', 'popover-open', 'popover-close', 'dropdown-open', 'dropdown-close',
            'composer-expand', 'composer-collapse', 'message-insert', 'activity', 'success', 'warning', 'error',
            'theme-transition',
        ])
        expect(Object.keys(TALOS_INTERACTION_INTENT_CATEGORIES)).toHaveLength(TALOS_INTERACTION_INTENTS.length)
    })

    it.each(TALOS_INTERACTION_INTENTS)('resolves %s to an immutable transform/opacity-only plan', (intent) => {
        const plan = resolved(intent)
        expect(plan.enabled).toBe(true)
        expect(plan.properties).toEqual(['transform', 'opacity'])
        expect(Object.isFrozen(plan)).toBe(true)
        expect(Object.isFrozen(plan.keyframes)).toBe(true)
        expect(plan.keyframes.every((frame) => Object.keys(frame).every((key) => ['transform', 'opacity'].includes(key)))).toBe(true)
        expect(plan.finalStyle).toEqual(plan.keyframes.at(-1))
    })

    it('scales duration, amplitude and stagger from canonical preferences', () => {
        const preferences = createDefaultTalosMotionV6Preferences().interface
        preferences.duration_scale = 150
        preferences.intensity = 50
        preferences.stagger = 40
        const plan = resolved('message-insert', { preferences })
        expect(plan.durationMs).toBe(240)
        expect(plan.delayMs).toBe(40)
        expect(plan.keyframes[0].transform).toContain('translate3d(0px, 6px, 0)')
    })

    it.each([
        ['interface_off', { interfaceEnabled: false }],
        ['reduced_motion', { reducedMotion: true }],
    ] as const)('returns an exact immediate final state for %s', (reason, override) => {
        const plan = resolved('window-open', override)
        expect(plan).toMatchObject({ enabled: false, durationMs: 0, delayMs: 0, reason })
        expect(plan.keyframes).toHaveLength(1)
        expect(plan.keyframes[0]).toEqual(plan.finalStyle)
    })

    it('gates an intent when its semantic category is disabled', () => {
        const preferences = createDefaultTalosMotionV6Preferences().interface
        preferences.categories.windows = false
        expect(resolved('window-minimize', { preferences })).toMatchObject({ enabled: false, reason: 'category_off' })
        expect(resolved('sidebar-open', { preferences }).enabled).toBe(true)
    })

    it('treats the canonical interface profile Off as a global UI motion gate', () => {
        const preferences = createDefaultTalosMotionV6Preferences().interface
        preferences.profile = 'off'
        expect(resolved('menu-open', { preferences })).toMatchObject({ enabled: false, reason: 'interface_off', durationMs: 0 })
    })

    it('uses the canonical custom easing selection without accepting raw CSS', () => {
        const preferences = createDefaultTalosMotionV6Preferences().interface
        preferences.profile = 'custom'
        preferences.easing = 'linear'
        expect(resolved('window-open', { preferences }).easing).toBe('linear')
    })

    it('uses directional easing so exit lifecycles remain visible before completion', () => {
        const preferences = createDefaultTalosMotionV6Preferences().interface
        preferences.profile = 'expressive'
        preferences.easing = 'soft'

        expect(resolved('window-open', { preferences }).easing).toBe('cubic-bezier(0.22, 1, 0.36, 1)')
        expect(resolved('window-close', { preferences }).easing).toBe('cubic-bezier(0.32, 0, 0.67, 0)')
        expect(resolved('window-minimize', { preferences }).easing).toBe('cubic-bezier(0.32, 0, 0.67, 0)')
    })

    it('makes minimal, preset, expressive, and custom profiles visibly distinct', () => {
        const plans = Object.fromEntries(['minimal', 'preset', 'expressive', 'custom'].map((profile) => {
            const preferences = createDefaultTalosMotionV6Preferences().interface
            preferences.profile = profile as typeof preferences.profile
            preferences.easing = 'soft'
            return [profile, resolved('window-open', { preferences })]
        }))

        expect(plans.minimal.durationMs).toBeLessThan(plans.preset.durationMs)
        expect(plans.expressive.durationMs).toBeGreaterThan(plans.preset.durationMs)
        expect(plans.custom.durationMs).toBe(plans.preset.durationMs)
        expect(plans.minimal.keyframes[0].transform).not.toBe(plans.preset.keyframes[0].transform)
        expect(plans.expressive.keyframes[0].transform).not.toBe(plans.preset.keyframes[0].transform)
        expect(plans.minimal.easing).toBe('cubic-bezier(0.22, 1, 0.36, 1)')
        expect(plans.expressive.easing).toBe('cubic-bezier(0.22, 1, 0.36, 1)')
    })

    it('commits the exact final state once and preserves focus on completion', () => {
        const h = harness()
        const complete = vi.fn()
        const controller = createInteractionMotionController(h.platform)
        controller.run('window:one', {}, resolved('window-open'), { onComplete: complete })
        h.callbacks[0]()
        h.callbacks[0]()
        expect(h.calls.filter((call) => call.startsWith('final:'))).toHaveLength(1)
        expect(h.calls.filter((call) => call === 'restore-focus')).toHaveLength(1)
        expect(complete).toHaveBeenCalledOnce()
        expect(controller.pendingCount()).toBe(0)
        expect(h.handles[0].cancel).toHaveBeenCalledOnce()
    })

    it('cancels rapid reversals and suppresses stale callbacks', () => {
        const h = harness()
        const first = vi.fn()
        const second = vi.fn()
        const controller = createInteractionMotionController(h.platform)
        controller.run('sidebar', {}, resolved('sidebar-open'), { onComplete: first })
        controller.run('sidebar', {}, resolved('sidebar-close'), { onComplete: second })
        expect(h.handles[0].cancel).toHaveBeenCalledOnce()
        h.callbacks[0]()
        expect(first).not.toHaveBeenCalled()
        expect(h.calls.filter((call) => call.startsWith('final:'))).toHaveLength(0)
        h.callbacks[1]()
        expect(second).toHaveBeenCalledOnce()
        expect(h.calls.filter((call) => call.startsWith('final:'))).toHaveLength(1)
    })

    it('skips animation but still commits state and focus when UI motion is gated off', () => {
        const h = harness()
        const complete = vi.fn()
        const controller = createInteractionMotionController(h.platform)
        controller.run('composer', {}, resolved('composer-collapse', { reducedMotion: true }), { onComplete: complete })
        expect(h.calls).toEqual(['capture-focus', 'final:translate3d(0px, 0px, 0) scale(1) rotate(0deg):1', 'restore-focus'])
        expect(complete).toHaveBeenCalledOnce()
        expect(h.callbacks).toHaveLength(0)
    })

    it('contains platform faults and lands on the final state without leaking a pending transition', () => {
        const h = harness()
        const brokenPlatform = { ...h.platform, animate: () => { throw new Error('WAAPI failed') } }
        const faults: unknown[] = []
        const controller = createInteractionMotionController(brokenPlatform, { onFault: (fault) => faults.push(fault) })
        expect(() => controller.run('menu', {}, resolved('menu-open'))).not.toThrow()
        expect(h.calls.some((call) => call.startsWith('final:'))).toBe(true)
        expect(faults).toHaveLength(1)
        expect(controller.pendingCount()).toBe(0)
    })

    it('cancels every active transition on dispose without committing stale final states', () => {
        const h = harness()
        const controller = createInteractionMotionController(h.platform)
        controller.run('a', {}, resolved('window-open'))
        controller.run('b', {}, resolved('menu-open'))
        controller.dispose(); controller.dispose()
        expect(h.handles.every((handle) => vi.mocked(handle.cancel).mock.calls.length === 1)).toBe(true)
        h.callbacks.forEach((callback) => callback())
        expect(h.calls.some((call) => call.startsWith('final:'))).toBe(false)
    })

    it('provides a DOM WAAPI adapter with listener cleanup and final style ownership', () => {
        const listeners = new Map<string, () => void>()
        const animation = {
            addEventListener: vi.fn((name: string, callback: () => void) => listeners.set(name, callback)),
            removeEventListener: vi.fn((name: string) => listeners.delete(name)),
            cancel: vi.fn(),
        }
        const element = { style: { transform: '', opacity: '' }, animate: vi.fn(() => animation) }
        const focus = { focus: vi.fn() }
        const documentLike = { activeElement: focus }
        const platform = createDomInteractionMotionPlatform(documentLike as never)
        const complete = vi.fn()
        const handle = platform.animate(element, resolved('window-open').keyframes, { durationMs: 100, delayMs: 0, easing: 'linear' }, complete)
        listeners.get('finish')?.()
        expect(complete).toHaveBeenCalledOnce()
        handle.cancel()
        expect(animation.removeEventListener).toHaveBeenCalled()
        expect(animation.cancel).toHaveBeenCalledOnce()
        platform.applyFinal(element, { transform: 'none', opacity: 1 })
        expect(element.style).toEqual({ transform: 'none', opacity: '1' })
        expect(platform.captureFocus()).toBe(focus)
        platform.restoreFocus(focus)
        expect(focus.focus).toHaveBeenCalledOnce()
    })

    it('ships scoped interaction CSS and a global reduced-motion failsafe', () => {
        const css = readFileSync('src/css/talos-interaction-motion-v6.css', 'utf8')
        expect(css).toContain('[data-talos-motion-intent]')
        expect(css).toContain('transform')
        expect(css).toContain('opacity')
        expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    })

    it('MOTION-CSS-01 keeps composer and Settings motion off the layout pipeline', () => {
        const css = readFileSync('src/css/talos-interaction-motion-v6.css', 'utf8')
        expect(css).toContain('@keyframes talos-composer-layout-expand')
        expect(css).toContain('@keyframes talos-composer-layout-collapse')
        expect(css).toContain('@keyframes talos-settings-tab-change')
        expect(css).toContain('.talos-motion-tab-panel[data-state="active"]')

        const productMotion = css.slice(css.indexOf('@keyframes talos-composer-layout-expand'))
        expect(productMotion).toMatch(/transform\s*:/)
        expect(productMotion).toMatch(/opacity\s*:/)
        expect(productMotion).not.toMatch(
            /\b(?:height|width|min-height|max-height|min-width|max-width|margin|padding|inset|top|right|bottom|left|grid-template|font-size|line-height)\s*:/,
        )

        const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
        expect(reduced).toContain('.talos-motion-tab-panel[data-state="active"]')
        expect(reduced).toMatch(/animation:\s*none\s*!important/)
        expect(reduced).toMatch(/transform:\s*none\s*!important/)
        expect(reduced).toMatch(/opacity:\s*1\s*!important/)
    })
})
