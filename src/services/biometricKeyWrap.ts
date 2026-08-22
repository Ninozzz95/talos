import { registerPlugin } from '@capacitor/core'

/**
 * The database key's SECOND wrapping — the one a fingerprint can open.
 *
 * Owner 2026-07-26: "quando chiudo e riapro l'app non mi chiede il biometrics
 * ... mi chiede solo pin." Not a UI bug. The database key is wrapped by a KEK
 * derived from the PIN, and a fingerprint carries nothing a PBKDF2 derivation
 * can use — so the lock screen deliberately refused biometrics whenever the
 * database was protected, which is always, once a PIN exists.
 *
 * So the same key is wrapped twice: once by the PIN (the authority, and the
 * only recovery), once by an AES-256-GCM key that lives in the Android Keystore
 * and is released only after a live biometric scan (`BiometricPrompt` +
 * `CryptoObject`). The unwrapping key never enters JavaScript, or the app
 * process at all. Stealing the wrapped blob off the device buys nothing.
 *
 * The owner chose this over the cheap version — authenticate, then read a plain
 * key out of secure storage — precisely because that key is readable by
 * anything running as this app, which makes the fingerprint decoration on a
 * rooted phone.
 */
export interface TalosBiometricKeyPayload {
    /** Base64. Public, and useless without the Keystore key. */
    iv: string
    /** Base64 AES-GCM ciphertext of the database key. */
    sealed: string
}

interface TalosBiometricKeyPlugin {
    isAvailable(): Promise<{ available: boolean; enrolled: boolean }>
    wrap(options: { secret: string }): Promise<TalosBiometricKeyPayload>
    unwrap(options: TalosBiometricKeyPayload): Promise<{ secret: string }>
    forget(): Promise<void>
}

/**
 * On the web build the plugin is absent and every call rejects. That is the
 * correct answer, not an inconvenience: a browser has no hardware Keystore, and
 * a JavaScript fallback that "sort of" protects the key would be a lie told in
 * the one place the app promises not to.
 */
const plugin = registerPlugin<TalosBiometricKeyPlugin>('TalosBiometricKey')

/** True when this device has strong biometrics enrolled AND usable right now. */
export async function talosBiometricKeyAvailable(): Promise<boolean> {
    try {
        return (await plugin.isAvailable()).available === true
    } catch {
        return false
    }
}

export async function wrapTalosKeyWithBiometrics(secret: string): Promise<TalosBiometricKeyPayload> {
    return plugin.wrap({ secret })
}

export async function unwrapTalosKeyWithBiometrics(
    payload: TalosBiometricKeyPayload,
): Promise<string> {
    return (await plugin.unwrap(payload)).secret
}

export async function forgetTalosBiometricKey(): Promise<void> {
    try {
        await plugin.forget()
    } catch {
        // Nothing to forget, or no plugin. Either way the next wrap starts over.
    }
}

/**
 * The key was destroyed by the Keystore because the device's biometric
 * enrolment changed — someone added or removed a fingerprint.
 *
 * That is the protection working, not a fault: a thief who can enrol their own
 * finger must not inherit the data. The caller drops the biometric copy and
 * asks for the PIN, which is the only authority anyway.
 */
export function talosBiometricKeyWasInvalidated(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    return message.includes('TALOS_BIO_KEY_INVALIDATED')
}

/** The user dismissed the prompt. Not an error to report — show the PIN pad. */
export function talosBiometricKeyWasCancelled(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    return message.includes('TALOS_BIO_KEY_CANCELLED')
}
