import { describe, expect, it } from 'vitest'
import { TALOS_MOBILE_SETTINGS_TABS } from '@/components/talos/settings/settingsTabs'

describe('TALOS mobile settings registry', () => {
    /**
     * Mobile-only categories, and why each one cannot come from the desktop.
     *
     * The parity contract below is about DRIFT: a desktop category quietly
     * disappearing or being renamed. A category the desktop cannot have is a
     * different thing, and hiding it inside the parity list would make the
     * contract stop catching what it exists to catch.
     */
    const MOBILE_ONLY: Record<string, string> = {
        // Android runtime permissions have no desktop counterpart at all, and
        // the app will be distributed, where explaining them is expected.
        privacy: 'Android runtime permissions do not exist on the desktop.',
    }

    it('adds a mobile-only category only with a reason', () => {
        const desktopIds = TALOS_MOBILE_SETTINGS_TABS
            .map((tab) => tab.id)
            .filter((id) => !(id in MOBILE_ONLY))
        expect(desktopIds).toHaveLength(11)
        for (const id of Object.keys(MOBILE_ONLY)) {
            expect(TALOS_MOBILE_SETTINGS_TABS.some((tab) => tab.id === id)).toBe(true)
        }
    })

    it('exposes the exact eleven desktop settings categories in order (F4-#25: no Shortcuts on a phone)', () => {
        expect(TALOS_MOBILE_SETTINGS_TABS
            .map((tab) => tab.id)
            .filter((id) => !(id in MOBILE_ONLY))).toEqual([
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
        expect(TALOS_MOBILE_SETTINGS_TABS
            .filter((tab) => !(tab.id in MOBILE_ONLY))
            .map((tab) => tab.label)).toEqual([
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
        // Privacy is mobile-only (see MOBILE_ONLY) and is a real local panel:
        // it reads live device state rather than gating on a missing service.
        expect(available.map((tab) => tab.id))
            .toEqual(['models', 'ai_defaults', 'browser', 'appearance', 'privacy', 'account'])
    })
})
