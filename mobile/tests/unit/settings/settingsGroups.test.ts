import { describe, expect, it } from 'vitest'
import {
    TALOS_MOBILE_SETTINGS_ACCOUNT_TAB,
    TALOS_MOBILE_SETTINGS_GROUPS,
    TALOS_MOBILE_SETTINGS_TABS,
} from '@/components/talos/settings/settingsTabs'

// Owner 2026-07-24 (Claude-style Settings): every non-account tab must live in
// exactly ONE group so the grouped-card list is complete and non-overlapping.
describe('settings groups contract', () => {
    it('covers every non-account tab exactly once', () => {
        const grouped = TALOS_MOBILE_SETTINGS_GROUPS.flatMap((group) => group.tabIds)
        const expected = TALOS_MOBILE_SETTINGS_TABS
            .map((tab) => tab.id)
            .filter((id) => id !== TALOS_MOBILE_SETTINGS_ACCOUNT_TAB)
        expect([...grouped].sort()).toEqual([...expected].sort())
        // No duplicates across groups.
        expect(new Set(grouped).size).toBe(grouped.length)
    })

    it('never groups the account tab (it is the top card)', () => {
        const grouped = TALOS_MOBILE_SETTINGS_GROUPS.flatMap((group) => group.tabIds)
        expect(grouped).not.toContain(TALOS_MOBILE_SETTINGS_ACCOUNT_TAB)
    })
})
