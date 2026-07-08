<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { AlertCircle, CheckCircle2, Database, Layers, Loader2, Plus, RefreshCw, ShieldCheck } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import Surface from '../../ui/Surface.vue'
import TalosFileDropzone from './TalosFileDropzone.vue'
import TalosFileStatusList from './TalosFileStatusList.vue'
import TalosSourceDrawer from './TalosSourceDrawer.vue'
import { useTalosContextVault } from '../../../composables/useTalosContextVault'
import type { TalosContextSet, TalosFile, TalosFileChunk } from '../../../lib/talosTypes'

type BadgeTone = 'success' | 'danger' | 'warning' | 'neutral'

const emit = defineEmits<{
    contextSetCreated: [contextSet: TalosContextSet]
    benchmarkScenarioSelected: [scenarioPath: string]
}>()

const {
    files,
    availableFiles,
    contextSets,
    fileDetailsById,
    loadingFiles,
    loadingContextSets,
    loadingFileId,
    uploadingFile,
    creatingContextSet,
    fileError,
    uploadError,
    contextSetError,
    fileDetailError,
    loadFiles,
    loadFileDetails,
    uploadFile,
    loadContextSets,
    createContextSet,
    loadContextSet,
} = useTalosContextVault()

const selectedFileIds = ref<string[]>([])
const selectedChunkIds = ref<string[]>([])
const contextSetName = ref('')
const drawerFileId = ref<string | null>(null)
const loadingContextSetId = ref<string | null>(null)
const actionError = ref<string | null>(null)
const actionMessage = ref<string | null>(null)
const latestBenchmarkScenarioPath = ref<string | null>(null)
const latestBenchmarkFileName = ref<string | null>(null)

const selectedFiles = computed(() => {
    const ids = new Set(selectedFileIds.value)
    return files.value.filter((file) => ids.has(file.id))
})
const drawerFile = computed(() => {
    if (!drawerFileId.value) {
        return null
    }

    return fileDetailsById.value[drawerFileId.value] ?? files.value.find((file) => file.id === drawerFileId.value) ?? null
})
const drawerDetails = computed(() => drawerFileId.value ? fileDetailsById.value[drawerFileId.value] ?? null : null)
const selectedSourceCount = computed(() => selectedFileIds.value.length + selectedChunkIds.value.length)
const visibleError = computed(() => actionError.value || fileError.value || contextSetError.value)
const canCreateContextSet = computed(() => {
    return contextSetName.value.trim().length > 0
        && selectedFileIds.value.length > 0
        && !creatingContextSet.value
})

function setActionError(error: unknown, fallback: string) {
    actionError.value = error instanceof Error ? error.message : fallback
}

function statusTone(status: string): BadgeTone {
    if (status === 'available') {
        return 'success'
    }

    if (status === 'failed') {
        return 'danger'
    }

    if (status === 'draft') {
        return 'warning'
    }

    return 'neutral'
}

function formatDate(value: string) {
    return new Date(value).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

function benchmarkScenarioPath(file: TalosFile) {
    const scenario = (file as TalosFile & {
        benchmark_scenario?: { storage_path?: unknown } | null
    }).benchmark_scenario
    const path = scenario?.storage_path

    return typeof path === 'string' && path.trim().startsWith('benchmark-scenarios/')
        ? path.trim()
        : null
}

function toggleFile(file: TalosFile) {
    actionError.value = null
    actionMessage.value = null

    if (file.status !== 'available') {
        actionError.value = 'Only available files can be attached to a context set.'
        return
    }

    if (selectedFileIds.value.includes(file.id)) {
        selectedFileIds.value = selectedFileIds.value.filter((id) => id !== file.id)

        const detail = fileDetailsById.value[file.id]
        if (detail) {
            const chunkIds = new Set(detail.chunks.map((chunk) => chunk.id))
            selectedChunkIds.value = selectedChunkIds.value.filter((id) => !chunkIds.has(id))
        }

        return
    }

    selectedFileIds.value = [...selectedFileIds.value, file.id]
}

function toggleChunk(chunk: TalosFileChunk) {
    actionError.value = null
    actionMessage.value = null

    if (!selectedFileIds.value.includes(chunk.file_id)) {
        selectedFileIds.value = [...selectedFileIds.value, chunk.file_id]
    }

    if (selectedChunkIds.value.includes(chunk.id)) {
        selectedChunkIds.value = selectedChunkIds.value.filter((id) => id !== chunk.id)
        return
    }

    selectedChunkIds.value = [...selectedChunkIds.value, chunk.id]
}

async function refreshFiles() {
    actionError.value = null

    try {
        await loadFiles()
    } catch (error) {
        setActionError(error, 'TALOS could not load uploaded files.')
    }
}

async function refreshContextSets() {
    actionError.value = null

    try {
        await loadContextSets()
    } catch (error) {
        setActionError(error, 'TALOS could not load context sets.')
    }
}

async function handleUpload(file: File) {
    actionError.value = null
    actionMessage.value = null
    latestBenchmarkScenarioPath.value = null
    latestBenchmarkFileName.value = null

    try {
        const uploaded = await uploadFile(file)
        if (uploaded.status !== 'available') {
            actionError.value = uploaded.failure_reason ?? 'TALOS stored the file but ingestion did not complete.'
            await loadFiles()
            return
        }

        latestBenchmarkScenarioPath.value = benchmarkScenarioPath(uploaded)
        latestBenchmarkFileName.value = uploaded.original_name
        actionMessage.value = `${uploaded.original_name} uploaded through /api/files/ingest.`
        await loadFiles()
    } catch (error) {
        setActionError(error, 'TALOS could not ingest this file.')
    }
}

function openLatestBenchmarkScenario() {
    if (!latestBenchmarkScenarioPath.value) {
        return
    }

    emit('benchmarkScenarioSelected', latestBenchmarkScenarioPath.value)
}

async function inspectFile(file: TalosFile) {
    drawerFileId.value = file.id
    actionError.value = null

    try {
        await loadFileDetails(file.id)
    } catch (error) {
        setActionError(error, 'TALOS could not load file sources.')
    }
}

async function reloadDrawerFile(file: TalosFile) {
    try {
        await loadFileDetails(file.id)
    } catch (error) {
        setActionError(error, 'TALOS could not reload file sources.')
    }
}

async function submitContextSet() {
    if (!canCreateContextSet.value) {
        return
    }

    actionError.value = null
    actionMessage.value = null

    try {
        const contextSet = await createContextSet({
            name: contextSetName.value.trim(),
            file_ids: selectedFileIds.value,
            chunk_ids: selectedChunkIds.value,
            metadata: {
                source: 'talos_context_vault_ui',
                selected_file_count: selectedFileIds.value.length,
                selected_chunk_count: selectedChunkIds.value.length,
            },
        })

        contextSetName.value = ''
        actionMessage.value = `Context set "${contextSet.name}" created with ${contextSet.sources?.length ?? selectedSourceCount.value} sources.`
        emit('contextSetCreated', contextSet)
    } catch (error) {
        setActionError(error, 'TALOS could not create this context set.')
    }
}

async function refreshContextSet(contextSet: TalosContextSet) {
    loadingContextSetId.value = contextSet.id
    actionError.value = null
    actionMessage.value = null

    try {
        const loaded = await loadContextSet(contextSet.id)
        actionMessage.value = `Loaded "${loaded.name}" from /api/talos/context-sets/${loaded.id}.`
    } catch (error) {
        setActionError(error, 'TALOS could not load this context set.')
    } finally {
        loadingContextSetId.value = null
    }
}

async function refreshVault() {
    await Promise.all([
        refreshFiles(),
        refreshContextSets(),
    ])
}

onMounted(() => {
    void refreshVault()
})
</script>

<template>
    <Surface>
        <div class="border-b border-[var(--talos-border)] p-4">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                        <Database class="h-4 w-4 text-[var(--talos-accent)]" />
                        Context Vault
                    </div>
                    <h3 class="mt-1 text-base font-semibold text-[var(--talos-text)]">Files and grounded context</h3>
                </div>
                <Button type="button" variant="ghost" size="sm" :disabled="loadingFiles || loadingContextSets" @click="refreshVault">
                    <Loader2 v-if="loadingFiles || loadingContextSets" class="h-4 w-4 animate-spin" />
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

            <div v-if="actionMessage" class="flex items-start gap-2 rounded-md border border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)]">
                <CheckCircle2 class="mt-1 h-4 w-4 shrink-0 text-[var(--talos-success)]" />
                <span>{{ actionMessage }}</span>
            </div>
            <div v-if="latestBenchmarkScenarioPath" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div class="min-w-0">
                        <div class="text-sm font-semibold text-[var(--talos-text)]">File benchmark scenario ready</div>
                        <div class="mt-1 truncate font-mono text-[11px] text-[var(--talos-muted)]">{{ latestBenchmarkScenarioPath }}</div>
                    </div>
                    <Button type="button" size="sm" @click="openLatestBenchmarkScenario">
                        <ShieldCheck class="h-4 w-4" />
                        Benchmark this file
                    </Button>
                </div>
                <p v-if="latestBenchmarkFileName" class="mt-2 text-xs leading-5 text-[var(--talos-muted)]">
                    Opens Compare with the scenario generated from {{ latestBenchmarkFileName }}.
                </p>
            </div>

            <TalosFileDropzone
                :uploading="uploadingFile"
                :error="uploadError"
                @upload="handleUpload"
            />

            <div class="grid gap-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h4 class="text-sm font-semibold text-[var(--talos-text)]">Create context set</h4>
                        <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">Selected files are sent as `file_ids`; selected drawer chunks are sent as `chunk_ids`.</p>
                    </div>
                    <Badge :tone="selectedSourceCount > 0 ? 'success' : 'neutral'">{{ selectedSourceCount }} sources</Badge>
                </div>

                <label class="block space-y-1">
                    <span class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Name</span>
                    <input
                        v-model="contextSetName"
                        type="text"
                        class="h-9 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)] focus:border-[var(--talos-accent)]"
                        placeholder="Incident response context"
                        :disabled="creatingContextSet"
                    >
                </label>

                <div class="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{{ selectedFileIds.length }} files</Badge>
                    <Badge tone="neutral">{{ selectedChunkIds.length }} chunks</Badge>
                    <Badge tone="neutral">{{ availableFiles.length }} available</Badge>
                </div>

                <div v-if="selectedFiles.length" class="flex flex-wrap gap-2">
                    <Badge v-for="file in selectedFiles" :key="file.id" tone="neutral">{{ file.original_name }}</Badge>
                </div>

                <Button type="button" size="sm" class="w-full" :disabled="!canCreateContextSet" @click="submitContextSet">
                    <Loader2 v-if="creatingContextSet" class="h-4 w-4 animate-spin" />
                    <Plus v-else class="h-4 w-4" />
                    Create context set
                </Button>
            </div>

            <TalosFileStatusList
                :files="files"
                :selected-file-ids="selectedFileIds"
                :loading="loadingFiles"
                :busy-file-id="loadingFileId"
                :error="fileError"
                @refresh="refreshFiles"
                @toggle-file="toggleFile"
                @inspect-file="inspectFile"
            />

            <div class="overflow-hidden rounded-md border border-[var(--talos-border)]">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--talos-border)] bg-[var(--talos-active)] px-3 py-2">
                    <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                        <Layers class="h-4 w-4 text-[var(--talos-accent)]" />
                        Context sets
                    </div>
                    <Button type="button" variant="ghost" size="sm" :disabled="loadingContextSets" @click="refreshContextSets">
                        <Loader2 v-if="loadingContextSets" class="h-4 w-4 animate-spin" />
                        <RefreshCw v-else class="h-4 w-4" />
                        Sync
                    </Button>
                </div>

                <div v-if="loadingContextSets && !contextSets.length" class="flex items-center gap-2 bg-[var(--talos-panel-soft)] px-3 py-4 text-sm text-[var(--talos-muted)]">
                    <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                    Loading context sets
                </div>

                <div v-else-if="!contextSets.length" class="bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                    No context sets returned by `/api/talos/context-sets`.
                </div>

                <div v-else class="divide-y divide-[var(--talos-border)]">
                    <article v-for="contextSet in contextSets" :key="contextSet.id" class="bg-[var(--talos-panel-soft)] px-3 py-3">
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                <div class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ contextSet.name }}</div>
                                <div class="mt-1 truncate font-mono text-[11px] text-[var(--talos-muted)]">{{ contextSet.id }}</div>
                                <div class="mt-1 text-xs text-[var(--talos-muted)]">updated {{ formatDate(contextSet.updated_at) }}</div>
                            </div>
                            <Badge :tone="statusTone(contextSet.status)">{{ contextSet.status }}</Badge>
                        </div>
                        <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <div class="flex flex-wrap items-center gap-2">
                                <Badge tone="neutral">{{ contextSet.sources?.length ?? 0 }} sources</Badge>
                            </div>
                            <Button type="button" variant="secondary" size="sm" :disabled="loadingContextSetId === contextSet.id" @click="refreshContextSet(contextSet)">
                                <Loader2 v-if="loadingContextSetId === contextSet.id" class="h-4 w-4 animate-spin" />
                                <ShieldCheck v-else class="h-4 w-4" />
                                Load sources
                            </Button>
                        </div>
                    </article>
                </div>
            </div>
        </div>

        <TalosSourceDrawer
            :open="drawerFileId !== null"
            :file="drawerFile"
            :details="drawerDetails"
            :selected-chunk-ids="selectedChunkIds"
            :loading="loadingFileId === drawerFileId"
            :error="fileDetailError"
            @close="drawerFileId = null"
            @refresh="reloadDrawerFile"
            @toggle-chunk="toggleChunk"
        />
    </Surface>
</template>
