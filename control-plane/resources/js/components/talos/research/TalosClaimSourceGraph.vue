<script setup lang="ts">
import { Network } from '@lucide/vue'
import Badge from '../../ui/Badge.vue'
import type { TalosResearchClaim, TalosResearchSource } from '../../../lib/talosTypes'

defineProps<{
    claims: TalosResearchClaim[]
    sources: TalosResearchSource[]
}>()

function refsForClaim(claim: TalosResearchClaim) {
    if (claim.sources?.length) {
        return claim.sources.map((source) => source.client_id)
    }

    const refs = claim.metadata?.source_refs

    return Array.isArray(refs)
        ? refs.filter((item): item is string => typeof item === 'string')
        : []
}

function sourceStatus(sourceId: string, sources: TalosResearchSource[]) {
    return sources.find((source) => source.client_id === sourceId)?.status ?? 'missing'
}

function statusTone(status: string) {
    if (status === 'fetched' || status === 'verified') {
        return 'success'
    }

    if (status === 'failed' || status === 'missing' || status === 'rejected') {
        return 'danger'
    }

    if (status === 'blocked_by_source' || status === 'conflicting' || status === 'contradicted') {
        return 'warning'
    }

    return 'neutral'
}
</script>

<template>
    <section class="overflow-hidden rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)]">
        <div class="flex items-center justify-between gap-3 border-b border-[var(--talos-border)] bg-[var(--talos-active)] px-3 py-2">
            <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                <Network class="h-4 w-4 text-[var(--talos-accent)]" />
                Claim-source graph
            </div>
            <Badge tone="neutral">{{ claims.length }} claims</Badge>
        </div>

        <div v-if="!claims.length" class="px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
            No claim-source graph can be drawn until a report has claims.
        </div>

        <div v-else class="divide-y divide-[var(--talos-border)]">
            <article v-for="claim in claims" :key="claim.id" class="px-3 py-3">
                <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="min-w-0 flex-1">
                        <div class="font-mono text-xs font-semibold text-[var(--talos-text)]">claim #{{ claim.sequence }}</div>
                        <p class="mt-1 text-sm leading-6 text-[var(--talos-text)]">{{ claim.text }}</p>
                    </div>
                    <Badge :tone="statusTone(claim.status)">{{ claim.status }}</Badge>
                </div>

                <div class="mt-3 flex flex-wrap gap-2">
                    <Badge
                        v-for="sourceId in refsForClaim(claim)"
                        :key="sourceId"
                        :tone="statusTone(sourceStatus(sourceId, sources))"
                    >
                        {{ sourceId }} -> claim #{{ claim.sequence }}
                    </Badge>
                    <Badge v-if="!refsForClaim(claim).length" tone="warning">source required</Badge>
                </div>
            </article>
        </div>
    </section>
</template>
