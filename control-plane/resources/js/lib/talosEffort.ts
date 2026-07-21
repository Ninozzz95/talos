import { TALOS_EFFORT_ORDER, type TalosEffortLevel, type TalosModelProfile } from './talosTypes'

const EFFORT_RANK = new Map<TalosEffortLevel, number>(
    TALOS_EFFORT_ORDER.map((level, index) => [level, index]),
)

function isEffortLevel(value: string): value is TalosEffortLevel {
    return EFFORT_RANK.has(value as TalosEffortLevel)
}

export function talosProfileEffortLevels(profile: TalosModelProfile | null | undefined): string[] {
    return Array.isArray(profile?.effort_levels) ? profile.effort_levels : []
}

/**
 * The composer effort ladder for a profile: its backend-supported reasoning
 * levels (never a hardcoded list) in canonical order, with an implicit `off`
 * prepended so every model can be sent without a reasoning param.
 */
export function talosEffortLadderFromLevels(levels: readonly string[] | null | undefined): TalosEffortLevel[] {
    const supported = (Array.isArray(levels) ? levels : [])
        .filter(isEffortLevel)
        .filter((level) => level !== 'off')
    const ordered = [...new Set(supported)].sort((a, b) => (EFFORT_RANK.get(a)! - EFFORT_RANK.get(b)!))
    return ['off', ...ordered]
}

export function talosComposerEffortLadder(profile: TalosModelProfile | null | undefined): TalosEffortLevel[] {
    return talosEffortLadderFromLevels(talosProfileEffortLevels(profile))
}

/**
 * Clamp a desired effort into a (possibly new) profile's ladder: keep it when
 * supported, else fall back to `high` when present, else the top level, else
 * `off` (a model that runs without reasoning).
 */
export function talosClampEffort(profile: TalosModelProfile | null | undefined, desired: string): TalosEffortLevel {
    const ladder = talosComposerEffortLadder(profile)
    if (isEffortLevel(desired) && ladder.includes(desired)) return desired
    if (ladder.includes('high')) return 'high'
    return ladder[ladder.length - 1] ?? 'off'
}

export function talosEffortLabel(level: string): string {
    if (level === 'off') return 'Off'
    return level.charAt(0).toUpperCase() + level.slice(1)
}

/** Composer visibility: visible unless a profile is explicitly hidden. */
export function talosProfileVisibleInComposer(profile: TalosModelProfile): boolean {
    return profile.show_in_composer !== false
}
