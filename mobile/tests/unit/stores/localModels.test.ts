import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The download centre, as behaviour.
 *
 * Every assertion here is about a refusal that carries its reason. The offers
 * are easy; what separates this from a file listing is that a set missing a
 * shard, a header that will not parse, a phone that was never measured and a
 * repository that publishes no hash each produce something a person can act on
 * rather than a disabled button or a silent success.
 */
const bridge = vi.hoisted(() => ({
    measure: vi.fn(async () => ({
        totalRamBytes: 8_000_000_000,
        availableRamBytes: 5_000_000_000,
        lowMemoryThresholdBytes: 300_000_000,
        freeStorageBytes: 60_000_000_000,
        abiSupported: true,
        thermal: 'none' as const,
        // 60 GB/s: a current flagship's LPDDR5X, so this fixture is genuinely
        // the comfortable case rather than one asserted into existence.
        memoryBandwidthBytesPerSecond: 60_000_000_000,
        deviceModel: 'Pixel 9',
        androidSdk: 36,
    })),
    start: vi.fn(async () => ({
        ok: true as const,
        started: {
            id: 'transfer-new', phase: 'queued' as const,
            runner: 'USER_INITIATED_JOB' as const, networkBound: true,
        },
    })),
    pause: vi.fn(async () => ({ ok: true as const })),
    resume: vi.fn(async () => ({
        ok: true as const,
        started: {
            id: 'transfer-new', phase: 'queued' as const,
            runner: 'USER_INITIATED_JOB' as const, networkBound: true,
        },
    })),
    cancel: vi.fn(async () => ({ ok: true as const })),
    stop: vi.fn(async () => undefined),
    status: vi.fn(async () => ({
        phase: 'idle' as const, active: false, repo: null, revision: null, paths: [],
        modelName: null, haveBytes: 0, totalBytes: 0, runner: null,
        networkBound: true, failure: null, resumable: false, readFailure: null,
    })),
    leftovers: vi.fn(async () => ({ items: [], totalBytes: 0 })),
    // Returns a transport that reaches nothing: the tests that care about the
    // network always inject their own, and this one only has to be identifiable.
    hubTransport: vi.fn(() => (async () => new Response('{}')) as typeof globalThis.fetch),
    getKey: vi.fn(async () => null),
    setKey: vi.fn(async () => undefined),
    clearKey: vi.fn(async () => undefined),
}))

vi.mock('@/services/hubTransport', () => ({
    talosCreateHubTransport: bridge.hubTransport,
    talosDecodeHubBody: (value: unknown) => value,
}))

vi.mock('@/services/secureKeyStore', () => ({
    getProviderKey: bridge.getKey,
    setProviderKey: bridge.setKey,
    clearProviderKey: bridge.clearKey,
}))

vi.mock('@/services/deviceCapacity', () => ({
    talosMeasureDevice: bridge.measure,
    talosCurrentThermalState: vi.fn(async () => 'none'),
}))

vi.mock('@/services/modelTransfer', () => ({
    talosStartModelTransfer: bridge.start,
    talosPauseModelTransfer: bridge.pause,
    talosResumeModelTransfer: bridge.resume,
    talosCancelModelTransfer: bridge.cancel,
    talosStopModelTransfer: bridge.stop,
    talosModelTransferStatus: bridge.status,
    talosModelTransferLeftovers: bridge.leftovers,
    talosTransfersAreSupported: () => true,
}))

/** A GGUF header with real bytes: a parser fed a mock proves nothing. */
function ggufBytes(): ArrayBuffer {
    const parts: number[] = []
    const push32 = (value: number) => {
        for (let shift = 0; shift < 32; shift += 8) parts.push((value >>> shift) & 0xff)
    }
    const push64 = (value: number) => {
        push32(value)
        push32(0)
    }
    const pushText = (value: string) => {
        const encoded = new TextEncoder().encode(value)
        push64(encoded.length)
        for (const byte of encoded) parts.push(byte)
    }

    for (const byte of new TextEncoder().encode('GGUF')) parts.push(byte)
    push32(3)
    push64(1) // one tensor
    push64(7) // seven fields

    pushText('general.architecture'); push32(8); pushText('llama')
    pushText('general.file_type'); push32(4); push32(15)
    pushText('llama.block_count'); push32(4); push32(32)
    pushText('llama.context_length'); push32(4); push32(131_072)
    pushText('llama.embedding_length'); push32(4); push32(4096)
    pushText('llama.attention.head_count'); push32(4); push32(32)
    pushText('llama.attention.head_count_kv'); push32(4); push32(8)

    pushText('token_embd.weight'); push32(2); push64(4096); push64(32_000); push32(12); push64(0)

    return new Uint8Array(parts).buffer
}

function transport(routes: Record<string, () => Response>): typeof globalThis.fetch {
    return (async (input: RequestInfo | URL) => {
        const url = String(input)
        const match = Object.keys(routes).find((fragment) => url.includes(fragment))
        if (!match) return new Response('no route', { status: 404 })
        return routes[match]!()
    }) as typeof globalThis.fetch
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const TREE = [
    { type: 'file', path: 'model-Q4_K_M.gguf' },
    { type: 'file', path: 'model-Q8_0-00001-of-00002.gguf' },
    { type: 'file', path: 'model-Q8_0-00002-of-00002.gguf' },
]

const PATHS_INFO = [
    { path: 'model-Q4_K_M.gguf', lfs: { oid: 'a'.repeat(64), size: 2_500_000_000 } },
    { path: 'model-Q8_0-00001-of-00002.gguf', lfs: { oid: 'b'.repeat(64), size: 3_000_000_000 } },
    { path: 'model-Q8_0-00002-of-00002.gguf', lfs: { oid: 'c'.repeat(64), size: 3_000_000_000 } },
]

const ROUTES = {
    '/api/models?': () => json([{ id: 'unsloth/Qwen3-4B-GGUF', downloads: 900, likes: 4, gated: false }]),
    '/tree/': () => json(TREE),
    '/paths-info/': () => json(PATHS_INFO),
    '/resolve/': () => new Response(null, {
        status: 302,
        headers: { location: 'https://us.aws.cdn.hf.co/xet/abc?Expires=9999999999' },
    }),
    'us.aws.cdn.hf.co': () => new Response(ggufBytes()),
}

beforeEach(() => {
    vi.resetModules()
    bridge.measure.mockClear()
    bridge.start.mockClear().mockResolvedValue({
        ok: true, started: {
            id: 'transfer-new', phase: 'queued',
            runner: 'USER_INITIATED_JOB', networkBound: true,
        },
    })
    bridge.pause.mockClear().mockResolvedValue({ ok: true })
    bridge.resume.mockClear().mockResolvedValue({
        ok: true, started: {
            id: 'transfer-new', phase: 'queued',
            runner: 'USER_INITIATED_JOB', networkBound: true,
        },
    })
    bridge.cancel.mockClear().mockResolvedValue({ ok: true })
    bridge.status.mockClear().mockResolvedValue({
        phase: 'idle', active: false, repo: null, revision: null, paths: [],
        modelName: null, haveBytes: 0, totalBytes: 0, runner: null,
        networkBound: true, failure: null, resumable: false, readFailure: null,
    })
    bridge.hubTransport.mockClear()
    bridge.getKey.mockClear().mockResolvedValue(null)
})

async function openedRepo() {
    const store = await import('@/stores/localModels')
    store.talosInitLocalModels(transport(ROUTES))
    await store.talosRefreshDeviceCapacity()
    await store.talosOpenModelRepo('unsloth/Qwen3-4B-GGUF')
    return store
}

describe('how it reaches the Hub', () => {
    /**
     * The defect the whole suite once certified as working: with the WebView's
     * own `fetch`, `redirect: 'manual'` yields an opaque-redirect response —
     * status 0, no headers — so the signed CDN address could never be read and
     * every fit verdict on every device failed with "unreadable transport".
     *
     * The cure is that the native transport is the DEFAULT, not something wired
     * at boot that a future caller could forget. This asserts exactly that: ask
     * for a client with no transport and the native one is what gets built.
     */
    it('builds the transport that can see a redirect, and never the raw fetch', async () => {
        const store = await import('@/stores/localModels')

        // No argument at all — the path a forgetful caller takes.
        store.talosInitLocalModels()

        expect(bridge.hubTransport).toHaveBeenCalled()
    })

    /**
     * And the same on the path that runs after a token is saved, which rebuilds
     * the client and is the easiest place to reintroduce the raw fetch.
     */
    it('keeps the native transport when the client is rebuilt for a token', async () => {
        const store = await import('@/stores/localModels')
        bridge.hubTransport.mockClear()

        await store.talosRefreshHuggingFaceToken()

        expect(bridge.hubTransport).toHaveBeenCalled()
    })
})

describe('finding and opening a repository', () => {
    it('turns a repository into the models it holds, not the files it contains', async () => {
        const store = await openedRepo()

        expect(store.talosLocalModels.repo?.sets.map((set) => set.label)).toEqual(['Q4_K_M', 'Q8_0'])
        // The split set is one model of six gigabytes, never two of three.
        expect(store.talosLocalModels.repo?.sets[1]!.totalBytes).toBe(6_000_000_000)
    })

    it('does not resurrect a repository when its response arrives after Back', async () => {
        let releaseTree!: (response: Response) => void
        const delayedTree = new Promise<Response>((resolve) => { releaseTree = resolve })
        const fetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input)
            if (url.includes('/tree/')) return delayedTree
            if (url.includes('/paths-info/')) return json(PATHS_INFO)
            return json([])
        }) as typeof globalThis.fetch
        const store = await import('@/stores/localModels')
        store.talosInitLocalModels(fetch)

        const opening = store.talosOpenModelRepo('unsloth/Qwen3-4B-GGUF', 'pinned')
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
        store.talosCloseModelRepo()
        releaseTree(json(TREE))
        await opening

        expect(store.talosLocalModels.repo).toBeNull()
        expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('says why a search failed instead of showing an empty list', async () => {
        const store = await import('@/stores/localModels')
        store.talosInitLocalModels(transport({
            '/api/models?': () => new Response('<html/>', {
                status: 429,
                headers: { ratelimit: 'limit=300;t=254' },
            }),
        }))

        await store.talosSearchLocalModels('qwen')

        expect(store.talosLocalModels.searchFailure).toBe('rate-limited:254')
        expect(store.talosLocalModels.results).toEqual([])
    })

    it('senza testo SFOGLIA il Hub invece di svuotare la lista', async () => {
        /**
         * Contratto cambiato di proposito, owner 2026-08-04: «è ancora un campo
         * input in cui devi inserire manualmente le cose; voglio una lista già
         * caricata con un loading».
         *
         * Prima una ricerca vuota azzerava i risultati, quindi la schermata si
         * apriva vuota e restava vuota. MISURATO contro l'API vera: omettendo
         * `search`, il Hub risponde coi modelli GGUF ordinati per download.
         */
        const fetch = vi.fn(async () => json([]))
        const store = await import('@/stores/localModels')
        store.talosInitLocalModels(fetch as never)

        await store.talosSearchLocalModels('   ')

        expect(fetch).toHaveBeenCalledTimes(1)
        const chiamata = String(fetch.mock.calls[0]![0])
        // Sfoglia: NON chiede «i modelli che contengono la stringa vuota».
        expect(chiamata).not.toContain('search=')
        expect(chiamata).toContain('sort=downloads')
    })
})

describe('examining a model before committing to it', () => {
    /**
     * THE answer no other app in this category gives: not "here is a file",
     * but "this runs on your phone, at this speed".
     */
    it('reads the model own header and answers whether this phone can hold it', async () => {
        const store = await openedRepo()
        const set = store.talosLocalModels.repo!.sets[0]!

        await store.talosExamineSet(set.paths[0]!)

        expect(set.examination.state).toBe('read')
        if (set.examination.state !== 'read') return
        expect(set.examination.fit.band).toBe('comfortable')
        expect(set.examination.trainedContext).toBe(131_072)
        // From the header, which outranks the name it came with.
        expect(set.examination.quantisation).toBe('Q4_K_M')
    })

    /**
     * The interesting half, and the phone this whole feature exists for. A
     * refusal that ends the conversation is a worse product than one that names
     * its cause and offers a smaller context to try.
     */
    it('refuses on a small phone with the reason and a counter-offer', async () => {
        bridge.measure.mockResolvedValue({
            totalRamBytes: 3_000_000_000,
            availableRamBytes: 1_200_000_000,
            lowMemoryThresholdBytes: 200_000_000,
            freeStorageBytes: 20_000_000_000,
            abiSupported: true,
            thermal: 'none' as const,
            memoryBandwidthBytesPerSecond: 8_000_000_000,
            deviceModel: 'A 3 GB phone',
            androidSdk: 30,
        })
        const store = await openedRepo()
        const set = store.talosLocalModels.repo!.sets[0]!

        await store.talosExamineSet(set.paths[0]!)

        expect(set.examination.state).toBe('read')
        if (set.examination.state !== 'read') return
        expect(set.examination.fit.band).toBe('wont-run')
        expect(set.examination.fit.reason).toBe('memory')
        expect(set.examination.fit.maxContext).toBeGreaterThanOrEqual(0)
    })

    /**
     * A fit answer needs a phone. Without one the honest state is "unreadable"
     * with the reason â€” never a default device, which is how an app promises a
     * model will run on hardware it never looked at.
     */
    it('refuses to judge fit on a phone it never measured', async () => {
        const store = await import('@/stores/localModels')
        store.talosInitLocalModels(transport(ROUTES))
        await store.talosOpenModelRepo('unsloth/Qwen3-4B-GGUF')
        const set = store.talosLocalModels.repo!.sets[0]!

        await store.talosExamineSet(set.paths[0]!)

        expect(set.examination).toEqual({ state: 'unreadable', reason: 'no-device-measurement' })
    })

    it('names an unreadable header rather than vouching for the model', async () => {
        const store = await import('@/stores/localModels')
        store.talosInitLocalModels(transport({
            ...ROUTES,
            'us.aws.cdn.hf.co': () => new Response(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer),
        }))
        await store.talosRefreshDeviceCapacity()
        await store.talosOpenModelRepo('unsloth/Qwen3-4B-GGUF')
        const set = store.talosLocalModels.repo!.sets[0]!

        await store.talosExamineSet(set.paths[0]!)

        expect(set.examination.state).toBe('unreadable')
    })
})

describe('starting a download', () => {
    /**
     * EVERY piece, each with its own length and its own hash.
     *
     * This asserted the set's TOTAL against a single path, and that is exactly
     * the bug it was blessing: the job downloaded shard one, asked for a window
     * past its end, read the 416 as "the file changed upstream" and deleted
     * every byte. Found by an adversarial review on 2026-08-01 — in the code
     * that had just learned to treat a split model as one model.
     */
    it('hands the native side every piece of the set, with its own hash', async () => {
        const store = await openedRepo()
        const set = store.talosLocalModels.repo!.sets[1]!

        expect(await store.talosDownloadSet(set.paths[0]!)).toEqual({ ok: true })
        expect(bridge.start).toHaveBeenCalledWith(expect.objectContaining({
            repo: 'unsloth/Qwen3-4B-GGUF',
            files: [
                { path: 'model-Q8_0-00001-of-00002.gguf', bytes: 3_000_000_000, sha256: 'b'.repeat(64) },
                { path: 'model-Q8_0-00002-of-00002.gguf', bytes: 3_000_000_000, sha256: 'c'.repeat(64) },
            ],
        }))
    })

    /**
     * A model that will not fit is NOT refused. The card has already said so in
     * the user's own terms, and someone who reads "will crawl" and wants it
     * anyway is entitled to it â€” it is their phone. What is refused is what
     * cannot work at all.
     */
    it('refuses a set the repository is missing pieces of, and says which', async () => {
        const store = await import('@/stores/localModels')
        store.talosInitLocalModels(transport({
            ...ROUTES,
            '/tree/': () => json([{ type: 'file', path: 'model-Q8_0-00001-of-00002.gguf' }]),
            '/paths-info/': () => json([PATHS_INFO[1]]),
        }))
        await store.talosOpenModelRepo('a/b')
        const set = store.talosLocalModels.repo!.sets[0]!

        expect(set.incomplete).toBe(true)
        expect(await store.talosDownloadSet(set.paths[0]!)).toEqual({
            ok: false, reason: 'incomplete-set',
        })
        expect(bridge.start).not.toHaveBeenCalled()
    })

    it('allows a second distinct download while another one is running', async () => {
        bridge.status.mockResolvedValue({
            phase: 'running', active: true, repo: 'a/b', revision: 'main', paths: ['x.gguf'],
            modelName: 'Something', haveBytes: 10, totalBytes: 100,
            runner: 'USER_INITIATED_JOB', networkBound: true,
            failure: null, resumable: true, readFailure: null,
        })
        const store = await openedRepo()
        await store.talosRefreshTransfer()

        expect(await store.talosDownloadSet(
            store.talosLocalModels.repo!.sets[0]!.paths[0]!,
        )).toEqual({ ok: true })
        expect(bridge.start).toHaveBeenCalledOnce()
    })

    it('resumes from native journal after its repository route has closed', async () => {
        bridge.status
            .mockResolvedValueOnce({
                phase: 'running', active: true, repo: 'a/b', revision: 'main', paths: ['x.gguf'],
                modelName: 'Qwen Q4', haveBytes: 10, totalBytes: 100,
                runner: 'USER_INITIATED_JOB', networkBound: true,
                failure: null, resumable: true, readFailure: null,
            })
            .mockResolvedValueOnce({
                phase: 'paused', active: false, repo: 'a/b', revision: 'main', paths: ['x.gguf'],
                modelName: 'Qwen Q4', haveBytes: 10, totalBytes: 100,
                runner: 'USER_INITIATED_JOB', networkBound: true,
                failure: null, resumable: true, readFailure: null,
            })
            .mockResolvedValue({
                phase: 'running', active: true, repo: 'a/b', revision: 'main', paths: ['x.gguf'],
                modelName: 'Qwen Q4', haveBytes: 10, totalBytes: 100,
                runner: 'USER_INITIATED_JOB', networkBound: true,
                failure: null, resumable: true, readFailure: null,
            })
        const store = await openedRepo()
        const key = store.talosLocalModels.repo!.sets[0]!.paths[0]!

        await store.talosDownloadSet(key, 'Qwen Q4')
        const originalRequest = bridge.start.mock.calls[0]![0]
        store.talosCloseModelRepo()
        await store.talosStopLocalDownload()

        expect(store.talosLocalModels.repo).toBeNull()
        expect(store.talosLocalModels.transfer.paused).toBe(true)
        expect(await store.talosResumeLocalDownload()).toEqual({ ok: true })
        expect(bridge.start).toHaveBeenCalledTimes(1)
        expect(bridge.start.mock.calls[0]![0]).toEqual(originalRequest)
        expect(bridge.resume).toHaveBeenCalledOnce()
    })

    /**
     * Below Android 14 the transfer is not pinned to the network it began on.
     * That fact has to reach the screen, because someone starting six gigabytes
     * on a train deserves to know before their data allowance finds out.
     */
    it('carries the network caveat all the way from the platform to the screen', async () => {
        bridge.start.mockResolvedValue({
            ok: true, started: {
                id: 'transfer-new', phase: 'queued',
                runner: 'FOREGROUND_SERVICE', networkBound: false,
            },
        })
        bridge.status.mockResolvedValue({
            phase: 'queued', active: true, repo: 'unsloth/Qwen3-4B-GGUF',
            revision: 'main', paths: ['model-Q4_K_M.gguf'], modelName: 'Qwen Q4',
            haveBytes: 0, totalBytes: 2_500_000_000,
            runner: 'FOREGROUND_SERVICE', networkBound: false,
            failure: null, resumable: true, readFailure: null,
        })
        const store = await openedRepo()

        await store.talosDownloadSet(store.talosLocalModels.repo!.sets[0]!.paths[0]!)

        expect(store.talosLocalModels.transfer.runner).toBe('FOREGROUND_SERVICE')
        expect(store.talosLocalModels.transfer.networkBound).toBe(false)
    })

    it('keeps the reason a refusal came back with', async () => {
        bridge.start.mockResolvedValue({ ok: false, reason: 'Android refused to start the transfer' })
        const store = await openedRepo()

        const result = await store.talosDownloadSet(store.talosLocalModels.repo!.sets[0]!.paths[0]!)

        expect(result).toEqual({ ok: false, reason: 'Android refused to start the transfer' })
        expect(store.talosLocalModels.transfer.failure).toBe('Android refused to start the transfer')
    })
})
