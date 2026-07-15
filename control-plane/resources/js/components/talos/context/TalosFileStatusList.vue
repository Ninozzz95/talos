<script setup lang="ts">
import { computed } from 'vue'
import { Database, FileText, Loader2, RefreshCw, Search } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import { resolveTalosCollectionState } from '../../../lib/talosCollectionState'
import type { TalosFile } from '../../../lib/talosTypes'

type BadgeTone = 'success' | 'danger' | 'warning' | 'neutral'

const props = withDefaults(defineProps<{
    files: TalosFile[]
    selectedFileIds: string[]
    loading: boolean
    busyFileId?: string | null
    error?: string | null
    requested?: boolean
}>(), {
    busyFileId: null,
    error: null,
    requested: true,
})

const emit = defineEmits<{
    refresh: []
    toggleFile: [file: TalosFile]
    inspectFile: [file: TalosFile]
}>()

const selectedCount = computed(() => props.selectedFileIds.length)
const filesState = computed(() => resolveTalosCollectionState({
    itemCount: props.files.length,
    loading: props.loading,
    error: props.error,
    requested: props.requested,
}))

function statusTone(status: TalosFile['status']): BadgeTone {
    if (status === 'available' || status === 'embedded' || status === 'chunked') {
        return 'success'
    }

    if (status === 'failed' || status === 'quarantined') {
        return 'danger'
    }

    if (status === 'parsed' || status === 'scanned') {
        return 'warning'
    }

    return 'neutral'
}

function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return '0 B'
    }

    const units = ['B', 'KB', 'MB', 'GB']
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    const value = bytes / 1024 ** index

    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function formatDate(value: string) {
    return new Date(value).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

function isSelected(file: TalosFile) {
    return props.selectedFileIds.includes(file.id)
}
</script>

<template>
    <div class="overflow-hidden rounded-md border border-[var(--talos-border)]">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--talos-border)] bg-[var(--talos-active)] px-3 py-2">
            <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                <Database class="h-4 w-4 text-[var(--talos-accent)]" />
                Uploaded files
            </div>
            <div class="flex items-center gap-2">
                <Badge tone="neutral">{{ selectedCount }} selected</Badge>
                <Button type="button" variant="ghost" size="sm" :disabled="loading" @click="emit('refresh')">
                    <Loader2 v-if="loading" class="h-4 w-4 animate-spin" />
                    <RefreshCw v-else class="h-4 w-4" />
                    Sync
                </Button>
            </div>
        </div>

        <div v-if="error" class="border-b border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-3 text-sm leading-6 text-[var(--talos-text)]">
            {{ error }}
        </div>

        <div v-if="filesState === 'loading'" role="status" class="flex items-center gap-2 bg-[var(--talos-panel-soft)] px-3 py-5 text-sm text-[var(--talos-muted)]">
            <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
            Loading files from `/api/talos/files`
        </div>

        <div v-else-if="filesState === 'empty'" class="bg-[var(--talos-panel-soft)] px-3 py-5 text-sm leading-6 text-[var(--talos-muted)]">
            No files returned by `/api/talos/files`.
        </div>

        <div v-else-if="filesState === 'ready'" class="divide-y divide-[var(--talos-border)]">
            <article v-for="file in files" :key="file.id" class="bg-[var(--talos-panel-soft)]">
                <div class="grid gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_auto]">
                    <button
                        type="button"
                        class="grid min-w-0 grid-cols-[24px_minmax(0,1fr)] gap-3 rounded-sm text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--talos-accent)]"
                        :disabled="file.status !== 'available'"
                        :aria-disabled="file.status !== 'available'"
                        @click="emit('toggleFile', file)"
                    >
                        <span
                            class="mt-0.5 flex h-5 w-5 items-center justify-center rounded-sm border"
                            :class="isSelected(file) ? 'border-[var(--talos-accent)] bg-[var(--talos-accent)] text-[var(--talos-accent-text)]' : 'border-[var(--talos-border-strong)] bg-[var(--talos-panel)]'"
                            aria-hidden="true"
                        >
                            <span v-if="isSelected(file)" class="h-2 w-2 rounded-full bg-current" />
                        </span>
                        <span class="min-w-0">
                            <span class="flex items-center gap-2">
                                <FileText class="h-4 w-4 shrink-0 text-[var(--talos-muted)]" />
                                <span class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ file.original_name }}</span>
                            </span>
                            <span class="mt-1 block truncate font-mono text-[11px] text-[var(--talos-muted)]">{{ file.checksum }}</span>
                            <span class="mt-1 block text-xs text-[var(--talos-muted)]">
                                {{ formatBytes(file.size_bytes) }} - {{ file.mime_type }} - updated {{ formatDate(file.updated_at) }}
                            </span>
                            <span v-if="file.failure_reason" class="mt-2 block text-xs leading-5 text-[var(--talos-danger)]">{{ file.failure_reason }}</span>
                        </span>
                    </button>

                    <div class="flex items-start justify-between gap-2 md:flex-col md:items-end">
                        <Badge :tone="statusTone(file.status)">{{ file.status }}</Badge>
                        <Button type="button" variant="secondary" size="sm" :disabled="busyFileId === file.id" @click="emit('inspectFile', file)">
                            <Loader2 v-if="busyFileId === file.id" class="h-4 w-4 animate-spin" />
                            <Search v-else class="h-4 w-4" />
                            Sources
                        </Button>
                    </div>
                </div>
            </article>
        </div>
    </div>
</template>
