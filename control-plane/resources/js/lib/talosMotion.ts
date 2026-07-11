export const TALOS_MOTION_INTENTS = [
    'surface-enter',
    'surface-exit',
    'window-open',
    'window-minimize',
    'window-restore',
    'window-focus',
    'disclosure',
    'popover',
    'menu',
    'message-insert',
    'activity-progress',
    'error-attention',
    'success-confirm',
    'theme-transition',
] as const

export type TalosMotionIntent = typeof TALOS_MOTION_INTENTS[number]
export type TalosMotionMode = 'subtle' | 'normal' | 'cinematic' | 'off'
export type TalosWindowTransitionState = 'idle' | 'opening' | 'restoring' | 'minimizing' | 'expanding'

export type TalosMotionOptions = {
    themeMotion?: unknown
    motionMode?: unknown
    themeMotionDisabled?: boolean
    backgroundMotionDisabled?: boolean
    uiAnimationProfile?: unknown
    uiMotionDisabled?: boolean
    prefersReducedMotion?: boolean
    osReducedMotion?: boolean
    durationScale?: unknown
}

export type TalosResolvedMotion = {
    mode: TalosMotionMode
    themeMotionDisabled: boolean
    uiAnimationProfile: string
    prefersReducedMotion: boolean
    backgroundMotionEnabled: boolean
    uiMotionEnabled: boolean
    durationScale: number
}

export type TalosMotionIntentResolution = {
    intent: TalosMotionIntent
    enabled: boolean
    duration: number
    exitDuration: number
    properties: string
    easing: string
    transition: string
    animation: string
}

export const TALOS_MOTION_INTENT_DURATIONS: Record<TalosMotionIntent, { duration: number; exitDuration: number }> = {
    'surface-enter': { duration: 167, exitDuration: 83 },
    'surface-exit': { duration: 83, exitDuration: 0 },
    'window-open': { duration: 250, exitDuration: 0 },
    'window-minimize': { duration: 333, exitDuration: 333 },
    'window-restore': { duration: 250, exitDuration: 0 },
    'window-focus': { duration: 83, exitDuration: 83 },
    disclosure: { duration: 167, exitDuration: 83 },
    popover: { duration: 167, exitDuration: 83 },
    menu: { duration: 167, exitDuration: 83 },
    'message-insert': { duration: 167, exitDuration: 0 },
    'activity-progress': { duration: 333, exitDuration: 167 },
    'error-attention': { duration: 250, exitDuration: 0 },
    'success-confirm': { duration: 333, exitDuration: 167 },
    'theme-transition': { duration: 250, exitDuration: 250 },
}

const TALOS_MOTION_DURATION_TOKEN_BY_INTENT: Record<TalosMotionIntent, string> = {
    'surface-enter': '--talos-motion-duration-surface-enter',
    'surface-exit': '--talos-motion-duration-surface-exit',
    'window-open': '--talos-motion-duration-window-open',
    'window-minimize': '--talos-motion-duration-window-minimize',
    'window-restore': '--talos-motion-duration-window-restore',
    'window-focus': '--talos-motion-duration-window-focus',
    disclosure: '--talos-motion-duration-disclosure',
    popover: '--talos-motion-duration-popover',
    menu: '--talos-motion-duration-menu',
    'message-insert': '--talos-motion-duration-message-insert',
    'activity-progress': '--talos-motion-duration-activity-progress',
    'error-attention': '--talos-motion-duration-error-attention',
    'success-confirm': '--talos-motion-duration-success-confirm',
    'theme-transition': '--talos-motion-duration-theme-transition',
}

const MOTION_MODES = new Set<TalosMotionMode | 'system'>(['subtle', 'normal', 'cinematic', 'off', 'system'])

function booleanValue(value: unknown): boolean {
    return value === true
}

function normalizedMode(value: unknown): TalosMotionMode {
    if (value === 'system') {
        return 'normal'
    }

    return typeof value === 'string' && MOTION_MODES.has(value as TalosMotionMode)
        ? value as TalosMotionMode
        : 'normal'
}

function motionOptionValue(options: TalosMotionOptions): unknown {
    return options.themeMotion ?? options.motionMode
}

function normalizedDurationScale(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 100
    }

    return Math.min(150, Math.max(50, Math.round(value)))
}

function scaledMotionMs(duration: number, scale: number): string {
    return `${Math.round(duration * (scale / 100))}ms`
}

export function talosMotionDurationStyle(durationScale: unknown, enabled = true): Record<string, string> {
    const scale = normalizedDurationScale(durationScale)
    const entries = Object.entries(TALOS_MOTION_DURATION_TOKEN_BY_INTENT).map(([intent, token]) => ([
        token,
        enabled ? scaledMotionMs(TALOS_MOTION_INTENT_DURATIONS[intent as TalosMotionIntent].duration, scale) : '0ms',
    ]))

    return {
        '--talos-motion-duration-control': enabled
            ? scaledMotionMs(TALOS_MOTION_INTENT_DURATIONS['window-focus'].duration, scale)
            : '0ms',
        ...Object.fromEntries(entries),
    }
}

export function resolveTalosMotion(options: TalosMotionOptions = {}): TalosResolvedMotion {
    const prefersReducedMotion = booleanValue(options.prefersReducedMotion) || booleanValue(options.osReducedMotion)
    const themeMotionDisabled = booleanValue(options.themeMotionDisabled) || booleanValue(options.backgroundMotionDisabled)
    const uiAnimationProfile = typeof options.uiAnimationProfile === 'string'
        ? options.uiAnimationProfile
        : 'preset'
    const mode = normalizedMode(motionOptionValue(options))
    const durationScale = normalizedDurationScale(options.durationScale)

    return {
        mode,
        themeMotionDisabled,
        uiAnimationProfile,
        prefersReducedMotion,
        backgroundMotionEnabled: !prefersReducedMotion && !themeMotionDisabled && mode !== 'off',
        uiMotionEnabled: !prefersReducedMotion && !booleanValue(options.uiMotionDisabled) && uiAnimationProfile !== 'off',
        durationScale,
    }
}

function isResolvedMotion(value: TalosResolvedMotion | TalosMotionOptions): value is TalosResolvedMotion {
    return 'backgroundMotionEnabled' in value && 'uiMotionEnabled' in value && 'mode' in value
}

export function resolveTalosMotionIntent(
    intent: TalosMotionIntent,
    motion: TalosResolvedMotion | TalosMotionOptions = {},
): TalosMotionIntentResolution {
    const resolved = isResolvedMotion(motion) ? motion : resolveTalosMotion(motion)
    const timing = TALOS_MOTION_INTENT_DURATIONS[intent]
    const enabled = resolved.uiMotionEnabled
    const duration = enabled ? Math.round(timing.duration * (resolved.durationScale / 100)) : 0
    const exitDuration = enabled ? Math.round(timing.exitDuration * (resolved.durationScale / 100)) : 0

    return {
        intent,
        enabled,
        duration,
        exitDuration,
        properties: 'opacity, transform',
        easing: resolved.mode === 'cinematic'
            ? 'cubic-bezier(0.22, 1, 0.36, 1)'
            : resolved.mode === 'subtle'
                ? 'cubic-bezier(0.2, 0.8, 0.2, 1)'
                : 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        transition: enabled
            ? `opacity ${duration}ms ${resolved.mode === 'cinematic' ? 'cubic-bezier(0.22, 1, 0.36, 1)' : 'cubic-bezier(0.2, 0.8, 0.2, 1)'}, transform ${duration}ms ${resolved.mode === 'cinematic' ? 'cubic-bezier(0.22, 1, 0.36, 1)' : 'cubic-bezier(0.2, 0.8, 0.2, 1)'}`
            : 'none',
        animation: enabled ? `talos-${intent}` : 'none',
    }
}

function cssDurationMs(value: string | null | undefined): number | null {
    if (typeof value !== 'string') {
        return null
    }

    const match = value.trim().match(/^(\d+(?:\.\d+)?)(ms|s)$/)
    if (!match) {
        return null
    }

    const amount = Number(match[1])
    return Math.round(match[2] === 's' ? amount * 1000 : amount)
}

const WINDOW_INTENTS: Record<Exclude<TalosWindowTransitionState, 'idle'>, TalosMotionIntent> = {
    opening: 'window-open',
    restoring: 'window-restore',
    minimizing: 'window-minimize',
    expanding: 'window-open',
}

const WINDOW_DURATION_VARIABLES: Record<Exclude<TalosWindowTransitionState, 'idle'>, string> = {
    opening: '--talos-motion-duration-window-open',
    restoring: '--talos-motion-duration-window-restore',
    minimizing: '--talos-motion-duration-window-minimize',
    expanding: '--talos-motion-duration-window-open',
}

export function talosWindowTransitionDurationVariable(state: TalosWindowTransitionState): string | null {
    if (state === 'idle') {
        return null
    }

    return WINDOW_DURATION_VARIABLES[state]
}

export function resolveTalosWindowTransitionDuration(
    state: TalosWindowTransitionState,
    motion: TalosResolvedMotion | TalosMotionOptions,
    computedDuration?: string | null,
): number {
    if (state === 'idle') {
        return 0
    }

    const resolved = isResolvedMotion(motion) ? motion : resolveTalosMotion(motion)
    if (!resolved.uiMotionEnabled) {
        return 0
    }

    return cssDurationMs(computedDuration)
        ?? resolveTalosMotionIntent(WINDOW_INTENTS[state], resolved).duration
}

export function createTalosMotionCompletionScheduler<Key>() {
    const pending = new Map<Key, { timer: ReturnType<typeof setTimeout>; complete: () => void }>()

    function cancel(key: Key) {
        const entry = pending.get(key)
        if (!entry) return
        clearTimeout(entry.timer)
        pending.delete(key)
    }

    function finish(key: Key) {
        const entry = pending.get(key)
        if (!entry) return
        clearTimeout(entry.timer)
        pending.delete(key)
        entry.complete()
    }

    function schedule(key: Key, duration: number, complete: () => void) {
        cancel(key)
        if (duration <= 0) {
            complete()
            return
        }

        const timer = setTimeout(() => {
            pending.delete(key)
            complete()
        }, duration)
        pending.set(key, { timer, complete })
    }

    function finishAll() {
        for (const key of [...pending.keys()]) finish(key)
    }

    function cancelAll() {
        for (const key of [...pending.keys()]) cancel(key)
    }

    return {
        schedule,
        cancel,
        finish,
        finishAll,
        cancelAll,
        pendingCount: () => pending.size,
    }
}

export function createTalosRevisionedCompletionScheduler<Key>() {
    const scheduler = createTalosMotionCompletionScheduler<Key>()
    const revisions = new Map<Key, number>()

    function cancel(key: Key) {
        scheduler.cancel(key)
        revisions.set(key, (revisions.get(key) ?? 0) + 1)
    }

    function begin(key: Key) {
        cancel(key)
        return revisions.get(key) ?? 0
    }

    function isCurrent(key: Key, revision: number) {
        return (revisions.get(key) ?? 0) === revision
    }

    function schedule(key: Key, revision: number, duration: number, complete: () => void) {
        if (!isCurrent(key, revision)) return
        scheduler.schedule(key, duration, () => {
            if (isCurrent(key, revision)) complete()
        })
    }

    function cancelAll() {
        for (const key of revisions.keys()) cancel(key)
    }

    return {
        begin,
        cancel,
        isCurrent,
        schedule,
        finish: scheduler.finish,
        finishAll: scheduler.finishAll,
        cancelAll,
        pendingCount: scheduler.pendingCount,
    }
}
