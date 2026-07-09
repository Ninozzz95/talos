<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AlertTriangle, Loader2, ShieldCheck } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import Badge from '../../ui/Badge.vue'
import type {
    TalosRecoveryAction,
    TalosRecoveryRequest,
    TalosRun,
    TalosRunEvent,
    TalosRunNodeSummary,
} from '../../../lib/talosTypes'

type RecoveryOption = {
    action: TalosRecoveryAction
    label: string
    description: string
    highRisk: boolean
}

const props = defineProps<{
    run: TalosRun | null
    node: TalosRunNodeSummary | null
    event: TalosRunEvent | null
    loading: boolean
    error: string | null
}>()

const emit = defineEmits<{
    recover: [request: TalosRecoveryRequest]
}>()

const options: RecoveryOption[] = [
    {
        action: 'retry_node',
        label: 'Retry node',
        description: 'Move the selected failed node back to RETRYING.',
        highRisk: false,
    },
    {
        action: 'retry_branch',
        label: 'Retry branch',
        description: 'Retry the selected node as the root of the blocked branch.',
        highRisk: false,
    },
    {
        action: 'edit_payload_and_retry',
        label: 'Edit payload and retry',
        description: 'Attach an operator payload patch before retrying.',
        highRisk: false,
    },
    {
        action: 'skip_node',
        label: 'Skip node',
        description: 'Mark the node SKIPPED and continue the run.',
        highRisk: true,
    },
    {
        action: 'mark_resolved',
        label: 'Mark resolved',
        description: 'Mark the node SUCCESS from an HMI decision.',
        highRisk: true,
    },
]

const selectedAction = ref<TalosRecoveryAction>('retry_node')
const reason = ref('')
const payloadPatch = ref('{\n}')
const highRiskCapability = ref(false)
const localError = ref<string | null>(null)

const selectedNodeId = computed(() => props.node?.id ?? props.event?.node_id ?? null)
const selectedOption = computed(() => options.find((option) => option.action === selectedAction.value) ?? options[0])
const requiresPayload = computed(() => selectedAction.value === 'edit_payload_and_retry')
const previewTargetStatus = computed(() => {
    if (selectedAction.value === 'skip_node') {
        return 'SKIPPED'
    }

    if (selectedAction.value === 'mark_resolved') {
        return 'SUCCESS'
    }

    return 'RETRYING'
})
const previewScope = computed(() => selectedAction.value === 'retry_branch' ? 'branch' : 'node')
const recoveryUnavailableReason = computed(() => {
    if (!props.run) {
        return null
    }

    if (props.run.status === 'succeeded') {
        return 'This run succeeded; recovery is not available.'
    }

    if (props.run.status === 'cancelled') {
        return 'This run was cancelled; recovery is not available.'
    }

    return null
})
const canSubmit = computed(() => {
    if (!props.run || !selectedNodeId.value || props.loading || recoveryUnavailableReason.value) {
        return false
    }

    if (selectedOption.value.highRisk && !highRiskCapability.value) {
        return false
    }

    return true
})

const disabledReason = computed(() => {
    if (!props.run) {
        return 'Select a run before requesting recovery.'
    }

    if (recoveryUnavailableReason.value) {
        return recoveryUnavailableReason.value
    }

    if (!selectedNodeId.value) {
        return 'Select a node or node event before requesting recovery.'
    }

    if (selectedOption.value.highRisk && !highRiskCapability.value) {
        return 'High-risk recovery requires explicit capability confirmation.'
    }

    return null
})

function parsePayload(): Record<string, unknown> {
    if (!requiresPayload.value) {
        return {}
    }

    try {
        const parsed = JSON.parse(payloadPatch.value) as unknown

        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Payload patch must be a JSON object.')
        }

        return parsed as Record<string, unknown>
    } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Payload patch is not valid JSON.')
    }
}

function submitRecovery() {
    localError.value = null

    if (!props.run || !selectedNodeId.value) {
        localError.value = disabledReason.value
        return
    }

    let payload: Record<string, unknown> | undefined
    try {
        payload = requiresPayload.value ? parsePayload() : undefined
    } catch (error) {
        localError.value = error instanceof Error ? error.message : 'Payload patch is not valid JSON.'
        return
    }

    emit('recover', {
        action: selectedAction.value,
        node_id: selectedNodeId.value,
        reason: reason.value.trim() || null,
        payload,
        capabilities: highRiskCapability.value ? ['talos.recovery.high_risk'] : [],
    })
}

watch(selectedAction, () => {
    localError.value = null
})
</script>

<template>
    <div class="overflow-hidden rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)]">
        <div class="flex flex-col gap-2 border-b border-[var(--talos-border)] bg-[var(--talos-active)] px-3 py-2">
            <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--talos-muted)]">
                    <ShieldCheck class="h-4 w-4 text-[var(--talos-accent)]" />
                    HMI recovery
                </div>
                <Badge :tone="selectedNodeId ? 'warning' : 'neutral'">{{ selectedNodeId || 'no node' }}</Badge>
            </div>
            <p class="text-xs leading-5 text-[var(--talos-muted)]">
                Requests are written to `/api/talos/runs/{id}/recover` and appear in the run timeline as audit events.
            </p>
        </div>

        <div class="space-y-3 p-3">
            <div v-if="error || localError" class="flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)]">
                <AlertTriangle class="mt-1 h-4 w-4 shrink-0 text-[var(--talos-warning)]" />
                <span>{{ localError || error }}</span>
            </div>

            <label class="grid gap-1">
                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Action</span>
                <select
                    v-model="selectedAction"
                    class="h-9 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                    :disabled="loading"
                    aria-label="Recovery action"
                >
                    <option v-for="option in options" :key="option.action" :value="option.action">
                        {{ option.label }}
                    </option>
                </select>
                <span class="text-xs leading-5 text-[var(--talos-muted)]">{{ selectedOption.description }}</span>
            </label>

            <label class="grid gap-1">
                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Reason</span>
                <textarea
                    v-model="reason"
                    class="min-h-[74px] resize-none rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2 text-sm leading-6 text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                    placeholder="Operator recovery reason"
                    :disabled="loading"
                    aria-label="Recovery reason"
                />
            </label>

            <label v-if="requiresPayload" class="grid gap-1">
                <span class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Payload patch</span>
                <textarea
                    v-model="payloadPatch"
                    class="min-h-[112px] resize-none rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2 font-mono text-xs leading-5 text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                    :disabled="loading"
                    aria-label="Recovery payload patch"
                />
            </label>

            <label v-if="selectedOption.highRisk" class="flex items-start gap-2 rounded-md border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] p-3 text-sm leading-6 text-[var(--talos-text)]">
                <input
                    v-model="highRiskCapability"
                    type="checkbox"
                    class="mt-1 h-4 w-4 rounded border-[var(--talos-border)]"
                    :disabled="loading"
                >
                <span>I have the `talos.recovery.high_risk` capability for this run.</span>
            </label>

            <section class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3">
                <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Recovery preview</div>
                <dl class="mt-2 grid gap-2 text-xs leading-5 text-[var(--talos-muted)]">
                    <div class="flex items-center justify-between gap-3">
                        <dt>Target</dt>
                        <dd class="font-mono text-[var(--talos-text)]">Target node {{ selectedNodeId || 'none selected' }}</dd>
                    </div>
                    <div class="flex items-center justify-between gap-3">
                        <dt>Scope</dt>
                        <dd class="font-semibold text-[var(--talos-text)]">{{ previewScope }}</dd>
                    </div>
                    <div class="flex items-center justify-between gap-3">
                        <dt>Status after request</dt>
                        <dd>
                            <Badge :tone="selectedOption.highRisk ? 'warning' : 'neutral'">{{ previewTargetStatus }}</Badge>
                        </dd>
                    </div>
                    <div class="flex items-center justify-between gap-3">
                        <dt>Audit event</dt>
                        <dd class="font-mono text-[var(--talos-text)]">recovery.requested</dd>
                    </div>
                </dl>
            </section>

            <div v-if="disabledReason" class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 py-2 text-xs leading-5 text-[var(--talos-muted)]">
                {{ disabledReason }}
            </div>

            <Button type="button" size="sm" class="w-full" :disabled="!canSubmit" @click="submitRecovery">
                <Loader2 v-if="loading" class="h-4 w-4 animate-spin" />
                <ShieldCheck v-else class="h-4 w-4" />
                Submit recovery
            </Button>
        </div>
    </div>
</template>
