<script setup lang="ts">
/**
 * F3-T4bis (owner #13, Claude screenshots) — the organized "Add to chat"
 * bottom drawer. Big single-shot tiles up top (they act and close), calm
 * toggle rows for modes (they act and stay), an inline effort segment and
 * quiet action rows. Loaded lazily by the composer only in drawer mode.
 */
import { onMounted, ref } from 'vue'
import {
    BrainCircuit, Database, FlaskConical, Globe2, Paperclip, Sparkles, X,
} from '@lucide/vue'
import type { TalosMobileEffortLevel } from '@/lib/mobileEffort'

const props = defineProps<{
    canEnhance: boolean
    browseMode: boolean
    thinking: boolean
    supportsThinking: boolean
    effortLevels: readonly string[]
    selectedEffort: string
    attachmentsAvailable: boolean
    contextAvailable: boolean
}>()

const emit = defineEmits<{
    close: []
    attach: []
    openContext: []
    openModelLab: []
    toggleBrowse: [enabled: boolean]
    selectThinking: [enabled: boolean]
    selectEffort: [level: TalosMobileEffortLevel]
    enhancePrompt: []
}>()

const entered = ref(false)
const root = ref<HTMLElement | null>(null)
onMounted(() => {
    requestAnimationFrame(() => { entered.value = true })
    // SF-critic F3 #3: modal semantics need at least initial focus + Escape.
    root.value?.focus()
})

function single(action: 'attach' | 'openContext' | 'openModelLab' | 'enhancePrompt'): void {
    emit(action as never)
    emit('close')
}

const realEfforts = () => props.effortLevels.filter((level) => level !== 'off')
</script>

<template>
    <!-- Teleported: the composer card's backdrop-blur creates a containing
         block that would trap this fixed overlay inside the card. -->
    <Teleport to="body">
    <div class="fixed inset-0 z-[75] flex flex-col justify-end">
        <div
            class="absolute inset-0 bg-black/30 backdrop-blur-[2px] transition-opacity duration-250"
            :class="entered ? 'opacity-100' : 'opacity-0'"
            aria-hidden="true"
            @click="emit('close')"
        />
        <section
            ref="root"
            role="dialog"
            aria-modal="true"
            aria-label="Add to chat"
            tabindex="-1"
            data-testid="talos-composer-drawer"
            class="relative z-10 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-2xl border-t border-[var(--talos-border)] bg-[var(--talos-window-bg)] pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 text-[var(--talos-text)] outline-none transition-transform duration-250 ease-out"
            @keydown.escape="emit('close')"
            :class="entered ? 'translate-y-0' : 'translate-y-6'"
        >
            <header class="flex shrink-0 items-center gap-2 px-3 py-2">
                <button
                    type="button"
                    aria-label="Close"
                    class="talos-pressable flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--talos-muted)]"
                    @click="emit('close')"
                >
                    <X class="size-5" aria-hidden="true" />
                </button>
                <h2 class="flex-1 text-center text-base font-semibold">Add to chat</h2>
                <span class="min-w-11" aria-hidden="true" />
            </header>

            <div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pt-1">
                <div class="grid grid-cols-3 gap-3">
                    <button
                        type="button"
                        data-testid="talos-drawer-attach"
                        :disabled="!attachmentsAvailable"
                        class="talos-pressable flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 text-sm text-[var(--talos-text)] disabled:opacity-50"
                        @click="single('attach')"
                    >
                        <span class="flex size-12 items-center justify-center rounded-full bg-[var(--talos-active)]">
                            <Paperclip class="size-5" aria-hidden="true" />
                        </span>
                        Attach
                    </button>
                    <button
                        type="button"
                        data-testid="talos-drawer-context"
                        :disabled="!contextAvailable"
                        class="talos-pressable flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 text-sm text-[var(--talos-text)] disabled:opacity-50"
                        @click="single('openContext')"
                    >
                        <span class="flex size-12 items-center justify-center rounded-full bg-[var(--talos-active)]">
                            <Database class="size-5" aria-hidden="true" />
                        </span>
                        Library
                    </button>
                    <button
                        type="button"
                        data-testid="talos-drawer-model-lab"
                        class="talos-pressable flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 text-sm text-[var(--talos-text)]"
                        @click="single('openModelLab')"
                    >
                        <span class="flex size-12 items-center justify-center rounded-full bg-[var(--talos-active)]">
                            <FlaskConical class="size-5" aria-hidden="true" />
                        </span>
                        Model Lab
                    </button>
                </div>

                <button
                    type="button"
                    role="switch"
                    data-testid="talos-drawer-browse"
                    :aria-checked="browseMode"
                    class="talos-pressable flex min-h-13 w-full items-center gap-3 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 px-3 text-left"
                    @click="emit('toggleBrowse', !browseMode)"
                >
                    <span class="flex size-9 items-center justify-center rounded-full bg-[var(--talos-active)]">
                        <Globe2 class="size-4" aria-hidden="true" />
                    </span>
                    <span class="min-w-0 flex-1 text-sm">Browse the web</span>
                    <span
                        class="relative h-6 w-11 rounded-full transition-colors duration-200"
                        :class="browseMode ? 'bg-[var(--talos-accent,var(--primary))]' : 'bg-[var(--talos-border)]'"
                        aria-hidden="true"
                    >
                        <span class="absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] duration-200" :class="browseMode ? 'left-[22px]' : 'left-0.5'" />
                    </span>
                </button>

                <button
                    v-if="supportsThinking"
                    type="button"
                    role="switch"
                    data-testid="talos-drawer-thinking"
                    :aria-checked="thinking"
                    class="talos-pressable flex min-h-13 w-full items-center gap-3 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 px-3 text-left"
                    @click="emit('selectThinking', !thinking)"
                >
                    <span class="flex size-9 items-center justify-center rounded-full bg-[var(--talos-active)]">
                        <BrainCircuit class="size-4" aria-hidden="true" />
                    </span>
                    <span class="min-w-0 flex-1 text-sm">Extended thinking</span>
                    <span
                        class="relative h-6 w-11 rounded-full transition-colors duration-200"
                        :class="thinking ? 'bg-[var(--talos-accent,var(--primary))]' : 'bg-[var(--talos-border)]'"
                        aria-hidden="true"
                    >
                        <span class="absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] duration-200" :class="thinking ? 'left-[22px]' : 'left-0.5'" />
                    </span>
                </button>

                <div v-if="realEfforts().length" class="rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3">
                    <p class="text-xs font-medium uppercase tracking-wide text-[var(--talos-muted)]">Reasoning effort</p>
                    <div class="mt-2 flex gap-1" role="radiogroup" aria-label="Reasoning effort">
                        <button
                            v-for="level in effortLevels"
                            :key="level"
                            type="button"
                            role="radio"
                            :aria-checked="level === selectedEffort"
                            :data-testid="`talos-drawer-effort-${level}`"
                            class="talos-pressable min-h-10 flex-1 rounded-full text-xs font-medium capitalize transition-colors duration-150"
                            :class="level === selectedEffort
                                ? 'bg-[var(--talos-accent,var(--primary))] text-[var(--talos-accent-contrast,var(--primary-foreground))]'
                                : 'text-[var(--talos-muted)] hover:bg-[var(--talos-active)]'"
                            @click="emit('selectEffort', level as never)"
                        >
                            {{ level }}
                        </button>
                    </div>
                </div>

                <button
                    type="button"
                    data-testid="talos-drawer-enhance"
                    :disabled="!canEnhance"
                    :title="canEnhance ? 'Improve prompt' : 'Type a prompt first'"
                    class="talos-pressable flex min-h-13 w-full items-center gap-3 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 px-3 text-left disabled:opacity-50"
                    @click="single('enhancePrompt')"
                >
                    <span class="flex size-9 items-center justify-center rounded-full bg-[var(--talos-active)]">
                        <Sparkles class="size-4 text-[var(--talos-accent)]" aria-hidden="true" />
                    </span>
                    <span class="min-w-0 flex-1 text-sm">Improve prompt</span>
                </button>

            </div>
        </section>
    </div>
    </Teleport>
</template>
