import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

/**
 * The second door.
 *
 * Every feature in TALOS has two — a place you can go and a tool the model can
 * call — and the outcome lands in both. Someone who asks "can my phone run
 * Qwen3?" mid-conversation should get an answer, not directions to a screen.
 *
 * What is asserted here is mostly about restraint: the model gets codes and
 * numbers rather than our sentences, a download asks the human every single
 * time no matter what has been granted before, and nothing is claimed that the
 * device did not report.
 */
const store = vi.hoisted(() => ({
    state: null as never,
    search: vi.fn(async () => undefined),
    open: vi.fn(async () => undefined),
    examine: vi.fn(async () => undefined),
    examineRepo: vi.fn(async () => undefined),
    download: vi.fn(async () => ({ ok: true as const })),
    refreshDevice: vi.fn(async () => undefined),
    refreshTransfer: vi.fn(async () => undefined),
    refreshLeftovers: vi.fn(async () => undefined),
    refreshToken: vi.fn(async () => undefined),
}))

vi.mock('@/stores/localModels', () => ({
    talosLocalModels: new Proxy({}, { get: (_, key) => (store.state as never)[key] }),
    talosSearchLocalModels: store.search,
    talosOpenModelRepo: store.open,
    talosExamineSet: store.examine,
    talosExamineRepo: store.examineRepo,
    talosDownloadSet: store.download,
    talosRefreshDeviceCapacity: store.refreshDevice,
    talosRefreshTransfer: store.refreshTransfer,
    talosRefreshLeftovers: store.refreshLeftovers,
    talosRefreshHuggingFaceToken: store.refreshToken,
}))

import { createTalosLocalModelTools } from '@/lib/models/modelTools'

function toolNamed(name: string) {
    const tool = createTalosLocalModelTools().find((candidate) => candidate.name === name)
    if (!tool) throw new Error(`no tool called ${name}`)
    return tool
}

async function call(name: string, input: unknown) {
    const tool = toolNamed(name)
    // Through the schema, as the executor does: a tool that accepts free-form
    // input is a tool that can be talked into anything.
    const parsed = tool.input.parse(input)
    return await tool.run(parsed as never, { sessionId: 's1' })
}

function fit(over: Record<string, unknown> = {}) {
    return {
        band: 'comfortable',
        reason: 'fits',
        kvCacheBytes: 500_000_000,
        requiredBytes: 900_000_000,
        residentBytes: 3_000_000_000,
        deficitBytes: 0,
        tokensPerSecond: 13.8,
        maxContext: 32_768,
        ...over,
    }
}

function set(over: Record<string, unknown> = {}) {
    return {
        label: 'Q4_K_M',
        quantisation: 'Q4_K_M',
        paths: ['model-Q4_K_M.gguf'],
        totalBytes: 2.5 * 1024 ** 3,
        sha256: ['a'.repeat(64)],
        incomplete: false,
        expectedShards: 1,
        foundShards: 1,
        security: 'safe',
        examination: { state: 'read', fit: fit(), quantisation: 'Q4_K_M', trainedContext: 131_072 },
        ...over,
    }
}

function transferItem(over: Record<string, unknown> = {}) {
    return {
        id: 'transfer-a', phase: 'running', active: true,
        repo: 'owner/model-a', revision: 'main', paths: ['a.gguf'],
        modelName: 'Model A', haveBytes: 25, totalBytes: 100,
        runner: 'USER_INITIATED_JOB', networkBound: true,
        failure: null, resumable: true,
        ...over,
    }
}

function baseState(over: Record<string, unknown> = {}) {
    return reactive({
        query: '', searching: false, results: [], searchFailure: null,
        repo: null,
        device: {
            totalRamBytes: 8 * 1024 ** 3, availableRamBytes: 5 * 1024 ** 3,
            lowMemoryThresholdBytes: 300_000_000, freeStorageBytes: 60 * 1024 ** 3,
            abiSupported: true, thermal: 'none',
            memoryBandwidthBytesPerSecond: 60_000_000_000,
            deviceModel: 'Pixel 9', androidSdk: 36,
        },
        context: 4096,
        transfer: {
            active: false, modelName: null, haveBytes: 0, totalBytes: 0,
            runner: null, networkBound: true, failure: null, items: [],
        },
        leftovers: { items: [], totalBytes: 0 },
        ...over,
    })
}

beforeEach(() => {
    store.search.mockClear()
    store.open.mockClear()
    store.examine.mockClear()
    store.examineRepo.mockClear()
    store.download.mockClear().mockResolvedValue({ ok: true })
    store.refreshLeftovers.mockClear()
    store.refreshToken.mockClear()
    store.state = baseState() as never
})

describe('the permission each tool asks for', () => {
    /**
     * THE rule, from the owner and not negotiable: a download spends gigabytes
     * of someone's storage and possibly of their mobile data allowance. A
     * permission granted once for a 400 MB model must not silently authorise a
     * 14 GB one an hour later, so no saved grant can stand in for the question.
     */
    it('asks the human every single time before downloading', () => {
        expect(toolNamed('local_model_download').confirmation).toBe('always')
    })

    it('C45-RED-08H names the two active slots and durable queue honestly', () => {
        expect(toolNamed('local_model_download').description).toContain('up to two')
        expect(toolNamed('local_model_download').description).toContain('queue')
    })

    it('declares reaching the Hub as outbound, so the outbound policy governs it', () => {
        expect(toolNamed('local_models_search').action).toBe('outbound')
        expect(toolNamed('local_model_inspect').action).toBe('outbound')
    })

    /** Downloading both writes to the device and reaches out; it declares both. */
    it('declares everything downloading actually does', () => {
        const download = toolNamed('local_model_download')

        expect(download.action).toBe('write')
        expect(download.requiredActions).toEqual(['write', 'outbound'])
    })

    /** Asking what is downloading touches nothing and reaches nowhere. */
    it('keeps checking on a download a plain read', () => {
        expect(toolNamed('local_models_status').action).toBe('read')
        expect(toolNamed('local_models_status').confirmation).toBeUndefined()
    })

    /**
     * A repository id is `owner/name` and nothing else. A tool that takes
     * free-form text where a path goes is a tool that can be talked into
     * fetching something else entirely.
     */
    it('refuses anything that is not a repository id', () => {
        const inspect = toolNamed('local_model_inspect')

        expect(inspect.input.safeParse({ repo: '../../etc/passwd' }).success).toBe(false)
        expect(inspect.input.safeParse({ repo: 'https://evil.example/x' }).success).toBe(false)
        expect(inspect.input.safeParse({ repo: 'unsloth/Qwen3-4B-GGUF' }).success).toBe(true)
    })
})

describe('searching', () => {
    it('returns repositories with the gate stated', async () => {
        store.state = baseState({
            results: [
                { id: 'unsloth/Qwen3-4B-GGUF', downloads: 900, likes: 4, gated: false },
                { id: 'meta-llama/Llama-3-8B', downloads: 90, likes: 1, gated: true },
            ],
        }) as never

        const result = await call('local_models_search', { query: 'qwen3' })

        expect(result.ok).toBe(true)
        expect(JSON.parse(result.content).models).toEqual([
            { repo: 'unsloth/Qwen3-4B-GGUF', downloads: 900, gated: false },
            { repo: 'meta-llama/Llama-3-8B', downloads: 90, gated: true },
        ])
    })

    /** A rate limit is named, so the model can say when to try again. */
    it('reports why a search failed instead of returning nothing', async () => {
        store.state = baseState({ searchFailure: 'rate-limited:254' }) as never

        const result = await call('local_models_search', { query: 'qwen3' })

        expect(result.ok).toBe(false)
        expect(result.code).toBe('rate-limited:254')
    })
})

describe('inspecting', () => {
    /**
     * The answer no other app gives, handed to the model as CODES rather than
     * sentences — which is the whole reason it is a tool and not a screen: it
     * has to be explainable in the user's own language.
     */
    it('answers whether each model runs here, in codes the model can explain', async () => {
        store.state = baseState({
            repo: { id: 'unsloth/Qwen3-4B-GGUF', revision: 'main', loading: false, sets: [set()] },
        }) as never

        const result = await call('local_model_inspect', { repo: 'unsloth/Qwen3-4B-GGUF' })

        const payload = JSON.parse(result.content)
        expect(payload.models[0]).toMatchObject({
            quantisation: 'Q4_K_M',
            size: '2.5 GB',
            verdict: 'comfortable',
            reason: 'fits',
            tokensPerSecond: 13.8,
            verifiable: true,
        })
        expect(payload.device.model).toBe('Pixel 9')
    })

    /** Re-measured first: a fit answer from an hour ago is about another phone. */
    it('measures the phone again before judging anything', async () => {
        store.state = baseState({
            repo: { id: 'a/b', revision: 'main', loading: false, sets: [set()] },
        }) as never

        await call('local_model_inspect', { repo: 'a/b' })

        expect(store.refreshDevice).toHaveBeenCalled()
    })

    it('carries the counter-offer so the model can suggest a smaller context', async () => {
        store.state = baseState({
            context: 131_072,
            repo: {
                id: 'a/b',
                revision: 'main',
                loading: false,
                sets: [set({
                    examination: {
                        state: 'read',
                        fit: fit({ band: 'wont-run', reason: 'context', maxContext: 8192 }),
                        quantisation: 'Q4_K_M',
                        trainedContext: 131_072,
                    },
                })],
            },
        }) as never

        const result = await call('local_model_inspect', { repo: 'a/b' })

        expect(JSON.parse(result.content).models[0]).toMatchObject({
            verdict: 'wont-run', reason: 'context', fitsAtContext: 8192,
        })
    })

    /**
     * A set missing shards is named unusable and never examined — reading a
     * header for a model that cannot be assembled spends a request on nothing.
     */
    it('marks an incomplete set unusable rather than judging it', async () => {
        store.state = baseState({
            repo: {
                id: 'a/b',
                revision: 'main',
                loading: false,
                sets: [set({
                    incomplete: true, expectedShards: 3, foundShards: 1,
                    examination: { state: 'unread' },
                })],
            },
        }) as never

        const result = await call('local_model_inspect', { repo: 'a/b' })

        expect(JSON.parse(result.content).models[0]).toMatchObject({
            unusable: 'missing-parts', missing: 2, total: 3,
        })
        expect(store.examine).not.toHaveBeenCalled()
    })

    /**
     * ⛔⛔ IL TOOL CHIEDE UNA LETTURA PER MODELLO, non una per versione.
     *
     * Owner 2026-08-11: «DeepSeek ci sta un casino di tempo… era quando è stato
     * attivato il tool ricerca modelli da hf». Qui c'era un ciclo che leggeva
     * l'intestazione di ogni singola versione, in fila, e le versioni sono
     * 18-29 nei repository veri. Costo misurato: 1.630 ms a lettura, e
     * l'intestazione vera supera i 7 MiB ⇒ due richieste ciascuna, ~153 MB
     * scaricati uno alla volta prima di poter rispondere.
     *
     * ⛔ Questo caso sta QUI e non solo sullo store perché la lezione l'ho già
     * pagata una volta: una prova sulla funzione non dice niente su chi la
     * chiama. Rimettendo il ciclo, `examine` torna a essere chiamato e
     * `examineRepo` no — e questa riga diventa rossa.
     */
    it('⛔ non legge una intestazione per versione: ne chiede una per MODELLO', async () => {
        store.state = baseState({
            repo: {
                id: 'a/b',
                revision: 'main',
                loading: false,
                sets: [set({ label: 'IQ3_M' }), set({ label: 'Q4_0' }), set({ label: 'Q8_0' })],
            },
        }) as never

        await call('local_model_inspect', { repo: 'a/b' })

        expect(store.examineRepo).toHaveBeenCalledTimes(1)
        expect(store.examine).not.toHaveBeenCalled()
    })

    /** No bandwidth reading means the model must not report a speed. */
    it('says the bandwidth was never measured rather than implying a speed', async () => {
        store.state = baseState({
            device: { ...(baseState().device as never), memoryBandwidthBytesPerSecond: null },
            repo: { id: 'a/b', revision: 'main', loading: false, sets: [set()] },
        }) as never

        const result = await call('local_model_inspect', { repo: 'a/b' })

        expect(JSON.parse(result.content).device.measuredBandwidth).toBe(false)
    })

    it('does not format unknown storage as a measured zero', async () => {
        store.state = baseState({
            device: { ...(baseState().device as never), freeStorageBytes: null },
            repo: { id: 'a/b', revision: 'main', loading: false, sets: [set()] },
        }) as never

        const result = await call('local_model_inspect', { repo: 'a/b' })

        expect(JSON.parse(result.content).device.freeStorage).toBeNull()
    })
})

describe('downloading', () => {
    /**
     * One outcome, two doors. The tool calls the same store the Model Lab
     * section calls, so a download started from chat is the download the
     * section shows and the notification reports.
     */
    it('starts the same download the screen would have started', async () => {
        store.state = baseState({
            repo: { id: 'unsloth/Qwen3-4B-GGUF', revision: 'main', loading: false, sets: [set()] },
        }) as never

        const result = await call('local_model_download', {
            repo: 'unsloth/Qwen3-4B-GGUF', file: 'model-Q4_K_M.gguf',
        })

        expect(store.download).toHaveBeenCalledWith('model-Q4_K_M.gguf')
        expect(JSON.parse(result.content)).toMatchObject({ started: true, size: '2.5 GB' })
    })

    it('refuses a file that repository does not have', async () => {
        store.state = baseState({
            repo: { id: 'a/b', revision: 'main', loading: false, sets: [set()] },
        }) as never

        const result = await call('local_model_download', { repo: 'a/b', file: 'nope.gguf' })

        expect(result.ok).toBe(false)
        expect(result.code).toBe('no-such-file')
        expect(store.download).not.toHaveBeenCalled()
    })

    /**
     * The caveat that costs money if it goes unsaid: below Android 14 the
     * transfer is not tied to the network it began on.
     */
    it('tells the model when the download can wander onto mobile data', async () => {
        store.state = baseState({
            repo: { id: 'a/b', revision: 'main', loading: false, sets: [set()] },
            transfer: {
                active: true, modelName: 'x', haveBytes: 0, totalBytes: 1,
                runner: 'FOREGROUND_SERVICE', networkBound: false, failure: null,
                items: [transferItem({
                    modelName: 'x', haveBytes: 0, totalBytes: 1,
                    runner: 'FOREGROUND_SERVICE', networkBound: false,
                })],
            },
        }) as never

        const result = await call('local_model_download', { repo: 'a/b', file: 'model-Q4_K_M.gguf' })

        expect(JSON.parse(result.content).tiedToCurrentNetwork).toBe(false)
    })

    it('C45-RED-08H attributes the second start to its own network policy', async () => {
        const state = baseState({
            repo: { id: 'a/b', revision: 'main', loading: false, sets: [set()] },
            transfer: {
                active: true, modelName: 'Model A', haveBytes: 25, totalBytes: 100,
                runner: 'USER_INITIATED_JOB', networkBound: true, failure: null,
                items: [transferItem()],
            },
        })
        store.state = state as never
        store.download.mockImplementationOnce(async () => {
            state.transfer.items.push(transferItem({
                id: 'transfer-b', repo: 'a/b', paths: ['model-Q4_K_M.gguf'],
                modelName: 'Model B', networkBound: false,
            }))
            return { ok: true }
        })

        const result = await call('local_model_download', { repo: 'a/b', file: 'model-Q4_K_M.gguf' })

        expect(JSON.parse(result.content).tiedToCurrentNetwork).toBe(false)
    })

    it('passes a refusal back with its reason', async () => {
        store.download.mockResolvedValue({ ok: false, reason: 'already-running' } as never)
        store.state = baseState({
            repo: { id: 'a/b', revision: 'main', loading: false, sets: [set()] },
        }) as never

        const result = await call('local_model_download', { repo: 'a/b', file: 'model-Q4_K_M.gguf' })

        expect(result.ok).toBe(false)
        expect(result.code).toBe('already-running')
    })
})

describe('checking on it', () => {
    it('reports progress without touching the network', async () => {
        store.state = baseState({
            transfer: {
                active: true, modelName: 'Qwen3-4B Q4_K_M',
                haveBytes: 1024 ** 3, totalBytes: 4 * 1024 ** 3,
                runner: 'USER_INITIATED_JOB', networkBound: true, failure: null,
                items: [transferItem({
                    modelName: 'Qwen3-4B Q4_K_M',
                    haveBytes: 1024 ** 3, totalBytes: 4 * 1024 ** 3,
                })],
            },
        }) as never

        const result = await call('local_models_status', {})

        expect(JSON.parse(result.content).downloading).toEqual({
            model: 'Qwen3-4B Q4_K_M', done: '1 GB', total: '4 GB', percent: 25,
        })
    })

    it('says plainly that nothing is downloading', async () => {
        const result = await call('local_models_status', {})

        expect(JSON.parse(result.content).downloading).toBeNull()
    })

    it('C45-RED-08H reports every durable row and projects the first active one', async () => {
        store.state = baseState({
            transfer: {
                active: true, modelName: 'Model A', haveBytes: 25, totalBytes: 100,
                runner: 'USER_INITIATED_JOB', networkBound: true, failure: null,
                items: [
                    transferItem({ phase: 'paused', active: false }),
                    transferItem({
                        id: 'transfer-b', phase: 'running', active: true,
                        modelName: 'Model B', haveBytes: 50, totalBytes: 200,
                    }),
                    transferItem({
                        id: 'transfer-c', phase: 'waiting', active: false,
                        modelName: 'Model C', haveBytes: 0, totalBytes: 300,
                    }),
                ],
            },
        }) as never

        const result = await call('local_models_status', {})
        const status = JSON.parse(result.content)

        expect(status.downloading).toMatchObject({ model: 'Model B', percent: 25 })
        expect(status.downloads).toEqual([
            expect.objectContaining({ model: 'Model A', phase: 'paused', active: false }),
            expect.objectContaining({ model: 'Model B', phase: 'running', active: true }),
            expect.objectContaining({ model: 'Model C', phase: 'waiting', active: false }),
        ])
        expect(status.maximumActive).toBe(2)
    })

    /** Space held by attempts nobody is watching, surfaced here too. */
    it('mentions what abandoned attempts are holding', async () => {
        store.state = baseState({
            leftovers: { items: [{ path: '/x.part', bytes: 3 * 1024 ** 3 }], totalBytes: 3 * 1024 ** 3 },
        }) as never

        const result = await call('local_models_status', {})

        expect(JSON.parse(result.content).abandonedDownloads).toEqual({ holding: '3 GB' })
    })
})
