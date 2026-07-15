<script setup lang="ts">
import { computed } from 'vue'
import { Cpu, Loader2, RefreshCw, Radar } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import TalosGuideInfoButton from '../guide/TalosGuideInfoButton.vue'
import { resolveTalosCollectionState } from '../../../lib/talosCollectionState'
import type { TalosCookbookModel, TalosCookbookOverview } from '../../../lib/talosTypes'

type BadgeTone = 'success' | 'danger' | 'warning' | 'neutral'

const props = withDefaults(defineProps<{
    overview: TalosCookbookOverview | null
    models: TalosCookbookModel[]
    loading: boolean
    error?: string | null
    requested?: boolean
}>(), {
    error: null,
    requested: true,
})

const emit = defineEmits<{
    scan: []
    refresh: []
}>()

const profile = computed(() => props.overview?.profile ?? null)
const runtimes = computed(() => props.overview?.runtimes ?? [])
const visibleModels = computed(() => props.models.slice(0, 4))
const profileState = computed(() => resolveTalosCollectionState({
    itemCount: profile.value ? 1 : 0,
    loading: props.loading,
    error: props.error,
    requested: props.requested,
}))
const runtimesState = computed(() => resolveTalosCollectionState({
    itemCount: runtimes.value.length,
    loading: props.loading,
    error: props.error,
    requested: props.requested,
}))
const modelsState = computed(() => resolveTalosCollectionState({
    itemCount: props.models.length,
    loading: props.loading,
    error: props.error,
    requested: props.requested,
}))

function formatMb(value: number | null | undefined) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return 'unknown'
    }

    if (value >= 1024) {
        return `${Math.round(value / 1024)} GB`
    }

    return `${Math.round(value)} MB`
}

function fitTone(model: TalosCookbookModel): BadgeTone {
    const score = model.fit?.score ?? 0

    if (score >= 75) {
        return 'success'
    }

    if (score >= 45) {
        return 'warning'
    }

    if (model.fit) {
        return 'danger'
    }

    return 'neutral'
}

function runtimeTone(status: string): BadgeTone {
    if (status === 'available') {
        return 'success'
    }

    if (status === 'missing') {
        return 'warning'
    }

    if (status === 'degraded') {
        return 'warning'
    }

    return 'neutral'
}
</script>

<template>
    <section class="space-y-4" aria-label="Cookbook launch">
        <div class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_260px]">
            <section class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                            <Radar class="h-4 w-4 text-[var(--talos-accent)]" />
                            Hardware scan
                            <TalosGuideInfoButton guide-id="cookbook.launch" compact side="bottom" />
                        </div>
                        <p class="mt-1 text-sm leading-6 text-[var(--talos-muted)]">
                            Local evidence comes from the Cookbook API and is used only for deterministic fit scoring.
                        </p>
                    </div>
                    <Button type="button" size="sm" :disabled="loading" @click="emit('scan')">
                        <Loader2 v-if="loading" class="h-4 w-4 animate-spin" />
                        <Cpu v-else class="h-4 w-4" />
                        Run hardware scan
                    </Button>
                </div>

                <div v-if="profileState === 'loading'" role="status" class="mt-3 flex items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-4 text-sm text-[var(--talos-muted)]">
                    <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                    Loading hardware profile
                </div>

                <div v-else-if="profileState === 'ready' && profile" class="mt-3 grid gap-2 md:grid-cols-4">
                    <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2">
                        <div class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">CPU</div>
                        <div class="mt-1 truncate text-sm font-semibold text-[var(--talos-text)]">{{ profile.cpu_model || 'unknown' }}</div>
                        <div class="mt-1 text-xs text-[var(--talos-muted)]">{{ profile.cpu_cores ?? 'unknown' }} cores</div>
                    </div>
                    <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2">
                        <div class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">RAM</div>
                        <div class="mt-1 text-sm font-semibold text-[var(--talos-text)]">{{ formatMb(profile.ram_total_mb) }}</div>
                        <div class="mt-1 text-xs text-[var(--talos-muted)]">{{ formatMb(profile.ram_free_mb) }} free</div>
                    </div>
                    <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2">
                        <div class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">GPU</div>
                        <div class="mt-1 truncate text-sm font-semibold text-[var(--talos-text)]">{{ profile.gpus?.[0]?.model || 'not detected' }}</div>
                        <div class="mt-1 text-xs text-[var(--talos-muted)]">{{ formatMb(profile.gpus?.[0]?.vram_mb) }} VRAM</div>
                    </div>
                    <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2">
                        <div class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Trust</div>
                        <div class="mt-1 text-sm font-semibold text-[var(--talos-text)]">{{ profile.trust_level || 'local evidence' }}</div>
                        <div class="mt-1 truncate text-xs text-[var(--talos-muted)]">{{ profile.scanned_at || 'not scanned' }}</div>
                    </div>
                </div>

                <div v-else-if="profileState === 'empty'" class="mt-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-4 text-sm text-[var(--talos-muted)]">
                    No local hardware profile has been scanned yet.
                </div>
            </section>

            <section class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
                <div class="flex items-center justify-between gap-3">
                    <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Runtime readiness</div>
                    <Badge tone="neutral">{{ runtimes.length }} runtimes</Badge>
                </div>
                <div v-if="runtimesState === 'loading'" role="status" class="mt-3 flex items-center gap-2 text-sm text-[var(--talos-muted)]">
                    <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                    Loading runtime readiness
                </div>
                <div v-else-if="runtimesState === 'ready'" class="mt-3 space-y-2">
                    <article
                        v-for="runtime in runtimes"
                        :key="runtime.kind"
                        class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2"
                    >
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                <div class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ runtime.name }}</div>
                                <div class="mt-1 truncate font-mono text-xs text-[var(--talos-muted)]">{{ runtime.kind }} {{ runtime.version || '' }}</div>
                            </div>
                            <Badge :tone="runtimeTone(runtime.status)">{{ runtime.status }}</Badge>
                        </div>
                    </article>
                </div>
                <p v-else-if="runtimesState === 'empty'" class="mt-3 text-sm leading-6 text-[var(--talos-muted)]">
                    No local runtime readiness has been returned.
                </p>
            </section>
        </div>

        <section class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)]">
            <div class="flex flex-col gap-2 border-b border-[var(--talos-border)] bg-[var(--talos-active)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Fit score</div>
                <Button type="button" variant="ghost" size="sm" :disabled="loading" @click="emit('refresh')">
                    <Loader2 v-if="loading" class="h-4 w-4 animate-spin" />
                    <RefreshCw v-else class="h-4 w-4" />
                    Refresh models
                </Button>
            </div>

            <div v-if="modelsState === 'loading'" role="status" class="flex items-center gap-2 px-3 py-4 text-sm text-[var(--talos-muted)]">
                <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                Loading Cookbook models
            </div>

            <div v-else-if="modelsState === 'ready'" class="divide-y divide-[var(--talos-border)]">
                <article
                    v-for="model in visibleModels"
                    :key="model.id"
                    class="grid gap-3 px-3 py-3 lg:grid-cols-[minmax(0,1fr)_160px]"
                >
                    <div class="min-w-0">
                        <div class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ model.display_name }}</div>
                        <div class="mt-1 truncate font-mono text-xs text-[var(--talos-muted)]">{{ model.model_id }}</div>
                        <div class="mt-2 flex flex-wrap gap-1.5">
                            <Badge v-for="mode in model.runtime_modes" :key="mode" tone="neutral">{{ mode }}</Badge>
                            <Badge v-if="model.quantization" tone="neutral">{{ model.quantization }}</Badge>
                        </div>
                    </div>
                    <div class="flex items-start gap-2 lg:justify-end">
                        <Badge :tone="fitTone(model)">{{ model.fit?.label ?? 'Unknown' }}</Badge>
                        <div class="text-right">
                            <div class="text-sm font-semibold text-[var(--talos-text)]">{{ model.fit?.score ?? 0 }}/100</div>
                            <div class="text-[11px] text-[var(--talos-muted)]">fit score</div>
                        </div>
                    </div>
                </article>
            </div>

            <p v-else-if="modelsState === 'empty'" class="px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                No Cookbook models returned by `/api/talos/cookbook/models`.
            </p>
        </section>
    </section>
</template>
