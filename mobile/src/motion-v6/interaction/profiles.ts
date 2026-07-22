import { TALOS_MOTION_SCENE_IDS, type TalosMotionSceneId } from '../contracts'
import { TALOS_INTERACTION_INTENTS, type TalosInteractionIntent } from './intents'
import {
    createDefaultInteractionProfile,
    type TalosInteractionPose,
    type TalosInteractionProfile,
    type TalosInteractionSpec,
} from './resolver'

type ProfileTuning = Readonly<{
    duration: number
    x: number
    y: number
    scale: number
    rotate: number
    stagger: number
    easing: string
}>

const TUNING: Readonly<Record<TalosMotionSceneId, ProfileTuning>> = Object.freeze({
    forge: { duration: 1, x: 1, y: 0.9, scale: 1, rotate: 0.7, stagger: 0.8, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    paper: { duration: 0.82, x: 0.35, y: 0.55, scale: 0.45, rotate: 0.15, stagger: 0.55, easing: 'cubic-bezier(0.25, 0.75, 0.25, 1)' },
    terminal: { duration: 0.72, x: 0.8, y: 0.25, scale: 0.25, rotate: 0, stagger: 0.35, easing: 'linear' },
    aurora: { duration: 1.18, x: 1.15, y: 1.25, scale: 0.85, rotate: 1.25, stagger: 1.15, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    glacier: { duration: 1.06, x: 0.5, y: 0.7, scale: 0.55, rotate: 0.2, stagger: 0.65, easing: 'cubic-bezier(0.18, 0.82, 0.22, 1)' },
    // F1 calm refactor: quietest interaction profile — micro travel, no rotation.
    calm: { duration: 0.92, x: 0.4, y: 0.5, scale: 0.45, rotate: 0, stagger: 0.6, easing: 'cubic-bezier(0.22, 0.8, 0.24, 1)' },
    ember: { duration: 0.88, x: 1.25, y: 1, scale: 1.1, rotate: 1.4, stagger: 0.5, easing: 'cubic-bezier(0.3, 0.9, 0.25, 1)' },
    atlas: { duration: 1.12, x: 1.35, y: 0.8, scale: 0.7, rotate: 0.55, stagger: 1.05, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
    noir: { duration: 0.94, x: 0.7, y: 0.45, scale: 0.8, rotate: 0.1, stagger: 0.25, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
    signal: { duration: 0.78, x: 1.5, y: 0.35, scale: 0.35, rotate: 0.3, stagger: 1.35, easing: 'cubic-bezier(0.1, 0.7, 0.2, 1)' },
    violet: { duration: 1.22, x: 1.1, y: 1.1, scale: 1.2, rotate: 1.05, stagger: 1.25, easing: 'cubic-bezier(0.34, 1.15, 0.64, 1)' },
    claudius: { duration: 1.28, x: 0.4, y: 0.65, scale: 0.5, rotate: 0.35, stagger: 0.95, easing: 'cubic-bezier(0.2, 0.7, 0.25, 1)' },
    basicus: { duration: 0.98, x: 0.9, y: 0.9, scale: 0.75, rotate: 0.5, stagger: 0.75, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    telemetry: { duration: 0.9, x: 0.85, y: 0.7, scale: 0.6, rotate: 0.3, stagger: 0.7, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
})

function tunePose(pose: TalosInteractionPose, tuning: ProfileTuning): TalosInteractionPose {
    return Object.freeze({
        x: pose.x * tuning.x,
        y: pose.y * tuning.y,
        scale: 1 + ((pose.scale - 1) * tuning.scale),
        rotate: pose.rotate * tuning.rotate,
        opacity: pose.opacity,
    })
}

const WINDOW_DURATION_FLOORS: Readonly<Partial<Record<TalosInteractionIntent, number>>> = Object.freeze({
    'window-open': 320,
    'window-close': 240,
    'window-minimize': 380,
    'window-restore': 320,
})

const MINIMUM_PROFILE_DURATION_FACTOR = Math.min(...Object.values(TUNING).map((tuning) => tuning.duration))
const WINDOW_BASELINE_DURATIONS: Readonly<Partial<Record<TalosInteractionIntent, number>>> = Object.freeze(
    Object.fromEntries(Object.entries(WINDOW_DURATION_FLOORS).map(([intent, floor]) => [
        intent,
        Math.ceil(floor / MINIMUM_PROFILE_DURATION_FACTOR),
    ])),
)

function tuneSpec(intent: TalosInteractionIntent, spec: TalosInteractionSpec, tuning: ProfileTuning): TalosInteractionSpec {
    const baselineDuration = WINDOW_BASELINE_DURATIONS[intent] ?? 50
    return Object.freeze({
        durationMs: Math.round(Math.max(spec.durationMs, baselineDuration) * tuning.duration),
        easing: tuning.easing,
        staggerFactor: Number((spec.staggerFactor * tuning.stagger).toFixed(3)),
        from: tunePose(spec.from, tuning),
        to: tunePose(spec.to, tuning),
    })
}

function profileFor(id: TalosMotionSceneId): TalosInteractionProfile {
    const base = createDefaultInteractionProfile()
    const tuning = TUNING[id]
    const specs = Object.fromEntries(TALOS_INTERACTION_INTENTS.map((intent) => [
        intent,
        tuneSpec(intent, base.specs[intent], tuning),
    ])) as Record<TalosInteractionIntent, TalosInteractionSpec>
    return Object.freeze({ id, specs: Object.freeze(specs) })
}

export const TALOS_INTERACTION_PROFILES_V6 = Object.freeze(TALOS_MOTION_SCENE_IDS.map(profileFor))

export function getTalosInteractionProfileV6(value: unknown): TalosInteractionProfile | null {
    if (typeof value !== 'string' || !(TALOS_MOTION_SCENE_IDS as readonly string[]).includes(value)) return null
    return TALOS_INTERACTION_PROFILES_V6.find((profile) => profile.id === value) ?? null
}
