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
                drawerMode: true,
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
