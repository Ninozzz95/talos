<script setup lang="ts">
import { computed, defineAsyncComponent, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
    BrainCircuit,
    Camera,
    ChevronDown,
    Database,
    FileText,
    Globe2,
    Loader2,
    MoreHorizontal,
    Paperclip,
    RefreshCw,
    ScanSearch,
    Send,
    ShieldAlert,
    ShieldCheck,
    SlidersHorizontal,
    Square,
    WandSparkles,
    X,
} from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Card from '../../ui/Card.vue'
import Tooltip from '../../ui/Tooltip.vue'
import Textarea from '../../ui/Textarea.vue'
import TalosSlashCommandMenu from './TalosSlashCommandMenu.vue'
import TalosProviderIcon from '../models/TalosProviderIcon.vue'
import { Gauge } from '@lucide/vue'
import { isTalosCommandEnabled } from '../../../lib/commandRegistry'
import { filterTalosSlashCommands } from '../../../lib/talosSlashCommands'
import { talosEffortLabel, talosEffortLadderFromLevels } from '../../../lib/talosEffort'
import type { TalosDictationStatus, TalosResolvedDictationMode } from '../../../composables/useTalosDictation'
import type { TalosDictationMode } from '../../../lib/talosDictationModes'
import type { TalosBrowserCurrentPage, TalosBrowserMode, TalosBrowserRecoveryAction, TalosCommand, TalosComposerMode } from '../../../lib/talosTypes'

const TalosDictationStatusPanel = defineAsyncComponent(() => import('./TalosDictationStatus.vue'))
const dictationAsyncControlClass = 'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-muted)] lg:min-h-8'
const TalosDictationButtonLoading = defineComponent({
    name: 'TalosDictationButtonLoading',
    inheritAttrs: false,
    setup: () => () => h('span', {
        class: dictationAsyncControlClass,
        'aria-hidden': 'true',
    }, [h(Loader2, { class: 'h-4 w-4 animate-spin' })]),
})
const TalosDictationButtonError = defineComponent({
    name: 'TalosDictationButtonError',
    inheritAttrs: false,
    setup: () => () => h('button', {
        type: 'button',
        disabled: true,
        class: `${dictationAsyncControlClass} opacity-60`,
        'aria-label': 'Dictation control unavailable',
        title: 'Dictation control could not load. Reload TALOS to try again.',
    }, [h(ShieldAlert, { class: 'h-4 w-4' })]),
})
const TalosDictationButton = defineAsyncComponent({
    loader: () => import('./TalosDictationButton.vue'),
    loadingComponent: TalosDictationButtonLoading,
    errorComponent: TalosDictationButtonError,
    delay: 0,
    timeout: 10_000,
    onError: (_error, retry, fail, attempts) => { if (attempts < 2) retry(); else fail() },
})

const prompt = defineModel<string>('prompt', { required: true })

const props = withDefaults(defineProps<{
    commands: TalosCommand[]
    canSend: boolean
    sending: boolean
    streamingActive?: boolean
    statusText: string
    modelLabel: string
    modelProvider?: string | null
    selectedEffort?: string
    thinking?: boolean
    effortLevels?: string[]
    supportsThinking?: boolean
    contextLabel: string
    temporaryMode: boolean
    sendDisabledReason?: string
    enhancerDisabledReason?: string
    visibility: Record<string, boolean>
    browserMode: TalosBrowserMode
    browserRecoveryAction?: TalosBrowserRecoveryAction
    browseSetupFault?: string | null
    browserCurrentPage?: TalosBrowserCurrentPage | null
    devBrowserEvidence?: boolean
    composerMode: TalosComposerMode
    attachments?: Array<{ id: string; file_id: string | null; grant_id: string | null; name: string; status: string; failure_reason: string | null }>
    vaultFiles?: Array<{ id: string; original_name: string; status: string }>
    vaultPickerLoading?: boolean
    lastUserPrompt?: string | null
    dictationStatus?: TalosDictationStatus
    dictationError?: string | null
    dictationMode?: TalosDictationMode
    dictationRecordingStartedAt?: number | null
    dictationResolvedMode?: TalosResolvedDictationMode | null
    dictationSupported?: boolean
}>(), {
    devBrowserEvidence: false,
    browserRecoveryAction: 'restart',
    browseSetupFault: null,
    attachments: () => [],
    vaultFiles: () => [],
    vaultPickerLoading: false,
    lastUserPrompt: null,
    dictationStatus: 'idle',
    dictationError: null,
    dictationMode: 'local',
    dictationRecordingStartedAt: null,
    dictationResolvedMode: null,
    dictationSupported: false,
    selectedEffort: 'high',
    thinking: false,
    effortLevels: () => [],
    supportsThinking: false,
    streamingActive: false,
})

const emit = defineEmits<{
    send: []
    cancelStream: []
    openModel: []
    selectEffort: [level: string]
    selectThinking: [enabled: boolean]
    openContext: []
    openSettings: []
    enhance: []
    toggleTemporary: []
    enableBrowse: []
    disableBrowse: []
    stopBrowse: []
    restartBrowse: []
    recoverBrowse: []
    captureScreenshot: []
    captureSnapshot: []
    slashCommand: [id: TalosCommand['id']]
    browseOpen: [url: string | null]
    attachFiles: [files: File[]]
    attachVaultFile: [fileId: string]
    removeAttachment: [id: string]
    openVaultPicker: []
    toggleDictation: []
    finishDictation: []
    cancelDictation: []
    retryDictation: []
}>()

const attachmentInput = ref<HTMLInputElement | null>(null)
const attachmentMenuOpen = ref(false)
const effortPopoverOpen = ref(false)
const effortChipRoot = ref<HTMLElement | null>(null)

// The effort ladder is built from the selected model's real effort_levels
// (never hardcoded); 'off' is always available.
const effortLadder = computed(() => talosEffortLadderFromLevels(props.effortLevels))
const effortChipLabel = computed(() => `Effort · ${talosEffortLabel(props.selectedEffort)}`)

function toggleEffortPopover() {
    effortPopoverOpen.value = !effortPopoverOpen.value
}

function chooseEffort(level: string) {
    emit('selectEffort', level)
    effortPopoverOpen.value = false
}

function toggleThinking() {
    emit('selectThinking', !props.thinking)
}

function openAttachmentMenu() {
    attachmentMenuOpen.value = !attachmentMenuOpen.value
    if (attachmentMenuOpen.value) emit('openVaultPicker')
}

function handleAttachmentInput(event: Event) {
    const input = event.target instanceof HTMLInputElement ? event.target : null
    const files = input?.files ? [...input.files] : []
    if (files.length > 0) emit('attachFiles', files)
    if (input) input.value = ''
    attachmentMenuOpen.value = false
}

const enhanceTitle = computed(() => props.enhancerDisabledReason || 'Improve prompt')
const sendTitle = computed(() => (
    props.streamingActive ? 'Stop response' : (props.sendDisabledReason || 'Send message')
))
const browseMenuOpen = ref(false)
const promptRow = ref<HTMLElement | null>(null)
const promptField = ref<{ $el?: unknown } | HTMLTextAreaElement | null>(null)
const activeSlashIndex = ref(0)

function promptFieldElement(): HTMLTextAreaElement | null {
    const candidate = promptField.value
    const element = candidate && typeof candidate === 'object' && '$el' in candidate ? candidate.$el : candidate
    return element instanceof HTMLTextAreaElement ? element : null
}

function focusPrompt() {
    const field = promptFieldElement()
    if (!field || field.disabled) return
    field.focus()
}

defineExpose({ focusPrompt })
const slashQuery = computed(() => {
    const value = prompt.value
    if (!value.startsWith('/')) return null
    const commandInput = value.slice(1)
    if (commandInput.includes('\n')) return null
    return commandInput.trimStart()
})
const slashCommands = computed(() => slashQuery.value === null ? [] : filterTalosSlashCommands(props.commands, slashQuery.value))
const slashMenuOpen = computed(() => slashQuery.value !== null && slashCommands.value.length > 0)
const activeSlashCommand = computed(() => slashCommands.value[activeSlashIndex.value] ?? slashCommands.value[0] ?? null)
const browseStatus = computed(() => {
    if (!props.browserMode.enabled) return 'Off'
    if (props.browserMode.status === 'starting') return 'Starting'
    if (props.browserMode.status === 'recovery_required') return 'Recovery required'
    if (props.browserMode.status === 'failed') return 'Needs attention'
    if (props.browserMode.status === 'stopped') return 'Stopped'
    if (props.browserMode.status === 'active') return 'Active'
    return 'Ready'
})
const browserNeedsRetry = computed(() => ['recovery_required', 'stopped', 'failed'].includes(props.browserMode.status))
const browserRecoveryLabel = computed(() => props.browserRecoveryAction === 'recover_task'
    ? 'Recover browser task'
    : 'Start fresh browser session')
const browserRecoveryTitle = computed(() => props.browserRecoveryAction === 'recover_task'
    ? 'Recover the durable Browser task without redispatching its action'
    : 'Close the unusable Browser session and continue with a fresh session')
const screenshotDisabled = computed(() => !props.browserMode.enabled || !['ready', 'active'].includes(props.browserMode.status) || !props.browserMode.capabilities.includes('screenshot'))
const snapshotDisabled = computed(() => !props.devBrowserEvidence || !props.browserMode.enabled || !['ready', 'active'].includes(props.browserMode.status) || !props.browserMode.capabilities.includes('snapshot'))
const stopDisabled = computed(() => !props.browserMode.enabled || !['ready', 'active'].includes(props.browserMode.status))

watch(slashCommands, (commands) => {
    if (activeSlashIndex.value >= commands.length) activeSlashIndex.value = 0
})

function resizePromptField(event?: Event) {
    const eventTarget = event?.target
    const field = eventTarget instanceof HTMLTextAreaElement
        ? eventTarget
        : promptFieldElement()

    if (!field) return
    field.style.height = 'auto'
    field.style.height = `${field.scrollHeight}px`
}

watch(prompt, () => {
    void nextTick(() => resizePromptField())
}, { flush: 'post' })

function selectSlashCommand(command: TalosCommand) {
    if (!isTalosCommandEnabled(command)) return
    const rawInput = prompt.value.trim()
    if (command.id === 'open_browse') {
        const match = rawInput.match(/^\/browse\s+open\s+(https?:\/\/\S+)$/i)
        prompt.value = ''
        emit('browseOpen', match?.[1] ?? null)
        return
    }
    prompt.value = ''
    emit('slashCommand', command.id)
}

function handleKeydown(event: KeyboardEvent) {
    const url = prompt.value.trim().match(/^\/browse\s+open\s+(https?:\/\/\S+)$/i)?.[1] ?? null
    if (url && event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        prompt.value = ''
        emit('browseOpen', url)
        return
    }
    if (slashMenuOpen.value) {
        if (event.key === 'ArrowDown') {
            event.preventDefault()
            activeSlashIndex.value = (activeSlashIndex.value + 1) % slashCommands.value.length
            return
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault()
            activeSlashIndex.value = (activeSlashIndex.value - 1 + slashCommands.value.length) % slashCommands.value.length
            return
        }
        if (event.key === 'Escape') {
            event.preventDefault()
            prompt.value = ''
            activeSlashIndex.value = 0
            return
        }
        if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault()
            if (activeSlashCommand.value) selectSlashCommand(activeSlashCommand.value)
            return
        }
    }
    if (event.key === 'ArrowUp' && !prompt.value && props.lastUserPrompt) {
        event.preventDefault()
        prompt.value = props.lastUserPrompt
        return
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
        event.preventDefault()
        if (prompt.value.trim() && !props.sending) emit('send')
    }
}

function handlePrimaryAction() {
    if (props.streamingActive) {
        emit('cancelStream')
        return
    }
    emit('send')
}

function toggleBrowseMenu() {
    browseMenuOpen.value = !browseMenuOpen.value
}
function handleDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement
    if (browseMenuOpen.value && !target.closest('.talos-chat-composer-shell')) browseMenuOpen.value = false
    if (effortPopoverOpen.value && !effortChipRoot.value?.contains(target)) effortPopoverOpen.value = false
}
function handleDocumentKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    if (browseMenuOpen.value) {
        event.preventDefault()
        browseMenuOpen.value = false
    }
    if (effortPopoverOpen.value) {
        event.preventDefault()
        effortPopoverOpen.value = false
    }
}
watch([browseMenuOpen, effortPopoverOpen], ([browse, effort]) => {
    if (browse || effort) {
        document.addEventListener('click', handleDocumentClick)
        document.addEventListener('keydown', handleDocumentKeydown)
    } else {
        document.removeEventListener('click', handleDocumentClick)
        document.removeEventListener('keydown', handleDocumentKeydown)
    }
})
onMounted(() => resizePromptField())
onBeforeUnmount(() => {
    document.removeEventListener('click', handleDocumentClick)
    document.removeEventListener('keydown', handleDocumentKeydown)
})
</script>

<template>
    <Card
        class="talos-chat-composer-shell talos-action-composer pointer-events-auto relative mx-auto w-full max-w-[820px] min-w-0 border-[var(--talos-border-strong)] bg-[var(--talos-card)]/95 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur"
        :padded="false"
        :data-composer-mode="composerMode"
    >
        <TalosSlashCommandMenu
            v-if="slashMenuOpen"
            class="absolute inset-x-0 bottom-full z-50 mb-3 max-h-[min(24rem,55vh)] overflow-y-auto"
            :commands="commands"
            :query="slashQuery ?? ''"
            :active-index="activeSlashIndex"
            @selected="(id) => {
                const command = slashCommands.find((item) => item.id === id)
                if (command) selectSlashCommand(command)
            }"
        />

        <div ref="promptRow" data-testid="talos-composer-prompt-row" class="relative min-w-0">
            <Textarea
                ref="promptField"
                v-model="prompt"
                rows="1"
                class="talos-composer-textarea max-h-[min(16rem,35vh)] min-h-14 min-w-0 resize-none overflow-y-auto border-0 bg-transparent px-2 py-2 pr-14 shadow-none focus-visible:ring-0"
                placeholder="Message TALOS..."
                aria-label="Message TALOS"
                :disabled="sending"
                @input="resizePromptField"
                @keydown="handleKeydown"
            />
            <Tooltip :content="sendTitle">
                <Button
                    type="button"
                    size="icon"
                    class="absolute bottom-1 right-1"
                    :aria-label="streamingActive ? 'Stop response' : 'Send'"
                    :disabled="streamingActive ? false : !canSend"
                    @click="handlePrimaryAction"
                >
                    <Square v-if="streamingActive" class="h-4 w-4" />
                    <Loader2 v-else-if="sending" class="h-4 w-4 animate-spin" />
                    <Send v-else class="h-4 w-4" />
                </Button>
            </Tooltip>
        </div>

        <div
            v-if="!browserMode.enabled && browseSetupFault"
            data-testid="talos-browse-setup-fault"
            role="alert"
            class="mx-1 mt-1 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-2 py-1.5 text-xs text-[var(--talos-text)]"
        >
            {{ browseSetupFault }}
        </div>
        <div v-if="attachments.length > 0" data-testid="talos-attachment-tray" class="mx-1 mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            <span
                v-for="attachment in attachments"
                :key="attachment.id"
                data-testid="talos-attachment-chip"
                :data-attachment-id="attachment.id"
                :data-attachment-status="attachment.status"
                :data-authorized="attachment.status === 'available' && attachment.grant_id ? 'true' : 'false'"
                class="inline-flex min-w-0 max-w-56 items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
                :class="[attachment.status === 'failed'
                    ? 'border-[var(--talos-danger-border,var(--talos-warning-border))] bg-[var(--talos-warning-soft)] text-[var(--talos-text)]'
                    : 'border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-text)]',
                attachment.status === 'available' && attachment.grant_id ? 'talos-chip-authorized' : '']"
                :title="attachment.status === 'failed' ? (attachment.failure_reason ?? 'Ingestion failed.') : attachment.name"
            >
                <Loader2 v-if="attachment.status === 'uploading'" class="h-3.5 w-3.5 shrink-0 animate-spin" />
                <FileText v-else class="h-3.5 w-3.5 shrink-0 text-[var(--talos-accent)]" />
                <span class="truncate">{{ attachment.name }}</span>
                <ShieldCheck
                    v-if="attachment.status === 'available' && attachment.grant_id"
                    class="h-3.5 w-3.5 shrink-0 text-[var(--talos-success)]"
                    aria-label="Authorized file grant"
                />
                <span v-if="attachment.status === 'failed'" class="shrink-0 font-medium">failed</span>
                <button
                    type="button"
                    class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-[var(--talos-panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                    :aria-label="`Remove attachment ${attachment.name}`"
                    @click="emit('removeAttachment', attachment.id)"
                >
                    <X class="h-3 w-3" />
                </button>
            </span>
        </div>
        <TalosDictationStatusPanel
            v-if="dictationStatus !== 'idle'"
            :status="dictationStatus"
            :error="dictationError"
            :recording-started-at="dictationRecordingStartedAt"
            :resolved-mode="dictationResolvedMode"
            @finish="emit('finishDictation')"
            @cancel="emit('cancelDictation')"
            @retry="emit('retryDictation')"
        />
        <div data-testid="talos-composer-capability-row" class="mt-1 flex min-w-0 items-end justify-between gap-2 px-1 pb-1">
            <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                <Tooltip content="Model">
                    <button
                        type="button"
                        class="inline-flex min-h-11 min-w-11 max-w-11 items-center justify-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-0 text-xs font-medium text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] lg:min-h-8"
                        :class="composerMode === 'full' ? 'sm:max-w-[min(13rem,45vw)] sm:justify-start sm:px-2.5' : ''"
                        aria-label="Choose model profile"
                        @click="emit('openModel')"
                    >
                        <TalosProviderIcon v-if="modelProvider" :provider="modelProvider" class="h-6 w-6 border-0 bg-transparent" />
                        <BrainCircuit v-else class="h-3.5 w-3.5 shrink-0 text-[var(--talos-accent)]" />
                        <span data-testid="talos-composer-model-label" :class="composerMode === 'full' ? 'hidden truncate sm:inline' : 'hidden'">{{ modelLabel }}</span>
                    </button>
                </Tooltip>
                <div ref="effortChipRoot" class="relative flex shrink-0 items-center">
                    <Tooltip content="Reasoning effort">
                        <button
                            type="button"
                            data-testid="talos-composer-effort-chip"
                            class="inline-flex min-h-11 min-w-11 max-w-11 items-center justify-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-0 text-xs font-medium text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] lg:min-h-8"
                            :class="composerMode === 'full' ? 'sm:max-w-[min(11rem,45vw)] sm:justify-start sm:px-2.5' : ''"
                            aria-label="Choose reasoning effort"
                            aria-haspopup="true"
                            :aria-expanded="effortPopoverOpen"
                            @click="toggleEffortPopover"
                        >
                            <Gauge class="h-3.5 w-3.5 shrink-0 text-[var(--talos-accent)]" />
                            <span data-testid="talos-composer-effort-label" :class="composerMode === 'full' ? 'hidden truncate sm:inline' : 'hidden'">{{ effortChipLabel }}</span>
                        </button>
                    </Tooltip>
                    <div
                        v-if="effortPopoverOpen"
                        data-testid="talos-effort-popover"
                        class="talos-elev-3 absolute bottom-full left-0 z-50 mb-2 w-64 rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] p-2 text-[var(--talos-text)]"
                    >
                        <div class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Reasoning effort</div>
                        <div class="mt-2 flex flex-wrap gap-1" role="group" aria-label="Reasoning effort levels">
                            <button
                                v-for="level in effortLadder"
                                :key="level"
                                type="button"
                                data-testid="talos-effort-level"
                                :data-effort-level="level"
                                :aria-pressed="level === selectedEffort"
                                class="min-h-8 rounded-md border px-2.5 text-xs font-medium transition-colors"
                                :class="level === selectedEffort
                                    ? 'border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)] text-[var(--talos-accent)]'
                                    : 'border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-muted)] hover:bg-[var(--talos-active)]'"
                                @click="chooseEffort(level)"
                            >
                                {{ talosEffortLabel(level) }}
                            </button>
                        </div>
                        <label
                            v-if="supportsThinking"
                            class="mt-3 flex items-center justify-between gap-2 border-t border-[var(--talos-border)] pt-2 text-xs text-[var(--talos-text)]"
                        >
                            <span class="min-w-0">Extended thinking</span>
                            <button
                                type="button"
                                role="switch"
                                data-testid="talos-thinking-toggle"
                                :aria-checked="thinking"
                                class="relative h-5 w-9 shrink-0 rounded-full transition-colors"
                                :class="thinking ? 'bg-[var(--talos-accent)]' : 'bg-[var(--talos-border)]'"
                                @click="toggleThinking"
                            >
                                <span
                                    class="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
                                    :class="thinking ? 'translate-x-4' : 'translate-x-0.5'"
                                ></span>
                            </button>
                        </label>
                        <p v-if="effortLadder.length <= 1" class="mt-2 text-[11px] leading-4 text-[var(--talos-muted)]">
                            This model runs without a reasoning setting.
                        </p>
                    </div>
                </div>
                <Tooltip v-if="visibility.attach_files !== false" content="Grounding context">
                    <button
                        type="button"
                        class="inline-flex min-h-11 min-w-11 max-w-11 items-center justify-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-0 text-xs font-medium text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] lg:min-h-8"
                        :class="composerMode === 'full' ? 'sm:max-w-[min(13rem,45vw)] sm:justify-start sm:px-2.5' : ''"
                        aria-label="Choose grounding context"
                        @click="emit('openContext')"
                    >
                        <Database class="h-3.5 w-3.5 shrink-0 text-[var(--talos-accent)]" />
                        <span data-testid="talos-composer-context-label" :class="composerMode === 'full' ? 'hidden truncate sm:inline' : 'hidden'">{{ contextLabel }}</span>
                    </button>
                </Tooltip>
                <div v-if="visibility.attach_files !== false" class="relative flex shrink-0 items-center">
                    <input
                        ref="attachmentInput"
                        data-testid="talos-attachment-input"
                        type="file"
                        class="sr-only"
                        aria-label="Attachment file input"
                        @change="handleAttachmentInput"
                    >
                    <Tooltip content="Attach a file">
                        <button
                            type="button"
                            data-testid="talos-attachment-button"
                            class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-0 text-xs text-[var(--talos-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] lg:min-h-8"
                            aria-label="Attach a file"
                            aria-haspopup="menu"
                            :aria-expanded="attachmentMenuOpen"
                            @click="openAttachmentMenu"
                        >
                            <Paperclip class="h-3.5 w-3.5" />
                        </button>
                    </Tooltip>
                    <div
                        v-if="attachmentMenuOpen"
                        role="menu"
                        aria-label="Attachment sources"
                        data-testid="talos-attachment-menu"
                        class="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] p-1 shadow-xl"
                    >
                        <button
                            type="button"
                            role="menuitem"
                            class="flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-xs text-[var(--talos-text)] hover:bg-[var(--talos-panel-soft)]"
                            @click="attachmentInput?.click()"
                        >
                            <Paperclip class="h-4 w-4" />Upload a file
                        </button>
                        <div class="border-t border-[var(--talos-border)] px-2 py-1.5 text-[10px] font-semibold uppercase text-[var(--talos-muted)]" role="presentation">From Vault</div>
                        <div v-if="vaultPickerLoading" class="px-2 py-1.5 text-xs text-[var(--talos-muted)]" role="presentation">Loading Vault files…</div>
                        <div v-else-if="vaultFiles.length === 0" class="px-2 py-1.5 text-xs text-[var(--talos-muted)]" role="presentation">No available Vault files yet.</div>
                        <button
                            v-for="vaultFile in vaultFiles.slice(0, 6)"
                            :key="vaultFile.id"
                            type="button"
                            role="menuitem"
                            data-testid="talos-attachment-vault-file"
                            class="flex min-h-11 w-full min-w-0 items-center gap-2 rounded px-2 text-left text-xs text-[var(--talos-text)] hover:bg-[var(--talos-panel-soft)]"
                            @click="emit('attachVaultFile', vaultFile.id); attachmentMenuOpen = false"
                        >
                            <FileText class="h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
                            <span class="truncate">{{ vaultFile.original_name }}</span>
                        </button>
                    </div>
                </div>
                <Tooltip v-if="visibility.agent_mode_switcher !== false" content="Temporary chat">
                    <button
                        type="button"
                        class="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md border text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] lg:min-h-8"
                        :class="[
                            temporaryMode ? 'border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] text-[var(--talos-text)]' : 'border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-muted)]',
                            composerMode === 'full' ? 'px-2' : 'px-0',
                        ]"
                        aria-label="Temporary chat"
                        :aria-pressed="temporaryMode"
                        @click="emit('toggleTemporary')"
                    >
                        <ShieldAlert class="h-3.5 w-3.5 shrink-0" />
                        <span :class="composerMode === 'full' ? 'hidden sm:inline' : 'hidden'">{{ temporaryMode ? 'Temporary' : 'Persistent' }}</span>
                    </button>
                </Tooltip>
                <Tooltip v-if="!browserMode.enabled" content="Enable browsing">
                    <button
                        type="button"
                        class="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-0 text-xs text-[var(--talos-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] lg:min-h-8"
                        :class="composerMode === 'full' ? 'sm:px-2' : 'sm:px-0'"
                        aria-label="Enable Browse"
                        @click="emit('enableBrowse')"
                    >
                        <Globe2 class="h-3.5 w-3.5" />
                        <span data-testid="talos-composer-browse-label" :class="composerMode === 'full' ? 'hidden sm:inline' : 'hidden'">Browse</span>
                    </button>
                </Tooltip>
                <div v-else class="relative flex shrink-0 items-center gap-1">
                    <button
                        type="button"
                        class="inline-flex min-h-11 min-w-11 max-w-11 items-center justify-center gap-1.5 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-0 text-xs text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] lg:min-h-8"
                        :class="composerMode === 'full' ? 'sm:max-w-36 sm:justify-start sm:px-2' : 'sm:max-w-11 sm:justify-center sm:px-0'"
                        data-testid="talos-browse-mode"
                        :data-enabled="browserMode.enabled"
                        :aria-label="`Browse status: ${browseStatus}`"
                        aria-haspopup="menu"
                        :aria-expanded="browseMenuOpen"
                        @click="toggleBrowseMenu"
                    >
                        <Globe2 class="h-3.5 w-3.5 shrink-0" />
                        <span data-testid="talos-composer-browse-label" :class="composerMode === 'full' ? 'hidden truncate sm:inline' : 'hidden'">{{ browseStatus }}</span>
                        <ChevronDown :class="composerMode === 'full' ? 'hidden h-3.5 w-3.5 shrink-0 sm:block' : 'hidden'" />
                    </button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Capture browser screenshot"
                        :title="screenshotDisabled ? 'Browse is not ready or screenshot capability is unavailable.' : 'Capture browser screenshot'"
                        :disabled="screenshotDisabled"
                        @click="emit('captureScreenshot')"
                    >
                        <Camera class="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label="Browse actions" title="Browse actions" :aria-expanded="browseMenuOpen" aria-haspopup="menu" @click="toggleBrowseMenu">
                        <MoreHorizontal class="h-4 w-4" />
                    </Button>
                    <div
                        v-if="browseMenuOpen"
                        role="menu"
                        aria-label="Browse actions"
                        class="absolute bottom-full left-0 z-50 mb-2 w-56 rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] p-1 shadow-xl"
                    >
                        <div v-if="browserCurrentPage" data-testid="talos-browser-current-page" class="border-b border-[var(--talos-border)] px-2 py-2 text-xs" role="presentation">
                            <div class="truncate font-medium text-[var(--talos-text)]" :title="browserCurrentPage.title">{{ browserCurrentPage.title }}</div>
                            <div class="mt-0.5 truncate text-[var(--talos-muted)]" :title="browserCurrentPage.url">{{ browserCurrentPage.host }}</div>
                        </div>
                        <button v-if="devBrowserEvidence" type="button" role="menuitem" class="flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-xs text-[var(--talos-text)] hover:bg-[var(--talos-panel-soft)] disabled:cursor-not-allowed disabled:opacity-50" :disabled="snapshotDisabled" :title="snapshotDisabled ? 'Page structure capability is unavailable.' : 'Capture page structure'" @click="browseMenuOpen = false; emit('captureSnapshot')"><ScanSearch class="h-4 w-4" />Capture page structure</button>
                        <button type="button" role="menuitem" class="flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-xs text-[var(--talos-text)] hover:bg-[var(--talos-panel-soft)] disabled:cursor-not-allowed disabled:opacity-50" :disabled="stopDisabled" :title="stopDisabled ? 'The browser session is not running.' : 'Stop the current browser session'" @click="browseMenuOpen = false; emit('stopBrowse')"><Square class="h-4 w-4" />Stop browser</button>
                        <button v-if="browserNeedsRetry" type="button" role="menuitem" class="flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-xs text-[var(--talos-text)] hover:bg-[var(--talos-panel-soft)]" :title="browserRecoveryTitle" @click="browseMenuOpen = false; emit('recoverBrowse')"><RefreshCw class="h-4 w-4" />{{ browserRecoveryLabel }}</button>
                        <button v-else type="button" role="menuitem" class="flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-xs text-[var(--talos-text)] hover:bg-[var(--talos-panel-soft)]" title="Restart the current browser session" @click="browseMenuOpen = false; emit('restartBrowse')"><RefreshCw class="h-4 w-4" />Restart browser</button>
                        <button type="button" role="menuitem" class="flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-xs text-[var(--talos-text)] hover:bg-[var(--talos-panel-soft)]" @click="browseMenuOpen = false; emit('disableBrowse')"><X class="h-4 w-4" />Disable Browse</button>
                    </div>
                </div>
                <span data-testid="talos-composer-status" class="sr-only" role="status" aria-live="polite">{{ statusText }}</span>
            </div>

            <div class="flex shrink-0 items-center gap-1">
                <Tooltip :content="enhanceTitle">
                    <Button type="button" variant="ghost" size="icon" data-testid="talos-composer-enhance" aria-label="Improve prompt" :disabled="Boolean(enhancerDisabledReason)" @click="emit('enhance')"><WandSparkles class="h-4 w-4" /></Button>
                </Tooltip>
                <TalosDictationButton
                    v-if="dictationSupported"
                    :status="dictationStatus"
                    :supported="dictationSupported"
                    @toggle="emit('toggleDictation')"
                />
                <Tooltip v-if="visibility.more_tools !== false" content="More tools">
                    <Button type="button" variant="ghost" size="icon" aria-label="Open settings" @click="emit('openSettings')"><SlidersHorizontal class="h-4 w-4" /></Button>
                </Tooltip>
            </div>
        </div>
    </Card>
</template>
