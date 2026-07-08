<script setup lang="ts">
import { computed } from 'vue'
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
</script>

<template>
    <div v-if="open" class="fixed inset-0 z-50">
        <button
            type="button"
            class="absolute inset-0 h-full w-full bg-black/50"
            aria-label="Close source drawer"
            @click="emit('close')"
        />

        <aside class="absolute inset-y-0 right-0 flex w-full max-w-[520px] flex-col border-l border-[var(--talos-border)] bg-[var(--talos-panel)] shadow-[0_24px_90px_rgba(0,0,0,0.45)]">
            <div class="border-b border-[var(--talos-border)] p-4">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                            <FileSearch class="h-4 w-4 text-[var(--talos-accent)]" />
                            Source chunks
                        </div>
                        <h3 class="mt-1 truncate text-base font-semibold text-[var(--talos-text)]">
                            {{ file?.original_name ?? 'No file selected' }}
                        </h3>
                        <p v-if="file" class="mt-1 truncate font-mono text-[11px] text-[var(--talos-muted)]">{{ file.id }}</p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" @click="emit('close')">
                        <X class="h-4 w-4" />
                        Close
                    </Button>
                </div>

                <div v-if="file" class="mt-3 flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{{ file.status }}</Badge>
                    <Badge tone="neutral">{{ chunks.length }} chunks</Badge>
                    <Button type="button" variant="secondary" size="sm" :disabled="loading" @click="emit('refresh', file)">
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

                <div v-else class="space-y-3">
                    <article
                        v-for="chunk in chunks"
                        :key="chunk.id"
                        class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3"
                    >
                        <button
                            type="button"
                            class="flex w-full items-start gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--talos-accent)]"
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
