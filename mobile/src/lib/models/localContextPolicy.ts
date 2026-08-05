/** Context shared by Model Lab fit verdicts and the real local chat runtime. */
export const TALOS_LOCAL_DEFAULT_CONTEXT_TOKENS = 4096

/** The single smaller context TALOS may try after a native context failure. */
export const TALOS_LOCAL_FALLBACK_CONTEXT_TOKENS = 2048

/** Largest context TALOS may allocate automatically on a phone or tablet. */
export const TALOS_LOCAL_MAX_CONTEXT_TOKENS = 8192

/**
 * Ordered attempts for one open operation.
 *
 * An explicit small request is never raised. An explicit large request remains
 * the first attempt; only the bounded phone-safe fallback can follow it.
 */
export function talosLocalContextCandidates(requested?: number): number[] {
    const first = Number.isInteger(requested) && Number(requested) > 0
        ? Number(requested)
        : TALOS_LOCAL_DEFAULT_CONTEXT_TOKENS
    return first > TALOS_LOCAL_FALLBACK_CONTEXT_TOKENS
        ? [first, TALOS_LOCAL_FALLBACK_CONTEXT_TOKENS]
        : [first]
}

/** Retrying any other stage repeats deterministic failure and wastes memory. */
export function talosShouldRetryLocalOpen(stage: string): boolean {
    return stage === 'context'
}

/**
 * The exact bounded context required by a prompt and its requested reply.
 *
 * Returns the current context when it already fits, the next power of two when
 * one bounded escalation can fit it, and null instead of truncating when the
 * mobile ceiling would be exceeded.
 */
export function talosLocalEscalatedContextTokens(
    currentContextTokens: number,
    promptTokens: number,
    completionTokens: number,
): number | null {
    if (![currentContextTokens, promptTokens, completionTokens].every(Number.isFinite)) return null
    const current = Math.max(0, Math.trunc(currentContextTokens))
    const prompt = Math.max(0, Math.trunc(promptTokens))
    const completion = Math.max(0, Math.trunc(completionTokens))
    const required = prompt + completion + 1
    if (!Number.isSafeInteger(required)) return null
    if (required <= current) return current

    let candidate = 1
    while (candidate < required && candidate <= TALOS_LOCAL_MAX_CONTEXT_TOKENS) {
        candidate *= 2
    }
    return candidate <= TALOS_LOCAL_MAX_CONTEXT_TOKENS ? candidate : null
}
