import { describe, expect, it } from 'vitest'
import {
    TALOS_MOBILE_SETTINGS_ACCOUNT_TAB,
    TALOS_MOBILE_SETTINGS_GROUPS,
    TALOS_MOBILE_SETTINGS_MODEL_LAB_TAB,
    TALOS_MOBILE_SETTINGS_TABS,
} from '@/components/talos/settings/settingsTabs'

// Owner 2026-07-24 (Claude-style Settings): every inline non-account tab must
// live in exactly ONE group so the grouped-card list is complete and disjoint.
describe('settings groups contract', () => {
    it('covers every inline non-account tab exactly once', () => {
        const grouped = TALOS_MOBILE_SETTINGS_GROUPS.flatMap((group) => group.tabIds)
        const expected = TALOS_MOBILE_SETTINGS_TABS
            .map((tab) => tab.id)
            .filter((id) => id !== TALOS_MOBILE_SETTINGS_ACCOUNT_TAB
                && id !== TALOS_MOBILE_SETTINGS_MODEL_LAB_TAB)
        expect([...grouped].sort()).toEqual([...expected].sort())
        // No duplicates across groups.
        expect(new Set(grouped).size).toBe(grouped.length)
    })

    it('never groups the account tab (it is the top card)', () => {
        const grouped = TALOS_MOBILE_SETTINGS_GROUPS.flatMap((group) => group.tabIds)
        expect(grouped).not.toContain(TALOS_MOBILE_SETTINGS_ACCOUNT_TAB)
    })

    it('keeps the parse-only Model Lab compatibility id outside inline groups', () => {
        const grouped = TALOS_MOBILE_SETTINGS_GROUPS.flatMap((group) => group.tabIds)
        expect(grouped).not.toContain(TALOS_MOBILE_SETTINGS_MODEL_LAB_TAB)
    })
})
