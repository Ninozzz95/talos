// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

const profile: TalosMobileModelProfileView = {
    id: 'profile-gemini',
    provider: 'gemini',
    model: 'gemini-live',
    display_name: 'Gemini Live',
    status: 'healthy',
    has_secret: true,
    effort_levels: [],
    supports_thinking: false,
    show_in_composer: true,
    capabilities: null,
    probe_ok: true,
}

function pointerdown(x = 100, y = 100, type = 'pointerdown'): MouseEvent {
    const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: x,
        clientY: y,
    })
    Object.defineProperty(event, 'pointerId', { value: 7 })
    return event
}

describe('composer sheet pointer ownership', () => {
    it('does not capture pointerdown from a drawer tab, so the tab keeps its click', async () => {
        const wrapper = mount(TalosMobileComposer, {
            attachTo: document.body,
            global: { stubs: { teleport: true } },
            props: {
                prompt: 'Improve this prompt',
                modelProfiles: [profile],
                routingProfiles: [],
                selectedModelProfileId: profile.id,
                selectedRoutingProfileId: null,
                selectedEffort: 'high',
                thinking: false,
                canSend: true,
                sending: false,
                sendDisabledReason: '',
                dictationSupported: true,
            },
        })

        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        await vi.dynamicImportSettled()
        await flushPromises()
        await vi.waitFor(() => {
            expect(wrapper.find('[data-testid="talos-composer-drawer"]').exists()).toBe(true)
        })

        const sheet = wrapper.get<HTMLElement>('[data-testid="talos-composer-drawer"]')
        const capture = vi.fn()
        Object.defineProperty(sheet.element, 'setPointerCapture', {
            configurable: true,
            value: capture,
        })

        const create = wrapper.get<HTMLElement>('[data-testid="talos-drawer-tab-create"]')
        create.element.dispatchEvent(pointerdown())
        expect(capture).not.toHaveBeenCalled()

        create.element.dispatchEvent(pointerdown(100, 100, 'pointerup'))
        await create.trigger('click')
        await nextTick()
        // The sliding indicator can replace the tab node: inspect the live DOM.
        expect(wrapper.get('[data-testid="talos-drawer-tab-create"]').attributes('aria-selected')).toBe('true')
        expect(wrapper.find('[data-testid="talos-drawer-enhance"]').exists()).toBe(true)

        wrapper.unmount()
    })
})

/*
 * ⛔ SHEET-SLIDER-01 (Pad, 27/10/2026, dito vero con `adb shell input swipe` sul mockup del compositore): lo slider del
 * ragionamento si illuminava ma non scorreva. Il foglio cattura il puntatore per chiudersi tirandolo in giù su tutto ciò che
 * `bersaglioInterattivo` non conosce, e `[role="slider"]` non c'era: il trascinamento finiva al foglio.
 */
describe('SHEET-SLIDER-01 il foglio lascia il dito agli slider', () => {
    async function foglioCon(html: string) {
        const { default: Foglio } = await import('@/components/chat/TalosMobileComposerSheet.vue')
        const wrapper = mount(Foglio, {
            attachTo: document.body,
            global: { stubs: { teleport: true } },
            props: { title: 'Modello', testid: 'foglio-prova' },
            slots: { default: html },
        })
        const foglio = wrapper.get<HTMLElement>('[data-testid="foglio-prova"]')
        const cattura = vi.fn()
        Object.defineProperty(foglio.element, 'setPointerCapture', { configurable: true, value: cattura })
        return { wrapper, cattura }
    }

    it('un pointerdown sul pollice di uno slider non cattura il puntatore', async () => {
        const { wrapper, cattura } = await foglioCon('<div data-testid="pista"><span role="slider" data-testid="pollice" tabindex="0" aria-valuenow="2"></span></div>')
        wrapper.get('[data-testid="pollice"]').element.dispatchEvent(pointerdown())
        expect(cattura).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('controllo: su una zona non interattiva del foglio il gesto di chiusura cattura ancora', async () => {
        const { wrapper, cattura } = await foglioCon('<p data-testid="testo">Solo testo</p>')
        wrapper.get('[data-testid="testo"]').element.dispatchEvent(pointerdown())
        expect(cattura).toHaveBeenCalledWith(7)
        wrapper.unmount()
    })
})
