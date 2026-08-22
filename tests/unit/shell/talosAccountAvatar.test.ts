// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// Cleanup pass 2026-07-24: the accent avatar chip was copy-pasted at three
// sizes across the sidebar, the settings category card and the account panel
// (already drifting). It is now ONE component reading the account initial.
vi.mock('@/stores/account', () => ({
    useTalosAccountStore: () => ({ initial: { value: 'A' } }),
}))

import TalosAccountAvatar from '@/components/talos/TalosAccountAvatar.vue'

describe('TalosAccountAvatar', () => {
    it('renders the account initial from the store', () => {
        expect(mount(TalosAccountAvatar).text()).toBe('A')
    })

    it('maps the size prop to the chip dimension (default md)', () => {
        expect(mount(TalosAccountAvatar).get('span').classes()).toContain('size-10')
        expect(mount(TalosAccountAvatar, { props: { size: 'sm' } }).get('span').classes()).toContain('size-9')
        expect(mount(TalosAccountAvatar, { props: { size: 'lg' } }).get('span').classes()).toContain('size-12')
    })

    it('is a decorative chip (aria-hidden) — the labelled control around it names it', () => {
        expect(mount(TalosAccountAvatar).get('span').attributes('aria-hidden')).toBe('true')
    })

    it('renders the `initial` prop override (wizard live preview) over the store value', () => {
        expect(mount(TalosAccountAvatar, { props: { initial: 'Z' } }).text()).toBe('Z')
    })
})
