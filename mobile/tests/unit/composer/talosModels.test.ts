import { describe, it, expect } from 'vitest'
import {
    talosComposerEffortLadder,
    talosClampEffort,
    talosEffortLabel,
    talosModelProfileIsCallable,
    talosProfileVisibleInComposer,
    type TalosModelProfile,
} from '@/lib/talosModels'

function profile(over: Partial<TalosModelProfile> = {}): TalosModelProfile {
    return {
        id: 'x',
        display_name: 'X',
        model: 'm',
        provider: 'local',
        status: 'ready',
        effort_levels: ['low', 'medium', 'high'],
        supports_thinking: false,
        show_in_composer: true,
        ...over,
    }
}

describe('talos models + effort (FV2-06.0 mirror)', () => {
    it('builds the composer effort ladder with off prepended, canonical order, junk dropped', () => {
        expect(talosComposerEffortLadder(profile({ effort_levels: ['high', 'low', 'medium'] }))).toEqual(['off', 'low', 'medium', 'high'])
        expect(talosComposerEffortLadder(profile({ effort_levels: [] }))).toEqual(['off'])
        expect(talosComposerEffortLadder(profile({ effort_levels: ['bogus', 'high', 'off'] }))).toEqual(['off', 'high'])
    })

    it('clamps a desired effort into the profile ladder (keep / high / top / off)', () => {
        expect(talosClampEffort(profile({ effort_levels: ['low', 'medium'] }), 'medium')).toBe('medium')
        expect(talosClampEffort(profile({ effort_levels: ['low', 'medium'] }), 'high')).toBe('medium') // no high → top
        expect(talosClampEffort(profile({ effort_levels: ['low', 'high'] }), 'xhigh')).toBe('high') // fallback high
        expect(talosClampEffort(profile({ effort_levels: [] }), 'high')).toBe('off')
    })

    it('labels effort levels', () => {
        expect(talosEffortLabel('off')).toBe('Off')
        expect(talosEffortLabel('high')).toBe('High')
    })

    it('gates callability by status (local-first: no provider secrets until M2)', () => {
        expect(talosModelProfileIsCallable(profile({ status: 'ready' }))).toBe(true)
        expect(talosModelProfileIsCallable(profile({ status: 'disabled' }))).toBe(false)
        expect(talosModelProfileIsCallable(profile({ status: 'failed' }))).toBe(false)
        expect(talosModelProfileIsCallable(null)).toBe(false)
    })

    it('composer visibility respects show_in_composer', () => {
        expect(talosProfileVisibleInComposer(profile({ show_in_composer: true }))).toBe(true)
        expect(talosProfileVisibleInComposer(profile({ show_in_composer: false }))).toBe(false)
    })
})
