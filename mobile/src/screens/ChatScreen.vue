<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowDown, AlertTriangle, CheckCircle2, Circle, Globe2, X } from '@lucide/vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'
import { createTalosMobileComposerDraftController } from '@/composables/useTalosMobileComposerDraft'
import { useTalosMobileDictation } from '@/composables/useTalosMobileDictation'
import { talosLightImpact } from '@/services/haptics'
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
import { createSessionActionRunner } from '@/lib/sessionActionRunner'
import { createTalosChatLiveEdge } from '@/composables/useTalosChatLiveEdge'
import { useChatController } from '@/stores/chatController'
import { useSettingsStore } from '@/stores/settings'
import { useTalosMobileToasts } from '@/stores/toasts'

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
// F2-T5: live dictation — partials compose onto the draft captured at start.
const dictation = useTalosMobileDictation({
    base: () => prompt.value,
    onTranscript: (text) => draft.updatePrompt(text),
})
const composer = ref<InstanceType<typeof TalosMobileComposer> | null>(null)
const composerWrap = ref<HTMLElement | null>(null)
// F4-#22: shared guard — failed session actions surface as toasts, never as
// swallowed unhandled rejections (owner saw silent no-ops on device).
const toasts = useTalosMobileToasts()
const sessionActions = createSessionActionRunner(toasts)
const sessionActionBusy = sessionActions.busy
const messageActionError = ref<string | null>(null)
const browserError = ref<string | null>(null)
const browserBusy = ref(false)
const browserStatus = ref('')
const activeSessionId = computed(() => chat.activeSession.value?.id ?? null)
// F2-T2: friendly per-message model attribution (id -> display name) for the meta row.
const modelLabels = computed(() => Object.fromEntries(
    profiles.value.map((profile) => [profile.id, profile.display_name]),
))
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

// F2-T6 first-run setup checklist — REAL state only (no fake progress):
// a key exists when any profile carries a stored secret; the model step is
// done when a composer model is actually selected.
const setupHasKey = computed(() => profiles.value.some((profile) => profile.has_secret))
const setupHasModel = computed(() => selectedModelId.value !== null)
const setupChecklistVisible = computed(() =>
    !settings.state.onboarding.setup_dismissed && !(setupHasKey.value && setupHasModel.value),
)

function dismissSetupChecklist(): void {
    void settings.setOnboarding({ setup_dismissed: true })
}

// SF-critic #13: when the procedural background runs, a soft radial scrim keeps
// the hero copy legible over high-contrast scene geometry.
const motionSceneActive = computed(() =>
    settings.state.motion_v6.background_enabled && settings.state.motion_v6.mode !== 'off',
)

// F5-#28 — gesture-sovereign live-edge follow: an active touch blocks
// auto-scroll outright, ANY upward scroll detaches (no threshold race with
// the stream), rejoining is explicit via the back-to-bottom pill.
const chatScroll = ref<HTMLElement | null>(null)
const liveEdge = createTalosChatLiveEdge()

function onChatScroll(): void {
    const el = chatScroll.value
    if (!el) return
    liveEdge.onScroll({ scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight })
}

function scrollChatToBottom(behavior: ScrollBehavior = 'auto'): void {
    const el = chatScroll.value
    if (!el) return
    const target = el.scrollHeight - el.clientHeight
    liveEdge.markAutoScroll(Math.max(0, target))
    if (typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight, behavior })
    else el.scrollTop = el.scrollHeight
}

function rejoinLiveEdge(): void {
    liveEdge.rejoin()
    scrollChatToBottom('smooth')
}

watch(() => chat.messages.length, async (length) => {
    if (!length || !liveEdge.canAutoScroll()) return
    await nextTick()
    scrollChatToBottom('auto')
})

let markdownPreloaded = false
watch(() => chat.state.streamingText, async (text) => {
    if (!text) return
    // SF-critic #15: warm the markdown renderer chunk during the stream so the
    // completed message never flashes through the plain-text fallback.
    if (!markdownPreloaded) {
        markdownPreloaded = true
        void import('@/components/chat/TalosMobileMessageContent.vue')
    }
    if (!liveEdge.canAutoScroll()) return
    await nextTick()
    // Instant follow during the stream: smooth scrolling fights the touch
    // scroller on device and lags dense token bursts.
    scrollChatToBottom('auto')
})

watch(() => chat.activeSession.value?.id, async () => {
    liveEdge.rejoin()
    await nextTick()
    scrollChatToBottom('auto')
})

function publishComposerHeight(): void {
    const el = composerWrap.value
    if (!el) return
    const height = Math.ceil(el.getBoundingClientRect().height) || 180
    document.documentElement.style.setProperty('--talos-composer-height', `${height}px`)
}

async function onSend(): Promise<void> {
    const text = prompt.value
    void talosLightImpact()
    // SF5-3: a live mic must not survive the send — late partials would
    // resurrect the sent text into the composer.
    dictation.cancel()
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

// Exposed to the app shell: the header/sidebar (F1-T3) drive these orchestrated
// actions so attachment revocation + draft scoping stay in one place.
defineExpose({ newSession, selectSession, renameSession, deleteSession, sessionActionBusy })

function newSession(): void {
    void sessionActions.run('New chat', async () => {
        controller.clearPromptEnhancement()
        await draft.flush()
        await attachments.discardAll()
        await controller.newSession()
        await draft.activateScope(activeSessionId.value ?? 'new')
    })
}

function selectSession(sessionId: string): void {
    void sessionActions.run('Open chat', async () => {
        controller.clearPromptEnhancement()
        await draft.flush()
        if (sessionId !== activeSessionId.value) await attachments.discardAll()
        await controller.selectSession(sessionId)
        await draft.activateScope(activeSessionId.value ?? 'new')
    })
}

function renameSession(sessionId: string, title: string): void {
    void sessionActions.run('Rename chat', () => controller.renameSession(sessionId, title))
}

function deleteSession(sessionId: string): void {
    void sessionActions.run('Delete chat', async () => {
        controller.clearPromptEnhancement()
        await draft.flush()
        if (sessionId === activeSessionId.value) await attachments.discardAll()
        await controller.deleteSession(sessionId)
        await draft.activateScope(activeSessionId.value ?? 'new')
    })
}

function retryPersistence(): void {
    void sessionActions.run('Reconnect storage', () => chat.retryPersistence())
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

// F4-#20: a blocked enhancement surfaces its reason and puts the user where
// the fix happens — in the composer.
function onEnhanceBlocked(reason: string): void {
    toasts.push({ message: reason, durationMs: 5000 })
    focusComposer()
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
    void sessionActions.run('Run command', async () => {
        draft.updatePrompt('')
        await draft.flush()
        controller.clearPromptEnhancement()

        if (commandId === 'new_session') {
            await attachments.discardAll()
            await controller.newSession()
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
    void sessionActions.run('Toggle browsing', async () => {
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
        class="relative flex h-full min-h-0 flex-1 flex-col bg-transparent"
    >
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

        <div
            ref="chatScroll"
            class="flex-1 overflow-y-auto overscroll-contain"
            :class="settings.state.shell.immersive_header ? 'pt-[calc(3.5rem+env(safe-area-inset-top))]' : ''"
            data-testid="talos-chat-scroll"
            @scroll.passive="onChatScroll"
            @touchstart.passive="liveEdge.touchStart()"
            @touchend.passive="liveEdge.touchEnd()"
            @touchcancel.passive="liveEdge.touchEnd()"
        >
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
                    :class="[
                        composerExpanded ? 'justify-start py-3' : 'justify-center py-10',
                        motionSceneActive ? 'bg-[radial-gradient(ellipse_at_center,var(--talos-background)_35%,transparent_78%)]' : '',
                    ]"
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

                    <!-- F2-T6 first-run setup: REAL progress only, dismissible. -->
                    <section
                        v-if="setupChecklistVisible && !composerExpanded"
                        data-testid="talos-setup-checklist"
                        aria-label="Getting started"
                        class="mt-6 w-full max-w-[420px] rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-card,var(--card))]/80 p-3 text-left backdrop-blur"
                    >
                        <div class="flex items-center justify-between">
                            <h2 class="text-sm font-semibold text-[var(--talos-text)]">Get set up</h2>
                            <button
                                type="button"
                                data-testid="talos-setup-dismiss"
                                aria-label="Dismiss setup checklist"
                                class="talos-pressable -mr-1.5 flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--talos-muted)]"
                                @click="dismissSetupChecklist"
                            >
                                <X class="size-4" aria-hidden="true" />
                            </button>
                        </div>
                        <button
                            type="button"
                            data-testid="talos-setup-step-key"
                            class="talos-pressable mt-2 flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left"
                            @click="router.push({ name: 'settings', query: { tab: 'models' } })"
                        >
                            <CheckCircle2 v-if="setupHasKey" class="size-5 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                            <Circle v-else class="size-5 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                            <span class="text-sm" :class="setupHasKey ? 'text-[var(--talos-muted)] line-through' : 'text-[var(--talos-text)]'">Add a provider key</span>
                        </button>
                        <button
                            type="button"
                            data-testid="talos-setup-step-model"
                            class="talos-pressable flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left"
                            @click="router.push({ name: 'settings', query: { tab: 'models' } })"
                        >
                            <CheckCircle2 v-if="setupHasModel" class="size-5 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                            <Circle v-else class="size-5 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                            <span class="text-sm" :class="setupHasModel ? 'text-[var(--talos-muted)] line-through' : 'text-[var(--talos-text)]'">Choose your model</span>
                        </button>
                    </section>
                </div>

                <!-- Conversation -->
                <TalosMobileMessageList
                    v-else
                    :messages="chat.messages"
                    :sending="chat.state.sending"
                    :model-labels="modelLabels"
                    :message-style="settings.state.chat_layout.message_style"
                    @reuse="reuseMessage"
                    @resend="resendMessage"
                    @retry="retryAssistantMessage"
                />
            </div>
        </div>

        <!-- F6: the dock spares the tablet chat panel (--talos-tablet-rail=0 on phones). -->
        <div ref="composerWrap" class="fixed bottom-0 right-0 z-40" :style="{ left: 'var(--talos-tablet-rail, 0px)' }">
            <!-- F5-#28: back-to-bottom pill — rejoin the live edge explicitly. -->
            <Transition
                enter-active-class="transition duration-150 ease-out"
                enter-from-class="opacity-0 translate-y-2"
                enter-to-class="opacity-100 translate-y-0"
                leave-active-class="transition duration-100 ease-in"
                leave-to-class="opacity-0 translate-y-2"
            >
                <button
                    v-if="liveEdge.showPill.value"
                    type="button"
                    data-testid="talos-back-to-bottom"
                    aria-label="Back to latest message"
                    class="talos-pressable absolute -top-14 left-1/2 z-10 flex min-h-11 min-w-11 -translate-x-1/2 items-center justify-center gap-1.5 rounded-full border border-[var(--talos-border)] bg-[var(--talos-card)]/95 px-3 text-sm text-[var(--talos-text)] shadow-[0_4px_16px_rgba(0,0,0,0.14)] backdrop-blur"
                    @click="rejoinLiveEdge"
                >
                    <ArrowDown class="size-4" aria-hidden="true" />
                </button>
            </Transition>

            <!-- F5-#29: dictation problems speak where the thumb is — right
                 above the composer, never buried at the top of the thread. -->
            <div
                v-if="dictation.error.value"
                role="alert"
                data-testid="talos-dictation-error"
                class="mx-3 mb-2 rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-sm text-[var(--talos-danger)]"
            >
                {{ dictation.error.value }}
            </div>
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
                :dictation-supported="dictation.visible.value"
                :dictation-listening="dictation.status.value === 'listening'"
                :dictation-starting="dictation.status.value === 'starting'"
                :dictation-level="dictation.level.value"
                :drawer-mode="settings.state.shell.composer_drawer"
                @update:prompt="draft.updatePrompt($event)"
                @send="onSend"
                @stop="chat.stopStreaming()"
                @toggle-dictation="dictation.toggle()"
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
                @enhance-blocked="onEnhanceBlocked"
                @cancel-prompt-enhancement="cancelPromptEnhancement"
                @insert-prompt-enhancement="insertPromptEnhancement"
                @replace-prompt-enhancement="replacePromptEnhancement"
                @select-slash-command="selectSlashCommand"
                @toggle-browse="toggleBrowseMode"
                @open-browser-url="openBrowserUrl"
            />
        </div>

    </section>
</template>
