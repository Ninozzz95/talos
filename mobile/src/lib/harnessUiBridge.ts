/** Normalized contract exposed by the static Harness UI runtime. */
export interface TalosHarnessSessionSelection {
    id: string
    title: string
}

export interface TalosHarnessUiRuntime {
    selectSession?(selection: TalosHarnessSessionSelection): void
    dismissTransientLayers?(): void
    setKeyboardOpen?(open: boolean): void
}

export function currentTalosHarnessUiRuntime(): TalosHarnessUiRuntime | null {
    if (typeof window === 'undefined') return null
    return (window as unknown as { __talosHarnessUiRuntime?: TalosHarnessUiRuntime })
        .__talosHarnessUiRuntime ?? null
}

export function selectTalosHarnessUiSession(selection: TalosHarnessSessionSelection): boolean {
    const runtime = currentTalosHarnessUiRuntime()
    if (!runtime?.selectSession) return false
    runtime.selectSession(selection)
    return true
}

export function dismissTalosHarnessUiTransientLayers(): boolean {
    const runtime = currentTalosHarnessUiRuntime()
    if (!runtime?.dismissTransientLayers) return false
    runtime.dismissTransientLayers()
    return true
}

export function setTalosHarnessUiKeyboardOpen(open: boolean): boolean {
    const runtime = currentTalosHarnessUiRuntime()
    if (!runtime?.setKeyboardOpen) return false
    runtime.setKeyboardOpen(open)
    return true
}
