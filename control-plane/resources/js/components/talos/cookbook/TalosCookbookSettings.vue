<script setup lang="ts">
import { computed } from 'vue'
import { Loader2, Play, ServerCog, Terminal } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
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
}>()

const emit = defineEmits<{
    'update:selectedModelId': [value: string]
    'update:selectedRuntime': [value: string]
    preview: []
}>()

const canPreview = computed(() => Boolean(props.selectedModelId && props.selectedRuntime))
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
    <section class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]" aria-label="Cookbook settings">
        <div class="space-y-4">
            <section class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                    <ServerCog class="h-4 w-4 text-[var(--talos-accent)]" />
                    Serve preview
                </div>
                <p class="mt-1 text-sm leading-6 text-[var(--talos-muted)]">
                    Preview local serve parameters without starting a runtime process.
                </p>

                <div class="mt-3 grid gap-3 md:grid-cols-2">
                    <label class="space-y-1">
                        <span class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Model</span>
                        <select
                            class="h-9 w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                            :value="selectedModelId"
                            :disabled="loading || !models.length"
                            aria-label="Cookbook serve model"
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
                            aria-label="Cookbook serve runtime"
                            @change="selectRuntime"
                        >
                            <option value="">Choose runtime</option>
                            <option v-for="runtime in runtimes" :key="runtime.kind" :value="runtime.kind">
                                {{ runtime.name }} - {{ runtime.status }}
                            </option>
                        </select>
                    </label>
                </div>

                <div class="mt-3 flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" :disabled="loading || !canPreview" @click="emit('preview')">
                        <Loader2 v-if="loading" class="h-4 w-4 animate-spin" />
                        <Terminal v-else class="h-4 w-4" />
                        Preview serve command
                    </Button>
                    <Button type="button" size="sm" variant="secondary" disabled :title="disabledReason">
                        <Play class="h-4 w-4" />
                        Serve model
                    </Button>
                    <span class="text-xs text-[var(--talos-muted)]">{{ disabledReason }}</span>
                </div>
            </section>

            <section v-if="preview" class="rounded-md border border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] p-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="text-xs font-semibold uppercase text-[var(--talos-success)]">Dry-run preview</div>
                    <div class="flex flex-wrap gap-1.5">
                        <Badge tone="success">{{ preview.mode }}</Badge>
                        <Badge :tone="preview.executed ? 'danger' : 'success'">executed {{ preview.executed ? 'true' : 'false' }}</Badge>
                    </div>
                </div>
                <pre class="mt-3 overflow-x-auto rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 font-mono text-xs leading-5 text-[var(--talos-text)]">{{ commandText }}</pre>
                <p class="mt-2 text-sm leading-6 text-[var(--talos-text)]">{{ preview.message || 'No host command has been executed.' }}</p>
            </section>
        </div>

        <aside class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
            <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Execution boundary</div>
            <p class="mt-2 text-sm leading-6 text-[var(--talos-muted)]">
                Cookbook settings are preview-only. Starting local model servers requires a separate host execution policy and audit path.
            </p>
            <div class="mt-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2 text-xs text-[var(--talos-muted)]">
                Active endpoint: `/api/talos/cookbook/serve-preview`
            </div>
        </aside>
    </section>
</template>
