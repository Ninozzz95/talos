import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type {
    TalosMobileModelProfileView,
    TalosMobileRoutingProfileView,
} from '@/components/chat/mobileChatTypes'
import type { TalosMobilePromptEnhancementResult } from '@/lib/chat/promptEnhancement'
import type { TalosMobileAttachmentDraft } from '@/composables/useTalosMobileAttachments'

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

const authorizedAttachment: TalosMobileAttachmentDraft = {
    id: 'draft-brief',
    source: 'picker',
    displayName: 'brief.txt',
    mediaType: 'text/plain',
    sizeBytes: 512,
    status: 'authorized',
    vaultFileId: 'vault-brief',
    grantId: 'grant-brief',
    bindingId: 'binding-brief',
    permissions: ['browser.upload', 'model.read'],
    error: null,
}

function mountComposer(overrides: Record<string, unknown> = {}): VueWrapper {
    wrapper = mount(TalosMobileComposer, {
        attachTo: document.body,
        global: { stubs: { teleport: true } },
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
    it('focusPrompt focuses the prompt field, which stays enabled while sending (F2 SF-critic #3)', async () => {
        const view = mountComposer()
        const api = view.vm as unknown as { focusPrompt(): boolean }
        const field = view.get<HTMLTextAreaElement>('[aria-label="Message TALOS"]')

        expect(api.focusPrompt()).toBe(true)
        expect(document.activeElement).toBe(field.element)

        // The textarea is never disabled during streaming: the user keeps
        // their keyboard and can compose the next message mid-response.
        await view.setProps({ sending: true })
        expect(field.element.disabled).toBe(false)
        expect(api.focusPrompt()).toBe(true)
        expect(document.activeElement).toBe(field.element)
    })

    it('exposes icon-only 44px controls and no compact composer control', () => {
        const view = mountComposer()
        const labels = [
            'Choose model profile',
            'Choose reasoning effort',
            'Improve prompt',
            'Attach a file',
            'Choose grounding context',
            'Enable Browse mode',
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

    it('BR-09 toggles Browse without navigating and opens the exact detected URL', async () => {
        const view = mountComposer({
            browseMode: false,
            browserSuggestionUrl: 'https://example.com/path',
        })

        const toggle = view.get('[aria-label="Enable Browse mode"]')
        expect(toggle.attributes('aria-pressed')).toBe('false')
        await toggle.trigger('click')
        expect(view.emitted('toggleBrowse')).toEqual([[true]])

        const suggestion = view.get('[data-testid="talos-mobile-browser-url-suggestion"]')
        expect(suggestion.text()).toContain('example.com/path')
        await suggestion.get('button').trigger('click')
        expect(view.emitted('openBrowserUrl')).toEqual([['https://example.com/path']])

        await view.setProps({ browseMode: true })
        expect(view.get('[aria-label="Disable Browse mode"]').attributes('aria-pressed')).toBe('true')
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
        // F2-T4: while sending, Send is replaced by an enabled Stop control.
        expect(disabled.find('[aria-label="Send message"]').exists()).toBe(false)
        expect(disabled.get<HTMLButtonElement>('[aria-label="Stop response"]').element.disabled).toBe(false)
    })

    it('opens both selectors, forwards selection, closes and restores trigger focus', async () => {
        const view = mountComposer()
        const modelTrigger = view.get<HTMLButtonElement>('[aria-label="Choose model profile"]')
        const effortTrigger = view.get<HTMLButtonElement>('[aria-label="Choose reasoning effort"]')

        await modelTrigger.trigger('click')
        // F4-#26: model + effort live in one dedicated bottom drawer.
        expect(view.get('[data-testid="talos-model-drawer"]').exists()).toBe(true)
        expect(view.get('[data-testid="talos-mobile-composer-model-picker"]').exists()).toBe(true)
        expect(view.get('[data-testid="talos-mobile-effort-picker"]').exists()).toBe(true)
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

    it('opens the native attachment bridge while keeping unavailable Context explicit', async () => {
        const view = mountComposer()

        expect(view.get<HTMLButtonElement>('[aria-label="Attach a file"]').element.disabled).toBe(false)
        expect(view.find('input[type="file"]').exists()).toBe(false)
        await view.get('[aria-label="Attach a file"]').trigger('click')
        expect(view.emitted('attach')).toHaveLength(1)
        expect(view.get<HTMLButtonElement>('[aria-label="Choose grounding context"]').element.disabled).toBe(true)
        expect(view.get('[aria-label="Choose grounding context"]').attributes('title')).toContain('Context')
    })

    it('forwards Context, catalog refresh, and Model Lab intents without a raw browser file input', async () => {
        const view = mountComposer({
            contextAvailable: true,
        })
        await view.get('[aria-label="Choose grounding context"]').trigger('click')
        await view.get('[aria-label="Choose model profile"]').trigger('click')
        await view.get('[aria-label="Refresh model catalog"]').trigger('click')
        await view.get('[aria-label="Open Model Lab"]').trigger('click')

        expect(view.emitted('openContext')).toHaveLength(1)
        expect(view.emitted('refreshModels')).toHaveLength(1)
        expect(view.emitted('openModelLab')).toHaveLength(1)
    })

    it('renders granted attachments and allows an attachment-only message only when the tray is ready', async () => {
        const view = mountComposer({
            prompt: '',
            attachments: [authorizedAttachment],
        })

        expect(view.get('[data-testid="talos-mobile-attachment-tray"]').text()).toContain('brief.txt')
        expect(view.get<HTMLButtonElement>('[aria-label="Send message"]').element.disabled).toBe(false)
        await view.get('[aria-label="Send message"]').trigger('click')
        expect(view.emitted('send')).toHaveLength(1)

        await view.setProps({ attachmentBusy: true })
        expect(view.get<HTMLButtonElement>('[aria-label="Send message"]').element.disabled).toBe(true)
    })

    it('forwards remove and dismiss events from the attachment tray', async () => {
        const view = mountComposer({
            attachments: [{
                ...authorizedAttachment,
                status: 'failed',
                error: 'TALOS_ATTACHMENT_ANALYSIS_FAILED',
            }],
            attachmentError: 'One file needs attention.',
        })

        await view.get('[aria-label="Remove brief.txt"]').trigger('click')
        await view.get('[aria-label="Dismiss attachment error"]').trigger('click')
        expect(view.emitted('removeAttachment')).toEqual([['draft-brief']])
        expect(view.emitted('dismissAttachmentError')).toHaveLength(1)
    })

    it('opens the lazy slash menu and supports Arrow Home End Escape and Enter', async () => {
        const view = mountComposer({ prompt: '/' })
        await flushPromises()
        const field = view.get<HTMLTextAreaElement>('textarea[aria-label="Message TALOS"]')

        await vi.waitFor(() => {
            expect(view.find('[data-testid="talos-mobile-slash-command-menu"]').exists()).toBe(true)
        })
        expect(view.get('[data-testid="talos-mobile-slash-command-menu"]').exists()).toBe(true)
        expect(view.findAll('[role="option"]')[0]?.attributes('aria-selected')).toBe('true')

        await field.trigger('keydown', { key: 'ArrowDown' })
        expect(view.findAll('[role="option"]')[1]?.attributes('aria-selected')).toBe('true')
        await field.trigger('keydown', { key: 'End' })
        expect(view.findAll('[role="option"]').at(-1)?.attributes('aria-selected')).toBe('true')
        await field.trigger('keydown', { key: 'Home' })
        expect(view.findAll('[role="option"]')[0]?.attributes('aria-selected')).toBe('true')
        await field.trigger('keydown', { key: 'Enter' })
        expect(view.emitted('selectSlashCommand')).toEqual([['new_session']])

        await view.setProps({ prompt: '/model' })
        await field.trigger('keydown', { key: 'Escape' })
        expect(view.emitted('update:prompt')?.at(-1)).toEqual([''])
    })

    it('never activates a disabled slash command or breaks normal Enter Shift Enter and IME', async () => {
        const view = mountComposer({ prompt: '/file' })
        await flushPromises()
        const field = view.get<HTMLTextAreaElement>('textarea[aria-label="Message TALOS"]')

        await vi.waitFor(() => expect(view.find('[role="option"]').exists()).toBe(true))
        expect(view.get('[role="option"]').attributes('aria-disabled')).toBe('true')
        await field.trigger('keydown', { key: 'Enter' })
        expect(view.emitted('selectSlashCommand')).toBeUndefined()
        expect(view.emitted('send')).toBeUndefined()
        expect(view.emitted('update:prompt')).toBeUndefined()

        await view.setProps({ prompt: 'normal message' })
        await field.trigger('keydown', { key: 'Enter', shiftKey: true })
        await field.trigger('keydown', { key: 'Enter', isComposing: true })
        expect(view.emitted('send')).toBeUndefined()
        await field.trigger('keydown', { key: 'Enter' })
        expect(view.emitted('send')).toHaveLength(1)
    })

    it('exposes the 44px improve control and lazy loading error result and decision states', async () => {
        const result: TalosMobilePromptEnhancementResult = {
            enhanced_prompt: 'Improved draft',
            summary: 'Made it actionable.',
            applied_principles: ['Clear objective'],
            model_profile_id: 'profile-deepseek',
            provider: 'deepseek',
            model: 'deepseek-chat',
            enhancement_mode: 'model',
            original_prompt: 'Keep this draft',
        }
        const view = mountComposer()
        const improve = view.get<HTMLButtonElement>('[aria-label="Improve prompt"]')

        expect(improve.classes()).toContain('min-h-11')
        expect(improve.classes()).toContain('min-w-11')
        await improve.trigger('click')
        expect(view.emitted('enhancePrompt')).toHaveLength(1)
        // F4-#26: the enhancement flow lives in its own dedicated drawer.
        expect(view.get('[data-testid="talos-enhancer-drawer"]').exists()).toBe(true)

        await view.setProps({ enhancingPrompt: true })
        expect(view.get('[data-testid="talos-mobile-enhancer-status"]').text()).toMatch(/improving prompt/i)
        expect(view.get<HTMLButtonElement>('[aria-label="Improve prompt"]').element.disabled).toBe(true)

        await view.setProps({ enhancingPrompt: false, promptEnhancementError: 'Provider format was invalid.' })
        expect(view.get('[data-testid="talos-mobile-enhancer-error"]').text()).toContain('Provider format was invalid.')

        await view.setProps({ promptEnhancementError: '', promptEnhancement: result })
        await flushPromises()
        await vi.waitFor(() => {
            expect(view.find('[data-testid="talos-mobile-prompt-enhancer-popover"]').exists()).toBe(true)
        })
        expect(view.get('[data-testid="talos-mobile-prompt-enhancer-popover"]').text()).toContain('Improved draft')
        await view.get('[data-enhancement-decision="cancel"]').trigger('click')
        await view.get('[data-enhancement-decision="insert"]').trigger('click')
        await view.get('[data-enhancement-decision="replace"]').trigger('click')
        expect(view.emitted('cancelPromptEnhancement')).toHaveLength(1)
        expect(view.emitted('insertPromptEnhancement')).toHaveLength(1)
        expect(view.emitted('replacePromptEnhancement')).toHaveLength(1)
    })
})
