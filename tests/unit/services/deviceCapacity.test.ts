import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The measurements that decide whether a four-gigabyte download is offered.
 *
 * Every assertion here is about refusing to invent. A default value in this
 * file is how an app tells someone a model will run on their phone, takes four
 * gigabytes of their data allowance, and then fails to open it.
 */
const bridge = vi.hoisted(() => ({
    measure: vi.fn(async () => ({
        totalRamBytes: 8_000_000_000,
        availableRamBytes: 3_000_000_000,
        lowMemoryThresholdBytes: 300_000_000,
        freeStorageBytes: 40_000_000_000,
        abiSupported: true,
        thermal: 'light',
        memoryBandwidthBytesPerSecond: 12_000_000_000,
        deviceModel: 'Pixel 9',
        androidSdk: 36,
    })),
    thermalState: vi.fn(async () => ({ thermal: 'severe' })),
    native: true,
}))

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => bridge.native },
    registerPlugin: () => ({ measure: bridge.measure, thermalState: bridge.thermalState }),
}))

beforeEach(() => {
    bridge.native = true
    bridge.measure.mockReset().mockResolvedValue({
        totalRamBytes: 8_000_000_000,
        availableRamBytes: 3_000_000_000,
        lowMemoryThresholdBytes: 300_000_000,
        freeStorageBytes: 40_000_000_000,
        abiSupported: true,
        thermal: 'light',
        memoryBandwidthBytesPerSecond: 12_000_000_000,
        deviceModel: 'Pixel 9',
        androidSdk: 36,
    })
    bridge.thermalState.mockReset().mockResolvedValue({ thermal: 'severe' })
})

describe('measuring the phone', () => {
    it('normalises invalid storage measurements without inventing zero bytes', async () => {
        const { talosNormaliseStorageMeasurement } = await import('@/services/deviceCapacity')

        expect([
            talosNormaliseStorageMeasurement(0),
            talosNormaliseStorageMeasurement(-1),
            talosNormaliseStorageMeasurement(Number.NaN),
            talosNormaliseStorageMeasurement(Number.POSITIVE_INFINITY),
        ]).toEqual([null, null, null, null])
        expect(talosNormaliseStorageMeasurement(12_345)).toBe(12_345)
    })

    it('hands the fit calculation exactly what the device reported', async () => {
        const { talosMeasureDevice } = await import('@/services/deviceCapacity')

        expect(await talosMeasureDevice()).toEqual({
            totalRamBytes: 8_000_000_000,
            availableRamBytes: 3_000_000_000,
            lowMemoryThresholdBytes: 300_000_000,
            freeStorageBytes: 40_000_000_000,
            abiSupported: true,
            thermal: 'light',
            memoryBandwidthBytesPerSecond: 12_000_000_000,
            deviceModel: 'Pixel 9',
            androidSdk: 36,
            /**
             * Un dispositivo che non dice com'è fatta la sua CPU non produce un
             * numero inventato: `null` e una lista vuota sono un'informazione —
             * «non lo sappiamo» — e chi sceglie i thread deve poterlo
             * distinguere da «un core solo».
             */
            cpuCores: null,
            cpuCapacities: [],
        })
    })

    /**
     * The probe refuses on a phone that cannot spare the buffer — which is the
     * small phone this whole feature exists for. Zero must arrive as null:
     * `fit.ts` reads null as "predict no speed" and zero as a division it
     * should never perform.
     */
    it('turns a refused bandwidth measurement into no answer, not into zero', async () => {
        bridge.measure.mockResolvedValue({
            totalRamBytes: 3_000_000_000,
            availableRamBytes: 400_000_000,
            lowMemoryThresholdBytes: 200_000_000,
            freeStorageBytes: 8_000_000_000,
            abiSupported: true,
            thermal: null,
            memoryBandwidthBytesPerSecond: 0,
            deviceModel: 'A low-end phone',
            androidSdk: 29,
        })
        const { talosMeasureDevice } = await import('@/services/deviceCapacity')

        const measured = await talosMeasureDevice()

        expect(measured?.memoryBandwidthBytesPerSecond).toBeNull()
    })

    it('propagates a refused storage probe as unknown', async () => {
        bridge.measure.mockResolvedValue({
            totalRamBytes: 3_000_000_000,
            availableRamBytes: 400_000_000,
            lowMemoryThresholdBytes: 200_000_000,
            freeStorageBytes: 0,
            abiSupported: true,
            thermal: null,
            memoryBandwidthBytesPerSecond: 5_000_000_000,
            deviceModel: 'A low-end phone',
            androidSdk: 29,
        })
        const { talosMeasureDevice } = await import('@/services/deviceCapacity')

        expect((await talosMeasureDevice())?.freeStorageBytes).toBeNull()
    })

    /** Below API 29 there is no thermal API. That is a fact, not a reason for 'none'. */
    it('does not invent a thermal state the platform never reported', async () => {
        bridge.measure.mockResolvedValue({
            totalRamBytes: 4_000_000_000,
            availableRamBytes: 1_000_000_000,
            lowMemoryThresholdBytes: 200_000_000,
            freeStorageBytes: 8_000_000_000,
            abiSupported: true,
            thermal: null,
            memoryBandwidthBytesPerSecond: 5_000_000_000,
            deviceModel: 'An older phone',
            androidSdk: 28,
        })
        const { talosMeasureDevice } = await import('@/services/deviceCapacity')

        expect((await talosMeasureDevice())?.thermal).toBeNull()
    })

    it('refuses a thermal state it does not recognise rather than passing it on', async () => {
        bridge.thermalState.mockResolvedValue({ thermal: 'toasty' })
        const { talosCurrentThermalState } = await import('@/services/deviceCapacity')

        expect(await talosCurrentThermalState()).toBeNull()
    })

    /**
     * Heat is the measurement that moves while the user watches. A screen that
     * asks once keeps promising a speed the phone has stopped delivering.
     */
    it('can be asked about heat again without re-measuring everything', async () => {
        const { talosCurrentThermalState } = await import('@/services/deviceCapacity')

        expect(await talosCurrentThermalState()).toBe('severe')
        expect(bridge.measure).not.toHaveBeenCalled()
    })

    it('says nothing at all in a browser, where there is nothing to measure', async () => {
        bridge.native = false
        const { talosCurrentThermalState, talosMeasureDevice } = await import('@/services/deviceCapacity')

        expect(await talosMeasureDevice()).toBeNull()
        expect(await talosCurrentThermalState()).toBeNull()
        expect(bridge.measure).not.toHaveBeenCalled()
    })

    it('says nothing rather than throwing when the plugin is unhappy', async () => {
        bridge.measure.mockRejectedValue(new Error('boom'))
        const { talosMeasureDevice } = await import('@/services/deviceCapacity')

        expect(await talosMeasureDevice()).toBeNull()
    })
})
