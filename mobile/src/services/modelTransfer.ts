import { Capacitor, registerPlugin } from '@capacitor/core'

type NativeTransferItem = {
    id?: unknown
    jobId?: unknown
    createdAtMs?: unknown
    active?: unknown
    phase?: unknown
    repo?: unknown
    revision?: unknown
    path?: unknown
    paths?: unknown
    modelName?: unknown
    haveBytes?: unknown
    totalBytes?: unknown
    runner?: unknown
    networkBound?: unknown
    failure?: unknown
    resumable?: unknown
}

interface TalosModelTransferPlugin {
    start(options: {
        repo: string
        revision: string
        files: Array<{ path: string; bytes: number; sha256: string | null }>
        modelName: string
    }): Promise<{
        id?: string
        phase?: string
        runner: string
        networkBound: boolean
    }>
    pause?(options?: { id: string }): Promise<void>
    resume?(options?: { id: string }): Promise<{
        id?: string
        phase?: string
        runner: string
        networkBound: boolean
    }>
    cancel?(options?: { id: string }): Promise<void>
    /** Compatibility with APKs built before the typed pause API. */
    stop(options?: { id: string }): Promise<void>
    status(): Promise<NativeTransferItem & { items?: unknown }>
    leftovers(): Promise<{
        items: Array<{ path: string; bytes: number }>
        totalBytes: number
        unreadable?: Array<{ path: string; reason: string }>
    }>
    discard(options: { path: string }): Promise<void>
}

const plugin = registerPlugin<TalosModelTransferPlugin>('TalosModelTransfer')

export type TalosTransferRunner = 'USER_INITIATED_JOB' | 'FOREGROUND_SERVICE' | 'DEFERRED_JOB'
export type TalosTransferPhase =
    | 'idle'
    | 'waiting'
    | 'queued'
    | 'running'
    | 'pausing'
    | 'paused'
    | 'verifying'
    | 'failed'

export interface TalosTransferStart {
    id: string
    phase: Exclude<TalosTransferPhase, 'idle'>
    runner: TalosTransferRunner
    /** False on the foreground-service fallback, which may follow mobile data. */
    networkBound: boolean
}

export interface TalosTransferItem {
    id: string
    jobId: number | null
    createdAtMs: number | null
    phase: Exclude<TalosTransferPhase, 'idle'>
    active: boolean
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
}

/** Collection plus the first-record projection kept for existing callers. */
export interface TalosTransferStatus {
    items: TalosTransferItem[]
    phase: TalosTransferPhase
    active: boolean
    repo: string | null
    revision: string | null
    paths: string[]
    modelName: string | null
    haveBytes: number
    totalBytes: number
    runner: TalosTransferRunner | null
    networkBound: boolean
    failure: string | null
    resumable: boolean
    /** A status read failed; every other field remains the last known snapshot. */
    readFailure: string | null
}

export interface TalosTransferLeftovers {
    items: Array<{ path: string; bytes: number }>
    totalBytes: number
}

export function talosTransfersAreSupported(): boolean {
    return Capacitor.isPluginAvailable('TalosModelTransfer')
}

function actionFailure(refused: unknown): { ok: false; reason: string } {
    return { ok: false, reason: refused instanceof Error ? refused.message : 'refused' }
}

export async function talosStartModelTransfer(request: {
    repo: string
    revision?: string
    files: ReadonlyArray<{ path: string; bytes: number; sha256: string | null }>
    modelName?: string
}): Promise<{ ok: true; started: TalosTransferStart } | { ok: false; reason: string }> {
    if (!talosTransfersAreSupported()) return { ok: false, reason: 'unsupported' }
    if (request.files.length === 0) return { ok: false, reason: 'no-files' }
    try {
        const started = await plugin.start({
            repo: request.repo,
            revision: request.revision ?? 'main',
            files: request.files.map((file) => ({ ...file })),
            modelName: request.modelName ?? request.files[0]!.path,
        })
        return { ok: true, started: normalizeStart(started) }
    } catch (refused) {
        return actionFailure(refused)
    }
}

export async function talosPauseModelTransfer(
    id?: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (!talosTransfersAreSupported()) return { ok: false, reason: 'unsupported' }
    try {
        if (plugin.pause) {
            if (id) await plugin.pause({ id })
            else await plugin.pause()
        } else if (id) await plugin.stop({ id })
        else await plugin.stop()
        return { ok: true }
    } catch (refused) {
        return actionFailure(refused)
    }
}

export async function talosResumeModelTransfer(
    id?: string,
): Promise<{ ok: true; started: TalosTransferStart } | { ok: false; reason: string }> {
    if (!talosTransfersAreSupported()) return { ok: false, reason: 'unsupported' }
    if (!plugin.resume) return { ok: false, reason: 'unsupported' }
    try {
        const started = id ? await plugin.resume({ id }) : await plugin.resume()
        return { ok: true, started: normalizeStart(started, id) }
    } catch (refused) {
        return actionFailure(refused)
    }
}

export async function talosCancelModelTransfer(
    id?: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (!talosTransfersAreSupported()) return { ok: false, reason: 'unsupported' }
    if (!plugin.cancel) return { ok: false, reason: 'unsupported' }
    try {
        if (id) await plugin.cancel({ id })
        else await plugin.cancel()
        return { ok: true }
    } catch (refused) {
        return actionFailure(refused)
    }
}

/** Compatibility alias: old callers named pause "stop". */
export async function talosStopModelTransfer(id?: string): Promise<void> {
    await talosPauseModelTransfer(id)
}

const TRANSFER_PHASES = new Set<TalosTransferPhase>([
    'idle', 'waiting', 'queued', 'running', 'pausing', 'paused', 'verifying', 'failed',
])
const MOVING_PHASES = new Set<TalosTransferPhase>([
    'queued', 'running', 'pausing', 'verifying',
])
const RUNNERS = new Set<TalosTransferRunner>([
    'USER_INITIATED_JOB', 'FOREGROUND_SERVICE', 'DEFERRED_JOB',
])

function idleStatus(): TalosTransferStatus {
    return {
        items: [],
        phase: 'idle',
        active: false,
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
    }
}

let lastKnownStatus = idleStatus()

export async function talosModelTransferStatus(): Promise<TalosTransferStatus> {
    if (!talosTransfersAreSupported()) {
        lastKnownStatus = idleStatus()
        return cloneStatus(lastKnownStatus)
    }
    try {
        const native = await plugin.status()
        const rows = Array.isArray(native.items) ? native.items : [native]
        const items = rows
            .map((row, index) => normalizeItem(row, index))
            .filter((row): row is TalosTransferItem => row !== null)
        lastKnownStatus = project(items, null)
        return cloneStatus(lastKnownStatus)
    } catch (failed) {
        return cloneStatus({
            ...lastKnownStatus,
            readFailure: failed instanceof Error ? failed.message : 'status-unavailable',
        })
    }
}

export async function talosModelTransferLeftovers(): Promise<TalosTransferLeftovers> {
    if (!talosTransfersAreSupported()) return { items: [], totalBytes: 0 }
    try {
        return await plugin.leftovers()
    } catch {
        return { items: [], totalBytes: 0 }
    }
}

export async function talosDiscardModelTransfer(path: string): Promise<boolean> {
    if (!talosTransfersAreSupported()) return false
    try {
        await plugin.discard({ path })
        return true
    } catch {
        return false
    }
}

function normalizeStart(
    raw: { id?: string; phase?: string; runner: string; networkBound: boolean },
    fallbackId?: string,
): TalosTransferStart {
    const candidate = phaseOf(raw.phase, 'queued')
    return {
        id: nonEmpty(raw.id) ?? fallbackId ?? 'legacy',
        phase: candidate === 'idle' ? 'queued' : candidate,
        runner: runnerOf(raw.runner),
        networkBound: raw.networkBound ?? true,
    }
}

function normalizeItem(raw: unknown, index: number): TalosTransferItem | null {
    if (!raw || typeof raw !== 'object') return null
    const row = raw as NativeTransferItem
    const phase = phaseOf(row.phase, row.active === true ? 'running' : 'idle')
    if (phase === 'idle') return null
    const paths = Array.isArray(row.paths)
        ? row.paths.filter((path): path is string => typeof path === 'string')
        : (typeof row.path === 'string' ? [row.path] : [])
    const runner = typeof row.runner === 'string' && RUNNERS.has(row.runner as TalosTransferRunner)
        ? row.runner as TalosTransferRunner
        : null
    return {
        id: nonEmpty(row.id) ?? (index === 0 ? 'legacy' : `legacy-${index}`),
        jobId: positiveInteger(row.jobId),
        createdAtMs: positiveNumber(row.createdAtMs),
        phase,
        active: typeof row.active === 'boolean' ? row.active : MOVING_PHASES.has(phase),
        repo: nonEmpty(row.repo),
        revision: nonEmpty(row.revision),
        paths,
        modelName: nonEmpty(row.modelName),
        haveBytes: nonNegative(row.haveBytes),
        totalBytes: nonNegative(row.totalBytes),
        runner,
        networkBound: typeof row.networkBound === 'boolean' ? row.networkBound : true,
        failure: typeof row.failure === 'string' ? row.failure : null,
        resumable: typeof row.resumable === 'boolean' ? row.resumable : true,
    }
}

function project(items: TalosTransferItem[], readFailure: string | null): TalosTransferStatus {
    const first = items[0]
    if (!first) return { ...idleStatus(), readFailure }
    return {
        items: items.map(cloneItem),
        phase: first.phase,
        active: items.some((item) => item.active),
        repo: first.repo,
        revision: first.revision,
        paths: [...first.paths],
        modelName: first.modelName,
        haveBytes: first.haveBytes,
        totalBytes: first.totalBytes,
        runner: first.runner,
        networkBound: first.networkBound,
        failure: first.failure,
        resumable: items.some((item) => item.resumable),
        readFailure,
    }
}

function cloneItem(item: TalosTransferItem): TalosTransferItem {
    return { ...item, paths: [...item.paths] }
}

function cloneStatus(status: TalosTransferStatus): TalosTransferStatus {
    return {
        ...status,
        paths: [...status.paths],
        items: status.items.map(cloneItem),
    }
}

function phaseOf(value: unknown, fallback: TalosTransferPhase): TalosTransferPhase {
    return typeof value === 'string' && TRANSFER_PHASES.has(value as TalosTransferPhase)
        ? value as TalosTransferPhase
        : fallback
}

function runnerOf(value: string): TalosTransferRunner {
    return RUNNERS.has(value as TalosTransferRunner)
        ? value as TalosTransferRunner
        : 'DEFERRED_JOB'
}

function nonEmpty(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null
}

function nonNegative(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
}

function positiveNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function positiveInteger(value: unknown): number | null {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}
