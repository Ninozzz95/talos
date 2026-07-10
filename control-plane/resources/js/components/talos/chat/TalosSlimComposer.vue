<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { BrainCircuit, Database, Loader2, Send, ShieldAlert, SlidersHorizontal, WandSparkles } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Card from '../../ui/Card.vue'
import Textarea from '../../ui/Textarea.vue'
import TalosSlashCommandMenu from './TalosSlashCommandMenu.vue'
import { isTalosCommandEnabled } from '../../../lib/commandRegistry'
import { filterTalosSlashCommands } from '../../../lib/talosSlashCommands'
import type { TalosCommand } from '../../../lib/talosTypes'

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
}>()

const emit = defineEmits<{
    send: []
    openModel: []
    openContext: []
    openSettings: []
    enhance: []
    toggleTemporary: []
    slashCommand: [id: TalosCommand['id']]
    browseOpen: [url: string | null]
}>()

const enhanceTitle = computed(() => props.enhancerDisabledReason || 'Improve prompt')
const sendTitle = computed(() => props.sendDisabledReason || 'Send message')
const activeSlashIndex = ref(0)
const slashQuery = computed(() => {
    const value = prompt.value

    if (!value.startsWith('/')) {
        return null
    }

    const commandInput = value.slice(1)

    if (commandInput.includes('\n')) {
        return null
    }

    return commandInput.trimStart()
})
const slashCommands = computed(() => slashQuery.value === null
    ? []
    : filterTalosSlashCommands(props.commands, slashQuery.value))
const slashMenuOpen = computed(() => slashQuery.value !== null && slashCommands.value.length > 0)
const activeSlashCommand = computed(() => slashCommands.value[activeSlashIndex.value] ?? slashCommands.value[0] ?? null)

watch(slashCommands, (commands) => {
    if (activeSlashIndex.value >= commands.length) {
        activeSlashIndex.value = 0
    }
})

function handleEnter() {
    if (props.canSend) {
        emit('send')
    }
}

function selectSlashCommand(command: TalosCommand) {
    if (!isTalosCommandEnabled(command)) {
        return
    }

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

function selectActiveSlashCommand() {
    const command = activeSlashCommand.value

    if (command) {
        selectSlashCommand(command)
    }
}

function browseOpenUrl() {
    const match = prompt.value.trim().match(/^\/browse\s+open\s+(https?:\/\/\S+)$/i)

    return match?.[1] ?? null
}

function handleKeydown(event: KeyboardEvent) {
    const url = browseOpenUrl()
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
            selectActiveSlashCommand()
            return
        }
    }

    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        handleEnter()
    }
}
</script>

<template>
    <Card class="talos-chat-composer-shell talos-action-composer pointer-events-auto relative mx-auto w-full max-w-[820px] border-[var(--talos-border-strong)] bg-[var(--talos-card)]/95 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur" :padded="false">
        <TalosSlashCommandMenu
            v-if="slashMenuOpen"
            class="absolute inset-x-0 bottom-full mb-3"
            :commands="commands"
            :query="slashQuery ?? ''"
            :active-index="activeSlashIndex"
            @selected="(id) => {
                const command = slashCommands.find((item) => item.id === id)
                if (command) {
                    selectSlashCommand(command)
                }
            }"
        />

        <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto_auto] items-center gap-1 px-1 pb-2">
            <button
                type="button"
                class="inline-flex h-8 min-w-0 items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2.5 text-xs font-medium text-[var(--talos-text)] transition hover:border-[var(--talos-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                aria-label="Choose model profile"
                @click="emit('openModel')"
            >
                <BrainCircuit class="h-3.5 w-3.5 shrink-0 text-[var(--talos-accent)]" />
                <span class="truncate">{{ modelLabel }}</span>
            </button>
            <button
                v-if="visibility.attach_files !== false"
                type="button"
                class="inline-flex h-8 min-w-0 items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2.5 text-xs font-medium text-[var(--talos-text)] transition hover:border-[var(--talos-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                aria-label="Choose grounding context"
                @click="emit('openContext')"
            >
                <Database class="h-3.5 w-3.5 shrink-0 text-[var(--talos-accent)]" />
                <span class="truncate">{{ contextLabel }}</span>
            </button>
            <button
                v-if="visibility.agent_mode_switcher !== false"
                type="button"
                class="inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                :class="temporaryMode
                    ? 'border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] text-[var(--talos-text)]'
                    : 'border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-muted)] hover:border-[var(--talos-accent)] hover:text-[var(--talos-text)]'"
                aria-label="Temporary chat"
                :aria-pressed="temporaryMode"
                @click="emit('toggleTemporary')"
            >
                <ShieldAlert class="h-3.5 w-3.5 shrink-0" />
                <span class="hidden sm:inline">{{ temporaryMode ? 'Temporary' : 'Persistent' }}</span>
            </button>
            <button
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-muted)] transition hover:border-[var(--talos-accent)] hover:text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Improve prompt"
                :title="enhanceTitle"
                :disabled="Boolean(enhancerDisabledReason)"
                @click="emit('enhance')"
            >
                <WandSparkles class="h-4 w-4" />
            </button>
            <button
                v-if="visibility.more_tools !== false"
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-muted)] transition hover:border-[var(--talos-accent)] hover:text-[var(--talos-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                aria-label="Open settings"
                @click="emit('openSettings')"
            >
                <SlidersHorizontal class="h-4 w-4" />
            </button>
        </div>

        <Textarea
            v-model="prompt"
            rows="1"
            class="max-h-32 min-h-12 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0"
            placeholder="Message TALOS..."
            aria-label="Message TALOS"
            :disabled="sending"
            @keydown="handleKeydown"
        />

        <div class="flex items-center justify-between gap-3 px-2 pb-1 pt-2">
            <div class="min-w-0 truncate text-xs text-[var(--talos-muted)]">
                <span v-if="temporaryMode" class="mr-2 font-semibold text-[var(--talos-warning)]">Temporary mode</span>
                <span>{{ statusText }}</span>
            </div>
            <Button size="sm" :disabled="!canSend" :title="sendTitle" @click="emit('send')">
                <Loader2 v-if="sending" class="h-4 w-4 animate-spin" />
                <Send v-else class="h-4 w-4" />
                Send
            </Button>
        </div>
    </Card>
</template>
