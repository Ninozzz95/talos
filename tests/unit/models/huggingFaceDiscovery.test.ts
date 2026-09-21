import { describe, expect, it, vi } from 'vitest'
import { talosCreateHuggingFaceClient } from '@/lib/models/huggingFace'

/**
 * Finding a model, and learning enough about it to be honest.
 *
 * The three calls here all exist to move a discovery EARLIER than competitors
 * make it: which repositories hold something a phone can open, which files are
 * in them including the ones a folder down, and what a file actually is before
 * four gigabytes are committed to it.
 */
function clientFor(handler: (url: string, init?: RequestInit) => Response) {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
        handler(String(input), init))
    return { client: talosCreateHuggingFaceClient({ fetch: fetch as never }), fetch }
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    })
}

describe('finding models', () => {
    /**
     * Filtered at the Hub, not here. The unfiltered list is overwhelmingly
     * PyTorch checkpoints nothing on a phone can open, and a search returning
     * twenty unusable results reads as a broken search.
     */
    it('asks only for models a phone could open, most-used first', async () => {
        const { client, fetch } = clientFor(() => json([]))

        await client.searchModels('qwen3')

        const url = new URL(String(fetch.mock.calls[0]![0]))
        expect(url.pathname).toBe('/api/models')
        expect(url.searchParams.get('search')).toBe('qwen3')
        expect(url.searchParams.get('filter')).toBe('gguf')
        expect(url.searchParams.get('sort')).toBe('downloads')
    })

    /**
     * A gated repository answers 403 only at `/resolve/`. Finding out lazily
     * lets someone pick a model, read a fit calculation, press download and
     * then fail — so it is known from the search itself.
     */
    it('knows a model is gated before anything is offered', async () => {
        const { client } = clientFor(() => json([
            { id: 'meta-llama/Llama-3-8B-GGUF', downloads: 900, likes: 10, gated: 'manual' },
            { id: 'unsloth/Qwen3-4B-GGUF', downloads: 5000, likes: 40, gated: false },
        ]))

        const models = await client.searchModels('llama')

        expect(models[0]!.gated).toBe(true)
        expect(models[1]!.gated).toBe(false)
    })

    /**
     * The Hub OMITS the field for open repositories and states it only when a
     * gate exists, so an absent one has to read as open. Doing it the cautious
     * way round would mark nearly every model gated and hide the entire
     * catalogue.
     *
     * The safety net is at the other end: a gate that slips through is named at
     * `/resolve/` with the page where the licence can be accepted, which is the
     * only place it can be accepted anyway.
     */
    it('reads an absent gate as open, because that is what the Hub means by it', async () => {
        const { client } = clientFor(() => json([{ id: 'someone/model', downloads: 1 }]))

        expect((await client.searchModels('x'))[0]!.gated).toBe(false)
    })

    it('drops rows with no id rather than offering a model with no name', async () => {
        const { client } = clientFor(() => json([{ downloads: 5 }, { id: 'a/b', gated: false }]))

        expect((await client.searchModels('x')).map((model) => model.id)).toEqual(['a/b'])
    })

    /**
     * The status is read before the body, always: a 429 answers with 52 KB of
     * HTML, and an app that parses first reports "malformed response" about a
     * situation it could have named to the second.
     */
    it('names a rate limit instead of choking on its HTML', async () => {
        const { client } = clientFor(() => new Response('<html>too many</html>', {
            status: 429,
            headers: { ratelimit: 'limit=300;t=254' },
        }))

        await expect(client.searchModels('x')).rejects.toMatchObject({
            kind: 'rate-limited',
            retryAfterSeconds: 254,
        })
    })
})

describe('listing what is in a repository', () => {
    /**
     * Quantisations are routinely published one folder down. A listing that
     * stops at the top level shows a repository as empty when it holds a dozen
     * usable files.
     */
    it('looks inside folders, not just at the top level', async () => {
        const { client, fetch } = clientFor(() => json([
            { type: 'file', path: 'README.md' },
            { type: 'file', path: 'Qwen3-4B-Q4_K_M.gguf' },
            { type: 'directory', path: 'Q8_0' },
            { type: 'file', path: 'Q8_0/Qwen3-4B-Q8_0.gguf' },
            { type: 'file', path: 'config.json' },
        ]))

        const files = await client.listGgufFiles('unsloth/Qwen3-4B-GGUF', 'main')

        expect(new URL(String(fetch.mock.calls[0]![0])).searchParams.get('recursive')).toBe('true')
        expect(files).toEqual(['Qwen3-4B-Q4_K_M.gguf', 'Q8_0/Qwen3-4B-Q8_0.gguf'])
    })

    it('ignores directories that happen to be named like a model file', async () => {
        const { client } = clientFor(() => json([
            { type: 'directory', path: 'weights.gguf' },
            { type: 'file', path: 'real.gguf' },
        ]))

        expect(await client.listGgufFiles('a/b', 'main')).toEqual(['real.gguf'])
    })
})

describe('reading the first bytes of a file', () => {
    /**
     * THE most expensive thing to get wrong here, and it was measured rather
     * than read: a `/resolve/` request carrying a Range has that exact range
     * embedded in the CloudFront policy, and every later request answers
     * `403 Auth failed: invalid range`. The obvious implementation works for
     * the header and then breaks every resume of every download.
     */
    it('puts the range on the CDN address and never on the resolve', async () => {
        const seen: Array<{ url: string; range: string | null }> = []
        const { client } = clientFor((url, init) => {
            const range = new Headers(init?.headers).get('range')
            seen.push({ url, range })
            if (url.includes('/resolve/')) {
                return new Response(null, {
                    status: 302,
                    headers: { location: 'https://us.aws.cdn.hf.co/xet/abc?Expires=1' },
                })
            }
            return new Response(new Uint8Array([0x47, 0x47, 0x55, 0x46]))
        })

        const head = await client.readHead('a/b', 'main', 'model.gguf', 1024)

        expect(seen[0]!.url).toContain('/resolve/')
        expect(seen[0]!.range).toBeNull()
        expect(seen[1]!.url).toContain('us.aws.cdn.hf.co')
        expect(seen[1]!.range).toBe('bytes=0-1023')
        expect(new Uint8Array(head)).toEqual(new Uint8Array([0x47, 0x47, 0x55, 0x46]))
    })

    it('reports a gated repository rather than returning empty bytes', async () => {
        const { client } = clientFor(() => new Response('nope', { status: 403 }))

        await expect(client.readHead('meta/x', 'main', 'model.gguf', 1024)).rejects.toMatchObject({
            kind: 'gated',
            acceptAt: 'https://huggingface.co/meta/x',
        })
    })
})
