<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlertCircle, Loader2, LockKeyhole, RefreshCw } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import Surface from '../../ui/Surface.vue'
import { useTalosAdmin } from '../../../composables/useTalosAdmin'

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
const visibleError = computed(() => localError.value || adminError.value)

async function refreshPolicy() {
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
                    <h3 class="mt-1 text-base font-semibold text-[var(--talos-text)]">Capability boundary</h3>
                </div>
                <Button type="button" variant="ghost" size="sm" :disabled="loadingAdmin || !token" @click="refreshPolicy">
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

            <div class="flex flex-wrap gap-2">
                <Badge tone="warning">default_decision {{ policyStatus?.default_decision ?? 'deny' }}</Badge>
                <Badge tone="neutral">{{ policyStatus?.capabilities.length ?? 0 }} capabilities</Badge>
            </div>

            <div v-if="policyStatus" class="flex flex-wrap gap-2">
                <Badge v-for="capability in policyStatus.capabilities" :key="capability" tone="neutral">{{ capability }}</Badge>
            </div>

            <div v-else class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
                Policy panel is read-only and requires `/api/talos/admin/policy`.
            </div>
        </div>
    </Surface>
</template>
