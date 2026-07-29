export type TalosDictationLanguageMode = 'system' | 'en' | 'it'

export type TalosDictationErrorCode =
    | 'permissionDenied'
    | 'unavailable'
    | 'recognitionFailed'
    | 'startFailed'
    | 'startTimeout'
    | 'noSpeech'
    | 'stoppedResponding'

export function parseTalosDictationLanguageMode(value: unknown): TalosDictationLanguageMode {
    return value === 'en' || value === 'it' ? value : 'system'
}

/**
 * The maintained plugin uses an omitted language for the device default.
 * Explicit choices stay allowlisted BCP 47 tags rather than accepting
 * arbitrary persisted values at the native bridge.
 */
export function resolveTalosDictationLanguageTag(
    mode: TalosDictationLanguageMode,
): string | undefined {
    if (mode === 'en') return 'en-US'
    if (mode === 'it') return 'it-IT'
    return undefined
}
