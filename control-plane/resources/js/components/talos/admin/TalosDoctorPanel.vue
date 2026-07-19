<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertCircle, Activity, Loader2, Stethoscope } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import TalosGuideInfoButton from '../guide/TalosGuideInfoButton.vue'
import Surface from '../../ui/Surface.vue'
import { useTalosAdmin } from '../../../composables/useTalosAdmin'
import { resolveTalosCollectionState } from '../../../lib/talosCollectionState'

const props = defineProps<{
    token: string
}>()

const {
    doctorReport,
    loadingAdmin,
    adminError,
    loadDoctor,
} = useTalosAdmin()

const localError = ref<string | null>(null)
const doctorRequested = ref(false)
const visibleError = computed(() => localError.value || adminError.value)
const doctorState = computed(() => resolveTalosCollectionState({
    itemCount: doctorReport.value ? 1 : 0,
    loading: loadingAdmin.value,
    error: visibleError.value,
    requested: doctorRequested.value,
}))

async function refreshDoctor() {
    doctorRequested.value = true
    localError.value = null

    try {
        await loadDoctor(props.token)
    } catch (error) {
        localError.value = error instanceof Error ? error.message : 'TALOS could not load doctor status.'
    }
}

function statusTone(status: string) {
    if (status === 'healthy') {
        return 'success'
    }

    if (status === 'failed') {
        return 'danger'
    }

    return 'warning'
}
</script>

<template>
    <Surface>
        <div class="border-b border-[var(--talos-border)] p-4">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                        <Stethoscope class="h-4 w-4 text-[var(--talos-accent)]" />
                        Doctor
                    </div>
                    <div class="mt-1 flex items-center gap-1.5">
                        <h3 class="text-base font-semibold text-[var(--talos-text)]">Runtime readiness</h3>
                        <TalosGuideInfoButton guide-id="doctor.doctor" compact side="bottom" />
                    </div>
                </div>
                <Button type="button" variant="ghost" size="sm" :disabled="loadingAdmin || !token" @click="refreshDoctor">
                    <Loader2 v-if="loadingAdmin" class="h-4 w-4 animate-spin" />
                    <Activity v-else class="h-4 w-4" />
                    Check
                </Button>
            </div>
        </div>

        <div class="space-y-3 p-4">
            <div v-if="visibleError" class="flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)]">
                <AlertCircle class="mt-1 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
                <span>{{ visibleError }}</span>
            </div>

            <div v-if="doctorState === 'loading'" role="status" class="flex items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm text-[var(--talos-muted)]">
                <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                Running Doctor checks
            </div>

            <div v-if="doctorState === 'ready'" class="flex flex-wrap gap-2">
                <Badge :tone="statusTone(doctorReport.status)">{{ doctorReport.status }}</Badge>
                <Badge tone="neutral">validator_health {{ doctorReport.checks.validator_health?.status }}</Badge>
            </div>

            <div v-if="doctorState === 'ready'" class="max-h-[260px] divide-y divide-[var(--talos-border)] overflow-y-auto rounded-md border border-[var(--talos-border)]" tabindex="0">
                <div v-for="(check, name) in doctorReport.checks" :key="name" class="grid grid-cols-[minmax(0,1fr)_86px] gap-3 bg-[var(--talos-panel-soft)] px-3 py-2 text-sm">
                    <span class="min-w-0">
                        <span class="block truncate font-mono text-xs text-[var(--talos-text)]">{{ name }}</span>
                        <span class="mt-1 block truncate text-[11px] text-[var(--talos-muted)]">{{ check.detail }}</span>
                    </span>
                    <Badge :tone="statusTone(check.status)">{{ check.status }}</Badge>
                </div>
            </div>

            <div v-if="doctorState === 'idle'" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                Enter an admin token and call `/api/talos/admin/doctor`.
            </div>

            <div v-if="doctorState === 'empty'" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                Doctor completed without returning a readiness report. Retry Check and inspect Audit if it repeats.
            </div>
        </div>
    </Surface>
</template>
