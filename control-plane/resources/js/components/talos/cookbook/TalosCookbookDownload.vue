<script setup lang="ts">
import { computed } from 'vue'
import { AlertCircle, Download, Loader2, RefreshCw, Terminal } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import TalosGuideInfoButton from '../guide/TalosGuideInfoButton.vue'
import { resolveTalosCollectionState, type TalosCollectionState } from '../../../lib/talosCollectionState'
import type {
    TalosCookbookCommandPreview,
    TalosCookbookModel,
    TalosCookbookRuntime,
} from '../../../lib/talosTypes'

const disabledReason = 'Requires explicit host execution policy.'

const props = defineProps<{
    models: TalosCookbookModel[]
    runtimes: TalosCookbookRuntime[]
    selectedModelId: string
    selectedRuntime: string
    preview: TalosCookbookCommandPreview | null
    loading: boolean
    error?: string | null
    requested?: boolean
}>()

const emit = defineEmits<{
    'update:selectedModelId': [value: string]
    'update:selectedRuntime': [value: string]
    preview: []
    refresh: []
}>()

const canPreview = computed(() => Boolean(props.selectedModelId && props.selectedRuntime))
const modelState = computed(() => resolveTalosCollectionState({
    itemCount: props.models.length,
    loading: props.loading,
    error: props.error,
    requested: props.requested,
}))
const runtimeState = computed(() => resolveTalosCollectionState({
    itemCount: props.runtimes.length,
    loading: props.loading,
    error: props.error,
    requested: props.requested,
}))
const inventoryState = computed<TalosCollectionState>(() => {
    const states = [modelState.value, runtimeState.value]
    if (states.every((state) => state === 'ready')) return 'ready'
    if (states.includes('loading')) return 'loading'
    if (states.includes('error')) return 'error'
    if (states.includes('idle')) return 'idle'
    return 'empty'
})
const inventoryGap = computed(() => {
    if (!props.models.length && !props.runtimes.length) return 'No local models or runtimes are available.'
    if (!props.models.length) return 'No local models are available.'
    return 'No compatible local runtimes are available.'
})
const commandText = computed(() => {
    if (Array.isArray(props.preview?.commands) && props.preview.commands.length) {
        return props.preview.commands.join('\n')
    }

    const command = props.preview?.command

    if (Array.isArray(command)) {
        return command.join('\n')
    }

    return command || 'No command returned.'
})

function selectModel(event: Event) {
    emit('update:selectedModelId', (event.target as HTMLSelectElement).value)
}

function selectRuntime(event: Event) {
    emit('update:selectedRuntime', (event.target as HTMLSelectElement).value)
}
</script>

<template>
    <section class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]" aria-label="Cookbook download">
        <div class="space-y-4">
            <section class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                    <Download class="h-4 w-4 text-[var(--talos-accent)]" />
                    Download preview
                    <TalosGuideInfoButton guide-id="cookbook.download" compact side="bottom" />
                </div>
                <p class="mt-1 text-sm leading-6 text-[var(--talos-muted)]">
                    Generate a dry-run command from `/api/talos/cookbook/download-preview`; TALOS does not execute host commands here.
                </p>

                <div v-if="inventoryState === 'loading'" role="status" class="mt-3 flex items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-3 text-sm text-[var(--talos-muted)]">
                    <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                    Loading model and runtime inventory
                </div>
                <div v-else-if="inventoryState === 'error'" role="alert" class="mt-3 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-3 text-sm text-[var(--talos-text)]">
                    <div class="flex items-start gap-2">
                        <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
                        <span>{{ error || 'Cookbook inventory is unavailable.' }}</span>
                    </div>
                    <Button type="button" size="sm" variant="secondary" class="mt-3" @click="emit('refresh')">
                        <RefreshCw class="h-4 w-4" />
                        Retry inventory
                    </Button>
                </div>
                <div v-else-if="inventoryState === 'idle'" class="mt-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-3 text-sm text-[var(--talos-muted)]">
                    Load the Cookbook inventory before generating a download preview.
                </div>
                <div v-else-if="inventoryState === 'empty'" class="mt-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-3 text-sm text-[var(--talos-muted)]">
                    <p>{{ inventoryGap }} Scan hardware or refresh the catalog to continue.</p>
                    <Button type="button" size="sm" variant="secondary" class="mt-3" @click="emit('refresh')">
                        <RefreshCw class="h-4 w-4" />
                        Refresh inventory
                    </Button>
                </div>

                <div v-else class="mt-3 grid gap-3 md:grid-cols-2">
                    <label class="space-y-1">
                        <span class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Model</span>
                        <select
                            class="h-9 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                            :value="selectedModelId"
                            :disabled="loading || !models.length"
                            aria-label="Cookbook download model"
                            @change="selectModel"
                        >
                            <option value="">Choose model</option>
                            <option v-for="model in models" :key="model.id" :value="model.model_id">
                                {{ model.display_name }}
                            </option>
                        </select>
                    </label>

                    <label class="space-y-1">
                        <span class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Runtime</span>
                        <select
                            class="h-9 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                            :value="selectedRuntime"
                            :disabled="loading || !runtimes.length"
                            aria-label="Cookbook download runtime"
                            @change="selectRuntime"
                        >
                            <option value="">Choose runtime</option>
                            <option v-for="runtime in runtimes" :key="runtime.kind" :value="runtime.kind">
                                {{ runtime.name }} - {{ runtime.status }}
                            </option>
                        </select>
                    </label>
                </div>

                <div v-if="inventoryState === 'ready'" class="mt-3 flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" :disabled="loading || !canPreview" @click="emit('preview')">
                        <Loader2 v-if="loading" class="h-4 w-4 animate-spin" />
                        <Terminal v-else class="h-4 w-4" />
                        Preview download command
                    </Button>
                    <Button type="button" size="sm" variant="secondary" disabled :title="disabledReason">
                        <Download class="h-4 w-4" />
                        Download model
                    </Button>
                    <span class="text-xs text-[var(--talos-muted)]">{{ disabledReason }}</span>
                </div>
            </section>

            <section v-if="inventoryState === 'ready' && preview" class="rounded-md border border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] p-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="text-xs font-semibold uppercase text-[var(--talos-success)]">Dry-run preview</div>
                    <div class="flex flex-wrap gap-1.5">
                        <Badge tone="success">{{ preview.mode }}</Badge>
                        <Badge :tone="preview.executed ? 'danger' : 'success'">executed {{ preview.executed ? 'true' : 'false' }}</Badge>
                        <Badge tone="warning">approval {{ preview.requires_approval ? 'required' : 'not required' }}</Badge>
                    </div>
                </div>
                <pre class="mt-3 overflow-x-auto rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 font-mono text-xs leading-5 text-[var(--talos-text)]">{{ commandText }}</pre>
                <p class="mt-2 text-sm leading-6 text-[var(--talos-text)]">{{ preview.message || 'No host command has been executed.' }}</p>
            </section>
        </div>

        <aside class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
            <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Preview policy</div>
            <dl class="mt-3 space-y-2 text-sm">
                <div class="flex items-center justify-between gap-3">
                    <dt class="text-[var(--talos-muted)]">Host execution</dt>
                    <dd class="font-semibold text-[var(--talos-text)]">disabled</dd>
                </div>
                <div class="flex items-center justify-between gap-3">
                    <dt class="text-[var(--talos-muted)]">Preview endpoint</dt>
                    <dd class="font-mono text-xs text-[var(--talos-text)]">download-preview</dd>
                </div>
                <div class="flex items-center justify-between gap-3">
                    <dt class="text-[var(--talos-muted)]">Shell state</dt>
                    <dd class="font-semibold text-[var(--talos-text)]">unchanged</dd>
                </div>
            </dl>
        </aside>
    </section>
</template>
