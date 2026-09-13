import { describe, expect, it } from 'vitest'
import {
    talosBrowsePublishers,
    talosGroupModelsByProvider,
    talosProviderOf,
    talosProviderOptions,
} from '@/lib/models/providerGrouping'
import type { TalosHuggingFaceModel } from '@/lib/models/huggingFace'

/**
 * Who published a model, on a screen where every row is a stranger's upload.
 *
 * The people who quantise GGUF are a small, recognisable set, and "who made
 * this one" is most of what a reader uses to judge it. So the list groups by
 * publisher — and derives the publishers from the results, because a list of
 * known ones compiled into an APK is a list that is wrong by the time somebody
 * installs it.
 */
function model(id: string, downloads: number): TalosHuggingFaceModel {
    return { id, downloads, likes: 0, gated: false, updatedAt: null }
}

describe('who published it', () => {
    it('reads the publisher out of the repository id', () => {
        expect(talosProviderOf('unsloth/Qwen3-4B-GGUF')).toBe('unsloth')
        expect(talosProviderOf('bartowski/Llama-3.2-3B-Instruct-GGUF')).toBe('bartowski')
    })

    /** Some ids have no owner at all. It is still one bucket, not a crash. */
    it('copes with an id that has no owner', () => {
        expect(talosProviderOf('gpt2')).toBe('gpt2')
        expect(talosProviderOf('')).toBe('')
    })
})

describe('grouping the results', () => {
    it('puts every model under the organisation that published it', () => {
        const groups = talosGroupModelsByProvider([
            model('unsloth/Qwen3-4B-GGUF', 900),
            model('bartowski/Qwen3-4B-GGUF', 400),
            model('unsloth/Qwen3-8B-GGUF', 300),
        ])

        expect(groups.map((group) => group.provider)).toEqual(['unsloth', 'bartowski'])
        expect(groups[0]!.models).toHaveLength(2)
        expect(groups[0]!.totalDownloads).toBe(1200)
    })

    /**
     * Ordered by use, because on a screen full of strangers' uploads "how many
     * people run this" is the only reputation signal the Hub gives us —
     * inventing another would be inventing one.
     */
    it('puts the most used publisher first', () => {
        const groups = talosGroupModelsByProvider([
            model('small/a', 10),
            model('big/b', 5_000),
            model('medium/c', 100),
        ])

        expect(groups.map((group) => group.provider)).toEqual(['big', 'medium', 'small'])
    })

    /**
     * Within a group the Hub's own order stands. It already sorted by
     * downloads, and re-sorting would be re-deciding what it decided better.
     */
    it('leaves the order inside a group exactly as the Hub returned it', () => {
        const groups = talosGroupModelsByProvider([
            model('unsloth/first', 900),
            model('unsloth/second', 800),
            model('unsloth/third', 700),
        ])

        expect(groups[0]!.models.map((entry) => entry.id))
            .toEqual(['unsloth/first', 'unsloth/second', 'unsloth/third'])
    })

    /** Two publishers with the same total must not swap between renders. */
    it('breaks a tie the same way every time', () => {
        const once = talosGroupModelsByProvider([model('zeta/a', 100), model('alpha/b', 100)])
        const again = talosGroupModelsByProvider([model('alpha/b', 100), model('zeta/a', 100)])

        expect(once.map((group) => group.provider)).toEqual(again.map((group) => group.provider))
        expect(once.map((group) => group.provider)).toEqual(['alpha', 'zeta'])
    })

    it('has nothing to group when there are no results', () => {
        expect(talosGroupModelsByProvider([])).toEqual([])
    })
})

describe('the filter', () => {
    it('derives options from unfiltered results and preserves an absent selection verbatim', () => {
        const results = [
            model('unsloth/a', 900),
            model('bartowski/b', 400),
        ]

        expect(talosBrowsePublishers(results, 'unsloth')).toEqual([
            { value: 'unsloth', label: 'unsloth (1)' },
            { value: 'bartowski', label: 'bartowski (1)' },
        ])
        expect(talosBrowsePublishers(results, 'publisher-from-previous-query')).toEqual([
            { value: 'unsloth', label: 'unsloth (1)' },
            { value: 'bartowski', label: 'bartowski (1)' },
            {
                value: 'publisher-from-previous-query',
                label: 'publisher-from-previous-query',
            },
        ])
    })

    /**
     * A filter that does not say how much it will leave behind is a filter you
     * have to try in order to understand.
     */
    it('says how many models each publisher has', () => {
        const groups = talosGroupModelsByProvider([
            model('unsloth/a', 900),
            model('unsloth/b', 800),
            model('bartowski/c', 400),
        ])

        expect(talosProviderOptions(groups)).toEqual([
            { value: 'unsloth', label: 'unsloth (2)' },
            { value: 'bartowski', label: 'bartowski (1)' },
        ])
    })

    /**
     * No hardcoded publishers anywhere: the options are exactly what came back,
     * so a name nobody has heard of yet appears the day it starts publishing.
     */
    it('offers only publishers that actually appeared in the results', () => {
        const groups = talosGroupModelsByProvider([model('someone-brand-new/x', 3)])

        expect(talosProviderOptions(groups)).toEqual([
            { value: 'someone-brand-new', label: 'someone-brand-new (1)' },
        ])
    })
})
