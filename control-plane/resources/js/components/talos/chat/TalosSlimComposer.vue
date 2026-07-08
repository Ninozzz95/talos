<script setup lang="ts">
import { computed } from 'vue'
import { BrainCircuit, Database, Loader2, Send, ShieldAlert, SlidersHorizontal, WandSparkles } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Card from '../../ui/Card.vue'
import Textarea from '../../ui/Textarea.vue'

const prompt = defineModel<string>('prompt', { required: true })

const props = defineProps<{
    canSend: boolean
    sending: boolean
    statusText: string
    modelLabel: string
    contextLabel: string
    temporaryMode: boolean
    enhancerDisabledReason?: string
}>()

const emit = defineEmits<{
    send: []
    openModel: []
    openContext: []
    openSettings: []
    enhance: []
    toggleTemporary: []
}>()

const enhanceTitle = computed(() => props.enhancerDisabledReason || 'Improve prompt')

function handleEnter() {
    if (props.canSend) {
        emit('send')
    }
}
</script>

<template>
    <Card class="talos-chat-composer-shell pointer-events-auto mx-auto w-full max-w-[820px] border-[var(--talos-border-strong)] bg-[var(--talos-card)]/95 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur" :padded="false">
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
                type="button"
                class="inline-flex h-8 min-w-0 items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2.5 text-xs font-medium text-[var(--talos-text)] transition hover:border-[var(--talos-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
                aria-label="Choose grounding context"
                @click="emit('openContext')"
            >
                <Database class="h-3.5 w-3.5 shrink-0 text-[var(--talos-accent)]" />
                <span class="truncate">{{ contextLabel }}</span>
            </button>
            <button
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
            @keydown.enter.exact.prevent="handleEnter"
        />

        <div class="flex items-center justify-between gap-3 px-2 pb-1 pt-2">
            <div class="min-w-0 truncate text-xs text-[var(--talos-muted)]">
                <span v-if="temporaryMode" class="mr-2 font-semibold text-[var(--talos-warning)]">Temporary mode</span>
                <span>{{ statusText }}</span>
            </div>
            <Button size="sm" :disabled="!canSend" @click="emit('send')">
                <Loader2 v-if="sending" class="h-4 w-4 animate-spin" />
                <Send v-else class="h-4 w-4" />
                Send
            </Button>
        </div>
    </Card>
</template>
