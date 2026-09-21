import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The assembly, and the one decision that lives in it: what the disk already
 * answered is remembered.
 *
 * A sources chip is mounted per message, so a chat that cites the same site ten
 * times asks for that favicon ten times — and every miss costs a probe of each
 * candidate extension. Without the cache that is the chat screen's opening cost;
 * with it, and without the invalidation, the Library shows Globes for icons
 * sitting on disk until the app is restarted. Both halves are tested here
 * because a cache whose invalidation is untested is a bug with a delay on it.
 */
const store = {
    existsPrivate: vi.fn(async () => false),
    readPrivate: vi.fn(async () => new Uint8Array([1, 2, 3])),
    writePrivateBytes: vi.fn(async () => {}),
}

vi.mock('@/services/attachmentFileStore', () => ({
    createAttachmentFileStore: () => store,
}))
vi.mock('@/services/safeWebRead', () => ({
    readTalosSafeWebPage: vi.fn(async () => ({ status: 200, url: 'https://a.example/', body: '' })),
    readTalosSafeWebImage: vi.fn(async () => {
        throw new Error('TALOS_WEB_NOT_AN_IMAGE')
    }),
}))

async function service() {
    vi.resetModules()
    return import('@/services/sourceCardService')
}

beforeEach(() => {
    // Reset, not clear: a leftover implementation from the previous test makes
    // every url look like it already has a card.
    store.existsPrivate.mockReset().mockResolvedValue(false)
    store.readPrivate.mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]))
    store.writePrivateBytes.mockReset().mockResolvedValue(undefined)
})

describe('reading a stored card', () => {
    it('returns the bytes, not a URL, so the surface owns the lifetime', async () => {
        store.existsPrivate.mockImplementation(async (path: string) => path.endsWith('-icon.png'))
        const { readTalosSourceCardImage } = await service()

        const icon = await readTalosSourceCardImage('https://a.example/', 'icon')

        expect(icon).toBeInstanceOf(Blob)
        expect(icon?.type).toBe('image/png')
    })

    it('goes to the disk once however many surfaces ask', async () => {
        store.existsPrivate.mockImplementation(async (path: string) => path.endsWith('-icon.png'))
        const { readTalosSourceCardImage } = await service()

        const first = await readTalosSourceCardImage('https://a.example/', 'icon')
        const second = await readTalosSourceCardImage('https://a.example/', 'icon')

        expect(second).toBe(first)
        expect(store.readPrivate).toHaveBeenCalledOnce()
    })

    /** Absence is the expensive answer — every candidate extension probed. */
    it('remembers absence too, instead of re-probing every extension', async () => {
        const { readTalosSourceCardImage } = await service()

        await readTalosSourceCardImage('https://a.example/', 'icon')
        const probes = store.existsPrivate.mock.calls.length
        await readTalosSourceCardImage('https://a.example/', 'icon')

        expect(probes).toBeGreaterThan(1)
        expect(store.existsPrivate).toHaveBeenCalledTimes(probes)
    })

    it('has nothing to say about a url that is not one', async () => {
        const { readTalosSourceCardImage } = await service()

        await expect(readTalosSourceCardImage('not a url', 'icon')).resolves.toBeNull()
    })
})

describe('a pass that may have written cards', () => {
    /**
     * The failure this prevents: open the Library, see Globes, watch the
     * backfill fetch the icons, and keep seeing Globes because the answer from
     * before the fetch is the one still cached.
     */
    it('makes the next read of a touched url go back to the disk', async () => {
        const { backfillTalosSourceCards, readTalosSourceCardImage } = await service()

        await readTalosSourceCardImage('https://a.example/', 'icon')

        const report = await backfillTalosSourceCards(['https://a.example/'])
        expect(report.attempted).toEqual(['https://a.example/'])

        store.existsPrivate.mockClear()
        await readTalosSourceCardImage('https://a.example/', 'icon')
        expect(store.existsPrivate).toHaveBeenCalled()
    })

    it('leaves urls it never touched cached', async () => {
        const { backfillTalosSourceCards, readTalosSourceCardImage } = await service()

        await readTalosSourceCardImage('https://kept.example/', 'icon')
        const before = store.existsPrivate.mock.calls.length

        await backfillTalosSourceCards(['https://other.example/'])
        store.existsPrivate.mockClear()
        await readTalosSourceCardImage('https://kept.example/', 'icon')

        expect(before).toBeGreaterThan(0)
        expect(store.existsPrivate).not.toHaveBeenCalled()
    })
})
