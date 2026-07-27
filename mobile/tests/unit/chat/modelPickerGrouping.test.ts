import { describe, expect, it } from 'vitest'
import { groupTalosModelsByProvider, talosModelGroupsOpenByDefault } from '@/lib/chat/modelPickerGrouping'

/**
 * Owner 2026-07-27: "quando aggiungi tanti modelli tipo openrouter nel drawer
 * models della chat c'è una lista infinita, metti una search bar e raggruppa
 * per provider con collapse".
 *
 * OpenRouter alone publishes hundreds. A flat list is not a list at that point,
 * it is a scroll — and the model you want is never the one on screen.
 */
function profile(id: string, provider: string, label = id) {
    return { id, provider, displayName: label } as never
}

const PROFILES = [
    profile('gpt-5', 'openai', 'GPT-5'),
    profile('o4', 'openai', 'o4'),
    profile('claude-opus-5', 'anthropic', 'Claude Opus 5'),
    profile('llama-3', 'openrouter', 'Llama 3'),
    profile('mixtral', 'openrouter', 'Mixtral'),
]

describe('the models, arranged so one can be found', () => {
    it('groups by provider, keeping the order they were given', () => {
        const groups = groupTalosModelsByProvider(PROFILES, '')
        expect(groups.map((group) => group.provider)).toEqual(['openai', 'anthropic', 'openrouter'])
        expect(groups[0]!.profiles).toHaveLength(2)
        expect(groups[2]!.profiles.map((entry) => entry.id)).toEqual(['llama-3', 'mixtral'])
    })

    it('searches the name a person would type, not the id', () => {
        const groups = groupTalosModelsByProvider(PROFILES, 'opus')
        expect(groups).toHaveLength(1)
        expect(groups[0]!.profiles[0]!.id).toBe('claude-opus-5')
    })

    it('matches the provider too, so "openrouter" narrows to its models', () => {
        const groups = groupTalosModelsByProvider(PROFILES, 'openrouter')
        expect(groups.map((group) => group.provider)).toEqual(['openrouter'])
        expect(groups[0]!.profiles).toHaveLength(2)
    })

    it('ignores case and stray spaces, because a search box is typed into', () => {
        expect(groupTalosModelsByProvider(PROFILES, '  GPT  ')[0]!.profiles[0]!.id).toBe('gpt-5')
    })

    it('returns nothing rather than everything when nothing matches', () => {
        // Falling back to the full list is how a search box teaches people it
        // does not work.
        expect(groupTalosModelsByProvider(PROFILES, 'zzzz')).toEqual([])
    })
})

describe('which groups are open when the drawer opens', () => {
    it('opens the group holding the model in use, and only that one', () => {
        const open = talosModelGroupsOpenByDefault(
            groupTalosModelsByProvider(PROFILES, ''),
            'claude-opus-5',
        )
        expect(open).toEqual(['anthropic'])
    })

    it('opens everything while a search is narrowing it', () => {
        // Hiding results behind a collapsed header after someone typed is the
        // opposite of what they asked for.
        const groups = groupTalosModelsByProvider(PROFILES, 'o')
        expect(talosModelGroupsOpenByDefault(groups, null, true))
            .toEqual(groups.map((group) => group.provider))
    })

    it('opens the only group there is, rather than making it be tapped', () => {
        const single = groupTalosModelsByProvider([profile('a', 'openai')], '')
        expect(talosModelGroupsOpenByDefault(single, null)).toEqual(['openai'])
    })

    it('leaves them all shut when nothing is selected and there are many', () => {
        expect(talosModelGroupsOpenByDefault(groupTalosModelsByProvider(PROFILES, ''), null))
            .toEqual([])
    })
})
