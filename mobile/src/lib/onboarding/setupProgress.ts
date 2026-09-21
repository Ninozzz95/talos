/**
 * First-run setup: the two things TALOS cannot start without.
 *
 * Owner 2026-07-27 replaced the six-slide intro carousel with an essential
 * two-step setup, after the research said plainly what the carousel was doing
 * wrong: NN/g finds deck-of-cards tutorials "make the interface appear more
 * complicated than it actually is", that tutorials do not improve task
 * performance, and that onboarding earns its place only when the app truly
 * needs something before it can work. The unified flow owns the local
 * workspace name, PIN and model in one place.
 *
 * Nothing here is persisted. A step is done when the thing it asks for EXISTS,
 * so resuming is read from reality rather than from a cursor that can go stale
 * and then quietly send someone back through a step they already finished.
 */
export type TalosSetupStepId = 'identity' | 'pin' | 'model' | 'autonomy' | 'permissions'

export interface TalosSetupStepDefinition {
    id: TalosSetupStepId
    /** Named after what the person controls, not after the subsystem it arms. */
    label: string
}

export const TALOS_SETUP_STEPS: readonly TalosSetupStepDefinition[] = Object.freeze([
    { id: 'identity', label: 'Name' },
    { id: 'pin', label: 'PIN' },
    { id: 'model', label: 'Model' },
    /**
     * Che cosa TALOS puo fare da solo.
     *
     * Subito dopo il modello perche parla dei poteri DI QUEL modello: puo
     * leggere la Libreria, salvarci dentro, uscire in rete. I controlli
     * esistono gia in Impostazioni e questa pagina non li duplica — scrive
     * negli stessi tre valori. Quello che mancava era che nessuno li
     * PRESENTASSE mai, quindi l idea di cosa l app fa da sola se la formava per
     * caso.
     */
    { id: 'autonomy', label: 'Autonomy' },
    /**
     * L ultimo, e ultimo per una ragione.
     *
     * La ricerca sui permessi dice di chiedere quando la persona ha capito a
     * che serve, non all avvio. Qui a questo punto ha gia dato un nome allo
     * spazio, un PIN e un modello: sa che cos e TALOS, quindi la frase «le
     * ricerche lunghe muoiono senza questa» vuol dire qualcosa.
     */
    { id: 'permissions', label: 'Background' },
])

export interface TalosSetupState {
    /** A non-empty local workspace name exists. */
    identitySet: boolean
    /** A PIN exists, which on this app means the database key is wrapped by it. */
    pinSet: boolean
    /** Somewhere to think: a provider key on this device, or a local model. */
    modelReady: boolean
    /**
     * La persona ha DECISO cosa TALOS puo fare da solo.
     *
     * Non «e diverso dal predefinito»: il magazzino tiene l elenco delle azioni
     * davvero scelte, separato dai valori, proprio perche un predefinito e una
     * supposizione fatta al posto di qualcuno e una scelta e un opinione.
     * «Chiedimelo sempre» resta una risposta legittima, e va registrata come
     * tale — altrimenti il passo non sarebbe mai fatto per chi sceglie la
     * prudenza.
     */
    autonomyChosen: boolean
    /**
     * Il telefono ha smesso di sospendere TALOS.
     *
     * Letto dal sistema come gli altri tre — nessun passo qui e «fatto» perche
     * qualcuno ha premuto Avanti. Owner 2026-08-03: senza questa esenzione una
     * Deep Research muore tre volte su tre appena si blocca lo schermo.
     */
    backgroundReady: boolean
}

export interface TalosSetupStep extends TalosSetupStepDefinition {
    done: boolean
}

export interface TalosSetupProgress {
    steps: TalosSetupStep[]
    /** The first unfinished step — where the flow opens. */
    startIndex: number
    complete: boolean
}

export function talosSetupProgress(state: TalosSetupState): TalosSetupProgress {
    const done: Record<TalosSetupStepId, boolean> = {
        identity: state.identitySet,
        pin: state.pinSet,
        model: state.modelReady,
        autonomy: state.autonomyChosen,
        permissions: state.backgroundReady,
    }
    const steps = TALOS_SETUP_STEPS.map((step) => ({ ...step, done: done[step.id] }))
    const first = steps.findIndex((step) => !step.done)
    return {
        steps,
        // All done → rest on the last step, which is where the flow ends anyway.
        startIndex: first === -1 ? steps.length - 1 : first,
        complete: first === -1,
    }
}
