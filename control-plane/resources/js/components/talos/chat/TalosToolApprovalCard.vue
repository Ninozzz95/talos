<script setup lang="ts">
import { computed } from 'vue'
import { Loader2, MousePointerClick, ShieldCheck, TriangleAlert } from '@lucide/vue'
import { Button } from '../../ui/button'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '../../ui/alert-dialog'
import type { TalosPendingToolApproval } from '../../../lib/talosTypes'

const props = withDefaults(defineProps<{
    approval: TalosPendingToolApproval
    busy?: boolean
}>(), {
    busy: false,
})

const emit = defineEmits<{
    decide: [decision: 'approve' | 'reject']
}>()

const pageHost = computed(() => {
    if (!props.approval.url) return 'Current browser page'
    try {
        return new URL(props.approval.url).host
    } catch {
        return 'Current browser page'
    }
})
const evidenceSuffix = computed(() => props.approval.evidence_hash.slice(-12))
</script>

<template>
    <section
        data-testid="tool-approval-card"
        :data-approval-status="approval.status"
        class="min-w-0 rounded-md border px-3 py-3 text-sm"
        :class="approval.status === 'stale'
            ? 'border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)]'
            : 'border-[var(--talos-accent)]/45 bg-[var(--talos-panel-soft)]'"
        :aria-label="approval.status === 'stale' ? 'Stale browser action' : 'Browser action approval'"
    >
        <div class="flex min-w-0 items-start gap-3">
            <TriangleAlert v-if="approval.status === 'stale'" class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
            <MousePointerClick v-else class="mt-0.5 h-4 w-4 shrink-0 text-[var(--talos-accent)]" />
            <div class="min-w-0 flex-1">
                <div class="font-semibold text-[var(--talos-text)]">
                    {{ approval.status === 'stale' ? 'This action is stale' : 'Browser action requires approval' }}
                </div>
                <p v-if="approval.status === 'stale'" class="mt-1 break-words text-xs text-[var(--talos-muted)]">
                    The captured page changed before approval. Retry the request to create fresh evidence.
                </p>
                <template v-else>
                    <p class="mt-1 break-words text-xs text-[var(--talos-muted)]">
                        TALOS will activate the verified {{ approval.target.role }} target
                        <strong class="font-semibold text-[var(--talos-text)]">{{ approval.target.name }}</strong>
                        on {{ pageHost }}.
                    </p>
                    <dl class="mt-3 grid min-w-0 gap-1 text-xs sm:grid-cols-[6rem_minmax(0,1fr)]">
                        <dt class="text-[var(--talos-muted)]">Expected effect</dt>
                        <dd class="min-w-0 break-words text-[var(--talos-text)]">{{ approval.expected_effect }}</dd>
                        <dt class="text-[var(--talos-muted)]">Evidence</dt>
                        <dd class="min-w-0 font-mono text-[11px] text-[var(--talos-muted)]">...{{ evidenceSuffix }}</dd>
                    </dl>
                </template>
                <code v-if="approval.stale_reason" class="mt-2 block break-all text-[11px] text-[var(--talos-warning)]">{{ approval.stale_reason }}</code>
            </div>
        </div>

        <div v-if="approval.actionable && approval.status === 'pending'" class="mt-3 flex flex-wrap justify-end gap-2">
            <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="tool-approval-reject"
                :disabled="busy"
                @click="emit('decide', 'reject')"
            >
                Reject
            </Button>
            <AlertDialog>
                <AlertDialogTrigger as-child>
                    <Button
                        type="button"
                        size="sm"
                        data-testid="tool-approval-open-confirm"
                        :disabled="busy"
                    >
                        <Loader2 v-if="busy" class="mr-2 h-3.5 w-3.5 animate-spin" />
                        <ShieldCheck v-else class="mr-2 h-3.5 w-3.5" />
                        Approve
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Approve this exact browser action?</AlertDialogTitle>
                        <AlertDialogDescription>
                            TALOS will click “{{ approval.target.name }}” on {{ pageHost }} using evidence bound to this run. A changed page invalidates this approval.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction data-testid="tool-approval-confirm" @click="emit('decide', 'approve')">
                            Approve action
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    </section>
</template>
