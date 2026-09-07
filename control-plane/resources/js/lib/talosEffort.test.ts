import { describe, expect, it } from 'vitest'
import {
    talosClampEffort,
    talosComposerEffortLadder,
    talosEffortLabel,
    talosProfileVisibleInComposer,
} from './talosEffort'
import type { TalosModelProfile } from './talosTypes'

function profile(overrides: Partial<TalosModelProfile> = {}): TalosModelProfile {
    return {
        id: 'profile-1',
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        display_name: 'Claude',
        timeout_seconds: 60,
        status: 'healthy',
        capabilities: {},
        probe_result: { ok: true },
        has_secret: true,
        effort_levels: ['low', 'medium', 'high'],
        supports_thinking: true,
        show_in_composer: true,
        created_at: '2026-07-20T00:00:00Z',
        updated_at: '2026-07-20T00:00:00Z',
        ...overrides,
    }
}

describe('talosComposerEffortLadder', () => {
    it('orders the supported levels canonically and prepends an implicit Off', () => {
        expect(talosComposerEffortLadder(profile({ effort_levels: ['high', 'low', 'medium'] })))
            .toEqual(['off', 'low', 'medium', 'high'])
    })

    it('never hardcodes levels: a non-reasoning model exposes only Off', () => {
        expect(talosComposerEffortLadder(profile({ effort_levels: [] }))).toEqual(['off'])
        expect(talosComposerEffortLadder(null)).toEqual(['off'])
    })

    it('keeps a single Off even if the backend already lists it and drops unknown levels', () => {
        expect(talosComposerEffortLadder(profile({ effort_levels: ['off', 'max', 'bogus', 'xhigh'] })))
            .toEqual(['off', 'xhigh', 'max'])
    })
})

describe('talosClampEffort', () => {
    it('keeps the desired level when the new profile supports it', () => {
        expect(talosClampEffort(profile({ effort_levels: ['low', 'medium', 'high'] }), 'medium')).toBe('medium')
    })

    it('falls back to high when the desired level is unsupported and high exists', () => {
        expect(talosClampEffort(profile({ effort_levels: ['low', 'medium', 'high'] }), 'max')).toBe('high')
    })

    it('falls back to the top level when high is absent', () => {
        expect(talosClampEffort(profile({ effort_levels: ['minimal', 'low'] }), 'max')).toBe('low')
    })

    it('resolves to Off for a model that runs without reasoning', () => {
        expect(talosClampEffort(profile({ effort_levels: [] }), 'high')).toBe('off')
    })
})

describe('talosEffortLabel', () => {
    it('humanizes each level', () => {
        expect(talosEffortLabel('off')).toBe('Off')
        expect(talosEffortLabel('high')).toBe('High')
        expect(talosEffortLabel('xhigh')).toBe('Xhigh')
    })
})

describe('talosProfileVisibleInComposer', () => {
    it('hides only profiles explicitly marked show_in_composer false', () => {
        expect(talosProfileVisibleInComposer(profile({ show_in_composer: true }))).toBe(true)
        expect(talosProfileVisibleInComposer(profile({ show_in_composer: false }))).toBe(false)
        // Legacy profiles without the field default to visible.
        expect(talosProfileVisibleInComposer(profile({ show_in_composer: undefined as unknown as boolean }))).toBe(true)
    })
})
