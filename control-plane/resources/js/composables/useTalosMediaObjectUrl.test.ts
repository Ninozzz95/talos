// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTalosMediaObjectUrl } from './useTalosMediaObjectUrl'

function imageResponse(body: string) {
    return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
    })
}

describe('useTalosMediaObjectUrl', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('loads authenticated media, revokes replacements and aborts disposal', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(imageResponse('first'))
            .mockResolvedValueOnce(imageResponse('second'))
        const create = vi.spyOn(URL, 'createObjectURL')
            .mockReturnValueOnce('blob:first')
            .mockReturnValueOnce('blob:second')
        const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
        const media = useTalosMediaObjectUrl()

        await media.load('/api/talos/files/file-1/content')
        await media.load('/api/talos/files/file-2/content')

        expect(fetchMock).toHaveBeenCalledWith('/api/talos/files/file-1/content', expect.objectContaining({
            credentials: 'same-origin',
            signal: expect.any(AbortSignal),
        }))
        expect(create).toHaveBeenCalledTimes(2)
        expect(revoke).toHaveBeenCalledWith('blob:first')
        expect(media.objectUrl.value).toBe('blob:second')

        media.dispose()
        expect(revoke).toHaveBeenCalledWith('blob:second')
        expect(media.objectUrl.value).toBeNull()
    })

    it('fences a late response after a newer load and exposes safe failures', async () => {
        let resolveFirst!: (response: Response) => void
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFirst = resolve }))
            .mockResolvedValueOnce(imageResponse('new'))
            .mockResolvedValueOnce(new Response('denied', { status: 403 }))
        const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:new')
        const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
        const media = useTalosMediaObjectUrl()

        const stale = media.load('/api/talos/files/file-old/content')
        await media.load('/api/talos/files/file-new/content')
        resolveFirst(imageResponse('old'))
        await stale

        expect(media.objectUrl.value).toBe('blob:new')
        expect(create).toHaveBeenCalledTimes(1)
        expect(revoke).not.toHaveBeenCalled()

        await media.load('/api/talos/files/file-denied/content')
        expect(media.objectUrl.value).toBeNull()
        expect(media.error.value).toMatch(/could not load/i)
        expect(revoke).toHaveBeenCalledWith('blob:new')
        expect(fetchMock).toHaveBeenCalledTimes(3)
    })
})
