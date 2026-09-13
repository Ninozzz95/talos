/**
 * The composer's model list, arranged so a model can be found in it.
 *
 * Owner 2026-07-27: "quando aggiungi tanti modelli tipo openrouter nel drawer
 * models della chat c'è una lista infinita, metti una search bar e raggruppa
 * per provider con collapse".
 *
 * OpenRouter alone publishes hundreds of models. Past a couple of dozen a flat
 * list stops being a list and becomes a scroll, and the one you want is never
 * the one on screen. Grouping gives the eye somewhere to land; the search box
 * is for when it already knows the name.
 *
 * Pure, so the arrangement can be tested rather than squinted at.
 */
export interface TalosModelGroupEntry {
    id: string
    provider: string
    /** The label the user sees, in either of the shapes the app carries. */
    displayName?: string
    display_name?: string
    /** The wire name — `gpt-5`, `claude-opus-5` — which is what gets typed. */
    model?: string
}

export interface TalosModelGroup<T extends TalosModelGroupEntry> {
    provider: string
    profiles: T[]
}

function haystack(profile: TalosModelGroupEntry): string {
    // The wire name is included because it is what a person types: nobody
    // searches for a profile id, and plenty of people know the model by
    // `claude-opus-5` rather than by whatever the profile was labelled.
    return [
        profile.displayName ?? '',
        profile.display_name ?? '',
        profile.model ?? '',
        profile.id,
        profile.provider,
    ].join(' ').toLowerCase()
}

export function groupTalosModelsByProvider<T extends TalosModelGroupEntry>(
    profiles: readonly T[],
    query: string,
): Array<TalosModelGroup<T>> {
    const needle = query.trim().toLowerCase()
    const groups: Array<TalosModelGroup<T>> = []

    for (const profile of profiles) {
        // Nothing rather than everything when nothing matches: falling back to
        // the full list is how a search box teaches people it does not work.
        if (needle !== '' && !haystack(profile).includes(needle)) continue
        // Provider order follows the order they arrived in, which is the order
        // the user set up — not an alphabet nobody asked for.
        const existing = groups.find((group) => group.provider === profile.provider)
        if (existing) existing.profiles.push(profile)
        else groups.push({ provider: profile.provider, profiles: [profile] })
    }

    return groups
}

/**
 * Which groups are already open when the drawer appears.
 *
 * The one holding the model in use, because that is the one being changed. All
 * of them while a search is narrowing the list, because hiding results behind a
 * collapsed header after someone has typed is the opposite of what they asked
 * for. And the only group there is, rather than making it be tapped.
 */
export function talosModelGroupsOpenByDefault<T extends TalosModelGroupEntry>(
    groups: ReadonlyArray<TalosModelGroup<T>>,
    selectedProfileId: string | null,
    searching = false,
): string[] {
    if (searching) return groups.map((group) => group.provider)
    if (groups.length === 1) return groups.map((group) => group.provider)
    const holding = groups.find((group) => group.profiles
        .some((profile) => profile.id === selectedProfileId))
    return holding ? [holding.provider] : []
}
