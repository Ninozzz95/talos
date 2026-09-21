import type { TalosInterfaceMotionPreferences } from '../contracts'
import {
    TALOS_INTERACTION_INTENTS,
    TALOS_INTERACTION_INTENT_CATEGORIES,
    type TalosInteractionCategory,
    type TalosInteractionIntent,
} from './intents'

export type TalosInteractionPose = Readonly<{
    x: number
    y: number
    scale: number
    rotate: number
    opacity: number
}>

export type TalosInteractionSpec = Readonly<{
    durationMs: number
    easing: string
    staggerFactor: number
    from: TalosInteractionPose
    to: TalosInteractionPose
}>

export type TalosInteractionProfile = Readonly<{
    id: string
    specs: Readonly<Record<TalosInteractionIntent, TalosInteractionSpec>>
}>

export type TalosInteractionKeyframe = Readonly<{
    transform: string
    opacity: number
}>

export type TalosInteractionMotionReason = 'active' | 'interface_off' | 'reduced_motion' | 'category_off' | 'invalid_profile'

export type TalosInteractionMotionPlan = Readonly<{
    intent: TalosInteractionIntent
    category: TalosInteractionCategory
    enabled: boolean
    reason: TalosInteractionMotionReason
    durationMs: number
    delayMs: number
    easing: string
    properties: readonly ['transform', 'opacity']
    keyframes: readonly TalosInteractionKeyframe[]
    finalStyle: TalosInteractionKeyframe
    /**
     * The entry offset on its own, in px, already scaled by intensity.
     *
     * On the PLAN and not inside a keyframe, deliberately: a keyframe carries
     * only `transform` and `opacity`, and there is a test standing over that
     * rule because those two are what the compositor can animate on its own.
     * This is a measurement about the plan, not a property to animate.
     *
     * It exists because `transform` is a finished string, which is fine right
     * up until something needs to point the movement the other way — a tab
     * reached by going BACK should arrive from the left, and CSS cannot negate
     * one component of a composed transform.
     */
    enterX: number
}>

export type TalosInteractionMotionRequest = Readonly<{
    intent: TalosInteractionIntent
    profile: TalosInteractionProfile
    interfaceEnabled: boolean
    reducedMotion: boolean
    preferences: TalosInterfaceMotionPreferences
}>

const pose = (x = 0, y = 0, scale = 1, rotate = 0, opacity = 1): TalosInteractionPose => Object.freeze({ x, y, scale, rotate, opacity })
const visible = pose()
const hidden = (x: number, y: number, scale = 1, rotate = 0): TalosInteractionPose => pose(x, y, scale, rotate, 0)

const DEFAULT_SPECS: Readonly<Record<TalosInteractionIntent, TalosInteractionSpec>> = Object.freeze({
    'window-open': spec(320, pose(-18, 0, 0.98, 0, 0), visible),
    'window-close': spec(240, visible, hidden(-12, 0, 0.98)),
    'window-minimize': spec(380, visible, hidden(0, 80, 0.6)),
    'window-restore': spec(320, hidden(0, 80, 0.6), visible),
    'window-focus': spec(100, pose(0, 0, 1.01, 0, 0.92), visible),
    'sidebar-open': spec(220, pose(-20, 0, 1, 0, 0), visible),
    'sidebar-close': spec(180, visible, hidden(-20, 0)),
    'disclosure-open': spec(160, pose(0, -4, 0.99, 0, 0), visible),
    'disclosure-close': spec(120, visible, hidden(0, -4, 0.99)),
    // Owner 2026-08-02, on the device: "non c'è un'animazione, c'è solo uno
    // scatto di un frame". Measured on a OnePlus 13 it was 69ms and 1.04px —
    // because this was tuned like a hover (150ms, 4px) while a window gets 18px
    // and a sidebar 20. A tab change replaces the whole panel; it is a view
    // swap, and the numbers now say so. At the owner's own 50%/65% preferences
    // that lands at ~110ms and ~10px, which is a slide rather than a flicker.
    'tab-change': spec(240, pose(40, 0, 1, 0, 0), visible),
    'menu-open': spec(150, pose(0, -6, 0.98, 0, 0), visible),
    'menu-close': spec(110, visible, hidden(0, -4, 0.98)),
    'popover-open': spec(170, pose(0, -8, 0.98, 0, 0), visible),
    'popover-close': spec(120, visible, hidden(0, -6, 0.98)),
    'dropdown-open': spec(150, pose(0, -6, 0.99, 0, 0), visible),
    'dropdown-close': spec(110, visible, hidden(0, -4, 0.99)),
    'composer-expand': spec(180, pose(0, 8, 0.99, 0, 0.7), visible),
    'composer-collapse': spec(150, pose(0, -4, 0.99, 0, 0.82), visible),
    'message-insert': spec(160, pose(0, 12, 1, 0, 0), visible, 1),
    activity: spec(240, pose(0, 0, 0.99, 0, 0.65), visible),
    success: spec(220, pose(0, 0, 0.98, 0, 0.7), visible),
    warning: spec(220, pose(4, 0, 1, 0, 0.75), visible),
    error: spec(240, pose(6, 0, 1, 0.5, 0.8), visible),
    'theme-transition': spec(250, pose(0, 0, 1, 0, 0.72), visible),
})

const CUSTOM_EASINGS = Object.freeze({
    precise: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    soft: 'cubic-bezier(0.22, 1, 0.36, 1)',
    'elastic-light': 'cubic-bezier(0.34, 1.25, 0.64, 1)',
    linear: 'linear',
    cinematic: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const)

const CUSTOM_EXIT_EASINGS = Object.freeze({
    precise: 'cubic-bezier(0.4, 0, 1, 1)',
    soft: 'cubic-bezier(0.32, 0, 0.67, 0)',
    'elastic-light': 'cubic-bezier(0.55, 0, 1, 0.45)',
    linear: 'linear',
    cinematic: 'cubic-bezier(0.5, 0, 0.9, 0.3)',
} as const)

const EXIT_INTENTS: ReadonlySet<TalosInteractionIntent> = new Set([
    'window-close',
    'window-minimize',
    'sidebar-close',
    'disclosure-close',
    'menu-close',
    'popover-close',
    'dropdown-close',
    'composer-collapse',
])

const INTERFACE_PROFILE_TUNING = Object.freeze({
    preset: Object.freeze({ duration: 1, intensity: 1, stagger: 1, customEasing: false }),
    minimal: Object.freeze({ duration: 0.82, intensity: 0.55, stagger: 0.5, customEasing: true }),
    expressive: Object.freeze({ duration: 1.2, intensity: 1.2, stagger: 1.25, customEasing: true }),
    custom: Object.freeze({ duration: 1, intensity: 1, stagger: 1, customEasing: true }),
})

function spec(durationMs: number, from: TalosInteractionPose, to: TalosInteractionPose, staggerFactor = 0): TalosInteractionSpec {
    return Object.freeze({ durationMs, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', staggerFactor, from, to })
}

function finite(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

function validPose(value: unknown): value is TalosInteractionPose {
    if (typeof value !== 'object' || value === null) return false
    try {
        const keys = Reflect.ownKeys(value)
        if (keys.length !== 5 || keys.some((key) => typeof key !== 'string' || !['x', 'y', 'scale', 'rotate', 'opacity'].includes(key))) return false
        return finite((value as TalosInteractionPose).x)
            && finite((value as TalosInteractionPose).y)
            && finite((value as TalosInteractionPose).scale)
            && (value as TalosInteractionPose).scale > 0
            && finite((value as TalosInteractionPose).rotate)
            && finite((value as TalosInteractionPose).opacity)
            && (value as TalosInteractionPose).opacity >= 0
            && (value as TalosInteractionPose).opacity <= 1
    } catch {
        return false
    }
}

function validSpec(value: unknown): value is TalosInteractionSpec {
    if (typeof value !== 'object' || value === null) return false
    try {
        const specValue = value as TalosInteractionSpec
        return Number.isSafeInteger(specValue.durationMs) && specValue.durationMs >= 0 && specValue.durationMs <= 2_000
            && typeof specValue.easing === 'string' && specValue.easing.length > 0 && specValue.easing.length <= 128
            && !/[;{}]|url\s*\(|javascript:/i.test(specValue.easing)
            && finite(specValue.staggerFactor) && specValue.staggerFactor >= 0 && specValue.staggerFactor <= 4
            && validPose(specValue.from) && validPose(specValue.to)
    } catch {
        return false
    }
}

function validProfile(profile: unknown): profile is TalosInteractionProfile {
    if (typeof profile !== 'object' || profile === null) return false
    try {
        if (typeof (profile as TalosInteractionProfile).id !== 'string' || !(profile as TalosInteractionProfile).id) return false
        const specs = (profile as TalosInteractionProfile).specs
        if (typeof specs !== 'object' || specs === null) return false
        const keys = Reflect.ownKeys(specs)
        return keys.length === TALOS_INTERACTION_INTENTS.length
            && keys.every((key) => typeof key === 'string' && (TALOS_INTERACTION_INTENTS as readonly string[]).includes(key))
            && TALOS_INTERACTION_INTENTS.every((intent) => validSpec(specs[intent]))
    } catch {
        return false
    }
}

function scaledNumber(value: number): string {
    const rounded = Number(value.toFixed(3))
    return Object.is(rounded, -0) ? '0' : String(rounded)
}

function scalePose(value: TalosInteractionPose, intensity: number): TalosInteractionPose {
    const factor = intensity / 100
    return Object.freeze({
        x: value.x * factor,
        y: value.y * factor,
        scale: 1 + ((value.scale - 1) * factor),
        rotate: value.rotate * factor,
        opacity: 1 + ((value.opacity - 1) * factor),
    })
}

function keyframe(value: TalosInteractionPose): TalosInteractionKeyframe {
    return Object.freeze({
        transform: `translate3d(${scaledNumber(value.x)}px, ${scaledNumber(value.y)}px, 0) scale(${scaledNumber(value.scale)}) rotate(${scaledNumber(value.rotate)}deg)`,
        opacity: Number(value.opacity.toFixed(4)),
    })
}

function immediatePlan(intent: TalosInteractionIntent, reason: Exclude<TalosInteractionMotionReason, 'active'>): TalosInteractionMotionPlan {
    const finalStyle = keyframe(visible)
    return Object.freeze({
        intent,
        category: TALOS_INTERACTION_INTENT_CATEGORIES[intent],
        enabled: false,
        reason,
        durationMs: 0,
        delayMs: 0,
        easing: 'linear',
        properties: Object.freeze(['transform', 'opacity'] as const),
        keyframes: Object.freeze([finalStyle]),
        finalStyle,
        enterX: 0,
    })
}

export function createDefaultInteractionProfile(): TalosInteractionProfile {
    return Object.freeze({ id: 'talos-default-v6', specs: DEFAULT_SPECS })
}

export function resolveTalosInteractionMotion(request: TalosInteractionMotionRequest): TalosInteractionMotionPlan {
    const intent = request.intent
    if (!(TALOS_INTERACTION_INTENTS as readonly unknown[]).includes(intent) || !validProfile(request.profile)) return immediatePlan(intent, 'invalid_profile')
    if (request.reducedMotion) return immediatePlan(intent, 'reduced_motion')
    if (!request.interfaceEnabled || request.preferences.profile === 'off') return immediatePlan(intent, 'interface_off')
    const category = TALOS_INTERACTION_INTENT_CATEGORIES[intent]
    if (request.preferences.categories[category] !== true) return immediatePlan(intent, 'category_off')

    const selected = request.profile.specs[intent]
    const tuning = INTERFACE_PROFILE_TUNING[request.preferences.profile]
        ?? INTERFACE_PROFILE_TUNING.preset
    const intensity = Math.min(100, Math.max(0, request.preferences.intensity * tuning.intensity))
    const fromPose = scalePose(selected.from, intensity)
    const from = keyframe(fromPose)
    const to = keyframe(scalePose(selected.to, intensity))
    const keyframes = Object.freeze([from, to])
    return Object.freeze({
        intent,
        category,
        enabled: true,
        reason: 'active',
        durationMs: Math.round(selected.durationMs * (request.preferences.duration_scale / 100) * tuning.duration),
        delayMs: Math.round(request.preferences.stagger * selected.staggerFactor * tuning.stagger),
        easing: EXIT_INTENTS.has(intent)
            ? tuning.customEasing
                ? CUSTOM_EXIT_EASINGS[request.preferences.easing]
                : CUSTOM_EXIT_EASINGS.precise
            : tuning.customEasing
                ? CUSTOM_EASINGS[request.preferences.easing]
                : selected.easing,
        properties: Object.freeze(['transform', 'opacity'] as const),
        keyframes,
        finalStyle: to,
        enterX: Number(scaledNumber(fromPose.x)),
    })
}
