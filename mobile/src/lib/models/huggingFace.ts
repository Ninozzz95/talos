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

export interface TalosHuggingFaceModel {
    id: string
    downloads: number
    likes: number
    /**
     * Known from the search, so a gate is not discovered after someone has
     * picked a model, read a fit calculation and pressed download.
     *
     * The licence can be accepted only in a browser — an in-app checkbox would
     * be a false record of a legal agreement.
     */
    gated: boolean
    updatedAt: string | null
    /** A cosa serve: chat, codice, embedding. Dal Hub, non indovinato dal nome. */
    task: string | null
    /**
     * I numeri VERI del modello, quando il Hub li ha letti dai file GGUF.
     *
     * MISURATO 2026-08-04, ed e' la scoperta che rende inutile stimare dal
     * nome: chiedendo `expand[]=gguf` la lista torna con `total` (i parametri,
     * esatti), `totalFileSize` (i byte su disco) e `context_length` (la finestra
     * vera). In UNA richiesta per tutta la lista, non una per riga — che era
     * il motivo per cui si stimava.
     *
     * `null` quando il Hub non e' riuscito a leggerli: allora, e solo allora,
     * si ripiega sulla stima dal nome.
     */
    gguf: { parameters: number, fileBytes: number, contextLength: number, architecture: string | null } | null
    /** Le etichette del repo: da qui esce la licenza per il filtro. */
    tags: readonly string[]
}

export type TalosHuggingFaceSort = 'downloads' | 'likes' | 'lastModified' | 'createdAt'

export interface TalosHuggingFaceClient {
    searchModels(
        query: string,
        limit?: number,
        /**
         * Come ordinare. Il Hub li accetta tutti; questa e' la sua lista, non
         * una nostra invenzione.
         */
        sort?: TalosHuggingFaceSort,
    ): Promise<TalosHuggingFaceModel[]>
    listGgufFiles(repo: string, revision: string): Promise<string[]>
    pathsInfo(repo: string, revision: string, paths: readonly string[]): Promise<TalosHuggingFaceFile[]>
    resolveDownload(repo: string, revision: string, path: string): Promise<TalosHuggingFaceDownload>
    /**
     * The first bytes of a file, so its header can be read before four
     * gigabytes are committed to.
     */
    readHead(repo: string, revision: string, path: string, bytes: number): Promise<ArrayBuffer>
    /**
     * La scheda del modello: chi l'ha fatto, con che licenza, e cosa dice di se'.
     *
     * La descrizione viene dal README del repo, non da un riassunto nostro: e'
     * cio' che l'autore ha scritto, e inventarne uno sarebbe peggio che non
     * mostrarne nessuno. Torna GREZZO — chi lo mostra decide quanto renderne.
     */
    describeModel(repo: string): Promise<TalosHuggingFaceCard>
}

export interface TalosHuggingFaceCard {
    author: string | null
    license: string | null
    /** Il README, per intero e non interpretato. */
    readme: string
    updatedAt: string | null
}

/**
 * I numeri GGUF di una riga, se ci sono e hanno senso.
 *
 * Si controlla che siano positivi invece di fidarsi: un `total` a zero
 * significa che il Hub non e' riuscito a leggere il file, e trattarlo come «un
 * modello da zero parametri» direbbe a chiunque che ci sta comodo.
 */
function leggiGguf(value: unknown): TalosHuggingFaceModel['gguf'] {
    if (!value || typeof value !== 'object') return null
    const row = value as Record<string, unknown>
    const parameters = Number(row.total ?? 0)
    const fileBytes = Number(row.totalFileSize ?? 0)
    if (!(parameters > 0) || !(fileBytes > 0)) return null
    return {
        parameters,
        fileBytes,
        contextLength: Number(row.context_length ?? 0) || 0,
        architecture: typeof row.architecture === 'string' ? row.architecture : null,
    }
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
         * Find models that could actually run here.
         *
         * Filtered to GGUF at the Hub rather than locally: the unfiltered list
         * is overwhelmingly PyTorch checkpoints nothing on a phone can open,
         * and a search that returns twenty results the user cannot use reads as
         * a broken search.
         */
        async searchModels(query, limit = 20, sort = 'downloads') {
            /*
             * Senza testo si SFOGLIA, non si cerca il vuoto.
             *
             * MISURATO 2026-08-04 contro l'API vera: omettendo `search`, il Hub
             * restituisce comunque una lista ordinata per download. Mandare
             * `search: ''` invece chiede «i modelli che contengono la stringa
             * vuota», che e' una domanda diversa e con una risposta peggiore.
             *
             * E' la differenza fra una schermata che si apre gia' piena e una
             * che aspetta che tu sappia cosa cercare — owner 2026-08-04: «voglio
             * una lista gia' caricata con un loading, con i filtri».
             */
            const parameters = new URLSearchParams({
                filter: 'gguf',
                sort,
                direction: '-1',
                limit: String(limit),
            })
            /*
             * `expand[]=gguf` e' cio' che rende reale la capienza.
             *
             * Senza, una riga porta solo il nome e i download, e per sapere
             * quanto pesa un modello serviva una richiesta per repository —
             * venti righe, venti richieste, e il limitatore condiviso per
             * operatore. Con, la stessa singola richiesta torna con i parametri
             * esatti, i byte su disco e la finestra di contesto.
             *
             * MISURATO contro l'API il 2026-08-04.
             */
            parameters.append('expand[]', 'gguf')
            parameters.append('expand[]', 'downloads')
            parameters.append('expand[]', 'likes')
            parameters.append('expand[]', 'pipeline_tag')
            parameters.append('expand[]', 'tags')
            const cercato = query.trim()
            if (cercato.length > 0) parameters.set('search', cercato)
            const response = await options.fetch(`${HUB}/api/models?${parameters}`, {
                headers: headers(),
            })
            const refusal = refuse(response, query)
            if (refusal) throw refusal

            const rows = await response.json() as Array<Record<string, unknown>>
            return rows.map((row) => ({
                id: String(row.id ?? row.modelId ?? ''),
                downloads: Number(row.downloads ?? 0),
                likes: Number(row.likes ?? 0),
                task: typeof row.pipeline_tag === 'string' ? row.pipeline_tag : null,
                gguf: leggiGguf(row.gguf),
                tags: Array.isArray(row.tags) ? row.tags.filter((t): t is string => typeof t === 'string') : [],
                // The Hub answers `"auto"` or `"manual"` when a gate exists and
                // OMITS the field otherwise, so absent means open. Reading it
                // the cautious way round would mark nearly every model gated
                // and hide the catalogue; a gate that slips through is named at
                // `/resolve/`, with the page where the licence can be accepted.
                gated: row.gated !== undefined && row.gated !== null && row.gated !== false,
                updatedAt: typeof row.lastModified === 'string' ? row.lastModified : null,
            })).filter((model) => model.id !== '')
        },

        /**
         * Every GGUF in the repository, including the ones in subfolders.
         *
         * Recursive on purpose: quantisations are routinely published one
         * folder down, and a listing that stops at the top level shows a
         * repository as empty when it holds a dozen usable files.
         */
        async describeModel(repo) {
            const [info, readme] = await Promise.all([
                options.fetch(`${HUB}/api/models/${repo}`, { headers: headers() }),
                /*
                 * Il README si scarica dal ramo, non dall'API: `/api/models`
                 * porta `cardData` (i metadati in cima al file) ma NON il testo.
                 * Misurato 2026-08-04: `/raw/main/README.md` risponde 200 con la
                 * scheda intera.
                 */
                options.fetch(`${HUB}/${repo}/raw/main/README.md`, { headers: headers() }),
            ])
            const refusal = refuse(info, repo)
            if (refusal) throw refusal

            const row = await info.json() as Record<string, unknown>
            const card = (row.cardData ?? {}) as Record<string, unknown>
            return {
                author: typeof row.author === 'string' ? row.author : null,
                license: typeof card.license === 'string' ? card.license : null,
                // Un README che manca non e' un guasto: certi repo non ne hanno.
                readme: readme.ok ? await readme.text() : '',
                updatedAt: typeof row.lastModified === 'string' ? row.lastModified : null,
            }
        },
        async listGgufFiles(repo, revision) {
            const response = await options.fetch(
                `${HUB}/api/models/${repo}/tree/${revision}?recursive=true`,
                { headers: headers() },
            )
            const refusal = refuse(response, repo)
            if (refusal) throw refusal

            const rows = await response.json() as Array<Record<string, unknown>>
            return rows
                .filter((row) => row.type === 'file')
                .map((row) => String(row.path ?? ''))
                .filter((path) => path.toLowerCase().endsWith('.gguf'))
        },

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

        /**
         * Read the first bytes of a file, to learn what it is before committing
         * to four gigabytes of it.
         *
         * The Range goes on the CDN address and NEVER on `/resolve/`. Measured:
         * a resolve carrying a Range has that exact range embedded in the
         * CloudFront policy, and every later request answers
         * `403 Auth failed: invalid range` — so the obvious implementation
         * works for the header and then breaks every resume.
         */
        async readHead(repo, revision, path, bytes) {
            const { url } = await this.resolveDownload(repo, revision, path)
            const response = await options.fetch(url, {
                headers: new Headers({ range: `bytes=0-${bytes - 1}` }),
            })
            const refusal = refuse(response, repo)
            if (refusal) throw refusal
            return await response.arrayBuffer()
        },
    }
}
