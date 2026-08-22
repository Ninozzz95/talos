import { Capacitor } from '@capacitor/core'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import type { TalosPickedFile } from '@/services/nativeFilePicker'

/**
 * Taking a photo, and choosing photos — the two drawer entries of F-6 that can
 * honestly exist today.
 *
 * The research decided the plugin. Android's Photo Picker grants access to the
 * items the user CHOSE and needs no storage permission at all: the app never
 * gains the right to read the whole gallery. Capacitor's camera plugin routes
 * gallery picks through it, so picking this plugin is picking the permissionless
 * path rather than asking for one and being trusted not to abuse it.
 *
 * The output is deliberately the SAME shape the file picker returns, so the
 * vault, the size guard and the analysis treat a photo exactly like any other
 * attachment. A second parallel path for images is how the image viewer ended
 * up with two different sets of buttons.
 */
export interface TalosNativeCamera {
    takePhoto(): Promise<TalosPickedFile[]>
    pickPhotos(): Promise<TalosPickedFile[]>
}

interface CameraPhoto {
    webPath?: string
    format?: string
}

export interface TalosNativeCameraPort {
    getPhoto(options: Record<string, unknown>): Promise<CameraPhoto>
    pickImages(options: Record<string, unknown>): Promise<{ photos: CameraPhoto[] }>
}

export interface TalosNativeCameraOptions {
    plugin?: TalosNativeCameraPort
    platform?: string
    /** Reading the webPath back as bytes; injected so this is testable. */
    fetchBlob?: (path: string) => Promise<{ blob(): Promise<Blob> }>
}

/**
 * Backing out of the camera is an ordinary act, not a failure — the plugin
 * reports it as an error, so it is recognised and turned back into "nothing
 * happened". Anything else is a real fault and is allowed to surface: a camera
 * that silently returns no photo teaches the user to tap again.
 */
function isCancellation(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
    return message.includes('cancel') || message.includes('no image picked')
}

const EXTENSIONS: Readonly<Record<string, string>> = {
    jpeg: 'jpg', jpg: 'jpg', png: 'png', webp: 'webp', gif: 'gif', heic: 'heic',
}

/**
 * ⛔⛔ IL NOME DELLA FOTO LO LEGGE UNA PERSONA, non un programma.
 *
 * ## Il difetto, visto sul Pad il 2026-08-15
 *
 * Scattata una foto dall'assistente, il gettone diceva:
 *
 *     photo-1786794313985.jpg
 *
 * Owner: «lato UI ci sono delle incongruenze, devi pensare come un **utente
 * umano finale** non come debugger adb». Ha ragione: quel numero è
 * `Date.now()`, e per chi guarda non significa niente. È l'unica cosa che dice
 * COSA hai allegato, e non lo dice.
 *
 * ⇒ Adesso: `Foto 15-08 alle 13.45.jpg`. La stessa informazione — quando —
 * scritta per chi la deve leggere.
 *
 * ⛔ E resta un nome di FILE valido: niente `:` né `/`, che su Android e nelle
 * intestazioni di caricamento rompono. Il punto al posto dei due punti è la
 * scelta che tiene insieme le due cose.
 *
 * ⛔ Vale per TUTTE E DUE le superfici, perché il nome nasce qui: chat e
 * assistente non possono divergere su come si chiama una foto.
 */
function named(format: string | undefined, index: number, now: number): {
    name: string
    mediaType: string
} {
    const key = (format ?? 'jpeg').toLowerCase()
    const extension = EXTENSIONS[key] ?? 'jpg'
    const suffix = index > 0 ? ` (${index + 1})` : ''
    const quando = new Date(now)
    const due = (n: number): string => String(n).padStart(2, '0')
    const giorno = `${due(quando.getDate())}-${due(quando.getMonth() + 1)}`
    const ora = `${due(quando.getHours())}.${due(quando.getMinutes())}`
    return {
        name: `Foto ${giorno} alle ${ora}${suffix}.${extension}`,
        mediaType: extension === 'jpg' ? 'image/jpeg' : `image/${extension}`,
    }
}

export function createTalosNativeCamera(
    options: TalosNativeCameraOptions = {},
): TalosNativeCamera {
    const plugin = options.plugin ?? (Camera as unknown as TalosNativeCameraPort)
    const platform = options.platform ?? Capacitor.getPlatform()
    const fetchBlob = options.fetchBlob ?? ((path: string) => fetch(path))

    async function toPickedFile(
        photo: CameraPhoto,
        index: number,
    ): Promise<TalosPickedFile | null> {
        if (!photo.webPath) return null
        try {
            const blob = await (await fetchBlob(photo.webPath)).blob()
            const { name, mediaType } = named(photo.format, index, Date.now())
            return {
                name,
                // The blob's own type is the honest one when it has it; the
                // plugin's `format` is a hint and is only the fallback.
                declaredMediaType: blob.type || mediaType,
                sizeBytes: blob.size,
                source: { kind: 'web-blob', blob },
            }
        } catch {
            // A picture the app cannot read is not an attachment. Dropping it
            // here beats attaching something that fails later, when the user
            // has already stopped thinking about the picker.
            return null
        }
    }

    return {
        async takePhoto() {
            if (platform === 'web') return []
            let photo: CameraPhoto
            try {
                photo = await plugin.getPhoto({
                    quality: 90,
                    allowEditing: false,
                    resultType: CameraResultType.Uri,
                    source: CameraSource.Camera,
                    saveToGallery: false,
                })
            } catch (error) {
                if (isCancellation(error)) return []
                throw error
            }
            const file = await toPickedFile(photo, 0)
            return file ? [file] : []
        },

        async pickPhotos() {
            if (platform === 'web') return []
            let result: { photos: CameraPhoto[] }
            try {
                result = await plugin.pickImages({ quality: 90 })
            } catch (error) {
                if (isCancellation(error)) return []
                throw error
            }
            const files = await Promise.all(
                (result.photos ?? []).map((photo, index) => toPickedFile(photo, index)),
            )
            return files.filter((file): file is TalosPickedFile => file !== null)
        },
    }
}
