import { reactive, readonly } from 'vue'
import {
    talosCreateHuggingFaceClient,
    type TalosHuggingFaceClient,
    type TalosHuggingFaceFailure,
    type TalosHuggingFaceModel,
} from '@/lib/models/huggingFace'
import { talosGroupGgufFiles, type TalosGgufSet } from '@/lib/models/ggufSet'
import { TALOS_GGUF_FIRST_READ_BYTES, talosReadGgufHeader } from '@/lib/models/gguf'
import { talosModelFit, type TalosModelFit } from '@/lib/models/fit'
import { talosMeasureDevice, type TalosMeasuredDevice } from '@/services/deviceCapacity'
import { clearProviderKey, getProviderKey, setProviderKey } from '@/services/secureKeyStore'
import {
    talosModelTransferLeftovers,
    talosModelTransferStatus,
    talosStartModelTransfer,
    talosStopModelTransfer,
    type TalosTransferRunner,
} from '@/services/modelTransfer'

/**
 * The download centre, as state.
 *
 * Everything underneath it has been built and proved separately — the Hub
 * client, the header reader, the fit arithmetic, the device probe, the native
 * transfer. This is where they become one answer to a question no other app in
 * this category asks: not "here are some files", but "this one runs on YOUR
 * phone, at this speed, and here is what it will cost you".
 *
 * The refusals matter more than the offers. A set missing a shard, a header
 * that cannot be read, a file the repository publishes no hash for, a model
 * that will not fit — each is stated with its reason rather than hidden behind
 * a disabled button, because a reason is something a person can act on.
 */

/** A sane starting point on a phone; the counter-offer moves it. */
export const TALOS_DEFAULT_LOCAL_CONTEXT = 4096

/**
 * The Hugging Face token sits with the provider keys, in the same Keystore.
 *
 * The same namespace on purpose: it IS a provider credential, and a second
 * secret store beside a working one is two things to audit and two to get
 * wrong. The native download job reads this exact entry.
 */
export const TALOS_HUGGING_FACE_PROVIDER = 'huggingface'

export type TalosSetExamination =
    | { state: 'unread' }
    | { state: 'reading' }
    | { state: 'read'; fit: TalosModelFit; quantisation: string | null; trainedContext: number }
    /** Named, never silent: an unreadable header is a model we will not vouch for. */
    | { state: 'unreadable'; reason: string }

export interface TalosLocalModelSet extends TalosGgufSet {
    examination: TalosSetExamination
}

export interface TalosLocalModelsState {
    query: string
    searching: boolean
    results: TalosHuggingFaceModel[]
    searchFailure: string | null
    repo: { id: string; revision: string; sets: TalosLocalModelSet[]; loading: boolean } | null
    device: TalosMeasuredDevice | null
    context: number
    /** Whether one exists — never the token itself, which stays in the Keystore. */
    hasToken: boolean
    transfer: {
        active: boolean
        modelName: string | null
        haveBytes: number
        totalBytes: number
        runner: TalosTransferRunner | null
        networkBound: boolean
        failure: string | null
    }
    leftovers: { items: Array<{ path: string; bytes: number }>; totalBytes: number }
}

const state = reactive<TalosLocalModelsState>({
    query: '',
    searching: false,
    results: [],
    searchFailure: null,
    repo: null,
    device: null,
    context: TALOS_DEFAULT_LOCAL_CONTEXT,
    hasToken: false,
    transfer: {
        active: false,
        modelName: null,
        haveBytes: 0,
        totalBytes: 0,
        runner: null,
        networkBound: true,
        failure: null,
    },
    leftovers: { items: [], totalBytes: 0 },
})

export const talosLocalModels = readonly(state)

let client: TalosHuggingFaceClient | null = null
let transportInUse: typeof globalThis.fetch | null = null

/**
 * @param transport injected so the whole store is provable without a network.
 *     The default is the WebView's own `fetch`, which reaches the Hub directly:
 *     it reflects any origin, so no proxy of ours ever sees a user's traffic.
 */
export function talosInitLocalModels(
    transport: typeof globalThis.fetch = globalThis.fetch,
    token?: string,
): void {
    transportInUse = transport
    client = talosCreateHuggingFaceClient(token ? { fetch: transport, token } : { fetch: transport })
}

function requireClient(): TalosHuggingFaceClient {
    if (client === null) talosInitLocalModels()
    return client!
}

/**
 * A Hugging Face token, in the same Keystore the provider keys live in.
 *
 * Worth having even for someone who only wants open models: anonymous Hub
 * limits are per IP ADDRESS, and a mobile carrier puts thousands of subscribers
 * behind one, so without a token a user gets throttled for traffic that was
 * never theirs. It also unlocks repositories whose licence they have accepted.
 *
 * The value never reaches this store's state — only whether one exists. The
 * native download job reads it straight from the Keystore for the length of a
 * single request; it is never put in the job's extras, which Android persists
 * in the clear.
 */
export async function talosRefreshHuggingFaceToken(): Promise<void> {
    const token = await getProviderKey(TALOS_HUGGING_FACE_PROVIDER).catch(() => null)
    state.hasToken = token !== null
    talosInitLocalModels(transportInUse ?? globalThis.fetch, token ?? undefined)
}

export async function talosSetHuggingFaceToken(token: string): Promise<void> {
    await setProviderKey(TALOS_HUGGING_FACE_PROVIDER, token)
    await talosRefreshHuggingFaceToken()
}

export async function talosForgetHuggingFaceToken(): Promise<void> {
    await clearProviderKey(TALOS_HUGGING_FACE_PROVIDER)
    await talosRefreshHuggingFaceToken()
}

function describe(failure: unknown): string {
    const known = failure as Partial<TalosHuggingFaceFailure>
    if (typeof known?.kind === 'string') {
        if (known.kind === 'rate-limited' && known.retryAfterSeconds) {
            return `rate-limited:${known.retryAfterSeconds}`
        }
        return known.kind
    }
    return 'transport'
}

/**
 * Measure the phone.
 *
 * Called again whenever the screen is opened rather than once at start: free
 * memory, free storage and heat all move, and a fit answer computed an hour ago
 * is a fit answer about a different phone.
 */
export async function talosRefreshDeviceCapacity(): Promise<void> {
    state.device = await talosMeasureDevice()
}

export async function talosSearchLocalModels(query: string): Promise<void> {
    state.query = query
    state.searchFailure = null
    if (query.trim() === '') {
        state.results = []
        return
    }
    state.searching = true
    try {
        state.results = await requireClient().searchModels(query.trim())
    } catch (failure) {
        state.results = []
        state.searchFailure = describe(failure)
    } finally {
        state.searching = false
    }
}

/**
 * Open a repository and turn it into the models it actually holds.
 *
 * Two requests, not one per file: the tree lists the GGUFs and a single
 * paths-info call returns every size and sha256 at once. Doing it per file is
 * how an app with a hundred-file repository walks into the rate limiter that
 * anonymous users share with everyone else behind their carrier's address.
 */
export async function talosOpenModelRepo(id: string, revision = 'main'): Promise<void> {
    state.repo = { id, revision, sets: [], loading: true }
    try {
        const paths = await requireClient().listGgufFiles(id, revision)
        if (paths.length === 0) {
            state.repo = { id, revision, sets: [], loading: false }
            return
        }
        const files = await requireClient().pathsInfo(id, revision, paths)
        state.repo = {
            id,
            revision,
            sets: talosGroupGgufFiles(files).map((set) => ({ ...set, examination: { state: 'unread' } })),
            loading: false,
        }
    } catch (failure) {
        state.repo = { id, revision, sets: [], loading: false }
        state.searchFailure = describe(failure)
    }
}

/** Back to the results. Not `open('')`, which would ask the Hub for nothing. */
export function talosCloseModelRepo(): void {
    state.repo = null
}

/**
 * Read the model's own header and answer the only question that matters.
 *
 * About a megabyte over a Range request, spent before four gigabytes are
 * committed to. The file name is a hint written by whoever uploaded it; the
 * header is the model.
 */
export async function talosExamineSet(key: string): Promise<void> {
    const repo = state.repo
    const device = state.device
    if (!repo) return
    // Identified rather than handed in. Everything this store exposes is
    // `readonly`, so a caller passing a set back would be passing a frozen
    // proxy and every write here would vanish without a sound.
    const set = repo.sets.find((candidate) => candidate.paths[0] === key)
    if (!set) return
    if (!device) {
        set.examination = { state: 'unreadable', reason: 'no-device-measurement' }
        return
    }
    if (set.incomplete) {
        set.examination = { state: 'unreadable', reason: 'incomplete-set' }
        return
    }

    set.examination = { state: 'reading' }
    try {
        const head = await requireClient().readHead(
            repo.id, repo.revision, set.paths[0]!, TALOS_GGUF_FIRST_READ_BYTES)
        const parsed = talosReadGgufHeader(head, set.totalBytes)
        if (!parsed.ok) {
            set.examination = { state: 'unreadable', reason: parsed.reason }
            return
        }
        set.examination = {
            state: 'read',
            fit: talosModelFit({
                model: parsed.header.shape,
                device,
                context: state.context,
                fileBytes: set.totalBytes,
            }),
            // The header's own word, which outranks the file name it came with.
            quantisation: parsed.header.quantisation ?? set.quantisation,
            trainedContext: parsed.header.shape.trainedContext,
        }
    } catch (failure) {
        set.examination = { state: 'unreadable', reason: describe(failure) }
    }
}

/** Re-answer every examined set at a new context length, without re-reading. */
export function talosSetLocalContext(context: number): void {
    state.context = context
}

export type TalosDownloadRefusal =
    | 'incomplete-set'
    | 'no-transfer'
    | 'already-running'
    | 'unsupported'
    | string

/**
 * Start, or refuse with a reason.
 *
 * A model that will not fit is NOT refused here. The fit card has already said
 * so in the user's own terms, and someone who reads "will crawl at 2 tokens a
 * second" and wants it anyway is entitled to it — this is their phone. What is
 * refused is what cannot work at all: a set the repository is missing pieces of.
 */
export async function talosDownloadSet(
    key: string,
    modelName?: string,
): Promise<{ ok: true } | { ok: false; reason: TalosDownloadRefusal }> {
    const repo = state.repo
    if (!repo) return { ok: false, reason: 'no-transfer' }
    const set = repo.sets.find((candidate) => candidate.paths[0] === key)
    if (!set) return { ok: false, reason: 'no-transfer' }
    if (set.incomplete) return { ok: false, reason: 'incomplete-set' }
    if (state.transfer.active) return { ok: false, reason: 'already-running' }

    const started = await talosStartModelTransfer({
        repo: repo.id,
        revision: repo.revision,
        path: set.paths[0]!,
        modelName: modelName ?? `${repo.id.split('/').pop()} ${set.label}`,
        totalBytes: set.totalBytes,
        // Null is honest and the screen says so: this repository publishes no
        // hash for this file, so it is the one download we cannot prove.
        sha256: set.sha256[0] ?? null,
    })

    if (!started.ok) {
        state.transfer.failure = started.reason
        return { ok: false, reason: started.reason }
    }

    state.transfer.failure = null
    state.transfer.runner = started.started.runner
    state.transfer.networkBound = started.started.networkBound
    await talosRefreshTransfer()
    return { ok: true }
}

export async function talosStopLocalDownload(): Promise<void> {
    await talosStopModelTransfer()
    await talosRefreshTransfer()
}

export async function talosRefreshTransfer(): Promise<void> {
    const status = await talosModelTransferStatus()
    state.transfer.active = status.active
    state.transfer.modelName = status.modelName
    state.transfer.haveBytes = status.haveBytes
    state.transfer.totalBytes = status.totalBytes
}

/**
 * What abandoned attempts are costing.
 *
 * The space is claimed before the first byte, so an attempt abandoned after ten
 * seconds still holds the whole file. Every app in this category leaves those
 * behind invisibly; naming them is what lets someone get the space back.
 */
export async function talosRefreshLeftovers(): Promise<void> {
    state.leftovers = await talosModelTransferLeftovers()
}
