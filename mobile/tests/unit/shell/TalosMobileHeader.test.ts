// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileHeader from '@/components/shell/TalosMobileHeader.vue'

// F1-T3 — app-level header (D5): hamburger left, session title center.
// Owner 2026-07-24: RIGHT is the 3-dot chat options menu (shared with the
// immersive chrome), New chat lives inside it.
function mountHeader(props: Record<string, unknown> = {}) {
    return mount(TalosMobileHeader, {
        props: { title: 'Release review', creatingSession: false, canGoIncognito: false, ...props },
        attachTo: document.body,
    })
}

afterEach(() => { document.body.innerHTML = '' })

describe('TalosMobileHeader (F1-T3)', () => {
    it('renders hamburger (Open menu), centered truncated title and the 3-dot options', async () => {
        const wrapper = mountHeader()
        await vi.dynamicImportSettled()
        await flushPromises()
        expect(wrapper.find('[data-testid="talos-mobile-header"]').exists()).toBe(true)
        expect(wrapper.find('[aria-label="Open menu"]').exists()).toBe(true)
        expect(wrapper.get('[data-testid="talos-mobile-header-title"]').text()).toBe('Release review')
        expect(wrapper.find('[aria-label="Chat options"]').exists()).toBe(true)
        wrapper.unmount()
    })

    it('falls back to New chat when the title is blank', () => {
        const wrapper = mountHeader({ title: '   ' })
        expect(wrapper.get('[data-testid="talos-mobile-header-title"]').text()).toBe('New chat')
        wrapper.unmount()
    })

    it('emits openMenu from the hamburger and newChat from the options menu', async () => {
        const wrapper = mountHeader()
        await vi.dynamicImportSettled()
        await flushPromises()
        await wrapper.get('[aria-label="Open menu"]').trigger('click')
        expect(wrapper.emitted('openMenu')).toHaveLength(1)

        await wrapper.get('[aria-label="Chat options"]').trigger('click')
        const newChat = [...document.body.querySelectorAll('[role="menuitem"]')]
            .find((el) => el.textContent?.trim() === 'New chat') as HTMLElement
        newChat.click()
        expect(wrapper.emitted('newChat')).toHaveLength(1)
        wrapper.unmount()
    })

    /**
     * ⛔⛔ CORRETTO il 2026-08-20: la premessa di questo test era FALSA.
     *
     * Diceva «hides the options menu on tablet (the panel owns those
     * actions)». Misurato sul Pad, tablet con una conversazione aperta: il
     * riquadro destro non aveva niente — né titolo, né campanella, né centro
     * download, né rinomina/elimina/esporta/media/incognito. E il pannello
     * quelle voci **non le ha**: possiede l'hamburger e «Nuova chat», nulla
     * più. Erano semplicemente irraggiungibili sul tablet.
     *
     * ⇒ Le due domande adesso sono due proprietà. Questo test prova che
     * togliere l'hamburger **non** porta via anche le azioni — che è
     * esattamente ciò che succedeva.
     */
    it('⛔ togliere l\'hamburger NON porta via le azioni della chat', async () => {
        const wrapper = mountHeader({ hideMenu: true })
        await flushPromises()

        expect(wrapper.find('[aria-label="Open menu"]').exists()).toBe(false)
        expect(wrapper.find('[aria-label="Chat options"]').exists()).toBe(true)
        wrapper.unmount()
    })

    it('e chi le vuole togliere davvero lo dichiara', async () => {
        const wrapper = mountHeader({ hideMenu: true, hideActions: true })
        await flushPromises()

        expect(wrapper.find('[aria-label="Chat options"]').exists()).toBe(false)
        wrapper.unmount()
    })
})
