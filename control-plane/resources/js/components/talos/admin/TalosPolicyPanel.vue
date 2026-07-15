<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertCircle, Loader2, LockKeyhole, RefreshCw } from '@lucide/vue'
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
    policyStatus,
    loadingAdmin,
    adminError,
    loadPolicy,
} = useTalosAdmin()

const localError = ref<string | null>(null)
const policyRequested = ref(false)
const visibleError = computed(() => localError.value || adminError.value)
const policyState = computed(() => resolveTalosCollectionState({
    itemCount: policyStatus.value ? 1 : 0,
    loading: loadingAdmin.value,
    error: visibleError.value,
    requested: policyRequested.value,
}))

async function refreshPolicy() {
    policyRequested.value = true
    localError.value = null

    try {
        await loadPolicy(props.token)
    } catch (error) {
        localError.value = error instanceof Error ? error.message : 'TALOS could not load policy status.'
    }
}
</script>

<template>
    <Surface>
        <div class="border-b border-[var(--talos-border)] p-4">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                        <LockKeyhole class="h-4 w-4 text-[var(--talos-accent)]" />
                        Policy
                    </div>
                    <div class="mt-1 flex items-center gap-1.5">
                        <h3 class="text-base font-semibold text-[var(--talos-text)]">Capability boundary</h3>
                        <TalosGuideInfoButton guide-id="doctor.policy" compact side="bottom" />
                    </div>
                </div>
                <Button type="button" variant="ghost" size="sm" aria-label="Refresh policy status" title="Refresh policy status" :disabled="loadingAdmin || !token" @click="refreshPolicy">
                    <Loader2 v-if="loadingAdmin" class="h-4 w-4 animate-spin" />
                    <RefreshCw v-else class="h-4 w-4" />
                </Button>
            </div>
        </div>

        <div class="space-y-3 p-4">
            <div v-if="visibleError" class="flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)]">
                <AlertCircle class="mt-1 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
                <span>{{ visibleError }}</span>
            </div>

            <div v-if="policyState === 'loading'" role="status" class="flex items-center gap-2 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm text-[var(--talos-muted)]">
                <Loader2 class="h-4 w-4 animate-spin text-[var(--talos-accent)]" />
                Loading policy status
            </div>

            <div v-if="policyState === 'ready'" class="flex flex-wrap gap-2">
                <Badge tone="warning">default_decision {{ policyStatus?.default_decision }}</Badge>
                <Badge tone="neutral">{{ policyStatus?.capabilities.length }} capabilities</Badge>
            </div>

            <div v-if="policyState === 'ready'" class="flex flex-wrap gap-2">
                <Badge v-for="capability in policyStatus.capabilities" :key="capability" tone="neutral">{{ capability }}</Badge>
            </div>

            <div v-if="policyState === 'idle'" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                Policy panel is read-only and requires `/api/talos/admin/policy`.
            </div>

            <div v-if="policyState === 'empty'" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                The policy endpoint returned no policy status. Retry and inspect Audit if it repeats.
            </div>
        </div>
    </Surface>
</template>
