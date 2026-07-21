import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileRail from '@/components/shell/TalosMobileRail.vue'

describe('TalosMobileRail (desktop mobile-chrome mirror)', () => {
    it('renders New Chat + Chat + the 4 station icon buttons with labels', () => {
        const w = mount(TalosMobileRail, { props: { activeRoute: 'chat' } })
        for (const label of ['New Chat', 'Chat', 'Research', 'Cockpit', 'Library', 'Settings']) {
            expect(w.find(`[aria-label="${label}"]`).exists(), label).toBe(true)
        }
    })

    it('marks only the active route as pressed', () => {
        const w = mount(TalosMobileRail, { props: { activeRoute: 'runs' } })
        expect(w.get('[aria-label="Cockpit"]').attributes('aria-pressed')).toBe('true')
        expect(w.get('[aria-label="Research"]').attributes('aria-pressed')).toBe('false')
        expect(w.get('[aria-label="Chat"]').attributes('aria-pressed')).toBe('false')
    })

    it('emits navigate with the target route name', async () => {
        const w = mount(TalosMobileRail, { props: { activeRoute: 'chat' } })
        await w.get('[aria-label="Research"]').trigger('click')
        expect(w.emitted('navigate')?.[0]).toEqual(['research'])
        await w.get('[aria-label="Chat"]').trigger('click')
        expect(w.emitted('navigate')?.[1]).toEqual(['chat'])
    })

    it('emits newChat from the New Chat action', async () => {
        const w = mount(TalosMobileRail, { props: { activeRoute: 'chat' } })
        await w.get('[aria-label="New Chat"]').trigger('click')
        expect(w.emitted('newChat')).toHaveLength(1)
    })
})
