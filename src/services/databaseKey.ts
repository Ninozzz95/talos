import { talosDerivaChiaveArgon2id } from '@/lib/backup/backupCrypto'
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
            /*
             * ⛔ UN TETTO. Prima bastava > 0: un record manomesso con due
             * miliardi di iterazioni non e una decifratura che fallisce, e
             * l'app che non si apre piu, con un PIN giusto. Fuori dai limiti
             * si usa il valore che questa versione ha scritto — se il record
             * e stato toccato, la decifratura fallira comunque, ma dopo un
             * tempo umano invece che mai.
             */
            iterations: typeof parsed.iterations === 'number'
                && Number.isInteger(parsed.iterations)
                && parsed.iterations >= LIMITI_V1.min
                && parsed.iterations <= LIMITI_V1.max
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
    /*
     * ⛔⛔ TUTTI E DUE I FORMATI. Un difetto che ho introdotto io e che i test
     * gia scritti hanno preso al primo giro: `protect` scriveva v2 e questa
     * riga riconosceva solo il v1, quindi l'app concludeva che non ci fosse
     * nessun PIN — su un database che invece era protetto.
     *
     * ⇒ Ogni posto che CHIEDE «e protetta?» deve conoscere ogni formato che
     * qualcosa e in grado di scrivere. Aggiungere una versione significa
     * cercare tutti i posti che leggono, non solo quello che apre.
     */
    const grezzo = await backend.get(WRAPPED_KEY)
    if (parseV2(grezzo) === null && parseWrapped(grezzo) === null) return false
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
/**
 * ⛔⛔⛔ IL RECORD DEL PIN, VERSIONE 2 — e la versione è il punto.
 *
 * Il v1 avvolge la chiave del database con PBKDF2-SHA256 a 210.000 iterazioni, e
 * il commento accanto lo chiamava «il valore OWASP». Non lo è più: la guida
 * corrente mette Argon2id come prima scelta, e chiede 600.000 iterazioni a
 * PBKDF2 quando PBKDF2 è obbligato.
 *
 * ⇒ La cura NON è cambiare la costante. Cambiare il numero rompe ogni record già
 * scritto — chi ha un PIN non entra più — e lascia il formato senza un modo di
 * dire quale protezione stia usando. Serve una VERSIONE.
 *
 * ## ⛔ L'intestazione è autenticata
 *
 * Versione, algoritmo e parametri entrano in AES-GCM come dati aggiuntivi. Senza,
 * chi può toccare il record può abbassarli e presentare un file che dichiara una
 * protezione più debole di quella con cui è stato scritto. Con l'AAD quel record
 * semplicemente non si apre: la promessa e il contenuto vivono insieme.
 *
 * ## E i parametri hanno un TETTO anche qui
 *
 * Il v1 accettava qualunque `iterations > 0`. Un record manomesso con due
 * miliardi di iterazioni non è una decifratura che fallisce: è l'app che non si
 * apre più, con un PIN giusto.
 */

/** Argon2id, minimo di riferimento OWASP 2026. */
const ARGON2_PIN = Object.freeze({ memoryKiB: 19_456, iterations: 2, parallelism: 1 })

/**
 * ⛔ Il v1 ha scritto SOLO 210.000. La finestra è larga per non escludere una
 * versione più vecchia che non conosco, e stretta abbastanza da tenere il costo
 * dentro qualcosa che un telefono fa in un tempo umano.
 */
const LIMITI_V1 = Object.freeze({ min: 100_000, max: 1_000_000 })

const LIMITI_V2 = Object.freeze({
    memoryKiB: Object.freeze({ min: 8_192, max: 262_144 }),
    iterations: Object.freeze({ min: 1, max: 16 }),
    parallelism: Object.freeze({ min: 1, max: 8 }),
})

interface WrappedV2 {
    version: 2
    kdf: 'argon2id'
    params: { memoryKiB: number, iterations: number, parallelism: number }
    salt: string
    nonce: string
    ciphertext: string
}

/**
 * ⛔ I byte autenticati: gli stessi campi, nello stesso ordine, sempre. Ordine
 * diverso significa AAD diversa, cioè un record che non si apre più — quindi
 * l'ordine è scritto qui a mano e non lasciato a `JSON.stringify` di un oggetto
 * costruito altrove.
 */
function intestazioneAutenticata(record: Pick<WrappedV2, 'version' | 'kdf' | 'params'>): Uint8Array {
    return new TextEncoder().encode(JSON.stringify({
        version: record.version,
        kdf: record.kdf,
        params: {
            memoryKiB: record.params.memoryKiB,
            iterations: record.params.iterations,
            parallelism: record.params.parallelism,
        },
    }))
}

function parseV2(value: unknown): WrappedV2 | null {
    if (typeof value !== 'string' || value === '') return null
    let parsed: Partial<WrappedV2>
    try { parsed = JSON.parse(value) as Partial<WrappedV2> }
    catch { return null }
    if (parsed.version !== 2 || parsed.kdf !== 'argon2id') return null
    const p = parsed.params
    if (!p || typeof p !== 'object') return null
    const dentro = (valore: unknown, limite: { min: number, max: number }) =>
        typeof valore === 'number' && Number.isInteger(valore)
        && valore >= limite.min && valore <= limite.max
    if (!dentro(p.memoryKiB, LIMITI_V2.memoryKiB)
        || !dentro(p.iterations, LIMITI_V2.iterations)
        || !dentro(p.parallelism, LIMITI_V2.parallelism)) return null
    if (typeof parsed.salt !== 'string' || typeof parsed.nonce !== 'string'
        || typeof parsed.ciphertext !== 'string') return null
    return {
        version: 2, kdf: 'argon2id',
        params: { memoryKiB: p.memoryKiB, iterations: p.iterations, parallelism: p.parallelism },
        salt: parsed.salt, nonce: parsed.nonce, ciphertext: parsed.ciphertext,
    }
}

/**
 * ⛔⛔ La chiave decifrata dev'essere ESATTAMENTE quello che ci aspettiamo.
 *
 * 32 byte in esadecimale, 64 caratteri. Senza questo controllo, una decifratura
 * che riesce per caso — o un record scritto da qualcos'altro — consegnerebbe una
 * stringa qualunque a SQLCipher, che aprirebbe un database illeggibile e
 * sembrerebbe una perdita di dati invece di un errore.
 */
function chiaveValida(candidata: string): boolean {
    return /^[0-9a-f]{64}$/.test(candidata)
}

async function avvolgiV2(chiave: string, pin: string): Promise<WrappedV2> {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const nonce = crypto.getRandomValues(new Uint8Array(12))
    const kek = await talosDerivaChiaveArgon2id(pin, salt, ARGON2_PIN)
    const kekWeb = await crypto.subtle.importKey('raw', kek as BufferSource, 'AES-GCM', false, ['encrypt'])
    const testa = { version: 2 as const, kdf: 'argon2id' as const, params: { ...ARGON2_PIN } }
    const cifrato = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: nonce as BufferSource,
            additionalData: intestazioneAutenticata(testa) as BufferSource,
        },
        kekWeb,
        new TextEncoder().encode(chiave) as BufferSource,
    )
    return {
        ...testa,
        salt: toBase64(salt),
        nonce: toBase64(nonce),
        ciphertext: toBase64(new Uint8Array(cifrato)),
    }
}

async function apriV2(record: WrappedV2, pin: string): Promise<string> {
    const kek = await talosDerivaChiaveArgon2id(pin, fromBase64(record.salt), record.params)
    const kekWeb = await crypto.subtle.importKey('raw', kek as BufferSource, 'AES-GCM', false, ['decrypt'])
    const chiaro = await crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: fromBase64(record.nonce) as BufferSource,
            additionalData: intestazioneAutenticata(record) as BufferSource,
        },
        kekWeb,
        fromBase64(record.ciphertext) as BufferSource,
    )
    return new TextDecoder().decode(chiaro)
}

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
    /*
     * ⛔ Si scrive SEMPRE v2. Il v1 resta solo per aprire cio che esiste gia:
     * un formato vecchio che continua a nascere non e compatibilita, e debito
     * che si rinnova da solo.
     */
    const record = await avvolgiV2(key, pin.trim())
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
    const grezzo = await backend.get(WRAPPED_KEY)

    // ── v2: la strada normale da qui in avanti ───────────────────────────────
    const v2 = parseV2(grezzo)
    if (v2) {
        let chiave: string
        try { chiave = await apriV2(v2, pin.trim()) }
        catch { throw new Error('TALOS_DB_KEY_UNLOCK_FAILED: wrong PIN or damaged record.') }
        if (!chiaveValida(chiave)) {
            throw new Error('TALOS_DB_KEY_UNLOCK_FAILED: wrong PIN or damaged record.')
        }
        cached = chiave
        return chiave
    }

    // ── v1: si apre, e poi si SALE di versione ───────────────────────────────
    const record = parseWrapped(grezzo)
    if (!record) throw new Error('TALOS_DB_KEY_UNLOCK_FAILED: no protected key on this device.')
    let chiave: string
    try {
        const kek = await deriveKek(pin.trim(), fromBase64(record.salt), record.iterations)
        const plain = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: fromBase64(record.iv) as BufferSource },
            kek,
            fromBase64(record.payload) as BufferSource,
        )
        chiave = new TextDecoder().decode(plain)
    } catch {
        throw new Error('TALOS_DB_KEY_UNLOCK_FAILED: wrong PIN or damaged record.')
    }
    if (!chiaveValida(chiave)) {
        throw new Error('TALOS_DB_KEY_UNLOCK_FAILED: wrong PIN or damaged record.')
    }
    cached = chiave

    /*
     * ⛔⛔⛔ LA MIGRAZIONE AVVIENE QUI, E FALLIRE NON DEVE COSTARE NIENTE.
     *
     * Il PIN esiste solo in questo istante: e' l'unico momento in cui si puo'
     * riscrivere il record sotto un Argon2id senza chiedere di nuovo qualcosa
     * alla persona.
     *
     * ⛔ Ma lo sblocco e' GIA' RIUSCITO. Se qualcosa va storto qui — il modulo
     * della derivazione non si carica, la scrittura fallisce — l'unica risposta
     * accettabile e' tenersi il v1 e andare avanti: la persona ha dato il PIN
     * giusto e deve entrare. Un fallimento della migrazione che diventa un
     * fallimento dello sblocco chiuderebbe fuori qualcuno dal proprio database
     * per un miglioramento che non aveva chiesto.
     *
     * ⛔ E il nuovo record si RIAPRE PRIMA DI SCRIVERLO. Scrivere e poi scoprire
     * che non si apre significa aver distrutto l'unica copia funzionante: il
     * controllo va fatto quando il vecchio e' ancora al suo posto, non dopo.
     */
    try {
        const nuovo = await avvolgiV2(chiave, pin.trim())
        const riaperta = await apriV2(nuovo, pin.trim())
        /*
         * ⛔⛔ QUESTA RIGA NON E COPERTA DA UN TEST, e lo dico invece di
         * lasciarlo scoprire a qualcuno.
         *
         * Una mutazione che la toglie NON fa diventare rosso niente: per
         * provarla servirebbe che `avvolgiV2` e `apriV2` — che sono una la
         * coppia dell'altra — si contraddicessero, e non c'e modo di indurlo
         * senza iniettare un guasto nella crittografia.
         *
         * ⇒ Resta comunque. Non protegge da un attacco: protegge da un difetto
         * MIO nella coppia qui sopra. Senza, quel difetto si manifesterebbe
         * come una persona che non entra piu nel proprio database, dopo un
         * aggiornamento, con il PIN giusto in mano. Con, si manifesta come una
         * migrazione che non avviene — e il v1 continua a funzionare.
         *
         * Una riga non coperta che rende un difetto silenzioso invece che
         * catastrofico vale piu della copertura che le manca.
         */
        if (riaperta === chiave) await backend.set(WRAPPED_KEY, JSON.stringify(nuovo))
    } catch {
        // Si resta sul v1. Lo sblocco e' avvenuto, ed e' quello che conta.
    }

    return chiave
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
