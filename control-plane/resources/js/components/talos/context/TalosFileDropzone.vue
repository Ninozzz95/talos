<script setup lang="ts">
import { ref } from 'vue'
import { AlertCircle, FileUp, Loader2, UploadCloud } from '@lucide/vue'
import Button from '../../ui/Button.vue'

defineProps<{
    uploading: boolean
    error?: string | null
}>()

const emit = defineEmits<{
    upload: [file: File]
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)

function openFilePicker() {
    fileInput.value?.click()
}

function emitFirstFile(fileList: FileList | null) {
    const file = fileList?.item(0)

    if (file) {
        emit('upload', file)
    }
}

function handleInput(event: Event) {
    const input = event.target as HTMLInputElement
    emitFirstFile(input.files)
    input.value = ''
}

function handleDrop(event: DragEvent) {
    dragging.value = false
    emitFirstFile(event.dataTransfer?.files ?? null)
}
</script>

<template>
    <div
        class="rounded-md border border-dashed p-4 transition"
        :class="dragging ? 'border-[var(--talos-accent)] bg-[var(--talos-accent-soft)]' : 'border-[var(--talos-border-strong)] bg-[var(--talos-panel-soft)]'"
        @dragenter.prevent="dragging = true"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="handleDrop"
    >
        <input
            ref="fileInput"
            type="file"
            class="sr-only"
            aria-label="Upload source file"
            data-testid="talos-context-upload-input"
            accept=".txt,.md,.json,.csv,text/plain,text/markdown,application/json,text/csv"
            :disabled="uploading"
            @change="handleInput"
        >

        <div class="flex items-start gap-3">
            <span class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] text-[var(--talos-accent)]">
                <UploadCloud class="h-5 w-5" />
            </span>
            <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h4 class="text-sm font-semibold text-[var(--talos-text)]">Upload source file</h4>
                        <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">TXT, Markdown, JSON, or CSV are sent to `/api/files/ingest`.</p>
                    </div>
                    <Button type="button" size="sm" :disabled="uploading" @click="openFilePicker">
                        <Loader2 v-if="uploading" class="h-4 w-4 animate-spin" />
                        <FileUp v-else class="h-4 w-4" />
                        {{ uploading ? 'Uploading' : 'Choose file' }}
                    </Button>
                </div>

                <div v-if="error" class="mt-3 flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-xs leading-5 text-[var(--talos-text)]">
                    <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
                    <span>{{ error }}</span>
                </div>
            </div>
        </div>
    </div>
</template>
