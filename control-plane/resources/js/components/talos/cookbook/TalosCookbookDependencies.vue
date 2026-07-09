<script setup lang="ts">
import { Box, PackageCheck } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import type { TalosCookbookRuntime } from '../../../lib/talosTypes'

type BadgeTone = 'success' | 'danger' | 'warning' | 'neutral'

const disabledReason = 'Cookbook V1 is preview-only.'

defineProps<{
    runtimes: TalosCookbookRuntime[]
}>()

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
            <p class="mt-2 text-xs text-[var(--talos-muted)]">{{ disabledReason }}</p>
        </section>

        <div v-if="runtimes.length" class="grid gap-3 md:grid-cols-2">
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
                <dl class="mt-3 grid gap-2 text-xs">
                    <div class="flex items-center justify-between gap-3">
                        <dt class="text-[var(--talos-muted)]">Version</dt>
                        <dd class="truncate text-[var(--talos-text)]">{{ runtime.version || 'not detected' }}</dd>
                    </div>
                    <div class="flex items-center justify-between gap-3">
                        <dt class="text-[var(--talos-muted)]">Executable</dt>
                        <dd class="max-w-[180px] truncate font-mono text-[var(--talos-text)]">{{ runtime.executable_path || 'not exposed' }}</dd>
                    </div>
                    <div class="flex items-center justify-between gap-3">
                        <dt class="text-[var(--talos-muted)]">Checked</dt>
                        <dd class="truncate text-[var(--talos-text)]">{{ runtime.last_checked_at || 'not checked' }}</dd>
                    </div>
                </dl>
            </article>
        </div>

        <p v-else class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
            No runtime dependency evidence returned by `/api/talos/cookbook/overview`.
        </p>
    </section>
</template>
