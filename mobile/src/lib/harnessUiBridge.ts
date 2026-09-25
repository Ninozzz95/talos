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
    /**
     * ⭐ 24/09/2026 (AUT-2) — il modello scelto nel composer del Codice, anche prima di un invio: il Codice incorporato lo
     * conosceva solo a `submitPrompt`, e una Automazione creata prima di scrivere sarebbe partita col modello
     * predefinito del server invece di quello scelto qui.
     */
    impostaModello?(modello: string, nome?: string): boolean
    /**
     * ⭐ RAG-COD (24/09/2026): il livello di ragionamento del composer del Codice, nel vocabolario di OpenRouter
     * (`none`…`max`); `null` = nessun `reasoning`. Con `sincronizzaSessione` lo prende anche la sessione aperta.
     */
    impostaEffort?(effort: string | null, sincronizzaSessione?: boolean): boolean
}

/**
 * ⭐ RAG-COD (24/09/2026, owner «collegarla»): la barra dell'impegno del composer del Codice arrivava solo al
 * miglioramento del prompt. `effort` è il livello già regolato sul modello (`clampMobileEffortFor`); «off» diventa
 * `none`, il nome dell'API; `null` (modello senza livelli) lascia il predefinito del server.
 */
export function setTalosHarnessUiEffort(effort: string | null, sincronizzaSessione: boolean): boolean {
    const runtime = currentTalosHarnessUiRuntime()
    if (!runtime?.impostaEffort) return false
    return runtime.impostaEffort(effort === 'off' ? 'none' : effort, sincronizzaSessione)
}

/**
 * ⭐ AUT-2: porta nel Codice incorporato il modello scelto nel composer. `false` se il runtime non c'è ancora.
 * NOME-MODELLO-01 (25/09/2026): col nome del profilo, che il server del Codice sul telefono non saprebbe dire.
 */
export function setTalosHarnessUiModel(modello: string | null, nome?: string | null): boolean {
    if (!modello) return false
    const runtime = currentTalosHarnessUiRuntime()
    if (!runtime?.impostaModello) return false
    return runtime.impostaModello(modello, nome ?? undefined)
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
