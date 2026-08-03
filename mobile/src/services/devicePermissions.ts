import { Capacitor, registerPlugin } from '@capacitor/core'
import type { TalosPermissionState } from '@/lib/permissions/permissionRows'

/**
 * What the device has granted, read fresh every time.
 *
 * NEVER cached in a store. Android resets permissions for apps left unused for
 * a few months — "the same effect as if the user changed your app's access to
 * Deny" — and the user can revoke one in system settings at any moment. A
 * screen that trusts a remembered value will confidently show "Allowed" for a
 * permission that was taken away last week.
 */
interface TalosDevicePermissionsPlugin {
    state(): Promise<{
        notifications: string
        notificationsRuntime: boolean
        microphone: string
        batteryExempt?: boolean
        manufacturer?: string
    }>
    requestNotifications(): Promise<{ state: string }>
    requestBatteryExemption(): Promise<{ opened: boolean, alreadyExempt: boolean, route?: string }>
    openAppSettings(): Promise<{ opened: boolean }>
    openNotificationSettings(): Promise<{ opened: boolean }>
}

const plugin = registerPlugin<TalosDevicePermissionsPlugin>('TalosDevicePermissions')

function asState(value: string): TalosPermissionState {
    switch (value) {
        case 'granted': return 'granted'
        case 'denied': return 'denied'
        case 'prompt-with-rationale': return 'prompt-with-rationale'
        default: return 'prompt'
    }
}

export interface TalosDeviceState {
    microphone: TalosPermissionState
    notifications: TalosPermissionState
    /** False below Android 13, where there is no notification permission. */
    notificationsRuntime: boolean
    biometricHardware: boolean
    /**
     * Se il telefono ha smesso di sospendere TALOS.
     *
     * Non è una comodità: senza, una Deep Research muore tre volte su tre
     * appena si blocca lo schermo — misurato sul OnePlus 13 il 2026-08-03,
     * malgrado il foreground service. E va riletta ogni volta, perché la
     * documentazione OnePlus dice che il sistema la **riazzera da solo**.
     */
    batteryExempt: boolean
    /** Minuscolo, e vuoto quando non lo sappiamo — decide i passi in più. */
    manufacturer: string
}

export async function readTalosDeviceState(): Promise<TalosDeviceState> {
    if (!Capacitor.isNativePlatform()) {
        // The web preview has none of this. Reporting "prompt" there would put
        // buttons on screen that cannot do anything.
        return {
            microphone: 'prompt',
            notifications: 'prompt',
            notificationsRuntime: false,
            biometricHardware: false,
            batteryExempt: false,
            manufacturer: '',
        }
    }
    const [device, biometric] = await Promise.all([
        plugin.state().catch(() => null),
        import('@/services/appLock')
            .then((module) => module.biometricUnlockAvailable())
            .catch(() => false),
    ])
    return {
        microphone: asState(device?.microphone ?? 'prompt'),
        notifications: asState(device?.notifications ?? 'prompt'),
        notificationsRuntime: device?.notificationsRuntime ?? false,
        biometricHardware: biometric,
        // Falso quando il ponte non risponde: meglio dire «da sistemare» e far
        // toccare un pulsante che funziona, che dire «a posto» per una cosa che
        // non abbiamo potuto verificare.
        batteryExempt: device?.batteryExempt === true,
        manufacturer: device?.manufacturer ?? '',
    }
}

export async function requestTalosNotifications(): Promise<TalosPermissionState> {
    const result = await plugin.requestNotifications().catch(() => null)
    return asState(result?.state ?? 'prompt')
}

export async function requestTalosMicrophone(): Promise<void> {
    // Through the dictation service, which owns the plugin that actually holds
    // the permission — asking from two places would leave two caches to
    // disagree about what the user said.
    const { requestTalosDictationPermission } = await import('@/services/dictation')
    await requestTalosDictationPermission()
}

export async function openTalosAppSettings(kind: 'app' | 'notifications' = 'app'): Promise<void> {
    const call = kind === 'notifications'
        ? plugin.openNotificationSettings()
        : plugin.openAppSettings()
    await call.catch(() => undefined)
}

/**
 * Apre la richiesta di esenzione dal risparmio energetico.
 *
 * Non restituisce «concesso»: restituisce «aperto». La scelta la fa l'utente in
 * una schermata di sistema, e l'unico modo onesto di sapere com'è andata è
 * rileggere lo stato al ritorno — che è ciò che il pannello fa già a ogni
 * ritorno in primo piano. Una schermata che dicesse «fatto» perché ha aperto un
 * dialogo mentirebbe alla prima volta che qualcuno preme Annulla.
 */
export async function requestTalosBatteryExemption(): Promise<boolean> {
    const result = await plugin.requestBatteryExemption().catch(() => null)
    return result?.opened === true
}
