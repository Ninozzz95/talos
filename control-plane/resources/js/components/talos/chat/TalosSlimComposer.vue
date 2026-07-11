<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
    BrainCircuit,
    Camera,
    ChevronDown,
    Database,
    Globe2,
    Loader2,
    Maximize2,
    Minimize2,
    MoreHorizontal,
    RefreshCw,
    ScanSearch,
    Send,
    ShieldAlert,
    SlidersHorizontal,
    Square,
    WandSparkles,
    X,
} from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Card from '../../ui/Card.vue'
import Textarea from '../../ui/Textarea.vue'
import TalosSlashCommandMenu from './TalosSlashCommandMenu.vue'
import TalosProviderIcon from '../models/TalosProviderIcon.vue'
import { isTalosCommandEnabled } from '../../../lib/commandRegistry'
import { filterTalosSlashCommands } from '../../../lib/talosSlashCommands'
import type { TalosBrowserCurrentPage, TalosBrowserMode, TalosCommand, TalosComposerMode } from '../../../lib/talosTypes'

const prompt = defineModel<string>('prompt', { required: true })

const props = defineProps<{
    commands: TalosCommand[]
    canSend: boolean
    sending: boolean
    statusText: string
    modelLabel: string
    modelProvider?: string | null
    contextLabel: string
    temporaryMode: boolean
    sendDisabledReason?: string
    enhancerDisabledReason?: string
    visibility: Record<string, boolean>
    browserMode: TalosBrowserMode
    browserCurrentPage?: TalosBrowserCurrentPage | null
    composerMode: TalosComposerMode
    chatLayoutLocked: boolean
}>()

const emit = defineEmits<{
    send: []
    openModel: []
    openContext: []
    openSettings: []
    enhance: []
    toggleTemporary: []
    toggleComposerMode: []
    enableBrowse: []
    disableBrowse: []
    stopBrowse: []
    restartBrowse: []
    captureScreenshot: []
    captureSnapshot: []
    slashCommand: [id: TalosCommand['id']]
    browseOpen: [url: string | null]
}>()

const enhanceTitle = computed(() => props.enhancerDisabledReason || 'Improve prompt')
const sendTitle = computed(() => props.sendDisabledReason || 'Send message')
const browseMenuOpen = ref(false)
const activeSlashIndex = ref(0)
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
    if (props.browserMode.status === 'failed') return 'Needs attention'
    if (props.browserMode.status === 'stopped') return 'Stopped'
    if (props.browserMode.status === 'active') return 'Active'
    return 'Ready'
})
const screenshotDisabled = computed(() => !props.browserMode.enabled || !['ready', 'active'].includes(props.browserMode.status) || !props.browserMode.capabilities.includes('screenshot'))
const snapshotDisabled = computed(() => !props.browserMode.enabled || !['ready', 'active'].includes(props.browserMode.status) || !props.browserMode.capabilities.includes('snapshot'))
const stopDisabled = computed(() => !props.browserMode.enabled || !['ready', 'active'].includes(props.browserMode.status))

watch(slashCommands, (commands) => {
    if (activeSlashIndex.value >= commands.length) activeSlashIndex.value = 0
})

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
    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        if (props.canSend) emit('send')
    }
}

function toggleBrowseMenu() {
    browseMenuOpen.value = !browseMenuOpen.value
}
function handleDocumentClick(event: MouseEvent) {
    if (browseMenuOpen.value && !(event.target as HTMLElement).closest('.talos-chat-composer-shell')) browseMenuOpen.value = false
}
function handleDocumentKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && browseMenuOpen.value) {
        event.preventDefault()
        browseMenuOpen.value = false
    }
}
watch(browseMenuOpen, (open) => {
    if (open) {
        document.addEventListener('click', handleDocumentClick)
        document.addEventListener('keydown', handleDocumentKeydown)
    } else {
        document.removeEventListener('click', handleDocumentClick)
        document.removeEventListener('keydown', handleDocumentKeydown)
    }
})
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

        <div data-testid="talos-composer-prompt-row" class="relative min-w-0">
            <Textarea
                v-model="prompt"
                rows="1"
                class="max-h-32 min-h-14 min-w-0 resize-none border-0 bg-transparent px-2 py-2 pr-14 shadow-none focus-visible:ring-0"
                placeholder="Message TALOS..."
                aria-label="Message TALOS"
                :disabled="sending"
                @keydown="handleKeydown"
            />
            <Button
                type="button"
                size="icon"
                class="absolute bottom-1 right-1"
                aria-label="Send"
                :title="sendTitle"
                :disabled="!canSend"
                @click="emit('send')"
            >
                <Loader2 v-if="sending" class="h-4 w-4 animate-spin" />
                <Send v-else class="h-4 w-4" />
            </Button>
        </div>

        <div data-testid="talos-composer-capability-row" class="mt-1 flex min-w-0 items-end justify-between gap-2 px-1 pb-1">
            <div v-if="composerMode === 'full'" class="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                <button
                    type="button"
                    class="inline-flex min-h-11 max-w-[min(13rem,45vw)] min-w-0 items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2.5 text-xs font-medium text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] lg:min-h-8"
                    aria-label="Choose model profile"
                    @click="emit('openModel')"
                >
                    <TalosProviderIcon v-if="modelProvider" :provider="modelProvider" class="h-6 w-6 border-0 bg-transparent" />
                    <BrainCircuit v-else class="h-3.5 w-3.5 shrink-0 text-[var(--talos-accent)]" />
                    <span class="truncate">{{ modelLabel }}</span>
                </button>
                <button
                    v-if="visibility.attach_files !== false"
                    type="button"
                    class="inline-flex min-h-11 max-w-[min(13rem,45vw)] min-w-0 items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2.5 text-xs font-medium text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] lg:min-h-8"
                    aria-label="Choose grounding context"
                    @click="emit('openContext')"
                >
                    <Database class="h-3.5 w-3.5 shrink-0 text-[var(--talos-accent)]" />
                    <span class="truncate">{{ contextLabel }}</span>
                </button>
                <button
                    v-if="visibility.agent_mode_switcher !== false"
                    type="button"
                    class="inline-flex min-h-11 items-center gap-1.5 rounded-md border px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] lg:min-h-8"
                    :class="temporaryMode ? 'border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] text-[var(--talos-text)]' : 'border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-muted)]'"
                    aria-label="Temporary chat"
                    :aria-pressed="temporaryMode"
                    @click="emit('toggleTemporary')"
                >
                    <ShieldAlert class="h-3.5 w-3.5 shrink-0" />
                    <span class="hidden sm:inline">{{ temporaryMode ? 'Temporary' : 'Persistent' }}</span>
                </button>
                <button
                    v-if="!browserMode.enabled"
                    type="button"
                    class="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2 text-xs text-[var(--talos-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] lg:min-h-8"
                    aria-label="Enable Browse"
                    title="Enable Browse"
                    @click="emit('enableBrowse')"
                >
                    <Globe2 class="h-3.5 w-3.5" />Browse
                </button>
                <div v-else class="relative flex shrink-0 items-center gap-1">
                    <button
                        type="button"
                        class="inline-flex min-h-11 max-w-36 items-center gap-1.5 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-2 text-xs text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] lg:min-h-8"
                        data-testid="talos-browse-mode"
                        :data-enabled="browserMode.enabled"
                        :aria-label="`Browse status: ${browseStatus}`"
                        aria-haspopup="menu"
                        :aria-expanded="browseMenuOpen"
                        @click="toggleBrowseMenu"
                    >
                        <Globe2 class="h-3.5 w-3.5 shrink-0" />
                        <span class="truncate">{{ browseStatus }}</span>
                        <ChevronDown class="h-3.5 w-3.5 shrink-0" />
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
                        <button type="button" role="menuitem" class="flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-xs text-[var(--talos-text)] hover:bg-[var(--talos-panel-soft)] disabled:cursor-not-allowed disabled:opacity-50" :disabled="snapshotDisabled" :title="snapshotDisabled ? 'Page structure capability is unavailable.' : 'Capture page structure'" @click="browseMenuOpen = false; emit('captureSnapshot')"><ScanSearch class="h-4 w-4" />Capture page structure</button>
                        <button type="button" role="menuitem" class="flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-xs text-[var(--talos-text)] hover:bg-[var(--talos-panel-soft)] disabled:cursor-not-allowed disabled:opacity-50" :disabled="stopDisabled" :title="stopDisabled ? 'The browser session is not running.' : 'Stop the current browser session'" @click="browseMenuOpen = false; emit('stopBrowse')"><Square class="h-4 w-4" />Stop browser</button>
                        <button type="button" role="menuitem" class="flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-xs text-[var(--talos-text)] hover:bg-[var(--talos-panel-soft)]" :title="browserMode.status === 'stopped' || browserMode.status === 'failed' ? 'Start a fresh browser session' : 'Restart the current browser session'" @click="browseMenuOpen = false; emit('restartBrowse')"><RefreshCw class="h-4 w-4" />{{ browserMode.status === 'stopped' || browserMode.status === 'failed' ? 'Retry browser' : 'Restart browser' }}</button>
                        <button type="button" role="menuitem" class="flex min-h-11 w-full items-center gap-2 rounded px-2 text-left text-xs text-[var(--talos-text)] hover:bg-[var(--talos-panel-soft)]" @click="browseMenuOpen = false; emit('disableBrowse')"><X class="h-4 w-4" />Disable Browse</button>
                    </div>
                </div>
                <span data-testid="talos-composer-status" class="sr-only" role="status" aria-live="polite">{{ statusText }}</span>
            </div>
            <div v-else data-testid="talos-composer-minimal-indicators" class="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-[11px] text-[var(--talos-muted)]">
                <button type="button" class="inline-flex min-h-11 min-w-0 max-w-44 items-center gap-1.5 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] lg:min-h-8" aria-label="Choose model profile" @click="emit('openModel')">
                    <TalosProviderIcon v-if="modelProvider" :provider="modelProvider" class="h-5 w-5 border-0 bg-transparent" />
                    <BrainCircuit v-else class="h-3.5 w-3.5 shrink-0 text-[var(--talos-accent)]" />
                    <span class="truncate">{{ modelLabel }}</span>
                </button>
                <span v-if="browserMode.enabled" role="status" class="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-2 text-[var(--talos-text)] lg:min-h-8" data-testid="talos-browse-mode" :data-enabled="browserMode.enabled" :aria-label="`Browse status: ${browseStatus}`">
                    <Globe2 class="h-3.5 w-3.5" />Browse {{ browseStatus }}
                </span>
                <span v-if="temporaryMode" class="inline-flex min-h-11 shrink-0 items-center lg:min-h-8" aria-label="Temporary chat active"><ShieldAlert class="h-3.5 w-3.5" /></span>
            </div>

            <div class="flex shrink-0 items-center gap-1">
                <template v-if="composerMode === 'full'">
                    <Button type="button" variant="ghost" size="icon" aria-label="Improve prompt" :title="enhanceTitle" :disabled="Boolean(enhancerDisabledReason)" @click="emit('enhance')"><WandSparkles class="h-4 w-4" /></Button>
                    <Button v-if="visibility.more_tools !== false" type="button" variant="ghost" size="icon" aria-label="Open settings" title="Open settings" @click="emit('openSettings')"><SlidersHorizontal class="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" aria-label="Use minimal composer" :title="chatLayoutLocked ? 'Chat appearance is locked by workspace policy.' : 'Use minimal composer'" :disabled="chatLayoutLocked" @click="emit('toggleComposerMode')"><Minimize2 class="h-4 w-4" /></Button>
                </template>
                <Button v-else type="button" variant="ghost" size="icon" aria-label="Use full composer" :title="chatLayoutLocked ? 'Chat appearance is locked by workspace policy.' : 'Use full composer'" :disabled="chatLayoutLocked" @click="emit('toggleComposerMode')"><Maximize2 class="h-4 w-4" /></Button>
            </div>
        </div>
    </Card>
</template>
