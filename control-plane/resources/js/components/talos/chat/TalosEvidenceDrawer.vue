<script setup lang="ts">
import { computed } from 'vue'
import { CheckCircle2, CircleDashed, Database, GitBranch, ShieldCheck } from '@lucide/vue'
import Badge from '../../ui/Badge.vue'
import type { TalosMessage } from '../../../lib/talosTypes'

type MessageSource = {
    context_set_id?: string
    file_id?: string
    chunk_id?: string
    file_name?: string
    preview?: string
}

const props = defineProps<{
    message: TalosMessage
}>()

function objectFrom(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null
    }

    return value as Record<string, unknown>
}

function stringFrom(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : ''
}

const metadata = computed(() => objectFrom(props.message.metadata) ?? {})
const run = computed(() => objectFrom(metadata.value.run))
const mutations = computed(() => {
    const value = metadata.value.mutations
    return Array.isArray(value) ? value : []
})
const sources = computed<MessageSource[]>(() => {
    const value = metadata.value.used_context

    if (!Array.isArray(value)) {
        return []
    }

    return value.flatMap((source) => {
        const data = objectFrom(source)

        return data ? [data as MessageSource] : []
    })
})

const runId = computed(() => props.message.run_id || stringFrom(run.value?.id))
const runStatus = computed(() => stringFrom(run.value?.status) || 'not captured')
const runMode = computed(() => stringFrom(run.value?.mode) || 'unknown mode')
const modelLabel = computed(() => {
    const provider = stringFrom(run.value?.provider)
    const model = stringFrom(run.value?.model)

    if (provider && model) {
        return `${provider} / ${model}`
    }

    if (model) {
        return model
    }

    return stringFrom(props.message.model_profile_id) || 'not captured'
})
const replayLabel = computed(() => runId.value ? 'Replay evidence attached' : 'No replay evidence')
const mutationCountLabel = computed(() => {
    const count = mutations.value.length
    return count === 1 ? '1 mutation' : `${count} mutations`
})
const sourceCountLabel = computed(() => `Sources ${sources.value.length}`)
const firstSourceLabel = computed(() => {
    if (!sources.value.length) {
        return 'No grounding source'
    }

    return sources.value[0].file_name || sources.value[0].chunk_id || sources.value[0].file_id || 'Grounding source'
})
</script>

<template>
    <section class="mt-3 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-3" aria-label="TALOS evidence drawer">
        <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
                <div class="text-xs font-semibold text-[var(--talos-text)]">Run evidence</div>
                <div class="mt-1 text-[11px] leading-5 text-[var(--talos-muted)]">
                    Only safe provenance is shown here. Local storage paths and raw extracted content stay out of chat.
                </div>
            </div>
            <Badge :tone="runId ? 'success' : 'neutral'">{{ replayLabel }}</Badge>
        </div>

        <div class="mt-3 grid gap-2 text-xs text-[var(--talos-muted)] sm:grid-cols-2 xl:grid-cols-3">
            <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2">
                <div class="flex items-center gap-2 font-semibold text-[var(--talos-text)]">
                    <ShieldCheck class="h-4 w-4 text-[var(--talos-accent)]" />
                    <span>Run {{ runId || 'not persisted' }}</span>
                </div>
                <div class="mt-1">Mode {{ runMode }}</div>
            </div>

            <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2">
                <div class="flex items-center gap-2 font-semibold text-[var(--talos-text)]">
                    <CheckCircle2 v-if="runStatus === 'succeeded'" class="h-4 w-4 text-[var(--talos-success)]" />
                    <CircleDashed v-else class="h-4 w-4 text-[var(--talos-warning)]" />
                    <span>Status {{ runStatus }}</span>
                </div>
                <div class="mt-1">Status captured from TALOS chat.</div>
            </div>

            <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2">
                <div class="font-semibold text-[var(--talos-text)]">Model {{ modelLabel }}</div>
                <div class="mt-1">Provider metadata comes from the persisted run response.</div>
            </div>

            <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2">
                <div class="flex items-center gap-2 font-semibold text-[var(--talos-text)]">
                    <GitBranch class="h-4 w-4 text-[var(--talos-accent)]" />
                    <span>{{ mutationCountLabel }}</span>
                </div>
                <div class="mt-1">JMP output retained with the answer.</div>
            </div>

            <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2">
                <div class="flex items-center gap-2 font-semibold text-[var(--talos-text)]">
                    <Database class="h-4 w-4 text-[var(--talos-accent)]" />
                    <span>{{ sourceCountLabel }}</span>
                </div>
                <div class="mt-1">{{ firstSourceLabel }}</div>
            </div>
        </div>
    </section>
</template>
