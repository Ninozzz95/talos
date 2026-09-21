import { describe, expect, it } from 'vitest'
import { createDefaultTalosMotionV6Preferences } from '../defaults'
import { getTalosInteractionProfileV6 } from './profiles'
import { resolveTalosInteractionMotion } from './resolver'
import {
    createTalosWindowFlipPlan,
    createTalosWindowPointPlan,
} from './windowGeometry'

function basePlan(intent: 'window-open' | 'window-close' | 'window-minimize' | 'window-restore') {
    const preferences = createDefaultTalosMotionV6Preferences()
    return resolveTalosInteractionMotion({
        intent,
        profile: getTalosInteractionProfileV6('forge')!,
        interfaceEnabled: true,
        reducedMotion: false,
        preferences: preferences.interface,
    })
}

describe('window geometry motion plans', () => {
    it('moves an opening window from the launcher point without changing the semantic timing contract', () => {
        const base = basePlan('window-open')
        const plan = createTalosWindowPointPlan(base, {
            direction: 'enter',
            target: { left: 320, top: 180, width: 640, height: 480 },
            point: { x: 72, y: 240 },
        })

        expect(plan).toMatchObject({
            intent: 'window-open',
            durationMs: base.durationMs,
            easing: base.easing,
            properties: ['transform', 'opacity'],
        })
        expect(plan.keyframes[0].transform).toContain('translate3d(-248px, 60px, 0)')
        expect(plan.keyframes[0].transform).toContain(base.keyframes[0].transform)
        expect(plan.finalStyle).toEqual(base.finalStyle)
        expect(Object.isFrozen(plan)).toBe(true)
        expect(Object.isFrozen(plan.keyframes)).toBe(true)
    })

    it('moves minimize and close exits toward the destination while preserving the profile signature', () => {
        const base = basePlan('window-minimize')
        const plan = createTalosWindowPointPlan(base, {
            direction: 'exit',
            target: { left: 240, top: 120, width: 720, height: 520 },
            point: { x: 48, y: 780 },
        })

        expect(plan.keyframes[0].transform).toBe(base.keyframes[0].transform)
        expect(plan.finalStyle.transform).toContain('translate3d(-192px, 660px, 0)')
        expect(plan.finalStyle.transform).toContain(base.finalStyle.transform)
        expect(plan.finalStyle.opacity).toBe(0)
    })

    it('builds a non-uniform FLIP plan for maximize and unmaximize without animating layout properties', () => {
        const base = basePlan('window-open')
        const plan = createTalosWindowFlipPlan(base, {
            before: { left: 280, top: 150, width: 640, height: 420 },
            after: { left: 20, top: 70, width: 1180, height: 690 },
        })

        expect(plan.keyframes[0].transform).toContain('translate3d(260px, 80px, 0)')
        expect(plan.keyframes[0].transform).toContain('scale(0.5424, 0.6087)')
        expect(plan.finalStyle).toEqual(base.finalStyle)
        expect(plan.keyframes.every((frame) => Object.keys(frame).every((key) => ['transform', 'opacity'].includes(key)))).toBe(true)
    })

    it('leaves an immediate gated plan immediate and exact', () => {
        const preferences = createDefaultTalosMotionV6Preferences()
        const base = resolveTalosInteractionMotion({
            intent: 'window-open',
            profile: getTalosInteractionProfileV6('forge')!,
            interfaceEnabled: false,
            reducedMotion: false,
            preferences: preferences.interface,
        })
        const plan = createTalosWindowPointPlan(base, {
            direction: 'enter',
            target: { left: 320, top: 180, width: 640, height: 480 },
            point: { x: 72, y: 240 },
        })

        expect(plan).toEqual(base)
        expect(plan.enabled).toBe(false)
        expect(plan.durationMs).toBe(0)
    })
})
