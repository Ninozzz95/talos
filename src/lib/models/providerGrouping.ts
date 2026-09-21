import type { TalosHuggingFaceModel } from '@/lib/models/huggingFace'

/**
 * Who published a model, and the list of them, derived rather than declared.
 *
 * On Hugging Face the publisher IS the first half of the repository id —
 * `unsloth/Qwen3-4B-GGUF` comes from `unsloth`. That matters on this screen
 * because the people who quantise models are a small, recognisable set, and
 * "who made this GGUF" is most of what a reader uses to judge one.
 *
 * NOTHING IS HARDCODED. There is no list of known publishers in the app,
 * because who publishes GGUF changes every few months and a list compiled into
 * an APK is a list that is wrong by the time someone installs it. The names
 * come out of the results the Hub actually returned.
 */

export interface TalosModelProviderGroup {
    /** The organisation exactly as the Hub spells it. */
    provider: string
    models: TalosHuggingFaceModel[]
    /** For the ordering, and for saying how much is behind a collapsed header. */
    totalDownloads: number
}

/** `unsloth/Qwen3-4B-GGUF` → `unsloth`. Never invented; taken from the id. */
export function talosProviderOf(id: string): string {
    const slash = id.indexOf('/')
    return slash > 0 ? id.slice(0, slash) : id
}

/**
 * Group the results by publisher.
 *
 * Ordered by how much the publisher's models are actually used, most first: on
 * a screen where every row is a stranger's upload, "how many people run this"
 * is the only reputation signal the Hub gives us, and inventing another would
 * be inventing one.
 *
 * Within a group the models keep the order the Hub returned, which is already
 * sorted by downloads — so re-sorting would only be re-deciding what the Hub
 * already decided better.
 */
export function talosGroupModelsByProvider(
    models: readonly TalosHuggingFaceModel[],
): TalosModelProviderGroup[] {
    const groups = new Map<string, TalosModelProviderGroup>()

    for (const model of models) {
        const provider = talosProviderOf(model.id)
        const existing = groups.get(provider)
        if (existing) {
            existing.models.push(model)
            existing.totalDownloads += model.downloads
        } else {
            groups.set(provider, {
                provider,
                models: [model],
                totalDownloads: model.downloads,
            })
        }
    }

    return [...groups.values()].sort((left, right) => {
        if (right.totalDownloads !== left.totalDownloads) {
            return right.totalDownloads - left.totalDownloads
        }
        // A stable tiebreak, so two publishers with identical totals do not
        // swap places between renders.
        return left.provider.localeCompare(right.provider)
    })
}

/** The dropdown's options, in the same order the groups appear. */
export function talosProviderOptions(
    groups: readonly TalosModelProviderGroup[],
): Array<{ value: string; label: string }> {
    return groups.map((group) => ({
        value: group.provider,
        // The count belongs in the label: a filter that does not say how much
        // it will leave behind is a filter you have to try to understand.
        label: `${group.provider} (${group.models.length})`,
    }))
}

/**
 * Stable publisher options for the browse filter.
 *
 * Callers pass the unfiltered Hub response, never the rows left by the active
 * filters. An old selection is retained verbatim across a new query so the
 * control cannot silently relabel or erase the state that produced zero rows.
 */
export function talosBrowsePublishers(
    models: readonly TalosHuggingFaceModel[],
    selectedPublisher: string,
): Array<{ value: string; label: string }> {
    const options = talosProviderOptions(talosGroupModelsByProvider(models))
    const selected = selectedPublisher.trim()
    if (selected && !options.some((option) => option.value === selected)) {
        options.push({ value: selected, label: selected })
    }
    return options
}
