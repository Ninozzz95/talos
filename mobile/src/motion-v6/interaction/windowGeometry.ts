import type {
    TalosInteractionKeyframe,
    TalosInteractionMotionPlan,
} from './resolver'

export type TalosWindowMotionRect = Readonly<{
    left: number
    top: number
    width: number
    height: number
}>

export type TalosWindowMotionPoint = Readonly<{
    x: number
    y: number
}>

type PointPlanOptions = Readonly<{
    direction: 'enter' | 'exit'
    target: TalosWindowMotionRect
    point: TalosWindowMotionPoint
}>

type FlipPlanOptions = Readonly<{
    before: TalosWindowMotionRect
    after: TalosWindowMotionRect
}>

function finite(value: number, fallback = 0): number {
    return Number.isFinite(value) ? value : fallback
}

function rounded(value: number, precision = 0): string {
    const factor = 10 ** precision
    const result = Math.round(finite(value) * factor) / factor
    return String(Object.is(result, -0) ? 0 : result)
}

function frozenFrame(transform: string, opacity: number): TalosInteractionKeyframe {
    return Object.freeze({ transform, opacity })
}

function planWithFrames(
    base: TalosInteractionMotionPlan,
    frames: readonly TalosInteractionKeyframe[],
): TalosInteractionMotionPlan {
    const keyframes = Object.freeze([...frames])
    return Object.freeze({
        ...base,
        keyframes,
        finalStyle: keyframes[keyframes.length - 1],
    })
}

function exitScale(intent: TalosInteractionMotionPlan['intent']): number {
    return intent === 'window-minimize' ? 0.55 : 0.94
}

export function createTalosWindowPointPlan(
    base: TalosInteractionMotionPlan,
    options: PointPlanOptions,
): TalosInteractionMotionPlan {
    if (!base.enabled || base.durationMs <= 0) return base

    const dx = finite(options.point.x - options.target.left)
    const dy = finite(options.point.y - options.target.top)
    if (options.direction === 'enter') {
        const source = base.keyframes[0]
        return planWithFrames(base, [
            frozenFrame(
                `translate3d(${rounded(dx)}px, ${rounded(dy)}px, 0) scale(0.86) ${source.transform}`,
                0,
            ),
            base.finalStyle,
        ])
    }

    const destination = base.finalStyle
    return planWithFrames(base, [
        base.keyframes[0],
        frozenFrame(
            `translate3d(${rounded(dx)}px, ${rounded(dy)}px, 0) scale(${exitScale(base.intent)}) ${destination.transform}`,
            0,
        ),
    ])
}

export function createTalosWindowFlipPlan(
    base: TalosInteractionMotionPlan,
    options: FlipPlanOptions,
): TalosInteractionMotionPlan {
    if (!base.enabled || base.durationMs <= 0) return base

    const afterWidth = Math.max(1, finite(options.after.width, 1))
    const afterHeight = Math.max(1, finite(options.after.height, 1))
    const dx = finite(options.before.left - options.after.left)
    const dy = finite(options.before.top - options.after.top)
    const scaleX = Math.max(0.01, finite(options.before.width, afterWidth) / afterWidth)
    const scaleY = Math.max(0.01, finite(options.before.height, afterHeight) / afterHeight)
    const profileTransform = base.keyframes[0]?.transform ?? 'none'

    return planWithFrames(base, [
        frozenFrame(
            `translate3d(${rounded(dx)}px, ${rounded(dy)}px, 0) scale(${rounded(scaleX, 4)}, ${rounded(scaleY, 4)}) ${profileTransform}`,
            1,
        ),
        frozenFrame(base.finalStyle.transform, 1),
    ])
}
