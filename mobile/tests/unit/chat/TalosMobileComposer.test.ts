import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type {
    TalosMobileModelProfileView,
    TalosMobileRoutingProfileView,
} from '@/components/chat/mobileChatTypes'

let wrapper: VueWrapper | null = null

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
})

const modelProfiles: TalosMobileModelProfileView[] = [{
    id: 'profile-deepseek',
    provider: 'deepseek',
    model: 'deepseek-chat',
    display_name: 'DeepSeek Chat',
    status: 'healthy',
    has_secret: true,
    effort_levels: ['low', 'medium', 'high'],
    supports_thinking: true,
    show_in_composer: true,
    capabilities: { vision: true },
    probe_ok: true,
}]

const routingProfiles: TalosMobileRoutingProfileView[] = [{
    id: 'route-balanced',
    name: 'Balanced routing',
    status: 'enabled',
    lane_count: 2,
}]

function mountComposer(overrides: Record<string, unknown> = {}): VueWrapper {
    wrapper = mount(TalosMobileComposer, {
        attachTo: document.body,
        props: {
            prompt: 'Keep this draft',
            modelProfiles,
            routingProfiles,
            selectedModelProfileId: 'profile-deepseek',
            selectedRoutingProfileId: null,
            selectedEffort: 'medium',
            thinking: false,
            canSend: true,
            sending: false,
            sendDisabledReason: '',
            ...overrides,
        },
    })
    return wrapper
}

describe('TalosMobileComposer', () => {
    it('exposes icon-only 44px controls and no compact composer control', () => {
        const view = mountComposer()
        const labels = [
            'Choose model profile',
            'Choose reasoning effort',
            'Attach a file',
            'Choose grounding context',
            'Open Model Lab',
            'Send message',
        ]

        for (const label of labels) {
            const control = view.get(`[aria-label="${label}"]`)
            expect(control.classes()).toContain('min-h-11')
            expect(control.classes()).toContain('min-w-11')
            expect(control.attributes('data-mobile-icon-only')).toBe('true')
        }
        expect(view.find('[aria-label="Minimize composer"]').exists()).toBe(false)
        expect(view.find('[aria-label="Compact composer"]').exists()).toBe(false)
        expect(view.get('textarea').classes()).toContain('max-h-48')
    })

    it('sends on Enter and preserves multiline input on Shift Enter', async () => {
        const view = mountComposer({ prompt: '' })
        const field = view.get<HTMLTextAreaElement>('textarea[aria-label="Message TALOS"]')

        await field.setValue('hello')
        await field.trigger('keydown', { key: 'Enter', shiftKey: false })
        expect(view.emitted('update:prompt')).toEqual([['hello']])
        expect(view.emitted('send')).toHaveLength(1)

        await field.setValue('hello\nworld')
        await field.trigger('keydown', { key: 'Enter', shiftKey: true })
        expect(view.emitted('send')).toHaveLength(1)
        expect(field.element.value).toBe('hello\nworld')
    })

    it('keeps the controlled draft after send until the owner updates it', async () => {
        const view = mountComposer()
        const field = view.get<HTMLTextAreaElement>('textarea[aria-label="Message TALOS"]')

        await view.get('[aria-label="Send message"]').trigger('click')

        expect(view.emitted('send')).toHaveLength(1)
        expect(view.emitted('update:prompt')).toBeUndefined()
        expect(field.element.value).toBe('Keep this draft')
    })

    it('disables send with an actionable reason and announces processing', async () => {
        const disabled = mountComposer({
            canSend: false,
            sendDisabledReason: 'Select a healthy model.',
        })
        const send = disabled.get<HTMLButtonElement>('[aria-label="Send message"]')
        expect(send.element.disabled).toBe(true)
        expect(send.attributes('title')).toBe('Select a healthy model.')
        expect(disabled.get('[role="status"]').text()).toBe('Select a healthy model.')

        await disabled.setProps({ canSend: true, sendDisabledReason: '', sending: true })
        expect(disabled.get('[role="status"]').text()).toBe('Processing')
        expect(disabled.get<HTMLButtonElement>('[aria-label="Send message"]').element.disabled).toBe(true)
    })

    it('opens both selectors, forwards selection, closes and restores trigger focus', async () => {
        const view = mountComposer()
        const modelTrigger = view.get<HTMLButtonElement>('[aria-label="Choose model profile"]')
        const effortTrigger = view.get<HTMLButtonElement>('[aria-label="Choose reasoning effort"]')

        await modelTrigger.trigger('click')
        expect(view.get('[data-testid="talos-mobile-composer-model-picker"]').exists()).toBe(true)
        await view.get('[data-model-profile-id="profile-deepseek"]').trigger('click')
        expect(view.emitted('selectModelProfile')).toEqual([['profile-deepseek']])
        expect(view.find('[data-testid="talos-mobile-composer-model-picker"]').exists()).toBe(false)
        expect(document.activeElement).toBe(modelTrigger.element)

        await effortTrigger.trigger('click')
        expect(view.get('[data-testid="talos-mobile-effort-picker"]').exists()).toBe(true)
        await view.get('[data-effort-level="high"]').trigger('click')
        expect(view.emitted('selectEffort')).toEqual([['high']])
        expect(view.find('[data-testid="talos-mobile-effort-picker"]').exists()).toBe(false)
        expect(document.activeElement).toBe(effortTrigger.element)
    })

    it('forwards file, Context and Model Lab intents without local persistence', async () => {
        const view = mountComposer()
        const file = new File(['local'], 'brief.txt', { type: 'text/plain' })
        const input = view.get<HTMLInputElement>('input[type="file"]')
        const inputClick = vi.spyOn(input.element, 'click')

        await view.get('[aria-label="Attach a file"]').trigger('click')
        expect(inputClick).toHaveBeenCalledOnce()

        Object.defineProperty(input.element, 'files', {
            configurable: true,
            value: [file],
        })
        await input.trigger('change')
        await view.get('[aria-label="Choose grounding context"]').trigger('click')
        await view.get('[aria-label="Open Model Lab"]').trigger('click')

        expect(view.emitted('attach')).toEqual([[[file]]])
        expect(view.emitted('openContext')).toHaveLength(1)
        expect(view.emitted('openModelLab')).toHaveLength(1)
    })
})
