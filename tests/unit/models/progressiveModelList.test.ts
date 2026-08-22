import { describe, expect, it } from 'vitest'
import {
    TALOS_MODEL_CATALOG_PAGE_SIZE,
    talosInitialModelLimit,
    talosNextModelLimit,
    talosVisibleModelProfiles,
} from '@/lib/models/progressiveModelList'

describe('progressive model catalog window', () => {
    it('starts at forty and advances without skipping, duplicating, or exceeding total', () => {
        expect(TALOS_MODEL_CATALOG_PAGE_SIZE).toBe(40)
        expect(talosInitialModelLimit()).toBe(40)
        expect(talosNextModelLimit(40, 479)).toBe(80)
        expect(talosNextModelLimit(440, 479)).toBe(479)
        expect(talosNextModelLimit(479, 479)).toBe(479)

        const profiles = Array.from({ length: 479 }, (_, index) => ({ id: `model-${index}` }))
        const visible = talosVisibleModelProfiles(profiles, 80)
        expect(visible).toHaveLength(80)
        expect(visible.map((entry) => entry.id)).toEqual(
            Array.from({ length: 80 }, (_, index) => `model-${index}`),
        )
    })

    it('normalises invalid limits and never mutates the source list', () => {
        const profiles = Object.freeze([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
        expect(talosVisibleModelProfiles(profiles, Number.NaN)).toEqual([])
        expect(talosVisibleModelProfiles(profiles, -10)).toEqual([])
        expect(talosVisibleModelProfiles(profiles, 99)).toEqual(profiles)
        expect(talosNextModelLimit(Number.NaN, 3)).toBe(3)
        expect(profiles).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    })
})
