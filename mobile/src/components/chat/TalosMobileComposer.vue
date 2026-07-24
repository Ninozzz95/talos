<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref, watch, type ComponentPublicInstance } from 'vue'
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
import type {
    TalosMobileModelProfileView,
    TalosMobileRoutingProfileView,
} from '@/components/chat/mobileChatTypes'
import type { TalosMobileEffortLevel } from '@/lib/mobileEffort'
import type { TalosMobilePromptEnhancementResult } from '@/lib/chat/promptEnhancement'
import type { TalosMobileCommandId } from '@/lib/mobileCommandRegistry'
import type { TalosMobileAttachmentDraft } from '@/composables/useTalosMobileAttachments'


const TalosMobileSlashCommandMenu = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileSlashCommandMenu.vue'),
)
// F3-T4bis: the organized tool drawer loads only when drawer mode opens it.
const TalosMobileComposerDrawer = defineAsyncComponent(
    () => import('@/components/chat/TalosMobileComposerDrawer.vue'),
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
    attachmentDisabledReason: 'Vault file access is not available until the local Vault bridge is configured.',
    contextAvailable: false,
    contextDisabledReason: 'Context selection is not available until the local Context bridge is configured.',
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
}>()

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
// Owner 2026-07-24 — the "+" opens an anchored dropdown instead of the drawer.
const plusMenuOpen = ref(false)
const plusTrigger = ref<ComponentPublicInstance | HTMLElement | null>(null)
const plusMenu = ref<HTMLElement | null>(null)
async function openPlus(): Promise<void> {
    if (!props.plusDropdown) { toolDrawerOpen.value = true; return }
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
    return 'No model selected'
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
    if (selectedProfile.value === null) return 'Select a callable model before improving the prompt.'
    if (props.prompt.trim().length === 0) return 'Write a prompt first — Improve prompt rewrites your draft.'
    return null
})
const slashMenuOpen = computed(() => /^\/[^\s\n]*$/.test(props.prompt))
const statusText = computed(() => {
    if (props.sending) return 'Processing'
    if (props.attachmentBusy) return 'Adding files'
    if (attachmentBlocked.value) return 'Remove files that could not be added before sending'
    if (props.enhancingPrompt) return 'Improving prompt'
    if (props.promptEnhancementError) return props.promptEnhancementError
    return props.sendDisabledReason
})

function resizePrompt(): void {
    const field = promptField.value
    if (!field) return
    field.style.height = 'auto'
    field.style.height = `${Math.max(56, Math.min(field.scrollHeight, 192))}px`
}

function updatePrompt(event: Event): void {
    const field = event.currentTarget as HTMLTextAreaElement
    emit('update:prompt', field.value)
    resizePrompt()
}

function requestSend(value = promptField.value?.value ?? props.prompt): void {
    if (!props.canSend || props.sending || attachmentBlocked.value
        || (!value.trim() && !hasAuthorizedAttachment.value)) return
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

async function selectModelProfile(profileId: string): Promise<void> {
    emit('selectModelProfile', profileId)
    await closeModelPicker()
}

async function selectRoutingProfile(profileId: string): Promise<void> {
    emit('selectModelRoutingProfile', profileId)
    await closeModelPicker()
}

async function selectEffort(level: TalosMobileEffortLevel): Promise<void> {
    emit('selectEffort', level)
    await closeModelPicker()
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
        data-testid="talos-mobile-composer"
        class="relative mx-3 mb-[max(0.75rem,env(safe-area-inset-bottom))] rounded-2xl border border-[var(--talos-border,var(--border))] bg-[var(--talos-card,var(--card))]/95 p-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.10)] backdrop-blur"
        aria-label="Chat composer"
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
                :aria-label="`Open detected link ${browserSuggestionUrl}`"
                @click="emit('openBrowserUrl', browserSuggestionUrl)"
            >
                <ExternalLink class="size-4" aria-hidden="true" />
                <span class="sr-only">Open detected link</span>
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
                {{ dictationStarting ? 'Starting…' : 'Listening' }}
            </span>
            <button
                type="button"
                aria-label="Stop dictation"
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
            <button
                v-if="composerCompact"
                ref="plusTrigger"
                type="button"
                aria-label="Add to chat"
                :aria-haspopup="plusDropdown ? 'menu' : 'dialog'"
                :aria-expanded="plusDropdown ? plusMenuOpen : toolDrawerOpen"
                class="talos-pressable absolute bottom-1.5 left-1 z-10 flex size-10 items-center justify-center rounded-full text-[var(--talos-muted,var(--muted-foreground))]"
                @pointerdown.prevent
                @click="openPlus"
            >
                <Plus class="size-5" aria-hidden="true" />
            </button>
            <textarea
                ref="promptField"
                :value="prompt"
                rows="2"
                aria-label="Message TALOS"
                placeholder="Message TALOS..."
                class="max-h-48 min-h-14 w-full resize-none overflow-y-auto bg-transparent py-2 text-sm leading-6 text-[var(--talos-text,var(--foreground))] outline-none placeholder:text-[var(--talos-muted,var(--muted-foreground))]"
                :class="composerCompact ? 'pl-12 pr-24' : 'px-2 pr-14'"
                @input="updatePrompt"
                @keydown="onPromptKeydown"
                @focus="composerFocused = true"
                @blur="composerFocused = false"
            />
            <!-- One persistent shell that genuinely morphs Send↔Stop: only the
                 glyph transitions (~150ms), the button never unmounts. -->
            <Button
                type="button"
                size="icon"
                data-mobile-icon-only="true"
                :aria-label="sending ? 'Stop response' : 'Send message'"
                :title="sending ? 'Stop response' : (statusText || 'Send message')"
                :disabled="!sending && !canSubmit"
                class="talos-pressable absolute bottom-1.5 right-1.5 min-h-11 min-w-11 rounded-full bg-[var(--talos-accent,var(--primary))] text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                @click="sending ? emit('stop') : requestSend()"
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
                    <Square v-if="sending" class="size-4" aria-hidden="true" />
                    <ArrowUp v-else class="size-5" aria-hidden="true" />
                </Transition>
            </Button>

            <!-- compact immersive: mic sits inline, just left of Send. -->
            <button
                v-if="composerCompact && dictationSupported"
                type="button"
                :aria-label="dictationListening || dictationStarting ? 'Stop dictation' : 'Dictate'"
                :aria-pressed="dictationListening || dictationStarting"
                :disabled="sending && !dictationListening && !dictationStarting"
                class="talos-pressable absolute bottom-1.5 right-[3.25rem] z-10 flex size-10 items-center justify-center rounded-full text-[var(--talos-muted,var(--muted-foreground))] disabled:opacity-40"
                :class="dictationListening || dictationStarting ? '!text-[var(--talos-accent,var(--primary))]' : ''"
                @pointerdown.prevent
                @click="emit('toggleDictation')"
            >
                <Loader2 v-if="dictationStarting" class="size-4 animate-spin" aria-hidden="true" />
                <Mic v-else class="size-5" :class="dictationListening ? 'animate-pulse' : ''" aria-hidden="true" />
            </button>

            <!-- Owner 2026-07-24: ChatGPT-style "+" dropdown, anchored above the
                 composer so it opens whether the pill is compact or expanded. -->
            <div v-if="plusMenuOpen" class="fixed inset-0 z-[59]" aria-hidden="true" @click="closePlusMenu" />
            <div
                v-if="plusMenuOpen"
                ref="plusMenu"
                role="menu"
                tabindex="-1"
                data-testid="talos-composer-plus-menu"
                class="absolute bottom-full left-1 z-[60] mb-2 min-w-52 overflow-hidden rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-window-bg,var(--talos-card))] py-1 shadow-xl outline-none"
                @keydown.escape="closePlusMenu"
            >
                <button type="button" role="menuitem" data-testid="talos-plus-menu-attach" :disabled="!attachmentsAvailable" class="talos-pressable flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm text-[var(--talos-text)] disabled:opacity-50" @click="emit('attach'); closePlusMenu()"><Paperclip class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> Attach a file</button>
                <button type="button" role="menuitem" :disabled="!contextAvailable" class="talos-pressable flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm text-[var(--talos-text)] disabled:opacity-50" @click="emit('openContext'); closePlusMenu()"><Database class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> Library</button>
                <button type="button" role="menuitem" class="talos-pressable flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm text-[var(--talos-text)]" @click="emit('openModelLab'); closePlusMenu()"><SlidersHorizontal class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> Model Lab</button>
                <button type="button" role="menuitem" :aria-pressed="browseMode" class="talos-pressable flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm text-[var(--talos-text)]" @click="emit('toggleBrowse', !browseMode); closePlusMenu()"><Globe2 class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> {{ browseMode ? 'Browsing on' : 'Browse the web' }}</button>
                <button type="button" role="menuitem" class="talos-pressable flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm text-[var(--talos-text)]" @click="emit('enhancePrompt'); closePlusMenu()"><Sparkles class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> Improve prompt</button>
            </div>
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
                variant="outline"
                data-mobile-icon-only="true"
                aria-label="Add to chat"
                :aria-haspopup="plusDropdown ? 'menu' : 'dialog'"
                :aria-expanded="plusDropdown ? plusMenuOpen : toolDrawerOpen"
                class="talos-pressable min-h-11 min-w-11 rounded-full"
                @click="openPlus"
            >
                <Plus class="size-5" aria-hidden="true" />
            </Button>
            <button
                ref="modelTrigger"
                type="button"
                data-testid="talos-composer-model-chip"
                aria-label="Choose model profile"
                :title="modelTitle"
                aria-haspopup="dialog"
                :aria-expanded="modelPickerOpen"
                class="talos-pressable flex min-h-11 min-w-0 items-center gap-2 rounded-full border border-[var(--talos-border,var(--border))] bg-[var(--talos-panel,var(--card))]/80 px-3"
                @click="toggleModelPicker"
            >
                <TalosMobileProviderIcon
                    v-if="selectedProfile"
                    :provider="selectedProfile.provider"
                    class="size-5 border-0 bg-transparent"
                />
                <span class="truncate text-sm font-medium text-[var(--talos-text,var(--foreground))]">
                    {{ selectedProfile?.display_name ?? 'Choose model' }}
                </span>
                <span v-if="selectedProfile && (thinking || selectedEffort !== 'off')" class="shrink-0 text-xs text-[var(--talos-muted,var(--muted-foreground))]">
                    {{ thinking ? 'Thinking' : selectedEffort.charAt(0).toUpperCase() + selectedEffort.slice(1) }}
                </span>
            </button>
            <span class="flex-1" aria-hidden="true" />
            <Button
                v-if="dictationSupported"
                type="button"
                size="icon"
                variant="outline"
                data-mobile-icon-only="true"
                :aria-label="dictationListening || dictationStarting ? 'Stop dictation' : 'Dictate'"
                :title="dictationStarting ? 'Starting dictation…' : (dictationListening ? 'Stop dictation' : 'Dictate')"
                :aria-pressed="dictationListening || dictationStarting"
                :disabled="sending && !dictationListening && !dictationStarting"
                class="talos-pressable min-h-11 min-w-11 rounded-full"
                :class="dictationListening || dictationStarting
                    ? 'border-[var(--talos-accent,var(--primary))] text-[var(--talos-accent,var(--primary))]'
                    : ''"
                @click="emit('toggleDictation')"
            >
                <!-- F5-#29: the tap ALWAYS answers visually — spinner while the
                     recognizer arms, pulse while it truly listens. -->
                <Loader2 v-if="dictationStarting" class="size-4 animate-spin" aria-hidden="true" />
                <Mic v-else class="size-4" :class="dictationListening ? 'animate-pulse' : ''" aria-hidden="true" />
            </Button>
        </div>

        <div v-else-if="!composerCompact" class="mt-1 flex min-w-0 items-center justify-between gap-2 border-t border-[var(--talos-border,var(--border))] pt-2" @mousedown.prevent>
            <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                <Button
                    ref="modelTrigger"
                    type="button"
                    size="icon"
                    variant="outline"
                    data-mobile-icon-only="true"
                    aria-label="Choose model profile"
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
                    aria-label="Choose reasoning effort"
                    :title="`Effort: ${selectedEffort}`"
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
                    aria-label="Improve prompt"
                    :title="enhanceUnavailableReason ?? 'Improve prompt'"
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
                    aria-label="Attach a file"
                    :title="attachmentsAvailable ? 'Attach a file' : attachmentDisabledReason"
                    :disabled="!attachmentsAvailable || sending || attachmentBusy"
                    class="min-h-11 min-w-11"
                    @click="emit('attach')"
                >
                    <Paperclip class="size-4" aria-hidden="true" />
                </Button>
                <Button
                    v-if="dictationSupported"
                    type="button"
                    size="icon"
                    variant="outline"
                    data-mobile-icon-only="true"
                    :aria-label="dictationListening || dictationStarting ? 'Stop dictation' : 'Dictate'"
                    :title="dictationStarting ? 'Starting dictation…' : (dictationListening ? 'Stop dictation' : 'Dictate')"
                    :aria-pressed="dictationListening || dictationStarting"
                    :disabled="sending && !dictationListening && !dictationStarting"
                    class="talos-pressable min-h-11 min-w-11"
                    :class="dictationListening || dictationStarting
                        ? 'border-[var(--talos-accent,var(--primary))] text-[var(--talos-accent,var(--primary))]'
                        : ''"
                    @click="emit('toggleDictation')"
                >
                    <Loader2 v-if="dictationStarting" class="size-4 animate-spin" aria-hidden="true" />
                    <Mic v-else class="size-4" :class="dictationListening ? 'animate-pulse' : ''" aria-hidden="true" />
                </Button>
                <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    data-mobile-icon-only="true"
                    aria-label="Choose grounding context"
                    :title="contextAvailable ? 'Choose grounding context' : contextDisabledReason"
                    :disabled="!contextAvailable"
                    class="min-h-11 min-w-11"
                    @click="emit('openContext')"
                >
                    <Database class="size-4" aria-hidden="true" />
                </Button>
                <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    data-mobile-icon-only="true"
                    :aria-label="browseMode ? 'Disable Browse mode' : 'Enable Browse mode'"
                    :title="browseMode ? 'Disable Browse mode' : 'Enable Browse mode'"
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
                    aria-label="Open Model Lab"
                    title="Open Model Lab"
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
    </section>
</template>
