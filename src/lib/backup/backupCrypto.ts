/**
 * La protezione di un backup: Argon2id + AES-256-GCM, e nessun ripiego.
 *
 * ## Perché una passphrase e non il Keystore
 *
 * Perché un backup deve aprirsi **dopo** una reinstallazione, cioè su
 * un'installazione che quella chiave hardware non ce l'ha più. Il legame col
 * Keystore protegge i dati *sul* dispositivo (R32) ed è giusto lì; qui
 * renderebbe il backup inutile proprio nel caso per cui esiste.
 *
 * ## Perché Argon2id, e con quali numeri
 *
 * OWASP 2026 mette **Argon2id** al primo posto, scrypt secondo, bcrypt terzo, e
 * PBKDF2 riservato ai casi FIPS. La configurazione minima raccomandata è
 * **m = 19456 KiB, t = 2, p = 1**, ed è quella che usiamo: su un telefono la
 * memoria è la risorsa che manca, e alzare `m` oltre il minimo raccomandato
 * significa un export che fallisce sul dispositivo di qualcun altro.
 *
 * PBKDF2 sarebbe a costo zero — WebCrypto ce l'ha — ed è la scelta che si fa
 * quando non si vuole una dipendenza. Ma non è memory-hard, ed è la più debole
 * delle quattro contro le GPU. Questo file contiene **le chiavi API e ogni chat
 * privata**, e finisce nei Download: la differenza si sente proprio qui.
 *
 * ## ⛔ Nessun ripiego silenzioso
 *
 * Se Argon2 non si carica, l'export **fallisce e lo dice**. Non scende a
 * PBKDF2, non «continua con meno controlli».
 *
 * È esattamente il difetto che abbiamo visto in casa d'altri il 2026-08-07: il
 * banner sul dispositivo diceva «*security scanner
 * enabled but not available — command scanning will use pattern matching only*»
 * e proseguiva lo stesso. Un sistema che degrada da solo la propria difesa e va
 * avanti ha smesso di difendere e non l'ha detto a nessuno.
 */

/** I parametri, dichiarati e non nascosti in una chiamata. */
export const TALOS_BACKUP_KDF = Object.freeze({
    /** OWASP 2026, minimo raccomandato: 19 MiB. */
    memoryKiB: 19_456,
    iterations: 2,
    parallelism: 1,
    /** 32 byte = la chiave a 256 bit che AES-GCM vuole. */
    keyBytes: 32,
    saltBytes: 16,
    /** 96 bit: la dimensione che GCM raccomanda, e l'unica che non costa un passaggio in più. */
    nonceBytes: 12,
})

export class TalosBackupCryptoError extends Error {
    readonly code: string
    constructor(code: string, message: string) {
        super(message)
        this.code = code
    }
}

/**
 * Deriva la chiave dalla passphrase.
 *
 * `hash-wasm` è importata **a richiesta**: il tetto d'avvio è a 600.000 byte,
 * guadagnati uno per uno, e un backup è una cosa che si fa una volta ogni tanto.
 * Chi non fa backup non deve pagarne il peso all'avvio.
 */
async function derivaChiave(passphrase: string, salt: Uint8Array): Promise<Uint8Array> {
    let argon2id: (options: {
        password: string
        salt: Uint8Array
        parallelism: number
        iterations: number
        memorySize: number
        hashLength: number
        outputType: 'binary'
    }) => Promise<Uint8Array>

    try {
        ({ argon2id } = await import('hash-wasm'))
    } catch (cause) {
        /*
         * ⛔ Qui NON si ripiega su PBKDF2.
         *
         * Un ripiego silenzioso trasforma «protetto con Argon2id» in «protetto
         * con qualcos'altro» senza che nessuno lo sappia — e chi legge il
         * manifesto continuerebbe a leggere «argon2id». Meglio un export che non
         * parte di un export che promette una protezione che non ha.
         */
        throw new TalosBackupCryptoError(
            'TALOS_BACKUP_KDF_UNAVAILABLE',
            'The key-derivation module could not be loaded, so the backup was not written. '
            + 'Nothing was saved with weaker protection.',
        )
    }

    return argon2id({
        password: passphrase,
        salt,
        parallelism: TALOS_BACKUP_KDF.parallelism,
        iterations: TALOS_BACKUP_KDF.iterations,
        memorySize: TALOS_BACKUP_KDF.memoryKiB,
        hashLength: TALOS_BACKUP_KDF.keyBytes,
        outputType: 'binary',
    })
}

/** L'intestazione in chiaro di un file cifrato: serve a poterlo aprire. */
export interface TalosBackupEnvelope {
    readonly kdf: 'argon2id'
    readonly memoryKiB: number
    readonly iterations: number
    readonly parallelism: number
    readonly cipher: 'AES-256-GCM'
    /** base64 */
    readonly salt: string
    /** base64 */
    readonly nonce: string
}

function base64(bytes: Uint8Array): string {
    let binario = ''
    for (const byte of bytes) binario += String.fromCharCode(byte)
    return btoa(binario)
}

function daBase64(value: string): Uint8Array {
    const binario = atob(value)
    const bytes = new Uint8Array(binario.length)
    for (let index = 0; index < binario.length; index += 1) bytes[index] = binario.charCodeAt(index)
    return bytes
}

/**
 * Cifra. Restituisce l'intestazione in chiaro e il corpo cifrato, separati:
 * l'intestazione deve poter essere letta senza la passphrase, altrimenti non si
 * saprebbe nemmeno con quali parametri provare ad aprire.
 */
export interface TalosParametriArgon2id {
    memoryKiB: number
    iterations: number
    parallelism: number
}

/**
 * La derivazione, una sola in tutta l'app.
 *
 * ⛔ Esposta perche' la usa anche il record del PIN. Due copie della stessa
 * derivazione sono due posti dove sbagliare i parametri, e uno dei due lo
 * scoprirebbe qualcuno che non riesce piu ad aprire il proprio database.
 *
 * ⛔ E qui NON si ripiega su PBKDF2 se il modulo non c'e. Un ripiego silenzioso
 * trasforma «protetto con Argon2id» in «protetto con qualcos'altro» senza che
 * nessuno lo sappia.
 */
export async function talosDerivaChiaveArgon2id(
    passphrase: string,
    salt: Uint8Array,
    parametri: TalosParametriArgon2id = TALOS_BACKUP_KDF,
): Promise<Uint8Array> {
    let argon2id: (options: {
        password: string
        salt: Uint8Array
        parallelism: number
        iterations: number
        memorySize: number
        hashLength: number
        outputType: 'binary'
    }) => Promise<Uint8Array>

    try {
        ({ argon2id } = await import('hash-wasm'))
    } catch {
        throw new TalosBackupCryptoError(
            'TALOS_BACKUP_KDF_UNAVAILABLE',
            'The key-derivation module could not be loaded, so nothing was written or opened '
            + 'with weaker protection.',
        )
    }

    return argon2id({
        password: passphrase,
        salt,
        parallelism: parametri.parallelism,
        iterations: parametri.iterations,
        memorySize: parametri.memoryKiB,
        hashLength: TALOS_BACKUP_KDF.keyBytes,
        outputType: 'binary',
    })
}

export async function talosEncryptBackup(
    plaintext: Uint8Array,
    passphrase: string,
): Promise<{ envelope: TalosBackupEnvelope, ciphertext: Uint8Array }> {
    if (passphrase.length === 0) {
        throw new TalosBackupCryptoError(
            'TALOS_BACKUP_PASSPHRASE_EMPTY',
            'A backup that contains your keys and conversations needs a passphrase.',
        )
    }
    const salt = crypto.getRandomValues(new Uint8Array(TALOS_BACKUP_KDF.saltBytes))
    const nonce = crypto.getRandomValues(new Uint8Array(TALOS_BACKUP_KDF.nonceBytes))
    const chiave = await derivaChiave(passphrase, salt)

    const chiaveWeb = await crypto.subtle.importKey('raw', chiave as BufferSource, 'AES-GCM', false, ['encrypt'])
    const cifrato = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce as BufferSource },
        chiaveWeb,
        plaintext as BufferSource,
    )

    return {
        envelope: {
            kdf: 'argon2id',
            memoryKiB: TALOS_BACKUP_KDF.memoryKiB,
            iterations: TALOS_BACKUP_KDF.iterations,
            parallelism: TALOS_BACKUP_KDF.parallelism,
            cipher: 'AES-256-GCM',
            salt: base64(salt),
            nonce: base64(nonce),
        },
        ciphertext: new Uint8Array(cifrato),
    }
}

/**
 * Decifra.
 *
 * ⛔ I parametri si leggono dall'INTESTAZIONE, non dalle nostre costanti: un
 * backup scritto quando i numeri raccomandati erano altri deve continuare ad
 * aprirsi. Ma il nome dell'algoritmo si controlla — un file che dichiara un KDF
 * che non conosciamo non si apre, invece di essere aperto «alla meglio».
 */
/**
 * ⛔⛔⛔ QUANTO LAVORO QUESTO DISPOSITIVO E DISPOSTO A FARE.
 *
 * `talosDecryptBackup` legge memoria, iterazioni e parallelismo dall'intestazione
 * del file, ed e giusto: un backup scritto quando i numeri raccomandati erano
 * altri deve continuare ad aprirsi.
 *
 * Ma li passava ad Argon2id SENZA LIMITI. Un file fabbricato che dichiara
 * `memoryKiB: 4_000_000` chiede quattro gigabyte a un telefono. Non e una
 * decifratura che fallisce: e l'app che si pianta, per un file arrivato via chat.
 *
 * ⇒ Il file dice CON QUALI parametri e stato scritto. Non decide quanto lavoro
 * questa macchina e disposta a fare.
 *
 * ⛔ Sono LIMITI, non raccomandazioni. Il minimo sta sotto i 19 MiB di OWASP
 * apposta — un file vecchio, scritto quando le raccomandazioni erano altre, deve
 * restare leggibile. Il cancello ferma l'assurdo, non il diverso.
 */
export const TALOS_BACKUP_KDF_LIMITI = Object.freeze({
    /** 8 MiB … 256 MiB. Sotto non e un Argon2id serio, sopra un telefono muore. */
    memoryKiB: Object.freeze({ min: 8_192, max: 262_144 }),
    iterations: Object.freeze({ min: 1, max: 16 }),
    parallelism: Object.freeze({ min: 1, max: 8 }),
})

function dentroAiLimiti(envelope: TalosBackupEnvelope): string | null {
    const controlli: Array<[string, number, { min: number, max: number }]> = [
        ['memoryKiB', envelope.memoryKiB, TALOS_BACKUP_KDF_LIMITI.memoryKiB],
        ['iterations', envelope.iterations, TALOS_BACKUP_KDF_LIMITI.iterations],
        ['parallelism', envelope.parallelism, TALOS_BACKUP_KDF_LIMITI.parallelism],
    ]
    for (const [nome, valore, limite] of controlli) {
        if (!Number.isInteger(valore) || valore < limite.min || valore > limite.max) {
            return `${nome}=${String(valore)} (accettati ${limite.min}…${limite.max})`
        }
    }
    return null
}

export async function talosDecryptBackup(
    envelope: TalosBackupEnvelope,
    ciphertext: Uint8Array,
    passphrase: string,
): Promise<Uint8Array> {
    if (envelope.kdf !== 'argon2id' || envelope.cipher !== 'AES-256-GCM') {
        throw new TalosBackupCryptoError(
            'TALOS_BACKUP_ALGORITHM_UNKNOWN',
            'This backup was written with a protection this version does not know how to open.',
        )
    }

    /*
     * ⛔ PRIMA di caricare il modulo e di chiedere memoria. Un file che dichiara
     * quattro gigabyte non deve arrivare fino al punto in cui si prova a
     * darglieli: il difetto non e che la decifratura fallisca, e che la macchina
     * si fermi provandoci.
     */
    const fuori = dentroAiLimiti(envelope)
    if (fuori !== null) {
        throw new TalosBackupCryptoError(
            'TALOS_BACKUP_KDF_PARAMS_REFUSED',
            'This backup declares a protection cost this device will not attempt: ' + fuori + '.',
        )
    }

    let argon2id: (options: {
        password: string
        salt: Uint8Array
        parallelism: number
        iterations: number
        memorySize: number
        hashLength: number
        outputType: 'binary'
    }) => Promise<Uint8Array>
    try {
        ({ argon2id } = await import('hash-wasm'))
    } catch {
        throw new TalosBackupCryptoError(
            'TALOS_BACKUP_KDF_UNAVAILABLE',
            'The key-derivation module could not be loaded, so the backup could not be opened.',
        )
    }

    const chiave = await argon2id({
        password: passphrase,
        salt: daBase64(envelope.salt),
        parallelism: envelope.parallelism,
        iterations: envelope.iterations,
        memorySize: envelope.memoryKiB,
        hashLength: TALOS_BACKUP_KDF.keyBytes,
        outputType: 'binary',
    })

    const chiaveWeb = await crypto.subtle.importKey('raw', chiave as BufferSource, 'AES-GCM', false, ['decrypt'])
    try {
        const chiaro = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: daBase64(envelope.nonce) as BufferSource },
            chiaveWeb,
            ciphertext as BufferSource,
        )
        return new Uint8Array(chiaro)
    } catch {
        /*
         * GCM non distingue «passphrase sbagliata» da «file corrotto»: il tag
         * non torna, e basta. Dirlo come sono davvero le cose è più utile che
         * scegliere una delle due e sbagliare.
         */
        throw new TalosBackupCryptoError(
            'TALOS_BACKUP_OPEN_FAILED',
            'The backup did not open: either the passphrase is wrong, or the file is damaged.',
        )
    }
}

/** L'impronta di una sezione. La stessa che il manifesto dichiara. */
export async function talosBackupDigest(content: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
