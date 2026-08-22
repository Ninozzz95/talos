import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import { Capacitor } from '@capacitor/core'
import { TalosUiError } from '@/i18n/uiErrors'
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
    // Debt S3 (security review): a 4-digit minimum is 10 000 unthrottled
    // candidates against a local verifier. Six digits, and no trivial sequence.
    if (trimmed.length < 6) {
        throw new TalosUiError('TALOS_APP_LOCK_PIN_TOO_SHORT', 'lock.pinTooShort')
    }
    if (isTrivialPin(trimmed)) {
        throw new TalosUiError('TALOS_APP_LOCK_PIN_PREDICTABLE', 'lock.pinPredictable')
    }
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const record: AppLockRecord = {
        salt: toBase64(salt),
        hash: await derive(trimmed, salt, PBKDF2_ITERATIONS),
        iterations: PBKDF2_ITERATIONS,
    }
    await backend.set(APP_LOCK_KEY, JSON.stringify(record))
    // Setup enforces the minimum, so a fresh PIN is never weak.
    await backend.set(WEAK_PIN_KEY, 'false')
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

/** Debt S3: exponential backoff after repeated failures, persisted so it is not
 *  reset by killing the app. Exposed for the lock screen's countdown. */
const ATTEMPTS_KEY = 'talos.app_lock.attempts.v1'
/** Set at the only moment the PIN length is known: a successful verification. */
const WEAK_PIN_KEY = 'talos.app_lock.weak_pin.v1'
const THROTTLE_AFTER = 3
const THROTTLE_STEP_MS = 15_000
const THROTTLE_MAX_MS = 15 * 60_000

interface AttemptRecord { failures: number; blockedUntil: number }

function parseAttempts(raw: unknown): AttemptRecord {
    // SF: the backend returns `unknown` — mirror parseRecord, do not assume.
    if (typeof raw !== 'string' || raw === '') return { failures: 0, blockedUntil: 0 }
    try {
        const value = JSON.parse(raw) as Partial<AttemptRecord>
        return {
            failures: typeof value.failures === 'number' && value.failures >= 0 ? value.failures : 0,
            blockedUntil: typeof value.blockedUntil === 'number' && value.blockedUntil > 0 ? value.blockedUntil : 0,
        }
    } catch {
        return { failures: 0, blockedUntil: 0 }
    }
}

function backoffMs(failures: number): number {
    if (failures < THROTTLE_AFTER) return 0
    const step = 2 ** (failures - THROTTLE_AFTER) * THROTTLE_STEP_MS
    return Math.min(step, THROTTLE_MAX_MS)
}

// SF-MAJOR: the deadline is wall-clock, and Android lets anyone move the clock
// from Settings with no authentication. Two corrections:
//  - the remaining wait is CLAMPED to the backoff the failure count earns, so a
//    clock that was wrong-in-the-future cannot lock the owner out for years;
//  - failures counted in THIS process are held in memory as well, so winding
//    the clock forward clears the deadline but never the count — the next
//    failure re-arms an equal or longer wait instead of starting from zero.
let sessionFailures = 0

function effectiveRemaining(attempts: AttemptRecord, now: number): number {
    const failures = Math.max(attempts.failures, sessionFailures)
    return Math.max(0, Math.min(attempts.blockedUntil - now, backoffMs(failures)))
}

/** Remaining lockout in ms (0 when unlocking is allowed). */
export async function appLockThrottleRemainingMs(
    backend: SecureKeyBackend = defaultBackend,
    now: () => number = Date.now,
): Promise<number> {
    return effectiveRemaining(parseAttempts(await backend.get(ATTEMPTS_KEY)), now())
}

/** Test seam: the in-process failure count is module state by design. */
export function __resetAppLockSessionThrottle(): void {
    sessionFailures = 0
}

export async function verifyAppLockPin(
    pin: string,
    backend: SecureKeyBackend = defaultBackend,
    now: () => number = Date.now,
): Promise<boolean> {
    const record = parseRecord(await backend.get(APP_LOCK_KEY))
    if (!record) return false
    const attempts = parseAttempts(await backend.get(ATTEMPTS_KEY))
    if (effectiveRemaining(attempts, now()) > 0) return false
    try {
        const candidate = await derive(pin.trim(), fromBase64(record.salt), record.iterations)
        if (candidate.length !== record.hash.length) return false
        let diff = 0
        for (let index = 0; index < candidate.length; index += 1) {
            diff |= candidate.charCodeAt(index) ^ record.hash.charCodeAt(index)
        }
        const ok = diff === 0
        if (ok) {
            sessionFailures = 0
            await backend.set(ATTEMPTS_KEY, JSON.stringify({ failures: 0, blockedUntil: 0 }))
            // SF-MAJOR: the 6-digit minimum only ever ran at setup, so every
            // user who armed the lock earlier kept a 4-digit PIN with nothing
            // ever telling them. Flag it at the one moment we know the length.
            await backend.set(WEAK_PIN_KEY, pin.trim().length < 6 ? 'true' : 'false')
        } else {
            const failures = Math.max(attempts.failures, sessionFailures) + 1
            sessionFailures = failures
            await backend.set(ATTEMPTS_KEY, JSON.stringify({
                failures,
                blockedUntil: now() + backoffMs(failures),
            }))
        }
        return ok
    } catch {
        return false
    }
}

/** 000000, 123456, 121212, 112233 and friends: the first guesses anyone makes. */
function isTrivialPin(pin: string): boolean {
    const codes = [...pin].map((char) => char.charCodeAt(0))
    const ascending = codes.every((code, index) => index === 0 || code === codes[index - 1]! + 1)
    const descending = codes.every((code, index) => index === 0 || code === codes[index - 1]! - 1)
    if (ascending || descending) return true
    // SF-MINOR: an all-same PIN is period 1, so the period scan covers it.
    for (let period = 1; period <= Math.floor(codes.length / 2); period += 1) {
        if (codes.length % period !== 0) continue
        if (codes.every((code, index) => code === codes[index % period]!)) return true
    }
    // Doubled runs (112233, 445566) read as two-digit sequences.
    const pairs = codes.filter((_, index) => index % 2 === 0)
    if (codes.length % 2 === 0
        && codes.every((code, index) => code === codes[index - (index % 2)]!)
        && pairs.every((code, index) => index === 0 || code === pairs[index - 1]! + 1)) return true
    return false
}

/** True when the stored PIN was last verified with fewer than 6 digits. */
export async function appLockPinIsWeak(backend: SecureKeyBackend = defaultBackend): Promise<boolean> {
    return await backend.get(WEAK_PIN_KEY) === 'true'
}

export async function hasAppLockPin(backend: SecureKeyBackend = defaultBackend): Promise<boolean> {
    return parseRecord(await backend.get(APP_LOCK_KEY)) !== null
}

export async function clearAppLock(backend: SecureKeyBackend = defaultBackend): Promise<void> {
    await backend.remove(APP_LOCK_KEY)
    // The lockout must not outlive the lock it belongs to.
    sessionFailures = 0
    await backend.remove(ATTEMPTS_KEY)
    await backend.remove(WEAK_PIN_KEY)
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
