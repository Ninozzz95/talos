<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref, watch, type ComponentPublicInstance } from 'vue'
import {
    ArrowUp,
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
    Square,
} from '@lucide/vue'
import TalosMobileAttachmentTray from '@/components/chat/TalosMobileAttachmentTray.vue'
import TalosMobileComposerModelPicker from '@/components/chat/TalosMobileComposerModelPicker.vue'
import TalosMobileEffortPicker from '@/components/chat/TalosMobileEffortPicker.vue'
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

const TalosMobilePromptEnhancerPopover = defineAsyncComponent(
    () => import('@/components/chat/TalosMobilePromptEnhancerPopover.vue'),
)
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
    // F3-T4bis (owner #13): Claude-style minimal bar + organized tool drawer.
    drawerMode?: boolean
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
    drawerMode: false,
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
    cancelPromptEnhancement: []
    insertPromptEnhancement: []
    replacePromptEnhancement: []
    selectSlashCommand: [commandId: TalosMobileCommandId]
    toggleBrowse: [enabled: boolean]
    openBrowserUrl: [url: string]
}>()

const composerRoot = ref<HTMLElement | null>(null)
const promptField = ref<HTMLTextAreaElement | null>(null)
const modelTrigger = ref<ComponentPublicInstance | HTMLElement | null>(null)
const effortTrigger = ref<ComponentPublicInstance | null>(null)
const modelPopover = ref<HTMLElement | null>(null)
const modelPickerOpen = ref(false)
const effortPickerOpen = ref(false)
const slashActiveIndex = ref(0)
const slashCommandCount = ref(0)
const slashMenu = ref<{ activateSelected(): void } | null>(null)
const toolDrawerOpen = ref(false)

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
    if (!canRequestEnhancement.value) return
    modelPickerOpen.value = false
    effortPickerOpen.value = false
    emit('enhancePrompt')
}

function selectSlashCommand(commandId: TalosMobileCommandId): void {
    emit('selectSlashCommand', commandId)
}

function updateSlashCommandCount(count: number): void {
    slashCommandCount.value = count
    if (count === 0) slashActiveIndex.value = 0
    else slashActiveIndex.value = Math.min(slashActiveIndex.value, count - 1)
}

async function focusInitialModelOption(): Promise<void> {
    await nextTick()
    const selected = modelPopover.value?.querySelector<HTMLButtonElement>(
        '[role="option"][aria-selected="true"]:not(:disabled)',
    )
    const first = modelPopover.value?.querySelector<HTMLButtonElement>(
        '[role="option"]:not(:disabled)',
    )
    ;(selected ?? first)?.focus()
}

async function toggleModelPicker(): Promise<void> {
    modelPickerOpen.value = !modelPickerOpen.value
    effortPickerOpen.value = false
    if (modelPickerOpen.value) await focusInitialModelOption()
}

async function toggleEffortPicker(): Promise<void> {
    effortPickerOpen.value = !effortPickerOpen.value
    modelPickerOpen.value = false
    if (effortPickerOpen.value) {
        await nextTick()
        composerRoot.value?.querySelector<HTMLButtonElement>(
            '[data-testid="talos-mobile-effort-level"][aria-pressed="true"]',
        )?.focus()
    }
}

function focusTrigger(trigger: ComponentPublicInstance | HTMLElement | null): void {
    const element = trigger instanceof HTMLElement ? trigger : (trigger?.$el as HTMLElement | undefined)
    element?.focus()
}

async function closeModelPicker(): Promise<void> {
    modelPickerOpen.value = false
    await nextTick()
    focusTrigger(modelTrigger.value)
}

async function closeEffortPicker(): Promise<void> {
    effortPickerOpen.value = false
    await nextTick()
    focusTrigger(effortTrigger.value)
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
    await closeEffortPicker()
}

function focusPrompt(): boolean {
    const field = promptField.value
    if (!field || field.disabled) return false
    field.focus()
    return document.activeElement === field
}

defineExpose({ focusPrompt })

watch(() => props.prompt, () => {
    slashActiveIndex.value = 0
    if (slashMenuOpen.value) {
        modelPickerOpen.value = false
        effortPickerOpen.value = false
    }
    nextTick(resizePrompt)
}, { immediate: true })
</script>

<template>
    <section
        ref="composerRoot"
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

        <div
            v-if="enhancingPrompt || promptEnhancementError || promptEnhancement"
            id="talos-mobile-prompt-enhancer-popover"
            class="absolute bottom-full left-0 right-0 z-50 mb-2"
            aria-live="polite"
        >
            <div
                v-if="enhancingPrompt"
                data-testid="talos-mobile-enhancer-status"
                role="status"
                class="rounded-xl border border-[var(--talos-border,var(--border))] bg-[var(--talos-card,var(--popover))] px-3 py-3 text-sm text-[var(--talos-muted,var(--muted-foreground))] shadow-xl"
            >
                Improving prompt with {{ modelTitle }}…
            </div>
            <div
                v-else-if="promptEnhancementError"
                data-testid="talos-mobile-enhancer-error"
                role="alert"
                class="rounded-md border border-[var(--talos-danger,#dc5b5b)] bg-[var(--talos-card,var(--popover))] px-3 py-3 text-sm text-[var(--talos-danger,#dc5b5b)] shadow-xl"
            >
                {{ promptEnhancementError }}
            </div>
            <TalosMobilePromptEnhancerPopover
                v-else-if="promptEnhancement"
                :result="promptEnhancement"
                @cancel="emit('cancelPromptEnhancement')"
                @insert="emit('insertPromptEnhancement')"
                @replace="emit('replacePromptEnhancement')"
            />
        </div>

        <div ref="modelPopover" class="relative">
            <div
                v-if="modelPickerOpen"
                id="talos-mobile-model-picker-popover"
                class="absolute bottom-full left-0 right-0 z-40 mb-2 rounded-xl border border-[var(--talos-border,var(--border))] bg-[var(--talos-card,var(--popover))] p-2 shadow-xl"
            >
                <TalosMobileComposerModelPicker
                    :model-profiles="modelProfiles"
                    :routing-profiles="routingProfiles"
                    :selected-model-profile-id="selectedModelProfileId"
                    :selected-routing-profile-id="selectedRoutingProfileId"
                    :loading-models="loadingModels"
                    :loading-routes="loadingRoutes"
                    :refreshing-models="refreshingModels"
                    @select-model-profile="selectModelProfile"
                    @select-model-routing-profile="selectRoutingProfile"
                    @request-close="closeModelPicker"
                    @refresh-models="emit('refreshModels')"
                    @open-model-lab="emit('openModelLab')"
                />
            </div>
        </div>

        <div
            v-if="effortPickerOpen"
            id="talos-mobile-effort-picker-popover"
            class="absolute bottom-full left-2 right-2 z-40 mb-2 rounded-xl border border-[var(--talos-border,var(--border))] bg-[var(--talos-card,var(--popover))] p-3 shadow-xl"
        >
            <TalosMobileEffortPicker
                :effort-levels="selectedProfile?.effort_levels ?? []"
                :selected-effort="selectedEffort"
                :supports-thinking="selectedProfile?.supports_thinking ?? false"
                :thinking="thinking"
                @select-effort="selectEffort"
                @select-thinking="emit('selectThinking', $event)"
                @request-close="closeEffortPicker"
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

        <div class="relative min-w-0">
            <textarea
                ref="promptField"
                :value="prompt"
                rows="2"
                aria-label="Message TALOS"
                placeholder="Message TALOS..."
                class="max-h-48 min-h-14 w-full resize-none overflow-y-auto bg-transparent px-2 py-2 pr-14 text-sm leading-6 text-[var(--talos-text,var(--foreground))] outline-none placeholder:text-[var(--talos-muted,var(--muted-foreground))]"
                @input="updatePrompt"
                @keydown="onPromptKeydown"
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
        </div>

        <!-- F3-T4bis (owner #13): minimal Claude-style bar — "+", model chip, mic. -->
        <div v-if="drawerMode" class="mt-1 flex min-w-0 items-center gap-2 border-t border-[var(--talos-border,var(--border))] pt-2">
            <Button
                type="button"
                size="icon"
                variant="outline"
                data-mobile-icon-only="true"
                aria-label="Add to chat"
                class="talos-pressable min-h-11 min-w-11 rounded-full"
                @click="toolDrawerOpen = true"
            >
                <Plus class="size-5" aria-hidden="true" />
            </Button>
            <button
                ref="modelTrigger"
                type="button"
                data-testid="talos-composer-model-chip"
                aria-label="Choose model profile"
                :title="modelTitle"
                aria-haspopup="listbox"
                :aria-expanded="modelPickerOpen"
                aria-controls="talos-mobile-model-picker-popover"
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
                :aria-label="dictationListening ? 'Stop dictation' : 'Dictate'"
                :title="dictationListening ? 'Stop dictation' : 'Dictate'"
                :aria-pressed="dictationListening"
                :disabled="sending"
                class="talos-pressable min-h-11 min-w-11 rounded-full"
                :class="dictationListening
                    ? 'border-[var(--talos-accent,var(--primary))] text-[var(--talos-accent,var(--primary))]'
                    : ''"
                @click="emit('toggleDictation')"
            >
                <Mic class="size-4" :class="dictationListening ? 'animate-pulse' : ''" aria-hidden="true" />
            </Button>
        </div>

        <div v-else class="mt-1 flex min-w-0 items-center justify-between gap-2 border-t border-[var(--talos-border,var(--border))] pt-2">
            <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                <Button
                    ref="modelTrigger"
                    type="button"
                    size="icon"
                    variant="outline"
                    data-mobile-icon-only="true"
                    aria-label="Choose model profile"
                    :title="modelTitle"
                    aria-haspopup="listbox"
                    :aria-expanded="modelPickerOpen"
                    aria-controls="talos-mobile-model-picker-popover"
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
                    :aria-expanded="effortPickerOpen"
                    aria-controls="talos-mobile-effort-picker-popover"
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
                    :title="selectedProfile ? 'Improve prompt' : (sendDisabledReason || 'Select a callable model before improving the prompt.')"
                    :disabled="!canRequestEnhancement"
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
                    :aria-label="dictationListening ? 'Stop dictation' : 'Dictate'"
                    :title="dictationListening ? 'Stop dictation' : 'Dictate'"
                    :aria-pressed="dictationListening"
                    :disabled="sending"
                    class="talos-pressable min-h-11 min-w-11"
                    :class="dictationListening
                        ? 'border-[var(--talos-accent,var(--primary))] text-[var(--talos-accent,var(--primary))]'
                        : ''"
                    @click="emit('toggleDictation')"
                >
                    <Mic class="size-4" :class="dictationListening ? 'animate-pulse' : ''" aria-hidden="true" />
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
        <Transition
            leave-active-class="transition duration-200 ease-in"
            leave-to-class="opacity-0 translate-y-4"
        >
        <TalosMobileComposerDrawer
            v-if="drawerMode && toolDrawerOpen"
            :can-enhance="canRequestEnhancement"
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
            @enhance-prompt="emit('enhancePrompt')"
        />
        </Transition>
    </section>
</template>
