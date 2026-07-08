<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, Download, FileText, Loader2, RefreshCw } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import Surface from '../../ui/Surface.vue'
import { useTalosDocuments } from '../../../composables/useTalosDocuments'
import type { TalosDocument } from '../../../lib/talosTypes'

const {
    documents,
    loadingDocuments,
    exportingDocumentId,
    documentError,
    loadDocuments,
    exportDocument,
} = useTalosDocuments()

const exportedDocument = ref<TalosDocument | null>(null)
const actionError = ref<string | null>(null)
const visibleError = computed(() => actionError.value || documentError.value)

async function refreshDocuments() {
    actionError.value = null

    try {
        await loadDocuments()
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not refresh documents.'
    }
}

async function handleExport(document: TalosDocument) {
    actionError.value = null

    try {
        exportedDocument.value = await exportDocument(document.id)
    } catch (error) {
        actionError.value = error instanceof Error ? error.message : 'TALOS could not export this document.'
    }
}

function shortHash(value: string | null | undefined) {
    if (!value) {
        return 'unknown'
    }

    return value.length > 12 ? value.slice(0, 12) : value
}

onMounted(() => {
    void refreshDocuments()
})
</script>

<template>
    <Surface>
        <div class="border-b border-[var(--talos-border)] p-4">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                        <FileText class="h-4 w-4 text-[var(--talos-accent)]" />
                        Documents
                    </div>
                    <h3 class="mt-1 text-base font-semibold text-[var(--talos-text)]">Run-linked documents</h3>
                </div>
                <Button type="button" variant="ghost" size="sm" :disabled="loadingDocuments" @click="refreshDocuments">
                    <Loader2 v-if="loadingDocuments" class="h-4 w-4 animate-spin" />
                    <RefreshCw v-else class="h-4 w-4" />
                    Sync
                </Button>
            </div>
        </div>

        <div class="space-y-4 p-4">
            <div v-if="visibleError" class="flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)]">
                <AlertCircle class="mt-1 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
                <span>{{ visibleError }}</span>
            </div>

            <div v-if="!documents.length && !loadingDocuments" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                No documents returned by `/api/talos/documents`.
            </div>

            <article
                v-for="document in documents"
                :key="document.id"
                class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3"
            >
                <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0">
                        <div class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ document.title }}</div>
                        <p class="mt-1 line-clamp-2 text-xs leading-5 text-[var(--talos-muted)]">{{ document.content_preview }}</p>
                        <div class="mt-2 flex flex-wrap gap-2">
                            <Badge tone="neutral">{{ document.document_type }}</Badge>
                            <Badge tone="neutral">{{ document.format }}</Badge>
                            <Badge tone="neutral">provenance {{ shortHash(document.provenance?.run_id ?? document.run_id) }}</Badge>
                        </div>
                    </div>
                    <Button type="button" variant="secondary" size="sm" :disabled="exportingDocumentId === document.id" @click="handleExport(document)">
                        <Loader2 v-if="exportingDocumentId === document.id" class="h-4 w-4 animate-spin" />
                        <Download v-else class="h-4 w-4" />
                        Export
                    </Button>
                </div>
            </article>

            <div v-if="exportedDocument" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
                <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Exported document</div>
                <div class="mt-2 text-sm font-semibold text-[var(--talos-text)]">{{ exportedDocument.title }}</div>
                <pre class="mt-3 max-h-[220px] overflow-auto whitespace-pre-wrap rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3 text-xs leading-5 text-[var(--talos-muted)]">{{ exportedDocument.content }}</pre>
            </div>
        </div>
    </Surface>
</template>
