import { describe, expect, it, vi } from 'vitest'
import { createTalosWebSourceArchive } from '@/lib/search/webSourceArchive'

/**
 * Wiring capture to the save path.
 *
 * The rule that shapes all of this: a link the user asked to keep is kept
 * whether or not its favicon arrives. Capture is best-effort and asynchronous,
 * so the save — and therefore the reply the user is waiting for — is never
 * held up by a slow site or stopped by a dead one.
 */
function archive(overrides: Record<string, unknown> = {}) {
    const save = vi.fn(async () => ({}))
    const captureCards = vi.fn()
    return {
        save,
        captureCards,
        instance: createTalosWebSourceArchive({
            source: 'tavily',
            save,
            captureCards,
            ...overrides,
        } as never),
    }
}

const RESULTS = [
    { url: 'https://corriere.it/gas', title: 'Il prezzo del gas', snippet: 'x', publishedAt: null },
    { url: 'https://ansa.it/energia', title: 'Energia', snippet: 'y', publishedAt: null },
]

describe('the archive asks for the cards of what it just saved', () => {
    it('hands over every URL it stored, once the save has succeeded', async () => {
        const { instance, captureCards } = archive()

        await instance.rememberSearch('gas', RESULTS as never)

        expect(captureCards).toHaveBeenCalledOnce()
        expect(captureCards.mock.calls[0]?.[0]).toEqual([
            'https://corriere.it/gas',
            'https://ansa.it/energia',
        ])
    })

    it('asks for nothing when the save failed', async () => {
        const { instance, captureCards } = archive({
            save: vi.fn(async () => { throw new Error('disk full') }),
        })

        await instance.rememberSearch('gas', RESULTS as never)

        // Capturing cards for links that were never stored would leave bytes on
        // the device belonging to nothing.
        expect(captureCards).not.toHaveBeenCalled()
    })

    it('reports the save as stored even when capture throws immediately', async () => {
        const { instance } = archive({
            captureCards: vi.fn(() => { throw new Error('no network') }),
        })

        const report = await instance.rememberSearch('gas', RESULTS as never)

        // The favicon is decoration; the link is the thing the user asked for.
        expect(report).toMatchObject({ policy: 'stored', saved: 2, failed: 0 })
    })

    it('works when no capture port is supplied at all', async () => {
        const save = vi.fn(async () => ({}))
        const instance = createTalosWebSourceArchive({ source: 'tavily', save } as never)

        await expect(instance.rememberSearch('gas', RESULTS as never))
            .resolves.toMatchObject({ policy: 'stored', saved: 2 })
    })

    it('asks for the card of a single archived page too', async () => {
        const { instance, captureCards } = archive()

        await instance.rememberPage({
            url: 'https://corriere.it/gas',
            title: 'Il prezzo del gas',
            text: 'body',
        } as never)

        expect(captureCards).toHaveBeenCalledWith(['https://corriere.it/gas'])
    })
})
