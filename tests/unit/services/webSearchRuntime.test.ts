// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({
    safeRead: vi.fn(),
    capacitorRequest: vi.fn(),
}))

vi.mock('@/services/safeWebRead', () => ({
    readTalosSafeWebPage: bridge.safeRead,
}))

vi.mock('@capacitor/core', () => ({
    CapacitorHttp: {
        request: bridge.capacitorRequest,
    },
}))

import { readTalosPage } from '@/services/webSearchRuntime'

const ARTICLE = `
<article>
  <h1>Verified final page</h1>
  ${'<p>This is a long, readable paragraph from the final public page and contains enough text for article extraction.</p>'.repeat(6)}
</article>`

describe('webSearchRuntime safe page integration', () => {
    it('SAFE-WEB-12 extracts the native bounded body and keeps its validated final URL', async () => {
        bridge.safeRead.mockResolvedValueOnce({
            status: 200,
            url: 'https://example.org/final',
            body: `<!doctype html><html><head><title>Final</title></head><body>${ARTICLE}</body></html>`,
        })

        const page = await readTalosPage('http://example.org/start')

        expect(bridge.safeRead).toHaveBeenCalledWith('http://example.org/start')
        expect(bridge.capacitorRequest).not.toHaveBeenCalled()
        expect(page).toMatchObject({
            url: 'https://example.org/final',
            title: 'Final',
            text: expect.stringMatching(/long, readable paragraph/i),
        })
    })

    it('returns null without extraction for a non-success response', async () => {
        bridge.safeRead.mockResolvedValueOnce({
            status: 404,
            url: 'https://example.org/missing',
            body: '<html><body>missing</body></html>',
        })

        await expect(readTalosPage('https://example.org/missing')).resolves.toBeNull()
    })
})
