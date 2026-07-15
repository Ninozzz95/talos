import { describe, expect, it } from 'vitest'
import {
    TALOS_APPEARANCE_DEFAULTS,
    resolveTalosAppearanceVisibility,
    resolveTalosMissionPathVisibility,
} from './talosAppearancePreferences'

describe('TALOS appearance visibility', () => {
    it('enables Mission Path by default without overriding an explicit opt-out', () => {
        expect(TALOS_APPEARANCE_DEFAULTS.chat_area.mission_path).toBe(true)
        expect(resolveTalosAppearanceVisibility({}).chat_area.mission_path).toBe(true)
        expect(resolveTalosAppearanceVisibility({
            chat_area: { mission_path: false },
        }).chat_area.mission_path).toBe(false)
    })

    it.each([
        { developmentMode: true, breakpoint: 'desktop', preferenceEnabled: true, expected: true },
        { developmentMode: true, breakpoint: 'tablet', preferenceEnabled: true, expected: true },
        { developmentMode: true, breakpoint: 'mobile', preferenceEnabled: true, expected: false },
        { developmentMode: true, breakpoint: 'desktop', preferenceEnabled: false, expected: false },
        { developmentMode: false, breakpoint: 'desktop', preferenceEnabled: true, expected: false },
        { developmentMode: false, breakpoint: 'mobile', preferenceEnabled: true, expected: false },
    ] as const)(
        'resolves Mission Path policy for $developmentMode/$breakpoint/$preferenceEnabled',
        ({ developmentMode, breakpoint, preferenceEnabled, expected }) => {
            expect(resolveTalosMissionPathVisibility({
                developmentMode,
                breakpoint,
                preferenceEnabled,
            })).toBe(expected)
        },
    )
})
