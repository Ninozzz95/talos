<script setup lang="ts">
import { ExternalLink } from '@lucide/vue'
import Badge from '../../ui/Badge.vue'
import type { TalosResearchSource } from '../../../lib/talosTypes'

defineProps<{
    sources: TalosResearchSource[]
}>()

type BadgeTone = 'success' | 'danger' | 'warning' | 'neutral'

function statusTone(status: string): BadgeTone {
    if (status === 'fetched') {
        return 'success'
    }

    if (status === 'failed') {
        return 'danger'
    }

    if (status === 'planned') {
        return 'warning'
    }

    return 'neutral'
}
</script>

<template>
    <div class="overflow-hidden rounded-md border border-[var(--talos-border)]">
        <div class="grid grid-cols-[80px_minmax(0,1fr)_92px] gap-3 border-b border-[var(--talos-border)] bg-[var(--talos-active)] px-3 py-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
            <span>Source</span>
            <span>Evidence</span>
            <span>Status</span>
        </div>

        <div v-if="!sources.length" class="bg-[var(--talos-panel-soft)] px-3 py-4 text-sm leading-6 text-[var(--talos-muted)]">
            No sources returned by `/api/talos/research-reports`.
        </div>

        <article
            v-for="source in sources"
            :key="source.id"
            class="grid grid-cols-[80px_minmax(0,1fr)_92px] gap-3 border-t border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-3 py-3 text-sm first:border-t-0"
        >
            <div class="min-w-0">
                <div class="font-mono text-xs text-[var(--talos-text)]">{{ source.client_id }}</div>
                <div class="mt-1 text-[11px] text-[var(--talos-muted)]">#{{ source.sequence }}</div>
            </div>
            <div class="min-w-0">
                <div class="truncate font-semibold text-[var(--talos-text)]">{{ source.title || source.url }}</div>
                <a
                    :href="source.url"
                    target="_blank"
                    rel="noreferrer"
                    class="mt-1 inline-flex max-w-full items-center gap-1 truncate font-mono text-[11px] text-[var(--talos-accent)]"
                >
                    <ExternalLink class="h-3 w-3 shrink-0" />
                    <span class="truncate">{{ source.url }}</span>
                </a>
                <p v-if="source.excerpt" class="mt-2 line-clamp-2 text-xs leading-5 text-[var(--talos-muted)]">{{ source.excerpt }}</p>
                <p v-if="source.failure_reason" class="mt-2 text-xs leading-5 text-[var(--talos-danger)]">{{ source.failure_reason }}</p>
            </div>
            <div class="flex justify-end">
                <Badge :tone="statusTone(source.status)">{{ source.status }}</Badge>
            </div>
        </article>
    </div>
</template>
