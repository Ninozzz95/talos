// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import TalosMobileDeleteChatDialog from '@/components/shell/TalosMobileDeleteChatDialog.vue'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'
import type { TalosSessionCleanupPlan } from '@/lib/chat/sessionCleanup'

/**
 * Owner 2026-07-26: "quando cancelli una chat non ti cancella i relativi
 * documenti in libreria — metti alert modal … con casella cancella anche
 * relativo media con loading di cancellazione".
 */
function file(id: string): TalosLocalVaultFile {
    return { id, display_name: `${id}.pdf` } as TalosLocalVaultFile
}

const EMPTY: TalosSessionCleanupPlan = { documents: [], sources: [] }
const FULL: TalosSessionCleanupPlan = { documents: [file('a'), file('b')], sources: [file('c')] }

// The dialog teleports to <body>, so a wrapper left mounted stays in the DOM and
// the next test's document.querySelector finds the PREVIOUS dialog's button.
let open: VueWrapper | null = null
afterEach(() => { open?.unmount(); open = null })

function mountDialog(plan: TalosSessionCleanupPlan, busy = false) {
    open = mount(TalosMobileDeleteChatDialog, {
        props: { title: 'Aurora Coffee', plan, busy },
        attachTo: document.body,
    })
    return open
}

const CHECKBOX = '[data-testid="talos-delete-chat-media"]'
const CONFIRM = '[data-testid="talos-session-delete-confirm"]'

describe('deleting a chat, and what it takes with it', () => {
    it('offers nothing to check when the chat produced nothing', () => {
        // "Also delete 0 files" is not a choice, it is noise — and noise is what
        // teaches people to dismiss the row on the day it matters.
        mountDialog(EMPTY)
        expect(document.querySelector(CHECKBOX)).toBeNull()
    })

    it('names what would go, and leaves the box UNCHECKED', () => {
        mountDialog(FULL)
        const row = document.querySelector(CHECKBOX)
        expect(row?.textContent).toContain('2 documents and 1 saved page')
        expect(row?.querySelector<HTMLInputElement>('input')?.checked).toBe(false)
    })

    it('deletes only the chat unless the box is ticked', async () => {
        const wrapper = mountDialog(FULL)
        ;(document.querySelector(CONFIRM) as HTMLElement).click()
        await wrapper.vm.$nextTick()
        expect(wrapper.emitted('confirm')).toEqual([[{ deleteMedia: false }]])
    })

    it('takes the files when it is ticked', async () => {
        const wrapper = mountDialog(FULL)
        const box = document.querySelector(CHECKBOX)!.querySelector('input')!
        box.checked = true
        box.dispatchEvent(new Event('change'))
        await wrapper.vm.$nextTick()
        ;(document.querySelector(CONFIRM) as HTMLElement).click()
        await wrapper.vm.$nextTick()
        expect(wrapper.emitted('confirm')).toEqual([[{ deleteMedia: true }]])
    })

    it('stays up and says it is working, instead of vanishing', async () => {
        const wrapper = mountDialog(FULL)
        ;(document.querySelector(CONFIRM) as HTMLElement).click()
        await wrapper.vm.$nextTick()
        // The parent has taken the work: that, and only that, is what the
        // spinner reports. A spinner with no work behind it is a lie.
        await wrapper.setProps({ busy: true })

        const button = document.querySelector(CONFIRM) as HTMLButtonElement
        expect(button.textContent).toContain('Deleting')
        expect(button.disabled).toBe(true)
        // A second tap must not delete twice.
        button.click()
        await wrapper.vm.$nextTick()
        expect(wrapper.emitted('confirm')).toHaveLength(1)
        // Nor may a tap outside abandon a deletion already in flight.
        expect(wrapper.emitted('close')).toBeUndefined()
    })

    it('is never a trap when the parent does nothing at all', async () => {
        // SF-critic 2026-07-26, BLOCKER: the only exit was a busy true->false
        // edge. A handler that refuses the work (no active session, an action
        // already in flight, a persistence error pinning `busy` true) never
        // produced that edge, and Cancel/confirm/Escape/backdrop were ALL
        // disabled while it waited — the app was unusable until force-killed.
        const wrapper = mountDialog(FULL)
        ;(document.querySelector(CONFIRM) as HTMLElement).click()
        await wrapper.vm.$nextTick()

        // No busy edge ever arrives. Cancel must still work.
        const cancel = [...document.querySelectorAll('button')]
            .find((button) => button.textContent?.includes('Cancel')) as HTMLButtonElement
        expect(cancel.disabled).toBe(false)
        cancel.click()
        await wrapper.vm.$nextTick()
        expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('refuses to start while the shell is already busy', async () => {
        // The parents all early-return when another action is in flight. Left
        // enabled, the button "succeeded" silently: nothing was deleted, and
        // when the UNRELATED action finished, the busy edge closed the dialog
        // as if the chat had gone.
        const wrapper = mountDialog(FULL, true)
        const button = document.querySelector(CONFIRM) as HTMLButtonElement
        expect(button.disabled).toBe(true)
        button.click()
        await wrapper.vm.$nextTick()
        expect(wrapper.emitted('confirm')).toBeUndefined()
    })

    it('keeps the choice when the Library changes underneath it', async () => {
        // The plan is a computed over a reactive array: any refreshVault — a
        // tool saving a document — hands over a NEW object with the same
        // contents. Resetting on identity silently unticked the box the user
        // had ticked, and only the chat went.
        const wrapper = mountDialog(FULL)
        const box = document.querySelector(CHECKBOX)!.querySelector('input')!
        box.checked = true
        box.dispatchEvent(new Event('change'))
        await wrapper.vm.$nextTick()

        await wrapper.setProps({ plan: { documents: [file('a'), file('b')], sources: [file('c')] } })
        ;(document.querySelector(CONFIRM) as HTMLElement).click()
        await wrapper.vm.$nextTick()
        expect(wrapper.emitted('confirm')).toEqual([[{ deleteMedia: true }]])
    })

    it('closes itself once the deletion is over', async () => {
        const wrapper = mountDialog(FULL, false)
        ;(document.querySelector(CONFIRM) as HTMLElement).click()
        await wrapper.vm.$nextTick()

        await wrapper.setProps({ busy: true })
        expect(wrapper.emitted('close')).toBeUndefined()
        await wrapper.setProps({ busy: false })
        expect(wrapper.emitted('close')).toHaveLength(1)
    })
})
