import { describe, expect, it, vi } from 'vitest'
import { createAttachmentFileStore } from '@/services/attachmentFileStore'

/**
 * Source card bytes need somewhere to live. They are not attachments — they are
 * a favicon and a preview keyed by URL, under `talos-vault/cards/` — so the
 * store gains a write and an existence check for them.
 *
 * The guard is the interesting part. `assertPrivateUri` exists so a caller
 * cannot be talked into reading or writing outside the private area, and
 * widening it to a second prefix is exactly the kind of change that quietly
 * turns a guard into a formality.
 */
function filesystem(overrides: Record<string, unknown> = {}) {
    return {
        readFile: vi.fn(async () => ({ data: 'AAEC' })),
        writeFile: vi.fn(async () => ({})),
        deleteFile: vi.fn(async () => ({})),
        mkdir: vi.fn(async () => ({})),
        stat: vi.fn(async () => ({ size: 3 })),
        ...overrides,
    }
}

describe('the private store, for source cards', () => {
    it('writes card bytes under the cards prefix', async () => {
        const fs = filesystem()
        const store = createAttachmentFileStore({ filesystem: fs as never })

        await store.writePrivateBytes('talos-vault/cards/abc-icon.png', 'AAEC')

        expect(fs.writeFile).toHaveBeenCalledWith(expect.objectContaining({
            path: 'talos-vault/cards/abc-icon.png',
            data: 'AAEC',
        }))
    })

    it('reports whether a card is already stored, without reading it', async () => {
        const present = createAttachmentFileStore({ filesystem: filesystem() as never })
        await expect(present.existsPrivate('talos-vault/cards/abc-icon.png')).resolves.toBe(true)

        const absent = createAttachmentFileStore({
            filesystem: filesystem({ stat: vi.fn(async () => { throw new Error('missing') }) }) as never,
        })
        await expect(absent.existsPrivate('talos-vault/cards/abc-icon.png')).resolves.toBe(false)
    })

    /**
     * The path is derived from a URL a stranger controls. Widening the guard to
     * accept a second prefix must not widen it to accept a way out.
     */
    it('still refuses a path that leaves the private area', async () => {
        const store = createAttachmentFileStore({ filesystem: filesystem() as never })

        for (const hostile of [
            'talos-vault/cards/../../secrets.txt',
            'talos-vault/cards/..\\escape.png',
            '/etc/passwd',
            'other-place/icon.png',
            'talos-vault/cardsX/icon.png',
        ]) {
            await expect(store.writePrivateBytes(hostile, 'AAEC'))
                .rejects.toThrow('TALOS_ATTACHMENT_PRIVATE_URI_INVALID')
            await expect(store.existsPrivate(hostile))
                .rejects.toThrow('TALOS_ATTACHMENT_PRIVATE_URI_INVALID')
        }
    })

    it('keeps accepting the attachment prefix it already guarded', async () => {
        const store = createAttachmentFileStore({ filesystem: filesystem() as never })
        await expect(store.existsPrivate('talos-vault/files/abc.png')).resolves.toBe(true)
    })
})
