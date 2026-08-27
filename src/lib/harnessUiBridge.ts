/** Normalized contract exposed by the static Harness UI runtime. */
export interface TalosHarnessSessionSelection {
    id: string
    title: string
}

export interface TalosHarnessUiRuntime {
    selectSession?(selection: TalosHarnessSessionSelection): void
    dismissTransientLayers?(): boolean
    transientLayersActive?(): boolean
    setKeyboardOpen?(open: boolean): void
    submitPrompt?(text: string): boolean
    announceComposerAction?(action: string): boolean
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
    return runtime.dismissTransientLayers()
}

export function talosHarnessUiTransientLayersActive(): boolean {
    return currentTalosHarnessUiRuntime()?.transientLayersActive?.() === true
}

export function setTalosHarnessUiKeyboardOpen(open: boolean): boolean {
    const runtime = currentTalosHarnessUiRuntime()
    if (!runtime?.setKeyboardOpen) return false
    runtime.setKeyboardOpen(open)
    return true
}

export function submitTalosHarnessUiPrompt(text: string): boolean {
    const runtime = currentTalosHarnessUiRuntime()
    if (!runtime?.submitPrompt) return false
    return runtime.submitPrompt(text)
}

export function announceTalosHarnessUiComposerAction(action: string): boolean {
    const runtime = currentTalosHarnessUiRuntime()
    if (!runtime?.announceComposerAction) return false
    return runtime.announceComposerAction(action)
}
