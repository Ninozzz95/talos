/**
 * Which thinking shape each Anthropic model turned out to want.
 *
 * Owner 2026-07-27 on claude-opus-5: `"thinking.type.enabled" is not supported
 * for this model`. The docs make it worse than a rename — `enabled` with a
 * budget is a 400 on Opus 4.7 and later, and `adaptive` is a 400 on Sonnet 4.5,
 * Opus 4.5, Haiku 4.5 and earlier. There is no shape that works on both.
 *
 * TALOS will be distributed, so shipping the list of which model takes which
 * would be wrong the day a model appears that the APK has never heard of. The
 * adapter asks, reads the provider's own answer out of the 400, and remembers
 * it — one wasted round trip per model per session, and none after that.
 *
 * In memory, deliberately. A remembered answer that outlived an app update, or
 * a model that changed behaviour, would be a stale fact nobody could see or
 * clear; a session is short enough that being wrong costs one retry.
 */
export type TalosThinkingMode = 'enabled' | 'adaptive'

/**
 * What to try first for a model never seen before.
 *
 * Adaptive, because it is where Anthropic is going: every model from 4.6 on
 * takes it, and the ones that do not are the ones being retired. A first guess
 * has to be wrong sometimes; better to be wrong about the past.
 */
export const TALOS_DEFAULT_THINKING_MODE: TalosThinkingMode = 'adaptive'

const learned = new Map<string, TalosThinkingMode>()

export function talosThinkingModeFor(model: string): TalosThinkingMode {
    return learned.get(model) ?? TALOS_DEFAULT_THINKING_MODE
}

export function learnTalosThinkingMode(model: string, mode: TalosThinkingMode): void {
    learned.set(model, mode)
}

/** For tests, and for anything that needs to forget on purpose. */
export function forgetTalosThinkingModes(): void {
    learned.clear()
}
