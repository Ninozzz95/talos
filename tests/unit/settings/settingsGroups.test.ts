import { describe, expect, it } from 'vitest'
import {
    TALOS_MOBILE_SETTINGS_ACCOUNT_TAB,
    TALOS_MOBILE_SETTINGS_GROUPS,
    TALOS_MOBILE_SETTINGS_MODEL_LAB_TAB,
    TALOS_MOBILE_SETTINGS_TABS,
} from '@/components/talos/settings/settingsTabs'

// Owner 2026-08-05: every non-account destination — routed Model Lab included
// — must live in exactly ONE group so the grouped-card list is complete and
// disjoint. Routing is a behavior of the row, not a reason to detach it from
// the information architecture.
describe('settings groups contract', () => {
    it('covers every non-account destination exactly once', () => {
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

    it('puts routed Model Lab first in Intelligence, below the account card', () => {
        expect(TALOS_MOBILE_SETTINGS_GROUPS[0]?.label).toBe('Intelligence')
        expect(TALOS_MOBILE_SETTINGS_GROUPS[0]?.tabIds).toEqual([
            TALOS_MOBILE_SETTINGS_MODEL_LAB_TAB,
            'ai_defaults',
            'agent_tools',
        ])
    })
})
