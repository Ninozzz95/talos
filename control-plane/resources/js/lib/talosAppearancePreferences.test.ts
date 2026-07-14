import { describe, expect, it } from 'vitest'
import {
    TALOS_APPEARANCE_DEFAULTS,
    resolveTalosAppearanceVisibility,
} from './talosAppearancePreferences'

describe('TALOS appearance visibility', () => {
    it('enables Mission Path by default without overriding an explicit opt-out', () => {
        expect(TALOS_APPEARANCE_DEFAULTS.chat_area.mission_path).toBe(true)
        expect(resolveTalosAppearanceVisibility({}).chat_area.mission_path).toBe(true)
        expect(resolveTalosAppearanceVisibility({
            chat_area: { mission_path: false },
        }).chat_area.mission_path).toBe(false)
    })
})
