/**
 * TALOS Mobile model + effort model (FV2-06.0 mirror). Framework-agnostic logic
 * mirrored from the desktop `lib/talosEffort.ts` / `lib/talosTypes.ts`. The catalog
 * here is a LOCAL stub (no provider secrets; Vault/M2 is gated). Real model
 * profiles / provider secrets arrive with the local sovereign core (M2).
 */

export type TalosEffortLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export const TALOS_EFFORT_ORDER: readonly TalosEffortLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

export type TalosModelProfileStatus = 'ready' | 'disabled' | 'failed'

export interface TalosModelProfile {
    id: string
    display_name: string
    model: string
    provider: string
    status: TalosModelProfileStatus
    effort_levels: string[]
    supports_thinking: boolean
    show_in_composer: boolean
}

export interface TalosModelRoutingProfile {
    id: string
    name: string
    status: 'enabled' | 'disabled'
    lanes: string[]
}

const EFFORT_RANK = new Map<TalosEffortLevel, number>(TALOS_EFFORT_ORDER.map((level, index) => [level, index]))

function isEffortLevel(value: string): value is TalosEffortLevel {
    return EFFORT_RANK.has(value as TalosEffortLevel)
}

export function talosProfileEffortLevels(profile: TalosModelProfile | null | undefined): string[] {
    return Array.isArray(profile?.effort_levels) ? profile!.effort_levels : []
}

/** Ladder = the profile's backend-supported levels (never hardcoded), canonical order, with `off` prepended. */
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

/** Clamp a desired effort into a profile's ladder: keep if supported, else `high`, else the top level, else `off`. */
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

export function talosModelProfileIsCallable(profile: TalosModelProfile | null | undefined): boolean {
    // Local-first stub: a profile is callable when not disabled/failed. Real
    // provider-secret gating (requiresSecret / has_secret) lands with the Vault (M2).
    return !!profile && profile.status !== 'disabled' && profile.status !== 'failed'
}

export function talosProfileVisibleInComposer(profile: TalosModelProfile): boolean {
    return profile.show_in_composer !== false
}

// ---- Local stub catalog (no secrets; real catalog after M2 / desktop FV2-06.0 P0) ----

export const TALOS_MOBILE_ROUTING_PROFILES: readonly TalosModelRoutingProfile[] = Object.freeze([
    { id: 'auto-balanced', name: 'Auto · Balanced', status: 'enabled', lanes: ['fast', 'deep'] },
])

export const TALOS_MOBILE_MODEL_PROFILES: readonly TalosModelProfile[] = Object.freeze([
    { id: 'opus', display_name: 'Claude Opus', model: 'claude-opus-4-8', provider: 'anthropic', status: 'ready', effort_levels: ['low', 'medium', 'high'], supports_thinking: true, show_in_composer: true },
    { id: 'sonnet', display_name: 'Claude Sonnet', model: 'claude-sonnet-5', provider: 'anthropic', status: 'ready', effort_levels: ['low', 'medium', 'high'], supports_thinking: true, show_in_composer: true },
    { id: 'haiku', display_name: 'Claude Haiku', model: 'claude-haiku-4-5', provider: 'anthropic', status: 'ready', effort_levels: ['low', 'high'], supports_thinking: false, show_in_composer: true },
])
