/** Normalized contract exposed by the static Harness UI runtime. */
export interface TalosHarnessSessionSelection {
    id: string
    title: string
}

export interface TalosHarnessUiRuntime {
    /**
     * ⛔⛔⛔ 29/8 — BUG REALE trovato sul dispositivo: il tipo dichiarava
     * `void`, ma la funzione vera (public/harness-ui/app.js, non
     * typecheckata da TS in quanto vendorizzata) ritorna `boolean` —
     * `false` quando id/title non sono stringhe valide. Il wrapper sotto
     * ignorava quindi SEMPRE il fallimento vero, riportando successo a
     * `HarnessSessionScreen.vue` anche quando il titolo non era stato
     * aggiornato per niente.
     */
    selectSession?(selection: TalosHarnessSessionSelection): boolean
    dismissTransientLayers?(): boolean
    transientLayersActive?(): boolean
    setKeyboardOpen?(open: boolean): void
    /**
     * ⭐⭐⭐ 28/8, "procedi in ordine" punto 4 — `modello` (opzionale): il
     * profilo OpenRouter scelto nel composer di Codice, inoltrato fino a
     * `POST /api/v1/sessions {messaggio, modello}`. Assente → il server usa
     * il proprio default (comportamento di prima, invariato).
     *
     * ⭐⭐⭐ 2/9 — `modelloEsecutore` (opzionale, terzo argomento): il
     * picker Planner (piano §15.6, K) — un secondo modello, più
     * economico, usato per i giri di routine (6.1, `talosLavora` già lo
     * supporta lato kernel). Assente → il server usa sempre `modello`
     * ("Automatico" nel picker).
     */
    submitPrompt?(text: string, modello?: string, modelloEsecutore?: string): boolean
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
    return runtime.selectSession(selection)
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

export function submitTalosHarnessUiPrompt(text: string, modello?: string, modelloEsecutore?: string): boolean {
    const runtime = currentTalosHarnessUiRuntime()
    if (!runtime?.submitPrompt) return false
    // ⛔ MAI un argomento `undefined` esplicito IN CODA quando manca: stesso
    // principio già in vigore per `modello` — un test può distinguere "N
    // argomenti" da "N+1, l'ultimo assente" via `toHaveBeenCalledWith`. Un
    // `modelloEsecutore` presente forza sempre i tre argomenti (anche con
    // `modello` a `undefined` in mezzo: non è in coda, è innocuo).
    if (modelloEsecutore !== undefined) return runtime.submitPrompt(text, modello, modelloEsecutore)
    return modello !== undefined ? runtime.submitPrompt(text, modello) : runtime.submitPrompt(text)
}

export function announceTalosHarnessUiComposerAction(action: string): boolean {
    const runtime = currentTalosHarnessUiRuntime()
    if (!runtime?.announceComposerAction) return false
    return runtime.announceComposerAction(action)
}
