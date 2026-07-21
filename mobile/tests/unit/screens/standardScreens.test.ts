import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ResearchScreen from '@/screens/ResearchScreen.vue'
import RunsScreen from '@/screens/RunsScreen.vue'
import ContextScreen from '@/screens/ContextScreen.vue'
import SettingsScreen from '@/screens/SettingsScreen.vue'

describe('standard tab screens (verbatim desktop parity, step-1 empty states)', () => {
    it('research: Deep Research V3 header + Deep research eyebrow + real empty copy', () => {
        const w = mount(ResearchScreen)
        expect(w.get('[data-testid="mobile-screen-title"]').text()).toBe('Deep Research V3')
        expect(w.get('[data-testid="mobile-screen-eyebrow"]').text()).toContain('Deep research')
        expect(w.text()).toContain('Queue or select a report to inspect source status, claims, graph evidence, and artifacts.')
    })

    it('runs: Runtime cockpit header + Runtime eyebrow + real empty copy', () => {
        const w = mount(RunsScreen)
        expect(w.get('[data-testid="mobile-screen-title"]').text()).toBe('Runtime cockpit')
        expect(w.get('[data-testid="mobile-screen-eyebrow"]').text()).toContain('Runtime')
        expect(w.text()).toContain('No execution runs returned by the run API yet.')
    })

    it('context: Library header + Context Vault eyebrow + section tabs + real empty copy', () => {
        const w = mount(ContextScreen)
        expect(w.get('[data-testid="mobile-screen-title"]').text()).toBe('Library')
        expect(w.get('[data-testid="mobile-screen-eyebrow"]').text()).toContain('Context Vault')
        expect(w.text()).toContain('Context Vault')
        expect(w.text()).toContain('Documents')
        expect(w.text()).toContain('No context sets returned by `/api/talos/context-sets`.')
    })

    it('settings: Settings Center header + Protected preferences eyebrow + full tab list', () => {
        const w = mount(SettingsScreen)
        expect(w.get('[data-testid="mobile-screen-title"]').text()).toBe('Settings Center')
        expect(w.get('[data-testid="mobile-screen-eyebrow"]').text()).toContain('Protected preferences')
        for (const label of ['Models', 'AI Defaults', 'Search', 'Browser', 'Integrations', 'Email', 'Reminders', 'Appearance', 'Shortcuts', 'Account', 'Agent Tools', 'System']) {
            expect(w.text()).toContain(label)
        }
    })
})
