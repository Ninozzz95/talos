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

export type TalosVoiceReadingSource = 'chat' | 'assistant' | 'manual' | 'preview' | 'instrumentation'

/** Immutable snapshot captured before the first word of one logical reading. */
export interface VoiceReadingRoute {
    readingId: string
    engine: TalosSpeechEngine
    personalProfileId: string | null
    locale: string
    source: TalosVoiceReadingSource
    voiceUri: string | null
    systemRate: number
    systemPitch: number
    personalRate: number
    personalPitch: number
}

/** Fase 8 (multi-style voice) names these; only `'neutral'` has a producer today — a header can declare another and this type still parses it, but nothing in this app writes one yet. */
export type TalosPersonalVoiceStyle = 'neutral' | 'warm' | 'calm' | 'energetic'

export function isTalosPersonalVoiceStyle(value: unknown): value is TalosPersonalVoiceStyle {
    return value === 'neutral' || value === 'warm' || value === 'calm' || value === 'energetic'
}

/** One saved voice profile, summarized for a list; conditioning and quality data never cross the bridge. */
export interface TalosPersonalVoiceProfileSummary {
    id: string
    name: string
    language: string
    style: TalosPersonalVoiceStyle
    /** `TalosVoiceProfileCompatibility`'s codec fingerprint, truncated for display - never compared as a string in TS, the native side already owns that comparison. */
    engineBuild: string
    /** Result of the same native production router used by synthesis. */
    compatible: boolean
    resolvedBackend?: 'pocket-v2' | 'moss-tts-nano'
    fallbackReason?: string
    incompatibilityReason?: string
    createdAtEpochMs: number
    enrollmentDurationMs: number
}

/** What the settings screen and the router both need to know before offering `'personal'` at all. */
export interface TalosPersonalVoiceStatus {
    /** Whether this build contains the Pocket runtime; installation is reported separately. */
    supported: boolean
    /** True only after every pinned Pocket file was hash-verified. */
    installed: boolean
    /** `installed` AND at least one compatible saved profile exists. */
    ready: boolean
    active: boolean
    failure?: string
    engineBuild?: string
    backend?: 'pocket-v2'
    modelState?: 'ready' | 'missing' | 'corrupt' | 'unverified'
    verifiedFiles?: number
    cacheHit?: boolean
    verificationDurationMs?: number
}

export interface TalosPersonalSpeakRequest {
    text: string
    profileId: string
    /** Stable across all sentence jobs belonging to one logical response. */
    readingId: string
    /** Unique completion key for this queued sentence; omitted by legacy single-utterance callers. */
    utteranceId?: string
    rate: number
    pitch: number
    queue?: 'flush' | 'add'
    /** Present only for an armed diagnostic production route. */
    traceId?: string
    source?: TalosVoiceReadingSource
    locale?: string
}
