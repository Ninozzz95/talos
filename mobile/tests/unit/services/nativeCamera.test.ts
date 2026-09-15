import { describe, expect, it, vi } from 'vitest'
import { createTalosNativeCamera } from '@/services/nativeCamera'

/**
 * F-6, the two drawer entries that can honestly exist: Camera and Photos.
 *
 * Research (2026): Android's Photo Picker is the recommended way to let a user
 * hand over pictures, because it grants access to the CHOSEN items only and
 * needs no storage permission at all — the app never gains the right to read
 * the whole gallery. Capacitor's camera plugin uses it for gallery picks on
 * Android, so choosing this plugin IS choosing the permissionless path.
 *
 * That is why Photos is a separate entry from Attach rather than a duplicate of
 * it: Attach goes through the document picker, and pictures deserve the picker
 * built for pictures.
 *
 * The output is deliberately the SAME shape the file picker returns, so
 * everything downstream — the vault, the size guard, the analysis — treats a
 * photo exactly like any other attachment. A second parallel path for images
 * would be the image-viewer defect all over again.
 */
function plugin(overrides: Record<string, unknown> = {}) {
    return {
        getPhoto: vi.fn(async () => ({ webPath: 'blob:photo', format: 'jpeg' })),
        pickImages: vi.fn(async () => ({
            photos: [
                { webPath: 'blob:a', format: 'jpeg' },
                { webPath: 'blob:b', format: 'png' },
            ],
        })),
        ...overrides,
    }
}

function fetchOf(bytes: number, type: string) {
    return vi.fn(async () => ({ blob: async () => new Blob([new Uint8Array(bytes)], { type }) }))
}

describe('taking a photo', () => {
    it('returns it in the same shape as any other attachment', async () => {
        const seams = plugin()
        const camera = createTalosNativeCamera({
            plugin: seams as never,
            platform: 'android',
            fetchBlob: fetchOf(2048, 'image/jpeg') as never,
        })

        const [file] = await camera.takePhoto()

        expect(file?.declaredMediaType).toBe('image/jpeg')
        expect(file?.sizeBytes).toBe(2048)
        expect(file?.source.kind).toBe('web-blob')
        expect(file?.name).toMatch(/\.jpg$/)
    })

    /** Backing out of the camera is an ordinary act, not a failure. */
    it('returns nothing when the user backs out', async () => {
        const seams = plugin({
            getPhoto: vi.fn(async () => { throw new Error('User cancelled photos app') }),
        })
        const camera = createTalosNativeCamera({
            plugin: seams as never, platform: 'android', fetchBlob: fetchOf(1, 'image/jpeg') as never,
        })

        await expect(camera.takePhoto()).resolves.toEqual([])
    })

    it('reports a real failure instead of swallowing it as a cancellation', async () => {
        const seams = plugin({
            getPhoto: vi.fn(async () => { throw new Error('CAMERA_UNAVAILABLE') }),
        })
        const camera = createTalosNativeCamera({
            plugin: seams as never, platform: 'android', fetchBlob: fetchOf(1, 'image/jpeg') as never,
        })

        await expect(camera.takePhoto()).rejects.toThrow('CAMERA_UNAVAILABLE')
    })
})

describe('picking photos', () => {
    it('returns every picture the user chose', async () => {
        const seams = plugin()
        const camera = createTalosNativeCamera({
            plugin: seams as never, platform: 'android', fetchBlob: fetchOf(512, 'image/png') as never,
        })

        const files = await camera.pickPhotos()

        expect(files).toHaveLength(2)
        expect(seams.pickImages).toHaveBeenCalledOnce()
    })

    /**
     * A picture the app cannot actually read is not an attachment. Dropping it
     * quietly beats attaching something that fails later, where the user has
     * already stopped thinking about the picker.
     */
    it('drops a picture it cannot read, and keeps the rest', async () => {
        let call = 0
        const camera = createTalosNativeCamera({
            plugin: plugin() as never,
            platform: 'android',
            fetchBlob: vi.fn(async () => {
                call += 1
                if (call === 1) throw new Error('gone')
                return { blob: async () => new Blob([new Uint8Array(4)], { type: 'image/png' }) }
            }) as never,
        })

        await expect(camera.pickPhotos()).resolves.toHaveLength(1)
    })

    it('says plainly that there is no camera on the web', async () => {
        const camera = createTalosNativeCamera({
            plugin: plugin() as never, platform: 'web', fetchBlob: fetchOf(1, 'image/png') as never,
        })

        await expect(camera.takePhoto()).resolves.toEqual([])
        await expect(camera.pickPhotos()).resolves.toEqual([])
    })
})
