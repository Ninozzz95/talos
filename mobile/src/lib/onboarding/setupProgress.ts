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
export type TalosSetupStepId = 'identity' | 'pin' | 'model'

export interface TalosSetupStepDefinition {
    id: TalosSetupStepId
    /** Named after what the person controls, not after the subsystem it arms. */
    label: string
}

export const TALOS_SETUP_STEPS: readonly TalosSetupStepDefinition[] = Object.freeze([
    { id: 'identity', label: 'Name' },
    { id: 'pin', label: 'PIN' },
    { id: 'model', label: 'Model' },
])

export interface TalosSetupState {
    /** A non-empty local workspace name exists. */
    identitySet: boolean
    /** A PIN exists, which on this app means the database key is wrapped by it. */
    pinSet: boolean
    /** Somewhere to think: a provider key on this device, or a local model. */
    modelReady: boolean
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
