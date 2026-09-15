// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import {
    handleTalosOverlayBack,
    talosOverlayBackActive,
    __resetTalosOverlayBackForTests,
} from '@/composables/useTalosOverlayBack'

/**
 * Found on the tablet 2026-08-03, walking the app as a person: with a
 * confirmation open, System Back walked straight past it to the station rule
 * and landed on the chat with the main menu open. The dialog looked dismissed,
 * but it had only vanished along with the screen that owned it — one tap from
 * an unfinished decision to somewhere else entirely.
 *
 * The dialog is shared, so this holds for every confirmation in the app rather
 * than for the one screen where it was noticed.
 */
beforeEach(() => {
    document.body.innerHTML = ''
    __resetTalosOverlayBackForTests()
})

describe('System Back and an open confirmation', () => {
    it('closes the dialog rather than navigating out from under it', () => {
        const wrapper = mount(TalosMobileConfirmDialog, {
            props: { title: 'Eliminare «Monte Bianco»?' },
        })

        expect(talosOverlayBackActive()).toBe(true)
        expect(handleTalosOverlayBack()).toBe(true)
        // The dialog asks its owner to close, which is the same path as Cancel:
        // Back must never be a third way of answering the question.
        expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('claims the Back key only while it is on screen', () => {
        // Otherwise a dismissed dialog would keep swallowing Back and the
        // person could not leave the screen at all.
        const wrapper = mount(TalosMobileConfirmDialog, { props: { title: 'x' } })
        expect(talosOverlayBackActive()).toBe(true)

        wrapper.unmount()
        expect(talosOverlayBackActive()).toBe(false)
        expect(handleTalosOverlayBack()).toBe(false)
    })

    it('peels the newest layer first, and never reaches past one still standing', () => {
        // Back ASKS the top layer to close; taking it off screen is its owner's
        // job. Until that happens the same layer keeps answering — which is the
        // safe direction, because falling through would navigate away from a
        // question the person has not answered.
        const first = mount(TalosMobileConfirmDialog, { props: { title: 'prima' } })
        const second = mount(TalosMobileConfirmDialog, { props: { title: 'seconda' } })

        handleTalosOverlayBack()
        expect(second.emitted('close')).toHaveLength(1)
        expect(first.emitted('close')).toBeUndefined()

        handleTalosOverlayBack()
        expect(second.emitted('close')).toHaveLength(2)
        expect(first.emitted('close')).toBeUndefined()

        // Once the owner takes it away, the one underneath is next.
        second.unmount()
        handleTalosOverlayBack()
        expect(first.emitted('close')).toHaveLength(1)
    })
})
