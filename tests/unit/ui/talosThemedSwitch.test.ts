// @vitest-environment jsdom

/**
 * The contract of the one switch.
 *
 * These are not tests of appearance. Each one pins a rule that the 2026-08-02
 * research established and that the three implementations it replaces broke in
 * at least one place: it must announce itself as a switch, its name must not
 * move with its state, and it must never flip itself when the owner of the
 * value has not agreed — because saving a preference can fail, and a control
 * that shows a value nobody stored is a lie told by the interface.
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosThemedSwitch from '@/components/talos/ui/TalosThemedSwitch.vue'

function mountSwitch(props: Record<string, unknown> = {}) {
    return mount(TalosThemedSwitch, {
        props: { modelValue: false, ariaLabel: 'Ricerca web', ...props },
        attachTo: document.body,
    })
}

describe('TalosThemedSwitch', () => {
    it('announces itself as a switch, with its state, to a screen reader', () => {
        const off = mountSwitch()
        const control = off.get('[data-testid="talos-themed-switch"]')

        expect(control.attributes('role')).toBe('switch')
        expect(control.attributes('aria-checked')).toBe('false')
        expect(control.attributes('aria-label')).toBe('Ricerca web')

        const on = mountSwitch({ modelValue: true })
        expect(on.get('[data-testid="talos-themed-switch"]').attributes('aria-checked')).toBe('true')
    })

    it('keeps the same name whether it is on or off', () => {
        // APG: it is critical that the label does not change with the state.
        // "Attivo"/"Disattivo" as a name would make this one control read as two.
        const off = mountSwitch()
        const on = mountSwitch({ modelValue: true })

        expect(on.get('[data-testid="talos-themed-switch"]').attributes('aria-label'))
            .toBe(off.get('[data-testid="talos-themed-switch"]').attributes('aria-label'))
    })

    it('reports the intent but does not move until the owner of the value agrees', async () => {
        const wrapper = mountSwitch()

        await wrapper.get('[data-testid="talos-themed-switch"]').trigger('click')

        // The intent reached the parent...
        expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
        // ...and the control still shows the value it was given, because the
        // parent has not given it a new one. A save that fails must not leave a
        // switch showing something that was never stored.
        expect(wrapper.get('[data-testid="talos-themed-switch"]').attributes('aria-checked')).toBe('false')

        await wrapper.setProps({ modelValue: true })
        expect(wrapper.get('[data-testid="talos-themed-switch"]').attributes('aria-checked')).toBe('true')
    })

    it('refuses the touch when disabled, and says so', async () => {
        const wrapper = mountSwitch({ disabled: true })
        const control = wrapper.get('[data-testid="talos-themed-switch"]')

        expect(control.attributes('disabled')).toBeDefined()
        await control.trigger('click')
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('offers a touch target the finger can actually hit', () => {
        // WCAG 2.5.8 asks for 24x24 CSS px as a minimum; the classes carry
        // h-6 w-11, which is 24x44 — the height is exactly at the floor, and
        // callers that place it in a row are expected to give it a 44px line.
        const control = mountSwitch().get('[data-testid="talos-themed-switch"]')
        expect(control.classes()).toContain('h-6')
        expect(control.classes()).toContain('w-11')
    })
})
