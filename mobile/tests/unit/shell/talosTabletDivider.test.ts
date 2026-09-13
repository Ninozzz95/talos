// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosTabletDivider from '@/components/shell/TalosTabletDivider.vue'
import {
    TALOS_TABLET_SIDEBAR_DEFAULT,
    TALOS_TABLET_SIDEBAR_MAX,
    TALOS_TABLET_SIDEBAR_MIN,
} from '@/lib/tabletLayout'

// F6 — the drag handle between the tablet chat panel and the content: a11y
// split-view contract (role=separator + value now/min/max), keyboard resize,
// pointer drag with live resize + commit on release, double-tap reset.
function mountDivider(width = 320) {
    return mount(TalosTabletDivider, { props: { width } })
}

describe('TalosTabletDivider (F6)', () => {
    it('is an accessible vertical separator exposing the width contract', () => {
        const wrapper = mountDivider(340)
        const handle = wrapper.get('[role="separator"]')
        expect(handle.attributes('aria-orientation')).toBe('vertical')
        expect(handle.attributes('aria-valuenow')).toBe('340')
        expect(handle.attributes('aria-valuemin')).toBe(String(TALOS_TABLET_SIDEBAR_MIN))
        expect(handle.attributes('aria-valuemax')).toBe(String(TALOS_TABLET_SIDEBAR_MAX))
        expect(handle.attributes('tabindex')).toBe('0')
    })

    it('arrow keys resize by 16px, clamped, and commit', async () => {
        const wrapper = mountDivider(320)
        const handle = wrapper.get('[role="separator"]')
        await handle.trigger('keydown', { key: 'ArrowRight' })
        expect(wrapper.emitted('resize')?.at(-1)).toEqual([336])
        await handle.trigger('keydown', { key: 'ArrowLeft' })
        expect(wrapper.emitted('resize')?.at(-1)).toEqual([304])
        expect(wrapper.emitted('commit')?.length).toBe(2)
        // Clamp at the min bound.
        const low = mountDivider(TALOS_TABLET_SIDEBAR_MIN)
        await low.get('[role="separator"]').trigger('keydown', { key: 'ArrowLeft' })
        expect(low.emitted('resize')?.at(-1)).toEqual([TALOS_TABLET_SIDEBAR_MIN])
    })

    it('SF6-F10: Home/End jump to the bounds, Enter restores the default', async () => {
        const wrapper = mountDivider(320)
        const handle = wrapper.get('[role="separator"]')
        await handle.trigger('keydown', { key: 'Home' })
        expect(wrapper.emitted('resize')?.at(-1)).toEqual([TALOS_TABLET_SIDEBAR_MIN])
        await handle.trigger('keydown', { key: 'End' })
        expect(wrapper.emitted('resize')?.at(-1)).toEqual([TALOS_TABLET_SIDEBAR_MAX])
        await handle.trigger('keydown', { key: 'Enter' })
        expect(wrapper.emitted('resize')?.at(-1)).toEqual([TALOS_TABLET_SIDEBAR_DEFAULT])
        expect(wrapper.emitted('commit')?.length).toBe(3)
    })

    it('SF6-F12: a bare tap (no movement) does NOT commit', async () => {
        const wrapper = mountDivider(320)
        const handle = wrapper.get('[role="separator"]').element as HTMLElement
        handle.dispatchEvent(new MouseEvent('pointerdown', { clientX: 320, bubbles: true }))
        handle.dispatchEvent(new MouseEvent('pointerup', { clientX: 320, bubbles: true }))
        expect(wrapper.emitted('commit')).toBeUndefined()
        expect(wrapper.emitted('resize')).toBeUndefined()
    })

    it('SF6-F8: two quick taps reset to the default (touch double-tap, no dblclick)', async () => {
        vi.useFakeTimers()
        try {
            const wrapper = mountDivider(460)
            const handle = wrapper.get('[role="separator"]').element as HTMLElement
            const tap = () => {
                handle.dispatchEvent(new MouseEvent('pointerdown', { clientX: 460, bubbles: true }))
                handle.dispatchEvent(new MouseEvent('pointerup', { clientX: 460, bubbles: true }))
            }
            tap()
            await vi.advanceTimersByTimeAsync(120)
            tap()
            expect(wrapper.emitted('resize')?.at(-1)).toEqual([TALOS_TABLET_SIDEBAR_DEFAULT])
            expect(wrapper.emitted('commit')?.length).toBe(1)
            // Two SLOW taps do nothing.
            const slow = mountDivider(460)
            const slowHandle = slow.get('[role="separator"]').element as HTMLElement
            const slowTap = () => {
                slowHandle.dispatchEvent(new MouseEvent('pointerdown', { clientX: 460, bubbles: true }))
                slowHandle.dispatchEvent(new MouseEvent('pointerup', { clientX: 460, bubbles: true }))
            }
            slowTap()
            await vi.advanceTimersByTimeAsync(600)
            slowTap()
            expect(slow.emitted('resize')).toBeUndefined()
        } finally {
            vi.useRealTimers()
        }
    })

    it('pointer drag emits live resize from the drag origin and commits on release', async () => {
        const wrapper = mountDivider(320)
        const handle = wrapper.get('[role="separator"]').element as HTMLElement
        // jsdom has no PointerEvent and test-utils cannot inject clientX —
        // dispatch real MouseEvents under the pointer names instead.
        const fire = (type: string, clientX: number) =>
            handle.dispatchEvent(new MouseEvent(type, { clientX, bubbles: true }))
        fire('pointerdown', 320)
        fire('pointermove', 380)
        expect(wrapper.emitted('resize')?.at(-1)).toEqual([380])
        fire('pointermove', 900)
        expect(wrapper.emitted('resize')?.at(-1)).toEqual([TALOS_TABLET_SIDEBAR_MAX])
        fire('pointerup', 900)
        expect(wrapper.emitted('commit')?.length).toBe(1)
    })

    it('double-click resets to the default width and commits', async () => {
        const wrapper = mountDivider(460)
        await wrapper.get('[role="separator"]').trigger('dblclick')
        expect(wrapper.emitted('resize')?.at(-1)).toEqual([TALOS_TABLET_SIDEBAR_DEFAULT])
        expect(wrapper.emitted('commit')?.length).toBe(1)
    })
})
