import { describe, expect, it, vi } from 'vitest'
import { talosResearchCollect } from '@/lib/research/researchCollector'
import type { TalosResearchBranch } from '@/lib/research/researchRun'

const BRANCH: TalosResearchBranch = {
    id: 'b1',
    question: 'quale tablet conviene — fonti contrarie',
    estimate: { searches: 1, pages: 2, tokens: 5_000 },
}

function result(url: string, snippet = 'uno stralcio dal motore di ricerca') {
    return { url, title: `titolo ${url}`, snippet, publishedAt: '2026-07-01' }
}

describe('collecting what one line of enquiry is worth', () => {
    /**
     * THE decision this module exists for.
     *
     * Everyone else stores links. A link is a promise about a page, and pages
     * rot — edited, paywalled, moved, switched off — so a dossier made of links
     * degrades in silence and cannot be re-checked at all, because the thing it
     * cited is gone. The passage is kept so the dossier is still answerable a
     * year later.
     */
    it('keeps the text, not just the address', async () => {
        const collection = await talosResearchCollect({
            search: async () => [result('https://a.example')],
            read: async () => ({ title: 'Il pezzo vero', text: 'Il passaggio che conta.', publishedAt: '2026-06-30' }),
        }, BRANCH)

        expect(collection.sources[0]).toMatchObject({
            url: 'https://a.example',
            text: 'Il passaggio che conta.',
            obtained: 'page',
        })
    })

    it('believes the page about its own date, not the search index', async () => {
        const collection = await talosResearchCollect({
            search: async () => [result('https://a.example')],
            read: async () => ({ title: 't', text: 'x', publishedAt: '2026-06-30' }),
        }, BRANCH)

        // One is the publisher speaking, the other is an index guessing.
        expect(collection.sources[0]!.publishedAt).toBe('2026-06-30')
    })

    /**
     * The lesson this project paid for tonight, in a different component: a
     * failure that arrives as an empty list is a failure that has been hidden.
     * Four sources instead of six must not look like a thin topic.
     */
    it('names what it could not read instead of quietly returning less', async () => {
        const collection = await talosResearchCollect({
            search: async () => [result('https://ok.example'), result('https://dead.example')],
            read: async (url) => {
                if (url === 'https://dead.example') throw new Error('403')
                return { title: 't', text: 'testo intero', publishedAt: null }
            },
        }, BRANCH)

        expect(collection.unreachable).toEqual([{ url: 'https://dead.example', reason: '403' }])
        // And the snippet is still carried, marked for what it is: a claim
        // resting on a snippet is weaker evidence, and hiding that would make
        // the two look alike.
        expect(collection.sources.map((source) => source.obtained)).toEqual(['page', 'snippet'])
    })

    it('counts what it actually took in, rather than repeating the estimate', async () => {
        const text = 'x'.repeat(4_000)
        const collection = await talosResearchCollect({
            search: async () => [result('https://a.example')],
            read: async () => ({ title: 't', text, publishedAt: null }),
        }, BRANCH)

        // The plan guesses (5000 tokens on this branch); the run counts.
        expect(collection.spend.tokens).toBe(1_000)
        expect(collection.spend.tokens).not.toBe(BRANCH.estimate.tokens)
        expect(collection.spend.pages).toBe(1)
        expect(collection.spend.searches).toBe(1)
    })

    it('never lets one page swallow the dossier', async () => {
        const collection = await talosResearchCollect({
            search: async () => [result('https://a.example')],
            read: async () => ({ title: 't', text: 'y'.repeat(500_000), publishedAt: null }),
        }, BRANCH)

        // A phone holds the whole dossier in one database. The cut belongs
        // where the evidence is STORED, so what is kept is what can be
        // re-verified later.
        expect(collection.sources[0]!.text.length).toBe(20_000)
    })

    it('asks for as many results as the approved branch said it would', async () => {
        const search = vi.fn(async () => [] as never[])

        await talosResearchCollect({ search, read: async () => null }, { ...BRANCH, estimate: { searches: 1, pages: 7, tokens: 1 } })

        // The user approved a size in R-2. Asking for a different one would
        // make the estimate they agreed to a decoration.
        expect(search).toHaveBeenCalledWith(BRANCH.question, 7)
    })
})
