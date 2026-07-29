import type { TalosChatBubbleScale } from './talosTypes'

export type TalosScaleConstraint = Readonly<{
    min: number
    max: number
    step: number
    default: number
}>

export const TALOS_UI_SCALE_CONSTRAINT = Object.freeze({
    min: 0.8,
    max: 1.3,
    step: 0.05,
    default: 1,
}) satisfies TalosScaleConstraint

export const TALOS_MESSAGE_SCALE_CONSTRAINT = Object.freeze({
    min: 0.75,
    max: 1.4,
    step: 0.05,
    default: 1,
}) satisfies TalosScaleConstraint

export const TALOS_LEGACY_MESSAGE_SCALE: Readonly<Record<TalosChatBubbleScale, number>> = Object.freeze({
    compact: 0.875,
    balanced: 1,
    expanded: 1.15,
})

const STEP_EPSILON = 1e-9

function snapped(value: number, constraint: TalosScaleConstraint): number {
    const bounded = Math.min(constraint.max, Math.max(constraint.min, value))
    return Number((Math.round(bounded / constraint.step) * constraint.step).toFixed(2))
}

function isScale(value: unknown, constraint: TalosScaleConstraint): value is number {
    return typeof value === 'number'
        && Number.isFinite(value)
        && value >= constraint.min
        && value <= constraint.max
        && Math.abs(value - snapped(value, constraint)) <= STEP_EPSILON
}

function canonicalizeScale(value: unknown, constraint: TalosScaleConstraint): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? snapped(value, constraint)
        : constraint.default
}

function stepScale(value: unknown, direction: -1 | 1, constraint: TalosScaleConstraint): number {
    const baseline = canonicalizeScale(value, constraint)
    return canonicalizeScale(baseline + (direction * constraint.step), constraint)
}

export function isTalosUiScale(value: unknown): value is number {
    return isScale(value, TALOS_UI_SCALE_CONSTRAINT)
}

export function isTalosMessageScale(value: unknown): value is number {
    return isScale(value, TALOS_MESSAGE_SCALE_CONSTRAINT)
}

export function canonicalizeTalosUiScale(value: unknown): number {
    return canonicalizeScale(value, TALOS_UI_SCALE_CONSTRAINT)
}

export function canonicalizeTalosMessageScale(value: unknown): number {
    return canonicalizeScale(value, TALOS_MESSAGE_SCALE_CONSTRAINT)
}

export function resolveTalosMessageScale(value: unknown, legacyValue?: unknown): number {
    if (value !== undefined) return isTalosMessageScale(value) ? value : TALOS_MESSAGE_SCALE_CONSTRAINT.default
    return typeof legacyValue === 'string' && Object.hasOwn(TALOS_LEGACY_MESSAGE_SCALE, legacyValue)
        ? TALOS_LEGACY_MESSAGE_SCALE[legacyValue as TalosChatBubbleScale]
        : TALOS_MESSAGE_SCALE_CONSTRAINT.default
}

export function stepTalosUiScale(value: unknown, direction: -1 | 1): number {
    return stepScale(value, direction, TALOS_UI_SCALE_CONSTRAINT)
}

export function stepTalosMessageScale(value: unknown, direction: -1 | 1): number {
    return stepScale(value, direction, TALOS_MESSAGE_SCALE_CONSTRAINT)
}

export function talosScalePercentLabel(value: number): string {
    const percentage = Number((value * 100).toFixed(1))
    return `${percentage}%`
}
