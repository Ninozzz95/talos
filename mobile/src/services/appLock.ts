import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import { Capacitor } from '@capacitor/core'
import type { SecureKeyBackend } from '@/services/secureKeyStore'

/**
 * F2-T6 — app lock. The PIN is NEVER stored: a PBKDF2-SHA256 derivation
 * (210k iterations, 16-byte random salt — OWASP guidance) lives in the OS
 * Keystore next to the provider keys. Verification is fail-closed: a missing
 * or malformed record never unlocks. Biometrics (pinned
 * `@aparajita/capacitor-biometric-auth@10.0.0`, lazy import) are a
 * convenience layer ABOVE the PIN — never a replacement, never faked on web.
 */
const APP_LOCK_KEY = 'talos.applock.v1'
const PBKDF2_ITERATIONS = 210_000

const defaultBackend: SecureKeyBackend = {
    get: (key) => SecureStorage.get(key) as Promise<unknown>,
    set: (key, value) => SecureStorage.set(key, value),
    remove: (key) => SecureStorage.remove(key),
}

interface AppLockRecord {
    salt: string
    hash: string
    iterations: number
}

function toBase64(bytes: Uint8Array): string {
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
}

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
    const material = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(pin),
        'PBKDF2',
        false,
        ['deriveBits'],
    )
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
        material,
        256,
    )
    return toBase64(new Uint8Array(bits))
}

export async function setupAppLockPin(
    pin: string,
    backend: SecureKeyBackend = defaultBackend,
): Promise<void> {
    const trimmed = pin.trim()
    if (trimmed.length < 4) throw new Error('The PIN must be at least 4 characters.')
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const record: AppLockRecord = {
        salt: toBase64(salt),
        hash: await derive(trimmed, salt, PBKDF2_ITERATIONS),
        iterations: PBKDF2_ITERATIONS,
    }
    await backend.set(APP_LOCK_KEY, JSON.stringify(record))
}

function parseRecord(value: unknown): AppLockRecord | null {
    if (typeof value !== 'string' || value === '') return null
    try {
        const parsed = JSON.parse(value) as Partial<AppLockRecord>
        if (typeof parsed.salt !== 'string' || typeof parsed.hash !== 'string') return null
        return {
            salt: parsed.salt,
            hash: parsed.hash,
            iterations: typeof parsed.iterations === 'number' && parsed.iterations > 0
                ? parsed.iterations
                : PBKDF2_ITERATIONS,
        }
    } catch {
        return null
    }
}

export async function verifyAppLockPin(
    pin: string,
    backend: SecureKeyBackend = defaultBackend,
): Promise<boolean> {
    const record = parseRecord(await backend.get(APP_LOCK_KEY))
    if (!record) return false
    try {
        const candidate = await derive(pin.trim(), fromBase64(record.salt), record.iterations)
        if (candidate.length !== record.hash.length) return false
        let diff = 0
        for (let index = 0; index < candidate.length; index += 1) {
            diff |= candidate.charCodeAt(index) ^ record.hash.charCodeAt(index)
        }
        return diff === 0
    } catch {
        return false
    }
}

export async function hasAppLockPin(backend: SecureKeyBackend = defaultBackend): Promise<boolean> {
    return parseRecord(await backend.get(APP_LOCK_KEY)) !== null
}

export async function clearAppLock(backend: SecureKeyBackend = defaultBackend): Promise<void> {
    await backend.remove(APP_LOCK_KEY)
}

/** Biometric availability — honest: false on web or when the device has none. */
export async function biometricUnlockAvailable(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false
    try {
        const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth')
        const result = await BiometricAuth.checkBiometry()
        return result.isAvailable === true
    } catch {
        return false
    }
}

/** Prompt the OS biometric sheet; resolves true ONLY on a real success. */
export async function requestBiometricUnlock(reason: string): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false
    try {
        const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth')
        await BiometricAuth.authenticate({ reason })
        return true
    } catch {
        return false
    }
}
