<script setup lang="ts">
import { GitBranch } from '@lucide/vue'
import Badge from '../../ui/Badge.vue'
import type { TalosResearchClaim } from '../../../lib/talosTypes'

defineProps<{
    claims: TalosResearchClaim[]
}>()

type BadgeTone = 'success' | 'danger' | 'warning' | 'neutral'

function statusTone(status: string): BadgeTone {
    if (status === 'verified') {
        return 'success'
    }

    if (status === 'blocked_by_source' || status === 'conflicting') {
        return 'warning'
    }

    if (status === 'rejected') {
        return 'danger'
    }

    return 'neutral'
}

function blockedBy(claim: TalosResearchClaim) {
    const blocked = claim.metadata?.blocked_by_sources
    return Array.isArray(blocked) ? blocked.filter((item): item is string => typeof item === 'string') : []
}
</script>

<template>
    <div class="space-y-3">
        <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
            <GitBranch class="h-4 w-4 text-[var(--talos-accent)]" />
            Claim-source mapping
        </div>

        <div v-if="!claims.length" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
            No claims returned by `/api/talos/research-reports`.
        </div>

        <article
            v-for="claim in claims"
            :key="claim.id"
            class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3"
        >
            <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                    <div class="text-sm font-semibold leading-6 text-[var(--talos-text)]">{{ claim.text }}</div>
                    <div class="mt-1 font-mono text-[11px] text-[var(--talos-muted)]">claim #{{ claim.sequence }}</div>
                </div>
                <Badge :tone="statusTone(claim.status)">{{ claim.status }}</Badge>
            </div>

            <div class="mt-3 flex flex-wrap gap-2">
                <Badge v-for="source in claim.sources ?? []" :key="source.id" tone="neutral">
                    {{ source.client_id }}
                </Badge>
                <Badge v-if="!(claim.sources ?? []).length" tone="warning">source required</Badge>
            </div>

            <div v-if="blockedBy(claim).length" class="mt-3 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-xs leading-5 text-[var(--talos-text)]">
                blocked_by_source: {{ blockedBy(claim).join(', ') }}
            </div>
        </article>
    </div>
</template>
