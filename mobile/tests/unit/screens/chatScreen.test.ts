import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { mount } from '@vue/test-utils'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'
import type { TalosMobilePromptEnhancementResult } from '@/lib/chat/promptEnhancement'

const mockState = vi.hoisted(() => ({
    controller: null as unknown,
    routerPush: vi.fn(),
    browserOpen: vi.fn(),
    browserClose: vi.fn(),
    browserDispose: vi.fn(),
    browserOnEvent: null as null | ((event: Record<string, unknown>) => void),
    settings: {
        state: {
            chat_layout: { message_style: 'sections' },
            shell: { immersive_header: false },
            motion_v6: { background_enabled: true, mode: 'off' },
            onboarding: { intro_version: 0, intro_outcome: null as string | null, setup_dismissed: false },
            browser: {
                schema_version: 1,
                hmi_mode: 'confirm_sensitive',
                presentation: 'isolated_webview',
                suggest_for_urls: true,
                developer_untrusted_evidence: false,
            },
        },
        setOnboarding: vi.fn(),
    },
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: mockState.routerPush }) }))
vi.mock('@/stores/chatController', () => ({ useChatController: () => mockState.controller }))
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => mockState.settings }))
vi.mock('@/services/inAppBrowserService', () => ({
    createTalosInAppBrowserService: (options: { onEvent?: (event: Record<string, unknown>) => void }) => {
        mockState.browserOnEvent = options.onEvent ?? null
        return {
            open: mockState.browserOpen,
            close: mockState.browserClose,
            dispose: mockState.browserDispose,
        }
    },
}))

import ChatScreen from '@/screens/ChatScreen.vue'

interface FakeMessage { id: string; role: 'user' | 'assistant' | 'system'; content: string; created_at: string; state: string; model_profile_id?: string | null; run_id?: string | null; metadata?: Record<string, unknown> }

function makeController(messages: FakeMessage[] = []) {
    const sessions = reactive<Array<{ id: string; title: string }>>([])
    const drafts = new Map<string, string>()
    const chat = {
        messages: reactive(messages.map((message) => ({
            ...message,
            model_profile_id: message.model_profile_id ?? null,
            run_id: message.run_id ?? null,
            metadata: message.metadata ?? {},
        }))),
        sessions,
        sessionBrowserActivities: reactive([]),
        activeSession: ref<{ id: string; title: string } | null>(null),
        state: reactive({
            sending: false,
            persistenceStatus: 'ready',
            persistenceError: null as string | null,
        }),
        retryPersistence: vi.fn().mockResolvedValue(undefined),
        recordBrowserActivity: vi.fn().mockResolvedValue(undefined),
        loadComposerDraft: vi.fn(async (scope?: string | null) => drafts.get(scope ?? 'new') ?? ''),
        saveComposerDraft: vi.fn(async (value: string, scope?: string | null) => {
            const key = scope ?? 'new'
            if (value) drafts.set(key, value)
            else drafts.delete(key)
        }),
    }
    const promptEnhancement = ref<TalosMobilePromptEnhancementResult | null>(null)
    const clearPromptEnhancement = vi.fn(() => { promptEnhancement.value = null })
    const attachmentItems = reactive<Array<Record<string, unknown>>>([])
    const attachmentError = ref<string | null>(null)
    const attachments = {
        items: attachmentItems,
        selecting: ref(false),
        error: attachmentError,
        hasAuthorized: ref(false),
        blocking: ref(false),
        bindings: ref([]),
        vaultFiles: reactive([]),
        vaultLoading: ref(false),
        vaultError: ref(null),
        initialize: vi.fn().mockResolvedValue(undefined),
        refreshVault: vi.fn().mockResolvedValue(undefined),
        selectFiles: vi.fn().mockResolvedValue(undefined),
        attachExisting: vi.fn().mockResolvedValue(true),
        remove: vi.fn().mockImplementation(async (id: string) => {
            const index = attachmentItems.findIndex((item) => item.id === id)
            if (index >= 0) attachmentItems.splice(index, 1)
        }),
        deleteVaultFile: vi.fn().mockResolvedValue(undefined),
        discardAll: vi.fn().mockResolvedValue(undefined),
        clearSent: vi.fn(() => attachmentItems.splice(0, attachmentItems.length)),
        clearError: vi.fn(() => { attachmentError.value = null }),
    }
    const browseMode = ref(false)
    const setBrowseMode = vi.fn(async (enabled: boolean) => {
        browseMode.value = enabled
        if (!chat.activeSession.value) {
            chat.activeSession.value = { id: 'browse-session', title: 'New chat', surface: enabled ? 'browse' : 'chat' }
        } else {
            ;(chat.activeSession.value as Record<string, unknown>).surface = enabled ? 'browse' : 'chat'
        }
    })
    return {
        catalogs: reactive({}),
        profiles: ref([]),
        selectedModelId: ref(null),
        effort: ref('high'),
        thinking: ref(false),
        canSend: ref(false),
        browseMode,
        sendDisabledReason: ref(''),
        enhancingPrompt: ref(false),
        promptEnhancement,
        promptEnhancementError: ref(null),
        attachments,
        chat,
        selectModel: vi.fn(),
        selectEffort: vi.fn(),
        setThinking: vi.fn(),
        setBrowseMode,
        init: vi.fn().mockResolvedValue(undefined),
        newSession: vi.fn().mockResolvedValue(undefined),
        selectSession: vi.fn().mockResolvedValue(undefined),
        renameSession: vi.fn().mockResolvedValue(undefined),
        deleteSession: vi.fn().mockResolvedValue(undefined),
        resendMessage: vi.fn().mockResolvedValue(undefined),
        retryAssistantMessage: vi.fn().mockResolvedValue(undefined),
        refreshConfiguredProviders: vi.fn().mockResolvedValue(undefined),
        preferenceError: ref(null),
        send: vi.fn().mockResolvedValue(true),
        enhancePrompt: vi.fn().mockResolvedValue(null),
        clearPromptEnhancement,
        __drafts: drafts,
    }
}

beforeEach(() => {
    mockState.routerPush.mockReset()
    mockState.browserOpen.mockReset().mockResolvedValue(undefined)
    mockState.browserClose.mockReset().mockResolvedValue(undefined)
    mockState.browserDispose.mockReset().mockResolvedValue(undefined)
    mockState.browserOnEvent = null
    mockState.settings.state.browser.suggest_for_urls = true
    mockState.settings.state.browser.presentation = 'isolated_webview'
    mockState.settings.state.browser.developer_untrusted_evidence = false
    mockState.settings.state.onboarding = { intro_version: 0, intro_outcome: null, setup_dismissed: false }
    mockState.settings.state.shell = { immersive_header: false }
    mockState.settings.setOnboarding.mockReset()
    mockState.controller = makeController()
})

afterEach(() => {
    document.body.innerHTML = ''
})

describe('ChatScreen (functional, local-first)', () => {
    it('BR-09 enables Browse and opens a detected URL without leaving the chat route', async () => {
        const controller = makeController()
        mockState.controller = controller
        mockState.browserOpen.mockImplementation(async (url: string) => {
            mockState.browserOnEvent?.({ type: 'opening', url, source: 'native' })
            mockState.browserOnEvent?.({ type: 'loaded', url, source: 'native' })
        })
        const wrapper = mount(ChatScreen)
        const field = wrapper.get('[aria-label="Message TALOS"]')
        await field.setValue('Apri https://example.com/path e dimmi cosa vedi')

        const suggestion = wrapper.get('[data-testid="talos-mobile-browser-url-suggestion"]')
        await wrapper.get('[aria-label="Enable Browse mode"]').trigger('click')
        expect(controller.setBrowseMode).toHaveBeenCalledWith(true)
        expect(mockState.routerPush).not.toHaveBeenCalled()

        await suggestion.get('button').trigger('click')
        await vi.waitFor(() => expect(mockState.browserOpen).toHaveBeenCalledWith(
            'https://example.com/path',
            'isolated_webview',
        ))
        await vi.waitFor(() => expect(controller.chat.recordBrowserActivity).toHaveBeenCalledTimes(2))
        expect(controller.chat.recordBrowserActivity).toHaveBeenCalledWith(
            'browse-session',
            expect.objectContaining({ operation: 'session_start', status: 'succeeded' }),
        )
        expect(controller.chat.recordBrowserActivity).toHaveBeenCalledWith(
            'browse-session',
            expect.objectContaining({ operation: 'navigate', status: 'succeeded' }),
        )
        expect(mockState.routerPush).not.toHaveBeenCalled()
    })

    it('executes slash Browse in the current chat and never opens another page', async () => {
        const controller = makeController()
        mockState.controller = controller
        const wrapper = mount(ChatScreen)
        wrapper.getComponent(TalosMobileComposer).vm.$emit('selectSlashCommand', 'open_browse')

        await vi.waitFor(() => expect(controller.setBrowseMode).toHaveBeenCalledWith(true))
        expect(mockState.routerPush).not.toHaveBeenCalled()
        expect(wrapper.get('[aria-label="Disable Browse mode"]').exists()).toBe(true)
    })
    it('shows the TALOS brand hero + welcome and docks the composer when empty', () => {
        const wrapper = mount(ChatScreen)
        expect(wrapper.find('[data-testid="talos-empty-brand"]').exists()).toBe(true)
        expect(wrapper.find('.talos-short-logo-mark').exists()).toBe(true)
        expect(wrapper.find('.talos-orbitron-brand').text()).toBe('TALOS')
        expect(wrapper.find('h1').text()).toBe('What claim should we benchmark?')
        expect(wrapper.find('[data-testid="talos-mobile-composer"]').exists()).toBe(true)
    })

    it('replaces the hero with the message thread once the conversation starts', () => {
        mockState.controller = makeController([
            { id: '1', role: 'user', content: 'benchmark this', created_at: '', state: 'persisted' },
            { id: '2', role: 'assistant', content: 'On it.', created_at: '', state: 'persisted' },
        ])
        const wrapper = mount(ChatScreen)
        expect(wrapper.find('[data-testid="talos-empty-brand"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-mobile-message-list"]').exists()).toBe(true)
        expect(wrapper.text()).toContain('benchmark this')
        expect(wrapper.text()).toContain('On it.')
    })

    it('wires the composer send (Enter) through to the controller with the typed prompt', async () => {
        const controller = makeController()
        controller.canSend = ref(true)
        mockState.controller = controller
        const wrapper = mount(ChatScreen)
        const textarea = wrapper.get('[aria-label="Message TALOS"]')
        await textarea.setValue('hello world')
        await textarea.trigger('keydown', { key: 'Enter' })
        await vi.waitFor(() => expect(controller.send).toHaveBeenCalledWith('hello world'))
    })

    it('wires the system picker and attachment tray actions through the shared controller', async () => {
        const controller = makeController()
        controller.attachments.items.push({
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
        })
        mockState.controller = controller
        const wrapper = mount(ChatScreen)

        expect(wrapper.get('[data-testid="talos-mobile-attachment-tray"]').text()).toContain('brief.txt')
        await wrapper.get('[aria-label="Attach a file"]').trigger('click')
        await wrapper.get('[aria-label="Remove brief.txt"]').trigger('click')
        expect(controller.attachments.selectFiles).toHaveBeenCalledOnce()
        expect(controller.attachments.remove).toHaveBeenCalledWith('draft-brief')
    })

    it('uses the compact empty-state presentation only while the attachment tray is expanded', async () => {
        const controller = makeController()
        controller.attachments.items.push({
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
        })
        mockState.controller = controller
        const wrapper = mount(ChatScreen)
        const hero = wrapper.get('[data-testid="talos-empty-brand"]')

        expect(hero.attributes('data-composer-expanded')).toBe('true')
        expect(hero.classes()).toContain('justify-start')
        expect(hero.find('h1').exists()).toBe(true)
        expect(hero.find('p').exists()).toBe(false)

        controller.attachments.items.splice(0, controller.attachments.items.length)
        await wrapper.vm.$nextTick()

        expect(hero.attributes('data-composer-expanded')).toBe('false')
        expect(hero.classes()).toContain('justify-center')
        expect(hero.find('p').exists()).toBe(true)
    })

    it('sends an authorized attachment without text and blocks a failed tray item', async () => {
        const controller = makeController()
        controller.canSend = ref(true)
        controller.attachments.items.push({
            id: 'draft-ready',
            source: 'vault',
            displayName: 'evidence.pdf',
            mediaType: 'application/pdf',
            sizeBytes: 4096,
            status: 'authorized',
            vaultFileId: 'vault-ready',
            grantId: 'grant-ready',
            bindingId: 'binding-ready',
            permissions: ['browser.upload', 'model.read'],
            error: null,
        })
        mockState.controller = controller
        const wrapper = mount(ChatScreen)

        await wrapper.get('[aria-label="Send message"]').trigger('click')
        await vi.waitFor(() => expect(controller.send).toHaveBeenCalledWith(''))

        controller.attachments.items.push({
            ...controller.attachments.items[0],
            id: 'draft-failed',
            displayName: 'spoofed.png',
            status: 'failed',
            error: 'TALOS_ATTACHMENT_SIGNATURE_MISMATCH',
        })
        await wrapper.vm.$nextTick()
        expect(wrapper.get<HTMLButtonElement>('[aria-label="Send message"]').element.disabled).toBe(true)
    })

    it('restores the active session draft after initialization', async () => {
        const controller = makeController()
        controller.chat.activeSession.value = { id: 'chat-draft', title: 'Draft chat' }
        controller.__drafts.set('chat-draft', 'Persisted mobile draft')
        mockState.controller = controller

        const wrapper = mount(ChatScreen)

        await vi.waitFor(() => {
            expect(wrapper.get<HTMLInputElement>('[aria-label="Message TALOS"]').element.value)
                .toBe('Persisted mobile draft')
        })
        expect(controller.chat.loadComposerDraft).toHaveBeenCalledWith('chat-draft')
    })

    it('restores the typed draft when persistence rejects a send', async () => {
        const controller = makeController()
        controller.canSend = ref(true)
        controller.send = vi.fn().mockResolvedValue(false)
        mockState.controller = controller
        const wrapper = mount(ChatScreen)
        const field = wrapper.get('[aria-label="Message TALOS"]')
        await field.setValue('Do not lose this')

        await field.trigger('keydown', { key: 'Enter' })
        await vi.waitFor(() => {
            expect(wrapper.get<HTMLInputElement>('[aria-label="Message TALOS"]').element.value)
                .toBe('Do not lose this')
        })
        expect(controller.send).toHaveBeenCalledWith('Do not lose this')
    })

    it('reuses a message prompt and focuses the composer', async () => {
        const controller = makeController([
            { id: 'user-1', role: 'user', content: 'Reuse this prompt', created_at: '', state: 'persisted' },
        ])
        mockState.controller = controller
        const wrapper = mount(ChatScreen, { attachTo: document.body })
        wrapper.getComponent(TalosMobileMessageList).vm.$emit('reuse', 'user-1')
        await wrapper.vm.$nextTick()

        const field = wrapper.get<HTMLTextAreaElement>('[aria-label="Message TALOS"]')
        expect(field.element.value).toBe('Reuse this prompt')
        expect(document.activeElement).toBe(field.element)
    })

    it('forwards resend and retry actions to the controller', async () => {
        const controller = makeController([
            { id: 'user-1', role: 'user', content: 'Prompt', created_at: '', state: 'persisted' },
            { id: 'assistant-1', role: 'assistant', content: 'Answer', created_at: '', state: 'persisted' },
        ])
        mockState.controller = controller
        const wrapper = mount(ChatScreen)
        wrapper.getComponent(TalosMobileMessageList).vm.$emit('resend', 'user-1')
        wrapper.getComponent(TalosMobileMessageList).vm.$emit('retry', 'assistant-1')
        await wrapper.vm.$nextTick()
        expect(controller.resendMessage).toHaveBeenCalledWith('user-1')
        expect(controller.retryAssistantMessage).toHaveBeenCalledWith('assistant-1')
    })

    it('exposes the orchestrated session actions to the app shell (F1-T3 header/sidebar)', async () => {
        const controller = makeController()
        controller.chat.sessions.push(
            { id: 'chat-2', title: 'Release review' },
            { id: 'chat-1', title: 'Architecture notes' },
        )
        controller.chat.activeSession.value = { id: 'chat-2', title: 'Release review' }
        mockState.controller = controller
        const wrapper = mount(ChatScreen, { attachTo: document.body })

        const exposed = wrapper.vm as unknown as { selectSession: (id: string) => void }
        exposed.selectSession('chat-1')
        await vi.waitFor(() => expect(controller.selectSession).toHaveBeenCalledWith('chat-1'))
        expect(controller.attachments.discardAll).toHaveBeenCalledTimes(1)
    })

    it('routes new, select, rename, and delete session actions to the controller', async () => {
        const controller = makeController()
        controller.chat.sessions.push({ id: 'chat-1', title: 'Architecture notes' })
        controller.chat.activeSession.value = { id: 'chat-1', title: 'Architecture notes' }
        mockState.controller = controller
        const wrapper = mount(ChatScreen, { attachTo: document.body })

        const exposed = wrapper.vm as unknown as {
            newSession: () => void
            renameSession: (id: string, title: string) => void
            deleteSession: (id: string) => void
        }
        exposed.newSession()
        await vi.waitFor(() => expect(controller.newSession).toHaveBeenCalledTimes(1))
        expect(controller.attachments.discardAll).toHaveBeenCalledTimes(1)

        exposed.renameSession('chat-1', 'Renamed notes')
        await vi.waitFor(() => expect(controller.renameSession).toHaveBeenCalledWith('chat-1', 'Renamed notes'))

        exposed.deleteSession('chat-1')
        await vi.waitFor(() => expect(controller.deleteSession).toHaveBeenCalledWith('chat-1'))
    })

    it('shows an actionable persistence failure and retries without opening Settings', async () => {
        const controller = makeController()
        controller.chat.state.persistenceStatus = 'error'
        controller.chat.state.persistenceError = 'Local chat storage is unavailable. sqlite locked'
        mockState.controller = controller
        const wrapper = mount(ChatScreen)

        expect(wrapper.get('[role="alert"]').text()).toContain('sqlite locked')
        await wrapper.get('[data-testid="talos-chat-storage-retry"]').trigger('click')
        expect(controller.chat.retryPersistence).toHaveBeenCalledTimes(1)
    })

    it('keeps Cancel byte-identical and applies Insert and Replace only on explicit choice', async () => {
        const controller = makeController()
        controller.promptEnhancement.value = {
            enhanced_prompt: 'Enhanced execution brief',
            summary: 'Added acceptance checks.',
            applied_principles: ['Acceptance checks'],
            model_profile_id: 'anthropic:claude-live',
            provider: 'anthropic',
            model: 'claude-live',
            enhancement_mode: 'model',
            original_prompt: 'Original bytes  ',
        }
        mockState.controller = controller
        const wrapper = mount(ChatScreen, { attachTo: document.body })
        const field = wrapper.get<HTMLTextAreaElement>('[aria-label="Message TALOS"]')
        const composer = wrapper.getComponent(TalosMobileComposer)
        await field.setValue('Original bytes  ')

        composer.vm.$emit('cancelPromptEnhancement')
        await vi.waitFor(() => expect(controller.clearPromptEnhancement).toHaveBeenCalledTimes(1))
        expect(field.element.value).toBe('Original bytes  ')

        controller.promptEnhancement.value = {
            ...controller.promptEnhancement.value,
            enhanced_prompt: 'Enhanced execution brief',
            summary: 'Added acceptance checks.',
            applied_principles: ['Acceptance checks'],
            model_profile_id: 'anthropic:claude-live',
            provider: 'anthropic',
            model: 'claude-live',
            enhancement_mode: 'model',
            original_prompt: 'Original bytes  ',
        }
        composer.vm.$emit('insertPromptEnhancement')
        await vi.waitFor(() => expect(field.element.value).toBe('Original bytes  \n\nEnhanced execution brief'))
        expect(controller.chat.saveComposerDraft).toHaveBeenLastCalledWith(
            'Original bytes  \n\nEnhanced execution brief',
            'new',
        )

        controller.promptEnhancement.value = {
            enhanced_prompt: 'Replacement brief',
            summary: '',
            applied_principles: [],
            model_profile_id: 'anthropic:claude-live',
            provider: 'anthropic',
            model: 'claude-live',
            enhancement_mode: 'model',
            original_prompt: field.element.value,
        }
        composer.vm.$emit('replacePromptEnhancement')
        await vi.waitFor(() => expect(field.element.value).toBe('Replacement brief'))
        expect(controller.chat.saveComposerDraft).toHaveBeenLastCalledWith('Replacement brief', 'new')
    })

    it('routes model and context slash commands and creates a durable new session', async () => {
        const controller = makeController()
        mockState.controller = controller
        const wrapper = mount(ChatScreen)
        const composer = wrapper.getComponent(TalosMobileComposer)
        const field = wrapper.get('[aria-label="Message TALOS"]')
        await vi.waitFor(() => expect(controller.chat.loadComposerDraft).toHaveBeenCalledWith('new'))

        await field.setValue('/model')
        composer.vm.$emit('selectSlashCommand', 'open_model_center')
        await vi.waitFor(() => expect(mockState.routerPush).toHaveBeenCalledWith({
            name: 'settings',
            query: { tab: 'models' },
        }))
        expect(field.element.value).toBe('')
        expect(controller.__drafts.has('new')).toBe(false)

        await field.setValue('/context')
        composer.vm.$emit('selectSlashCommand', 'open_context_vault')
        await vi.waitFor(() => expect(mockState.routerPush).toHaveBeenCalledWith({ name: 'context' }))

        await field.setValue('/new')
        composer.vm.$emit('selectSlashCommand', 'new_session')
        await vi.waitFor(() => expect(controller.newSession).toHaveBeenCalledTimes(1))
        expect(controller.clearPromptEnhancement).toHaveBeenCalled()
    })

    it('clears enhancement state on send and session ownership changes', async () => {
        const controller = makeController()
        controller.canSend = ref(true)
        controller.chat.sessions.push({ id: 'chat-1', title: 'Existing chat' })
        controller.chat.activeSession.value = { id: 'chat-1', title: 'Existing chat' }
        mockState.controller = controller
        const wrapper = mount(ChatScreen, { attachTo: document.body })

        const field = wrapper.get('[aria-label="Message TALOS"]')
        await field.setValue('send me')
        await field.trigger('keydown', { key: 'Enter' })
        await vi.waitFor(() => expect(controller.send).toHaveBeenCalled())

        ;(wrapper.vm as unknown as { newSession: () => void }).newSession()
        await vi.waitFor(() => expect(controller.newSession).toHaveBeenCalled())
        expect(controller.clearPromptEnhancement.mock.calls.length).toBeGreaterThanOrEqual(2)
    })
})

// F2-T6 — first-run setup checklist in the welcome state: REAL progress only
// (key present, model chosen), dismissible with persistence, no fake steps.
describe('welcome setup checklist (F2-T6)', () => {
    it('shows honest not-done steps when nothing is configured', () => {
        const wrapper = mount(ChatScreen)
        const checklist = wrapper.get('[data-testid="talos-setup-checklist"]')
        expect(checklist.text()).toContain('Add a provider key')
        expect(checklist.text()).toContain('Choose your model')
    })

    it('routes the key step to Settings → Models', async () => {
        const wrapper = mount(ChatScreen)
        await wrapper.get('[data-testid="talos-setup-step-key"]').trigger('click')
        expect(mockState.routerPush).toHaveBeenCalledWith({ name: 'settings', query: { tab: 'models' } })
    })

    it('hides when setup is genuinely complete', () => {
        const controller = makeController()
        controller.profiles.value = [{
            id: 'profile-a', provider: 'anthropic', model: 'claude', display_name: 'Claude',
            status: 'healthy', has_secret: true, effort_levels: ['high'], supports_thinking: true,
            show_in_composer: true, capabilities: null, probe_ok: true,
        }] as never
        controller.selectedModelId.value = 'profile-a' as never
        mockState.controller = controller
        const wrapper = mount(ChatScreen)
        expect(wrapper.find('[data-testid="talos-setup-checklist"]').exists()).toBe(false)
    })

    it('stays hidden once dismissed and persists the dismissal', async () => {
        const wrapper = mount(ChatScreen)
        await wrapper.get('[data-testid="talos-setup-dismiss"]').trigger('click')
        expect(mockState.settings.setOnboarding).toHaveBeenCalledWith({ setup_dismissed: true })

        mockState.settings.state.onboarding = { intro_version: 1, intro_outcome: 'completed', setup_dismissed: true }
        const fresh = mount(ChatScreen)
        expect(fresh.find('[data-testid="talos-setup-checklist"]').exists()).toBe(false)
    })
})

describe('immersive chrome clearance (F2 capture fix)', () => {
    it('adds top padding so messages never slide under the floating pills', () => {
        ;(mockState.settings.state as Record<string, unknown>).shell = { immersive_header: true }
        const wrapper = mount(ChatScreen)
        expect(wrapper.get('[data-testid="talos-chat-scroll"]').classes()).toContain('pt-[calc(3.5rem+env(safe-area-inset-top))]')
    })

    it('keeps the flush top under the classic header', () => {
        ;(mockState.settings.state as Record<string, unknown>).shell = { immersive_header: false }
        const wrapper = mount(ChatScreen)
        expect(wrapper.get('[data-testid="talos-chat-scroll"]').classes()).not.toContain('pt-[calc(3.5rem+env(safe-area-inset-top))]')
    })
})
