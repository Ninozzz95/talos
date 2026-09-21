import { Capacitor, registerPlugin } from '@capacitor/core'
import type { TalosDeviceCapacity, TalosThermalState } from '@/lib/models/fit'

/**
 * The measurements `fit.ts` has been waiting for.
 *
 * That file could answer "will this model run on THIS phone" from the day it
 * was written and was never asked, because nothing measured the device. This
 * is the missing half, and it is deliberately LIVE: available memory and
 * thermal state change while someone reads the list, and an answer computed
 * from a spec sheet is wrong precisely when it matters — on a warm phone with
 * three other apps open, which is the normal condition rather than the edge.
 *
 * On the web there is nothing to measure and nothing is invented. The caller
 * gets null and the screen says it cannot tell, which is worth more than a
 * confident number about a device we cannot see.
 */
interface TalosDeviceCapacityPlugin {
    measure(): Promise<{
        totalRamBytes: number
        availableRamBytes: number
        lowMemoryThresholdBytes: number
        freeStorageBytes: number
        abiSupported: boolean
        thermal: string | null
        memoryBandwidthBytesPerSecond: number | null
        deviceModel: string
        androidSdk: number
        cpuCores?: number
        cpuCapacities?: number[]
    }>
    thermalState(): Promise<{ thermal: string | null }>
}

const plugin = registerPlugin<TalosDeviceCapacityPlugin>('TalosDeviceCapacity')

const THERMAL: readonly TalosThermalState[] = ['none', 'light', 'moderate', 'severe', 'critical']

function thermalOf(value: string | null): TalosThermalState | null {
    return THERMAL.find((state) => state === value) ?? null
}

export interface TalosMeasuredDevice extends TalosDeviceCapacity {
    deviceModel: string
    androidSdk: number
    /** Quanti core, o null se il dispositivo non l'ha detto. */
    cpuCores: number | null
    /** La capacità di ciascuno, 1024 = il più forte. Vuota se il kernel tace. */
    cpuCapacities: readonly number[]
}

/** A refused or malformed StorageManager probe is absence, never zero space. */
export function talosNormaliseStorageMeasurement(value: number): number | null {
    return Number.isFinite(value) && value > 0 ? value : null
}

/**
 * Measure, or say plainly that we cannot.
 *
 * Null rather than a default. Every field here decides whether a four-gigabyte
 * download is offered, and a default would decide it on invented evidence —
 * which is how an app tells someone a model will run and then fails to open it.
 */
export async function talosMeasureDevice(): Promise<TalosMeasuredDevice | null> {
    if (!Capacitor.isNativePlatform()) return null
    try {
        const measured = await plugin.measure()
        return {
            totalRamBytes: measured.totalRamBytes,
            availableRamBytes: measured.availableRamBytes,
            lowMemoryThresholdBytes: measured.lowMemoryThresholdBytes,
            freeStorageBytes: talosNormaliseStorageMeasurement(measured.freeStorageBytes),
            abiSupported: measured.abiSupported,
            thermal: thermalOf(measured.thermal),
            // Zero is the probe refusing, not a phone with no memory bus. It has
            // to arrive as null, because `fit.ts` reads null as "predict no
            // speed" and zero as a division it should never do.
            memoryBandwidthBytesPerSecond: measured.memoryBandwidthBytesPerSecond
                ? measured.memoryBandwidthBytesPerSecond
                : null,
            deviceModel: measured.deviceModel,
            androidSdk: measured.androidSdk,
            /**
             * La forma della CPU, non solo il suo numero.
             *
             * MISURATO sul Pad: otto core, sei a capacità 792 e due a 1024. Chi
             * decide quanti thread dare al prefill e quanti alla generazione ha
             * bisogno di questo — riconoscere i chip per nome sarebbe una lista
             * che invecchia a ogni telefono nuovo.
             *
             * Una lista vuota è un'informazione: vuol dire che il kernel non
             * espone `cpu_capacity`, e che di quel dispositivo sappiamo solo
             * quanti core ci sono.
             */
            cpuCores: typeof measured.cpuCores === 'number' && measured.cpuCores > 0
                ? measured.cpuCores
                : null,
            cpuCapacities: Array.isArray(measured.cpuCapacities)
                ? measured.cpuCapacities.filter((n): n is number => typeof n === 'number' && n > 0)
                : [],
        }
    } catch {
        return null
    }
}

/**
 * Ask again about heat alone.
 *
 * This is the measurement that moves under the user's hand: a phone that was
 * comfortable when the list loaded is throttling three minutes into a download.
 * A screen that never re-asks keeps promising a speed the device stopped being
 * able to deliver — so the fit card re-reads this rather than trusting what it
 * was told once.
 */
export async function talosCurrentThermalState(): Promise<TalosThermalState | null> {
    if (!Capacitor.isNativePlatform()) return null
    try {
        return thermalOf((await plugin.thermalState()).thermal)
    } catch {
        return null
    }
}
