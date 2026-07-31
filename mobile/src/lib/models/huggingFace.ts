/**
 * The Hugging Face Hub, as a phone has to talk to it.
 *
 * Every rule in this file was measured against the live Hub on 2026-07-31, not
 * read in documentation — the documentation is silent on most of it, and the
 * parts it covers are the parts that do not bite. Where a behaviour surprised
 * us, the surprise is written down beside the code rather than smoothed over.
 *
 * Deliberately dependency-free and transport-injected: no network in the tests,
 * and the same client works from the WebView (CORS reflects any origin) and from
 * a native download job.
 */

/** The 2026 CDN. The legacy `cdn-lfs*` hosts did not appear once in probing. */
export const TALOS_HF_RESOLVE_HOST = 'us.aws.cdn.hf.co'

const HUB = 'https://huggingface.co'

export type TalosHuggingFaceFailureKind =
    | 'rate-limited'
    | 'gated'
    | 'not-found'
    | 'unauthorised'
    | 'transport'

export interface TalosHuggingFaceFailure {
    kind: TalosHuggingFaceFailureKind
    status: number | null
    /**
     * Seconds until the limit lifts, when the Hub said so.
     *
     * Null is an honest answer and a common one: a 429 carries NO `Retry-After`
     * and a 52 KB HTML body, so the only machine-readable number is `t` in the
     * `ratelimit` header. Inventing a backoff would be worse than admitting the
     * number is unknown — the user is owed a countdown or nothing, not a guess.
     */
    retryAfterSeconds: number | null
    /** For a gated repo: where the licence can actually be accepted. */
    acceptAt: string | null
    message: string
}

export interface TalosHuggingFaceFile {
    path: string
    sizeBytes: number
    /**
     * The sha256 — from `lfs.oid`, and nowhere else.
     *
     * The CDN's `ETag` is the Xet Merkle hash and the plain `oid` of a small
     * file is a git blob sha1. Verifying a download against either would report
     * SUCCESS on a corrupt file, which is worse than not verifying at all.
     * Null means "this file is not in LFS", which is a fact, not a fallback.
     */
    sha256: string | null
    xetHash: string | null
    /** Hugging Face's own malware verdict, when it has one. */
    security: string | null
}

export interface TalosHuggingFaceDownload {
    /** The CDN URL. Range requests belong HERE, never on the resolve. */
    url: string
    /**
     * How long the signature lasts, measured against the SERVER's clock.
     *
     * A 4 GB file at 1 MB/s needs 4295 s and the signature lives 3600, so a
     * download simply cannot finish on one URL — re-resolving is normal
     * operation, not error handling. Derived from the response's own `date`
     * header against `Expires` because the phone's clock cannot be trusted, and
     * the phone with the wrong clock is disproportionately the cheap phone this
     * feature exists for.
     */
    livesForSeconds: number | null
}

export interface TalosGgufFileName {
    /**
     * From the file NAME, which is a hint and never the authority —
     * `general.file_type` in the header is. Worth reading anyway: it is all a
     * search result offers before spending a ranged request on the header.
     */
    quantisation: string | null
    shardIndex: number
    shardCount: number
}

const QUANTISATION = /[.-]((?:IQ|Q)\d+(?:_[A-Z0-9]+)*|F16|F32|BF16)(?=[.-])/i
const SHARD = /-(\d{5})-of-(\d{5})\.gguf$/i

/**
 * Read what a GGUF file name is willing to say.
 *
 * A split model is a SET and a partial set is unusable, so the pieces have to be
 * recognised as pieces rather than offered as models in their own right.
 */
export function talosParseGgufFileName(name: string): TalosGgufFileName | null {
    if (!name.toLowerCase().endsWith('.gguf')) return null
    const shard = SHARD.exec(name)
    const quantisation = QUANTISATION.exec(name)?.[1] ?? null
    return {
        quantisation: quantisation ? quantisation.toUpperCase() : null,
        shardIndex: shard ? Number(shard[1]) : 1,
        shardCount: shard ? Number(shard[2]) : 1,
    }
}

/** `t` is the seconds-to-reset in the Hub's `ratelimit` header. */
function retryAfterFrom(headers: Headers): number | null {
    const value = headers.get('ratelimit')
    const seconds = value ? /(?:^|;)\s*t=(\d+)/.exec(value)?.[1] : null
    return seconds ? Number(seconds) : null
}

function fail(
    kind: TalosHuggingFaceFailureKind,
    response: Response | null,
    message: string,
    acceptAt: string | null = null,
): TalosHuggingFaceFailure {
    return {
        kind,
        status: response?.status ?? null,
        retryAfterSeconds: response ? retryAfterFrom(response.headers) : null,
        acceptAt,
        message,
    }
}

export interface TalosHuggingFaceClientOptions {
    fetch: typeof globalThis.fetch
    /**
     * The user's token.
     *
     * Not merely a key to gated repos: anonymous rate limits are PER IP, and
     * mobile carriers put thousands of subscribers behind one CGNAT address, so
     * a distributed app without a token will be limited for something no
     * individual user did. The token is the isolation, and it is worth offering
     * even to someone who only wants open models.
     */
    token?: string
}

export interface TalosHuggingFaceClient {
    pathsInfo(repo: string, revision: string, paths: readonly string[]): Promise<TalosHuggingFaceFile[]>
    resolveDownload(repo: string, revision: string, path: string): Promise<TalosHuggingFaceDownload>
}

export function talosCreateHuggingFaceClient(
    options: TalosHuggingFaceClientOptions,
): TalosHuggingFaceClient {
    function headers(): Headers {
        const value = new Headers()
        if (options.token) value.set('authorization', `Bearer ${options.token}`)
        return value
    }

    /**
     * The status is read BEFORE the body, always.
     *
     * A 429 answers with 52 KB of HTML, so `response.json()` throws a parse
     * error — and an app that reads the body first tells the user "malformed
     * response" about a situation it could have named to the second.
     */
    function refuse(response: Response, repo: string): TalosHuggingFaceFailure | null {
        if (response.ok || response.status === 302) return null
        if (response.status === 429) {
            return fail('rate-limited', response, 'Hugging Face is limiting requests.')
        }
        if (response.status === 401 || response.status === 403) {
            // Metadata and the file list of a gated repo stay public; only
            // `/resolve/` is refused. And the licence can be accepted ONLY in a
            // browser — an in-app checkbox would be a false record.
            return fail('gated', response, 'This model is gated.', `${HUB}/${repo}`)
        }
        if (response.status === 404) return fail('not-found', response, 'No such file.')
        return fail('transport', response, `Hugging Face answered ${response.status}.`)
    }

    return {
        /**
         * One request for the whole download contract: size, sha256, the pinned
         * commit and the malware verdict, for up to 2000 paths.
         */
        async pathsInfo(repo, revision, paths) {
            const response = await options.fetch(
                `${HUB}/api/models/${repo}/paths-info/${revision}`,
                {
                    method: 'POST',
                    headers: (() => {
                        const value = headers()
                        value.set('content-type', 'application/json')
                        return value
                    })(),
                    body: JSON.stringify({ paths, expand: true }),
                },
            )
            const refusal = refuse(response, repo)
            if (refusal) throw refusal

            const rows = await response.json() as Array<Record<string, unknown>>
            return rows.map((row) => {
                const lfs = row.lfs as { oid?: string; size?: number } | undefined
                const security = row.securityFileStatus as { status?: string } | undefined
                return {
                    path: String(row.path ?? ''),
                    sizeBytes: Number(lfs?.size ?? row.size ?? 0),
                    sha256: typeof lfs?.oid === 'string' ? lfs.oid : null,
                    xetHash: typeof row.xetHash === 'string' ? row.xetHash : null,
                    security: typeof security?.status === 'string' ? security.status : null,
                }
            })
        },

        /**
         * Resolve BARE, and apply the Range to the CDN URL afterwards.
         *
         * Measured, and the single most expensive thing to get wrong: if the
         * resolve request carries a Range, the CloudFront policy embeds that
         * exact range and the signed URL becomes single-use for it — every
         * later request answers `403 Auth failed: invalid range`. The obvious
         * implementation therefore works for the first chunk and fails on every
         * resume, which is a defect that only appears on flaky links and large
         * files: exactly the phone.
         */
        async resolveDownload(repo, revision, path) {
            const response = await options.fetch(
                `${HUB}/${repo}/resolve/${revision}/${path}`,
                { method: 'GET', headers: headers(), redirect: 'manual' },
            )
            const refusal = refuse(response, repo)
            if (refusal) throw refusal

            const url = response.headers.get('location')
            if (!url) throw fail('transport', response, 'Hugging Face returned no download address.')

            const expires = Number(new URL(url, HUB).searchParams.get('Expires'))
            const served = Date.parse(response.headers.get('date') ?? '')
            const livesForSeconds = Number.isFinite(expires) && expires > 0 && !Number.isNaN(served)
                ? expires - Math.floor(served / 1000)
                : null

            return { url, livesForSeconds }
        },
    }
}
