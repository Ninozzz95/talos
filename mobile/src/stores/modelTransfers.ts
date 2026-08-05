import { reactive, readonly } from 'vue'
import {
    talosCancelModelTransfer,
    talosModelTransferStatus,
    talosPauseModelTransfer,
    talosResumeModelTransfer,
    talosStartModelTransfer,
    type TalosTransferItem,
    type TalosTransferPhase,
    type TalosTransferRunner,
    type TalosTransferStatus,
} from '@/services/modelTransfer'

export interface TalosModelTransferState {
    items: TalosTransferItem[]
    phase: TalosTransferPhase
    active: boolean
    /** Compatibility view used by existing Model Lab/tool surfaces. */
    paused: boolean
    repo: string | null
    revision: string | null
    paths: readonly string[]
    modelName: string | null
    haveBytes: number
    totalBytes: number
    runner: TalosTransferRunner | null
    networkBound: boolean
    failure: string | null
    resumable: boolean
    readFailure: string | null
}

const state = reactive<TalosModelTransferState>({
    items: [],
    phase: 'idle',
    active: false,
    paused: false,
    repo: null,
    revision: null,
    paths: [],
    modelName: null,
    haveBytes: 0,
    totalBytes: 0,
    runner: null,
    networkBound: true,
    failure: null,
    resumable: false,
    readFailure: null,
})

export const talosModelTransfers = readonly(state)

let observers = 0
let poller: ReturnType<typeof setInterval> | null = null
let refreshing: Promise<void> | null = null

export function talosRefreshModelTransfer(): Promise<void> {
    if (refreshing) return refreshing
    refreshing = (async () => {
        const status = await talosModelTransferStatus()
        if (status.readFailure) {
            state.readFailure = status.readFailure
            return
        }
        applyStatus(status)
    })().finally(() => { refreshing = null })
    return refreshing
}

/** One ref-counted poller shared by all five chrome surfaces. */
export function talosRetainModelTransferObserver(): () => void {
    observers += 1
    if (observers === 1) {
        void talosRefreshModelTransfer()
        poller = setInterval(() => { void talosRefreshModelTransfer() }, 1_000)
    }
    let released = false
    return () => {
        if (released) return
        released = true
        observers = Math.max(0, observers - 1)
        if (observers === 0 && poller !== null) {
            clearInterval(poller)
            poller = null
        }
    }
}

type StartRequest = Parameters<typeof talosStartModelTransfer>[0]
type ManagedResult = { ok: true } | { ok: false; reason: string }

function rememberFailure(result: ManagedResult): ManagedResult {
    if (!result.ok) state.failure = result.reason
    return result
}

export async function talosBeginModelTransfer(request: StartRequest): Promise<ManagedResult> {
    const started = await talosStartModelTransfer(request)
    if (!started.ok) return rememberFailure(started)
    const totalBytes = request.files.reduce((sum, file) => sum + file.bytes, 0)
    const item: TalosTransferItem = {
        id: started.started.id,
        jobId: null,
        createdAtMs: Date.now(),
        phase: started.started.phase,
        active: moving(started.started.phase),
        repo: request.repo,
        revision: request.revision ?? 'main',
        paths: request.files.map((file) => file.path),
        modelName: request.modelName ?? request.files[0]?.path ?? null,
        haveBytes: 0,
        totalBytes,
        runner: started.started.runner,
        networkBound: started.started.networkBound,
        failure: null,
        resumable: true,
    }
    const at = state.items.findIndex((existing) => existing.id === item.id)
    if (at >= 0) state.items.splice(at, 1, item)
    else state.items.push(item)
    projectItems()
    await talosRefreshModelTransfer()
    return { ok: true }
}

export async function talosPauseManagedModelTransfer(id?: string): Promise<ManagedResult> {
    const result = rememberFailure(await talosPauseModelTransfer(id))
    if (result.ok) {
        updateItem(id, (item) => ({ ...item, phase: 'pausing', active: true }))
        await talosRefreshModelTransfer()
    }
    return result
}

export async function talosResumeManagedModelTransfer(id?: string): Promise<ManagedResult> {
    const resumed = await talosResumeModelTransfer(id)
    if (!resumed.ok) return rememberFailure(resumed)
    updateItem(id ?? resumed.started.id, (item) => ({
        ...item,
        phase: resumed.started.phase,
        active: moving(resumed.started.phase),
        runner: resumed.started.runner,
        networkBound: resumed.started.networkBound,
        failure: null,
        resumable: true,
    }))
    await talosRefreshModelTransfer()
    return { ok: true }
}

export async function talosCancelManagedModelTransfer(id?: string): Promise<ManagedResult> {
    const result = rememberFailure(await talosCancelModelTransfer(id))
    if (result.ok) {
        if (id) {
            const at = state.items.findIndex((item) => item.id === id)
            if (at >= 0) state.items.splice(at, 1)
            projectItems()
        }
        await talosRefreshModelTransfer()
    }
    return result
}

function applyStatus(status: TalosTransferStatus): void {
    const rows = Array.isArray(status.items)
        ? status.items
        : legacyItems(status)
    state.items = rows.map((item) => ({ ...item, paths: [...item.paths] }))
    state.phase = status.phase
    state.active = status.active
    state.paused = status.phase === 'paused'
    state.repo = status.repo
    state.revision = status.revision
    state.paths = [...status.paths]
    state.modelName = status.modelName
    state.haveBytes = status.haveBytes
    state.totalBytes = status.totalBytes
    state.runner = status.runner
    state.networkBound = status.networkBound
    state.failure = status.failure
    state.resumable = status.resumable
    state.readFailure = null
}

function legacyItems(status: TalosTransferStatus): TalosTransferItem[] {
    if (status.phase === 'idle') return []
    return [{
        id: 'legacy',
        jobId: null,
        createdAtMs: null,
        phase: status.phase,
        active: status.active,
        repo: status.repo,
        revision: status.revision,
        paths: [...status.paths],
        modelName: status.modelName,
        haveBytes: status.haveBytes,
        totalBytes: status.totalBytes,
        runner: status.runner,
        networkBound: status.networkBound,
        failure: status.failure,
        resumable: status.resumable,
    }]
}

function updateItem(
    requestedId: string | undefined,
    update: (item: TalosTransferItem) => TalosTransferItem,
): void {
    const id = requestedId ?? (state.items.length === 1 ? state.items[0]?.id : undefined)
    if (!id) return
    const at = state.items.findIndex((item) => item.id === id)
    if (at < 0) return
    state.items.splice(at, 1, update(state.items[at]!))
    projectItems()
}

function projectItems(): void {
    const first = state.items[0]
    if (!first) {
        Object.assign(state, {
            phase: 'idle' as const,
            active: false,
            paused: false,
            repo: null,
            revision: null,
            paths: [],
            modelName: null,
            haveBytes: 0,
            totalBytes: 0,
            runner: null,
            networkBound: true,
            failure: null,
            resumable: false,
        })
        return
    }
    Object.assign(state, {
        phase: first.phase,
        active: state.items.some((item) => item.active),
        paused: first.phase === 'paused',
        repo: first.repo,
        revision: first.revision,
        paths: [...first.paths],
        modelName: first.modelName,
        haveBytes: first.haveBytes,
        totalBytes: first.totalBytes,
        runner: first.runner,
        networkBound: first.networkBound,
        failure: first.failure,
        resumable: state.items.some((item) => item.resumable),
        readFailure: null,
    })
}

function moving(phase: TalosTransferPhase): boolean {
    return phase === 'queued'
        || phase === 'running'
        || phase === 'pausing'
        || phase === 'verifying'
}
