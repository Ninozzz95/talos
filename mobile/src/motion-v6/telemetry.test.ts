import { describe, expect, expectTypeOf, it } from 'vitest'
import * as telemetryExports from './telemetry'
import {
    MOTION_TELEMETRY_SAMPLE_WINDOW_HARD_CAP,
    createMotionTelemetry,
    type MotionTelemetryDoctorState,
    type MotionTelemetryEffectiveMode,
    type MotionTelemetryFrame,
    type MotionTelemetryQualityTier,
} from './telemetry'

const doctor: MotionTelemetryDoctorState = {
    requestedMode: 'adaptive',
    effectiveMode: 'complex',
    sceneId: 'forge',
    qualityTier: 'balanced',
    fpsCap: 30,
    dpr: 1.25,
    primitiveCount: 12,
    layerCount: 3,
    pauseReason: null,
    fallbackReason: null,
    rendererFaultCount: 0,
    lastTierChange: null,
}

const defaultDoctor = {
    requestedMode: 'adaptive',
    effectiveMode: 'off',
    sceneId: 'forge',
    qualityTier: 'balanced',
    fpsCap: 30,
    dpr: 1,
    primitiveCount: 0,
    layerCount: 0,
    pauseReason: null,
    fallbackReason: null,
    rendererFaultCount: 0,
    lastTierChange: null,
} as const

function frame(timestampMs: number, frameCostMs: number): MotionTelemetryFrame {
    return { timestampMs, frameCostMs }
}

function malformedPropertyShapes<T extends object>(
    create: () => T,
    accessorKey: keyof T,
): unknown[] {
    const withSymbol = create()
    Object.defineProperty(withSymbol, Symbol('private'), {
        enumerable: true,
        value: 'must be rejected',
    })

    const withNonEnumerable = create()
    Object.defineProperty(withNonEnumerable, 'hidden', {
        enumerable: false,
        value: 'must be rejected',
    })

    const withAccessor = create()
    const accessorValue = withAccessor[accessorKey]
    Object.defineProperty(withAccessor, accessorKey, {
        configurable: true,
        enumerable: true,
        get: () => accessorValue,
    })

    const withUnknown = create() as T & { custom?: string }
    withUnknown.custom = 'must be rejected'

    return [withSymbol, withNonEnumerable, withAccessor, withUnknown]
}

describe('Theme Motion Engine V6 bounded telemetry', () => {
    it('exports exact effective mode and quality tier allowlists with separate types', () => {
        const exports = telemetryExports as typeof telemetryExports & {
            MOTION_TELEMETRY_EFFECTIVE_MODES?: readonly string[]
            MOTION_TELEMETRY_QUALITY_TIERS?: readonly string[]
        }

        expect(exports.MOTION_TELEMETRY_EFFECTIVE_MODES).toEqual([
            'off',
            'static',
            'simple',
            'complex',
        ])
        expect(exports.MOTION_TELEMETRY_QUALITY_TIERS).toEqual([
            'low',
            'balanced',
            'high',
        ])
        expect(Object.isFrozen(exports.MOTION_TELEMETRY_EFFECTIVE_MODES)).toBe(true)
        expect(Object.isFrozen(exports.MOTION_TELEMETRY_QUALITY_TIERS)).toBe(true)

        expectTypeOf<MotionTelemetryDoctorState['effectiveMode']>()
            .toEqualTypeOf<MotionTelemetryEffectiveMode>()
        expectTypeOf<MotionTelemetryDoctorState['qualityTier']>()
            .toEqualTypeOf<MotionTelemetryQualityTier>()
        expectTypeOf<Extract<'adaptive', MotionTelemetryEffectiveMode>>()
            .toEqualTypeOf<never>()
        expectTypeOf<Extract<'adaptive', MotionTelemetryQualityTier>>()
            .toEqualTypeOf<never>()

        const requestedMode: MotionTelemetryDoctorState['requestedMode'] = 'adaptive'
        expect(requestedMode).toBe('adaptive')
    })

    it('uses unresolved renderer defaults for initial state and reset', () => {
        const telemetry = createMotionTelemetry({ maxSamples: 2 })
        expect(telemetry.snapshot().doctor).toEqual(defaultDoctor)

        expect(telemetry.updateDoctor({
            effectiveMode: 'complex',
            qualityTier: 'high',
            lastTierChange: {
                from: 'balanced',
                to: 'high',
                timestampMs: 1,
            },
        })).toBe(true)
        telemetry.recordFrame(frame(1, 2))
        telemetry.reset()

        expect(telemetry.snapshot()).toEqual({
            sampleWindowSize: 2,
            sampleCount: 0,
            observedFps: 0,
            frameP50Ms: null,
            frameP95Ms: null,
            doctor: defaultDoctor,
            disposed: false,
        })
    })

    it('accepts adaptive only as requestedMode and rejects it from every effective domain', () => {
        const validRequested = createMotionTelemetry({
            doctor: { ...doctor, requestedMode: 'adaptive' },
        })
        expect(validRequested.snapshot().doctor.requestedMode).toBe('adaptive')
        expect(validRequested.updateDoctor({ requestedMode: 'adaptive' })).toBe(true)

        for (const invalidDoctor of [
            { ...doctor, effectiveMode: 'adaptive' },
            { ...doctor, qualityTier: 'adaptive' },
            {
                ...doctor,
                qualityTier: 'low',
                lastTierChange: { from: 'adaptive', to: 'low', timestampMs: 1 },
            },
            {
                ...doctor,
                qualityTier: 'low',
                lastTierChange: { from: 'balanced', to: 'adaptive', timestampMs: 1 },
            },
        ]) {
            expect(createMotionTelemetry({ doctor: invalidDoctor as never }).snapshot().doctor)
                .toEqual(defaultDoctor)
        }

        const telemetry = createMotionTelemetry({ doctor })
        const before = telemetry.snapshot().doctor
        expect(telemetry.updateDoctor({ effectiveMode: 'adaptive' as never })).toBe(false)
        expect(telemetry.updateDoctor({ qualityTier: 'adaptive' as never })).toBe(false)
        expect(telemetry.updateDoctor({
            qualityTier: 'low',
            lastTierChange: { from: 'adaptive' as never, to: 'low', timestampMs: 1 },
        })).toBe(false)
        expect(telemetry.updateDoctor({
            qualityTier: 'low',
            lastTierChange: { from: 'balanced', to: 'adaptive' as never, timestampMs: 1 },
        })).toBe(false)
        expect(telemetry.recordRendererFault('adaptive' as never)).toBe(false)
        expect(telemetry.snapshot().doctor).toEqual(before)
    })

    it('evicts the oldest samples and calculates nearest-rank p50, p95, and observed FPS', () => {
        const telemetry = createMotionTelemetry({ maxSamples: 4, doctor })

        telemetry.recordFrame(frame(0, 10))
        telemetry.recordFrame(frame(1_000, 20))
        telemetry.recordFrame(frame(2_000, 30))
        telemetry.recordFrame(frame(3_000, 40))

        expect(telemetry.snapshot()).toMatchObject({
            sampleWindowSize: 4,
            sampleCount: 4,
            observedFps: 1,
            frameP50Ms: 20,
            frameP95Ms: 40,
        })

        telemetry.recordFrame(frame(4_000, 5))
        expect(telemetry.snapshot()).toMatchObject({
            sampleCount: 4,
            observedFps: 1,
            frameP50Ms: 20,
            frameP95Ms: 40,
        })
    })

    it('keeps the configured window bounded by the hard cap', () => {
        const telemetry = createMotionTelemetry({
            maxSamples: MOTION_TELEMETRY_SAMPLE_WINDOW_HARD_CAP + 100,
            doctor,
        })

        for (let index = 0; index < MOTION_TELEMETRY_SAMPLE_WINDOW_HARD_CAP + 1; index += 1) {
            expect(telemetry.recordFrame(frame(index, index))).toBe(true)
        }

        expect(telemetry.snapshot()).toMatchObject({
            sampleWindowSize: MOTION_TELEMETRY_SAMPLE_WINDOW_HARD_CAP,
            sampleCount: MOTION_TELEMETRY_SAMPLE_WINDOW_HARD_CAP,
        })
    })

    it('honors optional configuration and partial closed Doctor updates', () => {
        const telemetry = createMotionTelemetry({ maxSamples: 2 })

        expect(telemetry.updateDoctor({ pauseReason: 'manual' })).toBe(true)
        telemetry.recordFrame(frame(0, 1))
        telemetry.recordFrame(frame(1, 2))
        telemetry.recordFrame(frame(2, 3))

        expect(telemetry.snapshot()).toMatchObject({
            sampleWindowSize: 2,
            sampleCount: 2,
            doctor: { pauseReason: 'manual' },
        })
    })

    it('rejects symbol, non-enumerable, accessor, and unknown frame properties', () => {
        for (const malformed of malformedPropertyShapes(
            () => ({ timestampMs: 0, frameCostMs: 1 }),
            'frameCostMs',
        )) {
            const telemetry = createMotionTelemetry()
            expect(telemetry.recordFrame(malformed as MotionTelemetryFrame)).toBe(false)
            expect(telemetry.snapshot().sampleCount).toBe(0)
        }
    })

    it('rejects symbol, non-enumerable, accessor, and unknown option properties', () => {
        for (const malformed of malformedPropertyShapes(
            () => ({ maxSamples: 2 }),
            'maxSamples',
        )) {
            const telemetry = createMotionTelemetry(malformed as never)
            expect(telemetry.snapshot().sampleWindowSize).toBe(120)
        }
    })

    it('rejects symbol, non-enumerable, accessor, and unknown Doctor properties', () => {
        for (const malformed of malformedPropertyShapes(
            () => ({ ...doctor }),
            'dpr',
        )) {
            const telemetry = createMotionTelemetry({
                doctor: malformed as MotionTelemetryDoctorState,
            })
            expect(telemetry.snapshot().doctor).toMatchObject({
                requestedMode: 'adaptive',
                effectiveMode: 'off',
                qualityTier: 'balanced',
            })
        }
    })

    it('rejects symbol, non-enumerable, accessor, and unknown Doctor patch properties', () => {
        for (const malformed of malformedPropertyShapes(
            () => ({ pauseReason: 'manual' as const }),
            'pauseReason',
        )) {
            const telemetry = createMotionTelemetry()
            expect(telemetry.updateDoctor(malformed as never)).toBe(false)
            expect(telemetry.snapshot().doctor.pauseReason).toBeNull()
        }
    })

    it('rejects symbol, non-enumerable, accessor, and unknown tier-change properties', () => {
        for (const malformed of malformedPropertyShapes(
            () => ({ from: 'balanced' as const, to: 'low' as const, timestampMs: 50 }),
            'timestampMs',
        )) {
            const telemetry = createMotionTelemetry({ doctor })
            expect(telemetry.updateDoctor({
                qualityTier: 'low',
                lastTierChange: malformed as never,
            })).toBe(false)
            expect(telemetry.snapshot().doctor.qualityTier).toBe('balanced')
        }
    })

    it('rejects invalid or privacy-unsafe runtime shapes without contaminating metrics', () => {
        const telemetry = createMotionTelemetry({ doctor })

        expect(telemetry.recordFrame({ timestampMs: 0, frameCostMs: -1 })).toBe(false)
        expect(telemetry.recordFrame({ timestampMs: 0, frameCostMs: Number.NaN })).toBe(false)
        expect(telemetry.recordFrame({ timestampMs: 0, frameCostMs: Number.POSITIVE_INFINITY })).toBe(false)
        expect(telemetry.recordFrame({ timestampMs: 0, frameCostMs: 1, prompt: 'do not retain' } as MotionTelemetryFrame)).toBe(false)
        expect(telemetry.recordFrame(frame(10, 1))).toBe(true)
        expect(telemetry.recordFrame(frame(9, 2))).toBe(false)
        expect(telemetry.recordFrame({ timestampMs: -1, frameCostMs: 2 })).toBe(false)

        expect(telemetry.snapshot()).toMatchObject({
            sampleCount: 1,
            frameP50Ms: 1,
            frameP95Ms: 1,
        })
    })

    it('exposes Doctor fields and rejects arbitrary update keys', () => {
        const telemetry = createMotionTelemetry({ doctor })

        expect(telemetry.updateDoctor({
            requestedMode: 'simple',
            effectiveMode: 'static',
            sceneId: 'paper',
            qualityTier: 'low',
            fpsCap: 24,
            dpr: 2,
            primitiveCount: 8,
            layerCount: 2,
            pauseReason: 'hidden',
            fallbackReason: 'unsupported',
            lastTierChange: {
                from: 'balanced',
                to: 'low',
                timestampMs: 50,
            },
        })).toBe(true)
        expect(telemetry.recordRendererFault('simple')).toBe(true)
        expect(telemetry.snapshot().doctor).toEqual({
            requestedMode: 'simple',
            effectiveMode: 'simple',
            sceneId: 'paper',
            qualityTier: 'low',
            fpsCap: 24,
            dpr: 2,
            primitiveCount: 8,
            layerCount: 2,
            pauseReason: 'hidden',
            fallbackReason: 'fault',
            rendererFaultCount: 1,
            lastTierChange: {
                from: 'balanced',
                to: 'low',
                timestampMs: 50,
            },
        })

        expect(telemetry.updateDoctor({ prompt: 'secret' } as never)).toBe(false)
        expect(telemetry.snapshot().doctor.requestedMode).toBe('simple')
    })

    it('enforces atomic, coherent, and non-regressive quality tier changes', () => {
        const invalidPatches = [
            {
                qualityTier: 'low',
                lastTierChange: { from: 'low', to: 'low', timestampMs: 10 },
            },
            {
                qualityTier: 'low',
                lastTierChange: { from: 'balanced', to: 'high', timestampMs: 10 },
            },
            {
                qualityTier: 'low',
                lastTierChange: { from: 'high', to: 'low', timestampMs: 10 },
            },
            { qualityTier: 'low' },
            {
                lastTierChange: { from: 'balanced', to: 'low', timestampMs: 10 },
            },
        ]

        for (const patch of invalidPatches) {
            const telemetry = createMotionTelemetry({ doctor })
            expect(telemetry.updateDoctor(patch as never)).toBe(false)
            expect(telemetry.snapshot().doctor).toEqual(doctor)
        }

        const telemetry = createMotionTelemetry({ doctor })
        expect(telemetry.updateDoctor({
            qualityTier: 'low',
            lastTierChange: { from: 'balanced', to: 'low', timestampMs: 100 },
        })).toBe(true)
        const afterValidChange = telemetry.snapshot().doctor

        expect(telemetry.updateDoctor({
            qualityTier: 'high',
            lastTierChange: { from: 'low', to: 'high', timestampMs: 99 },
        })).toBe(false)
        expect(telemetry.snapshot().doctor).toEqual(afterValidChange)

        expect(telemetry.updateDoctor({
            qualityTier: 'high',
            lastTierChange: { from: 'low', to: 'high', timestampMs: 100 },
        })).toBe(true)
    })

    it('rejects contradictory initial tier evidence', () => {
        const telemetry = createMotionTelemetry({
            doctor: {
                ...doctor,
                lastTierChange: {
                    from: 'low',
                    to: 'high',
                    timestampMs: 10,
                },
            },
        })

        expect(telemetry.snapshot().doctor).toMatchObject({
            qualityTier: 'balanced',
            lastTierChange: null,
        })
    })

    it('records renderer faults atomically and rejects invalid effective modes', () => {
        const telemetry = createMotionTelemetry({ doctor })

        expect(telemetry.recordRendererFault('simple')).toBe(true)
        expect(telemetry.snapshot().doctor).toMatchObject({
            effectiveMode: 'simple',
            rendererFaultCount: 1,
            fallbackReason: 'fault',
        })

        const beforeInvalid = telemetry.snapshot().doctor
        expect(telemetry.recordRendererFault('invalid-mode' as never)).toBe(false)
        expect(telemetry.snapshot().doctor).toEqual(beforeInvalid)
    })

    it('rejects contradictory direct fault state patches', () => {
        const telemetry = createMotionTelemetry()

        expect(telemetry.updateDoctor({ fallbackReason: 'fault' })).toBe(false)
        expect(telemetry.updateDoctor({ rendererFaultCount: 1 } as never)).toBe(false)
        expect(telemetry.snapshot().doctor).toMatchObject({
            rendererFaultCount: 0,
            fallbackReason: null,
        })
    })

    it('requires effective DPR in the range greater than zero through two', () => {
        for (const dpr of [0, -1, 2.01, Number.NaN, Number.POSITIVE_INFINITY]) {
            const fromOptions = createMotionTelemetry({ doctor: { ...doctor, dpr } })
            expect(fromOptions.snapshot().doctor.dpr).toBe(1)

            const fromPatch = createMotionTelemetry({ doctor })
            expect(fromPatch.updateDoctor({ dpr })).toBe(false)
            expect(fromPatch.snapshot().doctor.dpr).toBe(1.25)
        }

        const telemetry = createMotionTelemetry({ doctor })
        expect(telemetry.updateDoctor({ dpr: 2 })).toBe(true)
        expect(telemetry.snapshot().doctor.dpr).toBe(2)
    })

    it('exports and applies the documented nearest-rank percentile convention at edges', () => {
        const exports = telemetryExports as typeof telemetryExports & {
            MOTION_TELEMETRY_PERCENTILE_CONVENTION?: Readonly<{
                method: string
                rankFormula: string
                indexFormula: string
            }>
            calculateMotionTelemetryPercentile?: (
                values: readonly number[],
                percentile: number,
            ) => number | null
        }
        const convention = exports.MOTION_TELEMETRY_PERCENTILE_CONVENTION
        const calculate = exports.calculateMotionTelemetryPercentile

        expect(convention).toEqual({
            method: 'nearest-rank',
            rankFormula: 'ceil(p * n)',
            indexFormula: 'rank - 1',
        })
        expect(Object.isFrozen(convention)).toBe(true)
        expect(typeof calculate).toBe('function')
        if (!calculate) return

        expect(calculate([], 0.95)).toBeNull()
        expect(calculate([7], 0.5)).toBe(7)
        expect(calculate([20, 10], 0.5)).toBe(10)
        expect(calculate([20, 10], 0.95)).toBe(20)
        expect(calculate([30, 10, 20], 1)).toBe(30)
        expect(calculate([10, Number.NaN], 0.5)).toBeNull()
        expect(calculate([10], 0)).toBeNull()
        expect(calculate([10], 1.01)).toBeNull()
    })

    it('returns immutable snapshots without aliases and supports reset/dispose', () => {
        const telemetry = createMotionTelemetry({ maxSamples: 2, doctor })
        telemetry.recordFrame(frame(0, 10))
        telemetry.recordRendererFault('static')

        const snapshot = telemetry.snapshot()
        expect(Object.isFrozen(snapshot)).toBe(true)
        expect(Object.isFrozen(snapshot.doctor)).toBe(true)
        expect(() => {
            ;(snapshot as { sampleCount: number }).sampleCount = 99
        }).toThrow()
        expect(telemetry.snapshot().sampleCount).toBe(1)

        telemetry.reset()
        expect(telemetry.snapshot()).toEqual({
            sampleWindowSize: 2,
            sampleCount: 0,
            observedFps: 0,
            frameP50Ms: null,
            frameP95Ms: null,
            doctor: {
                requestedMode: 'adaptive',
                effectiveMode: 'off',
                sceneId: 'forge',
                qualityTier: 'balanced',
                fpsCap: 30,
                dpr: 1,
                primitiveCount: 0,
                layerCount: 0,
                pauseReason: null,
                fallbackReason: null,
                rendererFaultCount: 0,
                lastTierChange: null,
            },
            disposed: false,
        })

        telemetry.dispose()
        telemetry.dispose()
        expect(telemetry.recordFrame(frame(1, 1))).toBe(false)
        expect(telemetry.recordRendererFault('static')).toBe(false)
        expect(telemetry.updateDoctor({ pauseReason: 'manual' })).toBe(false)
        telemetry.reset()
        expect(telemetry.snapshot().sampleCount).toBe(0)
    })
})
