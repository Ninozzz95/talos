<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { FileSearch, Loader2, RefreshCw, X } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import type { TalosFile, TalosFileChunk, TalosFileWithChunks } from '../../../lib/talosTypes'

const props = defineProps<{
    open: boolean
    file: TalosFile | null
    details: TalosFileWithChunks | null
    selectedChunkIds: string[]
    loading: boolean
    error?: string | null
}>()

const emit = defineEmits<{
    close: []
    refresh: [file: TalosFile]
    toggleChunk: [chunk: TalosFileChunk]
}>()

const chunks = computed(() => props.details?.chunks ?? [])
const closeButton = ref<{ $el?: HTMLElement } | null>(null)
const overlayRoot = ref<HTMLElement | null>(null)
const dialogRoot = ref<HTMLElement | null>(null)
let previousFocus: HTMLElement | null = null
let isolatedBackground: Array<{ element: HTMLElement, inert: boolean, ariaHidden: string | null }> = []

function isSelected(chunk: TalosFileChunk) {
    return props.selectedChunkIds.includes(chunk.id)
}

function chunkPreview(chunk: TalosFileChunk) {
    return chunk.preview || chunk.content || 'Chunk text is unavailable in this response.'
}

function offsetLabel(chunk: TalosFileChunk) {
    if (typeof chunk.start_offset === 'number' && typeof chunk.end_offset === 'number') {
        return `${chunk.start_offset}-${chunk.end_offset}`
    }

    return 'offset not returned'
}

function focusCloseButton() {
    void nextTick(() => closeButton.value?.$el?.focus())
}

function isolateBackground() {
    restoreBackground()
    const root = overlayRoot.value
    if (!root) return

    const seen = new Set<HTMLElement>()
    let branch: HTMLElement | null = root
    while (branch?.parentElement) {
        const parent = branch.parentElement
        for (const sibling of Array.from(parent.children)) {
            if (!(sibling instanceof HTMLElement) || sibling === branch || seen.has(sibling)) continue
            seen.add(sibling)
            isolatedBackground.push({
                element: sibling,
                inert: sibling.hasAttribute('inert'),
                ariaHidden: sibling.getAttribute('aria-hidden'),
            })
            sibling.setAttribute('inert', '')
            sibling.setAttribute('aria-hidden', 'true')
        }
        branch = parent
        if (parent === document.body) break
    }
}

function restoreBackground() {
    for (const state of isolatedBackground) {
        if (!state.inert) state.element.removeAttribute('inert')
        if (state.ariaHidden === null) state.element.removeAttribute('aria-hidden')
        else state.element.setAttribute('aria-hidden', state.ariaHidden)
    }
    isolatedBackground = []
}

function focusableElements() {
    const root = dialogRoot.value
    if (!root) return []

    return Array.from(root.querySelectorAll<HTMLElement>([
        'button:not([disabled])',
        'a[href]',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
    ].join(','))).filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true')
}

function restorePreviousFocus() {
    previousFocus?.focus()
    previousFocus = null
}

function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && props.open) {
        event.preventDefault()
        emit('close')
        return
    }

    if (event.key !== 'Tab' || !props.open) return
    const focusable = focusableElements()
    if (focusable.length === 0) {
        event.preventDefault()
        dialogRoot.value?.focus()
        return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || !dialogRoot.value?.contains(active))) {
        event.preventDefault()
        last.focus()
    } else if (!event.shiftKey && (active === last || !dialogRoot.value?.contains(active))) {
        event.preventDefault()
        first.focus()
    }
}

watch(
    () => props.open,
    (open, wasOpen) => {
        if (open) {
            previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
            document.addEventListener('keydown', handleKeydown)
            void nextTick(isolateBackground)
            focusCloseButton()
            return
        }

        document.removeEventListener('keydown', handleKeydown)
        restoreBackground()
        if (wasOpen) {
            restorePreviousFocus()
        }
    },
    { immediate: true },
)

onBeforeUnmount(() => {
    document.removeEventListener('keydown', handleKeydown)
    restoreBackground()
    if (props.open) {
        restorePreviousFocus()
    }
})
</script>

<template>
    <div v-if="open" ref="overlayRoot" class="fixed inset-0 z-50">
        <button
            type="button"
            class="absolute inset-0 h-full w-full bg-black/50"
            aria-hidden="true"
            tabindex="-1"
            @click="emit('close')"
        />

        <aside
            ref="dialogRoot"
            class="absolute inset-y-0 right-0 flex w-full max-w-[520px] flex-col border-l border-[var(--talos-border)] bg-[var(--talos-panel)] shadow-[0_24px_90px_rgba(0,0,0,0.45)]"
            role="dialog"
            tabindex="-1"
            aria-modal="true"
            aria-labelledby="talos-source-drawer-title"
        >
            <div class="border-b border-[var(--talos-border)] p-4">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                            <FileSearch class="h-4 w-4 text-[var(--talos-accent)]" />
                            Source chunks
                        </div>
                        <h2 id="talos-source-drawer-title" class="mt-1 truncate text-base font-semibold text-[var(--talos-text)]">
                            {{ file?.original_name ?? 'No file selected' }}
                        </h2>
                        <p v-if="file" class="mt-1 truncate font-mono text-[11px] text-[var(--talos-muted)]">{{ file.id }}</p>
                    </div>
                    <Button ref="closeButton" type="button" variant="ghost" size="icon" aria-label="Close source drawer" @click="emit('close')">
                        <X class="h-4 w-4" />
                    </Button>
                </div>

                <div v-if="file" class="mt-3 flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{{ file.status }}</Badge>
                    <Badge tone="neutral">{{ chunks.length }} chunks</Badge>
                    <Button type="button" variant="secondary" size="sm" aria-label="Reload source drawer file" :disabled="loading" @click="emit('refresh', file)">
                        <Loader2 v-if="loading" class="h-4 w-4 animate-spin" />
                        <RefreshCw v-else class="h-4 w-4" />
                        Reload
                    </Button>
                </div>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto p-4">
                <div v-if="loading" class="flex items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm text-[var(--talos-muted)]">
                    <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                    Loading file details
                </div>

                <div v-else-if="error" class="rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-3 text-sm leading-6 text-[var(--talos-text)]">
                    {{ error }}
                </div>

                <div v-else-if="!file" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                    Select a file to inspect returned chunks.
                </div>

                <div v-else-if="!details" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                    File details have not been loaded yet.
                </div>

                <div v-else-if="!chunks.length" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                    This file detail response did not return chunks.
                </div>

                <div v-else class="space-y-3" role="listbox" aria-label="Source chunks">
                    <article
                        v-for="chunk in chunks"
                        :key="chunk.id"
                        :data-testid="`talos-source-chunk-option-${chunk.id}`"
                        class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3"
                        role="option"
                        :aria-selected="isSelected(chunk)"
                    >
                        <button
                            type="button"
                            :data-testid="`talos-source-chunk-${chunk.id}`"
                            class="flex w-full items-start gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--talos-accent)]"
                            :aria-pressed="isSelected(chunk)"
                            @click="emit('toggleChunk', chunk)"
                        >
                            <span
                                class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border"
                                :class="isSelected(chunk) ? 'border-[var(--talos-accent)] bg-[var(--talos-accent)] text-[var(--talos-accent-text)]' : 'border-[var(--talos-border-strong)] bg-[var(--talos-panel)]'"
                                aria-hidden="true"
                            >
                                <span v-if="isSelected(chunk)" class="h-2 w-2 rounded-full bg-current" />
                            </span>
                            <span class="min-w-0 flex-1">
                                <span class="flex flex-wrap items-center gap-2">
                                    <Badge tone="neutral">chunk {{ chunk.sequence }}</Badge>
                                    <span class="font-mono text-[11px] text-[var(--talos-muted)]">{{ offsetLabel(chunk) }}</span>
                                </span>
                                <span class="mt-3 line-clamp-6 block whitespace-pre-wrap text-sm leading-6 text-[var(--talos-text)]">{{ chunkPreview(chunk) }}</span>
                                <span v-if="chunk.content_hash" class="mt-3 block truncate font-mono text-[11px] text-[var(--talos-muted)]">{{ chunk.content_hash }}</span>
                            </span>
                        </button>
                    </article>
                </div>
            </div>
        </aside>
    </div>
</template>
