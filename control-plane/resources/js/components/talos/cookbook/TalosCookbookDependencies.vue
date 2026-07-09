<script setup lang="ts">
import { computed } from 'vue'
import { Box, Loader2, PackageCheck } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import type { TalosCookbookDependencyCatalog, TalosCookbookDependencyPreview, TalosCookbookRuntime } from '../../../lib/talosTypes'

type BadgeTone = 'success' | 'danger' | 'warning' | 'neutral'

const disabledReason = 'Cookbook V1 is preview-only.'

const props = defineProps<{
    runtimes: TalosCookbookRuntime[]
    dependencyCatalog: TalosCookbookDependencyCatalog | null
    dependencyPreview: TalosCookbookDependencyPreview | null
    loading: boolean
}>()

const emit = defineEmits<{
    preview: []
}>()

const dependencies = computed(() => props.dependencyCatalog?.dependencies ?? [])
const policy = computed(() => props.dependencyCatalog?.policy ?? props.dependencyPreview?.policy ?? null)

function runtimeTone(status: string): BadgeTone {
    if (status === 'available') {
        return 'success'
    }

    if (status === 'missing' || status === 'degraded') {
        return 'warning'
    }

    return 'neutral'
}
</script>

<template>
    <section class="space-y-4" aria-label="Cookbook dependencies">
        <section class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                        <PackageCheck class="h-4 w-4 text-[var(--talos-accent)]" />
                        Dependencies
                    </div>
                    <p class="mt-1 text-sm leading-6 text-[var(--talos-muted)]">
                        Cookbook V1 reports runtime readiness only. Dependency installation stays disabled until explicit host execution policy exists.
                    </p>
                </div>
                <Button type="button" size="sm" variant="secondary" disabled :title="disabledReason">
                    <Box class="h-4 w-4" />
                    Install dependency
                </Button>
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone="warning">execution_allowed {{ policy?.execution_allowed ? 'true' : 'false' }}</Badge>
                <Badge tone="neutral">required {{ policy?.required_scope ?? 'talos.shell.exec' }}</Badge>
                <Button type="button" size="sm" variant="outline" :disabled="loading" @click="emit('preview')">
                    <Loader2 v-if="loading" class="h-4 w-4 animate-spin" />
                    Preview dependency plan
                </Button>
            </div>
            <p class="mt-2 text-xs text-[var(--talos-muted)]">{{ disabledReason }}</p>
        </section>

        <div v-if="dependencies.length" class="grid gap-3 md:grid-cols-2">
            <article
                v-for="dependency in dependencies"
                :key="dependency.runtime"
                class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3"
            >
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <h4 class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ dependency.name }}</h4>
                        <p class="mt-1 truncate font-mono text-xs text-[var(--talos-muted)]">{{ dependency.runtime }} · {{ dependency.package_manager }}</p>
                    </div>
                    <Badge :tone="runtimeTone(dependency.detected_status)">{{ dependency.detected_status }}</Badge>
                </div>
                <dl class="mt-3 grid gap-2 text-xs">
                    <div class="flex items-center justify-between gap-3">
                        <dt class="text-[var(--talos-muted)]">Version</dt>
                        <dd class="truncate text-[var(--talos-text)]">{{ dependency.detected_version || 'not detected' }}</dd>
                    </div>
                    <div class="flex items-center justify-between gap-3">
                        <dt class="text-[var(--talos-muted)]">Install allowed</dt>
                        <dd class="truncate text-[var(--talos-text)]">{{ dependency.install_allowed ? 'yes' : 'no' }}</dd>
                    </div>
                    <div class="flex items-center justify-between gap-3">
                        <dt class="text-[var(--talos-muted)]">Gate</dt>
                        <dd class="truncate font-mono text-[var(--talos-text)]">{{ dependency.execution_gate }}</dd>
                    </div>
                </dl>
                <p class="mt-3 text-xs leading-5 text-[var(--talos-muted)]">{{ dependency.install_hint }}</p>
            </article>
        </div>

        <div v-else-if="runtimes.length" class="grid gap-3 md:grid-cols-2">
            <article
                v-for="runtime in runtimes"
                :key="runtime.kind"
                class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3"
            >
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <h4 class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ runtime.name }}</h4>
                        <p class="mt-1 truncate font-mono text-xs text-[var(--talos-muted)]">{{ runtime.kind }}</p>
                    </div>
                    <Badge :tone="runtimeTone(runtime.status)">{{ runtime.status }}</Badge>
                </div>
            </article>
        </div>

        <div v-if="dependencyPreview" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3">
            <div class="flex flex-wrap gap-2">
                <Badge tone="warning">mode {{ dependencyPreview.mode }}</Badge>
                <Badge tone="neutral">executed {{ dependencyPreview.executed ? 'yes' : 'no' }}</Badge>
                <Badge tone="neutral">{{ dependencyPreview.steps.length }} steps</Badge>
            </div>
            <ol class="mt-3 space-y-2 text-xs leading-5 text-[var(--talos-muted)]">
                <li v-for="step in dependencyPreview.steps" :key="`${step.kind}-${step.runtime}-${step.model_id ?? ''}`" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-2">
                    <span class="font-mono text-[var(--talos-text)]">{{ step.kind }}</span>
                    <span class="ml-2">{{ step.description }}</span>
                </li>
            </ol>
        </div>

        <p v-if="!dependencies.length && !runtimes.length" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
            No runtime dependency evidence returned by `/api/talos/cookbook/overview`.
        </p>
    </section>
</template>
