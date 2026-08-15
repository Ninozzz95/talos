import { describe, expect, it, vi } from 'vitest'
import {
    TALOS_HF_RESOLVE_HOST,
    talosCreateHuggingFaceClient,
    talosParseGgufFileName,
} from '@/lib/models/huggingFace'

/**
 * Slice 1 of the local-models work: the Hugging Face client, pure.
 *
 * Every rule here comes from a LIVE PROBE against the Hub on 2026-07-31, not
 * from documentation — the documentation is silent on most of it, and the parts
 * it does cover are the parts that do not bite.
 *
 * No network in these tests: the client takes its `fetch`, so the contract can
 * be pinned exactly, including the responses nobody can produce on demand.
 */
function respond(init: {
    status: number
    body?: unknown
    headers?: Record<string, string>
    text?: string
}): Response {
    const headers = new Headers(init.headers ?? {})
    const body = init.text ?? (init.body === undefined ? '' : JSON.stringify(init.body))
    return new Response(body, { status: init.status, headers })
}

function client(handler: (url: string, init?: RequestInit) => Response, token?: string) {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : String(input)
        calls.push({ url, init })
        return handler(url, init)
    })
    return { hf: talosCreateHuggingFaceClient({ fetch: fetcher as never, token }), calls }
}

const PATHS_INFO = [{
    type: 'file',
    path: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    size: 807694464,
    oid: 'ca7732416a',
    lfs: {
        oid: '6f85a640a97cf2bf5b8e764087b1e83da0fdb51d7c9fab7d0fece9385611df83',
        size: 807694464,
        pointerSize: 134,
    },
    xetHash: '7314cd624de8068beee86215e529a23665ff09e458977e32f30b8149764e7be1',
    securityFileStatus: { status: 'safe' },
}]

describe('the integrity value', () => {
    /**
     * The trap that makes verification worse than useless: the CDN's ETag is
     * the Xet Merkle hash, NOT the sha256. `lfs.oid` is the sha256 — confirmed
     * because Hugging Face's own VirusTotal link is keyed on that same value.
     * Verifying against the wrong one reports SUCCESS on a corrupt file.
     */
    it('comes from lfs.oid, and is a sha256', async () => {
        const { hf } = client(() => respond({ status: 200, body: PATHS_INFO }))

        const [file] = await hf.pathsInfo('meta/repo', 'main', ['Llama-3.2-1B-Instruct-Q4_K_M.gguf'])

        expect(file?.sha256).toBe('6f85a640a97cf2bf5b8e764087b1e83da0fdb51d7c9fab7d0fece9385611df83')
        expect(file?.sha256).toMatch(/^[0-9a-f]{64}$/)
    })

    it('is never the xet hash, which is what the CDN returns as ETag', async () => {
        const { hf } = client(() => respond({ status: 200, body: PATHS_INFO }))

        const [file] = await hf.pathsInfo('meta/repo', 'main', ['x.gguf'])

        expect(file?.sha256).not.toBe(PATHS_INFO[0]!.xetHash)
    })

    /**
     * A small non-LFS file has no `lfs` block at all, and its `oid` is a git
     * blob sha1 — 40 hex characters, not 64. Reporting that as a sha256 would
     * make every later verification fail for a reason nobody could diagnose.
     */
    it('is absent for a file that is not stored in LFS, rather than a sha1', async () => {
        const { hf } = client(() => respond({
            status: 200,
            body: [{ type: 'file', path: 'README.md', size: 900, oid: 'a'.repeat(40) }],
        }))

        const [file] = await hf.pathsInfo('meta/repo', 'main', ['README.md'])

        expect(file?.sha256).toBeNull()
    })

    it('fails closed on a non-array paths-info payload', async () => {
        const { hf } = client(() => respond({ status: 200, body: { path: 'x.gguf' } }))

        await expect(hf.pathsInfo('meta/repo', 'main', ['x.gguf']))
            .resolves.toEqual([])
    })

    it('drops malformed byte rows and never promotes an invalid oid to sha256', async () => {
        const { hf } = client(() => respond({
            status: 200,
            body: [
                null,
                7,
                {},
                { path: 'zero.gguf', lfs: { size: 0, oid: 'a'.repeat(64) } },
                { path: 'negative.gguf', size: -1 },
                { path: 'string-size.gguf', size: '42' },
                { path: 'valid.gguf', size: 42, lfs: { oid: 'not-a-sha256' } },
            ],
        }))

        await expect(hf.pathsInfo('meta/repo', 'main', [
            'zero.gguf', 'negative.gguf', 'string-size.gguf', 'valid.gguf',
        ])).resolves.toEqual([{
            path: 'valid.gguf',
            sizeBytes: 42,
            sha256: null,
            xetHash: null,
            security: null,
        }])
    })
})

describe('being rate limited', () => {
    /**
     * Probed: a 429 carries 52 KB of HTML, no `Retry-After` and no error code.
     * So `res.json()` throws, and an app that reads the body first reports
     * "malformed response" for something it could have named exactly.
     *
     * The only machine-readable number is `t` in the `ratelimit` header.
     */
    it('is recognised from the status, not from a body that would throw', async () => {
        const { hf } = client(() => respond({
            status: 429,
            text: '<!DOCTYPE html><html>'.padEnd(52308, ' '),
            headers: {
                'content-type': 'text/html; charset=utf-8',
                ratelimit: '"pages";r=0;t=254',
                'ratelimit-policy': '"fixed window";"pages";q=100;w=300',
            },
        }))

        await expect(hf.pathsInfo('meta/repo', 'main', ['x.gguf']))
            .rejects.toMatchObject({ kind: 'rate-limited', retryAfterSeconds: 254 })
    })

    /** Without the header there is still an honest answer: no invented number. */
    it('says it does not know when the header is missing', async () => {
        const { hf } = client(() => respond({ status: 429, text: 'nope' }))

        await expect(hf.pathsInfo('meta/repo', 'main', ['x.gguf']))
            .rejects.toMatchObject({ kind: 'rate-limited', retryAfterSeconds: null })
    })
})

describe('a gated repository', () => {
    /**
     * Probed: metadata and the file list stay public; only `/resolve/` is
     * refused, with a 401. The licence can only be accepted in a browser, so
     * the client must report the fact and never pretend to resolve it.
     */
    it('is reported as gated with the address to open, not as a generic failure', async () => {
        const { hf } = client(() => respond({ status: 401, text: 'Access to model … is restricted' }))

        await expect(hf.resolveDownload('meta-llama/Llama-3.2-1B', 'main', 'model.gguf'))
            .rejects.toMatchObject({
                kind: 'gated',
                acceptAt: 'https://huggingface.co/meta-llama/Llama-3.2-1B',
            })
    })
})

describe('resolving a download', () => {
    /**
     * THE defect that only shows up on a flaky link with a big file. If the
     * resolve request carries a Range, the CloudFront policy binds the signed
     * URL to that exact range: every later request 403s. The resolve must be
     * bare, and the Range belongs on the CDN URL afterwards.
     */
    it('never sends a Range header on the resolve request', async () => {
        const { hf, calls } = client(() => respond({
            status: 302,
            headers: { location: `https://${TALOS_HF_RESOLVE_HOST}/xet-bridge-us/abc?Expires=1` },
        }))

        await hf.resolveDownload('meta/repo', 'main', 'model.gguf')

        const headers = new Headers(calls.at(-1)?.init?.headers)
        expect(headers.has('range')).toBe(false)
        expect(headers.has('Range')).toBe(false)
    })

    /**
     * The signed URL lives 3600s and a 4GB file at 1MB/s needs 4295s, so the
     * download CANNOT finish on one URL. The deadline is derived from the
     * response's own `date` against `Expires` — never from the phone's clock,
     * which on a cheap device is routinely wrong.
     */
    it('reports how long the signed url lives, measured against the server clock', async () => {
        // The exact pair from the probe: issued at 1785509426, expiring at
        // 1785512933 — 3507 seconds, which is the ~3600s TTL minus the seconds
        // the request itself took. Both derived from the same epoch so the
        // arithmetic is visible instead of copied.
        const issuedAt = 1785509426
        const { hf } = client(() => respond({
            status: 302,
            headers: {
                location: `https://${TALOS_HF_RESOLVE_HOST}/xet-bridge-us/abc?Expires=1785512933`,
                date: new Date(issuedAt * 1000).toUTCString(),
            },
        }))

        const resolved = await hf.resolveDownload('meta/repo', 'main', 'model.gguf')

        expect(resolved.livesForSeconds).toBe(3507)
    })

    /**
     * A phone with a wrong clock is disproportionately the cheap phone this
     * feature exists for, so the answer must never come from the device.
     */
    it('says it does not know when the server did not date the response', async () => {
        const { hf } = client(() => respond({
            status: 302,
            headers: { location: `https://${TALOS_HF_RESOLVE_HOST}/x?Expires=1785512933` },
        }))

        expect((await hf.resolveDownload('meta/repo', 'main', 'm.gguf')).livesForSeconds).toBeNull()
    })

    it('carries the token as a bearer when there is one', async () => {
        const { hf, calls } = client(
            () => respond({ status: 302, headers: { location: 'https://cdn/x' } }),
            'hf_secret',
        )

        await hf.resolveDownload('meta/repo', 'main', 'model.gguf')

        expect(new Headers(calls.at(-1)?.init?.headers).get('authorization')).toBe('Bearer hf_secret')
    })

    it('sends no authorization at all when there is no token', async () => {
        const { hf, calls } = client(() => respond({ status: 302, headers: { location: 'https://cdn/x' } }))

        await hf.resolveDownload('meta/repo', 'main', 'model.gguf')

        expect(new Headers(calls.at(-1)?.init?.headers).has('authorization')).toBe(false)
    })
})

describe('reading a GGUF file name', () => {
    /**
     * The name is a HINT, never the authority — `general.file_type` in the
     * header is. It is still worth reading, because it is all a search result
     * gives you before you spend a ranged request on the header.
     */
    it('finds the quantisation', () => {
        expect(talosParseGgufFileName('Llama-3.2-1B-Instruct-Q4_K_M.gguf')?.quantisation).toBe('Q4_K_M')
        expect(talosParseGgufFileName('qwen2.5-0.5b-instruct-q8_0.gguf')?.quantisation).toBe('Q8_0')
    })

    /**
     * A split model is a SET, and a partial set is unusable — so the pieces
     * have to be recognised as pieces rather than offered as models.
     */
    it('recognises one part of a split model as a part', () => {
        const part = talosParseGgufFileName('Qwen3-30B-A3B-Q4_K_M-00002-of-00003.gguf')

        expect(part).toMatchObject({ quantisation: 'Q4_K_M', shardIndex: 2, shardCount: 3 })
    })

    it('says a single file is a single file', () => {
        expect(talosParseGgufFileName('model-Q4_K_M.gguf')?.shardCount).toBe(1)
    })

    it('refuses anything that is not a gguf', () => {
        expect(talosParseGgufFileName('model.safetensors')).toBeNull()
        expect(talosParseGgufFileName('README.md')).toBeNull()
    })

    /** No quantisation in the name is a fact, not a reason to guess one. */
    it('leaves the quantisation unknown rather than inventing it', () => {
        expect(talosParseGgufFileName('model.gguf')).toMatchObject({ quantisation: null })
    })
})
