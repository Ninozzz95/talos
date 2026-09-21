export type TalosBrowserHmiMode = 'read_only' | 'confirm_sensitive' | 'confirm_every_interaction'

export type TalosBrowserHmiPolicyState = {
    user_mode: TalosBrowserHmiMode
    workspace_minimum_mode: TalosBrowserHmiMode | null
    effective_mode: TalosBrowserHmiMode
    preference_constrained: boolean
}

export const TALOS_BROWSER_HMI_MODES: TalosBrowserHmiMode[] = [
    'confirm_sensitive',
    'confirm_every_interaction',
    'read_only',
]

export function normalizeTalosBrowserHmiMode(value: unknown): TalosBrowserHmiMode {
    return typeof value === 'string' && TALOS_BROWSER_HMI_MODES.includes(value as TalosBrowserHmiMode)
        ? value as TalosBrowserHmiMode
        : 'confirm_sensitive'
}

export function talosBrowserHmiModeLabel(mode: TalosBrowserHmiMode) {
    return mode === 'read_only'
        ? 'Read only'
        : mode === 'confirm_every_interaction'
            ? 'Confirm every interaction'
            : 'Confirm sensitive actions'
}

export function talosBrowserHmiStrictness(mode: TalosBrowserHmiMode | null) {
    return mode === 'read_only' ? 3 : mode === 'confirm_every_interaction' ? 2 : mode === 'confirm_sensitive' ? 1 : 0
}
