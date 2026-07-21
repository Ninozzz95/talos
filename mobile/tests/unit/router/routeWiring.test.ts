import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { TALOS_MOBILE_ROUTES } from '@/lib/mobileRoutes'

// Each tab route must load its real parity screen, not the old title-only placeholder.
const MARKER: Record<string, (text: string) => boolean> = {
    chat: (t) => t.includes('TALOS') && t.includes('What claim should we benchmark?'),
    research: (t) => t.includes('Deep Research V3'),
    runs: (t) => t.includes('Runtime cockpit'),
    context: (t) => t.includes('Library'),
    settings: (t) => t.includes('Settings Center'),
}

describe('router wiring', () => {
    it('resolves each of the 5 tab routes to its real parity screen', async () => {
        expect(TALOS_MOBILE_ROUTES.map((r) => r.name)).toEqual(['chat', 'research', 'runs', 'context', 'settings'])
        for (const route of TALOS_MOBILE_ROUTES) {
            const component = await route.component()
            const w = mount(component)
            expect(MARKER[route.name](w.text()), `${route.name} screen`).toBe(true)
        }
    })
})
