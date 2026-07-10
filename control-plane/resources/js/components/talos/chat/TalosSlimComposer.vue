<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
    BrainCircuit,
    Camera,
    ChevronDown,
    Database,
    Expand,
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
    WandSparkles,
    X,
} from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Card from '../../ui/Card.vue'
import Textarea from '../../ui/Textarea.vue'
import TalosSlashCommandMenu from './TalosSlashCommandMenu.vue'
import { isTalosCommandEnabled } from '../../../lib/commandRegistry'
import { filterTalosSlashCommands } from '../../../lib/talosSlashCommands'
import type { TalosBrowserMode, TalosCommand, TalosComposerMode } from '../../../lib/talosTypes'

const prompt = defineModel<string>('prompt', { required: true })

const props = defineProps<{
    commands: TalosCommand[]
    canSend: boolean
    sending: boolean
    statusText: string
    modelLabel: string
    contextLabel: string
    temporaryMode: boolean
    sendDisabledReason?: string
    enhancerDisabledReason?: string
    visibility: Record<string, boolean>
    browserMode: TalosBrowserMode
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
    if (props.browserMode.status === 'active') return 'Active'
    return 'Ready'
})
const screenshotDisabled = computed(() => !props.browserMode.enabled || !['ready', 'active'].includes(props.browserMode.status) || !props.browserMode.capabilities.includes('screenshot'))
const snapshotDisabled = computed(() => !props.browserMode.enabled || !['ready', 'active'].includes(props.browserMode.status) || !props.browserMode.capabilities.includes('snapshot'))

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
onMounted(() => {
    document.addEventListener('click', handleDocumentClick)
    document.addEventListener('keydown', handleDocumentKeydown)
})
onBeforeUnmount(() => {
    document.removeEventListener('click', handleDocumentClick)
    document.removeEventListener('keydown', handleDocumentKeydown)
})
</script>

<template>
    <Card class="talos-chat-composer-shell talos-action-composer pointer-events-auto relative mx-auto w-full max-w-[820px] min-w-0 border-[var(--talos-border-strong)] bg-[var(--talos-card)]/95 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur" :padded="false" :data-composer-mode="composerMode">
        <TalosSlashCommandMenu
            v-if="slashMenuOpen"
            class="absolute inset-x-0 bottom-full mb-3"
            :commands="commands"
            :query="slashQuery ?? ''"
            :active-index="activeSlashIndex"
            @selected="(id) => {
                const command = slashCommands.find((item) => item.id === id)
                if (command) selectSlashCommand(command)
            }"
        />

        <div v-if="composerMode === 'full'" class="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto_auto_auto] items-center gap-1 px-1 pb-2">
            <button type="button" class="inline-flex h-8 min-w-0 items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2.5 text-xs font-medium text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]" aria-label="Choose model profile" @click="emit('openModel')">
                <BrainCircuit class="h-3.5 w-3.5 shrink-0 text-[var(--talos-accent)]" /><span class="truncate">{{ modelLabel }}</span>
            </button>
            <button v-if="visibility.attach_files !== false" type="button" class="inline-flex h-8 min-w-0 items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2.5 text-xs font-medium text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]" aria-label="Choose grounding context" @click="emit('openContext')">
                <Database class="h-3.5 w-3.5 shrink-0 text-[var(--talos-accent)]" /><span class="truncate">{{ contextLabel }}</span>
            </button>
            <button v-if="visibility.agent_mode_switcher !== false" type="button" class="inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]" :class="temporaryMode ? 'border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] text-[var(--talos-text)]' : 'border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-muted)]'" aria-label="Temporary chat" :aria-pressed="temporaryMode" @click="emit('toggleTemporary')">
                <ShieldAlert class="h-3.5 w-3.5 shrink-0" /><span class="hidden sm:inline">{{ temporaryMode ? 'Temporary' : 'Persistent' }}</span>
            </button>
            <button type="button" class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]" aria-label="Improve prompt" :title="enhanceTitle" :disabled="Boolean(enhancerDisabledReason)" @click="emit('enhance')"><WandSparkles class="h-4 w-4" /></button>
            <button v-if="visibility.more_tools !== false" type="button" class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]" aria-label="Open settings" @click="emit('openSettings')"><SlidersHorizontal class="h-4 w-4" /></button>
            <button type="button" class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] disabled:cursor-not-allowed disabled:opacity-50" aria-label="Use minimal composer" :title="chatLayoutLocked ? 'Chat appearance is locked by workspace policy.' : 'Use minimal composer'" :disabled="chatLayoutLocked" @click="emit('toggleComposerMode')"><Minimize2 class="h-4 w-4" /></button>
        </div>

        <div v-if="composerMode === 'full'" class="flex min-w-0 items-center gap-1 px-1 pb-1">
            <button v-if="composerMode === 'minimal'" type="button" class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]" aria-label="Use full composer" title="Use full composer" @click="emit('toggleComposerMode')"><Maximize2 class="h-4 w-4" /></button>
            <button v-if="!browserMode.enabled" type="button" class="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2 text-xs text-[var(--talos-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]" aria-label="Enable Browse" title="Enable Browse" @click="emit('enableBrowse')"><Globe2 class="h-3.5 w-3.5" />Browse</button>
            <div v-else class="relative flex shrink-0 items-center gap-1">
                <button type="button" class="inline-flex h-8 max-w-36 items-center gap-1.5 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-2 text-xs text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]" data-testid="talos-browse-mode" :data-enabled="browserMode.enabled" :aria-label="`Browse status: ${browseStatus}`" @click="toggleBrowseMenu"><Globe2 class="h-3.5 w-3.5 shrink-0" /><span class="truncate">{{ browseStatus }}</span><ChevronDown class="h-3.5 w-3.5 shrink-0" /></button>
                <button type="button" class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] disabled:cursor-not-allowed disabled:opacity-50" aria-label="Capture browser screenshot" :title="screenshotDisabled ? 'Browse is not ready or screenshot capability is unavailable.' : 'Capture browser screenshot'" :disabled="screenshotDisabled" @click="emit('captureScreenshot')"><Camera class="h-4 w-4" /></button>
                <button type="button" class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]" aria-label="Browse actions" title="Browse actions" @click="toggleBrowseMenu"><MoreHorizontal class="h-4 w-4" /></button>
                <div v-if="browseMenuOpen" class="absolute bottom-full left-0 z-50 mb-2 w-52 rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] p-1 shadow-xl">
                    <button type="button" class="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs text-[var(--talos-text)] hover:bg-[var(--talos-panel-soft)] disabled:cursor-not-allowed disabled:opacity-50" :disabled="snapshotDisabled" :title="snapshotDisabled ? 'Page structure capability is unavailable.' : 'Capture page structure'" @click="browseMenuOpen = false; emit('captureSnapshot')"><ScanSearch class="h-4 w-4" />Capture page structure</button>
                    <button type="button" class="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs text-[var(--talos-text)] hover:bg-[var(--talos-panel-soft)]" title="Restart the current browser session" @click="browseMenuOpen = false; emit('restartBrowse')"><RefreshCw class="h-4 w-4" />Restart browser</button>
                    <button type="button" class="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs text-[var(--talos-text)] hover:bg-[var(--talos-panel-soft)]" @click="browseMenuOpen = false; emit('disableBrowse')"><X class="h-4 w-4" />Disable Browse</button>
                </div>
            </div>
        </div>

        <div v-if="composerMode === 'minimal' && browserMode.enabled" class="flex min-w-0 px-1 pb-1">
            <span role="img" class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] text-[var(--talos-text)]" data-testid="talos-browse-mode" :data-enabled="browserMode.enabled" :aria-label="`Browse status: ${browseStatus}`" :title="`Browse ${browseStatus}`"><Globe2 class="h-4 w-4" /></span>
        </div>

        <Textarea v-model="prompt" rows="1" class="max-h-32 min-h-12 min-w-0 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0" placeholder="Message TALOS..." aria-label="Message TALOS" :disabled="sending" @keydown="handleKeydown" />

        <div class="flex min-w-0 items-center gap-3 px-2 pb-1 pt-2" :class="composerMode === 'full' ? 'justify-between' : 'justify-end'">
            <div v-if="composerMode === 'full'" class="min-w-0 truncate text-xs text-[var(--talos-muted)]"><span v-if="temporaryMode" class="mr-2 font-semibold text-[var(--talos-warning)]">Temporary mode</span><span class="truncate">{{ statusText }}</span></div>
            <template v-if="composerMode === 'minimal'">
                <button type="button" class="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[var(--talos-accent)] text-[var(--talos-accent-contrast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] disabled:cursor-not-allowed disabled:opacity-50" aria-label="Send" :title="sendTitle" :disabled="!canSend" @click="emit('send')"><Loader2 v-if="sending" class="h-4 w-4 animate-spin" /><Send v-else class="h-4 w-4" /></button>
                <button type="button" class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] disabled:cursor-not-allowed disabled:opacity-50" aria-label="Use full composer" :title="chatLayoutLocked ? 'Chat appearance is locked by workspace policy.' : 'Use full composer'" :disabled="chatLayoutLocked" @click="emit('toggleComposerMode')"><Maximize2 class="h-4 w-4" /></button>
            </template>
            <Button v-else size="sm" :disabled="!canSend" :title="sendTitle" @click="emit('send')"><Loader2 v-if="sending" class="h-4 w-4 animate-spin" /><Send v-else class="h-4 w-4" />Send</Button>
        </div>
    </Card>
</template>
