import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * Debt S2 (security review): the app shipped with NO FLAG_SECURE, so Android's
 * task snapshot — captured at pause — left the open chat readable in the recents
 * card, and screenshots/screen recording were unrestricted. Web research
 * (Capacitor privacy-screen plugins, Android docs) confirms FLAG_SECURE is the
 * mechanism; this is the same thin native-plugin pattern already used for the
 * per-theme launcher icon, so it costs no new dependency.
 *
 * Applied while the app lock is enabled: a lock whose content can be screenshotted
 * or read from the app switcher is not a lock.
 */
interface TalosPrivacyBridge {
    setSecure(options: { enabled: boolean }): Promise<{ secure: boolean }>
    isDeviceLocked(): Promise<{ locked: boolean; available: boolean }>
}

let bridge: TalosPrivacyBridge | null = null
function plugin(): TalosPrivacyBridge {
    // NEVER await the plugin proxy itself — the Capacitor proxy is thenable
    // (lesson recorded from the dictation hang); only await method results.
    return (bridge ??= registerPlugin<TalosPrivacyBridge>('TalosPrivacy'))
}

/** Fail-soft: privacy is best-effort, it must never break the shell. */
export async function setTalosScreenSecure(enabled: boolean): Promise<void> {
    if (!Capacitor.isNativePlatform()) return
    try {
        await plugin().setSecure({ enabled })
    } catch {
        // A missing/failed plugin must not brick the app; the lock still works.
    }
}

/**
 * Owner 2026-07-29: locking the phone must lock TALOS at once, while switching
 * apps for a moment must not. `appStateChange` reports only that the app went
 * away, never why, so the reason is asked of Android here.
 *
 * False on web and on any failure. That direction is deliberate: treating an
 * unavailable answer as "the device is locked" would demand a PIN every time
 * the user glanced at a notification, and a lock people turn off protects
 * nothing. The grace window remains the safety net underneath.
 */
export async function talosDeviceIsLocked(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false
    try {
        const result = await plugin().isDeviceLocked()
        return result.available === true && result.locked === true
    } catch {
        return false
    }
}
