<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { AlertTriangle, Globe2 } from '@lucide/vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import TalosMobileChatHeader from '@/components/chat/TalosMobileChatHeader.vue'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'
import TalosMobileSessionDrawer from '@/components/chat/TalosMobileSessionDrawer.vue'
import { createTalosMobileComposerDraftController } from '@/composables/useTalosMobileComposerDraft'
import {
    createTalosManualBrowserActivity,
    extractTalosBrowserUrls,
} from '@/lib/browser/browserEvidence'
import type { TalosMobileCommandId } from '@/lib/mobileCommandRegistry'
import { newTalosMobileId } from '@/lib/mobileIds'
import {
    createTalosInAppBrowserService,
    type TalosInAppBrowserEvent,
} from '@/services/inAppBrowserService'
import { useChatController } from '@/stores/chatController'
import { useSettingsStore } from '@/stores/settings'

const TalosMobileBrowserActivity = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileBrowserActivity.vue'),
)

// Chat is the base surface: a scrollable thread (brand hero when empty) over a
// bottom-docked composer. Local-first — the composer talks to the provider directly
// from the device via the controller (key from the OS keystore). Mirrors the desktop
// TalosComposerDock bottom dock (fixed + safe-area + reserved scroll padding).
const router = useRouter()
const controller = useChatController()
const settings = useSettingsStore()
const {
    catalogs,
    profiles,
    selectedModelId,
    effort,
    thinking,
    canSend,
    browseMode,
    sendDisabledReason,
    preferenceError,
    enhancingPrompt,
    promptEnhancement,
    promptEnhancementError,
    attachments,
    chat,
    selectModel,
    selectEffort,
    setThinking,
    init,
} = controller

const draft = createTalosMobileComposerDraftController({
    load: (scopeId) => chat.loadComposerDraft(scopeId),
    save: (scopeId, value) => chat.saveComposerDraft(value, scopeId),
})
const prompt = draft.prompt
const composer = ref<InstanceType<typeof TalosMobileComposer> | null>(null)
const composerWrap = ref<HTMLElement | null>(null)
const historyOpen = ref(false)
const sessionActionBusy = ref(false)
const messageActionError = ref<string | null>(null)
const browserError = ref<string | null>(null)
const browserBusy = ref(false)
const browserStatus = ref('')
const activeTitle = computed(() => chat.activeSession.value?.title ?? 'New chat')
const activeSessionId = computed(() => chat.activeSession.value?.id ?? null)
const refreshingModels = computed(() => Object.values(catalogs).some((catalog) => catalog.status === 'loading'))
const attachmentBusy = computed(() => attachments.selecting.value)
const attachmentError = computed(() => attachments.error.value)
const composerExpanded = computed(() => (
    attachments.items.length > 0
    || attachmentBusy.value
    || Boolean(attachmentError.value)
))
const draftError = computed(() => draft.error.value)
const browserSuggestionUrl = computed(() => (
    settings.state.browser.suggest_for_urls
        ? extractTalosBrowserUrls(prompt.value, 1)[0] ?? null
        : null
))
const showUntrustedBrowserEvidence = computed(() => (
    import.meta.env.DEV && settings.state.browser.developer_untrusted_evidence
))
let heightObserver: ResizeObserver | null = null
let browserOwnerSessionId: string | null = null
let browserSessionId: string | null = null
let browserPresentation = settings.state.browser.presentation
let browserActivityQueue: Promise<void> = Promise.resolve()

function browserEventStatus(event: TalosInAppBrowserEvent): string {
    if (event.type === 'opening') return 'Opening local browser'
    if (event.type === 'loaded' || event.type === 'navigated') return 'Page opened in local browser'
    if (event.type === 'closed') return 'Local browser closed'
    return event.message ?? 'Local browser failed'
}

function queueBrowserEvent(event: TalosInAppBrowserEvent): void {
    const ownerSessionId = browserOwnerSessionId
    const ownerBrowserSessionId = browserSessionId
    if (!ownerSessionId || !ownerBrowserSessionId) return
    const occurredAt = new Date().toISOString()
    const activityId = newTalosMobileId()
    const activity = createTalosManualBrowserActivity(event, {
        activityId,
        browserSessionId: ownerBrowserSessionId,
        occurredAt,
        presentation: browserPresentation,
    })
    browserStatus.value = browserEventStatus(event)
    browserActivityQueue = browserActivityQueue
        .catch(() => undefined)
        .then(() => chat.recordBrowserActivity(ownerSessionId, {
            id: activityId,
            operation: activity.operation,
            status: activity.status,
            payload: activity.payload,
            evidence: activity.evidence,
            created_at: occurredAt,
        }))
        .catch((error) => {
            browserError.value = error instanceof Error && error.message
                ? `Browser activity could not be saved. ${error.message}`
                : 'Browser activity could not be saved.'
        })
}

const browserService = createTalosInAppBrowserService({ onEvent: queueBrowserEvent })

const welcome = {
    headline: 'What claim should we benchmark?',
    body: 'Turn a prompt into comparable AVM ON/OFF evidence with matching model, context, evaluator, and logs.',
}

function publishComposerHeight(): void {
    const el = composerWrap.value
    if (!el) return
    const height = Math.ceil(el.getBoundingClientRect().height) || 180
    document.documentElement.style.setProperty('--talos-composer-height', `${height}px`)
}

async function onSend(): Promise<void> {
    const text = prompt.value
    controller.clearPromptEnhancement()
    draft.updatePrompt('')
    await draft.flush()
    const accepted = await controller.send(text)
    if (!accepted) {
        draft.updatePrompt(text)
        await draft.flush()
        await nextTick()
        composer.value?.focusPrompt()
        return
    }
    await draft.activateScope(activeSessionId.value ?? 'new')
}

async function runSessionAction(action: () => Promise<void>): Promise<void> {
    if (sessionActionBusy.value) return
    sessionActionBusy.value = true
    try {
        await action()
    } finally {
        sessionActionBusy.value = false
    }
}

function newSession(): void {
    void runSessionAction(async () => {
        controller.clearPromptEnhancement()
        await draft.flush()
        await attachments.discardAll()
        await controller.newSession()
        historyOpen.value = false
        await draft.activateScope(activeSessionId.value ?? 'new')
    })
}

function selectSession(sessionId: string): void {
    void runSessionAction(async () => {
        controller.clearPromptEnhancement()
        await draft.flush()
        if (sessionId !== activeSessionId.value) await attachments.discardAll()
        await controller.selectSession(sessionId)
        historyOpen.value = false
        await draft.activateScope(activeSessionId.value ?? 'new')
    })
}

function renameSession(sessionId: string, title: string): void {
    void runSessionAction(() => controller.renameSession(sessionId, title))
}

function deleteSession(sessionId: string): void {
    void runSessionAction(async () => {
        controller.clearPromptEnhancement()
        await draft.flush()
        if (sessionId === activeSessionId.value) await attachments.discardAll()
        await controller.deleteSession(sessionId)
        await draft.activateScope(activeSessionId.value ?? 'new')
    })
}

function retryPersistence(): void {
    void runSessionAction(() => chat.retryPersistence())
}

function selectAttachments(): void {
    void attachments.selectFiles()
}

function removeAttachment(itemId: string): void {
    void attachments.remove(itemId)
}

function messageById(messageId: string) {
    return chat.messages.find((message) => message.id === messageId) ?? null
}

async function runMessageAction(action: () => Promise<void>): Promise<void> {
    messageActionError.value = null
    try {
        await action()
    } catch (error) {
        messageActionError.value = error instanceof Error && error.message
            ? error.message
            : 'TALOS could not complete the message action.'
    }
}

function reuseMessage(messageId: string): void {
    const message = messageById(messageId)
    if (!message || message.role !== 'user') return
    draft.updatePrompt(message.content)
    void nextTick(() => composer.value?.focusPrompt())
}

function resendMessage(messageId: string): void {
    void runMessageAction(() => controller.resendMessage(messageId))
}

function retryAssistantMessage(messageId: string): void {
    void runMessageAction(() => controller.retryAssistantMessage(messageId))
}

function focusComposer(): void {
    void nextTick(() => composer.value?.focusPrompt())
}

function requestPromptEnhancement(): void {
    void controller.enhancePrompt(prompt.value).catch(() => {
        // The controller publishes the sanitized actionable error consumed by the composer.
    })
}

function cancelPromptEnhancement(): void {
    controller.clearPromptEnhancement()
    focusComposer()
}

function insertPromptEnhancement(): void {
    const result = promptEnhancement.value
    if (!result) return
    void (async () => {
        const separator = prompt.value ? '\n\n' : ''
        draft.updatePrompt(`${prompt.value}${separator}${result.enhanced_prompt}`)
        await draft.flush()
        controller.clearPromptEnhancement()
        focusComposer()
    })()
}

function replacePromptEnhancement(): void {
    const result = promptEnhancement.value
    if (!result) return
    void (async () => {
        draft.updatePrompt(result.enhanced_prompt)
        await draft.flush()
        controller.clearPromptEnhancement()
        focusComposer()
    })()
}

function selectSlashCommand(commandId: TalosMobileCommandId): void {
    if (!['new_session', 'open_browse', 'open_context_vault', 'open_model_center'].includes(commandId)) return
    void runSessionAction(async () => {
        draft.updatePrompt('')
        await draft.flush()
        controller.clearPromptEnhancement()

        if (commandId === 'new_session') {
            await attachments.discardAll()
            await controller.newSession()
            historyOpen.value = false
            await draft.activateScope(activeSessionId.value ?? 'new')
            return
        }
        if (commandId === 'open_browse') {
            await controller.setBrowseMode(true)
            return
        }
        if (commandId === 'open_context_vault') {
            await router.push({ name: 'context' })
            return
        }
        await router.push({ name: 'settings', query: { tab: 'models' } })
    })
}

function toggleBrowseMode(enabled: boolean): void {
    void runSessionAction(async () => {
        browserError.value = null
        await controller.setBrowseMode(enabled)
        if (!enabled) {
            await browserService.close()
            await browserActivityQueue
            browserOwnerSessionId = null
            browserSessionId = null
            browserStatus.value = ''
        }
    })
}

function openBrowserUrl(url: string): void {
    if (browserBusy.value) return
    void (async () => {
        browserBusy.value = true
        browserError.value = null
        try {
            await controller.setBrowseMode(true)
            const owner = chat.activeSession.value
            if (!owner) throw new Error('TALOS_CHAT_SESSION_REQUIRED')
            browserOwnerSessionId = owner.id
            browserSessionId = newTalosMobileId()
            browserPresentation = settings.state.browser.presentation
            await browserService.open(url, browserPresentation)
            await browserActivityQueue
        } catch (error) {
            browserError.value = error instanceof Error && error.message
                ? `The local browser could not open this link. ${error.message}`
                : 'The local browser could not open this link.'
        } finally {
            browserBusy.value = false
        }
    })()
}

onMounted(async () => {
    await init()
    await draft.activateScope(activeSessionId.value ?? 'new')
    publishComposerHeight()
    if (typeof ResizeObserver !== 'undefined' && composerWrap.value) {
        heightObserver = new ResizeObserver(() => publishComposerHeight())
        heightObserver.observe(composerWrap.value)
    }
})
onBeforeUnmount(() => {
    heightObserver?.disconnect()
    heightObserver = null
    void draft.dispose()
    void browserService.dispose()
})
</script>

<template>
    <section
        data-testid="mobile-screen"
        aria-label="Chat"
        class="relative flex h-full min-h-0 flex-1 flex-col bg-[var(--talos-background)]"
    >
        <TalosMobileChatHeader
            :title="activeTitle"
            :session-count="chat.sessions.length"
            :creating-session="sessionActionBusy"
            @open-history="historyOpen = true"
            @new-chat="newSession"
        />

        <div
            v-if="chat.state.persistenceStatus === 'error'"
            role="alert"
            class="mx-3 mt-3 flex items-start gap-3 rounded-md border border-[var(--talos-danger-border,var(--destructive))] bg-[var(--talos-danger-soft,transparent)] p-3 text-sm text-[var(--talos-danger,var(--destructive))]"
        >
            <AlertTriangle class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p class="min-w-0 flex-1 leading-5">{{ chat.state.persistenceError }}</p>
            <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="talos-chat-storage-retry"
                :disabled="sessionActionBusy"
                @click="retryPersistence"
            >
                Retry
            </Button>
        </div>

        <div v-if="messageActionError" role="alert" class="mx-3 mt-3 rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-sm text-[var(--talos-danger)]">
            {{ messageActionError }}
        </div>

        <div v-if="browserError" role="alert" class="mx-3 mt-3 rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-sm text-[var(--talos-danger)]">
            {{ browserError }}
        </div>

        <div v-if="draftError || preferenceError" role="alert" class="mx-3 mt-3 rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-sm text-[var(--talos-danger)]">
            {{ draftError || preferenceError }}
        </div>

        <div class="flex-1 overflow-y-auto overscroll-contain" data-testid="talos-chat-scroll">
            <div class="flex min-h-full flex-col pb-[calc(var(--talos-composer-height,180px)+env(safe-area-inset-bottom)+1.5rem)]">
                <div
                    v-if="browseMode"
                    data-testid="talos-mobile-browse-mode-status"
                    class="mx-auto mt-3 flex min-h-11 w-[calc(100%-1.5rem)] max-w-[820px] items-center gap-2 rounded-md border border-[var(--talos-accent)]/45 bg-[var(--talos-accent-soft)] px-3 text-xs text-[var(--talos-text)]"
                    role="status"
                >
                    <Globe2 class="size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                    <span class="min-w-0 flex-1">Browse mode · Manual local browser</span>
                    <span v-if="browserStatus" class="truncate text-[var(--talos-muted)]">{{ browserStatus }}</span>
                </div>

                <div
                    v-if="chat.sessionBrowserActivities.length"
                    class="mx-auto w-full max-w-[820px] px-3"
                >
                    <TalosMobileBrowserActivity
                        :activities="chat.sessionBrowserActivities"
                        :show-untrusted-evidence="showUntrustedBrowserEvidence"
                    />
                </div>
                <!-- Empty state: brand hero + welcome -->
                <div
                    v-if="chat.messages.length === 0"
                    class="flex flex-1 flex-col items-center px-4 text-center"
                    :class="composerExpanded ? 'justify-start py-3' : 'justify-center py-10'"
                    :data-composer-expanded="String(composerExpanded)"
                    data-testid="talos-empty-brand"
                >
                    <span
                        class="talos-short-logo talos-chat-brand-logo"
                        :class="{ 'talos-short-logo-hero': !composerExpanded }"
                        aria-hidden="true"
                    >
                        <span class="talos-short-logo-mark"></span>
                    </span>
                    <span
                        class="talos-orbitron-brand font-semibold text-[var(--talos-text)]"
                        :class="composerExpanded ? 'mt-1 text-2xl' : 'mt-2 text-4xl sm:text-5xl'"
                    >TALOS</span>
                    <h1
                        class="font-semibold text-[var(--talos-text)]"
                        :class="composerExpanded ? 'mt-3 text-lg' : 'mt-6 text-2xl'"
                    >{{ welcome.headline }}</h1>
                    <p
                        v-if="!composerExpanded"
                        class="mt-3 max-w-[560px] text-sm leading-6 text-[var(--talos-muted)]"
                    >{{ welcome.body }}</p>
                </div>

                <!-- Conversation -->
                <TalosMobileMessageList
                    v-else
                    :messages="chat.messages"
                    :sending="chat.state.sending"
                    @reuse="reuseMessage"
                    @resend="resendMessage"
                    @retry="retryAssistantMessage"
                />
            </div>
        </div>

        <div ref="composerWrap" class="fixed inset-x-0 bottom-0 z-40">
            <TalosMobileComposer
                ref="composer"
                :prompt="prompt"
                :model-profiles="profiles"
                :selected-model-profile-id="selectedModelId"
                :selected-effort="effort"
                :thinking="thinking"
                :can-send="canSend"
                :sending="chat.state.sending"
                :refreshing-models="refreshingModels"
                :send-disabled-reason="sendDisabledReason"
                :enhancing-prompt="enhancingPrompt"
                :prompt-enhancement="promptEnhancement"
                :prompt-enhancement-error="promptEnhancementError ?? ''"
                :attachments="attachments.items"
                :attachment-busy="attachmentBusy"
                :attachment-error="attachmentError"
                :context-available="true"
                :browse-mode="browseMode"
                :browser-suggestion-url="browserSuggestionUrl"
                :browser-busy="browserBusy"
                @update:prompt="draft.updatePrompt($event)"
                @send="onSend"
                @attach="selectAttachments"
                @remove-attachment="removeAttachment"
                @dismiss-attachment-error="attachments.clearError()"
                @select-model-profile="selectModel"
                @select-effort="selectEffort"
                @select-thinking="setThinking"
                @refresh-models="controller.refreshConfiguredProviders()"
                @open-model-lab="router.push({ name: 'settings', query: { tab: 'models' } })"
                @open-context="router.push({ name: 'context' })"
                @enhance-prompt="requestPromptEnhancement"
                @cancel-prompt-enhancement="cancelPromptEnhancement"
                @insert-prompt-enhancement="insertPromptEnhancement"
                @replace-prompt-enhancement="replacePromptEnhancement"
                @select-slash-command="selectSlashCommand"
                @toggle-browse="toggleBrowseMode"
                @open-browser-url="openBrowserUrl"
            />
        </div>

        <TalosMobileSessionDrawer
            v-model:open="historyOpen"
            :sessions="chat.sessions"
            :active-session-id="activeSessionId"
            :busy="sessionActionBusy"
            @new-chat="newSession"
            @select="selectSession"
            @rename="renameSession"
            @delete="deleteSession"
        />
    </section>
</template>
