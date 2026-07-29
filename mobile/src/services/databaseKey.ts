import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import { talosBridgeCall } from '@/lib/talosBridge'
import type { SecureKeyBackend } from '@/services/secureKeyStore'

/**
 * Debt S1 — the app lock protected a screen, not the data.
 *
 * `capacitorSqliteRuntime` generated a random SQLCipher secret and handed it to
 * the plugin, which kept it next to the database. "Locked" was therefore a Vue
 * boolean over a database that anything with the APK and the phone could open.
 * Owner decision (2026-07-25): the PIN becomes the real key, with NO recovery.
 *
 * Envelope encryption, the pattern every disk encryptor uses and the one the
 * web research confirmed (DEK/KEK, TrueCrypt-style):
 *  - a random 256-bit DATABASE key (the DEK) that never changes, so changing
 *    the PIN re-wraps 32 bytes instead of re-encrypting every message;
 *  - a KEK derived from the PIN with PBKDF2-SHA256 (210k iterations, OWASP),
 *    which wraps the DEK with AES-GCM — authenticated, so a wrong PIN FAILS
 *    instead of yielding a plausible-looking wrong key.
 *
 * While the lock is off the DEK sits in the OS Keystore exactly as before: that
 * is the honest meaning of "optional lock" the owner chose, and the Settings
 * copy says so.
 */
const PLAIN_KEY = 'talos.db.key.v1'
const WRAPPED_KEY = 'talos.db.key.wrapped.v1'
/**
 * The SECOND wrapping of the same database key — the one a fingerprint opens.
 *
 * Owner 2026-07-26: reopening the app asked only for the PIN. It had to: the
 * key above is sealed by a PBKDF2 derivation of the PIN, and a fingerprint
 * carries no material to derive one. So the key is wrapped twice — by the PIN,
 * which stays the sole authority and the only recovery, and by an AES-256-GCM
 * key held in the Android Keystore that only a live biometric scan releases.
 *
 * What lands in this record is ciphertext and an IV. The unwrapping key never
 * enters this process, so reading the record off the device buys nothing.
 */
const BIOMETRIC_KEY = 'talos.db.key.biometric.v1'

interface BiometricSeal {
    iv: string
    sealed: string
}

function parseSeal(raw: unknown): BiometricSeal | null {
    // `unknown`, like `parseWrapped`: the native store hands back whatever it
    // had, and a non-string there must read as "not armed" rather than throw —
    // this runs before the lock screen paints.
    if (typeof raw !== 'string' || raw === '') return null
    try {
        const value = JSON.parse(raw) as Partial<BiometricSeal>
        return typeof value.iv === 'string' && typeof value.sealed === 'string'
            ? { iv: value.iv, sealed: value.sealed }
            : null
    } catch {
        // A damaged record must read as "not armed" at boot, never throw: this
        // runs before the lock screen paints.
        return null
    }
}
const PBKDF2_ITERATIONS = 210_000

export type TalosDatabaseKeyState = 'absent' | 'device' | 'locked' | 'unlocked'

interface WrappedRecord {
    salt: string
    iv: string
    payload: string
    iterations: number
}

// R1-6: fenced, like secureKeyStore. An unfenced hang here freezes `establish()`
// forever, because the in-flight connect promise is the one every retry awaits.
const defaultBackend: SecureKeyBackend = {
    get: (key) => talosBridgeCall('TALOS_DB_KEY_GET', () => SecureStorage.get(key) as Promise<unknown>),
    set: (key, value) => talosBridgeCall('TALOS_DB_KEY_SET', () => SecureStorage.set(key, value)),
    remove: (key) => talosBridgeCall('TALOS_DB_KEY_REMOVE', () => SecureStorage.remove(key)),
}

/** The unwrapped key lives ONLY here, and only while unlocked. */
let cached: string | null = null

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

function toHex(bytes: Uint8Array): string {
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

function randomKey(): string {
    return toHex(crypto.getRandomValues(new Uint8Array(32)))
}

async function deriveKek(pin: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey'])
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    )
}

function parseWrapped(value: unknown): WrappedRecord | null {
    if (typeof value !== 'string' || value === '') return null
    try {
        const parsed = JSON.parse(value) as Partial<WrappedRecord>
        if (typeof parsed.salt !== 'string' || typeof parsed.iv !== 'string' || typeof parsed.payload !== 'string') {
            return null
        }
        return {
            salt: parsed.salt,
            iv: parsed.iv,
            payload: parsed.payload,
            iterations: typeof parsed.iterations === 'number' && parsed.iterations > 0
                ? parsed.iterations
                : PBKDF2_ITERATIONS,
        }
    } catch {
        return null
    }
}

async function readPlain(backend: SecureKeyBackend): Promise<string | null> {
    const value = await backend.get(PLAIN_KEY)
    return typeof value === 'string' && value.length >= 32 ? value : null
}

export async function talosDatabaseKeyIsProtected(backend: SecureKeyBackend = defaultBackend): Promise<boolean> {
    if (parseWrapped(await backend.get(WRAPPED_KEY)) === null) return false
    // SF: `set(wrapped)` then `remove(plain)` is the safe order, but a failed
    // remove used to leave the key in the clear while the app claimed to be
    // protected. Half-protected is NOT protected — and re-attempting the
    // removal below finishes the job instead of reporting a lie.
    const plain = await readPlain(backend)
    if (!plain) return true
    try {
        await backend.remove(PLAIN_KEY)
        return await readPlain(backend) === null
    } catch {
        return false
    }
}

export async function readTalosDatabaseKeyState(
    backend: SecureKeyBackend = defaultBackend,
): Promise<TalosDatabaseKeyState> {
    if (await talosDatabaseKeyIsProtected(backend)) return cached ? 'unlocked' : 'locked'
    if (cached) return 'device'
    return await readPlain(backend) ? 'device' : 'absent'
}

/**
 * The key for opening the database when the lock is OFF. Fails loudly when the
 * key is PIN-protected and still locked: silently minting a new key there would
 * hand the user a working-looking app over a database they can never read again.
 */
export async function resolveTalosDatabaseKey(backend: SecureKeyBackend = defaultBackend): Promise<string> {
    if (cached) return cached
    // Read the plaintext key FIRST: when both records exist the protection was
    // interrupted, and refusing here would brick an app whose key is right there.
    const existing = await readPlain(backend)
    if (existing) {
        cached = existing
        return existing
    }
    if (await talosDatabaseKeyIsProtected(backend)) {
        throw new Error('TALOS_DB_KEY_LOCKED: the database key is protected by the PIN.')
    }
    const created = randomKey()
    await backend.set(PLAIN_KEY, created)
    cached = created
    return created
}

/**
 * SF-CRITICAL: a key must never be persisted before the database is proven to
 * open with it. `mint` returns one held only in memory; `commit` writes it, and
 * the caller runs the migration in between. Persisting first meant a failed
 * migration left a stored key the database had never seen — and the next
 * attempt then SKIPPED the migration, wrapping a key that opens nothing.
 */
export function mintTalosDatabaseKey(): string {
    return randomKey()
}

export async function commitTalosDatabaseKey(
    key: string,
    backend: SecureKeyBackend = defaultBackend,
): Promise<void> {
    await backend.set(PLAIN_KEY, key)
    cached = key
}

/** Wrap the CURRENT key with a PIN. The database is never re-encrypted. */
export async function protectTalosDatabaseKey(
    pin: string,
    backend: SecureKeyBackend = defaultBackend,
): Promise<void> {
    const key = cached ?? await resolveTalosDatabaseKey(backend)
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const kek = await deriveKek(pin.trim(), salt, PBKDF2_ITERATIONS)
    const payload = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv as BufferSource },
        kek,
        new TextEncoder().encode(key),
    )
    const record: WrappedRecord = {
        salt: toBase64(salt),
        iv: toBase64(iv),
        payload: toBase64(new Uint8Array(payload)),
        iterations: PBKDF2_ITERATIONS,
    }
    await backend.set(WRAPPED_KEY, JSON.stringify(record))
    // Order matters: the wrapped copy exists BEFORE the plaintext one is
    // destroyed, so a crash in between leaves the data recoverable, never lost.
    await backend.remove(PLAIN_KEY)
    cached = key
}

/** Unwrap with the PIN. AES-GCM is authenticated: a wrong PIN throws. */
export async function unlockTalosDatabaseKey(
    pin: string,
    backend: SecureKeyBackend = defaultBackend,
): Promise<string> {
    const record = parseWrapped(await backend.get(WRAPPED_KEY))
    if (!record) throw new Error('TALOS_DB_KEY_UNLOCK_FAILED: no protected key on this device.')
    try {
        const kek = await deriveKek(pin.trim(), fromBase64(record.salt), record.iterations)
        const plain = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: fromBase64(record.iv) as BufferSource },
            kek,
            fromBase64(record.payload) as BufferSource,
        )
        const key = new TextDecoder().decode(plain)
        cached = key
        return key
    } catch {
        throw new Error('TALOS_DB_KEY_UNLOCK_FAILED: wrong PIN or damaged record.')
    }
}

/** Turn the lock off: the key goes back under device-only protection. */
export async function unprotectTalosDatabaseKey(backend: SecureKeyBackend = defaultBackend): Promise<void> {
    if (!cached) throw new Error('TALOS_DB_KEY_LOCKED: unlock before removing the protection.')
    await backend.set(PLAIN_KEY, cached)
    await backend.remove(WRAPPED_KEY)
}

/**
 * The key currently held in memory, or null.
 *
 * Deliberately narrow: it reads the cache and never unwraps, mints or persists
 * anything. Its one caller is the moment just after a verified PIN, where the
 * key is already open and a second door onto it is about to be built.
 */
export function peekTalosDatabaseKey(): string | null {
    return cached
}

/** True when a biometric copy exists, so the lock screen may offer the scan. */
export async function talosBiometricUnlockIsArmed(
    backend: SecureKeyBackend = defaultBackend,
): Promise<boolean> {
    return parseSeal(await backend.get(BIOMETRIC_KEY)) !== null
}

/**
 * Store the biometric copy. Called after the PIN has already proven itself —
 * never as a way to obtain the key, only as a second door onto a key the user
 * has just legitimately opened.
 */
export async function armTalosBiometricUnlock(
    key: string,
    backend: SecureKeyBackend = defaultBackend,
    ports: { wrap?: (secret: string) => Promise<BiometricSeal> } = {},
): Promise<void> {
    const wrap = ports.wrap ?? (async (secret: string) => {
        const { wrapTalosKeyWithBiometrics } = await import('@/services/biometricKeyWrap')
        return wrapTalosKeyWithBiometrics(secret)
    })
    const seal = await wrap(key)
    await backend.set(BIOMETRIC_KEY, JSON.stringify(seal))
}

/** Remove it. Only the PIN opens the database afterwards. */
export async function disarmTalosBiometricUnlock(
    backend: SecureKeyBackend = defaultBackend,
    ports: { forget?: () => Promise<void> } = {},
): Promise<void> {
    await backend.remove(BIOMETRIC_KEY)
    const forget = ports.forget ?? (async () => {
        const { forgetTalosBiometricKey } = await import('@/services/biometricKeyWrap')
        await forgetTalosBiometricKey()
    })
    // The Keystore entry goes too. Leaving it alive would keep a key that can
    // open a blob we have just told the user is gone.
    await forget()
}

/**
 * Open the database with a fingerprint.
 *
 * Every outcome that is NOT "the user changed their mind" drops the biometric
 * copy: if Android invalidated the key because the enrolment changed, the seal
 * is undecryptable from that moment on, and keeping it would mean offering a
 * button that can only ever fail.
 */
export async function unlockTalosDatabaseKeyWithBiometrics(
    backend: SecureKeyBackend = defaultBackend,
    ports: { unwrap?: (seal: BiometricSeal) => Promise<string> } = {},
): Promise<string> {
    const seal = parseSeal(await backend.get(BIOMETRIC_KEY))
    if (!seal) throw new Error('TALOS_BIO_KEY_ABSENT: no biometric copy on this device.')
    const unwrap = ports.unwrap ?? (async (payload: BiometricSeal) => {
        const { unwrapTalosKeyWithBiometrics } = await import('@/services/biometricKeyWrap')
        return unwrapTalosKeyWithBiometrics(payload)
    })
    try {
        const key = await unwrap(seal)
        cached = key
        return key
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!message.includes('TALOS_BIO_KEY_CANCELLED')) {
            await backend.remove(BIOMETRIC_KEY)
        }
        throw error
    }
}

/** Forget the key. After this the database cannot be opened without the PIN. */
export function lockTalosDatabaseKey(): void {
    cached = null
}

/** Test seam: the unwrapped key is module state by design. */
export function __resetTalosDatabaseKeyForTests(): void {
    cached = null
}
