<script setup lang="ts">
import { CheckCircle2, CircleDashed, FileText, Network, PlayCircle, ServerCog } from '@lucide/vue'
import Button from '../../ui/Button.vue'

const props = defineProps<{
    modelReady: boolean
    contextSelected: boolean
    contextAvailable: boolean
    sessionReady: boolean
    evidenceReady: boolean
}>()

const emit = defineEmits<{
    openModel: []
    openContext: []
}>()

function contextLabel() {
    if (props.contextSelected) {
        return 'Context armed'
    }

    if (props.contextAvailable) {
        return 'Context available'
    }

    return 'Context optional'
}
</script>

<template>
    <section class="w-full max-w-[680px] rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)]/78 p-3 text-left shadow-sm backdrop-blur" aria-label="TALOS guided start">
        <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
                <div class="text-[11px] font-semibold uppercase text-[var(--talos-muted)]">Mission Path</div>
                <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                    Ground the task, run it through TALOS, then benchmark the proof.
                </p>
            </div>
            <div class="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="ghost" @click="emit('openModel')">
                    <ServerCog class="h-4 w-4" />
                    Model
                </Button>
                <Button type="button" size="sm" variant="ghost" @click="emit('openContext')">
                    <FileText class="h-4 w-4" />
                    Context
                </Button>
            </div>
        </div>

        <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] px-3 py-2">
                <div class="flex items-center gap-2 text-xs font-semibold text-[var(--talos-text)]">
                    <CheckCircle2 v-if="modelReady" class="h-4 w-4 text-[var(--talos-success)]" />
                    <CircleDashed v-else class="h-4 w-4 text-[var(--talos-warning)]" />
                    <span>{{ modelReady ? 'Model linked' : 'Model needed' }}</span>
                </div>
                <p class="mt-1 text-[11px] leading-4 text-[var(--talos-muted)]">Server-side profile, no browser secret.</p>
            </div>

            <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] px-3 py-2">
                <div class="flex items-center gap-2 text-xs font-semibold text-[var(--talos-text)]">
                    <CheckCircle2 v-if="contextSelected" class="h-4 w-4 text-[var(--talos-success)]" />
                    <CircleDashed v-else class="h-4 w-4 text-[var(--talos-muted)]" />
                    <span>{{ contextLabel() }}</span>
                </div>
                <p class="mt-1 text-[11px] leading-4 text-[var(--talos-muted)]">Files stay bounded and untrusted.</p>
            </div>

            <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] px-3 py-2">
                <div class="flex items-center gap-2 text-xs font-semibold text-[var(--talos-text)]">
                    <CheckCircle2 v-if="sessionReady" class="h-4 w-4 text-[var(--talos-success)]" />
                    <CircleDashed v-else class="h-4 w-4 text-[var(--talos-warning)]" />
                    <span>{{ sessionReady ? 'Session ready' : 'Session staged' }}</span>
                </div>
                <p class="mt-1 text-[11px] leading-4 text-[var(--talos-muted)]">The first send opens a persisted turn.</p>
            </div>

            <div class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] px-3 py-2">
                <div class="flex items-center gap-2 text-xs font-semibold text-[var(--talos-text)]">
                    <PlayCircle v-if="evidenceReady" class="h-4 w-4 text-[var(--talos-success)]" />
                    <Network v-else class="h-4 w-4 text-[var(--talos-muted)]" />
                    <span>{{ evidenceReady ? 'Evidence captured' : 'Evidence pending' }}</span>
                </div>
                <p class="mt-1 text-[11px] leading-4 text-[var(--talos-muted)]">Run evidence unlocks replay and compare.</p>
            </div>
        </div>
    </section>
</template>
