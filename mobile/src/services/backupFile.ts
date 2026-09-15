import type { TalosBackupSection } from '@/lib/backup/bundle'
import {
    talosDecryptBackup,
    talosEncryptBackup,
    type TalosBackupEnvelope,
} from '@/lib/backup/backupCrypto'
import type { TalosBackupBundle } from '@/services/backupExport'
import type { TalosBackupFile } from '@/services/backupImport'

/**
 * Il backup come FILE: dove va, e come si rilegge.
 *
 * ## ⛔ Dove NON va, e perché l'ho sbagliato una volta
 *
 * La prima stesura scriveva in `Directory.Documents`. È l'errore esatto: la
 * documentazione Capacitor dice che su Android 10 quella cartella «non è
 * accessibile senza legacy External Storage», e che su Android 11+ «l'app può
 * accedere solo ai file che ha creato». Un backup lì dentro **sparisce con la
 * disinstallazione** — cioè proprio nel caso per cui esiste.
 *
 * La strada giusta è **SAF**: il file va dove lo mette l'utente, con il
 * selettore di sistema. Fuori dal mondo dell'app per costruzione, quindi
 * sopravvive alla disinstallazione; nessun permesso di storage da chiedere; e
 * l'utente sa dov'è, che è ciò che conta il giorno in cui serve.
 *
 * È anche quello che fa Agora, che su questo terreno è il concorrente più
 * vicino: `ActivityResultContracts.CreateDocument` per salvare, `OpenDocument`
 * per riaprire. Verificato nel loro sorgente il 2026-08-07.
 *
 * ⭐ E non serviva un plugin nuovo: `TalosFileExport` esiste, fa già SAF, ed è
 * quello che salva i file della Libreria sul dispositivo.
 *
 * ## Un file solo, e leggibile in parte senza la passphrase
 *
 * Il file è JSON, con due metà:
 *
 * ```json
 * { "talos": "backup", "envelope": { … }, "manifest": { … }, "body": "base64" }
 * ```
 *
 * - `envelope` e `manifest` sono **in chiaro**. Devono esserlo: senza
 *   l'envelope non si saprebbe nemmeno con quali parametri provare ad aprire, e
 *   senza il manifesto non si potrebbe dire all'utente cosa c'è dentro **prima**
 *   di chiedergli la passphrase. Un import che chiede la password e poi dice
 *   «guarda, è di un'altra versione» è un giro sprecato.
 * - `body` è il contenuto cifrato: le righe, cioè le conversazioni, i file e —
 *   se richiesto — le chiavi.
 *
 * ⛔ **Il manifesto in chiaro non è un buco**: contiene conteggi, impronte, la
 * build e il modello del dispositivo. Nessun contenuto. È esattamente
 * l'informazione che serve per decidere se vale la pena aprirlo, e nessuna di
 * quella che si vorrebbe nascondere.
 */

const MAGIC = 'talos-backup'

export function talosBackupFileName(createdAt: string): string {
    // Nome ordinabile, senza due punti: alcuni filesystem non li accettano e il
    // file diventa impossibile da copiare proprio quando serve.
    return `TALOS-backup-${createdAt.slice(0, 19).replace(/[:]/g, '')}.talosbak`
}

interface FileSuDisco {
    talos: typeof MAGIC
    envelope: TalosBackupEnvelope
    manifest: unknown
    body: string
}

function base64(bytes: Uint8Array): string {
    let binario = ''
    const blocco = 0x8000
    for (let index = 0; index < bytes.length; index += blocco) {
        binario += String.fromCharCode(...bytes.subarray(index, index + blocco))
    }
    return btoa(binario)
}

function daBase64(value: string): Uint8Array {
    const binario = atob(value)
    const bytes = new Uint8Array(binario.length)
    for (let index = 0; index < binario.length; index += 1) bytes[index] = binario.charCodeAt(index)
    return bytes
}

/** Serializza e cifra. Restituisce il testo del file, pronto da scrivere. */
export async function talosBackupFileText(
    bundle: TalosBackupBundle,
    passphrase: string,
): Promise<string> {
    const chiaro = new TextEncoder().encode(JSON.stringify(bundle.payload))
    const { envelope, ciphertext } = await talosEncryptBackup(chiaro, passphrase)
    const file: FileSuDisco = {
        talos: MAGIC,
        envelope,
        manifest: bundle.manifest,
        body: base64(ciphertext),
    }
    return JSON.stringify(file)
}

export class TalosBackupFileError extends Error {
    readonly code: string
    constructor(code: string, message: string) {
        super(message)
        this.code = code
    }
}

/**
 * Legge la parte IN CHIARO. Non serve la passphrase, ed è voluto: si mostra
 * all'utente cosa contiene il file prima di chiedergliela.
 */
export function talosReadBackupHeader(text: string): {
    envelope: TalosBackupEnvelope
    manifest: unknown
    body: string
} {
    let letto: unknown
    try {
        letto = JSON.parse(text)
    } catch {
        throw new TalosBackupFileError('TALOS_BACKUP_FILE_INVALID', 'This file is not a TALOS backup.')
    }
    const file = letto as Partial<FileSuDisco>
    if (file?.talos !== MAGIC || typeof file.body !== 'string' || file.envelope === undefined) {
        throw new TalosBackupFileError('TALOS_BACKUP_FILE_INVALID', 'This file is not a TALOS backup.')
    }
    return { envelope: file.envelope, manifest: file.manifest, body: file.body }
}

/** Decifra il corpo e restituisce il file nella forma che l'import si aspetta. */
export async function talosOpenBackupFile(
    text: string,
    passphrase: string,
): Promise<TalosBackupFile> {
    const { envelope, manifest, body } = talosReadBackupHeader(text)
    const chiaro = await talosDecryptBackup(envelope, daBase64(body), passphrase)
    let payload: unknown
    try {
        payload = JSON.parse(new TextDecoder().decode(chiaro))
    } catch {
        throw new TalosBackupFileError(
            'TALOS_BACKUP_FILE_CORRUPT',
            'The backup opened but its contents could not be read.',
        )
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new TalosBackupFileError(
            'TALOS_BACKUP_FILE_CORRUPT',
            'The backup opened but its contents are not in the expected shape.',
        )
    }
    return { manifest, payload: payload as Partial<Record<TalosBackupSection, string>> }
}

/**
 * Salva, passando dal selettore di sistema.
 *
 * ⭐ La verifica c'è ancora, e non è prudenza: la scena su disco viene riletta
 * prima di essere consegnata a SAF, perché una scrittura che ritorna senza
 * errore può ancora non essere arrivata. Quello che cambia rispetto a prima è
 * **dove finisce**: lo decide l'utente, e da lì nessuna disinstallazione lo
 * porta via.
 *
 * `cancelled` non è un errore: chi chiude il selettore ha cambiato idea, e
 * trattarlo come un guasto vorrebbe dire mostrargli un allarme rosso per una
 * cosa che ha deciso lui.
 */
export async function talosSaveBackupFile(
    fileName: string,
    text: string,
): Promise<{ saved: boolean, bytes: number }> {
    const { saveTalosVaultFileToDevice } = await import('@/services/saveVaultFileToDevice')
    const bytes = new TextEncoder().encode(text)
    const esito = await saveTalosVaultFileToDevice({
        displayName: fileName,
        // Non `application/json`: un backup non va aperto da un editor per
        // sbaglio, e il tipo generico fa aprire il selettore sulla cartella
        // giusta invece che fra i documenti di testo.
        mediaType: 'application/octet-stream',
        bytes,
    })
    return { saved: esito.status !== 'cancelled', bytes: bytes.byteLength }
}

/**
 * Riapre un backup scelto dall'utente, sempre dal selettore di sistema.
 *
 * Restituisce `null` se ha chiuso il selettore — che non è un errore.
 */
export async function talosPickBackupFile(): Promise<{ name: string, text: string } | null> {
    const { createNativeFilePicker } = await import('@/services/nativeFilePicker')
    const picker = createNativeFilePicker()
    const scelti = await picker.pickFiles()
    const file = scelti[0]
    if (!file) return null
    /*
     * Il selettore restituisce una SORGENTE, non i byte: su Android un URI del
     * documento, sul web un Blob. Sono due strade e vanno tenute entrambe —
     * quella web serve alle prove e allo sviluppo, ed e' l'unica ragione per cui
     * il ramo esiste.
     */
    let testo: string
    if (file.source.kind === 'web-blob') {
        testo = await file.source.blob.text()
    } else {
        const { Filesystem } = await import('@capacitor/filesystem')
        const letto = await Filesystem.readFile({
            path: file.source.uri,
            encoding: 'utf8' as never,
        })
        if (typeof letto.data !== 'string') {
            throw new TalosBackupFileError(
                'TALOS_BACKUP_FILE_UNREADABLE',
                'That file could not be read.',
            )
        }
        testo = letto.data
    }
    return { name: file.name, text: testo }
}
