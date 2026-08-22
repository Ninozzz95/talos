import { Capacitor, registerPlugin } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { splitGraphemes } from 'unicode-segmenter/grapheme'
import { newTalosMobileId } from '@/lib/mobileIds'

/**
 * A durable copy OUTSIDE the encrypted TALOS Library.
 *
 * This is intentionally not the Open-With service. Open-With owns a temporary
 * Share-sheet URI; this owns Android's Save-As contract and may report success
 * only after the native copy wrote the exact Vault byte count.
 */
export interface TalosDeviceFileSaveInput {
    displayName: string
    mediaType: string
    bytes: Uint8Array
}

export type TalosDeviceFileSaveResult =
    | {
        status: 'saved'
        delivery: 'android-saf'
        bytesWritten: number
        displayName: string
    }
    | {
        status: 'cancelled'
        delivery: 'android-saf'
    }
    | {
        status: 'started'
        delivery: 'browser-download'
        bytesWritten: number
        displayName: string
    }

interface TalosFileExportBridge {
    saveFile(options: {
        sourceUri: string
        displayName: string
        mediaType: string
        expectedBytes: number
    }): Promise<{
        saved: boolean
        bytesWritten?: number
        displayName?: string
    }>
}

export interface TalosDeviceFileSaveRuntime {
    isNative(): boolean
    stage(input: TalosDeviceFileSaveInput): Promise<{
        path: string
        sourceUri: string
    }>
    remove(path: string): Promise<void>
    saveNative(options: {
        sourceUri: string
        displayName: string
        mediaType: string
        expectedBytes: number
    }): Promise<{
        saved: boolean
        bytesWritten?: number
        displayName?: string
    }>
    startWebDownload(input: TalosDeviceFileSaveInput): Promise<void>
}

const FALLBACK_MEDIA_TYPE = 'application/octet-stream'
const MAX_DISPLAY_NAME = 180

/**
 * Quanto grande e' un pezzo dello staging: 3 MiB.
 *
 * Due vincoli lo scelgono, e nessuno dei due e' un gusto personale. Dev'essere
 * **multiplo di 3**, perche' base64 impacchetta 3 byte in 4 caratteri e solo
 * cosi' un pezzo non porta riempimento — 3 MiB lo e' (3 × 1.048.576). E deve
 * stare largo sotto il muro dei ~26 MB oltre il quale la WebView di Android
 * muore: 3 MiB di byte diventano 4 MiB di base64, cioe' 8 MiB in memoria.
 */
export const STAGE_CHUNK_BYTES = 3 * 1024 * 1024
let bridge: TalosFileExportBridge | null = null
let saveActive = false

function plugin(): TalosFileExportBridge {
    // The proxy is thenable; await only its method result.
    return (bridge ??= registerPlugin<TalosFileExportBridge>('TalosFileExport'))
}

function base64FromBytes(bytes: Uint8Array): string {
    let binary = ''
    const chunk = 32_768
    for (let index = 0; index < bytes.length; index += chunk) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
    }
    return btoa(binary)
}

function safeGraphemePrefix(value: string, maxCodeUnits: number): string {
    const limit = Math.min(value.length, Math.max(0, Math.floor(maxCodeUnits)))
    let prefix = ''
    for (const grapheme of splitGraphemes(value)) {
        if (prefix.length + grapheme.length > limit) break
        prefix += grapheme
    }
    return prefix
}

/**
 * Suggested names are labels, never paths. Preserve a short suffix when a long
 * title is bounded so the system picker still identifies the real format.
 */
export function talosSafeExportName(value: string): string {
    let name = value
        .normalize('NFKC')
        .replace(/[\u00ad\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
        .replace(/[/\\:*?"<>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^\.+\s*/, '')
        .trim()
    if (!name || name === '.' || name === '..') return 'file'
    if (name.length <= MAX_DISPLAY_NAME) return name

    const dot = name.lastIndexOf('.')
    const suffix = dot > 0 && name.length - dot <= 17 ? name.slice(dot) : ''
    const stemLimit = MAX_DISPLAY_NAME - suffix.length
    name = `${safeGraphemePrefix(name, stemLimit).trim()}${suffix}`
    return name || 'file'
}

function safeMediaType(value: string): string {
    const mediaType = value.trim().toLowerCase()
    return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mediaType)
        ? mediaType
        : FALLBACK_MEDIA_TYPE
}

/** Chi sa scrivere: il primo pezzo crea il file, i successivi si accodano. */
export interface TalosStageWriter {
    write: (base64: string) => Promise<void>
    append: (base64: string) => Promise<void>
}

/**
 * Mette i byte nella cache **a pezzi**, non in un colpo solo.
 *
 * `writeFile` vuole i byte in base64, e il base64 di un file grosso e' una
 * stringa piu' grande del file stesso: la WebView di Android va in out-of-memory
 * **intorno ai 26 MB** (ionic-team/capacitor#6624). Un allegato della Libreria
 * ci stava dentro; un backup dell'intero workspace no — sul Pad di prova sono
 * gia' 13 MB di dati con due chat sole, e un utente vero ne avrebbe centinaia.
 *
 * Il rimedio e' quello che usa `capacitor-blob-writer` nella sua modalita' di
 * ripiego: si concatena su disco. Tre dettagli decidono se funziona.
 *
 * 1. Il primo pezzo passa da `write`, perche' `appendFile` **non ha
 *    `recursive`**: la cartella `talos-export/` non esisterebbe.
 * 2. Ogni pezzo e' lungo un **multiplo di 3**: base64 impacchetta 3 byte in 4
 *    caratteri, quindi cosi' nessun pezzo porta riempimento (`=`) e i pezzi si
 *    incollano senza rovinarsi. Solo l'ultimo puo' averlo, ed e' l'ultimo.
 * 3. Un file **vuoto** va comunque creato: senza questo il salvataggio di zero
 *    byte fallirebbe con «file assente» invece di produrre un file vuoto.
 */
export async function talosStageInChunks(
    bytes: Uint8Array,
    writer: TalosStageWriter,
    chunkBytes: number = STAGE_CHUNK_BYTES,
): Promise<void> {
    if (bytes.byteLength === 0) {
        await writer.write('')
        return
    }
    for (let inizio = 0; inizio < bytes.byteLength; inizio += chunkBytes) {
        const pezzo = base64FromBytes(bytes.subarray(inizio, inizio + chunkBytes))
        if (inizio === 0) await writer.write(pezzo)
        else await writer.append(pezzo)
    }
}

function defaultRuntime(): TalosDeviceFileSaveRuntime {
    return {
        isNative: () => Capacitor.isNativePlatform(),
        async stage(input) {
            // Random name only: a user-controlled display name must never
            // become part of a private path.
            const path = `talos-export/${newTalosMobileId()}.bin`
            await talosStageInChunks(input.bytes, {
                write: (data) => Filesystem.writeFile({
                    path,
                    data,
                    directory: Directory.Cache,
                    recursive: true,
                }).then(() => undefined),
                append: (data) => Filesystem.appendFile({
                    path,
                    data,
                    directory: Directory.Cache,
                }).then(() => undefined),
            })
            const { uri } = await Filesystem.getUri({
                path,
                directory: Directory.Cache,
            })
            return { path, sourceUri: uri }
        },
        async remove(path) {
            await Filesystem.deleteFile({ path, directory: Directory.Cache })
        },
        saveNative: (options) => plugin().saveFile(options),
        async startWebDownload(input) {
            if (typeof document === 'undefined') {
                throw new Error('TALOS_FILE_EXPORT_FAILED')
            }
            const bytes = input.bytes.slice().buffer
            const url = URL.createObjectURL(new Blob([bytes], { type: input.mediaType }))
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = input.displayName
            anchor.hidden = true
            document.body.append(anchor)
            try {
                anchor.click()
            } finally {
                anchor.remove()
                // Revoking in the same call stack can cancel a download in
                // embedded browsers. One macrotask lets the browser claim it.
                setTimeout(() => URL.revokeObjectURL(url), 0)
            }
        },
    }
}

export async function saveTalosVaultFileToDevice(
    input: TalosDeviceFileSaveInput,
    runtime: TalosDeviceFileSaveRuntime = defaultRuntime(),
): Promise<TalosDeviceFileSaveResult> {
    /*
     * ⛔ Ogni campo ha il suo codice.
     *
     * Prima erano tre cause dietro un nome solo — e lo stesso nome lo usava il
     * lato nativo, per altre tre. Sei strade, una stringa: dal lato di chi
     * chiama non c'era modo di sapere nemmeno se il rifiuto fosse arrivato da
     * qui o dal telefono. Stessa cura del checkpoint di autorizzazione.
     */
    if (!(input.bytes instanceof Uint8Array)) {
        throw new Error('TALOS_FILE_EXPORT_INVALID_BYTES')
    }
    if (typeof input.displayName !== 'string') {
        throw new Error('TALOS_FILE_EXPORT_INVALID_NAME')
    }
    if (typeof input.mediaType !== 'string') {
        throw new Error('TALOS_FILE_EXPORT_INVALID_MEDIA_TYPE')
    }
    if (saveActive) throw new Error('TALOS_FILE_EXPORT_BUSY')

    const normalized: TalosDeviceFileSaveInput = {
        displayName: talosSafeExportName(input.displayName),
        mediaType: safeMediaType(input.mediaType),
        bytes: input.bytes,
    }
    saveActive = true
    try {
        if (!runtime.isNative()) {
            await runtime.startWebDownload(normalized)
            return {
                status: 'started',
                delivery: 'browser-download',
                bytesWritten: normalized.bytes.byteLength,
                displayName: normalized.displayName,
            }
        }

        let staged: Awaited<ReturnType<TalosDeviceFileSaveRuntime['stage']>> | null = null
        try {
            staged = await runtime.stage(normalized)
            const result = await runtime.saveNative({
                sourceUri: staged.sourceUri,
                displayName: normalized.displayName,
                mediaType: normalized.mediaType,
                expectedBytes: normalized.bytes.byteLength,
            })
            if (!result.saved) {
                return { status: 'cancelled', delivery: 'android-saf' }
            }
            if (!Number.isSafeInteger(result.bytesWritten)
                || result.bytesWritten !== normalized.bytes.byteLength) {
                throw new Error('TALOS_FILE_EXPORT_SIZE_MISMATCH')
            }
            return {
                status: 'saved',
                delivery: 'android-saf',
                bytesWritten: result.bytesWritten,
                displayName: talosSafeExportName(result.displayName ?? normalized.displayName),
            }
        } finally {
            if (staged) {
                // Cleanup failure cannot rewrite a verified save into a false
                // failure. Cache is private/reclaimable; the external result is
                // already the user's file.
                await runtime.remove(staged.path).catch(() => undefined)
            }
        }
    } finally {
        saveActive = false
    }
}
