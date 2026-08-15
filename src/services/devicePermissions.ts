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
        brand?: string
        runtime?: Record<string, string>
    }>
    requestNotifications(): Promise<{ state: string }>
    /**
     * ⭐ Chiede uno dei quattro col dialogo di sistema, e rilegge lo stato.
     *
     * `known: false` quando l'alias non è fra quelli che questa schermata sa
     * chiedere: chi chiama lo dice invece di far finta di aver chiesto.
     */
    requestRuntime(options: { alias: string }): Promise<{ state: string, known: boolean }>
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
    /** Il marchio sulla scocca: un POCO espone `Xiaomi` e `POCO`. */
    brand: string
    /**
     * ⭐⭐ Lo stato dei permessi che si CHIEDONO, riga per riga.
     *
     * Owner 2026-08-14: contatti, calendario, conteggio della posta e
     * fotocamera comparivano nella pagina **senza stato e senza pulsante** —
     * un cerchio vuoto. Cioè la schermata che promette di dire tutto taceva
     * proprio sulla domanda per cui una persona la apre.
     *
     * ⛔ Le chiavi sono gli `id` delle righe, non i nomi di Android: la pagina
     * raggruppa per SCOPO, e `READ_CONTACTS` non è una cosa che qualcuno
     * vuole — mandare un messaggio a una persona sì.
     */
    runtime: Readonly<Record<string, TalosPermissionState>>
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
            brand: '',
            // Fuori da Android non c'è niente da concedere: mappa vuota, e le
            // righe restano mute invece di promettere un pulsante.
            runtime: {},
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
        brand: device?.brand ?? '',
        /*
         * ⛔ Senza ponte la mappa è VUOTA, non piena di «prompt»: una riga
         * senza risposta non deve dire «non richiesto» — che è un fatto — ma
         * tacere, come faceva prima. Fingere uno stato è peggio che non averlo.
         */
        runtime: Object.fromEntries(
            Object.entries(device?.runtime ?? {}).map(([id, valore]) => [id, asState(valore)]),
        ),
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

/**
 * Chiede uno dei quattro permessi di runtime, e torna lo stato RILETTO.
 *
 * ⛔ Torna `null` quando il ponte non c'è o l'alias non è conosciuto: chi
 * chiama non deve poter confondere «non ho potuto chiedere» con «ha detto no».
 */
export async function requestTalosRuntimePermission(
    alias: string,
): Promise<TalosPermissionState | null> {
    const esito = await plugin.requestRuntime({ alias }).catch(() => null)
    if (esito === null || esito.known === false) return null
    return asState(esito.state)
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
