export type TalosMobileEffortLevel =
    | 'off'
    | 'minimal'
    | 'low'
    | 'medium'
    | 'high'
    | 'xhigh'
    | 'max'

export const TALOS_MOBILE_EFFORT_ORDER: readonly TalosMobileEffortLevel[] = Object.freeze([
    'off',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
])

const EFFORT_RANK = new Map<TalosMobileEffortLevel, number>(
    TALOS_MOBILE_EFFORT_ORDER.map((level, index) => [level, index]),
)

function isTalosMobileEffortLevel(value: string): value is TalosMobileEffortLevel {
    return EFFORT_RANK.has(value as TalosMobileEffortLevel)
}

export function mobileEffortLadderFromLevels(
    levels: readonly string[] | null | undefined,
): TalosMobileEffortLevel[] {
    const supported = (Array.isArray(levels) ? levels : [])
        .filter(isTalosMobileEffortLevel)
        .filter((level) => level !== 'off')
    const ordered = [...new Set(supported)]
        .sort((left, right) => EFFORT_RANK.get(left)! - EFFORT_RANK.get(right)!)

    return ['off', ...ordered]
}

export function clampMobileEffort(
    levels: readonly string[] | null | undefined,
    desired: string,
): TalosMobileEffortLevel {
    const ladder = mobileEffortLadderFromLevels(levels)
    if (isTalosMobileEffortLevel(desired) && ladder.includes(desired)) return desired
    if (ladder.includes('high')) return 'high'
    return ladder.at(-1) ?? 'off'
}

export function mobileEffortLabel(level: TalosMobileEffortLevel | string): string {
    if (level === 'off') return 'Off'
    return level.charAt(0).toUpperCase() + level.slice(1)
}
