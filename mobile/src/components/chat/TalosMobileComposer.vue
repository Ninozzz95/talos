<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref, watch, type ComponentPublicInstance } from 'vue'
import { useTalosI18n } from '@/i18n'
import { createTalosSendGate } from '@/lib/chat/sendGate'
import { Loader2, ArrowUp,
    BrainCircuit,
    Database,
    Gauge,
    Globe2,
    ExternalLink,
    Mic,
    Paperclip,
    SlidersHorizontal,
    Plus,
    Sparkles,
    Square, } from '@lucide/vue'
import TalosMicWaveform from '@/components/brand/TalosMicWaveform.vue'
import TalosMobileAttachmentTray from '@/components/chat/TalosMobileAttachmentTray.vue'
import TalosMobileModelEffortDrawer from '@/components/chat/TalosMobileModelEffortDrawer.vue'
import TalosMobileEnhancerDrawer from '@/components/chat/TalosMobileEnhancerDrawer.vue'
import TalosMobileProviderIcon from '@/components/models/TalosMobileProviderIcon.vue'
import { Button } from '@/components/ui/button'
import { useTalosOverlayBack } from '@/composables/useTalosOverlayBack'
import type {
    TalosMobileModelProfileView,
    TalosMobileRoutingProfileView,
} from '@/components/chat/mobileChatTypes'
import type { TalosMobileEffortLevel } from '@/lib/mobileEffort'
import type { TalosMobilePromptEnhancementResult } from '@/lib/chat/promptEnhancement'
import type { TalosMobileCommandId } from '@/lib/mobileCommandRegistry'
import type { TalosMobileAttachmentDraft } from '@/composables/useTalosMobileAttachments'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'
import type {
    TalosLibraryContextMode,
    TalosLibraryTurnOverride,
} from '@/lib/chat/libraryPolicy'


const TalosMobileSlashCommandMenu = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileSlashCommandMenu.vue'),
)
// F3-T4bis: the organized tool drawer loads only when drawer mode opens it.
const TalosMobileComposerDrawer = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileComposerDrawer.vue'),
)
const TalosMobileLibraryContextSheet = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileLibraryContextSheet.vue'),
)

const props = withDefaults(defineProps<{
    prompt: string
    modelProfiles: TalosMobileModelProfileView[]
    routingProfiles?: TalosMobileRoutingProfileView[]
    selectedModelProfileId?: string | null
    selectedRoutingProfileId?: string | null
    selectedEffort: string
    thinking: boolean
    canSend: boolean
    sending: boolean
    sendDisabledReason?: string
    loadingModels?: boolean
    loadingRoutes?: boolean
    refreshingModels?: boolean
    attachments?: readonly TalosMobileAttachmentDraft[]
    attachmentBusy?: boolean
    attachmentError?: string | null
    attachmentsAvailable?: boolean
    attachmentDisabledReason?: string
    contextAvailable?: boolean
    contextDisabledReason?: string
    enhancingPrompt?: boolean
    promptEnhancement?: TalosMobilePromptEnhancementResult | null
    promptEnhancementError?: string
    browseMode?: boolean
    browserSuggestionUrl?: string | null
    browserBusy?: boolean
    // F2-T5: mic renders only when dictation is genuinely available (honest).
    dictationSupported?: boolean
    dictationListening?: boolean
    dictationStarting?: boolean
    dictationLevel?: number
    // F3-T4bis (owner #13): Claude-style minimal bar + organized tool drawer.
    drawerMode?: boolean
    // Owner 2026-07-24 (ChatGPT-style): compact bar that expands on focus.
    immersiveComposer?: boolean
    // Owner 2026-07-24: the "+" opens an anchored dropdown, not the drawer.
    plusDropdown?: boolean
    libraryContextEnabled?: boolean
    libraryContextMode?: TalosLibraryContextMode
    librarySourceCount?: number
    libraryTurnOverride?: TalosLibraryTurnOverride | null
    libraryFiles?: readonly TalosLocalVaultFile[]
}>(), {
    routingProfiles: () => [],
    selectedModelProfileId: null,
    selectedRoutingProfileId: null,
    sendDisabledReason: '',
    loadingModels: false,
    loadingRoutes: false,
    refreshingModels: false,
    attachments: () => [],
    attachmentBusy: false,
    attachmentError: null,
    attachmentsAvailable: true,
    attachmentDisabledReason: '',
    contextAvailable: false,
    contextDisabledReason: '',
    enhancingPrompt: false,
    promptEnhancement: null,
    promptEnhancementError: '',
    browseMode: false,
    browserSuggestionUrl: null,
    browserBusy: false,
    dictationSupported: false,
    dictationListening: false,
    dictationStarting: false,
    dictationLevel: 0,
    drawerMode: false,
    immersiveComposer: false,
    plusDropdown: false,
    libraryContextEnabled: false,
    libraryContextMode: 'broad_compat_v1',
    librarySourceCount: 0,
    libraryTurnOverride: null,
    libraryFiles: () => [],
})

const emit = defineEmits<{
    'update:prompt': [prompt: string]
    send: []
    stop: []
    toggleDictation: []
    selectModelProfile: [profileId: string]
    selectModelRoutingProfile: [profileId: string]
    selectEffort: [level: TalosMobileEffortLevel]
    selectThinking: [enabled: boolean]
    attach: []
    removeAttachment: [itemId: string]
    dismissAttachmentError: []
    openContext: []
    openModelLab: []
    refreshModels: []
    enhancePrompt: []
    enhanceBlocked: [reason: string]
    cancelPromptEnhancement: []
    insertPromptEnhancement: []
    replacePromptEnhancement: []
    selectSlashCommand: [commandId: TalosMobileCommandId]
    toggleBrowse: [enabled: boolean]
    openBrowserUrl: [url: string]
    updateLibraryTurnOverride: [override: TalosLibraryTurnOverride | null]
}>()

const { t } = useTalosI18n()
const composerRoot = ref<HTMLElement | null>(null)
const promptField = ref<HTMLTextAreaElement | null>(null)
const modelTrigger = ref<ComponentPublicInstance | HTMLElement | null>(null)
const effortTrigger = ref<ComponentPublicInstance | null>(null)
// F4-#26: model+effort and the enhancer live in dedicated bottom drawers —
// the same organized-sheet pattern as the "+" Add-to-chat drawer.
const modelPickerOpen = ref(false)
const enhancerDrawerOpen = ref(false)
let modelDrawerTrigger: 'model' | 'effort' = 'model'
const slashActiveIndex = ref(0)
const slashCommandCount = ref(0)
const slashMenu = ref<{ activateSelected(): void } | null>(null)
const toolDrawerOpen = ref(false)
// Owner 2026-07-24 — immersive composer: collapse the bottom controls row when
// the field is unfocused AND empty (single-line pill), expand on focus/content.
const composerFocused = ref(false)
const composerCompact = computed(() =>
    props.immersiveComposer
    && !composerFocused.value
    && !props.prompt.trim()
    && (props.attachments?.length ?? 0) === 0,
)
const composerMotionIntent = ref<'composer-expand' | 'composer-collapse' | null>(null)
const COMPOSER_LAYOUT_SHIFT = '--talos-composer-layout-shift'
let composerMotionRevision = 0
// Owner 2026-07-24 — the "+" opens an anchored dropdown instead of the drawer.
const plusMenuOpen = ref(false)
const plusTrigger = ref<ComponentPublicInstance | HTMLElement | null>(null)
const plusMenu = ref<HTMLElement | null>(null)
const libraryChip = ref<HTMLElement | null>(null)
const librarySheetOpen = ref(false)
// Re-review 2026-07-25: Back with the menu open used to skip it and eject the user.
useTalosOverlayBack(() => { void closePlusMenu() }, () => plusMenuOpen.value)
/** The "+" opens the anchored menu whenever the bottom drawer cannot mount. */
const plusUsesMenu = computed(() => props.plusDropdown || !props.drawerMode)
const showLibraryChip = computed(() => (
    props.libraryContextEnabled
    || props.libraryTurnOverride !== null
    || props.libraryFiles.length > 0
))
const libraryModeLabel = computed(() => {
    if (!props.libraryContextEnabled && props.libraryTurnOverride?.enabled !== true) {
        return t('library.contextModeOff')
    }
    if (props.libraryContextMode === 'smart_relevant_v1') return t('aiDefaults.libraryModes.smart')
    if (props.libraryContextMode === 'ask_before_use_v1') return t('aiDefaults.libraryModes.ask')
    if (props.libraryContextMode === 'agentic_on_demand_v1') return t('aiDefaults.libraryModes.onDemand')
    return t('aiDefaults.libraryModes.broad')
})
const librarySourceCountLabel = computed(() => t(
    props.librarySourceCount === 1 ? 'library.sourceCountOne' : 'library.sourceCountMany',
    { count: props.librarySourceCount },
))

async function closeLibrarySheet(): Promise<void> {
    librarySheetOpen.value = false
    await nextTick()
    libraryChip.value?.focus()
}

async function openPlus(): Promise<void> {
    // Product review 2026-07-25: the bottom drawer only renders under drawerMode,
    // so with (immersive on, plusDropdown off, drawerMode off) the "+" opened
    // NOTHING while announcing aria-expanded=true. The dropdown is always a valid
    // surface, so fall back to it rather than to a drawer that cannot mount.
    if (!plusUsesMenu.value) { toolDrawerOpen.value = true; return }
    if (plusMenuOpen.value) { await closePlusMenu(); return }
    plusMenuOpen.value = true
    await nextTick()
    // Land AT focus inside the menu so Escape/Tab operate on it.
    plusMenu.value?.focus()
}
async function closePlusMenu(): Promise<void> {
    plusMenuOpen.value = false
    await nextTick()
    focusTrigger(plusTrigger.value)
}

const selectedProfile = computed(() => (
    props.modelProfiles.find((profile) => profile.id === props.selectedModelProfileId) ?? null
))
// F3-T1 (owner #2): the effort control exists only when the model exposes
// real levels beyond 'off' — hidden, never disabled.
const effortAvailable = computed(() => (
    (selectedProfile.value?.effort_levels ?? []).some((level) => level !== 'off')
))
const selectedRoute = computed(() => (
    props.routingProfiles.find((profile) => profile.id === props.selectedRoutingProfileId) ?? null
))
const modelTitle = computed(() => {
    if (selectedRoute.value) return selectedRoute.value.name
    if (selectedProfile.value) return selectedProfile.value.display_name
    return t('chat.noModelSelected')
})
const hasAuthorizedAttachment = computed(() =>
    props.attachments.some((attachment) => attachment.status === 'authorized'),
)
const attachmentBlocked = computed(() =>
    props.attachmentBusy || props.attachments.some((attachment) => attachment.status !== 'authorized'),
)
const canSubmit = computed(() => (
    props.canSend
    && !props.sending
    && !attachmentBlocked.value
    && (props.prompt.trim().length > 0 || hasAuthorizedAttachment.value)
))
const canRequestEnhancement = computed(() => (
    selectedProfile.value !== null
    && !props.enhancingPrompt
    && !props.sending
    && props.prompt.trim().length > 0
))
// F4-#20: a mute disabled control explains nothing on touch — when the
// enhancer cannot run, the tap surfaces WHY instead of dying silently.
const enhanceUnavailableReason = computed<string | null>(() => {
    if (selectedProfile.value === null) return t('chat.selectCallableModel')
    if (props.prompt.trim().length === 0) return t('chat.writePromptFirst')
    return null
})
const slashMenuOpen = computed(() => /^\/[^\s\n]*$/.test(props.prompt))
const statusText = computed(() => {
    if (props.sending) return t('chat.processing')
    if (props.attachmentBusy) return t('chat.addingFiles')
    if (attachmentBlocked.value) return t('chat.removeFailedFiles')
    if (props.enhancingPrompt) return t('chat.improvingPrompt')
    if (props.promptEnhancementError) return props.promptEnhancementError
    return props.sendDisabledReason
})

// Owner 2026-07-25: ONE morphing right button on EVERY composer style —
// empty → Mic, typing/attachment → Send, streaming → Stop, dictating → Stop.
// Content present → ALWAYS the send affordance (disabled with a reason when it
// cannot be sent); the mic only replaces it on a genuinely empty composer.
const composerHasContent = computed(() => (
    props.prompt.trim().length > 0 || (props.attachments?.length ?? 0) > 0
))
const rightAction = computed<'stop' | 'dictating' | 'send' | 'mic'>(() => {
    if (props.sending) return 'stop'
    if (props.dictationListening || props.dictationStarting) return 'dictating'
    if (composerHasContent.value) return 'send'
    // No dictation on this device → keep the send affordance rather than a dead mic.
    return props.dictationSupported ? 'mic' : 'send'
})
/** Stable accessible name; the reason travels in the title. */
const rightActionLabel = computed(() => {
    switch (rightAction.value) {
        case 'stop': return t('chat.stopResponse')
        case 'dictating': return t('chat.stopDictation')
        case 'send': return t('chat.sendMessage')
        default: return t('chat.dictate')
    }
})
const rightActionTitle = computed(() => {
    if (rightAction.value === 'dictating' && props.dictationStarting) return t('chat.startingDictation')
    if (rightAction.value === 'send') return statusText.value || t('chat.sendMessage')
    return rightActionLabel.value
})
const attachmentReason = computed(() => props.attachmentDisabledReason || t('chat.attachmentUnavailable'))
const contextReason = computed(() => props.contextDisabledReason || t('chat.contextUnavailable'))
function effortLabel(level: string): string {
    const key = `chat.effort${level.charAt(0).toUpperCase()}${level.slice(1)}`
    return t(key)
}
const rightActionDisabled = computed(() => {
    if (rightAction.value === 'send') return !canSubmit.value
    if (rightAction.value === 'mic') return !props.dictationSupported
    return false
})
function onRightAction(): void {
    if (rightAction.value === 'stop') { emit('stop'); return }
    if (rightAction.value === 'send') { requestSend(); return }
    // Dictation: hand the screen back to the user's voice — keeping the textarea
    // focused kept the keyboard up over the listening pill.
    promptField.value?.blur()
    composerFocused.value = false
    emit('toggleDictation') // start OR stop
}

function resizePrompt(): void {
    const field = promptField.value
    if (!field) return
    field.style.height = 'auto'
    // One 48px box in both states: 12px padding + a 24px line = 48px, and the
    // 44px buttons bottom-anchor at 2px, so text and controls share one optical
    // line and stay correct as the field grows.
    const floor = 48
    field.style.height = `${Math.max(floor, Math.min(field.scrollHeight, 192))}px`
}
/**
 * FLIP only the fixed composer surface: Vue commits the final text layout
 * first, then the old/new top edge is bridged with a compositor transform.
 * Text is never scaled and no intermediate height can re-wrap it.
 */
async function runComposerLayoutMotion(compact: boolean): Promise<void> {
    const revision = ++composerMotionRevision
    const root = composerRoot.value!
    const beforeHeight = root.offsetHeight
    composerMotionIntent.value = null
    root.style.removeProperty(COMPOSER_LAYOUT_SHIFT)

    await nextTick(resizePrompt)
    if (revision !== composerMotionRevision || composerRoot.value !== root) return

    const shift = root.offsetHeight - beforeHeight
    const intent = compact ? 'composer-collapse' : 'composer-expand'
    if (
        !shift
        || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        || !(parseFloat(getComputedStyle(root)
            .getPropertyValue(`--talos-motion-duration-${intent}`)) > 0)
    ) return

    root.style.setProperty(COMPOSER_LAYOUT_SHIFT, `${shift}px`)
    composerMotionIntent.value = intent
}

function clearComposerLayoutMotion(event: AnimationEvent): void {
    if (event.target !== composerRoot.value) return
    composerMotionIntent.value = null
    composerRoot.value?.style.removeProperty(COMPOSER_LAYOUT_SHIFT)
}

// Recompute the field height when the pill flips compact↔expanded so the floor
// (48↔56) and centring track the layout, not just typing.
watch(composerCompact, (compact) => { void runComposerLayoutMotion(compact) })

function updatePrompt(event: Event): void {
    const field = event.currentTarget as HTMLTextAreaElement
    emit('update:prompt', field.value)
    resizePrompt()
}

/**
 * One tap, one message.
 *
 * Owner 2026-07-27 caught the same prompt sent twice. `props.sending` was the
 * only guard, and the parent raises it AFTER the emit — so between the two
 * there is a window where a second event (a blur that produces an extra click,
 * a fast double tap) passes untouched. The gate closes on this very tick and
 * reopens when the answer ends, or after a grace period if the send never
 * started at all.
 */
const sendGate = createTalosSendGate()
watch(() => props.sending, (sending) => sendGate.observeSending(sending))

function requestSend(value = promptField.value?.value ?? props.prompt): void {
    if (!props.canSend || props.sending || attachmentBlocked.value
        || (!value.trim() && !hasAuthorizedAttachment.value)) return
    if (!sendGate.claim(performance.now())) return
    emit('send')
}

function onPromptKeydown(event: KeyboardEvent): void {
    if (slashMenuOpen.value && !event.isComposing) {
        const count = slashCommandCount.value
        if (event.key === 'Escape') {
            event.preventDefault()
            emit('update:prompt', '')
            return
        }
        if (count > 0 && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            if (event.key === 'Home') slashActiveIndex.value = 0
            else if (event.key === 'End') slashActiveIndex.value = count - 1
            else if (event.key === 'ArrowDown') slashActiveIndex.value = (slashActiveIndex.value + 1) % count
            else slashActiveIndex.value = (slashActiveIndex.value - 1 + count) % count
            return
        }
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            slashMenu.value?.activateSelected()
            return
        }
    }
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
    event.preventDefault()
    requestSend((event.currentTarget as HTMLTextAreaElement).value)
}

function requestPromptEnhancement(): void {
    if (props.enhancingPrompt || props.sending) return
    const reason = enhanceUnavailableReason.value
    if (reason) {
        emit('enhanceBlocked', reason)
        return
    }
    modelPickerOpen.value = false
    enhancerDrawerOpen.value = true
    emit('enhancePrompt')
}

// Manual dismissal of the enhancer drawer abandons the enhancement; the
// parent clears its state, which is also what closes the drawer after a
// decision (insert/replace/cancel) — popover-parity semantics.
function dismissEnhancerDrawer(): void {
    enhancerDrawerOpen.value = false
    if (props.enhancingPrompt || props.promptEnhancementError || props.promptEnhancement) {
        emit('cancelPromptEnhancement')
    }
}

function selectSlashCommand(commandId: TalosMobileCommandId): void {
    emit('selectSlashCommand', commandId)
}

function updateSlashCommandCount(count: number): void {
    slashCommandCount.value = count
    if (count === 0) slashActiveIndex.value = 0
    else slashActiveIndex.value = Math.min(slashActiveIndex.value, count - 1)
}

async function toggleModelPicker(): Promise<void> {
    modelDrawerTrigger = 'model'
    modelPickerOpen.value = !modelPickerOpen.value
}

async function toggleEffortPicker(): Promise<void> {
    modelDrawerTrigger = 'effort'
    modelPickerOpen.value = !modelPickerOpen.value
}

function focusTrigger(trigger: ComponentPublicInstance | HTMLElement | null): void {
    const element = trigger instanceof HTMLElement ? trigger : (trigger?.$el as HTMLElement | undefined)
    element?.focus()
}

async function closeModelPicker(): Promise<void> {
    modelPickerOpen.value = false
    await nextTick()
    focusTrigger(modelDrawerTrigger === 'effort' ? effortTrigger.value : modelTrigger.value)
}

/**
 * Choosing something inside the drawer does NOT dismiss it.
 *
 * Owner 2026-07-27: "fai in modo che il drawer modello non si chiuda ogni volta
 * che clicco su una cosa dentro". Every selection used to close it — model,
 * routing profile AND effort — which makes a sheet titled "Model & reasoning"
 * unusable: it is a configuration surface, not a menu, and picking a model then
 * wanting a different effort meant opening it twice. The sheet already has a
 * close affordance; leaving is the user's decision, not a side effect of
 * adjusting something.
 */
function selectModelProfile(profileId: string): void {
    emit('selectModelProfile', profileId)
}

function selectRoutingProfile(profileId: string): void {
    emit('selectModelRoutingProfile', profileId)
}

function selectEffort(level: TalosMobileEffortLevel): void {
    emit('selectEffort', level)
}

watch(
    () => Boolean(props.enhancingPrompt || props.promptEnhancementError || props.promptEnhancement),
    (active) => { if (!active) enhancerDrawerOpen.value = false },
)

function focusPrompt(): boolean {
    const field = promptField.value
    if (!field || field.disabled) return false
    field.focus()
    return document.activeElement === field
}

defineExpose({ focusPrompt })

watch(() => props.prompt, () => {
    slashActiveIndex.value = 0
    if (slashMenuOpen.value) modelPickerOpen.value = false
    nextTick(resizePrompt)
}, { immediate: true })
</script>

<template>
    <section
        ref="composerRoot"
        data-testid="talos-mobile-composer"
        :data-talos-motion-intent="composerMotionIntent ?? undefined"
        class="relative mx-3 mb-[max(0.75rem,env(safe-area-inset-bottom))] rounded-2xl border border-[var(--talos-border,var(--border))] bg-[var(--talos-card,var(--card))]/95 p-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.10)] backdrop-blur"
        :aria-label="$t('chat.composer')"
        @animationend="clearComposerLayoutMotion"
    >
        <div
            v-if="slashMenuOpen"
            id="talos-mobile-slash-command-popover"
            class="absolute bottom-full left-0 right-0 z-50 mb-2"
        >
            <TalosMobileSlashCommandMenu
                ref="slashMenu"
                :query="prompt"
                :active-index="slashActiveIndex"
                @selected="selectSlashCommand"
                @filtered-count="updateSlashCommandCount"
            />
        </div>

        <TalosMobileAttachmentTray
            :items="attachments"
            :busy="attachmentBusy"
            :error="attachmentError"
            @remove="emit('removeAttachment', $event)"
            @dismiss-error="emit('dismissAttachmentError')"
        />

        <div
            v-if="browserSuggestionUrl"
            data-testid="talos-mobile-browser-url-suggestion"
            class="mb-2 flex min-w-0 items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-2 py-1.5 text-xs text-[var(--talos-text)]"
        >
            <Globe2 class="size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate">{{ browserSuggestionUrl.replace(/^https?:\/\//, '') }}</span>
            <Button
                type="button"
                size="sm"
                variant="ghost"
                class="min-h-11 shrink-0 gap-1 px-2"
                :disabled="browserBusy"
                :aria-label="$t('chat.openDetectedLink', { url: browserSuggestionUrl })"
                @click="emit('openBrowserUrl', browserSuggestionUrl)"
            >
                <ExternalLink class="size-4" aria-hidden="true" />
                <span class="sr-only">{{ $t('chat.openDetectedLinkShort') }}</span>
            </Button>
        </div>

        <!-- Owner 2026-07-24 (Claude/ChatGPT-style): a distinct listening state —
             accent-tinted pill, a live pulsing dot, a volume-reactive waveform
             filling the width, a clear "Listening" label and a dedicated Stop
             control (transcription flows inline into the field). -->
        <div
            v-if="dictationListening || dictationStarting"
            data-testid="talos-dictation-live"
            class="talos-dictation-live mb-2 flex items-center gap-3 rounded-2xl border border-[var(--talos-accent,var(--primary))]/30 bg-[color-mix(in_srgb,var(--talos-accent,#c08b3c)_10%,transparent)] px-3 py-2"
        >
            <span class="relative flex size-2.5 shrink-0" aria-hidden="true">
                <span class="absolute inline-flex h-full w-full rounded-full bg-[var(--talos-accent,var(--primary))] opacity-60 motion-safe:animate-ping"></span>
                <span class="relative inline-flex size-2.5 rounded-full bg-[var(--talos-accent,var(--primary))]"></span>
            </span>
            <TalosMicWaveform :level="dictationStarting ? 0.12 : dictationLevel" :bars="18" class="min-w-0 flex-1" />
            <span class="shrink-0 text-xs font-semibold tracking-wide text-[var(--talos-accent,var(--primary))]">
                {{ dictationStarting ? $t('chat.starting') : $t('chat.listening') }}
            </span>
            <button
                type="button"
                :aria-label="$t('chat.cancelDictation')"
                class="talos-pressable flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--talos-accent,var(--primary))] text-[var(--talos-accent-contrast,var(--primary-foreground))] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                @click="emit('toggleDictation')"
            >
                <Square class="size-3.5" fill="currentColor" aria-hidden="true" />
            </button>
        </div>

        <div class="relative min-w-0">
            <!-- Owner 2026-07-24 immersive compact pill: [+] input [mic] [send] on ONE
                 line; model+effort appear on focus (expanded). @pointerdown.prevent keeps
                 the field focused / keyboard up when a control is tapped (Android WebView
                 blurs on pointerdown, before any mousedown handler could run). -->
            <Button
                v-if="composerCompact || (plusDropdown && !drawerMode)"
                ref="plusTrigger"
                type="button"
                size="icon"
                variant="ghost"
                data-mobile-icon-only="true"
                :aria-label="$t('chat.addToChat')"
                :aria-haspopup="plusUsesMenu ? 'menu' : 'dialog'"
                :aria-expanded="plusUsesMenu ? plusMenuOpen : toolDrawerOpen"
                class="talos-pressable absolute bottom-0.5 left-0.5 z-10 min-h-11 min-w-11 rounded-2xl"
                @pointerdown.prevent
                @click="openPlus"
            >
                <Plus class="size-5" aria-hidden="true" />
            </Button>
            <textarea
                ref="promptField"
                :value="prompt"
                rows="1"
                :aria-label="$t('chat.messagePlaceholder')"
                :placeholder="$t('chat.messagePlaceholderEllipsis')"
                class="block max-h-48 w-full resize-none overflow-y-auto bg-transparent text-sm leading-6 text-[var(--talos-text,var(--foreground))] outline-none placeholder:text-[var(--talos-muted,var(--muted-foreground))]"
                :class="[
                    'min-h-12 py-3',
                    composerCompact || (plusDropdown && !drawerMode) ? 'pl-12 pr-14' : 'px-2 pr-14',
                ]"
                @input="updatePrompt"
                @keydown="onPromptKeydown"
                @focus="composerFocused = true"
                @blur="composerFocused = false"
            />
            <!-- ONE morphing right button on EVERY composer style (owner 2026-07-25):
                 Mic when empty, Send while typing, Stop while streaming or dictating.
                 Only the glyph transitions (~150ms); the button never unmounts.

                 Owner 2026-07-26: bare icon while it is a microphone, matching
                 the "+", and the filled pill from send onwards. It needed
                 variant="ghost" as well — the Button's DEFAULT variant brings
                 its own filled background, so removing the border alone left
                 the container exactly where it was. -->
            <Button
                type="button"
                size="icon"
                variant="ghost"
                data-mobile-icon-only="true"
                :aria-label="rightActionLabel"
                :title="rightActionTitle"
                :aria-pressed="rightAction === 'dictating'"
                :disabled="rightActionDisabled"
                @pointerdown.prevent
                class="talos-pressable absolute right-1.5 min-h-11 min-w-11 rounded-2xl"
                :class="[
                    'bottom-0.5',
                    // Owner 2026-07-26: the microphone is a bare icon at rest.
                    // Send, stop and dictating keep the filled pill exactly as
                    // it was — those are the states where the control is either
                    // about to be pressed or must be findable in a hurry.
                    rightAction === 'mic'
                        ? 'text-[var(--talos-text,var(--foreground))]'
                        : 'bg-[var(--talos-accent,var(--primary))] text-[var(--talos-accent-contrast,var(--primary-foreground))]',
                ]"
                @click="onRightAction"
            >
                <Transition
                    mode="out-in"
                    enter-active-class="transition duration-150 ease-out"
                    enter-from-class="opacity-0 scale-75"
                    enter-to-class="opacity-100 scale-100"
                    leave-active-class="transition duration-100 ease-in"
                    leave-from-class="opacity-100 scale-100"
                    leave-to-class="opacity-0 scale-75"
                >
                    <Loader2 v-if="rightAction === 'dictating' && dictationStarting" key="starting" class="size-4 animate-spin" aria-hidden="true" />
                    <Square v-else-if="rightAction === 'stop' || rightAction === 'dictating'" key="stop" class="size-4" aria-hidden="true" />
                    <ArrowUp v-else-if="rightAction === 'send'" key="send" class="size-5" aria-hidden="true" />
                    <Mic v-else key="mic" class="size-5" aria-hidden="true" />
                </Transition>
            </Button>

            <!-- Owner 2026-07-24: ChatGPT-style "+" dropdown, anchored above the
                 composer so it opens whether the pill is compact or expanded. -->
            <div v-if="plusMenuOpen" class="fixed inset-0 z-[59]" aria-hidden="true" @click="closePlusMenu" />
            <!-- Owner 2026-07-25: every dropdown inherits the chat 3-dot menu motion. -->
            <Transition
                enter-active-class="transition duration-150 ease-out"
                enter-from-class="opacity-0 scale-95"
                enter-to-class="opacity-100 scale-100"
                leave-active-class="transition duration-100 ease-in"
                leave-from-class="opacity-100 scale-100"
                leave-to-class="opacity-0 scale-95"
            >
            <div
                v-if="plusMenuOpen"
                ref="plusMenu"
                role="menu"
                tabindex="-1"
                data-testid="talos-composer-plus-menu"
                class="absolute bottom-full left-1 z-[60] mb-2 min-w-52 origin-bottom-left overflow-hidden rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-window-bg,var(--talos-card))] py-1 shadow-xl outline-none"
                @keydown.escape="closePlusMenu"
            >
                <button type="button" role="menuitem" data-testid="talos-plus-menu-attach" :disabled="!attachmentsAvailable" class="talos-pressable flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm text-[var(--talos-text)] disabled:opacity-50" @click="emit('attach'); closePlusMenu()"><Paperclip class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> {{ $t('chat.attachFile') }}</button>
                <button type="button" role="menuitem" :disabled="!contextAvailable" class="talos-pressable flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm text-[var(--talos-text)] disabled:opacity-50" @click="emit('openContext'); closePlusMenu()"><Database class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> {{ $t('navigation.library') }}</button>
                <button type="button" role="menuitem" class="talos-pressable flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm text-[var(--talos-text)]" @click="emit('openModelLab'); closePlusMenu()"><SlidersHorizontal class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> {{ $t('navigation.modelLab') }}</button>
                <button type="button" role="menuitem" :aria-pressed="browseMode" class="talos-pressable flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm text-[var(--talos-text)]" @click="emit('toggleBrowse', !browseMode); closePlusMenu()"><Globe2 class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> {{ browseMode ? $t('chat.browseOn') : $t('chat.browseWeb') }}</button>
                <button type="button" role="menuitem" class="talos-pressable flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm text-[var(--talos-text)]" @click="closePlusMenu(); requestPromptEnhancement()"><Sparkles class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> {{ $t('chat.improvePrompt') }}</button>
            </div>
            </Transition>
        </div>

        <!-- F3-T4bis (owner #13): minimal Claude-style bar — "+", model chip, mic.
             Owner 2026-07-24 immersive: this controls row hides when the field
             is unfocused+empty (compact pill), and returns on focus/content. -->
        <!-- @pointerdown.prevent: a control tap must NOT blur the field / dismiss the
             keyboard in immersive mode (Android WebView blurs on pointerdown, before a
             mousedown handler could run). This row is not scrollable so cancelling its
             pointerdown default is safe. The "+" dropdown lives in the field wrapper
             above so it opens whether the pill is compact or expanded. -->
        <div v-if="drawerMode && !composerCompact" class="relative mt-1 flex min-w-0 items-center gap-2 border-t border-[var(--talos-border,var(--border))] pt-2" @pointerdown.prevent>
            <Button
                ref="plusTrigger"
                type="button"
                size="icon"
                variant="ghost"
                data-mobile-icon-only="true"
                :aria-label="$t('chat.addToChat')"
                :aria-haspopup="plusUsesMenu ? 'menu' : 'dialog'"
                :aria-expanded="plusUsesMenu ? plusMenuOpen : toolDrawerOpen"
                class="talos-pressable min-h-11 min-w-11 rounded-2xl"
                @click="openPlus"
            >
                <Plus class="size-5" aria-hidden="true" />
            </Button>
            <button
                ref="modelTrigger"
                type="button"
                data-testid="talos-composer-model-chip"
                :aria-label="$t('chat.chooseModelProfile')"
                :title="modelTitle"
                aria-haspopup="dialog"
                :aria-expanded="modelPickerOpen"
                class="talos-pressable flex min-h-11 min-w-0 items-center gap-2 rounded-2xl border border-[var(--talos-border,var(--border))] bg-[var(--talos-panel,var(--card))]/80 px-3"
                @click="toggleModelPicker"
            >
                <TalosMobileProviderIcon
                    v-if="selectedProfile"
                    :provider="selectedProfile.provider"
                    class="size-5 border-0 bg-transparent"
                />
                <span class="truncate text-sm font-medium text-[var(--talos-text,var(--foreground))]">
                    {{ selectedProfile?.display_name ?? $t('chat.chooseModel') }}
                </span>
                <span v-if="selectedProfile && (thinking || selectedEffort !== 'off')" class="shrink-0 text-xs text-[var(--talos-muted,var(--muted-foreground))]">
                    {{ thinking ? $t('chat.thinking') : effortLabel(selectedEffort) }}
                </span>
            </button>
            <button
                v-if="showLibraryChip"
                ref="libraryChip"
                type="button"
                data-testid="talos-composer-library-chip"
                :aria-label="$t('library.contextForNextMessage')"
                aria-haspopup="dialog"
                :aria-expanded="librarySheetOpen"
                class="talos-pressable flex min-h-11 max-w-40 shrink-0 items-center gap-1.5 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2.5 text-xs text-[var(--talos-muted)]"
                @click="librarySheetOpen = true"
            >
                <Database class="size-3.5 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                <span class="min-w-0 truncate">{{ libraryModeLabel }}</span>
                <span class="shrink-0">· {{ librarySourceCountLabel }}</span>
            </button>
            <span class="flex-1" aria-hidden="true" />
            <!-- The mic lives ONLY on the morphing right button (owner 2026-07-25):
                 a second control with the same accessible name was ambiguous for
                 assistive tech and gave the user two different mics to tap. -->
        </div>

        <div v-else-if="!composerCompact" class="mt-1 flex min-w-0 items-center justify-between gap-2 border-t border-[var(--talos-border,var(--border))] pt-2" @mousedown.prevent>
            <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                <Button
                    ref="modelTrigger"
                    type="button"
                    size="icon"
                    variant="outline"
                    data-mobile-icon-only="true"
                    :aria-label="$t('chat.chooseModelProfile')"
                    :title="modelTitle"
                    aria-haspopup="dialog"
                    :aria-expanded="modelPickerOpen"
                    class="min-h-11 min-w-11"
                    @click="toggleModelPicker"
                >
                    <TalosMobileProviderIcon
                        v-if="selectedProfile"
                        :provider="selectedProfile.provider"
                        class="size-5 border-0 bg-transparent"
                    />
                    <BrainCircuit v-else class="size-4" aria-hidden="true" />
                </Button>
                <Button
                    v-if="effortAvailable"
                    ref="effortTrigger"
                    type="button"
                    size="icon"
                    variant="outline"
                    data-mobile-icon-only="true"
                    :aria-label="$t('chat.chooseReasoningEffort')"
                    :title="$t('chat.effortValue', { effort: effortLabel(selectedEffort) })"
                    aria-haspopup="true"
                    :aria-expanded="modelPickerOpen"
                    class="min-h-11 min-w-11"
                    @click="toggleEffortPicker"
                >
                    <Gauge class="size-4" aria-hidden="true" />
                </Button>
                <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    data-mobile-icon-only="true"
                    :aria-label="$t('chat.improvePrompt')"
                    :title="enhanceUnavailableReason ?? $t('chat.improvePrompt')"
                    :disabled="sending || enhancingPrompt"
                    class="min-h-11 min-w-11"
                    @click="requestPromptEnhancement"
                >
                    <Sparkles class="size-4" aria-hidden="true" />
                </Button>
                <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    data-mobile-icon-only="true"
                    :aria-label="$t('chat.attachFile')"
                    :title="attachmentsAvailable ? $t('chat.attachFile') : attachmentReason"
                    :disabled="!attachmentsAvailable || sending || attachmentBusy"
                    class="min-h-11 min-w-11"
                    @click="emit('attach')"
                >
                    <Paperclip class="size-4" aria-hidden="true" />
                </Button>
                <!-- The mic lives ONLY on the morphing right button (owner 2026-07-25). -->
                <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    data-mobile-icon-only="true"
                    :aria-label="$t('chat.chooseGroundingContext')"
                    :title="contextAvailable ? $t('chat.chooseGroundingContext') : contextReason"
                    :disabled="!contextAvailable"
                    class="min-h-11 min-w-11"
                    @click="emit('openContext')"
                >
                    <Database class="size-4" aria-hidden="true" />
                </Button>
                <button
                    v-if="showLibraryChip"
                    ref="libraryChip"
                    type="button"
                    data-testid="talos-composer-library-chip"
                    :aria-label="$t('library.contextForNextMessage')"
                    aria-haspopup="dialog"
                    :aria-expanded="librarySheetOpen"
                    class="talos-pressable flex min-h-11 shrink-0 items-center gap-1.5 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2.5 text-xs text-[var(--talos-muted)]"
                    @click="librarySheetOpen = true"
                >
                    <Database class="size-3.5 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                    <span>{{ libraryModeLabel }} · {{ librarySourceCountLabel }}</span>
                </button>
                <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    data-mobile-icon-only="true"
                    :aria-label="browseMode ? $t('chat.disableBrowse') : $t('chat.enableBrowse')"
                    :title="browseMode ? $t('chat.disableBrowse') : $t('chat.enableBrowse')"
                    :aria-pressed="browseMode"
                    :disabled="browserBusy"
                    class="min-h-11 min-w-11"
                    :class="browseMode ? 'border-[var(--talos-accent)] bg-[var(--talos-accent-soft)] text-[var(--talos-accent)]' : ''"
                    @click="emit('toggleBrowse', !browseMode)"
                >
                    <Globe2 class="size-4" aria-hidden="true" />
                </Button>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    data-mobile-icon-only="true"
                    :aria-label="$t('chat.openModelLab')"
                    :title="$t('chat.openModelLab')"
                    class="min-h-11 min-w-11"
                    @click="emit('openModelLab')"
                >
                    <SlidersHorizontal class="size-4" aria-hidden="true" />
                </Button>
            </div>
        </div>

        <span class="sr-only" role="status" aria-live="polite">{{ statusText }}</span>

        <!-- F3-T4bis: organized tool drawer (drawer mode only). -->
        <TalosMobileComposerDrawer
            v-if="drawerMode && toolDrawerOpen"
            :can-enhance="canRequestEnhancement"
            :enhance-reason="enhanceUnavailableReason"
            :browse-mode="browseMode"
            :thinking="thinking"
            :supports-thinking="selectedProfile?.supports_thinking ?? false"
            :effort-levels="selectedProfile?.effort_levels ?? []"
            :selected-effort="selectedEffort"
            :attachments-available="attachmentsAvailable"
            :context-available="contextAvailable"
            @close="toolDrawerOpen = false"
            @attach="emit('attach')"
            @open-context="emit('openContext')"
            @open-model-lab="emit('openModelLab')"
            @toggle-browse="emit('toggleBrowse', $event)"
            @select-thinking="emit('selectThinking', $event)"
            @select-effort="emit('selectEffort', $event)"
            @enhance-prompt="requestPromptEnhancement"
        />

        <TalosMobileModelEffortDrawer
            v-if="modelPickerOpen"
            :model-profiles="modelProfiles"
            :routing-profiles="routingProfiles"
            :selected-model-profile-id="selectedModelProfileId"
            :selected-routing-profile-id="selectedRoutingProfileId"
            :selected-effort="selectedEffort"
            :thinking="thinking"
            :supports-thinking="selectedProfile?.supports_thinking ?? false"
            :effort-levels="selectedProfile?.effort_levels ?? []"
            :loading-models="loadingModels"
            :loading-routes="loadingRoutes"
            :refreshing-models="refreshingModels"
            @close="closeModelPicker"
            @select-model-profile="selectModelProfile"
            @select-model-routing-profile="selectRoutingProfile"
            @select-effort="selectEffort"
            @select-thinking="emit('selectThinking', $event)"
            @refresh-models="emit('refreshModels')"
            @open-model-lab="modelPickerOpen = false; emit('openModelLab')"
        />

        <TalosMobileEnhancerDrawer
            v-if="enhancerDrawerOpen"
            :enhancing="enhancingPrompt ?? false"
            :error="promptEnhancementError ?? ''"
            :result="promptEnhancement ?? null"
            :model-title="modelTitle"
            @close="dismissEnhancerDrawer"
            @cancel="emit('cancelPromptEnhancement')"
            @insert="emit('insertPromptEnhancement')"
            @replace="emit('replacePromptEnhancement')"
        />

        <TalosMobileLibraryContextSheet
            v-if="librarySheetOpen"
            :effective-enabled="libraryContextEnabled"
            :effective-mode="libraryContextMode"
            :override="libraryTurnOverride"
            :files="libraryFiles"
            @close="closeLibrarySheet"
            @update:override="emit('updateLibraryTurnOverride', $event)"
        />
    </section>
</template>
