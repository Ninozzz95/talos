import { describe, expect, it } from 'vitest'

import {
    TALOS_DEFAULT_TOOL_PERMISSIONS,
    parseTalosChosenToolActions,
    talosEffectiveToolPermissions,
    type TalosToolPermissions,
} from '@/lib/tools/permissionTypes'

/**
 * The rule that turns an inherited refusal into a question.
 *
 * Every test here stands for a way the defect it fixes actually appeared, or a
 * way the fix could become a new defect of its own.
 */
describe('talosEffectiveToolPermissions', () => {
    const stored = (outbound: TalosToolPermissions['outbound']): TalosToolPermissions => ({
        read: 'allow',
        write: 'ask',
        outbound,
    })

    it('leaves everything alone when no search source is configured', () => {
        const effective = talosEffectiveToolPermissions({
            stored: stored('deny'),
            chosen: [],
            searchConfigured: false,
        })
        expect(effective.outbound).toBe('deny')
    })

    /**
     * The defect itself: key saved, panel says ready, model has no tool. With a
     * source configured the inherited refusal becomes a question — which is what
     * makes the authorization card appear at all.
     */
    it('turns an INHERITED refusal into a question once a source is configured', () => {
        const effective = talosEffectiveToolPermissions({
            stored: stored('deny'),
            chosen: [],
            searchConfigured: true,
        })
        expect(effective.outbound).toBe('ask')
    })

    /**
     * The other half, and the one that matters more: a refusal the user CHOSE
     * is not a default to be revised. If this ever passes as 'ask', the word
     * "never" has been taken away from them.
     */
    it('never revises a refusal the user chose', () => {
        const effective = talosEffectiveToolPermissions({
            stored: stored('deny'),
            chosen: ['outbound'],
            searchConfigured: true,
        })
        expect(effective.outbound).toBe('deny')
    })

    it('does not touch a permission that is already allow or ask', () => {
        expect(talosEffectiveToolPermissions({
            stored: stored('allow'),
            chosen: [],
            searchConfigured: true,
        }).outbound).toBe('allow')

        expect(talosEffectiveToolPermissions({
            stored: stored('ask'),
            chosen: [],
            searchConfigured: true,
        }).outbound).toBe('ask')
    })

    it('leaves read and write exactly as they were', () => {
        const effective = talosEffectiveToolPermissions({
            stored: stored('deny'),
            chosen: [],
            searchConfigured: true,
        })
        expect(effective.read).toBe('allow')
        expect(effective.write).toBe('ask')
    })

    it('returns the same object when nothing changes, so callers can compare cheaply', () => {
        const source = stored('allow')
        expect(talosEffectiveToolPermissions({
            stored: source,
            chosen: [],
            searchConfigured: true,
        })).toBe(source)
    })

    /** The default is what makes the promotion necessary; if it changes, this test says so. */
    it('documents that outbound is refused by default', () => {
        expect(TALOS_DEFAULT_TOOL_PERMISSIONS.outbound).toBe('deny')
    })
})

describe('parseTalosChosenToolActions', () => {
    it('reads a valid list', () => {
        expect(parseTalosChosenToolActions(['outbound', 'read'])).toEqual(['outbound', 'read'])
    })

    it('drops unknown entries instead of failing the whole list', () => {
        expect(parseTalosChosenToolActions(['outbound', 'nonsense', 7, null])).toEqual(['outbound'])
    })

    it('de-duplicates', () => {
        expect(parseTalosChosenToolActions(['write', 'write'])).toEqual(['write'])
    })

    /**
     * Missing state means "nothing chosen yet", which is the state every
     * existing installation is in — and the one where the promotion applies.
     * Reading it as anything else would silently exempt everyone already using
     * the app from the fix.
     */
    it('reads absent or malformed state as nothing chosen', () => {
        expect(parseTalosChosenToolActions(undefined)).toEqual([])
        expect(parseTalosChosenToolActions(null)).toEqual([])
        expect(parseTalosChosenToolActions('outbound')).toEqual([])
        expect(parseTalosChosenToolActions({ outbound: true })).toEqual([])
    })
})
