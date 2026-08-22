/**
 * Blueprint §40 ("suggested first production-facing TypeScript patch"), kept
 * to its shape almost verbatim — this is the boundary between the settings
 * store / router (TS) and the native voice engine (Kotlin, `ai.talos.voice`,
 * Fase 1-3 of this same blueprint, already closed and device-verified). The
 * contract intentionally carries no PCM/tensors — those never cross the
 * Capacitor bridge, by the same rule Fase 2's `TalosVoiceHost` already
 * enforces natively (`0 PCM via JS`, blueprint §39 Phase 2) — confirmed
 * against Capacitor's own plugin-authoring guidance too: keep the bridge
 * JSON-serializable, one interface, matched 1:1 to the native `@CapacitorPlugin`
 * method set.
 */

/** `'system'` is Android `TextToSpeech` (unchanged, `TalosSpeechPlugin`). `'personal'` is the neural engine built in `ai.talos.voice`. */
export type TalosSpeechEngine = 'system' | 'personal'

/** Fase 8 (multi-style voice) names these; only `'neutral'` has a producer today — a header can declare another and this type still parses it, but nothing in this app writes one yet. */
export type TalosPersonalVoiceStyle = 'neutral' | 'warm' | 'calm' | 'energetic'

export function isTalosPersonalVoiceStyle(value: unknown): value is TalosPersonalVoiceStyle {
    return value === 'neutral' || value === 'warm' || value === 'calm' || value === 'energetic'
}

/** One saved `TalosVoiceProfileV1`, summarized for a list - no audio codes, no quality metrics: those stay native, read only when actually needed (rename/delete/compat-check). */
export interface TalosPersonalVoiceProfileSummary {
    id: string
    name: string
    language: string
    style: TalosPersonalVoiceStyle
    /** `TalosVoiceProfileCompatibility`'s codec fingerprint, truncated for display - never compared as a string in TS, the native side already owns that comparison. */
    engineBuild: string
    /** `TalosVoiceProfileCompatibility.isCompatible()`, read fresh from the native side - never cached across app updates. */
    compatible: boolean
    createdAtEpochMs: number
    enrollmentDurationMs: number
}

/** What the settings screen and the router both need to know before offering `'personal'` at all. */
export interface TalosPersonalVoiceStatus {
    /** False on non-arm64-v8a or when the model files are not present (`TalosVoiceModelManager.isPresent`) - the router must fall back silently, not surface an error for a device that was never going to have this. */
    supported: boolean
    /** True once the manifest/tokenizer/codec have opened successfully at least once this process. */
    installed: boolean
    /** `installed` AND at least one compatible saved profile exists. */
    ready: boolean
    active: boolean
    failure?: string
    engineBuild?: string
}

export interface TalosPersonalSpeakRequest {
    text: string
    profileId: string
    /** Ties a completion event back to one reading - the same discipline `useTalosSpeech.ts` already keeps for the system engine (`ha-finito-e-una-domanda-al-motore`: `onDone` is per reading, not per app). */
    readingId: string
    rate: number
    pitch: number
    queue?: 'flush' | 'add'
}
