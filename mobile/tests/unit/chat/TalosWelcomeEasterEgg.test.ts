// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosWelcomeEasterEgg from '@/components/chat/TalosWelcomeEasterEgg.vue'
import type { TalosWelcomeEasterEggKind } from '@/lib/welcome/catalog'

describe('TalosWelcomeEasterEgg', () => {
    it.each([
        ['party-popper', 'lucide-party-popper'],
        ['heart', 'lucide-heart'],
        ['ghost', 'lucide-ghost'],
        ['snowflake', 'lucide-snowflake'],
        ['gift', 'lucide-gift'],
        ['clock', 'lucide-clock'],
    ] as const)('WELCOME-EGG-01 maps %s to exactly one %s icon', (kind, iconClass) => {
        const wrapper = mount(TalosWelcomeEasterEgg, {
            props: { kind: kind as TalosWelcomeEasterEggKind },
        })

        const decoration = wrapper.get('[data-testid="talos-welcome-easter-egg"]')
        expect(decoration.attributes('data-welcome-easter-egg')).toBe(kind)
        expect(decoration.findAll('svg')).toHaveLength(1)
        expect(decoration.get(`svg.${iconClass}`).exists()).toBe(true)
    })

    it('WELCOME-EGG-02 renders null as no DOM and keeps every decoration static and inaccessible', () => {
        const empty = mount(TalosWelcomeEasterEgg, { props: { kind: null } })
        expect(empty.find('[data-testid="talos-welcome-easter-egg"]').exists()).toBe(false)

        const wrapper = mount(TalosWelcomeEasterEgg, { props: { kind: 'gift' } })
        const decoration = wrapper.get('[data-testid="talos-welcome-easter-egg"]')
        expect(decoration.attributes('aria-hidden')).toBe('true')
        expect(decoration.attributes('role')).toBeUndefined()
        expect(decoration.attributes('tabindex')).toBeUndefined()
        expect(decoration.classes()).toContain('pointer-events-none')
        expect(decoration.classes()).toContain('size-5')
        expect(decoration.classes().some(name => name.startsWith('animate-'))).toBe(false)
        expect(decoration.text()).toBe('')
    })
})
