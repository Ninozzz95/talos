import { describe, expect, it } from 'vitest'
import { TALOS_MOBILE_SETTINGS_TABS } from '@/components/talos/settings/settingsTabs'

describe('TALOS mobile settings registry', () => {
    it('exposes the exact eleven desktop settings categories in order (F4-#25: no Shortcuts on a phone)', () => {
        expect(TALOS_MOBILE_SETTINGS_TABS.map((tab) => tab.id)).toEqual([
            'models',
            'ai_defaults',
            'search',
            'browser',
            'integrations',
            'email',
            'reminders',
            'appearance',
            'account',
            'agent_tools',
            'system',
        ])
        expect(TALOS_MOBILE_SETTINGS_TABS.map((tab) => tab.label)).toEqual([
            'Models',
            'AI Defaults',
            'Search',
            'Browser',
            'Integrations',
            'Email',
            'Reminders',
            'Appearance',
            'Account',
            'Agent Tools',
            'System',
        ])
    })

    it('marks only real local panels available in this slice', () => {
        const available = TALOS_MOBILE_SETTINGS_TABS.filter((tab) => tab.availability === 'available')
        // F2-T6: Account became a REAL local panel (replay intro + app lock).
        expect(available.map((tab) => tab.id)).toEqual(['models', 'ai_defaults', 'browser', 'appearance', 'account'])
    })
})
