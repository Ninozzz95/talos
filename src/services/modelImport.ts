import { registerPlugin } from '@capacitor/core'

/**
 * A model the person already has, handed to TALOS.
 *
 * Owner 2026-08-03: «nessuna possibilità di usare modelli caricati direttamente
 * dalla memoria, NON VA BENE». For an app that is local-first and distributed
 * outside the Play Store this is the equivalent of «open a file» — its absence
 * means a phone can hold a model TALOS refuses to see.
 *
 * The file is COPIED into the same root the downloader writes to. llama.cpp
 * memory-maps the weights and needs a real path; the picker returns a
 * `content://` URI that has none. The cost is the disk space twice for a few
 * minutes; the gain is that an imported model is not a second class of model —
 * it appears in the installed list, in the fit calculations and in the chat
 * picker with no further plumbing.
 */
interface TalosModelImportPlugin {
    pick(): Promise<{ imported: boolean, path?: string, name?: string, bytes?: number }>
    addListener(
        event: 'progress',
        handler: (payload: { copied: number, total: number }) => void,
    ): Promise<{ remove(): Promise<void> }>
}

const plugin = registerPlugin<TalosModelImportPlugin>('TalosModelImport')

export interface TalosModelImportResult {
    readonly imported: boolean
    readonly path?: string
    readonly name?: string
    readonly bytes?: number
}

export async function talosPickModelFromDevice(): Promise<TalosModelImportResult> {
    return plugin.pick()
}

/** Progress while the copy runs. Returns an unsubscribe. */
export function talosOnModelImportProgress(
    handler: (copied: number, total: number) => void,
): () => void {
    let stop: (() => void) | null = null
    let dropped = false
    void plugin.addListener('progress', ({ copied, total }) => handler(copied, total))
        .then((handle) => {
            if (dropped) { void handle.remove(); return }
            stop = () => { void handle.remove() }
        })
        .catch(() => undefined)
    return () => {
        dropped = true
        stop?.()
    }
}

/**
 * The refusals, each with something the person can do about it.
 *
 * «Non è stato possibile importare il file» is the message this replaces, and
 * it leaves somebody holding a 3 GB file with no idea whether to free space,
 * pick a different file, or give up.
 */
export function talosModelImportFailure(code: string): string {
    if (code.includes('NOT_GGUF')) return 'localModels.importNotGguf'
    if (code.includes('NO_SPACE')) return 'localModels.importNoSpace'
    if (code.includes('ALREADY_HERE')) return 'localModels.importAlreadyHere'
    if (code.includes('UNREADABLE')) return 'localModels.importUnreadable'
    if (code.includes('NO_FOLDER')) return 'localModels.importNoFolder'
    return 'localModels.importFailed'
}
