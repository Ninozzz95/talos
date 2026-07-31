import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * The JavaScript half of downloading a model: it asks, and it watches.
 *
 * It cannot do the work. Android suspends a backgrounded WebView, so a transfer
 * driven from `fetch` stops the moment the user leaves the app — which is most
 * of the hours four gigabytes take. Everything past this file runs natively and
 * writes its state to disk, which is also why the app can be killed outright
 * and still resume.
 *
 * Nothing here throws at a caller for being on a platform without the plugin. A
 * web build reports "unsupported" and the download centre says so, rather than
 * offering a button that fails when pressed.
 */
interface TalosModelTransferPlugin {
    start(options: {
        repo: string
        revision: string
        path: string
        modelName: string
        totalBytes: number
        sha256: string | null
    }): Promise<{ runner: string; networkBound: boolean }>
    stop(): Promise<void>
    status(): Promise<{
        active: boolean
        repo?: string
        path?: string
        modelName?: string
        haveBytes: number
        totalBytes: number
    }>
    leftovers(): Promise<{ items: Array<{ path: string; bytes: number }>; totalBytes: number }>
    discard(options: { path: string }): Promise<void>
}

const plugin = registerPlugin<TalosModelTransferPlugin>('TalosModelTransfer')

/** How the transfer is being carried, which the user is entitled to know. */
export type TalosTransferRunner = 'USER_INITIATED_JOB' | 'FOREGROUND_SERVICE' | 'DEFERRED_JOB'

export interface TalosTransferStart {
    runner: TalosTransferRunner
    /**
     * False below Android 14: the transfer is not tied to the network it began
     * on and can follow the phone onto mobile data.
     *
     * Surfaced rather than buried. Someone starting a 4 GB download on a train
     * has a right to know it may finish on their data allowance, and finding
     * that out from a bill is not a design.
     */
    networkBound: boolean
}

export interface TalosTransferStatus {
    active: boolean
    modelName: string | null
    haveBytes: number
    totalBytes: number
}

export interface TalosTransferLeftovers {
    items: Array<{ path: string; bytes: number }>
    totalBytes: number
}

export function talosTransfersAreSupported(): boolean {
    return Capacitor.isNativePlatform()
}

/**
 * Begin, or explain.
 *
 * `sha256` is the Hub's `lfs.oid` and is what makes this download different
 * from every competitor's: the finished file is proved, not assumed. Passing
 * null is allowed for repositories that do not publish one, and the download
 * centre must say plainly that such a file cannot be verified.
 */
export async function talosStartModelTransfer(request: {
    repo: string
    revision?: string
    path: string
    modelName?: string
    totalBytes: number
    sha256: string | null
}): Promise<{ ok: true; started: TalosTransferStart } | { ok: false; reason: string }> {
    if (!talosTransfersAreSupported()) return { ok: false, reason: 'unsupported' }
    try {
        const started = await plugin.start({
            repo: request.repo,
            revision: request.revision ?? 'main',
            path: request.path,
            modelName: request.modelName ?? request.path,
            totalBytes: request.totalBytes,
            sha256: request.sha256,
        })
        return {
            ok: true,
            started: {
                runner: started.runner as TalosTransferRunner,
                networkBound: started.networkBound,
            },
        }
    } catch (refused) {
        return { ok: false, reason: refused instanceof Error ? refused.message : 'refused' }
    }
}

/** Pause. The bytes and the hash state stay on disk and the transfer resumes. */
export async function talosStopModelTransfer(): Promise<void> {
    if (!talosTransfersAreSupported()) return
    await plugin.stop().catch(() => undefined)
}

export async function talosModelTransferStatus(): Promise<TalosTransferStatus> {
    const idle: TalosTransferStatus = {
        active: false,
        modelName: null,
        haveBytes: 0,
        totalBytes: 0,
    }
    if (!talosTransfersAreSupported()) return idle
    try {
        const status = await plugin.status()
        return {
            active: status.active,
            modelName: status.modelName ?? null,
            haveBytes: status.haveBytes,
            totalBytes: status.totalBytes,
        }
    } catch {
        return idle
    }
}

/**
 * What abandoned attempts are costing the phone.
 *
 * Space is claimed before the first byte, so an attempt abandoned after ten
 * seconds still holds the whole four gigabytes. Without this the user watches
 * free space vanish with nothing to point at — which is precisely what happens
 * in the apps this one is measured against.
 */
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
