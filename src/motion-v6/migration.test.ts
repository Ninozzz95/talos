import { describe, expect, it } from 'vitest'
import fixture from '../../tests/fixtures/talos-theme-motion-v6-migration-v1.json'
import {
    createTalosThemeMotionV6FirstSaveDelta,
    resolveTalosThemeMotionV6Migration,
} from './migration'
import { parseTalosMotionV6Preferences } from './contracts'

type FixtureCase = {
    name: string
    input: unknown
    expected?: unknown
    expectedIssues?: Array<{ path: string; code: string }>
}

const cases = fixture.cases as FixtureCase[]

describe('TALOS Theme Motion V6 legacy migration parity fixture', () => {
    for (const testCase of cases) {
        it(testCase.name, () => {
            const result = resolveTalosThemeMotionV6Migration(testCase.input)

            if (testCase.expectedIssues) {
                expect(result.success).toBe(false)
                if (result.success) return
                expect(result.issues.map(({ path, code }) => ({ path, code }))).toEqual(testCase.expectedIssues)
                return
            }

            expect(result).toEqual(testCase.expected)
            if (result.success) {
                expect(parseTalosMotionV6Preferences(result.value).success).toBe(true)
            }
        })
    }

    it('writes only the V6 delta and does not delete legacy keys', () => {
        const result = resolveTalosThemeMotionV6Migration({ theme_motion: 'subtle', theme_motion_disabled: false })
        expect(result.success).toBe(true)
        if (!result.success) return

        const delta = createTalosThemeMotionV6FirstSaveDelta(result.value)
        expect(delta).toEqual({ theme_motion_v6: result.value })
        expect(Object.isFrozen(delta)).toBe(true)
    })

    it('deep-owns and freezes migrated output', () => {
        const result = resolveTalosThemeMotionV6Migration({
            theme_motion: 'normal',
            ui_animation_customization: { duration_scale: 125 },
        })
        expect(result.success).toBe(true)
        if (!result.success) return

        expect(Object.isFrozen(result.value)).toBe(true)
        expect(Object.isFrozen(result.value.interface)).toBe(true)
        expect(Object.isFrozen(result.value.interface.categories)).toBe(true)
        expect(() => {
            ;(result.value.interface.categories as { windows: boolean }).windows = false
        }).toThrow()
    })

    it('rejects hostile root shapes without invoking accessors', () => {
        let getterCalled = false
        const getterRoot = Object.defineProperty({}, 'theme_motion', {
            enumerable: true,
            get: () => {
                getterCalled = true
                return 'cinematic'
            },
        })
        const customPrototype = Object.create({ theme_motion: 'cinematic' })
        customPrototype.theme_motion = 'cinematic'
        const proxy = new Proxy({}, { getOwnPropertyDescriptor: () => { throw new Error('trap') } })

        for (const input of [getterRoot, customPrototype, proxy]) {
            const result = resolveTalosThemeMotionV6Migration(input)
            expect(result.success).toBe(false)
        }
        expect(getterCalled).toBe(false)
    })

    it('rejects a representable non-finite V6 number without legacy fallback', () => {
        const defaults = resolveTalosThemeMotionV6Migration({})
        expect(defaults.success).toBe(true)
        if (!defaults.success) return

        const result = resolveTalosThemeMotionV6Migration({
            theme_motion_v6: { ...defaults.value, speed: Number.NaN },
            theme_motion: 'cinematic',
        })
        expect(result.success).toBe(false)
        if (result.success) return
        expect(result.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({ path: 'theme_motion_v6.speed', code: 'not_finite' }),
        ]))
    })

    it('fails typed for hostile nested UI customization without invoking it', () => {
        let getterCalled = false
        const getterCustomization = Object.defineProperty({}, 'duration_scale', {
            enumerable: true,
            get: () => {
                getterCalled = true
                return 125
            },
        })
        const customObject = Object.create({ duration_scale: 125 })
        const proxy = new Proxy({ duration_scale: 125 }, {
            getOwnPropertyDescriptor: () => { throw new Error('trap') },
        })

        for (const customization of [getterCustomization, customObject, proxy]) {
            const result = resolveTalosThemeMotionV6Migration({ ui_animation_customization: customization })
            expect(result).toEqual({
                success: false,
                issues: [expect.objectContaining({ path: 'ui_animation_customization' })],
            })
        }
        expect(getterCalled).toBe(false)
    })

    it('returns a typed failure for a revoked nested customization proxy', () => {
        const revocable = Proxy.revocable({ duration_scale: 125 }, {})
        revocable.revoke()

        let result: ReturnType<typeof resolveTalosThemeMotionV6Migration> | undefined
        expect(() => {
            result = resolveTalosThemeMotionV6Migration({ ui_animation_customization: revocable.proxy })
        }).not.toThrow()
        expect(result).toEqual({
            success: false,
            issues: [expect.objectContaining({ path: 'ui_animation_customization', code: 'uninspectable_object' })],
        })
    })

    it('ignores unknown customization keys without reading them', () => {
        const customization = Object.defineProperty({ duration_scale: 125 }, 'open_close', {
            enumerable: true,
            get: () => { throw new Error('unknown customization getter must not run') },
        })
        const result = resolveTalosThemeMotionV6Migration({ ui_animation_customization: customization })

        expect(result.success).toBe(true)
        if (!result.success) return
        expect(result.value.interface.duration_scale).toBe(125)
    })

    it('bounds V6 inspection before recursive traversal', () => {
        const oversized = Object.fromEntries(Array.from({ length: 300 }, (_, index) => [`x${index}`, index]))
        const result = resolveTalosThemeMotionV6Migration({ theme_motion_v6: oversized })
        expect(result).toEqual({
            success: false,
            issues: [expect.objectContaining({ path: 'theme_motion_v6' })],
        })
    })

    it('rejects V6 cycles and sparse arrays with bounded typed issues', () => {
        const cycle: Record<string, unknown> = {}
        cycle.self = cycle
        const cycleResult = resolveTalosThemeMotionV6Migration({ theme_motion_v6: cycle })
        expect(cycleResult).toEqual({
            success: false,
            issues: [expect.objectContaining({ path: 'theme_motion_v6.self', code: 'uninspectable_object' })],
        })

        const sparse: unknown[] = []
        sparse.length = 1
        const sparseResult = resolveTalosThemeMotionV6Migration({
            theme_motion_v6: { interface: sparse },
        })
        expect(sparseResult).toEqual({
            success: false,
            issues: [expect.objectContaining({ path: 'theme_motion_v6.interface.0', code: 'uninspectable_object' })],
        })
    })

    it('counts dense array elements instead of the length property', () => {
        const defaults = resolveTalosThemeMotionV6Migration({})
        expect(defaults.success).toBe(true)
        if (!defaults.success) return
        const sixtyFour = resolveTalosThemeMotionV6Migration({
            theme_motion_v6: { ...defaults.value, interface: Array.from({ length: 64 }, (_, index) => index) },
        })
        expect(sixtyFour).toEqual({
            success: false,
            issues: [expect.objectContaining({ path: 'theme_motion_v6.interface', code: 'invalid_type' })],
        })

        const sixtyFive = resolveTalosThemeMotionV6Migration({
            theme_motion_v6: { ...defaults.value, interface: Array.from({ length: 65 }, (_, index) => index) },
        })
        expect(sixtyFive).toEqual({
            success: false,
            issues: [expect.objectContaining({ path: 'theme_motion_v6.interface', code: 'uninspectable_object' })],
        })
    })
})
