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

/**
 * ⭐ RAG-OBB (24/09/2026, owner «cura 1»): `mandatory` viene dal catalogo OpenRouter (`reasoning.mandatory`). Per quei
 * modelli «off» non esiste: la documentazione dice «hide disable controls and do not send effort: "none"»
 * (https://openrouter.ai/docs/use-cases/reasoning-tokens, letta il 24/09/2026). GLM 5.3 con «off» partiva senza
 * `reasoning` e un fornitore ha scritto il ragionamento nella risposta.
 */
export interface TalosMobileEffortOptions {
    readonly mandatory?: boolean
}

export function mobileEffortLadderFromLevels(
    levels: readonly string[] | null | undefined,
    options: TalosMobileEffortOptions = {},
): TalosMobileEffortLevel[] {
    const supported = (Array.isArray(levels) ? levels : [])
        .filter(isTalosMobileEffortLevel)
        .filter((level) => level !== 'off')
    const ordered = [...new Set(supported)]
        .sort((left, right) => EFFORT_RANK.get(left)! - EFFORT_RANK.get(right)!)

    // Un modello obbligatorio senza livelli dichiarati tiene «off»: un comando vuoto non si può scegliere.
    if (options.mandatory === true && ordered.length > 0) return ordered
    return ['off', ...ordered]
}

/**
 * Un livello non supportato scende al più vicino PIÙ DEBOLE, mai a «off»; se non ce n'è uno più debole, il minimo.
 * È la politica di Hermes Agent (`clamp_effort`, PR #90350, merged 20/08/2026: «never escalate cost», «none never
 * becomes a degradation target»).
 */
export function clampMobileEffort(
    levels: readonly string[] | null | undefined,
    desired: string,
    options: TalosMobileEffortOptions = {},
): TalosMobileEffortLevel {
    const ladder = mobileEffortLadderFromLevels(levels, options)
    if (isTalosMobileEffortLevel(desired) && ladder.includes(desired)) return desired
    const enabled = ladder.filter((level) => level !== 'off')
    if (isTalosMobileEffortLevel(desired) && enabled.length > 0) {
        const rank = EFFORT_RANK.get(desired)!
        const weaker = enabled.filter((level) => EFFORT_RANK.get(level)! < rank)
        return weaker.at(-1) ?? enabled[0]!
    }
    if (ladder.includes('high')) return 'high'
    return ladder.at(-1) ?? 'off'
}

/** Il profilo scelto nel composer: i livelli e il vincolo arrivano insieme dal catalogo (RAG-OBB). */
export interface TalosMobileEffortProfile {
    readonly effort_levels?: readonly string[] | null
    readonly reasoning_mandatory?: boolean
}

export function mobileEffortLadderFor(profile: TalosMobileEffortProfile | null | undefined): TalosMobileEffortLevel[] {
    return mobileEffortLadderFromLevels(profile?.effort_levels, { mandatory: profile?.reasoning_mandatory === true })
}

export function clampMobileEffortFor(
    profile: TalosMobileEffortProfile | null | undefined,
    desired: string,
): TalosMobileEffortLevel {
    return clampMobileEffort(profile?.effort_levels, desired, { mandatory: profile?.reasoning_mandatory === true })
}

export function mobileEffortLabel(level: TalosMobileEffortLevel | string): string {
    if (level === 'off') return 'Off'
    return level.charAt(0).toUpperCase() + level.slice(1)
}
